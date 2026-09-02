"use strict";

const {
  discordDefaultAvatarUrl,
  guildMemberDisplayAvatarUrlForSite,
  memberDisplayName,
  normalizeDiscordCdnAvatarUrl,
} = require("../Discord/guildDiscordIdentity");

function stabilizeDiscordCdnAvatarUrl(url, { size = 128 } = {}) {
  return normalizeDiscordCdnAvatarUrl(url, { size, preferAnimated: false });
}

function animatedDiscordCdnAvatarUrl(url, { size = 128 } = {}) {
  return normalizeDiscordCdnAvatarUrl(url, { size, preferAnimated: true });
}

function liveAvatarFromMember(member, { size = 128, preferAnimated = true } = {}) {
  if (!member) return "";
  const live = guildMemberDisplayAvatarUrlForSite(member, { size, preferAnimated });
  if (!live) return "";
  return preferAnimated
    ? animatedDiscordCdnAvatarUrl(live, { size }) || live
    : stabilizeDiscordCdnAvatarUrl(live, { size }) || live;
}

function liveAvatarFromUser(user, { size = 128, preferAnimated = true } = {}) {
  if (!user) return "";
  const live = guildMemberDisplayAvatarUrlForSite(user, { size, preferAnimated });
  if (!live) return "";
  return preferAnimated
    ? animatedDiscordCdnAvatarUrl(live, { size }) || live
    : stabilizeDiscordCdnAvatarUrl(live, { size }) || live;
}

function resolveSiteAvatarUrl(guild, userId, storedUrl, { size = 128, preferAnimated = true } = {}) {
  const uid = String(userId || "").trim();
  const member = uid && guild?.members?.cache?.get?.(uid) ? guild.members.cache.get(uid) : null;
  const liveMember = liveAvatarFromMember(member, { size, preferAnimated });
  if (liveMember) return liveMember;
  const stored = preferAnimated
    ? animatedDiscordCdnAvatarUrl(storedUrl, { size })
    : stabilizeDiscordCdnAvatarUrl(storedUrl, { size });
  if (stored) return stored;
  if (uid) return discordDefaultAvatarUrl({ id: uid }, { size });
  return "";
}

async function resolveSiteAvatarUrlAsync(guild, client, userId, storedUrl, { size = 128, preferAnimated = true } = {}) {
  const uid = String(userId || "").trim();
  if (!uid) return "";

  const member = guild?.members?.cache?.get?.(uid) || null;
  const liveMember = liveAvatarFromMember(member, { size, preferAnimated });
  if (liveMember) return liveMember;

  const user = client?.users?.cache?.get?.(uid) || null;
  const liveUser = liveAvatarFromUser(user, { size, preferAnimated });
  if (liveUser) return liveUser;

  const stored = preferAnimated
    ? animatedDiscordCdnAvatarUrl(storedUrl, { size })
    : stabilizeDiscordCdnAvatarUrl(storedUrl, { size });
  if (stored) return stored;
  return discordDefaultAvatarUrl({ id: uid }, { size });
}

async function prefetchUsersForIds(client, userIds, { chunkSize = 50 } = {}) {
  if (!client?.users?.fetch) return;
  const ids = [
    ...new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((x) => String(x || "").trim())
        .filter((id) => /^\d{5,24}$/.test(id)),
    ),
  ];
  const missing = ids.filter((id) => !client.users.cache.has(id));
  if (!missing.length) return;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map((id) => client.users.fetch(id, { force: false }).catch(() => null)),
    );
  }
}

async function prefetchGuildMembersForIds(guild, userIds, { chunkSize = 100 } = {}) {
  if (!guild?.members?.fetch) return;
  const ids = [
    ...new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((x) => String(x || "").trim())
        .filter((id) => /^\d{5,24}$/.test(id)),
    ),
  ];
  const missing = ids.filter((id) => !guild.members.cache.has(id));
  if (!missing.length) return;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    await guild.members.fetch({ user: chunk }).catch(() => null);
  }
}

