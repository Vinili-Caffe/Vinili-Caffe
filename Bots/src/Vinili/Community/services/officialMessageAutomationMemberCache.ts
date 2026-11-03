const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const MEMBER_FETCH_CACHE_TTL_MS = 15_000;
const memberFetchCache = new Map();

async function getCachedOrFetchMember(guild?, userId?) {
  if (!guild || !userId) return null;
  const cachedMember = guild.members.cache.get(userId);
  if (cachedMember) return cachedMember;

  const cacheKey = `${String(guild.id)}:${String(userId)}`;
  const now = Date.now();
  const cached = memberFetchCache.get(cacheKey);
  if (cached?.member && now < Number(cached.expiresAt || 0)) {
    return cached.member;
  }
  if (cached?.promise) {
    return cached.promise;
  }

  const promise = getGuildMemberCached(guild, userId);
  memberFetchCache.set(cacheKey, { member: null, expiresAt: 0, promise });
  const member = await promise;
  memberFetchCache.set(cacheKey, {
    member,
    expiresAt: Date.now() + MEMBER_FETCH_CACHE_TTL_MS,
    promise: null,
  });
  return member;
}

export = { getCachedOrFetchMember };
