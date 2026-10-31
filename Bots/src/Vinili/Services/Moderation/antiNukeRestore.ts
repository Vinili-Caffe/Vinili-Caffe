/** Antinuke: ripristino di ruoli e canali cancellati e backup dopo il panico. */
const { getPanicState } = require("./antiNukePanicLock") as typeof import("./antiNukePanicLock");

function buildChannelBackupSnapshot(channel?) {
  if (!channel?.id) return null;
  const overwrites = Array.from(channel.permissionOverwrites?.cache?.values?.() || []).map((ov?: any) => ({ id: String(ov?.id || ""), type: Number(ov?.type ?? 0), allow: String(BigInt(ov?.allow?.bitfield || 0n)), deny: String(BigInt(ov?.deny?.bitfield || 0n)), })).filter((ov?) => ov.id);
  return {
    id: String(channel.id),
    type: Number(channel.type ?? 0),
    name: String(channel.name || "restored-channel"),
    topic: typeof channel.topic === "string" ? channel.topic : "",
    nsfw: Boolean(channel.nsfw),
    rateLimitPerUser: Number(channel.rateLimitPerUser || 0),
    bitrate: Number(channel.bitrate || 0),
    userLimit: Number(channel.userLimit || 0),
    rtcRegion: channel.rtcRegion || null,
    videoQualityMode: Number(channel.videoQualityMode ?? 1),
    defaultAutoArchiveDuration: Number(channel.defaultAutoArchiveDuration || 1440),
    parentId: channel.parentId ? String(channel.parentId) : "",
    position: Number(channel.position || 0),
    permissionOverwrites: overwrites,
  };
}

function queueDeletedRoleSnapshot(guildId?, roleSnapshot?) {
  const gid = String(guildId || "");
  if (!gid || !roleSnapshot?.id) return;
  const state = getPanicState(gid);
  if (!state.deletedRoleSnapshots) state.deletedRoleSnapshots = new Map();
  state.deletedRoleSnapshots.set(String(roleSnapshot.id), roleSnapshot);
}

function queueDeletedChannelSnapshot(guildId?, channelSnapshot?) {
  const gid = String(guildId || "");
  if (!gid || !channelSnapshot?.id) return;
  const state = getPanicState(gid);
  if (!state.deletedChannelSnapshots) state.deletedChannelSnapshots = new Map();
  state.deletedChannelSnapshots.set(String(channelSnapshot.id), channelSnapshot);
}

export = { buildChannelBackupSnapshot, queueDeletedRoleSnapshot, queueDeletedChannelSnapshot };
