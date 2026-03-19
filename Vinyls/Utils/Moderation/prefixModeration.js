const { getGuildMemberCached } = require("../Interaction/interactionEntityCache");
const memberCache = new Map();
const CACHE_TTL_MS = 30 * 1000;

function getCacheKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function getCachedMember(guildId, userId) {
  const key = getCacheKey(guildId, userId);
  const entry = memberCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    memberCache.delete(key);
    return null;
  }
  return entry.member;
}

function setCachedMember(guildId, userId, member) {
  const key = getCacheKey(guildId, userId);
  memberCache.set(key, { member, ts: Date.now() });
}

async function fetchMemberSafe(guild, userId) {
  if (!guild || !userId) return null;
  const cached = getCachedMember(guild.id, userId);
  if (cached) return cached;
  const member = await getGuildMemberCached(guild, userId);
  if (member) setCachedMember(guild.id, userId, member);
  return member;
}

async function fetchMembersSafe(guild, userIds) {
  if (!guild || !Array.isArray(userIds) || userIds.length === 0)
    return new Map();
  const result = new Map();
  const missing = [];
  for (const id of userIds) {
    const cached = getCachedMember(guild.id, id);
    if (cached) {
      result.set(id, cached);
    } else {
      missing.push(id);
    }
  }
  if (missing.length > 0) {
    const fetched=await guild.members.fetch({user:missing}).catch(() => null);
    if (fetched) {
      for (const [id, member] of fetched.entries()) {
        result.set(id, member);
        setCachedMember(guild.id, id, member);
      }
    }
  }
  return result;
}

function extractUserId(raw, message) {
  const mention = message.mentions?.users?.first();
  if (mention) return mention.id;
  if (!raw) return null;
  const token = String(raw).trim();
  const match = token.match(/^<@!?(\d+)>$/);
  if (match) return match[1];
  if (/^\d{17,20}$/.test(token)) return token;
  return null;
}

function normalizeUserLookupToken(raw) {
  return String(raw || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function matchesUserToken(member, token) {
  if (!member || !token) return false;
  const user = member.user;
  const username = String(user?.username || "").toLowerCase();
  const globalName = String(user?.globalName || "").toLowerCase();
  const displayName = String(member?.displayName || "").toLowerCase();
  const tag = String(user?.tag || "").toLowerCase();
  return (
    username === token ||
    globalName === token ||
    displayName === token ||
    tag === token
  );
}

async function resolveUserIdByName(guild, raw) {
  if (!guild || !raw) return null;
  const token = normalizeUserLookupToken(raw);
  if (!token) return null;

  const fromCache = guild.members.cache.find((member) =>
    matchesUserToken(member, token),
  );
  if (fromCache?.id) return String(fromCache.id);

  const fetchedChunk = await guild.members
    .fetch({ query: token, limit: 20 })
    .catch(() => null);
  if (fetchedChunk?.size) {
    const fromFetched = fetchedChunk.find((member) =>
      matchesUserToken(member, token),
    );
    if (fromFetched?.id) return String(fromFetched.id);
    const first = fetchedChunk.first();
    if (first?.id) return String(first.id);
  }

  const searched = await guild.members.search({ query: token, limit: 20 }).catch(() => null);
  if (searched?.size) {
    const fromSearch = searched.find((member) => matchesUserToken(member, token));
    if (fromSearch?.id) return String(fromSearch.id);
    const first = searched.first();
    if (first?.id) return String(first.id);
  }
  return null;
}

async function resolveTarget(message, args, index = 0) {
  const raw = args?.[index];
  let userId = extractUserId(raw, message);
  if (!userId && raw) {
    userId = await resolveUserIdByName(message.guild, raw);
  }
  if (!userId) return { user: null, member: null, userId: null };
  const user = await message.client.users.fetch(userId).catch(() => null);
  const member = user ? await fetchMemberSafe(message.guild, user.id) : null;
  return { user, member, userId };
}

function getReason(args, startIndex) {
  const reason=Array.isArray(args)?args.slice(startIndex).join(" ").trim():"";
  return reason || "Nessun motivo fornito";
}

module.exports = { fetchMemberSafe, fetchMembersSafe, extractUserId, resolveTarget, getReason };