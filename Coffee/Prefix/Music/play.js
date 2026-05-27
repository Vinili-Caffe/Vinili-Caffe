const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter");
const { playMusicRequest } = require("../../Services/Music/lavalinkMusicService");

module.exports = {
  name: "play",
  args: true,
  description: "Riproduce musica da titolo o URL.",
  usage: ",play <URL o titolo>",
  examples: [",play male necessario", ",play https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh"],
  async execute(message, args) {
    const query = Array.isArray(args) ? args.join(" ").trim() : "";
    if (!query) return;
    const result = await playMusicRequest(
      {
        client: message.client,
        guild: message.guild,
        member: message.member,
        textChannelId: message.channelId,
        requesterUser: message.author,
      },
      query,
    );
    if (Array.isArray(result.embeds) && result.embeds.length) {
      await safeMessageReply(
        message,
        applyDefaultFooterToEmbeds(
          { embeds: result.embeds, allowedMentions: { repliedUser: false } },
          message.guild,
        ),
      ).catch(() => null);
      return;
    }
    const spotifyEmoji = "<:VC_Spotify:1482527369477492797>";
    const verified = "<a:VC_Verified:1482532479637127188>";
    const embedDescRaw =
      typeof result.embedDescription === "string" && result.embedDescription.trim()
        ? result.embedDescription.trim()
        : typeof result.embedBody === "string" && result.embedBody.trim()
          ? result.embedBody.trim()
          : "";
    const okDesc = result.ok
      ? embedDescRaw
        ? `${spotifyEmoji} ${verified} ${embedDescRaw}`
        : `${spotifyEmoji} ${result.message}`
      : null;
    const embed = new EmbedBuilder().setColor(result.ok ? 0x6f4e37 : 0xe74c3c);
    if (result.ok && (result.embedTitle || embedDescRaw)) {
      embed.setTitle(String(result.embedTitle || "Now playing").slice(0, 256));
      embed.setDescription(okDesc);
    } else {
      embed.setDescription(
        result.ok ? okDesc : `<a:VC_Cross:1482532424570376253> ${result.message}`,
      );
    }
    await safeMessageReply(
      message,
      applyDefaultFooterToEmbeds(
        { embeds: [embed], allowedMentions: { repliedUser: false } },
        message.guild,
      ),
    ).catch(() => null);
  },
};