const {
  upsertChannelSnapshotEmbedded,
  syncGuildChannelSnapshotsEmbedded,
  getChannelSnapshotMapEmbedded,
} = require("../services/globalSettingsGuildStores") as typeof import("../services/globalSettingsGuildStores");

function normalizeId(value?) {
  const raw = String(value || "").trim();
  return raw || "";
}

async function upsertChannelSnapshot(channel?, options: Record<string, any> = {}) {
  return upsertChannelSnapshotEmbedded(channel, options);
}

async function markDeletedChannelSnapshot(channel?) {
  const deletedAt = new Date();
  return upsertChannelSnapshot(channel, { deletedAt });
}

async function syncGuildChannelSnapshots(guild?) {
  return syncGuildChannelSnapshotsEmbedded(guild);
}

async function getChannelSnapshotMap(guildId?, channelIds = []) {
  return getChannelSnapshotMapEmbedded(guildId, channelIds);
}

export = { upsertChannelSnapshot, markDeletedChannelSnapshot, syncGuildChannelSnapshots, getChannelSnapshotMap, normalizeId };