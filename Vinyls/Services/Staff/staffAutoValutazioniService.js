const cron = require("node-cron");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached");
const IDs = require("../../Utils/Config/ids");
const { ActivityUserProfile, SiteDocument } = require("../../Schemas/Community/communitySchemas");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { ensureStaff } = require("../../Utils/Staff/staffDocUtils");
const { ensureStaffProfileDoc, getStaffDoc, valutazionePositiveAddCore, valutazioneNegativeAddCore } = require("../../Utils/Staff/valutazionePanelActions");
const { getOrCreateStaffDoc } = require("../../Utils/Staff/staffDocUtils");
const { resolveStaffRole } = require("./weeklyStaffResocontoService");
const { hasActiveAcceptedStaffPause } = require("../../Utils/Pause/pauseHandlersUtils");
const MAIN_GUILD_ID = String(IDs.guilds?.main || "");
const SERATA_FILM_CHANNEL_ID = "1497535199813042306";
const SERATA_FILM_MIN_MS = 30 * 60 * 1000;
const AUTO_SYNC_CRON = "*/5 * * * *";
const STABLE_NO_INVITE_MS = 75 * 1000;
const SUPPORT_AUTO_REMOVE_STABLE_MS = 5 * 60 * 1000;
const STAFF_BOOST_AUTO_KEY = "staff_boost_server";
const BOOST_NATURAL_EXPIRY_MIN_AGE_MS = 27 * 24 * 60 * 60 * 1000;
const autoWeeklyLoops = new WeakSet();
const serataFilmSessions = new Map();
let autoValutazioniCleanupStarted = false;
let autoValutazioniSyncRunning = false;
const autoValutazioniLocksByKey = new Map();
const supportVanityDebounceByKey = new Map();
const supportAutoRemoveMissByKey = new Map();

function autoValutazioniLockKey(guildId, userId, key) {
  return `${String(guildId || "")}:${String(userId || "")}:${String(key || "")}`;
}

