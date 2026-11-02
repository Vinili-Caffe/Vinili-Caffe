const { runCronDetached } = require("../../../shared/scheduling/cronDetached") as typeof import("../../../shared/scheduling/cronDetached");
const { isMongoReady } = require("../../Utils/Database/mongoConnect") as typeof import("../../Utils/Database/mongoConnect");
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile, SiteDocument } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { ensureStaff } = require("../../Utils/Staff/staffDocUtils") as typeof import("../../Utils/Staff/staffDocUtils");
const { ensureStaffProfileDoc, getStaffDoc, valutazionePositiveAddCore, valutazioneNegativeAddCore } = require("../../Utils/Staff/valutazionePanelActions") as typeof import("../../Utils/Staff/valutazionePanelActions");
const { getOrCreateStaffDoc } = require("../../Utils/Staff/staffDocUtils") as typeof import("../../Utils/Staff/staffDocUtils");
const { resolveStaffRole } = require("./weeklyStaffResocontoService") as typeof import("./weeklyStaffResocontoService");
const MAIN_GUILD_ID = String(IDs.guilds?.main || "");
const STABLE_NO_INVITE_MS = 75 * 1000;
const SUPPORT_AUTO_REMOVE_STABLE_MS = 5 * 60 * 1000;
const STAFF_BOOST_AUTO_KEY = "staff_boost_server";
const BOOST_NATURAL_EXPIRY_MIN_AGE_MS = 27 * 24 * 60 * 60 * 1000;
const autoWeeklyLoops = new WeakSet();
let autoValutazioniCleanupStarted = false;
let autoValutazioniSyncRunning = false;
let autoValutazioniSuspended = false;
const autoValutazioniLocksByKey = new Map();
const supportVanityDebounceByKey = new Map();
const supportAutoRemoveMissByKey = new Map();

function isMongoUnavailableError(err?) {
  if (!err) return false;
  if (err.name === "MongoNotConnectedError") return true;
  return /Client must be connected before running operations/i.test(String(err?.message || err || ""));
}

function warnAutoValutazioni(label?, ...args) {
  if (autoValutazioniSuspended || !isMongoReady()) return;
  if (args.some((a?) => isMongoUnavailableError(a))) return;
  global.logger?.warn?.(label, ...args);
}
function autoValutazioniLockKey(guildId?, userId?, key?) {
  return `${String(guildId || "")}:${String(userId || "")}:${String(key || "")}`;
}

async function withAutoValutazioneLock(guildId?, userId?, key?, fn?) {
  const lockKey = autoValutazioniLockKey(guildId, userId, key);
  const prev = autoValutazioniLocksByKey.get(lockKey) || Promise.resolve();
  const mine = prev.catch(() => {}).then(() => fn());
  autoValutazioniLocksByKey.set(lockKey, mine);
  try {
    return await mine;
  } finally {
    if (autoValutazioniLocksByKey.get(lockKey) === mine) {
      autoValutazioniLocksByKey.delete(lockKey);
    }
  }
}

function autoActor(guild?) {
  return { user: guild?.client?.user || { username: "Automazione Staff" }, member: null };
}

function isStaffMember(member?) {
  if (!member || member.user?.bot) return false;
  if (member.roles?.cache?.has(String(IDs.roles?.Founder))) return false;
  return Boolean(
    member.roles?.cache?.has(String(IDs.roles?.Staff)) ||
    resolveStaffRole(member) ||
    member.roles?.cache?.has(String(IDs.roles?.HighStaff)),
  );
}

function hasAnyRole(member?, roleIds?) {
  return roleIds.some((roleId?) => roleId && member.roles?.cache?.has(String(roleId)));
}

function getGuildedRoleIds(client?) {
  return [IDs.roles?.Guilded].map((x?) => String(x || "")).filter(Boolean);
}

function supportVanityDebounceKey(guildId?, userId?) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function resolvePresenceInviteState(presence?, fallback = false) {
  const mod = require("../../Events/presenceUpdate") as typeof import("../../Events/presenceUpdate");
  return mod.resolveInviteState(presence, fallback);
}

