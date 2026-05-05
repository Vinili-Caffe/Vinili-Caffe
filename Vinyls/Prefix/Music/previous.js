const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter");
const { previousGuildTrack } = require("../../Services/Music/lavalinkMusicService");

module.exports = {
  name: "previous",
  description: "Torna al brano riprodotto prima di quello attuale.",
  usage: "+previous",
  examples: ["+previous"],
  async execute(message) {
    const result = await previousGuildTrack(message);
    const spotifyEmoji = "<:VC_Spotify:1482527369477492797>";
    const okDesc =
      result.ok && typeof result.embedBody === "string" && result.embedBody.trim()
        ? `${spotifyEmoji} ${result.embedBody.trim()}`
        : result.ok
          ? `${spotifyEmoji} ${result.message}`
          : null;
    const embed = new EmbedBuilder()
      .setColor(result.ok ? 0x6f4e37 : 0xff0000)
      .setDescription(
        result.ok ? okDesc : `**${result.message}**`,
      );
    await safeMessageReply(
      message,
      applyDefaultFooterToEmbeds(
        { embeds: [embed], allowedMentions: { repliedUser: false } },
        message.guild,
      ),
    ).catch(() => null);
  },
};