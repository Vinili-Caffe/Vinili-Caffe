const { ChannelType } = require("discord.js");
const { CustomRole } = require("../../Schemas/Community/communitySchemas");
const { isChannelInCustomPrivateCategory } = require("../../Utils/Community/customPrivateCategoryUtils");
const { listCustomPrivateVoiceChannelsByOwner } = require("../../Utils/Interaction/customRoleUtils");
const {
  resolveCustomVocOwnerId,
  repairGuildCustomVocPermissions,
} = require("./customVocPermissionsService");

async function clearCustomVocChannelIdForUser(guildId, userId) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return false;
  const result = await CustomRole.updateOne(
    { guildId: gid, userId: uid },
    { $set: { customVocChannelId: null } },
  ).catch(() => null);
  return Boolean(result?.modifiedCount || result?.matchedCount);
}

async function unlinkCustomVocChannelByChannelId(guildId, channelId) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  if (!gid || !cid) return { cleared: 0, userIds: [] };
  const docs = await CustomRole.find({ guildId: gid, customVocChannelId: cid }).lean().catch(() => []);
  const userIds = [];
  for (const doc of Array.isArray(docs) ? docs : []) {
    const uid = String(doc?.userId || "").trim();
    if (!uid) continue;
    await clearCustomVocChannelIdForUser(gid, uid);
    userIds.push(uid);
  }
  return { cleared: userIds.length, userIds };
}

async function handleCustomPrivateVoiceChannelDelete(channel, guild) {
  if (!channel?.id || !guild) return { cleared: 0, userIds: [] };
  if (channel.type !== ChannelType.GuildVoice) return { cleared: 0, userIds: [] };
  if (!isChannelInCustomPrivateCategory(channel, guild)) return { cleared: 0, userIds: [] };
  return unlinkCustomVocChannelByChannelId(guild.id, channel.id);
}

function resolveDiscordOwnerId(channel, ownerByChannelId) {
  return String(resolveCustomVocOwnerId(channel, ownerByChannelId) || "").trim();
}

async function runCustomVocDbCleanup(guild, { dryRun = false, repairPermissions = true } = {}) {
  const gid = String(guild?.id || "").trim();
  if (!gid || !guild) {
    return { skipped: true, reason: "no_guild" };
  }

  if (typeof guild.channels?.fetch === "function") {
    await guild.channels.fetch().catch(() => {});
  }

  const docs = await CustomRole.find(
    { guildId: gid },
    { userId: 1, customVocChannelId: 1 },
  )
    .lean()
    .catch(() => []);
  const rows = (Array.isArray(docs) ? docs : []).filter((doc) => String(doc?.customVocChannelId || "").trim());

  const ownerByChannelId = new Map();
  for (const doc of rows) {
    const chId = String(doc.customVocChannelId || "").trim();
    const uid = String(doc.userId || "").trim();
    if (chId && uid) ownerByChannelId.set(chId, uid);
  }

  const stats = {
    scanned: rows.length,
    orphansCleared: 0,
    mismatchesCleared: 0,
    relinked: 0,
    duplicatesCleared: 0,
    repairedChannels: 0,
    details: [],
  };

  const channelOwnerCounts = new Map();
  for (const doc of rows) {
    const chId = String(doc.customVocChannelId || "").trim();
    if (!chId) continue;
    channelOwnerCounts.set(chId, (channelOwnerCounts.get(chId) || 0) + 1);
  }

  for (const doc of rows) {
    const userId = String(doc.userId || "").trim();
    const storedChannelId = String(doc.customVocChannelId || "").trim();
    if (!userId || !storedChannelId) continue;

    const channel =
      guild.channels.cache.get(storedChannelId) ||
      (await guild.channels.fetch(storedChannelId).catch(() => null));

    if (!channel?.isVoiceBased?.()) {
      stats.orphansCleared += 1;
      stats.details.push({ userId, storedChannelId, action: "clear_orphan" });
      if (!dryRun) await clearCustomVocChannelIdForUser(gid, userId);
      continue;
    }

    const discordOwnerId = resolveDiscordOwnerId(channel, ownerByChannelId);
    const duplicateCount = channelOwnerCounts.get(storedChannelId) || 0;

    if (duplicateCount > 1) {
      if (!discordOwnerId || discordOwnerId !== userId) {
        stats.duplicatesCleared += 1;
        stats.details.push({ userId, storedChannelId, action: "clear_duplicate", discordOwnerId });
        if (!dryRun) await clearCustomVocChannelIdForUser(gid, userId);
        continue;
      }
    }

    if (discordOwnerId && discordOwnerId !== userId) {
      stats.mismatchesCleared += 1;
      stats.details.push({ userId, storedChannelId, action: "clear_wrong_owner", discordOwnerId });
      if (!dryRun) await clearCustomVocChannelIdForUser(gid, userId);
    }
  }

  const afterDocs = dryRun
    ? rows
    : await CustomRole.find(
        { guildId: gid },
        { userId: 1, customVocChannelId: 1 },
      )
        .lean()
        .catch(() => []);

  for (const doc of Array.isArray(afterDocs) ? afterDocs : []) {
    const userId = String(doc?.userId || "").trim();
    const storedChannelId = String(doc?.customVocChannelId || "").trim();
    if (!userId || storedChannelId) continue;

    const owned = listCustomPrivateVoiceChannelsByOwner(guild, userId);
    if (owned.length !== 1) continue;
    const liveChannelId = String(owned[0]?.id || "").trim();
    if (!liveChannelId) continue;

    stats.relinked += 1;
    stats.details.push({ userId, storedChannelId: null, liveChannelId, action: "relink_live_channel" });
    if (!dryRun) {
      await CustomRole.updateOne(
        { guildId: gid, userId },
        { $set: { customVocChannelId: liveChannelId } },
      ).catch(() => {});
    }
  }

  if (repairPermissions && !dryRun) {
    const repair = await repairGuildCustomVocPermissions(guild).catch(() => null);
    stats.repairedChannels = Number(repair?.channels || 0);
    stats.rolesStripped = Number(repair?.rolesStripped || 0);
  }

  return stats;
}

module.exports = {
  clearCustomVocChannelIdForUser,
  unlinkCustomVocChannelByChannelId,
  handleCustomPrivateVoiceChannelDelete,
  runCustomVocDbCleanup,
};
