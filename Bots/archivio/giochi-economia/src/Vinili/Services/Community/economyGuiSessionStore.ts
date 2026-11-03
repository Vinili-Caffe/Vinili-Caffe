const { ActivityUserProfile } = require("../../../../../../src/Vinili/Community/schemas/communitySchemas") as typeof import("../../../../../../src/Vinili/Community/schemas/communitySchemas");
const { isValidGuildUserId } = require("../../../../../../src/shared/db/validateWriteIds") as typeof import("../../../../../../src/shared/db/validateWriteIds");
const { ensureMongoReady, isMongoReady } = require("../../Utils/Database/mongoConnect") as typeof import("../../Utils/Database/mongoConnect");

const GUI_SESSIONS_ROOT = "profile.economy.server.guiSessions";
const SESSION_DB_TTL_MS = 24 * 60 * 60 * 1000;
const PERSIST_RETRY = 2;
const LOAD_RETRY = 3;

function normalizeId(value?) {
  return String(value || "").trim();
}

function gamePath(gameKey?) {
  return `${GUI_SESSIONS_ROOT}.${normalizeId(gameKey)}`;
}

function dbExpired(raw?) {
  const ms = new Date(raw?.updatedAt || 0).getTime();
  return !Number.isFinite(ms) || Date.now() - ms > SESSION_DB_TTL_MS;
}

function sanitizeSession(session?) {
  if (!session || typeof session !== "object") return null;
  let cloned;
  try {
    cloned = JSON.parse(JSON.stringify(session));
  } catch {
    return null;
  }
  cloned.panelAnimating = false;
  delete cloned.panelImage;
  delete cloned.persistPromise;
  return cloned;
}

function sessionFromDb(raw?, guildId?, userId?) {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw.payload && typeof raw.payload === "object" ? raw.payload : null;
  if (!payload) return null;
  const messageId = normalizeId(raw.messageId || payload.messageId);
  const ownerId = normalizeId(raw.ownerId || payload.ownerId || userId);
  if (!messageId || !ownerId) return null;
  return {
    ...payload,
    ownerId,
    guildId: normalizeId(payload.guildId || guildId),
    messageId,
    panelAnimating: false,
    updatedAt: new Date(raw.updatedAt || Date.now()).getTime(),
    createdAt: Number(payload.createdAt) || new Date(raw.updatedAt || Date.now()).getTime(),
  };
}

async function waitMongoBrief() {
  if (isMongoReady()) return true;
  return ensureMongoReady({ maxWaitMs: 4000 });
}

async function persistEconomyGuiSession(gameKey?, messageId?, session?) {
  const key = normalizeId(gameKey);
  const g = normalizeId(session?.guildId);
  const u = normalizeId(session?.ownerId);
  const mid = normalizeId(messageId);
  if (!key || !isValidGuildUserId(g, u) || !mid) return false;
  const payload = sanitizeSession({ ...session, messageId: mid, guildId: g, ownerId: u });
  if (!payload) return false;
  if (!(await waitMongoBrief())) {
    global.logger?.warn?.(`[${key.toUpperCase()} GUI] persist skipped: mongo not ready`);
    return false;
  }
  const path = gamePath(key);
  for (let attempt = 1; attempt <= PERSIST_RETRY; attempt += 1) {
    try {
      await ActivityUserProfile.updateOne(
        { guildId: g, userId: u },
        {
          $setOnInsert: { guildId: g, userId: u },
          $set: {
            [path]: {
              messageId: mid,
              ownerId: u,
              updatedAt: new Date(),
              payload,
            },
            "profile.economy.server.updatedAt": new Date(),
          },
        },
        { upsert: true, setDefaultsOnInsert: true },
      );
      return true;
    } catch (err) {
      global.logger?.warn?.(`[${key.toUpperCase()} GUI] persist attempt ${attempt}:`, err?.message || err);
      if (attempt < PERSIST_RETRY) await new Promise((r?) => setTimeout(r, 120 * attempt));
    }
  }
  return false;
}

async function clearEconomyGuiSession(gameKey?, guildId?, userId?, messageId = "") {
  const key = normalizeId(gameKey);
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const mid = normalizeId(messageId);
  if (!key || !isValidGuildUserId(g, u)) return;
  if (!(await waitMongoBrief())) return;
  const path = gamePath(key);
  const filter = { guildId: g, userId: u };
  if (mid) filter[`${path}.messageId`] = mid;
  await ActivityUserProfile.updateOne(filter, {
    $unset: { [path]: "" },
    $set: { "profile.economy.server.updatedAt": new Date() },
  }).catch(() => null);
}

async function loadEconomyGuiSessionByMessage(gameKey?, guildId?, messageId?) {
  const key = normalizeId(gameKey);
  const g = normalizeId(guildId);
  const mid = normalizeId(messageId);
  if (!key || !mid) return null;
  if (!(await waitMongoBrief())) return null;
  const path = gamePath(key);
  const filter = { [`${path}.messageId`]: mid };
  if (g) filter.guildId = g;
  const doc = await ActivityUserProfile.findOne(filter)
    .select("profile.economy userId guildId")
    .lean()
    .catch(() => null);
  const raw = doc?.profile?.economy?.server?.guiSessions?.[key];
  if (!raw || normalizeId(raw.messageId) !== mid) return null;
  if (dbExpired(raw)) {
    await clearEconomyGuiSession(key, normalizeId(doc.guildId || g), doc.userId, mid);
    return null;
  }
  return sessionFromDb(raw, normalizeId(doc.guildId || g), doc.userId);
}

