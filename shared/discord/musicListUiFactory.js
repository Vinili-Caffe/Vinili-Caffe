const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");

const PAGE_SIZE = 10;
const PRIVATE = 1 << 6;

function safeDiscordLinkLabel(s) {
  let t = String(s || "").trim();
  t = t.replace(/\*\*/g, "");
  t = t.replace(/[\[\]()]/g, "");
  return t.trim() || "Traccia";
}

function embedSafe(s) {
  return String(s || "").replace(/\*/g, "").replace(/_/g, "").trim() || "?";
}

function queueLine(row) {
  const titleLbl = safeDiscordLinkLabel(row.title).slice(0, 180);
  const authorPlain = embedSafe(row.author).slice(0, 120);
  const titlePart = row.url
    ? `[**${titleLbl}**](${row.url})`
    : `**${embedSafe(row.title).slice(0, 180)}**`;
  return `${row.queueIndex}. \`[${row.dur}]\` ${titlePart} by ${authorPlain}`;
}

function upcomingLine(row) {
  const titleLbl = safeDiscordLinkLabel(row.title).slice(0, 180);
  const authorPlain = embedSafe(row.author).slice(0, 120);
  const titlePart = row.url
    ? `[**${titleLbl}**](${row.url})`
    : `**${embedSafe(row.title).slice(0, 180)}**`;
  return `${row.upcomingIndex}. \`[${row.etaClock}]\` ${titlePart} by ${authorPlain}`;
}

function requestedLine(row) {
  const titleLbl = safeDiscordLinkLabel(row.title).slice(0, 180);
  const authorPlain = embedSafe(row.author).slice(0, 120);
  const titlePart = row.url
    ? `[**${titleLbl}**](${row.url})`
    : `**${embedSafe(row.title).slice(0, 180)}**`;
  return `${row.listIndex}. \`[${row.dur}]\` ${titlePart} by ${authorPlain}`;
}

function chunkRowsToPageBodies(rows, lineFn) {
  const bodies = [];
  for (let i = 0; i < rows.length; i += PAGE_SIZE) {
    bodies.push(rows.slice(i, i + PAGE_SIZE).map(lineFn).join("\n"));
  }
  return bodies.length ? bodies : ["_(vuoto)_"];
}

