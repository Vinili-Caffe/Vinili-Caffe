/**
 * Identità visiva coerente sul server: icona guild (anche animata), avatar utente dinamico,
 * nome account (`username`) senza nickname server.
 */

function resolveUserFromLike(userLike) {
  return userLike?.user || userLike || null;
}

/**
 * @param {import("discord.js").Guild|{ id?: string, icon?: string|null, iconURL?: Function|string }|null|undefined} guild
 * @param {{ size?: number }} [opts]
 * @returns {string|null}
 */
function guildIconUrlFromCdn(guild, size = 256) {
  const icon = String(guild?.icon || "").trim();
  const guildId = String(guild?.id || "").trim();
  if (!icon || !/^\d{16,22}$/.test(guildId)) return null;
  const animated = icon.startsWith("a_");
  const ext = animated ? "webp" : "png";
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${ext}?size=${size}`;
}

function guildIconUrl(guild, { size = 256 } = {}) {
  if (!guild) return null;
  // site-api REST stub: iconURL può esistere ma non essere una funzione Guild reale.
  if (typeof guild.iconURL === "function") {
    try {
      if (!guild.icon) return null;
      const animated = String(guild.icon).startsWith("a_");
      const fromMethod =
        guild.iconURL({
          size,
          extension: animated ? "webp" : "png",
          forceStatic: animated ? false : true,
        }) || null;
      if (fromMethod) return fromMethod;
    } catch (_) {
      /* fall through to CDN */
    }
  }
  if (typeof guild.iconURL === "string" && /^https?:\/\//i.test(guild.iconURL)) {
    return guild.iconURL;
  }
  return guildIconUrlFromCdn(guild, size);
}

/**
 * Avatar Discord predefinito (come sul client / sito).
 * @param {import("discord.js").User|import("discord.js").GuildMember|null|undefined} userLike
 * @param {{ size?: number }} [opts]
 * @returns {string}
 */
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

/**
 * Solo avatar per-server (null se il membro non ne ha uno dedicato).
 * @param {import("discord.js").GuildMember|import("discord.js").User|null|undefined} memberLike
 * @param {{ size?: number }} [opts]
 * @returns {string|null}
 */
function guildMemberServerAvatarUrlDynamic(memberLike, { size = 256 } = {}) {
  if (!memberLike?.guild || memberLike.avatar == null || memberLike.avatar === "") return null;
  const animated = String(memberLike.avatar).startsWith("a_");
  if (typeof memberLike.avatarURL === "function") {
    return (
      memberLike.avatarURL({
        size,
        extension: animated ? "gif" : "png",
        forceStatic: false,
      }) || null
    );
  }
  if (typeof memberLike.displayAvatarURL === "function") {
    return (
      memberLike.displayAvatarURL({
        size,
        extension: animated ? "gif" : "png",
        forceStatic: false,
      }) || null
    );
  }
  return null;
}

/**
 * Solo avatar globale dell'account (null se assente).
 * @param {import("discord.js").User|import("discord.js").GuildMember|null|undefined} userLike
 * @param {{ size?: number }} [opts]
 * @returns {string|null}
 */
function userGlobalAvatarUrlDynamic(userLike, { size = 256 } = {}) {
  const user = resolveUserFromLike(userLike);
  if (!user?.avatar || typeof user.displayAvatarURL !== "function") return null;
  const animated = String(user.avatar).startsWith("a_");
  return (
    user.displayAvatarURL({
      size,
      extension: animated ? "gif" : "webp",
      forceStatic: false,
    }) || null
  );
}

/** URL avatar per embed: PNG statico (server → globale → default). Mai null se c’è un id. */
function embedUserAvatarUrlDynamic(userLike, { size = 256 } = {}) {
  const staticServer = guildMemberDisplayAvatarUrlStatic(userLike, { size });
  if (staticServer) return staticServer;
  const staticGlobal = userAvatarUrlStatic(userLike, { size });
  if (staticGlobal) return staticGlobal;
  const server = guildMemberServerAvatarUrlDynamic(userLike, { size });
  if (server) return server;
  const globalAv = userGlobalAvatarUrlDynamic(userLike, { size });
  if (globalAv) return globalAv;
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

/**
 * Come {@link embedUserAvatarUrlDynamic}, ma verifica che l'URL risponda prima di usarlo.
 * @param {import("discord.js").User|import("discord.js").GuildMember|null|undefined} userLike
 * @param {{ size?: number }} [opts]
 * @returns {Promise<string>}
 */
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

async function resolveEmbedUserAvatarUrl(userLike, { size = 256 } = {}) {
  const candidates = [];
  const staticUrl = guildMemberDisplayAvatarUrlStatic(userLike, { size });
  if (staticUrl) candidates.push(staticUrl);
  const user = resolveUserFromLike(userLike);
  if (user?.displayAvatarURL) {
    const forcedPng = user.displayAvatarURL({ size, extension: "png", forceStatic: true });
    if (forcedPng) candidates.push(forcedPng);
  }
  const server = guildMemberServerAvatarUrlDynamic(userLike, { size });
  const global = userGlobalAvatarUrlDynamic(userLike, { size });
  const fallback = discordDefaultAvatarUrl(userLike, { size });
  if (server) candidates.push(server);
  if (global && global !== server) candidates.push(global);
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

/**
 * @param {import("discord.js").User|import("discord.js").GuildMember|null|undefined} userLike
 * @param {{ size?: number }} [opts]
 * @returns {string}
 */
function userAvatarUrlDynamic(userLike, { size = 256 } = {}) {
  return embedUserAvatarUrlDynamic(userLike, { size });
}

/**
 * Avatar del membro nel server, con fallback globale e predefinito Discord.
 * @param {import("discord.js").GuildMember|import("discord.js").User|null|undefined} memberLike
 * @param {{ size?: number }} [opts]
 * @returns {string}
 */
function guildMemberDisplayAvatarUrlDynamic(memberLike, { size = 256 } = {}) {
  return embedUserAvatarUrlDynamic(memberLike, { size });
}

/**
 * PNG statico (CDN): per canvas/GIF senza decodifica GIF frame-by-frame.
 * @param {import("discord.js").User|import("discord.js").GuildMember|null|undefined} userLike
 * @param {{ size?: number }} [opts]
 * @returns {string|null}
 */
function userAvatarUrlStatic(userLike, { size = 256 } = {}) {
  const user = resolveUserFromLike(userLike);
  if (!user || typeof user.displayAvatarURL !== "function") return null;
  return user.displayAvatarURL({ size, extension: "png", forceStatic: true }) || null;
}

/**
 * @param {import("discord.js").GuildMember|import("discord.js").User|null|undefined} memberLike
 * @param {{ size?: number }} [opts]
 * @returns {string|null}
 */
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

/**
 * Username Discord (handle), non `displayName` / nickname.
 * @param {import("discord.js").User|import("discord.js").GuildMember|null|undefined} userLike
 * @returns {string}
 */
function accountUsername(userLike) {
  const user = resolveUserFromLike(userLike);
  return String(user?.username || "Utente").trim() || "Utente";
}

/**
 * Nome pubblico in server: nickname → displayName membro → globalName → username.
 * @param {import("discord.js").GuildMember|import("discord.js").User|null|undefined} memberLike
 * @param {import("discord.js").User|null|undefined} [fallbackUser]
 * @returns {string}
 */
function memberDisplayName(memberLike, fallbackUser) {
  if (memberLike && memberLike.user && typeof memberLike.displayName === "string") {
    const dn = String(memberLike.displayName || "").trim();
    if (dn) return dn;
  }
  const nick = String(memberLike?.nickname || "").trim();
  if (nick) return nick;
  const user = resolveUserFromLike(memberLike) || resolveUserFromLike(fallbackUser);
  const global = String(user?.globalName || "").trim();
  if (global) return global;
  return accountUsername(user);
}

/**
 * Thumbnail “contesto server”: icona guild se presente, altrimenti avatar utente animato.
 * @param {import("discord.js").Guild|null|undefined} guild
 * @param {import("discord.js").User|import("discord.js").GuildMember|null|undefined} userLike
 * @param {{ size?: number }} [opts]
 * @returns {string}
 */
function guildFirstThumbnailUrl(guild, userLike, { size = 256 } = {}) {
  return guildIconUrl(guild, { size }) || embedUserAvatarUrlDynamic(userLike, { size });
}

module.exports = {
  guildIconUrl,
  discordDefaultAvatarUrl,
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
  guildFirstThumbnailUrl,
};
