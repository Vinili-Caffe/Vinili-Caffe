const {
  upsertChannelSnapshotEmbedded,
  syncGuildChannelSnapshotsEmbedded,
  getChannelSnapshotMapEmbedded,
} = require("../Global/globalSettingsGuildStores");

function normalizeId(value) {
  const raw = String(value || "").trim();
  return raw || "";
}

async function upsertChannelSnapshot(channel, options = {}) {
  return upsertChannelSnapshotEmbedded(channel, options);
}

async function markDeletedChannelSnapshot(channel) {
  const deletedAt = new Date();
  return upsertChannelSnapshot(channel, { deletedAt });
}

async function syncGuildChannelSnapshots(guild) {
  return syncGuildChannelSnapshotsEmbedded(guild);
}

async function getChannelSnapshotMap(guildId, channelIds = []) {
  return getChannelSnapshotMapEmbedded(guildId, channelIds);
}

module.exports = { upsertChannelSnapshot, markDeletedChannelSnapshot, syncGuildChannelSnapshots, getChannelSnapshotMap, normalizeId };