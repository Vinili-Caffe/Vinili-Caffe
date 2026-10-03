"use strict";

const {
  discordDefaultAvatarUrl,
  guildMemberDisplayAvatarUrlForSite,
  memberDisplayName,
  normalizeDiscordCdnAvatarUrl,
  sitePreferredAvatarUrl,
  userGlobalAvatarUrlDynamic,
} = require("../Discord/guildDiscordIdentity");

function stabilizeDiscordCdnAvatarUrl(url, { size = 128 } = {}) {
  return normalizeDiscordCdnAvatarUrl(url, { size, preferAnimated: false });
}

function animatedDiscordCdnAvatarUrl(url, { size = 128 } = {}) {
  return normalizeDiscordCdnAvatarUrl(url, { size, preferAnimated: true });
}

function liveAvatarFromMember(member, { size = 128, preferAnimated = true, allowDefault = true } = {}) {
  if (!member) return "";
  /* avatarGlobalFirst1: globale prima del guild avatar (CDN guild spesso 404). */
  const preferred = sitePreferredAvatarUrl(member, { size, preferAnimated, allowDefault: false });
  if (preferred) {
    if (/cdn\.discordapp\.com\/embed\/avatars\//i.test(String(preferred))) {
      return allowDefault ? preferred : "";
    }
    return preferAnimated
      ? animatedDiscordCdnAvatarUrl(preferred, { size }) || preferred
      : stabilizeDiscordCdnAvatarUrl(preferred, { size }) || preferred;
  }
  const live = guildMemberDisplayAvatarUrlForSite(member, { size, preferAnimated, allowDefault });
  if (!live) return "";
  if (/cdn\.discordapp\.com\/embed\/avatars\//i.test(String(live))) {
    return allowDefault ? live : "";
  }
  return preferAnimated
    ? animatedDiscordCdnAvatarUrl(live, { size }) || live
    : stabilizeDiscordCdnAvatarUrl(live, { size }) || live;
}

function liveAvatarFromUser(user, { size = 128, preferAnimated = true, allowDefault = true } = {}) {
  if (!user) return "";
  const preferred = sitePreferredAvatarUrl(user, { size, preferAnimated, allowDefault: false });
  if (preferred) {
    if (/cdn\.discordapp\.com\/embed\/avatars\//i.test(String(preferred))) {
      return allowDefault ? preferred : "";
    }
    return preferAnimated
      ? animatedDiscordCdnAvatarUrl(preferred, { size }) || preferred
      : stabilizeDiscordCdnAvatarUrl(preferred, { size }) || preferred;
  }
  const live = guildMemberDisplayAvatarUrlForSite(user, { size, preferAnimated, allowDefault });
  if (!live) return "";
  if (/cdn\.discordapp\.com\/embed\/avatars\//i.test(String(live))) {
    return allowDefault ? live : "";
  }
  return preferAnimated
    ? animatedDiscordCdnAvatarUrl(live, { size }) || live
    : stabilizeDiscordCdnAvatarUrl(live, { size }) || live;
}

function resolveSiteAvatarUrl(guild, userId, storedUrl, { size = 128, preferAnimated = true, allowDefault = true } = {}) {
  const uid = String(userId || "").trim();
  const member = uid && guild?.members?.cache?.get?.(uid) ? guild.members.cache.get(uid) : null;
  const liveMember = liveAvatarFromMember(member, { size, preferAnimated, allowDefault });
  if (liveMember) return liveMember;
  if (member?.user) {
    const liveUser = liveAvatarFromUser(member.user, { size, preferAnimated, allowDefault });
    if (liveUser) return liveUser;
  }
  // feedbackAvatar2: member known in cache but no custom avatar → never reuse stale stored hashes (404 → blurple/onerror mess).
  if (member) {
    if (uid && allowDefault) return discordDefaultAvatarUrl({ id: uid }, { size });
    return "";
  }
  const storedRaw = String(storedUrl || "").trim();
  if (/cdn\.discordapp\.com\/embed\/avatars\//i.test(storedRaw)) {
    return allowDefault ? discordDefaultAvatarUrl({ id: uid }, { size }) : "";
  }
  /* avatarGlobalFirst1: stored guild URL senza member in cache → non fidarsi (spesso 404). */
  if (/\/guilds\/\d+\/users\//i.test(storedRaw)) {
    const globalOnly = userGlobalAvatarUrlDynamic(
      guild?.client?.users?.cache?.get?.(uid) || null,
      { size },
    );
    if (globalOnly) {
      return preferAnimated
        ? animatedDiscordCdnAvatarUrl(globalOnly, { size }) || globalOnly
        : stabilizeDiscordCdnAvatarUrl(globalOnly, { size }) || globalOnly;
    }
    return allowDefault ? discordDefaultAvatarUrl({ id: uid }, { size }) : "";
  }
  const stored = preferAnimated
    ? animatedDiscordCdnAvatarUrl(storedUrl, { size })
    : stabilizeDiscordCdnAvatarUrl(storedUrl, { size });
  if (stored) return stored;
  if (uid && allowDefault) return discordDefaultAvatarUrl({ id: uid }, { size });
  return "";
}

