/**
 * Discord OAuth /users/@me with a non-blocked User-Agent.
 * Bare Node/undici UA is often Cloudflare 1010 from datacenter IPs.
 *
 * siteApiOauthCache1: process-local success cache + singleflight.
 * Cuts Discord RTT on repeated authed site-api calls (chrome, notif, roles, …).
 */
const crypto = require("crypto") as typeof import("crypto");

const DISCORD_OAUTH_UA = "DiscordBot (https://www.viniliecaffe.it, 1.0)";
const OAUTH_ME_CACHE_TTL_MS = 90_000;
const OAUTH_ME_NEG_TTL_MS = 12_000;
const OAUTH_ME_CACHE_MAX = 800;

const meCache = new Map();
const meInflight = new Map();

function tokenCacheKey(token?) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function pruneMeCache(now = Date.now()) {
  if (meCache.size <= OAUTH_ME_CACHE_MAX) return;
  for (const [k, v] of meCache) {
    if (!v || Number(v.exp || 0) <= now) meCache.delete(k);
  }
  if (meCache.size <= OAUTH_ME_CACHE_MAX) return;
  const excess = meCache.size - Math.floor(OAUTH_ME_CACHE_MAX * 0.75);
  let i = 0;
  for (const k of meCache.keys()) {
    meCache.delete(k);
    if (++i >= excess) break;
  }
}

function readMeCache(key?, now = Date.now()) {
  const hit = meCache.get(key);
  if (!hit) return null;
  if (Number(hit.exp || 0) <= now) {
    meCache.delete(key);
    return null;
  }
  return hit.value;
}

function writeMeCache(key?, value?, ttlMs?) {
  const ttl = Math.max(1_000, Number(ttlMs) || OAUTH_ME_CACHE_TTL_MS);
  meCache.set(key, { value, exp: Date.now() + ttl });
  pruneMeCache();
}

async function fetchDiscordOAuthMeUncached(accessToken?, options: Record<string, any> = {}) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "missing_token",
      message: "Token mancante.",
      me: null,
    };
  }

  const timeoutMs = Math.max(800, Number(options.timeoutMs) || 8000);
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => {
    try {
      ctrl?.abort?.();
    } catch (_) {}
  }, timeoutMs);

  try {
    const meRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": DISCORD_OAUTH_UA,
      },
      signal: ctrl ? ctrl.signal : undefined,
    });

    const raw = await meRes.text().catch(() => "");
    if (/error code:\s*1010/i.test(raw) || (meRes.status === 403 && /cloudflare/i.test(raw))) {
      return {
        ok: false,
        /* 503 not 502: Cloudflare replaces origin 502 with plain "error code: 502" (no JSON). */
        status: 503,
        error: "discord_unreachable",
        message: "Impossibile contattare Discord in questo momento. Riprova tra poco.",
        me: null,
      };
    }

    if (meRes.status === 401) {
      return {
        ok: false,
        status: 401,
        error: "invalid_token",
        message: "Sessione Discord non valida o scaduta: effettua di nuovo il login.",
        me: null,
      };
    }

    if (!meRes.ok) {
      return {
        ok: false,
        status: 503,
        error: "discord_unreachable",
        message: "Impossibile contattare Discord in questo momento. Riprova tra poco.",
        me: null,
      };
    }

    let me = null;
    try {
      me = raw ? JSON.parse(raw) : null;
    } catch (_) {
      me = null;
    }
    if (!me || typeof me !== "object") {
      return {
        ok: false,
        status: 503,
        error: "discord_unreachable",
        message: "Risposta Discord non valida. Riprova tra poco.",
        me: null,
      };
    }
    return { ok: true, status: 200, me, error: null, message: null };
  } catch (err) {
    const aborted = String(err?.name || err?.message || "").toLowerCase().includes("abort");
    return {
      ok: false,
      status: 503,
      error: aborted ? "discord_timeout" : "discord_unreachable",
      message: aborted
        ? "Discord non risponde in tempo. Riprova tra poco."
        : "Impossibile contattare Discord in questo momento. Riprova tra poco.",
      me: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDiscordOAuthMe(accessToken?, options: Record<string, any> = {}) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "missing_token",
      message: "Token mancante.",
      me: null,
    };
  }

  const skipCache = options.skipCache === true || options.forceRefresh === true;
  const key = tokenCacheKey(token);
  if (!skipCache) {
    const cached = readMeCache(key);
    if (cached) return cached;
    const pending = meInflight.get(key);
    if (pending) return pending;
  }

  const work = (async () => {
    const out = await fetchDiscordOAuthMeUncached(token, options);
    if (out.ok && out.me) {
      writeMeCache(key, out, OAUTH_ME_CACHE_TTL_MS);
    } else if (out.status === 401 || out.error === "invalid_token") {
      writeMeCache(key, out, OAUTH_ME_NEG_TTL_MS);
    }
    return out;
  })();

  if (!skipCache) {
    meInflight.set(key, work);
    work.finally(() => {
      if (meInflight.get(key) === work) meInflight.delete(key);
    }).catch(() => {});
  }
  return work;
}

function getDiscordOAuthMeCacheStats() {
  return {
    size: meCache.size,
    inflight: meInflight.size,
    ttlMs: OAUTH_ME_CACHE_TTL_MS,
  };
}

export = {
  DISCORD_OAUTH_UA,
  fetchDiscordOAuthMe,
  getDiscordOAuthMeCacheStats,
};