function getDebouncedVanityInStatus(member?) {
  if (!member?.guild?.id || !member.id) return false;
  const presence = member.presence;
  const status = String(presence?.status || "");
  const key = supportVanityDebounceKey(member.guild.id, member.id);
  const prev = supportVanityDebounceByKey.get(key) || { hadVanity: false, missSince: null };

  if (!presence || ["offline", "invisible"].includes(status)) {
    return prev.hadVanity;
  }

  const rawHas = resolvePresenceInviteState(presence, prev.hadVanity);
  if (rawHas) {
    supportVanityDebounceByKey.set(key, { hadVanity: true, missSince: null });
    return true;
  }

  if (prev.hadVanity) {
    const missSince = prev.missSince != null ? prev.missSince : Date.now();
    if (Date.now() - missSince < STABLE_NO_INVITE_MS) {
      supportVanityDebounceByKey.set(key, { hadVanity: true, missSince });
      return true;
    }
    supportVanityDebounceByKey.set(key, { hadVanity: false, missSince: null });
    return false;
  }

  supportVanityDebounceByKey.set(key, { hadVanity: false, missSince: null });
  return false;
}

function findPositiveLogEntryForReason(staff?, reason?) {
  const target = String(reason || "");
  const reasons = Array.isArray(staff?.positiveReasons) ? staff.positiveReasons : [];
  const logs = Array.isArray(staff?.positiveValutazioni) ? staff.positiveValutazioni : [];
  const idx = reasons.lastIndexOf(target);
  if (idx < 0) return null;
  const log = logs[idx];
  if (!log?.messageId || !log?.channelId) return null;
  return log;
}

function staffAlreadyHasMatchingPositiveReason(staff?, reason?) {
  const reasonStr = String(reason || "").trim();
  if (!reasonStr) return false;
  const reasons = Array.isArray(staff?.positiveReasons) ? staff.positiveReasons : [];
  if (reasons.some((row?) => String(row || "").trim() === reasonStr)) return true;

  const logs = Array.isArray(staff?.positiveValutazioni) ? staff.positiveValutazioni : [];
  if (logs.some((row?) => String(row?.reason || "").trim() === reasonStr)) return true;

  const lower = reasonStr.toLowerCase();
  const isSiteReviewReason = lower.includes("recensione") && lower.includes("sito");
  if (!isSiteReviewReason) return false;
  const matchSiteReview = (text?) => {
    const s = String(text || "").toLowerCase();
    return s.includes("recensione") && s.includes("sito");
  };
  if (reasons.some(matchSiteReview)) return true;
  return logs.some((row?) => matchSiteReview(row?.reason));
}

async function relinkExistingPositiveAutoValutazione(profileDoc?, staff?, key?, reason?) {
  const log = findPositiveLogEntryForReason(staff, reason);
  if (!log) return null;
  if (!Array.isArray(staff.autoValutazioni)) staff.autoValutazioni = [];
  staff.autoValutazioni.push({
    key: String(key),
    type: "positive",
    reason: String(reason || ""),
    channelId: String(log.channelId || ""),
    messageId: String(log.messageId || ""),
    createdAt: log.createdAt || new Date(),
    updatedAt: new Date(),
  });
  profileDoc.markModified("staff");
  await profileDoc.save();
  return { ok: true, skipped: "relinked" };
}

function memberHasActiveServerBoost(member?) {
  return Boolean(
    Number(member?.premiumSinceTimestamp || 0) > 0 ||
    member?.roles?.cache?.has?.(String(IDs.roles?.ServerBooster || "")) ||
    member?.roles?.cache?.has?.(String(IDs.roles?.DoubleBooster || "")),
  );
}

async function syncStaffBoostAutoValutazione(member?, options: Record<string, any> = {}) {
  if (!member?.guild || member.user?.bot) return;
  if (MAIN_GUILD_ID && String(member.guild.id) !== MAIN_GUILD_ID) return;
  if (!isStaffMember(member)) return;
  const allowCreate = options.allowCreate !== false;

  if (memberHasActiveServerBoost(member)) {
    await ensureAutoValutazione(
      member.guild,
      member,
      STAFF_BOOST_AUTO_KEY,
      "positive",
      "Supporta il server con un boost.",
      { allowCreate },
    );
    return;
  }

  if (options.removeBecauseTransferred === true) {
    await removeAutoValutazione(member.guild, member.id, STAFF_BOOST_AUTO_KEY);
  }
}