async function withAutoValutazioneLock(guildId, userId, key, fn) {
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

function autoActor(guild) {
  return { user: guild?.client?.user || { username: "Automazione Staff" }, member: null };
}

function isStaffMember(member) {
  if (!member || member.user?.bot) return false;
  if (member.roles?.cache?.has(String(IDs.roles?.Founder))) return false;
  return Boolean(
    member.roles?.cache?.has(String(IDs.roles?.Staff)) ||
    resolveStaffRole(member) ||
    member.roles?.cache?.has(String(IDs.roles?.HighStaff)),
  );
}

function hasAnyRole(member, roleIds) {
  return roleIds.some((roleId) => roleId && member.roles?.cache?.has(String(roleId)));
}

function getGuildedRoleIds(client) {
  const sponsorIds = Object.values(IDs.sponsorRoles || {});
  const configuredIds = Object.values(client?.config?.guildedRoleIds || {});
  return [...new Set([IDs.roles?.Guilded, ...sponsorIds, ...configuredIds].map((x) => String(x || "")).filter(Boolean))];
}

function supportVanityDebounceKey(guildId, userId) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function resolvePresenceInviteState(presence, fallback = false) {
  const mod = require("../../Events/presenceUpdate");
  return mod.resolveInviteState(presence, fallback);
}

function getDebouncedVanityInStatus(member) {
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

function findPositiveLogEntryForReason(staff, reason) {
  const target = String(reason || "");
  const reasons = Array.isArray(staff?.positiveReasons) ? staff.positiveReasons : [];
  const logs = Array.isArray(staff?.positiveValutazioni) ? staff.positiveValutazioni : [];
  const idx = reasons.lastIndexOf(target);
  if (idx < 0) return null;
  const log = logs[idx];
  if (!log?.messageId || !log?.channelId) return null;
  return log;
}

async function relinkExistingPositiveAutoValutazione(profileDoc, staff, key, reason) {
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

function memberHasActiveServerBoost(member) {
  return Boolean(
    Number(member?.premiumSinceTimestamp || 0) > 0 ||
    member?.roles?.cache?.has?.(String(IDs.roles?.ServerBooster || "")) ||
    member?.roles?.cache?.has?.(String(IDs.roles?.DoubleBooster || "")),
  );
}

async function syncStaffBoostAutoValutazione(member, options = {}) {
  if (!member?.guild || member.user?.bot) return;
  if (MAIN_GUILD_ID && String(member.guild.id) !== MAIN_GUILD_ID) return;
  if (!isStaffMember(member)) return;

  if (memberHasActiveServerBoost(member)) {
    await ensureAutoValutazione(member.guild, member, STAFF_BOOST_AUTO_KEY, "positive", "Supporta il server con un boost.");
    return;
  }

  if (options.removeBecauseTransferred === true) {
    await removeAutoValutazione(member.guild, member.id, STAFF_BOOST_AUTO_KEY);
  }
}

function isLikelyBoostTransferAway(oldMember, newMember) {
  const oldBoostTs = Number(oldMember?.premiumSinceTimestamp || 0);
  const newBoostTs = Number(newMember?.premiumSinceTimestamp || 0);
  if (!(oldBoostTs > 0 && !newBoostTs)) return false;

  const currentCount = Number(newMember?.guild?.premiumSubscriptionCount || 0);
  const previousCount = Number(oldMember?.guild?.premiumSubscriptionCount || 0);
  if (!(currentCount < previousCount)) return false;

  const oldBoostAgeMs = Date.now() - oldBoostTs;
  return Number.isFinite(oldBoostAgeMs) && oldBoostAgeMs >= 0 && oldBoostAgeMs < BOOST_NATURAL_EXPIRY_MIN_AGE_MS;
}

async function handleStaffBoostAutoValutazioneMemberUpdate(oldMember, newMember) {
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
      await syncStaffBoostAutoValutazione(retryMember).catch((err) => {
        global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] boost retry failed:", retryMember.id, err?.message || err);
      });
    }
  }, 12_000);
  retry.unref?.();
}

async function resolveValutazioniChannel(guild) {
  const channelId = IDs.channels?.valutazioniStaff;
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
}

async function deleteAutoMessage(guild, entry) {
  const channelId = String(entry?.channelId || "");
  const messageId = String(entry?.messageId || "");
  if (!guild || !channelId || !messageId) return;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel?.isTextBased?.() || !channel.messages?.fetch) return;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (message) await message.delete().catch(() => null);
}

