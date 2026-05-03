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
  if (userLike?.guild && typeof userLike.displayAvatarURL === "function") {
    const guildHash = userLike.avatar;
    const userHash = userLike.user?.avatar ?? null;
    const hash = guildHash != null ? guildHash : userHash;
    const animated = Boolean(hash && String(hash).startsWith("a_"));
    return (
      userLike.displayAvatarURL({
        size,
        extension: animated ? "gif" : "png",
        forceStatic: false,
      }) || null
    );
  }
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
 * @param {import("discord.js").User|import("discord.js").GuildMember|null|undefined} userLike
 * @returns {string}
 */
function accountUsername(userLike) {
  const user = userLike?.user || userLike;
  return String(user?.username || "Utente").trim() || "Utente";
}

module.exports = { guildIconUrl, userAvatarUrlDynamic, accountUsername };