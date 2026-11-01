const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../Utils/Database/mongoConnect") as typeof import("../../Utils/Database/mongoConnect");
const { normalizeGuildId } = require("./viniliProtectedGuilds") as typeof import("./viniliProtectedGuilds");

const BOT_STATE_KEY = "multiGuildTenantPremium.v1";
const CACHE_TTL_MS = 4_000;

let premiumCache = Object.freeze({});
let premiumCacheAt = 0;
let premiumCacheRefreshPromise = null;

function emptyPremiumRow() {
  return {
    active: false,
    plan: null,
    until: null,
    source: null,
    note: null,
    updatedAt: null,
    updatedBy: null,
  };
}

function rowToPremium(row?) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return emptyPremiumRow();
  const untilRaw = row.until ?? row.u ?? null;
  let until = null;
  if (untilRaw != null && untilRaw !== "") {
    const n = Number(untilRaw);
    if (Number.isFinite(n) && n > 0) until = n;
    else {
      const parsed = Date.parse(String(untilRaw));
      if (Number.isFinite(parsed)) until = parsed;
    }
  }
  const activeFlag = row.active === true || row.a === true;
  const expired = until != null && until <= Date.now();
  return {
    active: activeFlag && !expired,
    plan: row.plan || row.p || null,
    until,
    source: row.source || row.s || null,
    note: row.note || row.n || null,
    updatedAt: row.updatedAt ?? row.at ?? null,
    updatedBy: row.updatedBy ?? row.by ?? null,
  };
}

function premiumToRow(premium?) {
  return {
    a: premium?.active === true,
    p: premium?.plan || "premium",
    u: premium?.until || null,
    s: premium?.source || null,
    n: premium?.note || null,
    at: premium?.updatedAt || Date.now(),
    by: premium?.updatedBy || null,
  };
}

async function loadPremiumMap() {
  if (!isMongoReady()) return {};
  const raw = await getBotState(BOT_STATE_KEY, null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

async function refreshTenantPremiumCache() {
  if (!isMongoReady()) return premiumCache;
  premiumCache = Object.freeze(await loadPremiumMap());
  premiumCacheAt = Date.now();
  return premiumCache;
}

function isTenantPremiumCacheFresh() {
  return premiumCacheAt > 0 && Date.now() - premiumCacheAt < CACHE_TTL_MS;
}

async function ensureTenantPremiumCacheFresh(opts: Record<string, any> = {}) {
  const force = opts.force === true;
  if (!force && isTenantPremiumCacheFresh()) return premiumCache;
  if (premiumCacheRefreshPromise) return premiumCacheRefreshPromise;
  premiumCacheRefreshPromise = refreshTenantPremiumCache()
    .catch(() => premiumCache)
    .finally(() => {
      premiumCacheRefreshPromise = null;
    });
  return premiumCacheRefreshPromise;
}

function getTenantPremiumSync(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) {
    return { ...emptyPremiumRow(), active: false };
  }
  return rowToPremium(premiumCache[gid]);
}

async function getTenantPremium(guildId?) {
  await ensureTenantPremiumCacheFresh().catch(() => null);
  return getTenantPremiumSync(guildId);
}

function isTenantPremiumActiveSync(guildId?) {
  return getTenantPremiumSync(guildId).active === true;
}

async function isTenantPremiumActive(guildId?) {
  const row = await getTenantPremium(guildId);
  return row.active === true;
}

function serializePremiumPublic(premium?) {
  const row = premium && typeof premium === "object" ? premium : emptyPremiumRow();
  return {
    active: row.active === true,
    plan: row.active ? row.plan || "premium" : null,
    until: row.active ? row.until || null : null,
  };
}

async function setTenantPremium(guildId?, patch: Record<string, any> = {}) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return { ok: false, reason: "invalid_guild" };
  if (!isMongoReady()) return { ok: false, reason: "mongo_not_ready" };

  await ensureTenantPremiumCacheFresh({ force: true }).catch(() => null);
  const map = { ...(await loadPremiumMap()) };
  const prev = rowToPremium(map[gid]);

  let until = prev.until;
  if (Object.prototype.hasOwnProperty.call(patch, "until")) {
    until = patch.until == null ? null : Number(patch.until);
    if (until != null && (!Number.isFinite(until) || until <= 0)) {
      return { ok: false, reason: "invalid_until" };
    }
  } else if (Object.prototype.hasOwnProperty.call(patch, "days")) {
    const days = Number(patch.days);
    if (!Number.isFinite(days) || days <= 0) return { ok: false, reason: "invalid_days" };
    until = Date.now() + Math.round(days) * 24 * 60 * 60 * 1000;
  } else if (patch.lifetime === true) {
    until = null;
  }

  const active =
    Object.prototype.hasOwnProperty.call(patch, "active")
      ? patch.active === true
      : true;

  const next = {
    active,
    plan: patch.plan || prev.plan || "premium",
    until: active ? until : null,
    source: patch.source || prev.source || "manual",
    note: Object.prototype.hasOwnProperty.call(patch, "note") ? patch.note : prev.note,
    updatedAt: Date.now(),
    updatedBy: patch.updatedBy != null ? String(patch.updatedBy) : prev.updatedBy,
  };

  if (!active) {
    delete map[gid];
  } else {
    map[gid] = premiumToRow(next);
  }

  const saved = await setBotState(BOT_STATE_KEY, map);
  if (!saved) return { ok: false, reason: "persist_failed" };
  await refreshTenantPremiumCache();

  const resultPremium = rowToPremium(map[gid] || { a: false });
  const becameActive = resultPremium.active === true && prev.active !== true;

  try {
    const client =
      global.botClient || global.__vinylsDiscordClient || global.client || null;
    if (client) {
      const {
        restorePremiumIdentityVisual,
        suspendPremiumIdentityVisual,
      } = require("../services/premiumIdentityLifecycleService") as typeof import("../services/premiumIdentityLifecycleService");
      if (becameActive) {
        void restorePremiumIdentityVisual(client, gid).catch((err?) => {
          global.logger?.warn?.(
            "[tenantPremium] restore identity on grant:",
            gid,
            err?.message || err,
          );
        });
      } else if (resultPremium.active !== true) {
        void suspendPremiumIdentityVisual(client, gid).catch((err?) => {
          global.logger?.warn?.(
            "[tenantPremium] suspend identity on revoke:",
            gid,
            err?.message || err,
          );
        });
      }
    }
  } catch (err) {
    global.logger?.warn?.("[tenantPremium] identity lifecycle hook:", err?.message || err);
  }

  return { ok: true, premium: resultPremium };
}

