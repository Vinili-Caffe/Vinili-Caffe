const {
  ActivityUserProfile,
  CustomPerksDiscordCleanupQueue,
  UserLeaveBackup,
  CustomRole,
} = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { getClientGuildCached } = require("../../Utils/Interaction/interactionEntityCache");
const { deleteDiscordCustomPerkArtifacts } = require("./customRoleExpiryService");
const { resolveNextLeaveBackupExpiryClock } = require("./userLeaveBackupService");

const QUEUE_SWEEP_BATCH = 40;

async function enqueueCustomPerksDiscordCleanupAfterLeave(guildId, userId) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid)) return;
  const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("profile.customRole profile.mentionReaction.reactions")
    .lean()
    .catch(() => null);
  const cr = doc?.profile?.customRole || {};
  const reactions = Array.isArray(doc?.profile?.mentionReaction?.reactions)
    ? doc.profile.mentionReaction.reactions
    : [];
  const hasRole = Boolean(String(cr.roleId || "").trim() || String(cr.secondaryRoleId || "").trim());
  const hasVoc = Boolean(String(cr.customVocChannelId || "").trim());
  const hasReactions = reactions.some((x) => String(x || "").trim());
  if (!hasRole && !hasVoc && !hasReactions) return;
  const runAt = await resolveNextLeaveBackupExpiryClock(gid, uid);
  await CustomPerksDiscordCleanupQueue.findOneAndUpdate(
    { guildId: gid, userId: uid },
    {
      $set: {
        guildId: gid,
        userId: uid,
        runAt,
        roleId: cr.roleId || null,
        secondaryRoleId: cr.secondaryRoleId || null,
        customVocChannelId: cr.customVocChannelId || null,
        customVocEmoji: cr.customVocEmoji || null,
        clearMentionReactions: hasReactions,
      },
    },
    { upsert: true },
  ).catch(() => {});
}

async function cancelCustomPerksDiscordCleanupQueue(guildId, userId) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid)) return;
  await CustomPerksDiscordCleanupQueue.deleteOne({ guildId: gid, userId: uid }).catch(() => {});
}

async function processOneCustomPerksDiscordCleanupQueueRow(client, row) {
  const gid = String(row.guildId || "");
  const uid = String(row.userId || "");
  if (!gid || !uid) {
    await CustomPerksDiscordCleanupQueue.deleteOne({ _id: row._id }).catch(() => {});
    return;
  }
  const guild = client.guilds.cache.get(gid) || (await getClientGuildCached(client, gid));
  if (guild) {
    const mem = await guild.members.fetch(uid).catch(() => null);
    if (mem) {
      await CustomPerksDiscordCleanupQueue.deleteOne({ _id: row._id }).catch(() => {});
      return;
    }
  }
  const backup = await UserLeaveBackup.findOne({ guildId: gid, userId: uid }).lean().catch(() => null);
  if (backup?.expiresAt && new Date(backup.expiresAt).getTime() > Date.now()) return;
  if (guild) {
    await deleteDiscordCustomPerkArtifacts(guild, {
      guildId: gid,
      userId: uid,
      roleId: row.roleId,
      secondaryRoleId: row.secondaryRoleId,
      customVocChannelId: row.customVocChannelId,
      customVocEmoji: row.customVocEmoji,
    }).catch(() => {});
  }
  await CustomRole.deleteOne({ guildId: gid, userId: uid }).catch(() => {});
  if (row.clearMentionReactions) {
    await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      { $set: { "profile.mentionReaction.reactions": [] } },
    ).catch(() => {});
  }
  await CustomPerksDiscordCleanupQueue.deleteOne({ _id: row._id }).catch(() => {});
}

async function runCustomPerksDiscordCleanupQueueSweep(client) {
  if (!client) return;
  const now = new Date();
  const rows = await CustomPerksDiscordCleanupQueue.find({ runAt: { $lte: now } })
    .sort({ runAt: 1 })
    .limit(QUEUE_SWEEP_BATCH)
    .lean()
    .catch(() => []);
  for (const row of rows) {
    await processOneCustomPerksDiscordCleanupQueueRow(client, row).catch(() => {});
  }
}

module.exports = {
  enqueueCustomPerksDiscordCleanupAfterLeave,
  cancelCustomPerksDiscordCleanupQueue,
  runCustomPerksDiscordCleanupQueueSweep,
};