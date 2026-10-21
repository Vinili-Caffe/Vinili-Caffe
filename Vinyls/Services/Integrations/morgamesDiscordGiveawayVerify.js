/**
 * Morgames Discord giveaway verification (server-side only).
 * Docs: GET /api/integrations/discord/giveaway/verify?user_id=…
 * Env:
 *   MORGAMES_DISCORD_GIVEAWAY_API_SECRET  (required) — raw Authorization value
 *   MORGAMES_API_BASE_URL                 (optional) — default https://morgames.app
 *
 * Fail-closed: 400/401/503/network → not linked / not allowed.
 */

const DEFAULT_BASE = "https://morgames.app";
const VERIFY_PATH = "/api/integrations/discord/giveaway/verify";
const MAX_IDS_PER_REQUEST = 100;
const POSITIVE_TTL_MS = 10 * 60 * 1000;
const NEGATIVE_TTL_MS = 90 * 1000;
const FETCH_TIMEOUT_MS = 12_000;

const cache = new Map();

function getSecret() {
  return String(process.env.MORGAMES_DISCORD_GIVEAWAY_API_SECRET || "").trim();
}

function getBaseUrl() {
  const raw = String(process.env.MORGAMES_API_BASE_URL || DEFAULT_BASE).trim().replace(/\/+$/, "");
  return raw || DEFAULT_BASE;
}

function isConfigured() {
  return Boolean(getSecret());
}

function isDiscordSnowflake(id) {
  return /^\d{17,20}$/.test(String(id || "").trim());
}

function cacheGet(userId) {
  const hit = cache.get(String(userId));
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(String(userId));
    return null;
  }
  return hit;
}

function cacheSet(userId, payload, linked) {
  cache.set(String(userId), {
    linked: Boolean(linked),
    account: payload?.account || null,
    expiresAt: Date.now() + (linked ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS),
  });
}

function normalizeResult(row, fallbackId) {
  const discordUserId = String(
    row?.discordUserId || row?.user_id || row?.userId || fallbackId || "",
  ).trim();
  const linked = row?.linked === true;
  const account = row?.account && typeof row.account === "object" ? row.account : null;
  return { discordUserId, linked, account };
}

async function fetchVerify(userIds) {
  const secret = getSecret();
  if (!secret) {
    return { ok: false, status: 0, error: "missing_secret", results: [] };
  }
  const ids = [...new Set(userIds.map((id) => String(id || "").trim()).filter(isDiscordSnowflake))];
  if (!ids.length) {
    return { ok: false, status: 400, error: "invalid_user_id", results: [] };
  }

  const url = new URL(VERIFY_PATH, `${getBaseUrl()}/`);
  for (const id of ids.slice(0, MAX_IDS_PER_REQUEST)) {
    url.searchParams.append("user_id", id);
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch (_) {}
      }, FETCH_TIMEOUT_MS)
    : null;

  let res;
  let data = null;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: secret,
        Accept: "application/json",
      },
      signal: controller?.signal,
      cache: "no-store",
    });
    const text = await res.text().catch(() => "");
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = null;
    }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err?.name === "AbortError" ? "timeout" : "network",
      results: [],
    };
  } finally {
    if (timer) clearTimeout(timer);
  }

  const status = Number(res?.status) || 0;
  if (status === 400 || status === 401 || status === 503 || status < 200 || status >= 300) {
    return { ok: false, status, error: "http_" + status, results: [] };
  }

  const rows = Array.isArray(data?.results)
    ? data.results
    : data && typeof data === "object"
      ? [data]
      : [];

  const byId = new Map();
  for (const row of rows) {
    const norm = normalizeResult(row, ids[0]);
    if (norm.discordUserId) byId.set(norm.discordUserId, norm);
  }
  /* Single-id response without results[] */
  if (!byId.size && data && (data.user_id || data.linked != null)) {
    const norm = normalizeResult(data, ids[0]);
    if (norm.discordUserId) byId.set(norm.discordUserId, norm);
  }

  const results = ids.map((id) => {
    const found = byId.get(id);
    if (found) return found;
    /* Missing from payload → fail closed */
    return { discordUserId: id, linked: false, account: null };
  });

  return { ok: true, status, error: null, results, raw: data };
}

/**
 * @param {string} userId
 * @param {{ force?: boolean }} [opts] force=true salta cache (retry dopo registrazione)
 * @returns {Promise<{ ok: boolean, linked: boolean, account: object|null, error?: string, cached?: boolean }>}
 */
async function verifyDiscordUserLinked(userId, opts) {
  const id = String(userId || "").trim();
  const force = Boolean(opts && opts.force);
  if (!isDiscordSnowflake(id)) {
    return { ok: false, linked: false, account: null, error: "invalid_user_id" };
  }
  if (!isConfigured()) {
    return { ok: false, linked: false, account: null, error: "missing_secret" };
  }

  if (!force) {
    const cached = cacheGet(id);
    if (cached) {
      return { ok: true, linked: cached.linked, account: cached.account, cached: true };
    }
  } else {
    try {
      cache.delete(id);
    } catch (_) {}
  }

  const out = await fetchVerify([id]);
  if (!out.ok) {
    return { ok: false, linked: false, account: null, error: out.error || "verify_failed" };
  }
  const row = out.results[0] || { discordUserId: id, linked: false, account: null };
  cacheSet(id, row, row.linked === true);
  return { ok: true, linked: row.linked === true, account: row.account || null };
}

/**
 * Filter to Discord IDs that are Morgames-linked. Fail-closed per id on API errors.
 * @returns {Promise<string[]>}
 */
async function filterLinkedDiscordUsers(userIds) {
  const ids = [...new Set((userIds || []).map((id) => String(id || "").trim()).filter(isDiscordSnowflake))];
  if (!ids.length) return [];
  if (!isConfigured()) return [];

  const linked = [];
  const needFetch = [];
  for (const id of ids) {
    const cached = cacheGet(id);
    if (cached) {
      if (cached.linked) linked.push(id);
      continue;
    }
    needFetch.push(id);
  }

  for (let i = 0; i < needFetch.length; i += MAX_IDS_PER_REQUEST) {
    const chunk = needFetch.slice(i, i + MAX_IDS_PER_REQUEST);
    const out = await fetchVerify(chunk);
    if (!out.ok) {
      /* fail closed for whole chunk */
      continue;
    }
    for (const row of out.results) {
      cacheSet(row.discordUserId, row, row.linked === true);
      if (row.linked === true) linked.push(row.discordUserId);
    }
  }

  return [...new Set(linked)];
}

module.exports = {
  isConfigured,
  verifyDiscordUserLinked,
  filterLinkedDiscordUsers,
  MORGAMES_SITE_URL: "https://morgames.app/",
};
