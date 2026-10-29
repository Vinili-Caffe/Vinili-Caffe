const cron = require("node-cron") as typeof import("node-cron");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached") as typeof import("../../../shared/scheduling/cronDetached");
const { isMongoReady } = require("../../Utils/Database/mongoConnect") as typeof import("../../Utils/Database/mongoConnect");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile, SiteDocument } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { ensureStaff } = require("../../Utils/Staff/staffDocUtils") as typeof import("../../Utils/Staff/staffDocUtils");
const { ensureStaffProfileDoc, getStaffDoc, valutazionePositiveAddCore, valutazioneNegativeAddCore } = require("../../Utils/Staff/valutazionePanelActions") as typeof import("../../Utils/Staff/valutazionePanelActions");
const { getOrCreateStaffDoc } = require("../../Utils/Staff/staffDocUtils") as typeof import("../../Utils/Staff/staffDocUtils");
const { resolveStaffRole } = require("./weeklyStaffResocontoService") as typeof import("./weeklyStaffResocontoService");
const { hasActiveAcceptedStaffPause } = require("../../Utils/Pause/pauseHandlersUtils") as typeof import("../../Utils/Pause/pauseHandlersUtils");
const {
  getSerataFilmSaturdayKeyForSession,
  isSerataFilmAbsentExcused,
  loadSerataFilmStaffAttendanceByUserId,
} = require("../../Utils/Staff/serataFilmAttendanceUtils") as typeof import("../../Utils/Staff/serataFilmAttendanceUtils");
const MAIN_GUILD_ID = String(IDs.guilds?.main || "");
const SERATA_FILM_CHANNEL_ID = String(IDs.channels?.serataFilm || "1497535199813042306").trim();
const SERATA_FILM_MIN_MS = 30 * 60 * 1000;
const AUTO_SYNC_CRON = "*/5 * * * *";
const STABLE_NO_INVITE_MS = 75 * 1000;
const SUPPORT_AUTO_REMOVE_STABLE_MS = 5 * 60 * 1000;
const STAFF_BOOST_AUTO_KEY = "staff_boost_server";
const BOOST_NATURAL_EXPIRY_MIN_AGE_MS = 27 * 24 * 60 * 60 * 1000;
const path = require("path") as typeof import("path");
const fs = require("fs") as typeof import("fs");
const SERATA_SESSION_FILE = path.join(__dirname, "../../Data/serataFilmSessions.json");
const autoWeeklyLoops = new WeakSet();
const serataFilmSessions = new Map();
let autoValutazioniCleanupStarted = false;
let autoValutazioniSyncRunning = false;
let autoValutazioniSuspended = false;
const autoValutazioniLocksByKey = new Map();
const supportVanityDebounceByKey = new Map();
const supportAutoRemoveMissByKey = new Map();
let serataPersistTimer = null;

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

function isExemptFromSerataFilmAutoValutazione(member?) {
  const managerId = String(IDs.roles?.Manager || "").trim();
  return Boolean(managerId && member?.roles?.cache?.has(managerId));
}

function isSerataFilmTrackableStaff(member?) {
  return isStaffMember(member) && !isExemptFromSerataFilmAutoValutazione(member);
}

function hasAnyRole(member?, roleIds?) {
  return roleIds.some((roleId?) => roleId && member.roles?.cache?.has(String(roleId)));
}

