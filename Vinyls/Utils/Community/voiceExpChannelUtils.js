const IDs = require("../Config/ids");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");
const { isSpawnedHubChannel } = require("../../Services/Voice/publicVoiceHubService");

const VOICE_EXP_HALF_MULTIPLIER = 0.5;
const HALF_VOICE_EXP_CATEGORY_IDS = new Set(
  [IDs.categories?.categoryPrivate].filter(Boolean).map((id) => String(id)),
);

function resolveVoiceChannel(channelLike, guild) {
  if (!channelLike) return null;
  if (channelLike.parentId !== undefined || channelLike.type !== undefined) return channelLike;
  const guildRef = guild || channelLike.guild || null;
  const channelId = String(channelLike.id || channelLike.channelId || "").trim();
  if (!channelId || !guildRef) return null;
  return guildRef.channels.cache.get(channelId) || null;
}

async function resolveVoiceExpMultiplier(channelLike, guild, client = null) {
  const guildRef = guild || channelLike?.guild || null;
  const resolvedClient = client || guildRef?.client || channelLike?.client || null;
  let channel = resolveVoiceChannel(channelLike, guildRef);
  const channelId = String(channel?.id || channelLike?.id || channelLike?.channelId || "").trim();
  if (!channelId || !guildRef) return 1;
  if (!channel) {
    channel = await getGuildChannelCached(guildRef, channelId).catch(() => null);
  }
  if (!channel) return 1;
  const parentId = String(channel.parentId || "");
  if (parentId && HALF_VOICE_EXP_CATEGORY_IDS.has(parentId)) return VOICE_EXP_HALF_MULTIPLIER;
  if (isSpawnedHubChannel(channel, resolvedClient)) return VOICE_EXP_HALF_MULTIPLIER;
  return 1;
}

function computeVoiceExpFromSeconds(seconds, multiplier = 1, expPerMinute = 5) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  const mult = Math.max(0, Number(multiplier) || 0);
  const rate = Math.max(0, Number(expPerMinute) || 0);
  return Math.floor((sec * rate * mult) / 60);
}

function isHalfVoiceExpChannel(channelLike, client = null) {
  const guildRef = channelLike?.guild || null;
  const channel = resolveVoiceChannel(channelLike, guildRef);
  if (!channel) return false;
  const parentId = String(channel.parentId || "");
  if (parentId && HALF_VOICE_EXP_CATEGORY_IDS.has(parentId)) return true;
  return isSpawnedHubChannel(channel, client || guildRef?.client || channel.client || null);
}

module.exports = {
  VOICE_EXP_HALF_MULTIPLIER,
  resolveVoiceExpMultiplier,
  computeVoiceExpFromSeconds,
  isHalfVoiceExpChannel,
};