function createMusicListUi(deps) {
  const applyDefaultFooterToEmbeds = deps.applyDefaultFooterToEmbeds;
  const KIND = {
    queue: {
      prefix: "vcqu",
      title: "Coda",
      subtitle: null,
      fetch: deps.fetchGuildQueueEntryRows,
      line: queueLine,
    },
    upcoming: {
      prefix: "vcup",
      title: "In arrivo",
      subtitle: "_Tra parentesi: minuti prima dell'inizio stimato._",
      fetch: deps.fetchGuildUpcomingQueueRows,
      line: upcomingLine,
    },
    requested: {
      prefix: "vcreq",
      title: "Richieste (sessione)",
      subtitle: "_Ordine: già riprodotte in questa sessione, poi in riproduzione, poi in coda._",
      fetch: deps.fetchGuildRequestedSessionRows,
      line: requestedLine,
    },
  };

  function buildListEmbed(kindKey, pageIdx, totalPages, pageBody) {
    const kind = KIND[kindKey];
    const head = `**Pagina ${pageIdx + 1}/${totalPages}**`;
    const sub = kind.subtitle ? `\n${kind.subtitle}` : "";
    const hint = "\n\n`<<` · `<` · `>` · `>>` · menu";
    const desc = `${head}${sub}\n\n${pageBody}${totalPages > 1 ? hint : ""}`.slice(0, 4096);
    return new EmbedBuilder().setColor(0x6f4e37).setTitle(kind.title).setDescription(desc);
  }

  function buildListComponents(kindKey, authorId, pageIdx, totalPages) {
    if (totalPages <= 1) return [];
    const prefix = KIND[kindKey].prefix;
    const base = `${prefix}:${authorId}:${pageIdx}`;
    const out = [];
    if (totalPages <= 25) {
      out.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`${base}:jump`)
            .setPlaceholder(`Vai alla pagina (${pageIdx + 1}/${totalPages})`)
            .addOptions(
              Array.from({ length: totalPages }, (_, i) => ({
                label: `Pagina ${i + 1} / ${totalPages}`,
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
          .setCustomId(`${base}:first`)
          .setEmoji("<:1343arrowleft:1525249879151083621>")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageIdx <= 0),
        new ButtonBuilder()
          .setCustomId(`${base}:prev`)
          .setEmoji("<:1343arrowleft:1525249879151083621>")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageIdx <= 0),
        new ButtonBuilder()
          .setCustomId(`${base}:next`)
          .setEmoji("<:1343arrowright:1525249880728145970>")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageIdx >= totalPages - 1),
        new ButtonBuilder()
          .setCustomId(`${base}:last`)
          .setEmoji("<:1343arrowright:1525249880728145970>")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageIdx >= totalPages - 1),
      ),
    );
    return out;
  }

  function parseMusicListCustomId(customId) {
    const parts = String(customId || "").split(":");
    if (parts.length < 4) return null;
    const [prefix, authorId, pageRaw, action] = parts;
    const kindKey = Object.keys(KIND).find((k) => KIND[k].prefix === prefix);
    if (!kindKey) return null;
    if (!/^\d{16,20}$/.test(authorId)) return null;
    const page = Math.max(0, Math.floor(Number(pageRaw) || 0));
    if (!["first", "prev", "next", "last", "jump"].includes(action)) return null;
    return { kindKey, authorId, page, action };
  }

  function matchMusicListInteraction(interaction) {
    return Boolean(parseMusicListCustomId(interaction?.customId));
  }

  async function buildMusicListPayload(kindKey, client, guild, authorId, pageIdx) {
    const kind = KIND[kindKey];
    const result = await kind.fetch(client, guild);
    if (!result?.ok) {
      return {
        embeds: [
          new EmbedBuilder().setColor(0xff0000).setDescription(`**${result?.message || "Errore"}**`),
        ],
        components: [],
      };
    }
    const pageBodies = chunkRowsToPageBodies(result.rows || [], kind.line);
    const totalPages = pageBodies.length;
    const safePage = Math.min(totalPages - 1, Math.max(0, pageIdx));
    return {
      embeds: [buildListEmbed(kindKey, safePage, totalPages, pageBodies[safePage])],
      components: buildListComponents(kindKey, authorId, safePage, totalPages),
    };
  }

  async function handleMusicListInteraction(interaction) {
    const parsed = parseMusicListCustomId(interaction.customId);
    if (!parsed) return false;
    if (String(interaction.user?.id) !== parsed.authorId) {
      await interaction
        .reply({
          content: "Solo chi ha usato il comando può navigare.",
          flags: PRIVATE,
        })
        .catch(() => null);
      return true;
    }

    const kind = KIND[parsed.kindKey];
    const result = await kind.fetch(interaction.client, interaction.guild);
    if (!result?.ok) {
      await interaction
        .update(
          applyDefaultFooterToEmbeds(
            {
              embeds: [
                new EmbedBuilder().setColor(0xff0000).setDescription(`**${result?.message || "Errore"}**`),
              ],
              components: [],
            },
            interaction.guild,
          ),
        )
        .catch(() => null);
      return true;
    }

    const pageBodies = chunkRowsToPageBodies(result.rows || [], kind.line);
    const last = Math.max(0, pageBodies.length - 1);
    let page = Math.min(last, Math.max(0, parsed.page));
    if (interaction.isStringSelectMenu?.() || parsed.action === "jump") {
      const n = Number(interaction.values?.[0]);
      if (Number.isFinite(n)) page = Math.min(last, Math.max(0, Math.floor(n)));
    } else if (parsed.action === "first") page = 0;
    else if (parsed.action === "prev") page = Math.max(0, page - 1);
    else if (parsed.action === "next") page = Math.min(last, page + 1);
    else if (parsed.action === "last") page = last;

    const payload = applyDefaultFooterToEmbeds(
      {
        embeds: [buildListEmbed(parsed.kindKey, page, pageBodies.length, pageBodies[page])],
        components: buildListComponents(parsed.kindKey, parsed.authorId, page, pageBodies.length),
      },
      interaction.guild,
    );
    await interaction.update(payload).catch(() => null);
    return true;
  }

  return {
    buildMusicListPayload,
    handleMusicListInteraction,
    matchMusicListInteraction,
    parseMusicListCustomId,
  };
}

module.exports = { createMusicListUi, PAGE_SIZE };
