const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter");
const { playMusicRequest } = require("../../Services/Music/lavalinkMusicService");

function extractSpotifyMetaFromDiscordEmbeds(embeds) {
  if (!Array.isArray(embeds) || !embeds.length) return null;
  for (const e of embeds) {
    const provider = String(e?.provider?.name || "").toLowerCase();
    const url = String(e?.url || "").trim();
    const looksSpotify = provider.includes("spotify") || /open\.spotify\.com/i.test(url);
    if (!looksSpotify && embeds.length > 1) continue;
    const title = String(e?.title || "").trim();
    if (!title) continue;
    let author = String(e?.author?.name || "").trim();
    if (!author) {
      const desc = String(e?.description || "").trim();
      author = desc.split(/\n|•|·|\|/)[0].trim();
    }
    author = author.replace(/\s+[•·].*$/, "").trim();
    return { title, author };
  }
  return null;
}

async function resolveSpotifyMetaHint(message, query) {
  const q = String(query || "").trim();
  if (!/open\.spotify\.com/i.test(q) && !/^spotify:/i.test(q)) return null;
    return extractSpotifyMetaFromDiscordEmbeds(message?.embeds);
}

module.exports = {
  name: "play",
  args: true,
  description: "Riproduce musica da titolo o URL.",
  usage: ",play <URL o titolo>",
  examples: [",play male necessario", ",play https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh"],
  async execute(message, args) {
    const query = Array.isArray(args) ? args.join(" ").trim() : "";
    if (!query) return;
    const metaHint = await resolveSpotifyMetaHint(message, query);
    const result = await playMusicRequest(
      {
        client: message.client,
        guild: message.guild,
        member: message.member,
        textChannelId: message.channelId,
        requesterUser: message.author,
        metaHint,
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
        result.ok ? `${spotifyEmoji} Now Playing: ${okDesc || String(result.message || "").trim()}` : `<a:VC_Cross:1482532424570376253> ${result.message}`,
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