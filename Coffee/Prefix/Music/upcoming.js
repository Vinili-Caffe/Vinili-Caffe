const crypto = require("crypto");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter");
const { fetchGuildUpcomingQueueRows } = require("../../Services/Music/lavalinkMusicService");
const PAGE_SIZE = 10;
const upcomingUiSessions = new Map();

function safeDiscordLinkLabel(s) {
  let t = String(s || "").trim();
  t = t.replace(/\*\*/g, "");
  t = t.replace(/[\[\]()]/g, "");
  return t.trim() || "Brano";
}

function embedSafe(s) {
  return String(s || "")
    .replace(/\*/g, "")
    .replace(/_/g, "")
    .trim() || "?";
}

function upcomingLine(row) {
  const titleLbl = safeDiscordLinkLabel(row.title).slice(0, 180);
  const authorPlain = embedSafe(row.author).slice(0, 120);
  const titlePart = row.url
    ? `[**${titleLbl}**](${row.url})`
    : `**${embedSafe(row.title).slice(0, 180)}**`;
  return `${row.upcomingIndex}. <t:${Math.floor(Date.now() / 1000)}:R> ${titlePart} by ${authorPlain}`;
}

function chunkRowsToPageBodies(rows) {
  const bodies = [];
  for (let i = 0; i < rows.length; i += PAGE_SIZE) {
    bodies.push(rows.slice(i, i + PAGE_SIZE).map(upcomingLine).join("\n"));
  }
  return bodies;
}

function buildUpcomingEmbed(pageIdx, totalPages, pageBody) {
  const head = `**Pagina ${pageIdx + 1} di ${totalPages}**`;
  const sub = "**Tra parentesi:** minuti prima dell'inizio stimato.";
  const hint = "\n\n<:VC_page5:1482459835042762752> · <:VC_page4:1482459791975645226> · <:VC_page3:1482459759268462613> · <:VC_page2:1482459708998637659> · <:VC_page1:1482459671062403102> · menu";
  const desc = `${head}\n${sub}\n\n${pageBody}${totalPages > 1 ? hint : ""}`.slice(0, 4096);
  return new EmbedBuilder().setColor(0x6f4e37).setTitle("In arrivo 🎵").setDescription(desc);
}

function buildUpcomingComponents(sessionKey, pageIdx, totalPages) {
  if (totalPages <= 1) return [];
  const out = [];
  if (totalPages <= 25) {
    out.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`vcup:${sessionKey}:jump`)
          .setPlaceholder(`Vai alla pagina (Pagina ${pageIdx + 1} di ${totalPages})`)
          .addOptions(
            Array.from({ length: totalPages }, (_, i) => ({
              label: `Pagina ${i + 1} di ${totalPages}`,
              value: String(i),
              default: i === pageIdx,
            })),
          ),
      ),
    );
  }
  out.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`vcup:${sessionKey}:first`)
        .setEmoji("<:VC_page1:1482459684630958223>")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIdx <= 0),
      new ButtonBuilder()
        .setCustomId(`vcup:${sessionKey}:prev`)
        .setEmoji("<:VC_page5:1482459835042762752>")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIdx <= 0),
      new ButtonBuilder()
        .setCustomId(`vcup:${sessionKey}:next`)
        .setEmoji("<:VC_page4:1482459791975645226>")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIdx >= totalPages - 1),
      new ButtonBuilder()
        .setCustomId(`vcup:${sessionKey}:last`)
        .setEmoji("<:VC_page3:1482459759268462613>")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIdx >= totalPages - 1),
    ),
  );
  return out;
}

function registerUpcomingSession(key, data) {
  upcomingUiSessions.set(key, data);
}

function deleteUpcomingSession(key) {
  upcomingUiSessions.delete(key);
}

function getUpcomingSession(key) {
  return upcomingUiSessions.get(key) || null;
}

module.exports = {
  name: "upcoming",
  description: "Mostra i brani in coda con tempo stimato prima dell'inizio.",
  usage: ",upcoming",
  examples: [",upcoming"],
  async execute(message) {
    const result = await fetchGuildUpcomingQueueRows(message.client, message.guild);
    if (!result.ok) {
      const err = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`<a:VC_Cross:1482532424570376253> ${result.message}`);
      await safeMessageReply(
        message,
        applyDefaultFooterToEmbeds(
          { embeds: [err], allowedMentions: { repliedUser: false } },
          message.guild,
        ),
      ).catch(() => null);
      return;
    }
    const pageBodies = chunkRowsToPageBodies(result.rows);
    const totalPages = pageBodies.length;
    const sessionKey = crypto.randomBytes(16).toString("hex");
    const state = { pageBodies, authorId: message.author.id, page: 0 };
    registerUpcomingSession(sessionKey, state);
    const embed = buildUpcomingEmbed(0, totalPages, pageBodies[0]);
    const components = buildUpcomingComponents(sessionKey, 0, totalPages);
    const sent = await safeMessageReply(
      message,
      applyDefaultFooterToEmbeds(
        {
          embeds: [embed],
          components,
          allowedMentions: { repliedUser: false },
        },
        message.guild,
      ),
    ).catch(() => null);
    if (!sent?.createMessageComponentCollector) {
      deleteUpcomingSession(sessionKey);
      return;
    }
    if (totalPages <= 1) {
      deleteUpcomingSession(sessionKey);
      return;
    }
    const collector = sent.createMessageComponentCollector({
      time: 420_000,
      filter: (i) => String(i.customId || "").startsWith(`vcup:${sessionKey}:`),
    });
    collector.on("collect", async (i) => {
      const st = getUpcomingSession(sessionKey);
      if (!st) {
        await i.deferUpdate().catch(() => null);
        return;
      }
      if (i.user.id !== st.authorId) {
        await i.reply({ content: "<a:VC_Attention:1482534443632558151> Solo chi ha usato il comando può navigare.", ephemeral: true }).catch(() => null);
        return;
      }
      const last = st.pageBodies.length - 1;
      if (i.isStringSelectMenu()) {
        const n = Number(i.values[0]);
        if (Number.isFinite(n)) st.page = Math.min(last, Math.max(0, Math.floor(n)));
      } else if (i.isButton()) {
        const act = String(i.customId || "").split(":").pop();
        if (act === "first") st.page = 0;
        else if (act === "prev") st.page = Math.max(0, st.page - 1);
        else if (act === "next") st.page = Math.min(last, st.page + 1);
        else if (act === "last") st.page = last;
      }
      const nextEmbed = buildUpcomingEmbed(st.page, st.pageBodies.length, st.pageBodies[st.page]);
      const nextComponents = buildUpcomingComponents(sessionKey, st.page, st.pageBodies.length);
      await i
        .update(
          applyDefaultFooterToEmbeds({ embeds: [nextEmbed], components: nextComponents }, message.guild),
        )
        .catch(() => null);
    });
    collector.on("end", () => {
      deleteUpcomingSession(sessionKey);
      sent.edit({ components: [] }).catch(() => null);
    });
  },
};