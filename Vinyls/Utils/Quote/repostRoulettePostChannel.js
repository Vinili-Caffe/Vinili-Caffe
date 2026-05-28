const { isViniliProtectedGuild } = require("../../MultiGuild/core/viniliProtectedGuilds");
const { resolveGuildAccess } = require("../../MultiGuild/core/guildRegistry");
const { getTenantChannelMapSync } = require("../../MultiGuild/core/tenantGuildSettings");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");
const IDs = require("../Config/ids");

function normalizeRouletteChannelId(value) {
  const id = String(value || "").trim();
  return id && /^\d{16,20}$/.test(id) ? id : null;
}

function resolveRouletteChannelId(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  if (isViniliProtectedGuild(gid)) {
    return normalizeRouletteChannelId(
      IDs.channels?.repostRoulette ?? IDs.channels?.chat,
    );
  }
  const fromTenantSettings = normalizeRouletteChannelId(getTenantChannelMapSync(gid).roulette);
  if (fromTenantSettings) return fromTenantSettings;
  try {
    const access = resolveGuildAccess(gid);
    return normalizeRouletteChannelId(access?.entry?.channelMap?.roulette);
  } catch {
  }
  return null;
}

async function resolveRoulettePostChannel(guild) {
  if (!guild?.id) return null;
  const channelId = resolveRouletteChannelId(guild.id);
  if (!channelId) return null;
  const channel =
    guild.channels.cache.get(channelId) ||
    (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return null;
  return channel;
}

module.exports = { resolveRouletteChannelId, resolveRoulettePostChannel };