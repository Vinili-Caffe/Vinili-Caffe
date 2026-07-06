const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { joinTtsChannel } = require("../../Services/TTS/ttsService");
const { setVoiceSession } = require("../../Services/Voice/voiceSessionService");
const { EPHEMERAL_TTL_SHORT_MS, scheduleMessageDeletion } = require("../../Utils/Config/ephemeralMessageTtl");

module.exports = {
  name: "join",
  allowEmptyArgs: true,
  async execute(message) {
    await message.channel.sendTyping();
    const voiceChannel = message.member?.voice?.channel;

    if (!voiceChannel) {
      const warnEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("<a:VC_Cross:1482532424570376253> Devi essere in un canale vocale.");
      const warn = await safeMessageReply(message, { embeds: [warnEmbed] });
      if (warn) scheduleMessageDeletion(warn, EPHEMERAL_TTL_SHORT_MS);
      return;
    }

    if (!voiceChannel.joinable) {
      const noPermEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("<a:VC_Cross:1482532424570376253> Non ho i permessi per entrare in quel canale vocale.");
      return safeMessageReply(message, { embeds: [noPermEmbed] });
    }

    const ttsResult = await joinTtsChannel(voiceChannel);
    if (!ttsResult.ok && ttsResult.reason === "music_active") {
      const { buildMusicBlocksTtsUserMessage } = require("../../../shared/discord/musicTtsVoiceGuard");
      const musicEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription(buildMusicBlocksTtsUserMessage(ttsResult.musicChannelId, ","));
      const warn = await safeMessageReply(message, { embeds: [musicEmbed] });
      if (warn) scheduleMessageDeletion(warn, EPHEMERAL_TTL_SHORT_MS);
      return;
    }
    if (!ttsResult.ok && ttsResult.reason === "locked") {
      const lockedEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription(
          "<a:VC_Cross:1482532424570376253> Il TTS è già attivo in un altro canale vocale. Usa `,leave` lì o nel canale attuale, poi `,join` qui.",
        );
      const warn = await safeMessageReply(message, { embeds: [lockedEmbed] });
      if (warn) scheduleMessageDeletion(warn, EPHEMERAL_TTL_SHORT_MS);
      return;
    }

    if (!ttsResult.ok) {
      const failedEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("<a:VC_Cross:1482532424570376253> Non riesco a connettermi al canale vocale in questo momento. Riprova tra qualche secondo.");
      const warn = await safeMessageReply(message, { embeds: [failedEmbed] });
      if (warn) scheduleMessageDeletion(warn, EPHEMERAL_TTL_SHORT_MS);
      return;
    }

    setVoiceSession(message.guild?.id, {
      mode: "tts",
      channelId: voiceChannel.id,
      ownerId: message.author?.id,
    });

    const okEmbed = new EmbedBuilder()
      .setColor("#57F287")
      .setDescription("🔊 Connesso al canale vocale.");
    return safeMessageReply(message, { embeds: [okEmbed] });
  },
};