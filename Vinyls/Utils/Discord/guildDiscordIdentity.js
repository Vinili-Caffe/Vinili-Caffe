/**
 * Identità visiva coerente sul server: icona guild (anche animata), avatar utente dinamico,
 * nome account (`username`) senza nickname server.
 */

/**
 * @param {import("discord.js").Guild|null|undefined} guild
 * @param {{ size?: number }} [opts]
 * @returns {string|null}
 */
function guildIconUrl(guild, { size = 256 } = {}) {
  if (!guild?.icon) return null;
    const animated = String(guild.icon).startsWith("a_");
  return (
    guild.iconURL({
      size,
      extension: animated ? "webp" : "png",
      forceStatic: animated ? false : true,
    }) || null
  );
}

/**
 * @param {import("discord.js").User|import("discord.js").GuildMember|null|undefined} userLike
 * @param {{ size?: number }} [opts]
 * @returns {string|null}
 */
function userAvatarUrlDynamic(userLike, { size = 256 } = {}) {
  if (userLike?.guild && typeof userLike.displayAvatarURL === "function") {
    const guildHash = userLike.avatar;
    const userHash = userLike.user?.avatar ?? null;
    const hash = guildHash != null ? guildHash : userHash;
    const animated = Boolean(hash && String(hash).startsWith("a_"));
    return (
      userLike.displayAvatarURL({
        size,
        extension: animated ? "webp" : "png",
        forceStatic: false,
      }) || null
    );
  }
  const user = userLike?.user || userLike;
  if (!user || typeof user.displayAvatarURL !== "function") return null;
  const animated = Boolean(user.avatar && String(user.avatar).startsWith("a_"));
  return user.displayAvatarURL({
    size,
    extension: animated ? "webp" : "png",
    forceStatic: false,
  });
}

/**
 * Avatar del membro **nel server**: avatar di guild se impostato, altrimenti globale (GIF se animato).
 * Con solo `User` (senza `guild` su `GuildMember`) equivale a {@link userAvatarUrlDynamic}.
 * @param {import("discord.js").GuildMember|import("discord.js").User|null|undefined} memberLike
 * @param {{ size?: number }} [opts]
 * @returns {string|null}
 */
function guildMemberDisplayAvatarUrlDynamic(memberLike, { size = 256 } = {}) {
  if (memberLike?.guild && typeof memberLike.displayAvatarURL === "function") {
    const guildHash = memberLike.avatar;
    const userHash = memberLike.user?.avatar ?? null;
    const hash = guildHash != null ? guildHash : userHash;
    const animated = Boolean(hash && String(hash).startsWith("a_"));
    return (
      memberLike.displayAvatarURL({
        size,
        extension: animated ? "webp" : "png",
        forceStatic: false,
      }) || null
    );
  }
  return userAvatarUrlDynamic(memberLike, { size });
}

/**
 * PNG statico (CDN): per canvas/GIF senza decodifica GIF frame-by-frame.
 * @param {import("discord.js").User|import("discord.js").GuildMember|null|undefined} userLike
 * @param {{ size?: number }} [opts]
 * @returns {string|null}
 */
function userAvatarUrlStatic(userLike, { size = 256 } = {}) {
  const user = userLike?.user || userLike;
  if (!user || typeof user.displayAvatarURL !== "function") return null;
  return user.displayAvatarURL({ size, extension: "png", forceStatic: true }) || null;
}

/**
 * @param {import("discord.js").GuildMember|import("discord.js").User|null|undefined} memberLike
 * @param {{ size?: number }} [opts]
 * @returns {string|null}
 */
function guildMemberDisplayAvatarUrlStatic(memberLike, { size = 256 } = {}) {
  if (memberLike?.guild && typeof memberLike.displayAvatarURL === "function") {
    return memberLike.displayAvatarURL({ size, extension: "png", forceStatic: true }) || null;
  }
  return userAvatarUrlStatic(memberLike, { size });
}

/**
 * Username Discord (handle), non `displayName` / nickname.
 * @param {import("discord.js").User|import("discord.js").GuildMember|null|undefined} userLike
 * @returns {string}
 */
function accountUsername(userLike) {
  const user = userLike?.user || userLike;
  return String(user?.username || "Utente").trim() || "Utente";
}

/**
 * Thumbnail “contesto server”: icona guild se presente, altrimenti avatar utente animato.
 * @param {import("discord.js").Guild|null|undefined} guild
 * @param {import("discord.js").User|import("discord.js").GuildMember|null|undefined} userLike
 * @param {{ size?: number }} [opts]
 * @returns {string|null}
 */
function guildFirstThumbnailUrl(guild, userLike, { size = 256 } = {}) {
  return guildIconUrl(guild, { size }) || userAvatarUrlDynamic(userLike, { size });
}

module.exports = {
  guildIconUrl,
  userAvatarUrlDynamic,
  userAvatarUrlStatic,
  guildMemberDisplayAvatarUrlDynamic,
  guildMemberDisplayAvatarUrlStatic,
  accountUsername,
  guildFirstThumbnailUrl,
};