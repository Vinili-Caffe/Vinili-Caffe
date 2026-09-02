const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../Utils/Database/mongoConnect");
const { normalizeGuildId } = require("./viniliProtectedGuilds");

const BOT_STATE_KEY = "multiGuildTenantPremiumIdentity.v1";
const CACHE_TTL_MS = 4_000;

let identityCache = Object.freeze({});
let identityCacheAt = 0;
let identityCacheRefreshPromise = null;

function emptyIdentity() {
  return {
    nick: null,
    avatar: null,
    banner: null,
    visuallyApplied: false,
    updatedAt: null,
  };
}

function rowToIdentity(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return emptyIdentity();
  const nickRaw = row.nick ?? row.n;
  return {
    nick: nickRaw == null || nickRaw === "" ? null : String(nickRaw).slice(0, 32),
    avatar: typeof (row.avatar ?? row.a) === "string" && String(row.avatar ?? row.a).startsWith("data:")
      ? String(row.avatar ?? row.a)
      : null,
    banner: typeof (row.banner ?? row.b) === "string" && String(row.banner ?? row.b).startsWith("data:")
      ? String(row.banner ?? row.b)
      : null,
    visuallyApplied: row.visuallyApplied === true || row.v === true,
    updatedAt: row.updatedAt ?? row.at ?? null,
  };
}

function identityToRow(identity) {
  return {
    n: identity?.nick || null,
    a: identity?.avatar || null,
    b: identity?.banner || null,
    v: identity?.visuallyApplied === true,
    at: identity?.updatedAt || Date.now(),
  };
}

function identityHasCustom(identity) {
  if (!identity) return false;
  return Boolean(identity.nick || identity.avatar || identity.banner);
}

async function loadIdentityMap() {
  if (!isMongoReady()) return {};
  const raw = await getBotState(BOT_STATE_KEY, null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

async function refreshTenantPremiumIdentityCache() {
  if (!isMongoReady()) return identityCache;
  identityCache = Object.freeze(await loadIdentityMap());
  identityCacheAt = Date.now();
  return identityCache;
}

function isTenantPremiumIdentityCacheFresh() {
  return identityCacheAt > 0 && Date.now() - identityCacheAt < CACHE_TTL_MS;
}

async function ensureTenantPremiumIdentityCacheFresh(opts = {}) {
  const force = opts.force === true;
  if (!force && isTenantPremiumIdentityCacheFresh()) return identityCache;
  if (identityCacheRefreshPromise) return identityCacheRefreshPromise;
  identityCacheRefreshPromise = refreshTenantPremiumIdentityCache()
    .catch(() => identityCache)
    .finally(() => {
      identityCacheRefreshPromise = null;
    });
  return identityCacheRefreshPromise;
}

function getTenantPremiumIdentitySync(guildId) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return emptyIdentity();
  return rowToIdentity(identityCache[gid]);
}

async function getTenantPremiumIdentity(guildId) {
  await ensureTenantPremiumIdentityCacheFresh().catch(() => null);
  return getTenantPremiumIdentitySync(guildId);
}

async function patchTenantPremiumIdentity(guildId, patch = {}) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return { ok: false, reason: "invalid_guild" };
  if (!isMongoReady()) return { ok: false, reason: "mongo_not_ready" };

  await ensureTenantPremiumIdentityCacheFresh({ force: true }).catch(() => null);
  const map = { ...(await loadIdentityMap()) };
  const prev = rowToIdentity(map[gid]);

  const next = {
    nick: prev.nick,
    avatar: prev.avatar,
    banner: prev.banner,
    visuallyApplied: prev.visuallyApplied,
    updatedAt: Date.now(),
  };

  if (Object.prototype.hasOwnProperty.call(patch, "nick")) {
    const n = patch.nick;
    next.nick = n == null || n === "" ? null : String(n).trim().slice(0, 32) || null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "avatar")) {
    const a = patch.avatar;
    next.avatar =
      typeof a === "string" && a.startsWith("data:") ? a : a == null ? null : prev.avatar;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "banner")) {
    const b = patch.banner;
    next.banner =
      typeof b === "string" && b.startsWith("data:") ? b : b == null ? null : prev.banner;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "visuallyApplied")) {
    next.visuallyApplied = patch.visuallyApplied === true;
  }

  if (!identityHasCustom(next) && next.visuallyApplied !== true) {
    delete map[gid];
  } else {
    map[gid] = identityToRow(next);
  }

  const saved = await setBotState(BOT_STATE_KEY, map);
  if (!saved) return { ok: false, reason: "persist_failed" };
  await refreshTenantPremiumIdentityCache();
  return { ok: true, identity: getTenantPremiumIdentitySync(gid) };
}

async function setTenantPremiumIdentityVisuallyApplied(guildId, visuallyApplied) {
  return patchTenantPremiumIdentity(guildId, { visuallyApplied: visuallyApplied === true });
}

module.exports = {
  BOT_STATE_KEY,
  emptyIdentity,
  identityHasCustom,
  ensureTenantPremiumIdentityCacheFresh,
  refreshTenantPremiumIdentityCache,
  getTenantPremiumIdentitySync,
  getTenantPremiumIdentity,
  patchTenantPremiumIdentity,
  setTenantPremiumIdentityVisuallyApplied,
};
