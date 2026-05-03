const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter");
const { playMusicRequest } = require("../../Services/Music/lavalinkMusicService");

module.exports = {
  name: "play",
  args: true,
  description:
    "Riproduci musica da titolo, URL o Spotify (brano, album, playlist; no podcast). Env `MUSIC_SEARCH_MODE`: omesso/`youtube` (default), `spotify` (prima Spotify su testo, poi YouTube se serve; link YouTube bloccati), `spotify_first` (come spotify ma accetta anche link YouTube). Chi avvia la sessione controlla skip, stop, volume, ecc.",
  usage: "+play <URL o titolo>",
  examples: [
    "+play male necessario",
    "+play https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh",
    "+play https://www.youtube.com/watch?v=dQw4w9WgXcQ",
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
    const okDesc =
      result.ok && typeof result.embedBody === "string" && result.embedBody.trim()
        ? `${spotifyEmoji} ${result.embedBody.trim()}`
        : result.ok
          ? `${spotifyEmoji} ${result.message}`
          : null;
    const embed = new EmbedBuilder()
      .setColor(result.ok ? 0x6f4e37 : 0xe74c3c)
      .setDescription(
        result.ok ? okDesc : `<:vegax:1443934876440068179> ${result.message}`,
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