async function ensureAutoValutazione(guild, member, key, type, reason) {
  if (!guild || !member?.user || !key || !type) return { ok: false };
  if (!isStaffMember(member)) return { ok: false, skipped: "not_staff" };
  return withAutoValutazioneLock(guild.id, member.id, key, async () => {
    let profileDoc = await ensureStaffProfileDoc(await getStaffDoc(guild.id, member.id), guild.id, member.id);
    let staff = ensureStaff(profileDoc);
    if (!Array.isArray(staff.autoValutazioni)) staff.autoValutazioni = [];
    const existing = staff.autoValutazioni.find((entry) => String(entry?.key || "") === String(key));
    if (existing && existing.type === type) {
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
      const reasonStr = String(reason || "");
      const reasons = Array.isArray(staff.positiveReasons) ? staff.positiveReasons : [];
      if (reasons.includes(reasonStr)) {
        const relinked = await relinkExistingPositiveAutoValutazione(profileDoc, staff, key, reason);
        if (relinked) return relinked;
        return { ok: true, skipped: "reason_exists" };
      }
      const relinked = await relinkExistingPositiveAutoValutazione(profileDoc, staff, key, reason);
      if (relinked) return relinked;
    }

    const channel = await resolveValutazioniChannel(guild);
    if (!channel?.isTextBased?.()) return { ok: false, skipped: "no_channel" };

    const result = type === "negative"
      ? await valutazioneNegativeAddCore(guild, profileDoc, member.user, reason, autoActor(guild), channel)
      : await valutazionePositiveAddCore(profileDoc, member.user, reason, autoActor(guild), channel);
    if (!result?.message) return { ok: false, skipped: "log_failed" };

    profileDoc = await getOrCreateStaffDoc(guild.id, member.id);
    staff = ensureStaff(profileDoc);
    staff.autoValutazioni.push({
      key: String(key),
      type,
      reason: String(reason || ""),
      channelId: String(channel.id || ""),
      messageId: result?.message?.id ? String(result.message.id) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    profileDoc.markModified("staff");
    await profileDoc.save();
    return { ok: true };
  });
}

async function removeAutoValutazioneInternal(guild, userId, key) {
  const profileDoc = await getStaffDoc(guild?.id, userId);
  if (!profileDoc?.staff) return { ok: true, skipped: "missing_profile" };
  const staff = ensureStaff(profileDoc);
  const list = Array.isArray(staff.autoValutazioni) ? staff.autoValutazioni : [];
  const index = list.findIndex((entry) => String(entry?.key || "") === String(key || ""));
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

async function removeAutoValutazione(guild, userId, key) {
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
  ).catch((err) => {
    global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] cleanup malformed entries failed:", err?.message || err);
    return null;
  });
}

async function hasFourStarSiteReview(guildId, userId) {
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

async function loadFourStarSiteReviewUserIds(guildId, userIds) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((uid) => String(uid || "").trim()).filter(Boolean))];
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
  return new Set(docs.map((doc) => String(doc?.userId || "").trim()).filter(Boolean));
}

function isMemberOnlineForSupportCheck(member) {
  const status = String(member.presence?.status || "");
  return Boolean(status) && !["offline", "invisible"].includes(status);
}

