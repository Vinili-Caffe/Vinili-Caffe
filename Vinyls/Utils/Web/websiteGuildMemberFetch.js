const WEBSITE_MEMBER_FETCH_TIMEOUT_MS = 12_000;
const WEBSITE_MEMBER_FETCH_RETRY_TIMEOUT_MS = 18_000;
const WEBSITE_MEMBER_CACHE_TTL_MS = 120_000;
const WEBSITE_MEMBER_NEGATIVE_CACHE_TTL_MS = 90_000;
const WEBSITE_MEMBER_TIMEOUT_LOG_COOLDOWN_MS = 5 * 60 * 1000;
const WEBSITE_MEMBER_SOFT_TIMEOUT_LOG_MS = 2_000;
/* welcomePronounsFetchSoft1: max 1 warn globale / 3 min (altri ID non spammano) */
const WEBSITE_MEMBER_TIMEOUT_GLOBAL_COOLDOWN_MS = 3 * 60 * 1000;

const websiteMemberResolveCache = new Map();
const websiteMemberNegativeCache = new Map();
const memberFetchTimeoutLogAt = new Map();
const websiteMemberFetchInflight = new Map();
let memberFetchTimeoutGlobalLogAt = 0;

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

function clearNegativeWebsiteMember(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  websiteMemberNegativeCache.delete(uid);
}

function clearWebsiteMemberCaches(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  websiteMemberResolveCache.delete(uid);
  websiteMemberNegativeCache.delete(uid);
}

/** leaveProfileLive1: positive cache drop + negative mark so profile APIs treat as left. */
function markWebsiteMemberLeft(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  websiteMemberResolveCache.delete(uid);
  markNegativeCache(uid);
}

function isUnknownMemberError(err) {
  const code = Number(err?.code ?? err?.rawError?.code ?? 0);
  const msg = String(err?.message || err || "");
  return code === 10007 || /unknown member/i.test(msg);
}

function isMemberFetchTimeoutError(err) {
  return /member_fetch_timeout/i.test(String(err?.message || err || ""));
}

function logMemberFetchTimeout(uid, attempt, timeoutMs, { soft = false } = {}) {
  /* soft callers (welcome pronouns, UI) — timeout atteso sotto carico, no warn spam */
  if (soft) return;
  const ms = Number(timeoutMs) || 0;
  if (ms > 0 && ms <= WEBSITE_MEMBER_SOFT_TIMEOUT_LOG_MS) return;
  const now = Date.now();
  if (now - memberFetchTimeoutGlobalLogAt < WEBSITE_MEMBER_TIMEOUT_GLOBAL_COOLDOWN_MS) return;
  const prev = Number(memberFetchTimeoutLogAt.get(uid) || 0);
  if (now - prev < WEBSITE_MEMBER_TIMEOUT_LOG_COOLDOWN_MS) return;
  memberFetchTimeoutLogAt.set(uid, now);
  memberFetchTimeoutGlobalLogAt = now;
  pruneMapByExpiry(memberFetchTimeoutLogAt, now - WEBSITE_MEMBER_TIMEOUT_LOG_COOLDOWN_MS);
  global.logger?.warn?.(
    "[websiteGuildMemberFetch] member_fetch_timeout",
    `user=${uid}`,
    `attempt=${attempt}`,
    `timeoutMs=${ms || "?"}`,
  );
}

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

function shouldMarkNegativeOnMemberTimeout(_timeoutMs) {
  // staffFirstStamp1: Discord timeouts are transient. Poisoning the negative cache
  // made Riprova/peer-switch fail for ~90s after the first slow resolve.
  return false;
}

async function fetchMemberOnce(guild, uid, force, timeoutMs) {
  const fetchArg = force ? { user: uid, force: true } : uid;
  return withTimeout(guild.members.fetch(fetchArg), timeoutMs, "member_fetch");
}

async function fetchWebsiteGuildMember(guild, userId, options = {}) {
  const uid = String(userId || "").trim();
  if (!guild || !uid) return null;

  if (!options.force) {
    const cached = readCachedWebsiteMember(uid) || guild.members?.cache?.get?.(uid) || null;
    if (cached) return cached;
        if (isOnNegativeCache(uid)) return null;
  }

  const inflightKey = `${guild.id}:${uid}:${options.force ? "f" : "n"}`;
  const pending = websiteMemberFetchInflight.get(inflightKey);
  if (pending) return pending;

  const promise = (async () => {
    const requested = Number(options.timeoutMs);
    const hasExplicit = Number.isFinite(requested) && requested > 0;
        const primaryTimeout = hasExplicit
      ? Math.max(600, requested)
      : WEBSITE_MEMBER_FETCH_TIMEOUT_MS;
    const doRetry =
      options.retry === true || (!hasExplicit && options.retry !== false);
    const soft = Boolean(options.soft);
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
        if (!options.soft && shouldMarkNegativeOnMemberTimeout(primaryTimeout)) markNegativeCache(uid);
        logMemberFetchTimeout(uid, 1, primaryTimeout, { soft });
        if (doRetry) {
          const retryMs = Math.max(primaryTimeout, WEBSITE_MEMBER_FETCH_RETRY_TIMEOUT_MS);
          member = await fetchMemberOnce(guild, uid, false, retryMs).catch((err2) => {
            if (isUnknownMemberError(err2)) return null;
            if (isMemberFetchTimeoutError(err2)) {
              if (!options.soft && shouldMarkNegativeOnMemberTimeout(retryMs)) markNegativeCache(uid);
              logMemberFetchTimeout(uid, 2, retryMs, { soft });
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
  clearNegativeWebsiteMember,
  clearWebsiteMemberCaches,
  markWebsiteMemberLeft,
  ensureWebsiteGuild,
  fetchWebsiteGuildMember,
  isUnknownMemberError,
  isOnNegativeCache,
};
