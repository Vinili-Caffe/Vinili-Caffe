/**
 * Validazione prima di scrivere su collezioni per (guildId, userId).
 * Evita documenti con id vuoti o "a caso".
 * @param {string} guildId
 * @param {string} userId
 * @returns {boolean} true se entrambi sono stringhe non vuote (dopo trim)
 */
function isValidGuildUserId(guildId, userId) {
  const g = typeof guildId === "string" ? guildId.trim() : "";
  const u = typeof userId === "string" ? userId.trim() : "";
  return g.length > 0 && u.length > 0;
}

/**
 * Per scritture che richiedono anche channelId (es. activity).
 */
function isValidGuildUserIdChannelId(guildId, userId, channelId) {
  const c = typeof channelId === "string" ? channelId.trim() : "";
  return isValidGuildUserId(guildId, userId) && c.length > 0;
}

module.exports = { isValidGuildUserId, isValidGuildUserIdChannelId };