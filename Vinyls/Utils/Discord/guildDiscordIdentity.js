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
      extension: animated ? "gif" : "png",
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
  const user = userLike?.user || userLike;
  if (!user || typeof user.displayAvatarURL !== "function") return null;
  const animated = Boolean(user.avatar && String(user.avatar).startsWith("a_"));
  return user.displayAvatarURL({
    size,
    extension: animated ? "gif" : "png",
    forceStatic: false,
  });
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
  accountUsername,
  guildFirstThumbnailUrl,
};