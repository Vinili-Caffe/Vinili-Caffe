"use strict";

const {
  discordDefaultAvatarUrl,
  guildMemberDisplayAvatarUrlDynamic,
  guildMemberDisplayAvatarUrlStatic,
} = require("../Discord/guildDiscordIdentity");

/**
 * Preferisci PNG statico sul sito: i GIF Discord si ri-decodificano a ogni re-render
 * (poll/WS) e “flashano”; gli hash vecchi salvati in Mongo spesso 404.
 */

function stabilizeDiscordCdnAvatarUrl(url, { size = 128 } = {}) {
  let u = String(url || "").trim();
  if (!u) return "";
  // Avatar utente: forza estensione statica.
  u = u.replace(
    /^(https:\/\/cdn\.discordapp\.com\/avatars\/\d+\/(?:a_)?[a-f0-9]+)\.(?:gif|webp|jpg|jpeg)(\?.*)?$/i,
    (_, base, q) => `${base}.png${q || ""}`,
  );
  if (/^https:\/\/cdn\.discordapp\.com\/avatars\//i.test(u)) {
    if (/[?&]size=\d+/i.test(u)) {
      u = u.replace(/([?&]size=)\d+/i, `$1${size}`);
    } else {
      u += (u.includes("?") ? "&" : "?") + `size=${size}`;
    }
  }
  return u;
}

function resolveSiteAvatarUrl(guild, userId, storedUrl, { size = 128 } = {}) {
  const uid = String(userId || "").trim();
  const member = uid && guild?.members?.cache?.get?.(uid) ? guild.members.cache.get(uid) : null;
  if (member) {
    const live =
      guildMemberDisplayAvatarUrlStatic(member, { size }) ||
      guildMemberDisplayAvatarUrlDynamic(member, { size }) ||
      "";
    if (live) return stabilizeDiscordCdnAvatarUrl(live, { size }) || live;
  }
  const stabilized = stabilizeDiscordCdnAvatarUrl(storedUrl, { size });
  if (stabilized) return stabilized;
  if (uid) return discordDefaultAvatarUrl({ id: uid }, { size });
  return "";
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

function applyLiveAvatarToSuggestionLike(serialized, guild, { size = 128 } = {}) {
  if (!serialized || typeof serialized !== "object") return serialized;
  serialized.authorAvatarUrl = resolveSiteAvatarUrl(guild, serialized.userId, serialized.authorAvatarUrl, { size });
  if (serialized.staffAvatarUrl != null || serialized.staffUserId) {
    serialized.staffAvatarUrl = resolveSiteAvatarUrl(
      guild,
      serialized.staffUserId,
      serialized.staffAvatarUrl,
      { size },
    );
  }
  if (Array.isArray(serialized.comments)) {
    for (const c of serialized.comments) {
      if (!c) continue;
      c.authorAvatarUrl = resolveSiteAvatarUrl(guild, c.userId, c.authorAvatarUrl, { size });
    }
  }
  return serialized;
}

module.exports = {
  stabilizeDiscordCdnAvatarUrl,
  resolveSiteAvatarUrl,
  prefetchGuildMembersForIds,
  collectUserIdsFromSuggestionLikeDocs,
  applyLiveAvatarToSuggestionLike,
};