function getGuildedRoleIds(client?) {
  const sponsorIds = Object.values(IDs.sponsorRoles || {});
  const configuredIds = Object.values(client?.config?.guildedRoleIds || {});
  return [...new Set([IDs.roles?.Guilded, ...sponsorIds, ...configuredIds].map((x?) => String(x || "")).filter(Boolean))];
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
      const { isDiscordStaffChannelPostsEnabled } = require("../../Utils/Web/discordWorkflowUiGate") as typeof import("../../Utils/Web/discordWorkflowUiGate");
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
    return "Mette una nostra GUILD TAGS.";
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

async function runStaffAutoValutazioniSyncLocked(client?, source = "loop") {
  if (autoValutazioniSuspended || !isMongoReady()) return;
  if (autoValutazioniSyncRunning) {
    if (source !== "loop") {
      warnAutoValutazioni(`[STAFF AUTO VALUTAZIONI] ${source} skipped: previous sync still running.`);
    }
    return;
  }
  autoValutazioniSyncRunning = true;
  const startedAt = Date.now();
  let memberCount = 0;
  try {
    memberCount = await syncAllStaffAutoValutazioni(client, { preferCache: source === "loop" });
  } catch (err) {
    warnAutoValutazioni(`[STAFF AUTO VALUTAZIONI] ${source} failed:`, err?.message || err);
  } finally {
    const elapsedMs = Date.now() - startedAt;
    autoValutazioniSyncRunning = false;
    if (elapsedMs > 60_000) {
      warnAutoValutazioni(`[STAFF AUTO VALUTAZIONI] ${source} slow sync: ${elapsedMs}ms (${memberCount} staff).`);
    }
  }
}

function startStaffAutoValutazioniLoop(client?) {
  if (!client || autoWeeklyLoops.has(client)) return;
  if (autoValutazioniSuspended) return;
  autoWeeklyLoops.add(client);
  if (!autoValutazioniCleanupStarted) {
    autoValutazioniCleanupStarted = true;
    cleanupMalformedAutoValutazioni().catch(() => null);
  }
  const scheduleCron = () => {
    if (autoValutazioniSuspended) return;
    if (client.__staffAutoValutazioniCronStarted) return;
    client.__staffAutoValutazioniCronStarted = true;
    cron.schedule(
      AUTO_SYNC_CRON,
      runCronDetached("[STAFF AUTO VALUTAZIONI] cron", () => runStaffAutoValutazioniSyncLocked(client, "loop")),
      { timezone: "Europe/Rome", noOverlap: true },
    );
  };
      const forceStartupSync = ["1", "true", "yes"].includes(
    String(process.env.STAFF_AUTO_VALUTAZIONI_SYNC_ON_STARTUP || process.env.FULL_STARTUP_SYNC || "")
      .trim()
      .toLowerCase(),
  );
  if (forceStartupSync) {
    const firstSync = setTimeout(() => {
      runStaffAutoValutazioniSyncLocked(client, "first_sync").finally(() => scheduleCron());
    }, 15_000);
    firstSync.unref?.();
    return;
  }
  scheduleCron();
}

function suspendStaffAutoValutazioni() {
  autoValutazioniSuspended = true;
}

function isSerataFilmEvent(event?) {
  const name = String(event?.name || "").toUpperCase();
  return name.includes("SERATA FILM") && String(event?.channelId || "") === SERATA_FILM_CHANNEL_ID;
}

function serataSessionKey(event?) {
  return `${String(event?.guildId || event?.guild?.id || "")}:${String(event?.id || "")}`;
}

function serializeSerataSessions() {
  const out = [];
  for (const [key, session] of serataFilmSessions.entries()) {
    out.push({
      key,
      eventId: String(session.eventId || ""),
      guildId: String(session.guildId || ""),
      startedAt: Number(session.startedAt || 0),
      presentSince: [...(session.presentSince || new Map()).entries()],
      attendanceMs: [...(session.attendanceMs || new Map()).entries()],
    });
  }
  return out;
}

function persistSerataFilmSessionsSoon() {
  if (serataPersistTimer) return;
  serataPersistTimer = setTimeout(() => {
    serataPersistTimer = null;
    try {
      const dir = path.dirname(SERATA_SESSION_FILE);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(SERATA_SESSION_FILE, JSON.stringify({ ts: Date.now(), sessions: serializeSerataSessions() }), "utf8");
    } catch (err) {
      global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] serata session persist failed:", err?.message || err);
    }
  }, 400);
  serataPersistTimer.unref?.();
}

function hydrateSerataFilmSessionsFromDisk() {
  try {
    if (!fs.existsSync(SERATA_SESSION_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(SERATA_SESSION_FILE, "utf8"));
    const list = Array.isArray(raw?.sessions) ? raw.sessions : [];
    for (const row of list) {
      const key = String(row?.key || "");
      const eventId = String(row?.eventId || "");
      const guildId = String(row?.guildId || "");
      if (!key || !eventId || !guildId) continue;
      if (serataFilmSessions.has(key)) continue;
      const session = {
        eventId,
        guildId,
        startedAt: Number(row.startedAt || Date.now()),
        presentSince: new Map(),
        attendanceMs: new Map(),
      };
      for (const [uid, ms] of Array.isArray(row.attendanceMs) ? row.attendanceMs : []) {
        if (uid) session.attendanceMs.set(String(uid), Math.max(0, Number(ms) || 0));
      }
      for (const [uid, since] of Array.isArray(row.presentSince) ? row.presentSince : []) {
        if (uid) session.presentSince.set(String(uid), Math.max(0, Number(since) || Date.now()));
      }
      serataFilmSessions.set(key, session);
    }
  } catch (err) {
    global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] serata session hydrate failed:", err?.message || err);
  }
}