function collectUserIdsFromSuggestionLikeDocs(docs) {
  const out = [];
  for (const d of Array.isArray(docs) ? docs : []) {
    if (d?.userId) out.push(d.userId);
    if (d?.staffUserId) out.push(d.staffUserId);
    for (const c of Array.isArray(d?.comments) ? d.comments : []) {
      if (c?.userId) out.push(c.userId);
    }
  }
  return out;
}

function liveDisplayName(guild, client, userId, storedName) {
  const uid = String(userId || "").trim();
  const stored = String(storedName || "").trim();
  if (!uid) return stored || "Utente";
  const member = guild?.members?.cache?.get?.(uid) || null;
  if (member) {
    const live = String(memberDisplayName(member) || "").trim();
    if (live) return live;
  }
  const user = client?.users?.cache?.get?.(uid) || null;
  if (user) {
    const live =
      String(user.globalName || "").trim() || String(user.username || "").trim();
    if (live) return live;
  }
  return stored || "Utente";
}

function applyLiveAvatarToSuggestionLike(serialized, guild, { size = 128, preferAnimated = true } = {}) {
  if (!serialized || typeof serialized !== "object") return serialized;
  serialized.authorAvatarUrl = resolveSiteAvatarUrl(guild, serialized.userId, serialized.authorAvatarUrl, {
    size,
    preferAnimated,
  });
  serialized.authorName = liveDisplayName(guild, null, serialized.userId, serialized.authorName);
  if (serialized.staffAvatarUrl != null || serialized.staffUserId) {
    serialized.staffAvatarUrl = resolveSiteAvatarUrl(
      guild,
      serialized.staffUserId,
      serialized.staffAvatarUrl,
      { size, preferAnimated },
    );
    if (serialized.staffName != null || serialized.staffUserId) {
      serialized.staffName = liveDisplayName(guild, null, serialized.staffUserId, serialized.staffName);
    }
  }
  if (Array.isArray(serialized.comments)) {
    for (const c of serialized.comments) {
      if (!c) continue;
      c.authorAvatarUrl = resolveSiteAvatarUrl(guild, c.userId, c.authorAvatarUrl, { size, preferAnimated });
      c.authorName = liveDisplayName(guild, null, c.userId, c.authorName);
    }
  }
  return serialized;
}

async function applyLiveAvatarToSuggestionLikeAsync(serialized, guild, client, { size = 128, preferAnimated = true } = {}) {
  if (!serialized || typeof serialized !== "object") return serialized;
  serialized.authorAvatarUrl = await resolveSiteAvatarUrlAsync(
    guild,
    client,
    serialized.userId,
    serialized.authorAvatarUrl,
    { size, preferAnimated },
  );
  serialized.authorName = liveDisplayName(guild, client, serialized.userId, serialized.authorName);
  if (serialized.staffAvatarUrl != null || serialized.staffUserId) {
    serialized.staffAvatarUrl = await resolveSiteAvatarUrlAsync(
      guild,
      client,
      serialized.staffUserId,
      serialized.staffAvatarUrl,
      { size, preferAnimated },
    );
    if (serialized.staffName != null || serialized.staffUserId) {
      serialized.staffName = liveDisplayName(guild, client, serialized.staffUserId, serialized.staffName);
    }
  }
  if (Array.isArray(serialized.comments)) {
    for (const c of serialized.comments) {
      if (!c) continue;
      c.authorAvatarUrl = await resolveSiteAvatarUrlAsync(guild, client, c.userId, c.authorAvatarUrl, {
        size,
        preferAnimated,
      });
      c.authorName = liveDisplayName(guild, client, c.userId, c.authorName);
    }
  }
  return serialized;
}

module.exports = {
  stabilizeDiscordCdnAvatarUrl,
  animatedDiscordCdnAvatarUrl,
  resolveSiteAvatarUrl,
  resolveSiteAvatarUrlAsync,
  prefetchGuildMembersForIds,
  prefetchUsersForIds,
  collectUserIdsFromSuggestionLikeDocs,
  applyLiveAvatarToSuggestionLike,
  applyLiveAvatarToSuggestionLikeAsync,
};
