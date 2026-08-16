/**
 * Opzioni memoria Discord.js per i client bot.
 *
 * I limiti `cacheWithLimits` (GuildMemberManager 250, UserManager 400, ecc.)
 * sono stati rimossi: con cache troncata ticket, hub vocale, cleanup staff e
 * thread staff perdevano User/Role/Member e generavano bug intermittenti.
 * Discord.js usa le Collection di default (illimitate).
 */
function buildDiscordClientMemoryOptions(_discord) {
  return {};
}

module.exports = { buildDiscordClientMemoryOptions };