async function grantTenantPremium(guildId?, opts: Record<string, any> = {}) {
  const patch: Record<string, any> = {
    active: true,
    plan: opts.plan || "premium",
    source: opts.source || "manual",
    note: opts.note || null,
    updatedBy: opts.updatedBy || null,
  };
  if (opts.until != null) patch.until = opts.until;
  else if (opts.days != null) patch.days = opts.days;
  else if (opts.lifetime === false) patch.until = null;
  else patch.lifetime = true;
  return setTenantPremium(guildId, patch);
}

async function revokeTenantPremium(guildId?, opts: Record<string, any> = {}) {
  return setTenantPremium(guildId, {
    active: false,
    source: opts.source || "manual",
    updatedBy: opts.updatedBy || null,
    note: opts.note || null,
  });
}

async function revokeAllPremiumBySource(source?, opts: Record<string, any> = {}) {
  const src = String(source || "").trim();
  if (!src) return { ok: false, reason: "invalid_source" };
  if (!isMongoReady()) return { ok: false, reason: "mongo_not_ready" };

  await ensureTenantPremiumCacheFresh({ force: true }).catch(() => null);
  const map = { ...(await loadPremiumMap()) };
  const revokedGuildIds = [];
  for (const [gid, row] of Object.entries(map)) {
    if (String(rowToPremium(row).source || "") !== src) continue;
    revokedGuildIds.push(gid);
    delete map[gid];
  }

  if (!revokedGuildIds.length) return { ok: true, revokedCount: 0, revokedGuildIds: [] };

  const saved = await setBotState(BOT_STATE_KEY, map);
  if (!saved) return { ok: false, reason: "persist_failed" };
  await refreshTenantPremiumCache();
  global.logger?.info?.(
    `[tenantPremium] revokeAllPremiumBySource(${src}) by=${opts.updatedBy || "?"}: revoked ${revokedGuildIds.length} guild(s).${opts.note ? ` note=${opts.note}` : ""}`,
  );
  return { ok: true, revokedCount: revokedGuildIds.length, revokedGuildIds };
}

export = {
  BOT_STATE_KEY,
  serializePremiumPublic,
  ensureTenantPremiumCacheFresh,
  getTenantPremiumSync,
  getTenantPremium,
  isTenantPremiumActiveSync,
  isTenantPremiumActive,
  grantTenantPremium,
  revokeTenantPremium,
  revokeAllPremiumBySource,
};
