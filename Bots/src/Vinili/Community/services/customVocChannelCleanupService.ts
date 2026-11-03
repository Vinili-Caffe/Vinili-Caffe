const { ChannelType } = require("discord.js") as typeof import("discord.js");
const { CustomRole } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const { isChannelInCustomPrivateCategory } = require("../utils/customPrivateCategoryUtils") as typeof import("../utils/customPrivateCategoryUtils");
const { listCustomPrivateVoiceChannelsByOwner } = require("../utils/customRoleUtils") as typeof import("../utils/customRoleUtils");

async function clearCustomVocChannelIdForUser(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return false;
  const result = await CustomRole.updateOne(
    { guildId: gid, userId: uid },
    { $set: { customVocChannelId: null } },
  ).catch(() => null);
  return Boolean(result?.modifiedCount || result?.matchedCount);
}

async function unlinkCustomVocChannelByChannelId(guildId?, channelId?) {
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

async function handleCustomPrivateVoiceChannelDelete(channel?, guild?) {
  if (!channel?.id || !guild) return { cleared: 0, userIds: [] };
  if (channel.type !== ChannelType.GuildVoice) return { cleared: 0, userIds: [] };
  if (!isChannelInCustomPrivateCategory(channel, guild)) return { cleared: 0, userIds: [] };
  return unlinkCustomVocChannelByChannelId(guild.id, channel.id);
}

export = {
  handleCustomPrivateVoiceChannelDelete,
};
