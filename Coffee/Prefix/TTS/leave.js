const { EmbedBuilder } = require("discord.js");
const { getVoiceConnection } = require("@discordjs/voice");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { markMusicVoiceLeaveIntentional } = require("../../Services/Music/lavalinkMusicService");
const { leaveTtsGuild } = require("../../Services/TTS/ttsService");
const { clearVoiceSession, getVoiceSession } = require("../../Services/Voice/voiceSessionService");

module.exports = {
  name: "leave",
  allowEmptyArgs: true,
  async execute(message) {
    await message.channel.sendTyping();

    const session = getVoiceSession(message.guild?.id);
    const ownerId = session?.ownerId ? String(session.ownerId) : "";
    const botChannelId = message.guild?.members?.me?.voice?.channelId ? String(message.guild.members.me.voice.channelId) : "";
    if (ownerId && botChannelId && String(message.author?.id || "") !== ownerId) {
      const ownerMember = await message.guild.members.fetch(ownerId).catch(() => null);
      const ownerInBotChannel = Boolean(ownerMember?.voice?.channelId && String(ownerMember.voice.channelId) === botChannelId);
      if (ownerInBotChannel) {
        const denied = new EmbedBuilder()
          .setColor("#ED4245")
          .setDescription(`Solo chi ha avviato la sessione può usare \`+leave\` finché è in vocale: <@${ownerId}>.`);
        return safeMessageReply(message, { embeds: [denied], allowedMentions: { users: [] } });
      }
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