function clearPersistedSerataFilmSessions() {
  try {
    if (fs.existsSync(SERATA_SESSION_FILE)) fs.unlinkSync(SERATA_SESSION_FILE);
  } catch (_) {}
}

function closeAttendance(session?, userId?, now = Date.now()) {
  const uid = String(userId || "");
  const started = Number(session.presentSince.get(uid) || 0);
  if (!started) return;
  session.presentSince.delete(uid);
  session.attendanceMs.set(uid, Number(session.attendanceMs.get(uid) || 0) + Math.max(0, now - started));
  persistSerataFilmSessionsSoon();
}

async function startSerataFilmSession(event?) {
  if (!isSerataFilmEvent(event)) return;
  const guild = event.guild || (await event.client?.guilds?.fetch?.(event.guildId).catch(() => null));
  if (!guild) return;
  const key = serataSessionKey(event);
  if (serataFilmSessions.has(key)) return;
  const session = { eventId: String(event.id), guildId: String(guild.id), startedAt: Date.now(), presentSince: new Map(), attendanceMs: new Map() };
  serataFilmSessions.set(key, session);

  const channel = guild.channels.cache.get(SERATA_FILM_CHANNEL_ID) || (await getGuildChannelCached(guild, SERATA_FILM_CHANNEL_ID));
  if (channel?.members?.size) {
    for (const member of channel.members.values()) {
      if (isSerataFilmTrackableStaff(member)) session.presentSince.set(String(member.id), Date.now());
    }
  }
  persistSerataFilmSessionsSoon();
}

function serataFilmEvalDateUtc(session?) {
  const startedAt = Number(session?.startedAt || 0);
  const base = startedAt > 0 ? new Date(startedAt) : new Date();
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
}

async function loadStaffPausesByUserId(guildId?, userIds?) {
  const ids = [...new Set(userIds.map((id?) => String(id || "")).filter(Boolean))];
  if (!ids.length) return new Map();
  const docs = await ActivityUserProfile.find(
    { guildId: String(guildId), userId: { $in: ids } },
    { userId: 1, "staff.pauses": 1 },
  )
    .lean()
    .catch(() => []);
  const map = new Map();
  for (const doc of docs) {
    const uid = String(doc?.userId || "");
    if (!uid) continue;
    map.set(uid, Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : []);
  }
  return map;
}

function attendanceMapFromSnapshot(snapshot?) {
  const map = new Map();
  if (!(snapshot instanceof Map)) return map;
  for (const [uid, ms] of snapshot.entries()) {
    const id = String(uid || "");
    if (!id) continue;
    map.set(id, Math.max(0, Number(ms) || 0));
  }
  return map;
}

