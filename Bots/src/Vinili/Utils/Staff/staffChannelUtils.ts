const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { getGuildChannelCached, getClientChannelCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const { isDiscordStaffChannelPostsEnabled } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");

async function resolveStaffValutazioniChannel(guild?, client = null) {
  if (!isDiscordStaffChannelPostsEnabled()) return null;
  if (!guild) return null;
  const channelId = String(IDs.channels?.valutazioniStaff || "").trim();
  if (!channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await getGuildChannelCached(guild, channelId)) ||
    (client ? await getClientChannelCached(client, channelId) : null)
  );
}

async function resolveStaffPexDepexChannel(guild?, client = null) {
  if (!isDiscordStaffChannelPostsEnabled()) return null;
  if (!guild) return null;
  const channelId = String(IDs.channels?.pexDepex || "").trim();
  if (!channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await getGuildChannelCached(guild, channelId)) ||
    (client ? await getClientChannelCached(client, channelId) : null) ||
    (guild.client ? await getClientChannelCached(guild.client, channelId) : null)
  );
}

async function resolveStaffPuntiToltiChannel(guild?, client = null) {
  if (!isDiscordStaffChannelPostsEnabled()) return null;
  if (!guild) return null;
  const channelId = String(IDs.channels?.puntiTolti || "").trim();
  if (!channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await getGuildChannelCached(guild, channelId)) ||
    (client ? await getClientChannelCached(client, channelId) : null)
  );
}

export = {
  resolveStaffValutazioniChannel,
  resolveStaffPexDepexChannel,
  resolveStaffPuntiToltiChannel,
};