function isLikelyBoostTransferAway(oldMember?, newMember?) {
  const oldBoostTs = Number(oldMember?.premiumSinceTimestamp || 0);
  const newBoostTs = Number(newMember?.premiumSinceTimestamp || 0);
  if (!(oldBoostTs > 0 && !newBoostTs)) return false;

  const currentCount = Number(newMember?.guild?.premiumSubscriptionCount || 0);
  const previousCount = Number(oldMember?.guild?.premiumSubscriptionCount || 0);
  if (!(currentCount < previousCount)) return false;

  const oldBoostAgeMs = Date.now() - oldBoostTs;
  return Number.isFinite(oldBoostAgeMs) && oldBoostAgeMs >= 0 && oldBoostAgeMs < BOOST_NATURAL_EXPIRY_MIN_AGE_MS;
}

async function handleStaffBoostAutoValutazioneMemberUpdate(oldMember?, newMember?) {
  if (!newMember?.guild || newMember.user?.bot) return;
  if (MAIN_GUILD_ID && String(newMember.guild.id) !== MAIN_GUILD_ID) return;
  if (!isStaffMember(newMember) && !isStaffMember(oldMember)) return;

  const freshMember = await newMember.guild.members
    .fetch({ user: newMember.id, force: true })
    .catch(() => newMember);

  await syncStaffBoostAutoValutazione(freshMember, {
    removeBecauseTransferred: isLikelyBoostTransferAway(oldMember, newMember),
  });

  const oldBoostTs = Number(oldMember?.premiumSinceTimestamp || 0);
  const newBoostTs = Number(newMember?.premiumSinceTimestamp || 0);
  const boosterRoleId = String(IDs.roles?.ServerBooster || "");
  const boostProbablyStarted = Boolean(
    (!oldBoostTs && newBoostTs) ||
    (boosterRoleId && !oldMember?.roles?.cache?.has?.(boosterRoleId) && newMember?.roles?.cache?.has?.(boosterRoleId)),
  );
  if (!boostProbablyStarted || memberHasActiveServerBoost(freshMember)) return;

  const retry = setTimeout(async () => {
    const retryMember = await newMember.guild.members
      .fetch({ user: newMember.id, force: true })
      .catch(() => null);
    if (retryMember) {
      await syncStaffBoostAutoValutazione(retryMember).catch((err?) => {
        global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] boost retry failed:", retryMember.id, err?.message || err);
      });
    }
  }, 12_000);
  retry.unref?.();
}

async function resolveValutazioniChannel(guild?) {
  const channelId = IDs.channels?.valutazioniStaff;
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
}

async function deleteAutoMessage(guild?, entry?) {
  const channelId = String(entry?.channelId || "");
  const messageId = String(entry?.messageId || "");
  if (!guild || !channelId || !messageId) return;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel?.isTextBased?.() || !channel.messages?.fetch) return;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (message) await message.delete().catch(() => null);
}

