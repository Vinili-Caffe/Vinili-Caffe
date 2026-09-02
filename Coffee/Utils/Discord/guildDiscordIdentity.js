function resolveUserFromLike(userLike) {
  return userLike?.user || userLike || null;
}

function guildIconUrl(guild, { size = 256 } = {}) {
  if (!guild?.icon) return null;
  const animated = String(guild.icon).startsWith("a_");
  return (
    guild.iconURL({
      size,
      extension: animated ? "gif" : "png",
      forceStatic: animated ? false : true,
    }) || null
  );
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

function guildMemberServerAvatarUrlDynamic(memberLike, { size = 256 } = {}) {
  if (!memberLike?.guild || memberLike.avatar == null || memberLike.avatar === "") return null;
  const animated = String(memberLike.avatar).startsWith("a_");
  if (typeof memberLike.avatarURL === "function") {
    return memberLike.avatarURL({ size, extension: animated ? "gif" : "png", forceStatic: false }) || null;
  }
  if (typeof memberLike.displayAvatarURL === "function") {
    return memberLike.displayAvatarURL({ size, extension: animated ? "webp" : "png", forceStatic: false }) || null;
  }
  return null;
}

function userGlobalAvatarUrlDynamic(userLike, { size = 256 } = {}) {
  const user = resolveUserFromLike(userLike);
  if (!user?.avatar || typeof user.displayAvatarURL !== "function") return null;
  const animated = String(user.avatar).startsWith("a_");
  return user.displayAvatarURL({ size, extension: animated ? "gif" : "webp", forceStatic: false }) || null;
}

function embedUserAvatarUrlDynamic(userLike, { size = 256 } = {}) {
  const server = guildMemberServerAvatarUrlDynamic(userLike, { size });
  if (server) return server;
  const global = userGlobalAvatarUrlDynamic(userLike, { size });
  if (global) return global;
  return discordDefaultAvatarUrl(userLike, { size });
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
  const staticUrl = guildMemberDisplayAvatarUrlStatic(userLike, { size });
  if (staticUrl) candidates.push(staticUrl);
  const server = guildMemberServerAvatarUrlDynamic(userLike, { size });
  const global = userGlobalAvatarUrlDynamic(userLike, { size });
  const fallback = discordDefaultAvatarUrl(userLike, { size });
  if (server) candidates.push(server);
  if (global && global !== server) candidates.push(global);
  candidates.push(fallback);
  for (const url of candidates) {
    if (await remoteImageUrlLoads(url)) return url;
  }
  return fallback;
}

function userAvatarUrlStatic(userLike, { size = 256 } = {}) {
  const user = resolveUserFromLike(userLike);
  if (!user || typeof user.displayAvatarURL !== "function") return null;
  return user.displayAvatarURL({ size, extension: "png", forceStatic: true }) || null;
}

function guildMemberDisplayAvatarUrlStatic(memberLike, { size = 256 } = {}) {
  if (memberLike?.guild && memberLike.avatar != null && memberLike.avatar !== "") {
    if (typeof memberLike.avatarURL === "function") {
      return memberLike.avatarURL({ size, extension: "png", forceStatic: true }) || null;
    }
    if (typeof memberLike.displayAvatarURL === "function") {
      return memberLike.displayAvatarURL({ size, extension: "png", forceStatic: true }) || null;
    }
  }
  return userAvatarUrlStatic(memberLike, { size });
}

function embedThumbnailAvatarUrl(userLike, { size = 256 } = {}) {
  const staticUrl = guildMemberDisplayAvatarUrlStatic(userLike, { size });
  if (staticUrl) return staticUrl;
  const user = resolveUserFromLike(userLike);
  if (user?.displayAvatarURL) {
    const forced = user.displayAvatarURL({ size, extension: "png", forceStatic: true });
    if (forced) return forced;
  }
  return discordDefaultAvatarUrl(userLike, { size });
}

function userAvatarUrlDynamic(userLike, { size = 256 } = {}) {
  return embedUserAvatarUrlDynamic(userLike, { size });
}

function accountUsername(userLike) {
  const user = resolveUserFromLike(userLike);
  return String(user?.username || "Utente").trim() || "Utente";
}

module.exports = {
  guildIconUrl,
  discordDefaultAvatarUrl,
  guildMemberServerAvatarUrlDynamic,
  userGlobalAvatarUrlDynamic,
  embedUserAvatarUrlDynamic,
  embedThumbnailAvatarUrl,
  guildMemberDisplayAvatarUrlStatic,
  resolveEmbedUserAvatarUrl,
  userAvatarUrlDynamic,
  userAvatarUrlStatic,
  accountUsername,
};
