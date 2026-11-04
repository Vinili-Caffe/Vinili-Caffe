const mongoose = require("mongoose") as typeof import("mongoose");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { ensureMongoReady, isMongoTransientError } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { getGuildChannelCached, getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { CHANNEL_ID } = require("./presenceSupporterInviteState") as typeof import("./presenceSupporterInviteState");

const statusCache = new Map();
const pendingChecks = new Map();
const removalChecks = new Map();
const REMOVE_CONFIRM_MS = 5 * 60 * 1000;
const MAX_PRESENCE_CACHE_ENTRIES = Math.max(100, Number(process.env.VC_PRESENCE_CACHE_MAX || 2000) || 2000);
const STATUS_CACHE_TTL_MS = Math.max(60_000, Number(process.env.VC_PRESENCE_STATUS_CACHE_TTL_MS || 6 * 60 * 60 * 1000) || 6 * 60 * 60 * 1000);
const PRESENCE_CACHE_SWEEP_MS = Math.max(60_000, Number(process.env.VC_PRESENCE_CACHE_SWEEP_MS || 5 * 60 * 1000) || 5 * 60 * 1000);

function evictOldestMapEntry(map, onEvict?) {
  const oldestKey = map.keys().next().value;
  if (oldestKey == null) return;
  const value = map.get(oldestKey);
  if (typeof onEvict === "function") onEvict(oldestKey, value);
  map.delete(oldestKey);
}

function trimPresenceMap(map, onEvict?) {
  while (map.size > MAX_PRESENCE_CACHE_ENTRIES) {
    evictOldestMapEntry(map, onEvict);
  }
}

function sweepPresenceCaches(now = Date.now()) {
  for (const [key, state] of statusCache.entries()) {
    const cachedAt = Number(state?._cachedAt || 0);
    if (cachedAt > 0 && now - cachedAt > STATUS_CACHE_TTL_MS) {
      statusCache.delete(key);
    }
  }
  trimPresenceMap(statusCache);
  trimPresenceMap(pendingChecks, (_key, pending) => {
    if (pending?.timeout) clearTimeout(pending.timeout);
  });
  trimPresenceMap(removalChecks, (_key, removal) => {
    if (removal?.timeout) clearTimeout(removal.timeout);
  });
}

const presenceCacheSweepTimer = setInterval(() => {
  try {
    sweepPresenceCaches();
  } catch (err) {
    global.logger?.warn?.("[SUPPORTER STATUS] cache sweep failed:", err?.message || err);
  }
}, PRESENCE_CACHE_SWEEP_MS);
presenceCacheSweepTimer.unref?.();

function makeStateKey(guildId?, userId?) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function isDbReady() {
  return mongoose.connection?.readyState === 1;
}

function withDefaultState(prev: Record<string, any> = {}) {
  return {
    hasLink: Boolean(prev.hasLink),
    lastAnnounced: prev.lastAnnounced || 0,
    lastMessageId: prev.lastMessageId || null,
    lastSeenOnlineAt: prev.lastSeenOnlineAt || 0,
  };
}

function getCachedState(guildId?, userId?) {
  return statusCache.get(makeStateKey(guildId, userId));
}

function setCachedState(guildId?, userId?, state?) {
  const key = makeStateKey(guildId, userId);
  statusCache.set(key, { ...(state || {}), _cachedAt: Date.now() });
  trimPresenceMap(statusCache);
}

function getPendingState(guildId?, userId?) {
  return pendingChecks.get(makeStateKey(guildId, userId));
}

function setPendingState(guildId?, userId?, state?) {
  pendingChecks.set(makeStateKey(guildId, userId), state);
  trimPresenceMap(pendingChecks, (_key, pending) => {
    if (pending?.timeout) clearTimeout(pending.timeout);
  });
}

function deletePendingState(guildId?, userId?) {
  pendingChecks.delete(makeStateKey(guildId, userId));
}

function hasPendingState(guildId?, userId?) {
  return pendingChecks.has(makeStateKey(guildId, userId));
}

function getRemovalState(guildId?, userId?) {
  return removalChecks.get(makeStateKey(guildId, userId));
}

function setRemovalState(guildId?, userId?, state?) {
  removalChecks.set(makeStateKey(guildId, userId), state);
  trimPresenceMap(removalChecks, (_key, removal) => {
    if (removal?.timeout) clearTimeout(removal.timeout);
  });
}

function deleteRemovalState(guildId?, userId?) {
  removalChecks.delete(makeStateKey(guildId, userId));
}

function hasRemovalState(guildId?, userId?) {
  return removalChecks.has(makeStateKey(guildId, userId));
}

function cancelScheduledRemoval(guildId?, userId?) {
  const st = getRemovalState(guildId, userId);
  if (st?.timeout) clearTimeout(st.timeout);
  deleteRemovalState(guildId, userId);
}

async function clearPending(guildId?, userId?, channel?) {
  const pending = getPendingState(guildId, userId);
  if (!pending) return;

  if (pending.timeout) clearTimeout(pending.timeout);
  if (pending.messageId && channel?.isTextBased?.()) {
    await channel.messages.delete(pending.messageId).catch(() => { });
  }
  deletePendingState(guildId, userId);
}

async function resolveSupportersChannel(guild?) {
  if (!guild || !CHANNEL_ID) return null;
  return guild.channels.cache.get(CHANNEL_ID) || (await getGuildChannelCached(guild, CHANNEL_ID));
}

async function refreshMember(guild?, userId?) {
  if (!guild || !userId) return null;
  return getGuildMemberCached(guild, userId);
}

/* perfP0: coalesce presence→Mongo (presence è alto volume) */
const PERSIST_DEBOUNCE_MS = Math.max(500, Number(process.env.VC_PRESENCE_PERSIST_DEBOUNCE_MS || 2500) || 2500);
const pendingPersistByKey = new Map();

async function flushPersistStatus(guildId?, userId?, payload?) {
  if (!isDbReady()) return;
  const $set = {
    "profile.supporterStatus.hasLink": Boolean(payload?.hasLink),
    "profile.supporterStatus.lastMessageId": payload?.lastMessageId || null,
  };
  if (payload?.lastSentAt) $set["profile.supporterStatus.lastSentAt"] = payload.lastSentAt;
  if (payload?.removalDueAt === null) {
    $set["profile.supporterStatus.removalDueAt"] = null;
  } else if (payload?.removalDueAt != null) {
    $set["profile.supporterStatus.removalDueAt"] = new Date(payload.removalDueAt);
  }
  const update = () => ActivityUserProfile.updateOne(
    { guildId, userId },
    {
      $setOnInsert: { guildId, userId },
      $set,
    },
    { upsert: true },
  );
  try {
    await update();
  } catch (error) {
    if (isMongoTransientError(error)) {
      await ensureMongoReady({ maxWaitMs: 3000 }).catch(() => false);
      try {
        await update();
        return;
      } catch (retryErr) {
        if (!isMongoTransientError(retryErr)) {
          global.logger?.error?.("[SUPPORTER STATUS] Persist failed:", retryErr?.message || retryErr);
          return;
        }
      }
      global.logger?.warn?.("[SUPPORTER STATUS] Persist skipped (MongoDB timeout), will retry on next update.");
      return;
    }
    global.logger?.error?.("[SUPPORTER STATUS] Persist failed:", error?.message || error);
  }
}

async function persistStatus(guildId?, userId?, payload?, { immediate = false } = {}) {
  if (!guildId || !userId) return;
  const key = makeStateKey(guildId, userId);
  const prev = pendingPersistByKey.get(key);
  const merged = {
    ...(prev?.payload || {}),
    ...(payload || {}),
  };
  const urgent =
    immediate ||
    Boolean(payload?.lastSentAt) ||
    (typeof payload?.lastMessageId === "string" && payload.lastMessageId.length > 0);
  if (urgent) {
    if (prev?.timer) clearTimeout(prev.timer);
    pendingPersistByKey.delete(key);
    await flushPersistStatus(guildId, userId, merged);
    return;
  }
  if (prev?.timer) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    pendingPersistByKey.delete(key);
    void flushPersistStatus(guildId, userId, merged);
  }, PERSIST_DEBOUNCE_MS);
  timer.unref?.();
  pendingPersistByKey.set(key, { payload: merged, timer });
}