async function ensureAutoValutazione(guild?, member?, key?, type?, reason?, options: Record<string, any> = {}) {
  if (!guild || !member?.user || !key || !type) return { ok: false };
  if (!isStaffMember(member)) return { ok: false, skipped: "not_staff" };
  const allowCreate = options.allowCreate !== false;
  return withAutoValutazioneLock(guild.id, member.id, key, async () => {
    let profileDoc = await ensureStaffProfileDoc(await getStaffDoc(guild.id, member.id), guild.id, member.id);
    let staff = ensureStaff(profileDoc);
    if (!Array.isArray(staff.autoValutazioni)) staff.autoValutazioni = [];
    const existing = staff.autoValutazioni.find((entry?) => String(entry?.key || "") === String(key));
    if (existing && existing.type === type) {
      if (existing.spentByTrade) {
        return { ok: true, skipped: "spent_by_trade" };
      }
      if (String(existing.reason || "") !== String(reason || "")) {
        existing.reason = String(reason || "");
        existing.updatedAt = new Date();
        profileDoc.markModified("staff");
        await profileDoc.save();
      }
      return { ok: true, skipped: "exists" };
    }
    if (existing) {
      await removeAutoValutazioneInternal(guild, member.id, key);
      profileDoc = await ensureStaffProfileDoc(await getStaffDoc(guild.id, member.id), guild.id, member.id);
      staff = ensureStaff(profileDoc);
      if (!Array.isArray(staff.autoValutazioni)) staff.autoValutazioni = [];
    }

    if (!existing && type === "positive") {
      if (staffAlreadyHasMatchingPositiveReason(staff, reason)) {
        const relinked = await relinkExistingPositiveAutoValutazione(profileDoc, staff, key, reason);
        if (relinked) return relinked;
        return { ok: true, skipped: "reason_exists" };
      }
      const relinked = await relinkExistingPositiveAutoValutazione(profileDoc, staff, key, reason);
      if (relinked) return relinked;
    }

    if (!allowCreate) {
      return { ok: true, skipped: "create_disabled" };
    }

    // Site-first: Mongo + notifica sito. Discord channel solo se DISCORD_STAFF_CHANNEL_POSTS=1.
    let channel = null;
    try {
      const { isDiscordStaffChannelPostsEnabled } = require("../../site/http/discordWorkflowUiGate") as typeof import("../../site/http/discordWorkflowUiGate");
      if (isDiscordStaffChannelPostsEnabled()) {
        channel = await resolveValutazioniChannel(guild);
      }
    } catch (_) {
      channel = null;
    }

    const result = type === "negative"
      ? await valutazioneNegativeAddCore(guild, profileDoc, member.user, reason, autoActor(guild), channel)
      : await valutazionePositiveAddCore(profileDoc, member.user, reason, autoActor(guild), channel);
    if (result?.ok !== true) return { ok: false, skipped: "write_failed" };

    profileDoc = await getOrCreateStaffDoc(guild.id, member.id);
    staff = ensureStaff(profileDoc);
    staff.autoValutazioni.push({
      key: String(key),
      type,
      reason: String(reason || ""),
      channelId: channel?.id ? String(channel.id) : "",
      messageId: result?.message?.id ? String(result.message.id) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    profileDoc.markModified("staff");
    await profileDoc.save();
    return { ok: true, siteOnly: !result?.message };
  });
}

async function removeAutoValutazioneInternal(guild?, userId?, key?) {
  const profileDoc = await getStaffDoc(guild?.id, userId);
  if (!profileDoc?.staff) return { ok: true, skipped: "missing_profile" };
  const staff = ensureStaff(profileDoc);
  const list = Array.isArray(staff.autoValutazioni) ? staff.autoValutazioni : [];
  const index = list.findIndex((entry?) => String(entry?.key || "") === String(key || ""));
  if (index < 0) return { ok: true, skipped: "missing_entry" };

  const [entry] = list.splice(index, 1);
  const reasons = entry.type === "negative" ? staff.negativeReasons : staff.positiveReasons;
  if (Array.isArray(reasons)) {
    const reasonIndex = reasons.lastIndexOf(String(entry.reason || ""));
    if (reasonIndex >= 0) reasons.splice(reasonIndex, 1);
  }
  if (entry.type === "negative") staff.negativeCount = Math.max(0, Number(staff.negativeCount || 0) - 1);
  else staff.positiveCount = Math.max(0, Number(staff.positiveCount || 0) - 1);
  staff.valutazioniCount = Math.max(0, Number(staff.valutazioniCount || 0) - 1);

  profileDoc.markModified("staff");
  await profileDoc.save();
  await deleteAutoMessage(guild, entry);
  return { ok: true };
}

async function removeAutoValutazione(guild?, userId?, key?) {
  if (!guild?.id || !userId || !key) return { ok: false };
  return withAutoValutazioneLock(guild.id, userId, key, () => removeAutoValutazioneInternal(guild, userId, key));
}

async function cleanupMalformedAutoValutazioni() {
  return ActivityUserProfile.updateMany(
    { "staff.autoValutazioni": { $exists: true } },
    [
      {
        $set: {
          "staff.autoValutazioni": {
            $filter: {
              input: { $ifNull: ["$staff.autoValutazioni", []] },
              as: "entry",
              cond: {
                $and: [
                  { $ne: [{ $ifNull: ["$$entry.key", ""] }, ""] },
                  { $in: ["$$entry.type", ["positive", "negative"]] },
                ],
              },
            },
          },
        },
      },
    ],
  ).catch((err?) => {
    global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] cleanup malformed entries failed:", err?.message || err);
    return null;
  });
}

async function hasFourStarSiteReview(guildId?, userId?) {
  const doc = await SiteDocument.findOne({
    docType: "review",
    guildId: String(guildId),
    reviewKind: "server",
    createdBy: "site",
    provider: { $in: ["", null] },
    userId: String(userId),
    rating: { $gte: 4 },
  }).select("_id").lean().catch(() => null);
  return Boolean(doc);
}

async function loadFourStarSiteReviewUserIds(guildId?, userIds?) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((uid?) => String(uid || "").trim()).filter(Boolean))];
  if (!ids.length) return new Set();
  const docs = await SiteDocument.find({
    docType: "review",
    guildId: String(guildId),
    reviewKind: "server",
    createdBy: "site",
    provider: { $in: ["", null] },
    userId: { $in: ids },
    rating: { $gte: 4 },
  })
    .select("userId")
    .lean()
    .catch(() => []);
  return new Set(docs.map((doc?) => String(doc?.userId || "").trim()).filter(Boolean));
}