async function resolveSiteAvatarUrlAsync(
  guild,
  client,
  userId,
  storedUrl,
  { size = 128, preferAnimated = true, allowDefault = true } = {},
) {
  const uid = String(userId || "").trim();
  if (!uid) return "";

  let member = guild?.members?.cache?.get?.(uid) || null;
  if (!member && guild?.members?.fetch) {
    try {
      member = await guild.members.fetch(uid);
    } catch {
      member = null;
    }
  }
  const liveMember = liveAvatarFromMember(member, { size, preferAnimated, allowDefault });
  if (liveMember) return liveMember;

  let user = client?.users?.cache?.get?.(uid) || null;
  if (!user && client?.users?.fetch) {
    try {
      user = await client.users.fetch(uid, { force: false });
    } catch {
      user = null;
    }
  }
  const liveUser = liveAvatarFromUser(user, { size, preferAnimated, allowDefault });
  if (liveUser) return liveUser;

  // feedbackAvatar2: fetched member/user known without custom avatar → no stale stored hash.
  if (member || user) {
    return allowDefault ? discordDefaultAvatarUrl({ id: uid }, { size }) : "";
  }

  const storedRaw = String(storedUrl || "").trim();
  if (/cdn\.discordapp\.com\/embed\/avatars\//i.test(storedRaw)) {
    return allowDefault ? discordDefaultAvatarUrl({ id: uid }, { size }) : "";
  }
  const stored = preferAnimated
    ? animatedDiscordCdnAvatarUrl(storedUrl, { size })
    : stabilizeDiscordCdnAvatarUrl(storedUrl, { size });
  if (stored) {
    if (/\/guilds\/\d+\/users\//i.test(String(stored))) {
      return allowDefault ? discordDefaultAvatarUrl({ id: uid }, { size }) : "";
    }
    return stored;
  }
  return allowDefault ? discordDefaultAvatarUrl({ id: uid }, { size }) : "";
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

async function prefetchGuildMembersForIds(guild, userIds, { chunkSize = 40 } = {}) {
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
  // site-api REST client (e molti wrapper) non supportano fetch({ user: string[] }):
  // un array veniva String()-ificato in un id invalido e falliva in silenzio → username al posto del nick.
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    await Promise.all(chunk.map((id) => guild.members.fetch({ user: id }).catch(() => null)));
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
  const user =
    client?.users?.cache?.get?.(uid) || guild?.client?.users?.cache?.get?.(uid) || null;
  if (user) {
    const live =
      String(user.globalName || "").trim() || String(user.username || "").trim();
    if (live) return live;
  }
  return stored || "Utente";
}

function applyLiveAvatarToSuggestionLike(
  serialized,
  guild,
  { size = 128, preferAnimated = true, allowDefault = true, client = null } = {},
) {
  if (!serialized || typeof serialized !== "object") return serialized;
  const nameClient = client || guild?.client || null;
  serialized.authorAvatarUrl = resolveSiteAvatarUrl(guild, serialized.userId, serialized.authorAvatarUrl, {
    size,
    preferAnimated,
    allowDefault,
  });
  serialized.authorName = liveDisplayName(guild, nameClient, serialized.userId, serialized.authorName);
  if (serialized.staffAvatarUrl != null || serialized.staffUserId) {
    serialized.staffAvatarUrl = resolveSiteAvatarUrl(
      guild,
      serialized.staffUserId,
      serialized.staffAvatarUrl,
      { size, preferAnimated, allowDefault },
    );
    if (serialized.staffName != null || serialized.staffUserId) {
      serialized.staffName = liveDisplayName(
        guild,
        nameClient,
        serialized.staffUserId,
        serialized.staffName,
      );
    }
  }
  if (Array.isArray(serialized.comments)) {
    for (const c of serialized.comments) {
      if (!c) continue;
      c.authorAvatarUrl = resolveSiteAvatarUrl(guild, c.userId, c.authorAvatarUrl, {
        size,
        preferAnimated,
        allowDefault,
      });
      c.authorName = liveDisplayName(guild, nameClient, c.userId, c.authorName);
    }
  }
  return serialized;
}

async function applyLiveAvatarToSuggestionLikeAsync(
  serialized,
  guild,
  client,
  { size = 128, preferAnimated = true, allowDefault = true } = {},
) {
  if (!serialized || typeof serialized !== "object") return serialized;
  serialized.authorAvatarUrl = await resolveSiteAvatarUrlAsync(
    guild,
    client,
    serialized.userId,
    serialized.authorAvatarUrl,
    { size, preferAnimated, allowDefault },
  );
  serialized.authorName = liveDisplayName(guild, client, serialized.userId, serialized.authorName);
  if (serialized.staffAvatarUrl != null || serialized.staffUserId) {
    serialized.staffAvatarUrl = await resolveSiteAvatarUrlAsync(
      guild,
      client,
      serialized.staffUserId,
      serialized.staffAvatarUrl,
      { size, preferAnimated, allowDefault },
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
        allowDefault,
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
