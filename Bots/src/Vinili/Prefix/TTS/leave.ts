const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { getVoiceConnection } = require("@discordjs/voice") as typeof import("@discordjs/voice");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const {
  markMusicVoiceLeaveIntentional,
  getGuildMusicVoiceChannelId,
  guildMusicSessionBlocksOtherVoiceChannels,
} = require("../../Services/Music/lavalinkMusicService") as typeof import("../../Services/Music/lavalinkMusicService");
const { leaveTtsGuild } = require("../../Services/TTS/ttsService") as typeof import("../../Services/TTS/ttsService");
const { clearVoiceSession, getVoiceSession } = require("../../Services/Voice/voiceSessionService") as typeof import("../../Services/Voice/voiceSessionService");

function isLeaveInBotVoiceChat(message?, botChannelId?) {
  const id = String(botChannelId || "");
  if (!id || !message?.channel) return false;
  if (String(message.channel.id) === id) return true;
  if (message.channel.isThread?.() && String(message.channel.parentId || "") === id) return true;
  return false;
}

function hasActiveTtsOrMusicSession(message?, botChannelId?) {
  const gid = String(message.guild?.id || "");
  if (!gid) return false;
  if (getVoiceConnection(gid)) return true;
  const music = guildMusicSessionBlocksOtherVoiceChannels(message.client, gid);
  if (music?.blocked) return true;
  const musicVc = getGuildMusicVoiceChannelId(gid);
  if (musicVc && botChannelId && String(musicVc) === String(botChannelId)) return true;
  const shoukakuConn = message.client?.shoukaku?.connections?.get(gid);
  if (shoukakuConn?.channelId) return true;
  return false;
}

export = {
  name: "leave",
      allowEmptyArgs: true,
  async execute(message?, args = []) {
    const sub = String(args[0] || "").toLowerCase();
    if (sub === "partnership") {
      const { executeLeavePartnership } = require("../../MultiGuild/utils/Partner/tenantPartnershipLeaveRuntime") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipLeaveRuntime");
      return executeLeavePartnership(message);
    }

    await message.channel.sendTyping();

    const session = getVoiceSession(message.guild?.id);
    const ownerId = session?.ownerId ? String(session.ownerId) : "";
    const botChannelId = message.guild?.members?.me?.voice?.channelId
      ? String(message.guild.members.me.voice.channelId)
      : "";
    if (botChannelId && !isLeaveInBotVoiceChat(message, botChannelId)) {
      const wrongChannel = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription(
          `Usa \`+leave\` nel canale vocale in cui è connesso il bot: <#${botChannelId}>.`,
        );
      return safeMessageReply(message, { embeds: [wrongChannel] });
    }
    if (ownerId && botChannelId && String(message.author?.id || "") !== ownerId) {
      const ownerMember = await message.guild.members.fetch(ownerId).catch(() => null);
      const ownerInBotChannel = Boolean(
        ownerMember?.voice?.channelId && String(ownerMember.voice.channelId) === botChannelId,
      );
      if (ownerInBotChannel) {
        const denied = new EmbedBuilder()
          .setColor("#ED4245")
          .setDescription(
            `Solo chi ha avviato la sessione può usare \`+leave\` finché è in vocale: <@${ownerId}>.`,
          );
        return safeMessageReply(message, { embeds: [denied], allowedMentions: { users: [] } });
      }
    }

    if (!hasActiveTtsOrMusicSession(message, botChannelId)) {
      if (botChannelId) {
        markMusicVoiceLeaveIntentional(message.client, message.guild.id);
        const ttsVc = getVoiceConnection(String(message.guild.id));
        if (ttsVc) ttsVc.destroy();
        const me =
          message.guild.members.me ||
          (await message.guild.members.fetch(message.client.user.id).catch(() => null));
        if (me?.voice?.channel) {
          await me.voice.setChannel(null).catch(() => null);
        }
        await leaveTtsGuild(message.guild.id, message.client);
        clearVoiceSession(message.guild.id);
      }
      const notConnectedEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("Il bot non è connesso a nessun canale vocale.");
      return safeMessageReply(message, { embeds: [notConnectedEmbed] });
    }

    markMusicVoiceLeaveIntentional(message.client, message.guild.id);

    const wasInVoice = Boolean(botChannelId);
    const ttsVc = getVoiceConnection(String(message.guild.id));
    if (ttsVc) ttsVc.destroy();
    const me =
      message.guild.members.me ||
      (await message.guild.members.fetch(message.client.user.id).catch(() => null));
    if (me?.voice?.channel) {
      await me.voice.setChannel(null).catch(() => null);
    }

    const ttsResult = await leaveTtsGuild(message.guild.id, message.client);
    clearVoiceSession(message.guild.id);

    if (!ttsResult.ok && ttsResult.reason === "not_connected" && !wasInVoice) {
      const notConnectedEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("Il bot non è connesso a nessun canale vocale.");
      return safeMessageReply(message, { embeds: [notConnectedEmbed] });
    }

    const okEmbed = new EmbedBuilder()
      .setColor("#ED4245")
      .setDescription("Grazie per aver usato il servizio.");
    return safeMessageReply(message, { embeds: [okEmbed] });
  },
};