async function finishSerataFilmSession(event?, opts: Record<string, any> = {}) {
  if (!isSerataFilmEvent(event) && !(event?.__vcForceSerataFinish && String(event?.channelId || "") === SERATA_FILM_CHANNEL_ID)) {
    return { ok: false, skipped: true, reason: "not_serata_event" };
  }
  const key = serataSessionKey(event);
  let session = serataFilmSessions.get(key);
  const seededAttendance = attendanceMapFromSnapshot(opts.attendanceSnapshot);
  if (!session && event?.__vcForceSerataFinish) {
    // serataFilmFinishFromClose1: synthetic session only when we have attendance evidence
    // (snapshot / hourly) OR explicit recovery allow — never mass-punish on empty guess.
    if (!seededAttendance.size && !opts.allowEmptyAttendance) {
      return { ok: false, skipped: true, reason: "no_session_no_attendance" };
    }
    session = {
      eventId: String(event.id || opts.eventId || `stage-${Date.now()}`),
      guildId: String(event.guildId || event.guild?.id || ""),
      startedAt: Number(opts.startedAt || Date.now()),
      presentSince: new Map(),
      attendanceMs: new Map(seededAttendance),
    };
  }
  if (!session) return { ok: false, skipped: true, reason: "no_session" };
  if (seededAttendance.size) {
    for (const [uid, ms] of seededAttendance.entries()) {
      session.attendanceMs.set(uid, Math.max(Number(session.attendanceMs.get(uid) || 0), ms));
    }
  }
  serataFilmSessions.delete(key);
  persistSerataFilmSessionsSoon();
  const guild = event.guild || (await event.client?.guilds?.fetch?.(event.guildId).catch(() => null));
  if (!guild) return { ok: false, skipped: true, reason: "guild_unavailable" };
  const now = Date.now();
  for (const uid of [...session.presentSince.keys()]) closeAttendance(session, uid, now);
  const evalDateUtc = serataFilmEvalDateUtc(session);
  const saturdayKey = getSerataFilmSaturdayKeyForSession(session);
  // preferCache:false — absentees must be evaluated even if not in member cache
  const staffMembers = await fetchMainGuildStaffMembers(guild.client, { preferCache: false });
  const memberIds = staffMembers.map((member?) => member.id);
  const [pausesByUserId, attendanceByUserId] = await Promise.all([
    loadStaffPausesByUserId(guild.id, memberIds),
    loadSerataFilmStaffAttendanceByUserId(guild.id, memberIds),
  ]);
  let applied = 0;
  let skippedPresent = 0;
  let skippedExcused = 0;
  let skippedPause = 0;
  const appliedUserIds = [];
  for (const member of staffMembers) {
    if (isExemptFromSerataFilmAutoValutazione(member)) continue;
    const uid = String(member.id);
    const pauses = pausesByUserId.get(uid) || [];
    if (hasActiveAcceptedStaffPause(pauses, evalDateUtc)) {
      skippedPause += 1;
      continue;
    }
    const ms = Number(session.attendanceMs.get(uid) || 0);
    const staffAttendance = attendanceByUserId.get(uid);
    if (ms >= SERATA_FILM_MIN_MS) {
      skippedPresent += 1;
      continue;
    }
    if (isSerataFilmAbsentExcused(staffAttendance, saturdayKey)) {
      skippedExcused += 1;
      continue;
    }
    const result = await ensureAutoValutazione(guild, member, `serata_film:${session.eventId}`, "negative", "Non si presenta durante la serata film o rimane per meno di 30 minuti.").catch((err?) => {
      global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] serata film negative failed:", member.id, err?.message || err);
      return null;
    });
    if (result?.ok && !result.skipped) {
      applied += 1;
      appliedUserIds.push(uid);
    }
  }
  if (!serataFilmSessions.size) clearPersistedSerataFilmSessions();
  return {
    ok: true,
    eventId: session.eventId,
    applied,
    skippedPresent,
    skippedExcused,
    skippedPause,
    appliedUserIds,
    staffCount: staffMembers.length,
  };
}

async function finishSerataFilmSessionsForChannel(guild?, channelId?, opts: Record<string, any> = {}) {
  if (!guild || String(channelId || "") !== SERATA_FILM_CHANNEL_ID) {
    return { ok: false, skipped: true, reason: "wrong_channel" };
  }
  hydrateSerataFilmSessionsFromDisk();
  let sessions = [...serataFilmSessions.values()]
    .filter((session?) => String(session.guildId || "") === String(guild.id || ""));
  const seededAttendance = attendanceMapFromSnapshot(opts.attendanceSnapshot);
  if (!sessions.length && (seededAttendance.size || opts.allowEmptyAttendance || opts.eventId)) {
    // serataFilmFinishFromClose1: recover path when stage closed via cron without in-memory session
    const eventId = String(opts.eventId || `stage-${Date.now()}`);
    const session = {
      eventId,
      guildId: String(guild.id || ""),
      startedAt: Number(opts.startedAt || Date.now()),
      presentSince: new Map(),
      attendanceMs: new Map(seededAttendance),
    };
    sessions = [session];
    serataFilmSessions.set(`${session.guildId}:${session.eventId}`, session);
    global.logger?.warn?.(
      "[STAFF AUTO VALUTAZIONI] serata stage closed with no live session — using synthetic session from attendance/opts",
      "eventId=",
      eventId,
      "attendance=",
      seededAttendance.size,
    );
  }
  if (!sessions.length) {
    global.logger?.warn?.(
      "[STAFF AUTO VALUTAZIONI] serata stage closed but no session in memory/disk — skip auto negatives (avoid mass false positives)",
    );
    return { ok: false, skipped: true, reason: "no_session" };
  }
  const results = [];
  for (const session of sessions) {
    serataFilmSessions.set(`${session.guildId}:${session.eventId}`, session);
    results.push(
      await finishSerataFilmSession(
        {
          id: session.eventId,
          guildId: session.guildId,
          guild,
          client: guild.client,
          name: "SERATA FILM",
          channelId: SERATA_FILM_CHANNEL_ID,
          __vcForceSerataFinish: true,
        },
        {
          attendanceSnapshot: opts.attendanceSnapshot,
          startedAt: opts.startedAt || session.startedAt,
          allowEmptyAttendance: Boolean(opts.allowEmptyAttendance),
          eventId: session.eventId,
        },
      ),
    );
  }
  return { ok: true, results };
}

