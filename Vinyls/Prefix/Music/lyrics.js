const crypto = require("crypto");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter");
const {
  resolveGuildLyrics,
  registerLyricsSession,
  deleteLyricsSession,
  getLyricsSession,
} = require("../../Services/Music/lyricsService");

function buildLyricsEmbed(title, pageText, pageIdx, total) {
  const footer = `\n\n**Pagina ${pageIdx + 1}/${total}**`;
  const desc = `${pageText}${footer}`.slice(0, 4096);
  return new EmbedBuilder()
    .setColor(0x6f4e37)
    .setTitle(String(title || "Testi").slice(0, 256))
    .setDescription(desc);
}

function buildRows(sessionKey, pageIdx, total) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vcly:${sessionKey}:prev`)
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIdx <= 0),
    new ButtonBuilder()
      .setCustomId(`vcly:${sessionKey}:next`)
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIdx >= total - 1),
  );
}

module.exports = {
  name: "lyrics",
  allowEmptyArgs: true,
  description:
    "Mostra i testi del brano in riproduzione (senza argomenti) o di una ricerca LRCLIB, con pagine e pulsanti.",
  usage: "+lyrics [ricerca]",
  examples: ["+lyrics", "+lyrics 16 marzo achille lauro"],
  async execute(message, args) {
    const query = Array.isArray(args) ? args.join(" ").trim() : "";
    const result = await resolveGuildLyrics(message.client, message.guild, query);
    if (!result.ok) {
      const err = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`**${result.message}**`);
      await safeMessageReply(
        message,
        applyDefaultFooterToEmbeds(
          { embeds: [err], allowedMentions: { repliedUser: false } },
          message.guild,
        ),
      ).catch(() => null);
      return;
    }
    const pages = result.pages;
    if (!Array.isArray(pages) || !pages.length) {
      const err = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription("**Nessun testo da mostrare.**");
      await safeMessageReply(
        message,
        applyDefaultFooterToEmbeds(
          { embeds: [err], allowedMentions: { repliedUser: false } },
          message.guild,
        ),
      ).catch(() => null);
      return;
    }
    const sessionKey = crypto.randomBytes(16).toString("hex");
    const state = {
      pages,
      title: result.title,
      authorId: message.author.id,
      page: 0,
    };
    registerLyricsSession(sessionKey, state);
    const embed = buildLyricsEmbed(state.title, pages[0], 0, pages.length);
    const row = buildRows(sessionKey, 0, pages.length);
    const sent = await safeMessageReply(
      message,
      applyDefaultFooterToEmbeds(
        {
          embeds: [embed],
          components: [row],
          allowedMentions: { repliedUser: false },
        },
        message.guild,
      ),
    ).catch(() => null);
    if (!sent?.createMessageComponentCollector) {
      deleteLyricsSession(sessionKey);
      return;
    }
    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 420_000,
      filter: (i) => String(i.customId || "").startsWith(`vcly:${sessionKey}:`),
    });
    collector.on("collect", async (i) => {
      const st = getLyricsSession(sessionKey);
      if (!st) {
        await i.deferUpdate().catch(() => null);
        return;
      }
      if (i.user.id !== st.authorId) {
        await i.reply({ content: "Solo chi ha usato il comando può cambiare pagina.", ephemeral: true }).catch(
          () => null,
        );
        return;
      }
      const dir = String(i.customId || "").split(":").pop();
      if (dir === "prev") st.page = Math.max(0, st.page - 1);
      else if (dir === "next") st.page = Math.min(st.pages.length - 1, st.page + 1);
      const nextEmbed = buildLyricsEmbed(st.title, st.pages[st.page], st.page, st.pages.length);
      const nextRow = buildRows(sessionKey, st.page, st.pages.length);
      await i
        .update(
          applyDefaultFooterToEmbeds({ embeds: [nextEmbed], components: [nextRow] }, message.guild),
        )
        .catch(() => null);
    });
    collector.on("end", () => {
      deleteLyricsSession(sessionKey);
      sent.edit({ components: [] }).catch(() => null);
    });
  },
};