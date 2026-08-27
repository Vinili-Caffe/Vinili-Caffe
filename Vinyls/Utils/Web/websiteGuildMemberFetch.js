const WEBSITE_MEMBER_FETCH_TIMEOUT_MS = 12_000;
const WEBSITE_MEMBER_FETCH_RETRY_TIMEOUT_MS = 18_000;
const WEBSITE_MEMBER_CACHE_TTL_MS = 120_000;

/** @type {Map<string, { expires: number, member: object }>} */
const websiteMemberResolveCache = new Map();
/** @type {Map<string, Promise<object|null>>} */
const websiteMemberFetchInflight = new Map();
let lastMemberFetchTimeoutLogAt = 0;

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
}

function isUnknownMemberError(err) {
  const code = Number(err?.code ?? err?.rawError?.code ?? 0);
  const msg = String(err?.message || err || "");
  return code === 10007 || /unknown member/i.test(msg);
}

function isMemberFetchTimeoutError(err) {
  return /member_fetch_timeout/i.test(String(err?.message || err || ""));
}

function logMemberFetchTimeout(uid, attempt) {
  const now = Date.now();
  // Evita spam: al massimo 1 riga ogni 20s.
  if (now - lastMemberFetchTimeoutLogAt < 20_000) return;
  lastMemberFetchTimeoutLogAt = now;
  global.logger?.warn?.(
    "[websiteGuildMemberFetch] member_fetch_timeout",
    `user=${uid}`,
    `attempt=${attempt}`,
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
 * Timeout Discord: 1 retry con budget più alto, poi riusa cache guild se presente.
 * @param {import("discord.js").Guild} guild
 * @param {string} userId
 * @param {{ force?: boolean, timeoutMs?: number }} [options]
 */
async function fetchWebsiteGuildMember(guild, userId, options = {}) {
  const uid = String(userId || "").trim();
  if (!guild || !uid) return null;

  if (!options.force) {
    const cached = readCachedWebsiteMember(uid) || guild.members?.cache?.get?.(uid) || null;
    if (cached) return cached;
  }

  const inflightKey = `${guild.id}:${uid}:${options.force ? "f" : "n"}`;
  const pending = websiteMemberFetchInflight.get(inflightKey);
  if (pending) return pending;

  const promise = (async () => {
    const primaryTimeout = Math.max(4000, Number(options.timeoutMs) || WEBSITE_MEMBER_FETCH_TIMEOUT_MS);
    try {
      let member = null;
      try {
        member = await fetchMemberOnce(guild, uid, Boolean(options.force), primaryTimeout);
      } catch (err) {
        if (isUnknownMemberError(err)) return null;
        if (!isMemberFetchTimeoutError(err)) throw err;
        logMemberFetchTimeout(uid, 1);
        // Retry soft (senza force) anche se il primo era force: meno carico Discord.
        member = await fetchMemberOnce(
          guild,
          uid,
          false,
          Math.max(primaryTimeout, WEBSITE_MEMBER_FETCH_RETRY_TIMEOUT_MS),
        ).catch((err2) => {
          if (isUnknownMemberError(err2)) return null;
          if (isMemberFetchTimeoutError(err2)) {
            logMemberFetchTimeout(uid, 2);
            return null;
          }
          throw err2;
        });
      }
      if (!member) {
        member = guild.members?.cache?.get?.(uid) || readCachedWebsiteMember(uid) || null;
      }
      if (member) writeCachedWebsiteMember(uid, member);
      if (!member) {
        throw new Error("member_fetch_timeout");
      }
      return member;
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
  readCachedWebsiteMember,
  writeCachedWebsiteMember,
  ensureWebsiteGuild,
  fetchWebsiteGuildMember,
  isUnknownMemberError,
};