async function clearPersistedStatus(guildId?, userId?) {
  if (!isDbReady()) return;
  const key = makeStateKey(guildId, userId);
  const pending = pendingPersistByKey.get(key);
  if (pending?.timer) clearTimeout(pending.timer);
  pendingPersistByKey.delete(key);
  const update = () => ActivityUserProfile.updateOne(
    { guildId, userId },
    {
      $set: {
        "profile.supporterStatus.hasLink": false,
        "profile.supporterStatus.lastMessageId": null,
        "profile.supporterStatus.lastSentAt": null,
        "profile.supporterStatus.removalDueAt": null,
      },
    },
  );
  try {
    await update();
  } catch (error) {
    if (isMongoTransientError(error)) {
      await ensureMongoReady({ maxWaitMs: 3000 }).catch(() => false);
      try {
        await update();
        return;
      } catch (retryErr) {
        if (!isMongoTransientError(retryErr)) {
          global.logger?.error?.("[SUPPORTER STATUS] Delete failed:", retryErr?.message || retryErr);
          return;
        }
      }
      global.logger?.warn?.("[SUPPORTER STATUS] Delete skipped (MongoDB timeout).");
      return;
    }
    global.logger?.error?.("[SUPPORTER STATUS] Delete failed:", error?.message || error);
  }
}

