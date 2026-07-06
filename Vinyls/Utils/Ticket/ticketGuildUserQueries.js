const { GuildFeatureBucket } = require("../../Schemas/Guild/guildFeatureBucketSchema");

function ticketSubdocToPlain(t) {
  if (!t) return null;
  return t.toObject ? t.toObject({ virtuals: false }) : { ...t };
}

/**
 * Ticket aperti per utente nel guild, letti dal bucket (affidabile anche se `guildId` manca sul subdocumento).
 */
async function findOpenTicketsForGuildUser(guildId, userId) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return [];
  const bucket = await GuildFeatureBucket.findOne({ guildId: gid }).catch(() => null);
  const out = [];
  for (const t of bucket?.tickets || []) {
    if (!t || t.open !== true) continue;
    if (String(t.userId || "") !== uid) continue;
    const subGuild = String(t.guildId || "").trim();
    if (subGuild && subGuild !== gid) continue;
    const plain = ticketSubdocToPlain(t);
    if (plain) out.push(plain);
  }
  return out;
}

module.exports = { findOpenTicketsForGuildUser };