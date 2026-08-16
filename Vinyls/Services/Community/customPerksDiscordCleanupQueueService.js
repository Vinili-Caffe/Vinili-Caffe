const {
  ActivityUserProfile,
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
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    {
      $set: {
        "profile.customPerksDiscordCleanup.runAt": runAt,
        "profile.customPerksDiscordCleanup.roleId": cr.roleId || null,
        "profile.customPerksDiscordCleanup.secondaryRoleId": cr.secondaryRoleId || null,
        "profile.customPerksDiscordCleanup.customVocChannelId": cr.customVocChannelId || null,
        "profile.customPerksDiscordCleanup.customVocEmoji": cr.customVocEmoji || null,
        "profile.customPerksDiscordCleanup.clearMentionReactions": hasReactions,
      },
    },
    { upsert: true },
  ).catch(() => {});
}

async function cancelCustomPerksDiscordCleanupQueue(guildId, userId) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid)) return;
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    { $unset: { "profile.customPerksDiscordCleanup": "" } },
  ).catch(() => {});
}

async function processOneCustomPerksDiscordCleanupQueueRow(client, row) {
  const gid = String(row.guildId || "");
  const uid = String(row.userId || "");
  const clearQueue = () =>
    ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      { $unset: { "profile.customPerksDiscordCleanup": "" } },
    ).catch(() => {});
  if (!gid || !uid) {
    await clearQueue();
    return;
  }
  const guild = client.guilds.cache.get(gid) || (await getClientGuildCached(client, gid));
  if (guild) {
    const mem = await guild.members.fetch(uid).catch(() => null);
    if (mem) {
      await clearQueue();
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
  await clearQueue();
}

async function runCustomPerksDiscordCleanupQueueSweep(client) {
  if (!client) return;
  const now = new Date();
  const docs = await ActivityUserProfile.find({ "profile.customPerksDiscordCleanup.runAt": { $lte: now } })
    .select("guildId userId profile.customPerksDiscordCleanup")
    .sort({ "profile.customPerksDiscordCleanup.runAt": 1 })
    .limit(QUEUE_SWEEP_BATCH)
    .lean()
    .catch(() => []);
  for (const doc of docs) {
    const cleanup = doc?.profile?.customPerksDiscordCleanup || {};
    const row = {
      guildId: doc.guildId,
      userId: doc.userId,
      roleId: cleanup.roleId,
      secondaryRoleId: cleanup.secondaryRoleId,
      customVocChannelId: cleanup.customVocChannelId,
      customVocEmoji: cleanup.customVocEmoji,
      clearMentionReactions: cleanup.clearMentionReactions,
    };
    await processOneCustomPerksDiscordCleanupQueueRow(client, row).catch(() => {});
  }
}

module.exports = {
  enqueueCustomPerksDiscordCleanupAfterLeave,
  cancelCustomPerksDiscordCleanupQueue,
  runCustomPerksDiscordCleanupQueueSweep,
};