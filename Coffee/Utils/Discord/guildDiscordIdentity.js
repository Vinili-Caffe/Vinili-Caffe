/**
 * @param {import("discord.js").User|import("discord.js").GuildMember|null|undefined} userLike
 * @returns {string}
 */
function accountUsername(userLike) {
  const user = userLike?.user || userLike;
  return String(user?.username || "Utente").trim() || "Utente";
}

module.exports = { accountUsername };