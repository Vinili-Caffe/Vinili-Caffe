const {
  isPartnershipGuildBlacklistedBucket,
  addPartnershipBlacklistGuildBucket,
  removePartnershipBlacklistGuildBucket,
  listPartnershipBlacklistGuildsBucket,
} = require("../../Utils/Global/globalSettingsBucket");

function normalizeGuildId(id) {
  const s = String(id || "").trim();
  if (!/^\d{16,20}$/.test(s)) return null;
  return s;
}

async function isPartnershipGuildBlacklisted(guildId) {
  return isPartnershipGuildBlacklistedBucket(guildId);
}

async function addPartnershipBlacklistGuild(guildId, addedBy, note = "") {
  return addPartnershipBlacklistGuildBucket(guildId, addedBy, note);
}

async function removePartnershipBlacklistGuild(guildId) {
  return removePartnershipBlacklistGuildBucket(guildId);
}

async function listPartnershipBlacklistGuilds(limit = 50) {
  return listPartnershipBlacklistGuildsBucket(limit);
}

module.exports = {
  normalizeGuildId,
  isPartnershipGuildBlacklisted,
  addPartnershipBlacklistGuild,
  removePartnershipBlacklistGuild,
  listPartnershipBlacklistGuilds,
};