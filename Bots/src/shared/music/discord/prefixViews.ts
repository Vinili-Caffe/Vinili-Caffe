/** Prefix Music “view” twin Vinili/Caffè: play/now/next/previous/lyrics/queue/upcoming/requested. */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../discord/replyRuntime") as typeof import("../../discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../embeds/defaultFooter") as typeof import("../../embeds/defaultFooter");
const music = require("../services/lavalinkMusicService") as typeof import("../services/lavalinkMusicService");
const { resolveGuildLyrics } = require("../services/lyricsService") as typeof import("../services/lyricsService");
const { memberDisplayName, userAvatarUrlDynamic } = require("../../discord/guildDiscordIdentity") as typeof import("../../discord/guildDiscordIdentity");

const PRIVATE = 1 << 6;
const SPOTIFY = "<:VC_Spotify:1482527369477492797>";
const CROSS = "<a:VC_Cross:1482532424570376253>";
const ATTENTION = "<a:VC_Attention:1482534443632558151>";
const VERIFIED = "<a:VC_Verified:1482532479637127188>";

function profileOf(opts: Record<string, any> = {}) {
  return {
    prefix: String(opts.prefix || "+"),
    coffee: Boolean(opts.coffee),
    buildMusicListPayload: typeof opts.buildMusicListPayload === "function" ? opts.buildMusicListPayload : null,
  };
}

async function buildRequesterFooter(guild?, data?) {
  const id = data.requesterUserId ? String(data.requesterUserId) : "";
  if (id && guild?.members?.fetch) {
    const mem = await guild.members.fetch({ user: id, force: false }).catch(() => null);
    if (mem?.user) {
      const name = memberDisplayName(mem) || "Utente";
      return {
        text: `Richiesto da ${name}`.slice(0, 2048),
        iconURL: userAvatarUrlDynamic(mem, { size: 64 }),
      };
    }
  }
  const tag = String(data.requesterDisplayTag || "").trim();
  if (tag) return { text: `Richiesto da ${tag}`.slice(0, 2048) };
  return null;
}

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

function createPlayCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "play",
    args: true,
    description: p.coffee ? "Riproduce musica da titolo o URL." : "Riproduci musica da titolo o URL Spotify.",
    usage: `${p.prefix}play <URL o titolo>`,
    examples: [`${p.prefix}play male necessario`, `${p.prefix}play https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh`],
    async execute(message?, args?) {
      const query = Array.isArray(args) ? args.join(" ").trim() : "";
      if (!query) return;
      const metaHint = await resolveSpotifyMetaHint(message, query);
      const result: any = await music.playMusicRequest(
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
      const embed = new EmbedBuilder().setColor(result.ok ? 0x6f4e37 : 0xe74c3c);
      if (p.coffee) {
        const embedDescRaw =
          typeof result.embedDescription === "string" && result.embedDescription.trim()
            ? result.embedDescription.trim()
            : typeof result.embedBody === "string" && result.embedBody.trim()
              ? result.embedBody.trim()
              : "";
        const okDesc = result.ok ? embedDescRaw || String(result.message || "").trim() : null;
        if (result.ok && (result.embedTitle || embedDescRaw)) {
          const rawTitle = String(result.embedTitle || "").trim();
          const safeTitle = rawTitle && rawTitle.toLowerCase() !== "now playing" ? rawTitle : "";
          if (safeTitle) embed.setTitle(safeTitle.slice(0, 256));
          embed.setDescription(okDesc ? `${SPOTIFY} Now Playing: ${okDesc}` : `${SPOTIFY} Now Playing`);
        } else {
          embed.setDescription(
            result.ok
              ? `${SPOTIFY} Now Playing: ${okDesc || String(result.message || "").trim()}`
              : `${CROSS} ${result.message}`,
          );
        }
      } else {
        const okDesc =
          result.ok && typeof result.embedBody === "string" && result.embedBody.trim()
            ? result.embedBody.trim()
            : result.ok && typeof result.embedDescription === "string" && result.embedDescription.trim()
              ? `In riproduzione: ${result.embedDescription.trim()}`
              : result.ok
                ? String(result.message || "").trim()
                : null;
        if (result.ok) {
          const rawTitle = String(result.embedTitle || "").trim();
          const safeTitle =
            rawTitle &&
            rawTitle.toLowerCase() !== "now playing" &&
            rawTitle.toLowerCase() !== "in riproduzione"
              ? rawTitle
              : "";
          if (safeTitle) embed.setTitle(safeTitle.slice(0, 256));
          embed.setDescription(okDesc ? `${SPOTIFY} ${okDesc}` : `${SPOTIFY} In riproduzione`);
        } else {
          embed.setDescription(`<:vegax:1443934876440068179> ${result.message}`);
        }
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
}

function createNowCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "now",
    subcommands: ["playing"],
    allowEmptyArgs: true,
    subcommandUsages: { playing: `${p.prefix}now playing` },
    description: "Mostra il brano in riproduzione.",
    usage: p.coffee ? `${p.prefix}now [playing]` : `${p.prefix}now playing`,
    examples: [`${p.prefix}now playing`, `${p.prefix}now`],
    async execute(message?, args?) {
      const raw = String(args[0] || "playing").trim().toLowerCase();
      if (raw !== "playing") {
        const err = new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(
            p.coffee
              ? `${ATTENTION} Usa **${p.prefix}now playing**.`
              : `**Usa** \`${p.prefix}now\` **oppure** \`${p.prefix}now playing\`.`,
          );
        await safeMessageReply(
          message,
          applyDefaultFooterToEmbeds({ embeds: [err], allowedMentions: { repliedUser: false } }, message.guild),
        ).catch(() => null);
        return;
      }
      const data: any = await music.fetchGuildNowPlayingDetails(message.client, message.guild);
      if (!data.ok) {
        const err = new EmbedBuilder().setColor(0xff0000).setDescription(`**${data.message}**`);
        await safeMessageReply(
          message,
          applyDefaultFooterToEmbeds({ embeds: [err], allowedMentions: { repliedUser: false } }, message.guild),
        ).catch(() => null);
        return;
      }
      const progressLines = p.coffee
        ? `${data.progressBar}\n<t:${Math.floor(Date.now() / 1000)}:R> / ${data.lengthClock}`
        : `${data.progressBar}\n\`${data.positionClock}\` / \`${data.lengthClock}\``;
      const embed = new EmbedBuilder()
        .setColor(0x6f4e37)
        .setTitle("Now playing")
        .addFields(
          { name: "Brano", value: data.trackFieldValue, inline: false },
          {
            name: p.coffee ? "Tempo trascorso" : "Avanzamento",
            value: progressLines.slice(0, 1024),
            inline: false,
          },
          {
            name: p.coffee ? "Posizione nella coda" : "Posizione in coda",
            value: String(data.positionInQueue),
            inline: true,
          },
        )
        .setTimestamp(Date.now());
      if (data.paused) embed.setDescription(p.coffee ? "⏸️ In pausa" : "*In pausa*");
      if (data.thumbnailUrl) embed.setThumbnail(data.thumbnailUrl);
      const footer = await buildRequesterFooter(message.guild, data);
      if (footer) embed.setFooter(footer);
      await safeMessageReply(
        message,
        applyDefaultFooterToEmbeds({ embeds: [embed], allowedMentions: { repliedUser: false } }, message.guild),
      ).catch(() => null);
    },
  };
}

function createNextCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "next",
    subcommands: ["up"],
    allowEmptyArgs: true,
    subcommandUsages: { up: `${p.prefix}next up` },
    description: "Mostra il prossimo brano in coda.",
    usage: `${p.prefix}next [up]`,
    examples: [`${p.prefix}next up`, `${p.prefix}next`],
    async execute(message?, args?) {
      const raw = String(args[0] || "up").trim().toLowerCase();
      if (raw !== "up") {
        const err = new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(
            p.coffee
              ? `${ATTENTION} Usa **${p.prefix}next up**.`
              : `**Usa** \`${p.prefix}next\` **oppure** \`${p.prefix}next up\`.`,
          );
        await safeMessageReply(
          message,
          applyDefaultFooterToEmbeds({ embeds: [err], allowedMentions: { repliedUser: false } }, message.guild),
        ).catch(() => null);
        return;
      }
      const data: any = await music.fetchGuildNextUpDetails(message.client, message.guild);
      if (!data.ok) {
        const err = new EmbedBuilder().setColor(0xff0000).setDescription(`**${data.message}**`);
        await safeMessageReply(
          message,
          applyDefaultFooterToEmbeds({ embeds: [err], allowedMentions: { repliedUser: false } }, message.guild),
        ).catch(() => null);
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(0x6f4e37)
        .setTitle("Prossimo in coda 🎵")
        .addFields(
          { name: "Brano", value: data.trackFieldValue, inline: false },
          {
            name: p.coffee ? "Tempo stimato prima della riproduzione" : "Tempo stimato alla riproduzione",
            value: data.estimatedUntil,
            inline: true,
          },
          { name: p.coffee ? "Durata del brano" : "Durata", value: data.length, inline: true },
          {
            name: p.coffee ? "Posizione nella coda" : "Posizione in coda",
            value: String(data.positionInQueue),
            inline: false,
          },
        )
        .setTimestamp(Date.now());
      if (data.thumbnailUrl) embed.setThumbnail(data.thumbnailUrl);
      const footer = await buildRequesterFooter(message.guild, data);
      if (footer) embed.setFooter(footer);
      await safeMessageReply(
        message,
        applyDefaultFooterToEmbeds({ embeds: [embed], allowedMentions: { repliedUser: false } }, message.guild),
      ).catch(() => null);
    },
  };
}

function createPreviousCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "previous",
    description: "Torna al brano riprodotto prima di quello attuale.",
    usage: `${p.prefix}previous`,
    examples: [`${p.prefix}previous`],
    async execute(message?) {
      const result: any = await music.previousGuildTrack(message);
      const embedDescRaw =
        typeof result.embedDescription === "string" && result.embedDescription.trim()
          ? result.embedDescription.trim()
          : typeof result.embedBody === "string" && result.embedBody.trim()
            ? result.embedBody.trim()
            : "";
      const okDesc = result.ok
        ? embedDescRaw
          ? p.coffee
            ? `${SPOTIFY} ${VERIFIED} ${embedDescRaw}`
            : `${SPOTIFY} ${embedDescRaw}`
          : `${SPOTIFY} ${result.message}`
        : null;
      const embed = new EmbedBuilder().setColor(result.ok ? 0x6f4e37 : 0xff0000);
      if (result.ok && (result.embedTitle || embedDescRaw)) {
        embed.setTitle(String(result.embedTitle || "Now playing").slice(0, 256));
        embed.setDescription(okDesc);
      } else {
        embed.setDescription(result.ok ? okDesc : p.coffee ? `${CROSS} ${result.message}` : `**${result.message}**`);
      }
      await safeMessageReply(
        message,
        applyDefaultFooterToEmbeds({ embeds: [embed], allowedMentions: { repliedUser: false } }, message.guild),
      ).catch(() => null);
    },
  };
}

function createListCommand(kind?, label?, opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: kind,
    description: label,
    usage: `${p.prefix}${kind}`,
    examples: [`${p.prefix}${kind}`],
    async execute(message?) {
      if (!p.buildMusicListPayload) {
        const err = new EmbedBuilder().setColor(0xff0000).setDescription("**Lista musica non disponibile.**");
        await safeMessageReply(
          message,
          applyDefaultFooterToEmbeds({ embeds: [err], allowedMentions: { repliedUser: false } }, message.guild),
        ).catch(() => null);
        return;
      }
      const payload = await p.buildMusicListPayload(kind, message.client, message.guild, message.author.id, 0);
      await safeMessageReply(
        message,
        applyDefaultFooterToEmbeds({ ...payload, allowedMentions: { repliedUser: false } }, message.guild),
      ).catch(() => null);
    },
  };
}

function buildLyricsEmbed(title?, pageText?, pageIdx?, total?) {
  const footer = `\n\n**Pagina ${pageIdx + 1}/${total}**`;
  const desc = `${pageText}${footer}`.slice(0, 4096);
  return new EmbedBuilder()
    .setColor(0x6f4e37)
    .setTitle(String(title || "Testi").slice(0, 256))
    .setDescription(desc);
}

function encodeQuery(query?) {
  const raw = String(query || "").trim().slice(0, 40);
  if (!raw) return "-";
  return Buffer.from(raw, "utf8").toString("base64url").slice(0, 48) || "-";
}

