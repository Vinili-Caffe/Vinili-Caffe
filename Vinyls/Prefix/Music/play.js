const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter");
const { playMusicRequest } = require("../../Services/Music/lavalinkMusicService");

module.exports = {
  name: "play",
  args: true,
  description:
    "Riproduci musica da titolo o URL Spotify.",
  usage: "+play <URL o titolo>",
  examples: [
    "+play male necessario",
    "+play https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh",
  ],
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
    const embedDescRaw =
      typeof result.embedDescription === "string" && result.embedDescription.trim()
        ? result.embedDescription.trim()
        : typeof result.embedBody === "string" && result.embedBody.trim()
          ? result.embedBody.trim()
          : "";
    const okDesc = result.ok ? (embedDescRaw || String(result.message || "").trim()) : null;
    const embed = new EmbedBuilder().setColor(result.ok ? 0x6f4e37 : 0xe74c3c);
    if (result.ok && (result.embedTitle || embedDescRaw)) {
      const rawTitle = String(result.embedTitle || "").trim();
      const safeTitle = rawTitle && rawTitle.toLowerCase() !== "now playing" ? rawTitle : "";
      if (safeTitle) embed.setTitle(safeTitle.slice(0, 256));
      embed.setDescription(okDesc ? `${spotifyEmoji} Now Playing: ${okDesc}` : `${spotifyEmoji} Now Playing`);
    } else {
      embed.setDescription(
        result.ok ? `${spotifyEmoji} Now Playing: ${okDesc || String(result.message || "").trim()}` : `<:vegax:1443934876440068179> ${result.message}`,
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