function getSupportAutoValutazioneReason(member) {
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

function shouldRemoveSupportAutoValutazione(member) {
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


async function syncPersistentAutoValutazioniForMember(member, context = {}) {
  if (!member?.guild || member.user?.bot) return;
  if (MAIN_GUILD_ID && String(member.guild.id) !== MAIN_GUILD_ID) return;
  if (!isStaffMember(member)) return;

  const supportKey = "supporto_vanity_supporter_clantag";
  const supportReason = getSupportAutoValutazioneReason(member);

  if (supportReason) {
    await ensureAutoValutazione(
      member.guild,
      member,
      supportKey,
      "positive",
      supportReason,
    );
  } else if (shouldRemoveSupportAutoValutazione(member)) {
    await removeAutoValutazione(member.guild, member.id, supportKey);
  }


  const followerKey = "ruolo_follower";
  if (member.roles.cache.has(String(IDs.roles?.Follower))) {
    await ensureAutoValutazione(member.guild, member, followerKey, "positive", "Mette il follow su una delle nostre pagine social.");
  } else {
    await removeAutoValutazione(member.guild, member.id, followerKey);
  }

  const reviewKey = "recensione_sito_4_stelle";
  const hasReview = context.reviewUserIds instanceof Set
    ? context.reviewUserIds.has(String(member.id))
    : await hasFourStarSiteReview(member.guild.id, member.id);
  if (hasReview) {
    await ensureAutoValutazione(member.guild, member, reviewKey, "positive", "Mette una recensione sul nostro sito.");
  } else {
    await removeAutoValutazione(member.guild, member.id, reviewKey);
  }

  await syncStaffBoostAutoValutazione(member);
}

async function syncWeeklyAutoValutazioniForMember(member, now = new Date()) {
  void member;
  void now;
}

async function fetchMainGuildStaffMembers(client, options = {}) {
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

async function syncAllStaffAutoValutazioni(client, options = {}) {
  const members = await fetchMainGuildStaffMembers(client, {
    withPresences: false,
    preferCache: options.preferCache === true,
  });
  const reviewUserIds = await loadFourStarSiteReviewUserIds(MAIN_GUILD_ID, members.map((member) => member.id));
  const context = { reviewUserIds };
  for (const member of members) {
    await syncPersistentAutoValutazioniForMember(member, context).catch((err) => {
      global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] persistent sync failed:", member.id, err?.message || err);
    });
    await syncWeeklyAutoValutazioniForMember(member).catch((err) => {
      global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] weekly sync failed:", member.id, err?.message || err);
    });
  }
  return members.length;
}

async function runStaffAutoValutazioniSyncLocked(client, source = "loop") {
  if (autoValutazioniSyncRunning) {
    global.logger?.warn?.(`[STAFF AUTO VALUTAZIONI] ${source} skipped: previous sync still running.`);
    return;
  }
  autoValutazioniSyncRunning = true;
  const startedAt = Date.now();
  let memberCount = 0;
  try {
    memberCount = await syncAllStaffAutoValutazioni(client, { preferCache: source === "loop" });
  } catch (err) {
    global.logger?.warn?.(`[STAFF AUTO VALUTAZIONI] ${source} failed:`, err?.message || err);
  } finally {
    const elapsedMs = Date.now() - startedAt;
    autoValutazioniSyncRunning = false;
    if (elapsedMs > 60_000) {
      global.logger?.warn?.(`[STAFF AUTO VALUTAZIONI] ${source} slow sync: ${elapsedMs}ms (${memberCount} staff).`);
    }
  }
}

function startStaffAutoValutazioniLoop(client) {
  if (!client || autoWeeklyLoops.has(client)) return;
  autoWeeklyLoops.add(client);
  if (!autoValutazioniCleanupStarted) {
    autoValutazioniCleanupStarted = true;
    cleanupMalformedAutoValutazioni().catch(() => null);
  }
  const firstSync = setTimeout(() => {
    runStaffAutoValutazioniSyncLocked(client, "first_sync");
  }, 15_000);
  firstSync.unref?.();
  cron.schedule(
    AUTO_SYNC_CRON,
    runCronDetached("[STAFF AUTO VALUTAZIONI] cron", () => runStaffAutoValutazioniSyncLocked(client, "loop")),
    { timezone: "Europe/Rome", noOverlap: true },
  );
}

function isSerataFilmEvent(event) {
  const name = String(event?.name || "").toUpperCase();
  return name.includes("SERATA FILM") && String(event?.channelId || "") === SERATA_FILM_CHANNEL_ID;
}

function serataSessionKey(event) {
  return `${String(event?.guildId || event?.guild?.id || "")}:${String(event?.id || "")}`;
}

function closeAttendance(session, userId, now = Date.now()) {
  const uid = String(userId || "");
  const started = Number(session.presentSince.get(uid) || 0);
  if (!started) return;
  session.presentSince.delete(uid);
  session.attendanceMs.set(uid, Number(session.attendanceMs.get(uid) || 0) + Math.max(0, now - started));
}

async function startSerataFilmSession(event) {
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
      if (isStaffMember(member)) session.presentSince.set(String(member.id), Date.now());
    }
  }
}

function serataFilmEvalDateUtc(session) {
  const startedAt = Number(session?.startedAt || 0);
  const base = startedAt > 0 ? new Date(startedAt) : new Date();
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
}