function isTrackedPresenceSupporterUser(guildId?, userId?, member?, presence?) {
  const {
    ROLE_ID,
    hasInvite,
    isOfflinePresence,
  } = require("./presenceSupporterInviteState") as typeof import("./presenceSupporterInviteState");
  if (ROLE_ID && member?.roles?.cache?.has(ROLE_ID)) return true;
  if (hasPendingState(guildId, userId)) return true;
  if (hasRemovalState(guildId, userId)) return true;
  const cached = getCachedState(guildId, userId);
  if (cached?.hasLink || cached?.lastMessageId || cached?.removalDueAt) return true;
  if (presence && !isOfflinePresence(presence) && hasInvite(presence)) return true;
  return false;
}

async function getPersistedStatus(guildId?, userId?) {
  if (!isDbReady() || !guildId || !userId) return null;
  try {
    const doc: any = await ActivityUserProfile.findOne({ guildId, userId })
      .select("profile.supporterStatus")
      .lean();
    if (!doc?.profile?.supporterStatus) return null;
    const dueRaw = doc.profile.supporterStatus.removalDueAt;
    const dueMs = dueRaw ? new Date(dueRaw).getTime() : 0;
    return {
      hasLink: Boolean(doc.profile.supporterStatus.hasLink),
      lastMessageId: doc.profile.supporterStatus.lastMessageId || null,
      lastSentAt: doc.profile.supporterStatus.lastSentAt || null,
      removalDueAt: Number.isFinite(dueMs) && dueMs > 0 ? dueMs : null,
    };
  } catch {
    return null;
  }
}

export = {
  statusCache,
  REMOVE_CONFIRM_MS,
  makeStateKey,
  isDbReady,
  withDefaultState,
  getCachedState,
  setCachedState,
  getPendingState,
  setPendingState,
  deletePendingState,
  hasPendingState,
  getRemovalState,
  setRemovalState,
  deleteRemovalState,
  hasRemovalState,
  cancelScheduledRemoval,
  clearPending,
  resolveSupportersChannel,
  refreshMember,
  persistStatus,
  clearPersistedStatus,
  getPersistedStatus,
  isTrackedPresenceSupporterUser,
};
