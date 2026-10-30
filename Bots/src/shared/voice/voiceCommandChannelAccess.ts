const { ChannelType } = require("discord.js") as typeof import("discord.js");

const DEFAULT_BLOCKED_VOICE_CHAT_IDS = new Set([
  "1443958044802420798",
  "1497535199813042306",
]);

function isVoiceBasedCommandChannel(channel?) {
  if (!channel) return false;
  if (typeof channel.isVoiceBased === "function" && channel.isVoiceBased() && !channel.isThread?.()) return true;
  if (channel.type === ChannelType.GuildVoice) return true;
  if (channel.isThread?.() && channel.parent?.isVoiceBased?.()) return true;
  return false;
}

async function isAllowedVoiceCommandChannel(guild?, channel?, options: Record<string, any> = {}) {
  if (!guild || !channel) return false;
  const blocked = new Set(DEFAULT_BLOCKED_VOICE_CHAT_IDS);
  const extraBlocked = options.blockedChannelIds;
  if (Array.isArray(extraBlocked)) {
    for (const id of extraBlocked) {
      const normalized = String(id || "").trim();
      if (normalized) blocked.add(normalized);
    }
  }
  const channelId = String(channel.id || "").trim();
  if (channelId && blocked.has(channelId)) return false;
  try {
    const { isStanzaCommandChannel } = require("../../Caffè/Services/Voice/stanzaVoiceRoomsService") as typeof import("../../Caffè/Services/Voice/stanzaVoiceRoomsService");
    if (await isStanzaCommandChannel(guild, channel)) return true;
  } catch (_) {}
  return isVoiceBasedCommandChannel(channel);
}

export = {
  DEFAULT_BLOCKED_VOICE_CHAT_IDS,
  isVoiceBasedCommandChannel,
  isAllowedVoiceCommandChannel,
};