function isMemberOnlineForSupportCheck(member?) {
  const status = String(member.presence?.status || "");
  return Boolean(status) && !["offline", "invisible"].includes(status);
}

function getSupportAutoValutazioneReason(member?) {
  if (getDebouncedVanityInStatus(member)) {
    return "Mette il link vanity nello status.";
  }

  if (member.roles?.cache?.has(String(IDs.roles?.SocialSupporter))) {
    return "Mette il link vanity nella bio.";
  }

  if (hasAnyRole(member, getGuildedRoleIds(member.client))) {
    return "Mette la nostra GUILD TAG.";
  }

  return null;
}

function shouldRemoveSupportAutoValutazione(member?) {
  if (!member?.guild?.id || !member.id) return false;
  const key = supportVanityDebounceKey(member.guild.id, member.id);
  const reason = getSupportAutoValutazioneReason(member);
  if (reason) {
    supportAutoRemoveMissByKey.delete(key);
    return false;
  }
  if (!isMemberOnlineForSupportCheck(member)) return false;
  const prev = supportAutoRemoveMissByKey.get(key) || { since: null };
  if (prev.since == null) {
    supportAutoRemoveMissByKey.set(key, { since: Date.now() });
    return false;
  }
  if (Date.now() - prev.since < SUPPORT_AUTO_REMOVE_STABLE_MS) return false;
  supportAutoRemoveMissByKey.delete(key);
  return true;
}

async function syncPersistentAutoValutazioniForMember(member?, context: Record<string, any> = {}) {
  if (!member?.guild || member.user?.bot) return;
  if (MAIN_GUILD_ID && String(member.guild.id) !== MAIN_GUILD_ID) return;

    let staffMember = member;
  try {
    const fetched = await member.guild.members.fetch(member.id);
    if (fetched) staffMember = fetched;
  } catch {
      }
  if (!isStaffMember(staffMember)) return;

      const allowCreate = context.allowCreate === true;
  const allowRemove = context.allowRemove === true;
  const createKeys =
    context.createKeys instanceof Set
      ? context.createKeys
      : Array.isArray(context.createKeys)
        ? new Set(context.createKeys.map(String))
        : null;

  const canCreateKey = (key?) => {
    if (!allowCreate) return false;
    if (!createKeys) return true;
    return createKeys.has(String(key));
  };

  const supportKey = "supporto_vanity_supporter_clantag";
  const supportReason = getSupportAutoValutazioneReason(staffMember);

  if (supportReason) {
    await ensureAutoValutazione(
      staffMember.guild,
      staffMember,
      supportKey,
      "positive",
      supportReason,
      { allowCreate: canCreateKey(supportKey) },
    );
  } else if (allowRemove && shouldRemoveSupportAutoValutazione(staffMember)) {
    await removeAutoValutazione(staffMember.guild, staffMember.id, supportKey);
  }

  const followerKey = "ruolo_follower";
  if (staffMember.roles.cache.has(String(IDs.roles?.Follower))) {
    await ensureAutoValutazione(
      staffMember.guild,
      staffMember,
      followerKey,
      "positive",
      "Mette il follow su una delle nostre pagine social.",
      { allowCreate: canCreateKey(followerKey) },
    );
  } else if (allowRemove) {
    await removeAutoValutazione(staffMember.guild, staffMember.id, followerKey);
  }

  const reviewKey = "recensione_sito_4_stelle";
  const hasReview = context.reviewUserIds instanceof Set
    ? context.reviewUserIds.has(String(staffMember.id))
    : await hasFourStarSiteReview(staffMember.guild.id, staffMember.id);
  if (hasReview) {
    await ensureAutoValutazione(
      staffMember.guild,
      staffMember,
      reviewKey,
      "positive",
      "Mette una recensione sul nostro sito.",
      { allowCreate: canCreateKey(reviewKey) },
    );
  } else if (allowRemove) {
    await removeAutoValutazione(staffMember.guild, staffMember.id, reviewKey);
  }

  await syncStaffBoostAutoValutazione(staffMember, {
    allowCreate: canCreateKey(STAFF_BOOST_AUTO_KEY),
  });
}

