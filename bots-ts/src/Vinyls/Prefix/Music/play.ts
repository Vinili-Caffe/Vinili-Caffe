const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter") as typeof import("../../Utils/Embeds/defaultFooter");
const { playMusicRequest } = require("../../Services/Music/lavalinkMusicService") as typeof import("../../Services/Music/lavalinkMusicService");

function extractSpotifyMetaFromDiscordEmbeds(embeds?) {
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

async function resolveSpotifyMetaHint(message?, query?) {
  const q = String(query || "").trim();
  if (!/open\.spotify\.com/i.test(q) && !/^spotify:/i.test(q)) return null;
    return extractSpotifyMetaFromDiscordEmbeds(message?.embeds);
}

export = {
  name: "play",
  args: true,
  description:
    "Riproduci musica da titolo o URL Spotify.",
  usage: "+play <URL o titolo>",
  examples: [
    "+play male necessario",
    "+play https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh",
  ],
  async execute(message?, args?) {
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
    /* nameSearchOrig1: embedBody già = "In riproduzione: [link]" — no doppio Now Playing EN */
    const okDesc =
      result.ok && typeof result.embedBody === "string" && result.embedBody.trim()
        ? result.embedBody.trim()
        : result.ok && typeof result.embedDescription === "string" && result.embedDescription.trim()
          ? `In riproduzione: ${result.embedDescription.trim()}`
          : result.ok
            ? String(result.message || "").trim()
            : null;
    const embed = new EmbedBuilder().setColor(result.ok ? 0x6f4e37 : 0xe74c3c);
    if (result.ok) {
      const rawTitle = String(result.embedTitle || "").trim();
      const safeTitle =
        rawTitle &&
        rawTitle.toLowerCase() !== "now playing" &&
        rawTitle.toLowerCase() !== "in riproduzione"
          ? rawTitle
          : "";
      if (safeTitle) embed.setTitle(safeTitle.slice(0, 256));
      embed.setDescription(okDesc ? `${spotifyEmoji} ${okDesc}` : `${spotifyEmoji} In riproduzione`);
    } else {
      embed.setDescription(`<:vegax:1443934876440068179> ${result.message}`);
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