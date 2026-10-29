const {
  ActivityUserProfile,
  UserLeaveBackup,
  CustomRole,
} = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../../Utils/DB/validateWriteIds");
const { getClientGuildCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { deleteDiscordCustomPerkArtifacts } = require("./customRoleExpiryService") as typeof import("./customRoleExpiryService");
const { resolveNextLeaveBackupExpiryClock } = require("./userLeaveBackupService") as typeof import("./userLeaveBackupService");

const QUEUE_SWEEP_BATCH = 40;

async function enqueueCustomPerksDiscordCleanupAfterLeave(guildId?, userId?) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid)) return;
  const [doc, customRoleDoc] = await Promise.all([
    ActivityUserProfile.findOne({ guildId: gid, userId: uid })
      .select("profile.customRole profile.mentionReaction.reactions")
      .lean()
      .catch(() => null),
    CustomRole.findOne(
      { guildId: gid, userId: uid },
      "roleId secondaryRoleId customVocChannelId customVocEmoji",
    ).lean(),
  ]);
  const cr = doc?.profile?.customRole || {};
  const reactions = Array.isArray(doc?.profile?.mentionReaction?.reactions)
    ? doc.profile.mentionReaction.reactions
    : [];
  const roleId = String(cr.roleId || customRoleDoc?.roleId || "").trim() || null;
  const secondaryRoleId = String(cr.secondaryRoleId || customRoleDoc?.secondaryRoleId || "").trim() || null;
  const customVocChannelId = String(cr.customVocChannelId || customRoleDoc?.customVocChannelId || "").trim() || null;
  const customVocEmoji = cr.customVocEmoji || customRoleDoc?.customVocEmoji || null;
  const hasRole = Boolean(roleId || secondaryRoleId);
  const hasVoc = Boolean(customVocChannelId);
  const hasReactions = reactions.some((x?) => String(x || "").trim());
  if (!hasRole && !hasVoc && !hasReactions) return;
  const runAt = await resolveNextLeaveBackupExpiryClock(gid, uid);
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    {
      $set: {
        "profile.customPerksDiscordCleanup.runAt": runAt,
        "profile.customPerksDiscordCleanup.roleId": roleId,
        "profile.customPerksDiscordCleanup.secondaryRoleId": secondaryRoleId,
        "profile.customPerksDiscordCleanup.customVocChannelId": customVocChannelId,
        "profile.customPerksDiscordCleanup.customVocEmoji": customVocEmoji,
        "profile.customPerksDiscordCleanup.clearMentionReactions": hasReactions,
      },
    },
    { upsert: true },
  ).catch(() => {});
}

async function cancelCustomPerksDiscordCleanupQueue(guildId?, userId?) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid)) return;
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    { $unset: { "profile.customPerksDiscordCleanup": "" } },
  ).catch(() => {});
}

async function processOneCustomPerksDiscordCleanupQueueRow(client?, row?) {
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

async function runCustomPerksDiscordCleanupQueueSweep(client?) {
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

export = {
  enqueueCustomPerksDiscordCleanupAfterLeave,
  cancelCustomPerksDiscordCleanupQueue,
  runCustomPerksDiscordCleanupQueueSweep,
};