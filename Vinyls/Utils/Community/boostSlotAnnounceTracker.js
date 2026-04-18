/**
 * Conteggio slot boost “annunciati” nel canale supporters (embed bot).
 * Usato per assegnare Double Booster e per coerenza con la revoca parziale.
 */
const slotsByKey = new Map();

function keyOf(guildId, userId) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function getAnnouncedBoostSlots(guildId, userId) {
  return Math.max(0, Number(slotsByKey.get(keyOf(guildId, userId)) || 0));
}

function setAnnouncedBoostSlots(guildId, userId, value) {
  const k = keyOf(guildId, userId);
  const n = Math.max(0, Math.floor(Number(value || 0)));
  if (n <= 0) slotsByKey.delete(k);
  else slotsByKey.set(k, n);
}

function addAnnouncedBoostSlots(guildId, userId, add) {
  const k = keyOf(guildId, userId);
  const delta = Math.max(0, Math.floor(Number(add || 0)));
  const next = getAnnouncedBoostSlots(guildId, userId) + delta;
  if (next <= 0) slotsByKey.delete(k);
  else slotsByKey.set(k, next);
  return next;
}

function deleteAnnouncedBoostSlots(guildId, userId) {
  slotsByKey.delete(keyOf(guildId, userId));
}

module.exports = {
  getAnnouncedBoostSlots,
  setAnnouncedBoostSlots,
  addAnnouncedBoostSlots,
  deleteAnnouncedBoostSlots,
};