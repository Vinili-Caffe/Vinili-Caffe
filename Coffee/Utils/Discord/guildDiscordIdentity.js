/**
 * Identità Discord allineata al sito (Coffee):
 * - Nome: nickname (server) → globalName → username
 * - Avatar: foto server (GIF se a_) → avatar globale (GIF se a_) → default
 */

function resolveUserFromLike(userLike) {
  return userLike?.user || userLike || null;
}

function guildIconUrlFromCdn(guild, size = 256) {
  const icon = String(guild?.icon || "").trim();
  const guildId = String(guild?.id || "").trim();
  if (!icon || !/^\d{16,22}$/.test(guildId)) return null;
  const animated = icon.startsWith("a_");
  const ext = animated ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${ext}?size=${size}`;
}

function guildIconUrl(guild, { size = 256 } = {}) {
  if (!guild) return null;
  if (typeof guild.iconURL === "function") {
    try {
      if (!guild.icon) return null;
      const animated = String(guild.icon).startsWith("a_");
      const fromMethod =
        guild.iconURL({
          size,
          extension: animated ? "gif" : "png",
          forceStatic: animated ? false : true,
        }) || null;
      if (fromMethod) return fromMethod;
    } catch (_) {}
  }
  if (typeof guild.iconURL === "string" && /^https?:\/\//i.test(guild.iconURL)) {
    return guild.iconURL;
  }
  return guildIconUrlFromCdn(guild, size);
}

function discordDefaultAvatarUrl(userLike, { size = 256 } = {}) {
  const user = resolveUserFromLike(userLike);
  if (user?.defaultAvatarURL && typeof user.defaultAvatarURL === "function") {
    return (
      user.defaultAvatarURL({ size, extension: "png", forceStatic: true }) ||
      `https://cdn.discordapp.com/embed/avatars/0.png?size=${size}`
    );
  }
  const uid = String(user?.id || "").trim();
  let index = 0;
  if (/^\d{16,22}$/.test(uid)) {
    try {
      index = Number((BigInt(uid) >> 22n) % 6n);
    } catch {
      index = 0;
    }
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png?size=${size}`;
}

function resolveGuildIdFromMemberLike(memberLike) {
  const fromGuild = String(memberLike?.guild?.id || memberLike?.guildId || "").trim();
  if (/^\d{16,22}$/.test(fromGuild)) return fromGuild;
  try {
    const IDs = require("../Config/ids");
    const main = String(IDs?.guilds?.main || "").trim();
    if (/^\d{16,22}$/.test(main)) return main;
  } catch (_) {}
  return "";
}

function resolveUserIdFromMemberLike(memberLike) {
  const id = String(memberLike?.id || memberLike?.user?.id || memberLike?.userId || "").trim();
  if (/^\d{16,22}$/.test(id)) return id;
  return "";
}

function guildMemberServerAvatarCdnUrl(memberLike, { size = 256, forceStatic = false } = {}) {
  const hash = String(memberLike?.avatar || "").trim();
  if (!hash) return null;
  const guildId = resolveGuildIdFromMemberLike(memberLike);
  const userId = resolveUserIdFromMemberLike(memberLike);
  if (!guildId || !userId) return null;
  const animated = !forceStatic && hash.startsWith("a_");
  const ext = animated ? "gif" : "png";
  return `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/${hash}.${ext}?size=${size}`;
}

function guildMemberServerAvatarUrlDynamic(memberLike, { size = 256 } = {}) {
  if (memberLike?.avatar == null || memberLike.avatar === "") return null;
  const animated = String(memberLike.avatar).startsWith("a_");
  if (typeof memberLike.avatarURL === "function") {
    try {
      const fromMethod =
        memberLike.avatarURL({
          size,
          extension: animated ? "gif" : "png",
          forceStatic: false,
        }) || null;
      if (fromMethod && /\/guilds\/\d+\/users\//i.test(String(fromMethod))) return fromMethod;
    } catch (_) {}
  }
  return guildMemberServerAvatarCdnUrl(memberLike, { size, forceStatic: false });
}

function userGlobalAvatarUrlDynamic(userLike, { size = 256 } = {}) {
  const user = resolveUserFromLike(userLike);
  if (!user?.avatar || typeof user.displayAvatarURL !== "function") return null;
  const animated = String(user.avatar).startsWith("a_");
  return (
    user.displayAvatarURL({
      size,
      extension: animated ? "gif" : "png",
      forceStatic: false,
    }) || null
  );
}

function isDiscordAvatarHashAnimated(hash) {
  return String(hash || "").trim().startsWith("a_");
}

function normalizeDiscordCdnAvatarUrl(url, { size = 256, preferAnimated = false } = {}) {
  let u = String(url || "").trim();
  if (!u) return "";
  const animatedHash = /\/a_[a-f0-9]+\./i.test(u);
  if (preferAnimated && animatedHash) {
    u = u.replace(/\.(png|webp|jpg|jpeg)(\?|$)/i, ".gif$2");
  } else if (!preferAnimated) {
    u = u.replace(
      /^(https:\/\/cdn\.discordapp\.com\/(?:avatars\/\d+\/(?:a_)?[a-f0-9]+|guilds\/\d+\/users\/\d+\/avatars\/(?:a_)?[a-f0-9]+))\.(?:gif|webp|jpg|jpeg)(\?.*)?$/i,
      (_, base, q) => `${base}.png${q || ""}`,
    );
  }
  if (/^https:\/\/cdn\.discordapp\.com\/(?:avatars|guilds)\//i.test(u)) {
    if (/[?&]size=\d+/i.test(u)) {
      u = u.replace(/([?&]size=)\d+/i, `$1${size}`);
    } else {
      u += (u.includes("?") ? "&" : "?") + `size=${size}`;
    }
  }
  return u;
}

function guildMemberDisplayAvatarUrlForSite(memberLike, { size = 128, preferAnimated = true } = {}) {
  if (preferAnimated) {
    const server = guildMemberServerAvatarUrlDynamic(memberLike, { size });
    if (server) return server;
    const global = userGlobalAvatarUrlDynamic(memberLike, { size });
    if (global) return global;
  }
  const staticServer = guildMemberDisplayAvatarUrlStatic(memberLike, { size });
  if (staticServer) return staticServer;
  const staticGlobal = userAvatarUrlStatic(memberLike, { size });
  if (staticGlobal) return staticGlobal;
  return discordDefaultAvatarUrl(memberLike, { size });
}

function guildMemberDisplayAvatarUrlStatic(memberLike, { size = 256 } = {}) {
  if (memberLike?.avatar != null && memberLike.avatar !== "") {
    if (typeof memberLike.avatarURL === "function") {
      try {
        const fromMethod =
          memberLike.avatarURL({ size, extension: "png", forceStatic: true }) || null;
        if (fromMethod && /\/guilds\/\d+\/users\//i.test(String(fromMethod))) return fromMethod;
      } catch (_) {}
    }
    const cdn = guildMemberServerAvatarCdnUrl(memberLike, { size, forceStatic: true });
    if (cdn) return cdn;
  }
  return userAvatarUrlStatic(memberLike, { size });
}

function userAvatarUrlStatic(userLike, { size = 256 } = {}) {
  const user = resolveUserFromLike(userLike);
  if (!user || typeof user.displayAvatarURL !== "function") return null;
  return user.displayAvatarURL({ size, extension: "png", forceStatic: true }) || null;
}

function userAvatarUrlDynamic(userLike, { size = 256 } = {}) {
  return guildMemberDisplayAvatarUrlForSite(userLike, { size, preferAnimated: true });
}

function guildMemberDisplayAvatarUrlDynamic(memberLike, { size = 256 } = {}) {
  return guildMemberDisplayAvatarUrlForSite(memberLike, { size, preferAnimated: true });
}

function embedUserAvatarUrlDynamic(userLike, { size = 256 } = {}) {
  return guildMemberDisplayAvatarUrlForSite(userLike, { size, preferAnimated: true });
}

function embedThumbnailAvatarUrl(userLike, { size = 256 } = {}) {
  return guildMemberDisplayAvatarUrlForSite(userLike, { size, preferAnimated: true });
}

async function remoteImageUrlLoads(url) {
  const u = String(url || "").trim();
  if (!/^https:\/\//i.test(u)) return false;
  try {
    let res = await fetch(u, { method: "HEAD", signal: AbortSignal.timeout(4000) });
    if (res.status === 405 || res.status === 501 || res.status === 403) {
      res = await fetch(u, {
        method: "GET",
        signal: AbortSignal.timeout(4000),
        headers: { Range: "bytes=0-0" },
      });
    }
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveEmbedUserAvatarUrl(userLike, { size = 256 } = {}) {
  const candidates = [];
  const server = guildMemberServerAvatarUrlDynamic(userLike, { size });
  const global = userGlobalAvatarUrlDynamic(userLike, { size });
  const fallback = discordDefaultAvatarUrl(userLike, { size });
  if (server) candidates.push(server);
  if (global && global !== server) candidates.push(global);
  const staticServer = guildMemberDisplayAvatarUrlStatic(userLike, { size });
  if (staticServer) candidates.push(staticServer);
  const staticGlobal = userAvatarUrlStatic(userLike, { size });
  if (staticGlobal) candidates.push(staticGlobal);
  candidates.push(fallback);
  const seen = new Set();
  for (const url of candidates) {
    const u = String(url || "").trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    if (await remoteImageUrlLoads(u)) return u;
  }
  return fallback;
}

function accountUsername(userLike) {
  const user = resolveUserFromLike(userLike);
  return String(user?.username || "Utente").trim() || "Utente";
}

function memberDisplayName(memberLike, fallbackUser) {
  const nick = String(memberLike?.nickname || "").trim();
  if (nick) return nick;
  if (memberLike && memberLike.user && typeof memberLike.displayName === "string") {
    const dn = String(memberLike.displayName || "").trim();
    if (dn) return dn;
  }
  const user = resolveUserFromLike(memberLike) || resolveUserFromLike(fallbackUser);
  const global = String(user?.globalName || user?.displayName || "").trim();
  if (global) return global;
  return accountUsername(user);
}

function memberLabelWithUsername(memberLike, fallbackUser) {
  const primary = memberDisplayName(memberLike, fallbackUser);
  const uname = accountUsername(memberLike || fallbackUser);
  if (!primary) return uname || "Utente";
  if (!uname || primary.toLowerCase() === uname.toLowerCase()) return primary;
  return `${primary} (@${uname})`;
}

function guildFirstThumbnailUrl(guild, userLike, { size = 256 } = {}) {
  return guildIconUrl(guild, { size }) || embedUserAvatarUrlDynamic(userLike, { size });
}

module.exports = {
  guildIconUrl,
  discordDefaultAvatarUrl,
  isDiscordAvatarHashAnimated,
  normalizeDiscordCdnAvatarUrl,
  guildMemberDisplayAvatarUrlForSite,
  guildMemberServerAvatarUrlDynamic,
  userGlobalAvatarUrlDynamic,
  embedUserAvatarUrlDynamic,
  embedThumbnailAvatarUrl,
  resolveEmbedUserAvatarUrl,
  userAvatarUrlDynamic,
  userAvatarUrlStatic,
  guildMemberDisplayAvatarUrlDynamic,
  guildMemberDisplayAvatarUrlStatic,
  accountUsername,
  memberDisplayName,
  memberLabelWithUsername,
  guildFirstThumbnailUrl,
};