function resolveAutoValutazioneCreateKeysFromMemberUpdate(oldMember?, newMember?) {
  const keys = new Set();
  if (!oldMember || !newMember) return keys;
  const followerId = String(IDs.roles?.Follower || "");
  if (followerId && !oldMember.roles?.cache?.has(followerId) && newMember.roles?.cache?.has(followerId)) {
    keys.add("ruolo_follower");
  }
  const socialId = String(IDs.roles?.SocialSupporter || "");
  if (socialId && !oldMember.roles?.cache?.has(socialId) && newMember.roles?.cache?.has(socialId)) {
    keys.add("supporto_vanity_supporter_clantag");
  }
  const guildedIds = getGuildedRoleIds(newMember.client);
  const gainedGuilded = guildedIds.some(
    (roleId?) => roleId && !oldMember.roles?.cache?.has(roleId) && newMember.roles?.cache?.has(roleId),
  );
  if (gainedGuilded) keys.add("supporto_vanity_supporter_clantag");

  const oldBoost = memberHasActiveServerBoost(oldMember);
  const newBoost = memberHasActiveServerBoost(newMember);
  if (!oldBoost && newBoost) keys.add(STAFF_BOOST_AUTO_KEY);
  return keys;
}

async function syncWeeklyAutoValutazioniForMember(member?, now = new Date()) {
  void member;
  void now;
}

async function fetchMainGuildStaffMembers(client?, options: Record<string, any> = {}) {
  const withPresences = options.withPresences === true;
  const preferCache = options.preferCache === true;
  const guild = client?.guilds?.cache?.get(MAIN_GUILD_ID) || (await client?.guilds?.fetch?.(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return [];
  if (preferCache) {
    return [...guild.members.cache.values()].filter(isStaffMember);
  }
  const members = withPresences
    ? await guild.members.fetch({ withPresences: true, force: false }).catch(() => guild.members.cache)
    : await guild.members.fetch({ force: false }).catch(() => guild.members.cache);
  return [...members.values()].filter(isStaffMember);
}

async function syncAllStaffAutoValutazioni(client?, options: Record<string, any> = {}) {
  if (autoValutazioniSuspended || !isMongoReady()) return 0;
  const members = await fetchMainGuildStaffMembers(client, {
    withPresences: false,
    preferCache: options.preferCache === true,
  });
  if (autoValutazioniSuspended || !isMongoReady()) return 0;
  const reviewUserIds = await loadFourStarSiteReviewUserIds(MAIN_GUILD_ID, members.map((member?) => member.id));
    const context = { reviewUserIds, allowCreate: false, allowRemove: false };
  for (const member of members) {
    if (autoValutazioniSuspended || !isMongoReady()) break;
    await syncPersistentAutoValutazioniForMember(member, context).catch((err?) => {
      warnAutoValutazioni("[STAFF AUTO VALUTAZIONI] persistent sync failed:", member.id, err?.message || err);
    });
    await syncWeeklyAutoValutazioniForMember(member).catch((err?) => {
      warnAutoValutazioni("[STAFF AUTO VALUTAZIONI] weekly sync failed:", member.id, err?.message || err);
    });
  }
  return members.length;
}

function suspendStaffAutoValutazioni() {
  autoValutazioniSuspended = true;
}

const staffSerataFilmAutoVal = require("./staffSerataFilmAutoVal") as typeof import("./staffSerataFilmAutoVal");

export = {
  ensureAutoValutazione,
  removeAutoValutazione,
  cleanupMalformedAutoValutazioni,
  syncPersistentAutoValutazioniForMember,
  resolveAutoValutazioneCreateKeysFromMemberUpdate,
  handleStaffBoostAutoValutazioneMemberUpdate,
  syncAllStaffAutoValutazioni,
  suspendStaffAutoValutazioni,
  startSerataFilmSession: staffSerataFilmAutoVal.startSerataFilmSession,
  finishSerataFilmSessionsForChannel: staffSerataFilmAutoVal.finishSerataFilmSessionsForChannel,
  handleSerataFilmScheduledEventUpdate: staffSerataFilmAutoVal.handleSerataFilmScheduledEventUpdate,
  handleSerataFilmVoiceState: staffSerataFilmAutoVal.handleSerataFilmVoiceState,
  restoreActiveSerataFilmSessions: staffSerataFilmAutoVal.restoreActiveSerataFilmSessions,
};