function decodeQuery(token?) {
  const t = String(token || "").trim();
  if (!t || t === "-") return "";
  try {
    return Buffer.from(t, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function buildLyricsRows(authorId?, pageIdx?, total?, queryToken?) {
  const base = `vcly:${authorId}:${pageIdx}:${queryToken}`;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${base}:prev`)
        .setEmoji("<a:vegaleftarrow:1462914743416131816>")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIdx <= 0 || total <= 1),
      new ButtonBuilder()
        .setCustomId(`${base}:next`)
        .setEmoji("<a:vegarightarrow:1443673039156936837>")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIdx >= total - 1 || total <= 1),
    ),
  ];
}

function parseLyricsCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts.length < 5 || parts[0] !== "vcly") return null;
  const [, authorId, pageRaw, queryToken, action] = parts;
  if (!/^\d{16,20}$/.test(authorId)) return null;
  if (action !== "prev" && action !== "next") return null;
  return {
    authorId,
    page: Math.max(0, Math.floor(Number(pageRaw) || 0)),
    queryToken: String(queryToken || "-"),
    action,
  };
}

async function buildLyricsPayload(client?, guild?, authorId?, pageIdx?, query?) {
  const result = await resolveGuildLyrics(client, guild, query);
  if (!result?.ok) {
    return {
      embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`**${result?.message || "Errore"}**`)],
      components: [],
    };
  }
  const pages = Array.isArray(result.pages) ? result.pages : [];
  if (!pages.length) {
    return {
      embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("**Nessun testo da mostrare.**")],
      components: [],
    };
  }
  const total = pages.length;
  const safePage = Math.min(total - 1, Math.max(0, pageIdx));
  const queryToken = encodeQuery(query);
  return {
    embeds: [buildLyricsEmbed(result.title, pages[safePage], safePage, total)],
    components: total > 1 ? buildLyricsRows(authorId, safePage, total, queryToken) : [],
  };
}

async function handleLyricsInteraction(interaction?) {
  const parsed = parseLyricsCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id) !== parsed.authorId) {
    await interaction
      .reply({ content: "Solo chi ha usato il comando può cambiare pagina.", flags: PRIVATE })
      .catch(() => null);
    return true;
  }
  const query = decodeQuery(parsed.queryToken);
  let page = parsed.page;
  if (parsed.action === "prev") page = Math.max(0, page - 1);
  else if (parsed.action === "next") page = page + 1;

  const payload = applyDefaultFooterToEmbeds(
    await buildLyricsPayload(interaction.client, interaction.guild, parsed.authorId, page, query),
    interaction.guild,
  );
  await interaction.update(payload).catch(() => null);
  return true;
}

function createLyricsCommand(opts: Record<string, any> = {}) {
  const p = profileOf(opts);
  return {
    name: "lyrics",
    allowEmptyArgs: true,
    description: "Mostra i testi del brano in riproduzione o di un brano ricercato.",
    usage: `${p.prefix}lyrics [brano]`,
    examples: [`${p.prefix}lyrics`, `${p.prefix}lyrics 16 marzo achille lauro`],
    parseLyricsCustomId,
    handleLyricsInteraction,
    buildLyricsPayload,
    async execute(message?, args?) {
      const query = Array.isArray(args) ? args.join(" ").trim() : "";
      const payload = await buildLyricsPayload(message.client, message.guild, message.author.id, 0, query);
      await safeMessageReply(
        message,
        applyDefaultFooterToEmbeds({ ...payload, allowedMentions: { repliedUser: false } }, message.guild),
      ).catch(() => null);
    },
  };
}

function buildMusicViewCommands(opts: Record<string, any> = {}) {
  return [
    createPlayCommand(opts),
    createNowCommand(opts),
    createNextCommand(opts),
    createPreviousCommand(opts),
    createLyricsCommand(opts),
    createListCommand("queue", "Mostra la coda di riproduzione.", opts),
    createListCommand("upcoming", "Anteprima dei prossimi brani in coda.", opts),
    createListCommand("requested", "Mostra chi ha richiesto i brani in coda / sessione.", opts),
  ];
}

export = {
  buildMusicViewCommands,
  createPlayCommand,
  createNowCommand,
  createNextCommand,
  createPreviousCommand,
  createLyricsCommand,
  parseLyricsCustomId,
  handleLyricsInteraction,
  buildLyricsPayload,
};
