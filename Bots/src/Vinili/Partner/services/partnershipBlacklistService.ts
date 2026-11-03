const {
  isPartnershipGuildBlacklistedBucket,
  addPartnershipBlacklistGuildBucket,
  removePartnershipBlacklistGuildBucket,
  listPartnershipBlacklistGuildsBucket,
} = require("../../Community/services/globalSettingsBucket") as typeof import("../../Community/services/globalSettingsBucket");

function normalizeGuildId(id?) {
  const s = String(id || "").trim();
  if (!/^\d{16,20}$/.test(s)) return null;
  return s;
}

async function isPartnershipGuildBlacklisted(guildId?) {
  return isPartnershipGuildBlacklistedBucket(guildId);
}

async function addPartnershipBlacklistGuild(guildId?, addedBy?, note = "", meta: Record<string, any> = {}) {
  return addPartnershipBlacklistGuildBucket(guildId, addedBy, note, meta);
}

async function removePartnershipBlacklistGuild(guildId?) {
  return removePartnershipBlacklistGuildBucket(guildId);
}

async function listPartnershipBlacklistGuilds(limit = 50) {
  return listPartnershipBlacklistGuildsBucket(limit);
}

export = {
  normalizeGuildId,
  isPartnershipGuildBlacklisted,
  addPartnershipBlacklistGuild,
  removePartnershipBlacklistGuild,
  listPartnershipBlacklistGuilds,
};