async function loadStaffPausesByUserId(guildId, userIds) {
  const ids = [...new Set(userIds.map((id) => String(id || "")).filter(Boolean))];
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

async function finishSerataFilmSession(event) {
  if (!isSerataFilmEvent(event)) return;
  const key = serataSessionKey(event);
  const session = serataFilmSessions.get(key);
  if (!session) return;
  serataFilmSessions.delete(key);
  const guild = event.guild || (await event.client?.guilds?.fetch?.(event.guildId).catch(() => null));
  if (!guild) return;
  const now = Date.now();
  for (const uid of [...session.presentSince.keys()]) closeAttendance(session, uid, now);
  const evalDateUtc = serataFilmEvalDateUtc(session);
  const staffMembers = await fetchMainGuildStaffMembers(guild.client, { preferCache: true });
  const pausesByUserId = await loadStaffPausesByUserId(guild.id, staffMembers.map((member) => member.id));
  for (const member of staffMembers) {
    const pauses = pausesByUserId.get(String(member.id)) || [];
    if (hasActiveAcceptedStaffPause(pauses, evalDateUtc)) continue;
    const ms = Number(session.attendanceMs.get(String(member.id)) || 0);
    if (ms >= SERATA_FILM_MIN_MS) continue;
    await ensureAutoValutazione(guild, member, `serata_film:${session.eventId}`, "negative", "Non si presenta durante la serata film o rimane per meno di 30 minuti.").catch((err) => {
      global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] serata film negative failed:", member.id, err?.message || err);
    });
  }
}

async function finishSerataFilmSessionsForChannel(guild, channelId) {
  if (!guild || String(channelId || "") !== SERATA_FILM_CHANNEL_ID) return;
  const sessions = [...serataFilmSessions.values()]
    .filter((session) => String(session.guildId || "") === String(guild.id || ""));
  for (const session of sessions) {
    await finishSerataFilmSession({
      id: session.eventId,
      guildId: session.guildId,
      guild,
      client: guild.client,
      name: "SERATA FILM",
      channelId: SERATA_FILM_CHANNEL_ID,
    });
  }
}

async function handleSerataFilmScheduledEventUpdate(oldEvent, newEvent) {
  const oldStatus = Number(oldEvent?.status || 0);
  const newStatus = Number(newEvent?.status || 0);
  if (newStatus === 2 && oldStatus !== 2) await startSerataFilmSession(newEvent);
}

async function handleSerataFilmVoiceState(oldState, newState) {
  const guildId = String(newState?.guild?.id || oldState?.guild?.id || "");
  const userId = String(newState?.id || oldState?.id || "");
  if (!guildId || !userId || !serataFilmSessions.size) return;
  const now = Date.now();
  const oldInChannel = String(oldState?.channelId || "") === SERATA_FILM_CHANNEL_ID;
  const newInChannel = String(newState?.channelId || "") === SERATA_FILM_CHANNEL_ID;
  const joined = !oldInChannel && newInChannel;
  const left = oldInChannel && !newInChannel;
  for (const session of serataFilmSessions.values()) {
    if (String(session.guildId) !== guildId) continue;
    if (joined) session.presentSince.set(userId, now);
    if (left) closeAttendance(session, userId, now);
  }
}

async function restoreActiveSerataFilmSessions(client) {
  const guild = client?.guilds?.cache?.get(MAIN_GUILD_ID) || (await client?.guilds?.fetch?.(MAIN_GUILD_ID).catch(() => null));
  if (!guild?.scheduledEvents?.fetch) return;
  const events = await guild.scheduledEvents.fetch().catch(() => null);
  if (!events?.size) return;
  for (const event of events.values()) {
    if (Number(event.status) === 2 && isSerataFilmEvent(event)) await startSerataFilmSession(event);
  }
}

module.exports = {
  ensureAutoValutazione,
  removeAutoValutazione,
  cleanupMalformedAutoValutazioni,
  syncPersistentAutoValutazioniForMember,
  syncStaffBoostAutoValutazione,
  handleStaffBoostAutoValutazioneMemberUpdate,
  syncWeeklyAutoValutazioniForMember,
  syncAllStaffAutoValutazioni,
  startStaffAutoValutazioniLoop,
  startSerataFilmSession,
  finishSerataFilmSession,
  finishSerataFilmSessionsForChannel,
  handleSerataFilmScheduledEventUpdate,
  handleSerataFilmVoiceState,
  restoreActiveSerataFilmSessions,
};