async function handleSerataFilmScheduledEventUpdate(oldEvent?, newEvent?) {
  const oldStatus = Number(oldEvent?.status || 0);
  const newStatus = Number(newEvent?.status || 0);
  // 2 = ACTIVE, 3 = COMPLETED, 4 = CANCELED
  if (newStatus === 2 && oldStatus !== 2) await startSerataFilmSession(newEvent);
  if ((newStatus === 3 || newStatus === 4) && oldStatus !== newStatus) {
    hydrateSerataFilmSessionsFromDisk();
    await finishSerataFilmSession({
      id: newEvent?.id,
      guildId: newEvent?.guildId || newEvent?.guild?.id,
      guild: newEvent?.guild,
      client: newEvent?.client || newEvent?.guild?.client,
      name: newEvent?.name || "SERATA FILM",
      channelId: newEvent?.channelId || SERATA_FILM_CHANNEL_ID,
      __vcForceSerataFinish: true,
    }).catch((err?) => {
      global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] serata finish on event end failed:", err?.message || err);
    });
  }
}

async function handleSerataFilmVoiceState(oldState?, newState?) {
  const guildId = String(newState?.guild?.id || oldState?.guild?.id || "");
  const userId = String(newState?.id || oldState?.id || "");
  if (!guildId || !userId) return;
  if (!serataFilmSessions.size) hydrateSerataFilmSessionsFromDisk();
  if (!serataFilmSessions.size) return;
  const member = newState?.member || oldState?.member || null;
  if (member && isExemptFromSerataFilmAutoValutazione(member)) return;
  const now = Date.now();
  const oldInChannel = String(oldState?.channelId || "") === SERATA_FILM_CHANNEL_ID;
  const newInChannel = String(newState?.channelId || "") === SERATA_FILM_CHANNEL_ID;
  const joined = !oldInChannel && newInChannel;
  const left = oldInChannel && !newInChannel;
  let touched = false;
  for (const session of serataFilmSessions.values()) {
    if (String(session.guildId) !== guildId) continue;
    if (joined && (!member || isSerataFilmTrackableStaff(member))) {
      session.presentSince.set(userId, now);
      touched = true;
    }
    if (left) {
      closeAttendance(session, userId, now);
      touched = true;
    }
  }
  if (touched) persistSerataFilmSessionsSoon();
}

async function restoreActiveSerataFilmSessions(client?) {
  hydrateSerataFilmSessionsFromDisk();
  const guild = client?.guilds?.cache?.get(MAIN_GUILD_ID) || (await client?.guilds?.fetch?.(MAIN_GUILD_ID).catch(() => null));
  if (!guild?.scheduledEvents?.fetch) return;
  const events = await guild.scheduledEvents.fetch().catch(() => null);
  if (!events?.size) return;
  for (const event of events.values()) {
    if (Number(event.status) === 2 && isSerataFilmEvent(event)) await startSerataFilmSession(event);
  }
}

export = {
  ensureAutoValutazione,
  removeAutoValutazione,
  cleanupMalformedAutoValutazioni,
  syncPersistentAutoValutazioniForMember,
  resolveAutoValutazioneCreateKeysFromMemberUpdate,
  syncStaffBoostAutoValutazione,
  handleStaffBoostAutoValutazioneMemberUpdate,
  syncWeeklyAutoValutazioniForMember,
  syncAllStaffAutoValutazioni,
  startStaffAutoValutazioniLoop,
  suspendStaffAutoValutazioni,
  startSerataFilmSession,
  finishSerataFilmSession,
  finishSerataFilmSessionsForChannel,
  handleSerataFilmScheduledEventUpdate,
  handleSerataFilmVoiceState,
  restoreActiveSerataFilmSessions,
  SERATA_FILM_CHANNEL_ID,
  SERATA_FILM_MIN_MS,
};