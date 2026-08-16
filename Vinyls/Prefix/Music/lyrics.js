const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter");
const { resolveGuildLyrics } = require("../../Services/Music/lyricsService");

const PRIVATE = 1 << 6;

function buildLyricsEmbed(title, pageText, pageIdx, total) {
  const footer = `\n\n**Pagina ${pageIdx + 1}/${total}**`;
  const desc = `${pageText}${footer}`.slice(0, 4096);
  return new EmbedBuilder()
    .setColor(0x6f4e37)
    .setTitle(String(title || "Testi").slice(0, 256))
    .setDescription(desc);
}

function encodeQuery(query) {
  const raw = String(query || "").trim().slice(0, 40);
  if (!raw) return "-";
  return Buffer.from(raw, "utf8").toString("base64url").slice(0, 48) || "-";
}

function decodeQuery(token) {
  const t = String(token || "").trim();
  if (!t || t === "-") return "";
  try {
    return Buffer.from(t, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function buildLyricsRows(authorId, pageIdx, total, queryToken) {
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

function parseLyricsCustomId(customId) {
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

async function buildLyricsPayload(client, guild, authorId, pageIdx, query) {
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

async function handleLyricsInteraction(interaction) {
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

module.exports = {
  name: "lyrics",
  allowEmptyArgs: true,
  description: "Mostra i testi del brano in riproduzione o di un brano ricercato.",
  usage: "+lyrics [brano]",
  examples: ["+lyrics", "+lyrics 16 marzo achille lauro"],
  parseLyricsCustomId,
  handleLyricsInteraction,
  buildLyricsPayload,
  async execute(message, args) {
    const query = Array.isArray(args) ? args.join(" ").trim() : "";
    const payload = await buildLyricsPayload(
      message.client,
      message.guild,
      message.author.id,
      0,
      query,
    );
    await safeMessageReply(
      message,
      applyDefaultFooterToEmbeds(
        { ...payload, allowedMentions: { repliedUser: false } },
        message.guild,
      ),
    ).catch(() => null);
  },
};
