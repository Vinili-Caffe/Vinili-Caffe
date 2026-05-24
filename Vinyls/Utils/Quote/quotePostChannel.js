const { isViniliProtectedGuild } = require("../../MultiGuild/core/viniliProtectedGuilds");
const { resolveGuildAccess } = require("../../MultiGuild/core/guildRegistry");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");
const IDs = require("../Config/ids");

function normalizeQuoteChannelId(value) {
  const id = String(value || "").trim();
  return id && /^\d{16,20}$/.test(id) ? id : null;
}

function resolveQuoteChannelId(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  if (isViniliProtectedGuild(gid)) {
    return normalizeQuoteChannelId(IDs.channels?.quotes);
  }
  try {
    const access = resolveGuildAccess(gid);
    return normalizeQuoteChannelId(access?.entry?.channelMap?.quotes);
  } catch {
  }
  return null;
}

async function resolveQuotePostChannel(guild) {
  if (!guild?.id) return null;
  const channelId = resolveQuoteChannelId(guild.id);
  if (!channelId) return null;
  const channel =
    guild.channels.cache.get(channelId) ||
    (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return null;
  return channel;
}

module.exports = { resolveQuoteChannelId, resolveQuotePostChannel };