const WEBSITE_MEMBER_FETCH_TIMEOUT_MS = 12_000;
const WEBSITE_MEMBER_FETCH_RETRY_TIMEOUT_MS = 18_000;
const WEBSITE_MEMBER_CACHE_TTL_MS = 120_000;
/** Dopo un timeout Discord: non ritentare lo stesso user per un po' (evita loop site-api). */
const WEBSITE_MEMBER_NEGATIVE_CACHE_TTL_MS = 90_000;
/** Log warn per-user al massimo ogni N ms (non globale su tutti gli user). */
const WEBSITE_MEMBER_TIMEOUT_LOG_COOLDOWN_MS = 5 * 60 * 1000;
/** Sotto questa soglia è un soft-timeout di first-paint: non loggare come errore. */
const WEBSITE_MEMBER_SOFT_TIMEOUT_LOG_MS = 2_000;

/** @type {Map<string, { expires: number, member: object }>} */
const websiteMemberResolveCache = new Map();
/** @type {Map<string, number>} uid -> cooldownUntil */
const websiteMemberNegativeCache = new Map();
/** @type {Map<string, number>} uid -> lastLogAt */
const memberFetchTimeoutLogAt = new Map();
/** @type {Map<string, Promise<object|null>>} */
const websiteMemberFetchInflight = new Map();

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label || "operation"}_timeout`)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function pruneMapByExpiry(map, now = Date.now()) {
  if (map.size <= 2_000) return;
  for (const [k, v] of map) {
    const exp = typeof v === "number" ? v : Number(v?.expires || 0);
    if (!Number.isFinite(exp) || exp <= now) map.delete(k);
  }
}

function readCachedWebsiteMember(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  const hit = websiteMemberResolveCache.get(uid);
  if (!hit) return null;
  if (hit.expires <= Date.now() || !hit.member) {
    websiteMemberResolveCache.delete(uid);
    return null;
  }
  return hit.member;
}

function writeCachedWebsiteMember(userId, member) {
  const uid = String(userId || "").trim();
  if (!uid || !member) return;
  websiteMemberResolveCache.set(uid, {
    member,
    expires: Date.now() + WEBSITE_MEMBER_CACHE_TTL_MS,
  });
  websiteMemberNegativeCache.delete(uid);
}

function isOnNegativeCache(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  const until = Number(websiteMemberNegativeCache.get(uid) || 0);
  if (until > Date.now()) return true;
  if (until) websiteMemberNegativeCache.delete(uid);
  return false;
}

function markNegativeCache(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  websiteMemberNegativeCache.set(uid, Date.now() + WEBSITE_MEMBER_NEGATIVE_CACHE_TTL_MS);
  pruneMapByExpiry(websiteMemberNegativeCache);
}

function isUnknownMemberError(err) {
  const code = Number(err?.code ?? err?.rawError?.code ?? 0);
  const msg = String(err?.message || err || "");
  return code === 10007 || /unknown member/i.test(msg);
}

function isMemberFetchTimeoutError(err) {
  return /member_fetch_timeout/i.test(String(err?.message || err || ""));
}

function logMemberFetchTimeout(uid, attempt, timeoutMs) {
  const ms = Number(timeoutMs) || 0;
  // Soft first-paint (es. 500ms staff profile): atteso, non spammare i log.
  if (ms > 0 && ms <= WEBSITE_MEMBER_SOFT_TIMEOUT_LOG_MS) return;
  const now = Date.now();
  const prev = Number(memberFetchTimeoutLogAt.get(uid) || 0);
  if (now - prev < WEBSITE_MEMBER_TIMEOUT_LOG_COOLDOWN_MS) return;
  memberFetchTimeoutLogAt.set(uid, now);
  pruneMapByExpiry(memberFetchTimeoutLogAt, now - WEBSITE_MEMBER_TIMEOUT_LOG_COOLDOWN_MS);
  global.logger?.warn?.(
    "[websiteGuildMemberFetch] member_fetch_timeout",
    `user=${uid}`,
    `attempt=${attempt}`,
    `timeoutMs=${ms || "?"}`,
  );
}

/**
 * Guild per auth sito: su site-api REST evita channels/emojis/stickers (cold start lento).
 * @param {import("discord.js").Client} client
 * @param {string} guildId
 * @param {number} [timeoutMs]
 */
async function ensureWebsiteGuild(client, guildId, timeoutMs = 10_000) {
  const gid = String(guildId || "").trim();
  if (!client || !gid) return null;

  const cached = client.guilds?.cache?.get(gid) || null;
  if (cached?.members && typeof cached.members.fetch === "function") {
    return cached;
  }

  const fetchLite = client.guilds?.fetchLite;
  const fetchFull = client.guilds?.fetch;
  const fetcher =
    client._isSiteApiRestClient && typeof fetchLite === "function"
      ? () => fetchLite(gid)
      : typeof fetchFull === "function"
        ? () => fetchFull(gid)
        : null;
  if (!fetcher) return null;

  return withTimeout(fetcher(), timeoutMs, "guild_fetch").catch(() => null);
}

async function fetchMemberOnce(guild, uid, force, timeoutMs) {
  const fetchArg = force ? { user: uid, force: true } : uid;
  return withTimeout(guild.members.fetch(fetchArg), timeoutMs, "member_fetch");
}

/**
 * Member fetch con dedupe concorrente + cache breve (staff/appelli/candidature).
 * Se passi timeoutMs esplicito, viene rispettato (niente floor 4s / retry 18s).
 * @param {import("discord.js").Guild} guild
 * @param {string} userId
 * @param {{ force?: boolean, timeoutMs?: number, retry?: boolean }} [options]
 */
async function fetchWebsiteGuildMember(guild, userId, options = {}) {
  const uid = String(userId || "").trim();
  if (!guild || !uid) return null;

  if (!options.force) {
    const cached = readCachedWebsiteMember(uid) || guild.members?.cache?.get?.(uid) || null;
    if (cached) return cached;
    // Timeout recenti: non martellare Discord (evita log/loop continui).
    if (isOnNegativeCache(uid)) return null;
  }

  const inflightKey = `${guild.id}:${uid}:${options.force ? "f" : "n"}`;
  const pending = websiteMemberFetchInflight.get(inflightKey);
  if (pending) return pending;

  const promise = (async () => {
    const requested = Number(options.timeoutMs);
    const hasExplicit = Number.isFinite(requested) && requested > 0;
    // PRIMA: Math.max(4000, …) ignorava i timeout corti → loader da 20s+.
    const primaryTimeout = hasExplicit
      ? Math.max(600, requested)
      : WEBSITE_MEMBER_FETCH_TIMEOUT_MS;
    const doRetry =
      options.retry === true || (!hasExplicit && options.retry !== false);
    try {
      let member = null;
      try {
        member = await fetchMemberOnce(guild, uid, Boolean(options.force), primaryTimeout);
      } catch (err) {
        if (isUnknownMemberError(err)) {
          markNegativeCache(uid);
          return null;
        }
        if (!isMemberFetchTimeoutError(err)) throw err;
        markNegativeCache(uid);
        logMemberFetchTimeout(uid, 1, primaryTimeout);
        if (doRetry) {
          const retryMs = Math.max(primaryTimeout, WEBSITE_MEMBER_FETCH_RETRY_TIMEOUT_MS);
          member = await fetchMemberOnce(guild, uid, false, retryMs).catch((err2) => {
            if (isUnknownMemberError(err2)) return null;
            if (isMemberFetchTimeoutError(err2)) {
              markNegativeCache(uid);
              logMemberFetchTimeout(uid, 2, retryMs);
              return null;
            }
            throw err2;
          });
        }
      }
      if (!member) {
        member = guild.members?.cache?.get?.(uid) || readCachedWebsiteMember(uid) || null;
      }
      if (member) {
        writeCachedWebsiteMember(uid, member);
        return member;
      }
      // Timeout / miss: null (niente throw → niente retry a cascata dai caller).
      return null;
    } finally {
      websiteMemberFetchInflight.delete(inflightKey);
    }
  })();

  websiteMemberFetchInflight.set(inflightKey, promise);
  return promise;
}

module.exports = {
  WEBSITE_MEMBER_FETCH_TIMEOUT_MS,
  WEBSITE_MEMBER_CACHE_TTL_MS,
  WEBSITE_MEMBER_NEGATIVE_CACHE_TTL_MS,
  readCachedWebsiteMember,
  writeCachedWebsiteMember,
  ensureWebsiteGuild,
  fetchWebsiteGuildMember,
  isUnknownMemberError,
  isOnNegativeCache,
};
