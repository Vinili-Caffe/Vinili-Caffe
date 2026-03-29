const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { listAllBackupMetasPaginated } = require("../Services/Backup/serverBackupService");
const PREFIX_PREV = "backup_list_prev:";
const PREFIX_NEXT = "backup_list_next:";

function toUnixTs(value) {
  const ms = new Date(value || 0).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.floor(ms / 1000);
}

function match(interaction) {
  const id = interaction?.customId || "";
  return interaction.isButton() && (id.startsWith(PREFIX_PREV) || id.startsWith(PREFIX_NEXT));
}

async function execute(interaction) {
  const customId = interaction.customId || "";
  const userId = interaction.user?.id;
  if (!userId) return false;

  const restStr = customId.startsWith(PREFIX_PREV) ? customId.slice(PREFIX_PREV.length) : customId.slice(PREFIX_NEXT.length);
  const seg = restStr.split(":");
  const withPanelNav = seg[seg.length - 1] === "p";
  const core = withPanelNav ? seg.slice(0, -1) : seg;
  const authorId = core[0];
  if (authorId && authorId !== userId) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Questo controllo non appartiene a te.", flags: 1 << 6 }).catch(() => {});
    return true;
  }

  let page = 1;
  if (customId.startsWith(PREFIX_PREV)) {
    page = Math.max(1, Number.parseInt(core[1] || "1", 10) - 1);
  } else if (customId.startsWith(PREFIX_NEXT)) {
    page = Number.parseInt(core[1] || "1", 10) + 1;
  }

  try {
    const payload = await renderList(userId, page, withPanelNav);
    const { safeEditReply } = require("../../shared/discord/replyRuntime");
    await safeEditReply(interaction, { ...payload, flags: 1 << 6 });
    return true;
  } catch (err) {
    global.logger?.error?.("[Buttons/backupList] execute", err);
    await interaction.reply({ content: "<:vegax:1443934876440068179> Errore durante l'aggiornamento della lista.", flags: 1 << 6 }).catch(() => {});
    return true;
  }
}

async function renderList(userId, page = 1, withPanelNav = false) {
  const pageSize = 10;
  const { items, total, totalPages, page: currentPage } = await listAllBackupMetasPaginated({ page, pageSize });

  const lines = items.length
    ? items.map((m, i) => {
      const ts = toUnixTs(m?.createdAt);
      const createdLabel = ts ? `<t:${ts}:d>` : "N/D";
      return `${(currentPage - 1) * pageSize + i + 1}. **${String(m?.guildName || "?").replace(/\*\*/g, "")}** — \`${m?.backupId || "?"}\` (${createdLabel})`;
    })
    : ["Nessun backup trovato."];

  const embed = new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("<:VC_InactiveStatus:1482526984234860574> Lista backup")
    .setDescription(lines.join("\n").slice(0, 3900) || "-")
    .setFooter({ text: `Pagina ${currentPage}/${totalPages} • ${total} backup totali` })
    .setTimestamp();

  const panelSuffix = withPanelNav ? ":p" : "";
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX_PREV}${userId}:${currentPage}${panelSuffix}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("<:VC_page5:1482459835042762752> ")
      .setDisabled(currentPage <= 1),
    new ButtonBuilder()
      .setCustomId(`${PREFIX_NEXT}${userId}:${currentPage}${panelSuffix}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("<:VC_page4:1482459791975645226>")
      .setDisabled(currentPage >= totalPages),
  );

  const components = [];
  if (withPanelNav) {
    const { buildBackupPanelNavRow } = require("../Utils/Backup/backupPanelNav");
    components.push(buildBackupPanelNavRow(userId, "list"));
  }
  components.push(row);
  return { embeds: [embed], components: components.slice(0, 5) };
}

function buildListSelectionInfoEmbed(selectedBackup) {
  const m = selectedBackup || {};
  const ts = toUnixTs(m?.createdAt);
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("<:VC_InactiveStatus:1482526984234860574> Backup selezionato")
    .setDescription(
      [
        `<:VC_Mention:1482526855289634997> **Server:** ${String(m?.guildName || "?").replace(/\*\*/g, "")}`,
        `<:VC_id:1478517313618575419> **Backup ID:** \`${m?.backupId || "?"}\``,
        `<:VC_opentime:1478517163022221323> **Creato:** ${ts ? `<t:${ts}:F>` : "N/D"}`,
      ].join("\n")
    );
}

module.exports = { name: "backupList", order: 9, match, execute, renderList, buildListSelectionInfoEmbed };