async function loadEconomyGuiSessionByOwner(gameKey?, guildId?, userId?) {
  const key = normalizeId(gameKey);
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!key || !isValidGuildUserId(g, u)) return null;
  if (!(await waitMongoBrief())) return null;
  const doc = await ActivityUserProfile.findOne({ guildId: g, userId: u })
    .select("profile.economy userId")
    .lean()
    .catch(() => null);
  const raw = doc?.profile?.economy?.server?.guiSessions?.[key];
  if (!raw || dbExpired(raw)) {
    if (raw) await clearEconomyGuiSession(key, g, u, raw.messageId);
    return null;
  }
  return sessionFromDb(raw, g, u);
}

async function listEconomyGuiSessions(gameKey?, { limit = 500 } = {}) {
  const key = normalizeId(gameKey);
  if (!key) return [];
  if (!(await waitMongoBrief())) return [];
  const path = gamePath(key);
  const max = Math.max(1, Math.min(2000, Math.floor(Number(limit) || 500)));
  const docs = await ActivityUserProfile.find({
    [`${path}.messageId`]: { $exists: true, $nin: [null, ""] },
  })
    .select("guildId userId profile.economy")
    .limit(max)
    .lean()
    .catch(() => []);
  const out = [];
  for (const doc of Array.isArray(docs) ? docs : []) {
    const raw = doc?.profile?.economy?.server?.guiSessions?.[key];
    if (!raw) continue;
    if (dbExpired(raw)) {
      await clearEconomyGuiSession(key, normalizeId(doc.guildId), doc.userId, raw.messageId);
      continue;
    }
    const session = sessionFromDb(raw, normalizeId(doc.guildId), doc.userId);
    if (session) out.push(session);
  }
  return out;
}

function createPersistedGuiSessionApi(gameKey?, { ttlMs = SESSION_DB_TTL_MS, onEvict = null } = {}) {
  const sessions = new Map();
  const keyName = normalizeId(gameKey);

  function evict(session?) {
    if (session && typeof onEvict === "function") {
      try {
        onEvict(session);
      } catch (_) {}
    }
  }

  function sessionKey(messageId?) {
    return normalizeId(messageId);
  }

  function now() {
    return Date.now();
  }

  function setSession(messageId?, session?) {
    const mid = sessionKey(messageId);
    const live = {
      ...session,
      messageId: mid || normalizeId(session?.messageId),
      updatedAt: now(),
    };
    if (mid) sessions.set(mid, live);
    const persistPromise = persistEconomyGuiSession(keyName, mid || live.messageId, live).then((ok?) => {
      if (!ok) {
        global.logger?.warn?.(`[${keyName.toUpperCase()} GUI] persist failed for message ${mid || live.messageId}`);
      }
      return ok;
    });
    live.persistPromise = persistPromise;
    return live;
  }

  async function getSession(messageId?, guildId = "", ownerIdHint = "") {
    const mid = sessionKey(messageId);
    if (mid) {
      const cached = sessions.get(mid);
      if (cached) {
        const age = now() - Number(cached.updatedAt || cached.createdAt || 0);
        if (age > ttlMs) {
          sessions.delete(mid);
          evict(cached);
          const cg = normalizeId(cached.guildId);
          const cu = normalizeId(cached.ownerId);
          if (cg && cu) void clearEconomyGuiSession(keyName, cg, cu, mid).catch(() => null);
        } else {
          return cached;
        }
      }
    }

    const g = normalizeId(guildId);
    const owner = normalizeId(ownerIdHint);
    let restored = null;
    for (let attempt = 1; attempt <= LOAD_RETRY; attempt += 1) {
                        if (mid) restored = await loadEconomyGuiSessionByMessage(keyName, g, mid);
      else if (owner && g) restored = await loadEconomyGuiSessionByOwner(keyName, g, owner);
      if (restored) break;
      if (attempt < LOAD_RETRY) await new Promise((r?) => setTimeout(r, 80 * attempt));
    }
    if (!restored) return null;
    const storeKey = sessionKey(restored.messageId);
    if (mid && storeKey && mid !== storeKey) return null;

    restored.updatedAt = now();
    restored.panelAnimating = false;
    if (storeKey) sessions.set(storeKey, restored);
    return restored;
  }

  function deleteSession(messageId?, session = null) {
    const mid = sessionKey(messageId);
    const cached = mid ? sessions.get(mid) : null;
    if (mid) sessions.delete(mid);
    evict(session || cached);
    const g = normalizeId(session?.guildId || cached?.guildId);
    const u = normalizeId(session?.ownerId || cached?.ownerId);
    if (g && u) {
      return clearEconomyGuiSession(keyName, g, u, mid || session?.messageId || cached?.messageId).catch(() => null);
    }
    return Promise.resolve();
  }

  function listMemorySessions() {
    return [...sessions.values()];
  }

  return { sessions, setSession, getSession, deleteSession, listMemorySessions, SESSION_DB_TTL_MS: ttlMs };
}

export = {
  SESSION_DB_TTL_MS,
  clearEconomyGuiSession,
  createPersistedGuiSessionApi,
  listEconomyGuiSessions,
  loadEconomyGuiSessionByMessage,
  loadEconomyGuiSessionByOwner,
  persistEconomyGuiSession,
};
