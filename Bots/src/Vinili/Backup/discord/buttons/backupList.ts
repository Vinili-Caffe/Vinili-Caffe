const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require("discord.js") as typeof import("discord.js");
const { listAllBackupMetasPaginated } = require("../../services/serverBackupService") as typeof import("../../services/serverBackupService");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const PREFIX_PREV = "backup_list_prev:";
const PREFIX_NEXT = "backup_list_next:";
const PREFIX_SELECT = "backup_list_select:";
const EPHEMERAL = 1 << 6;

function toUnixTs(value?) {
  const ms = new Date(value || 0).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.floor(ms / 1000);
}

function backupMetaToOptionValue(m?) {
  const bid = String(m?.backupId || "").trim();
  const gid = m?.guildId ? String(m.guildId).trim() : "";
  const ref = gid ? `${gid}:${bid}` : bid;
  return ref.slice(0, 100);
}

function labelForMeta(m?) {
  const id = String(m?.backupId || "?").slice(0, 36);
  const name = String(m?.guildName || "?").replace(/\*\*/g, "").slice(0, 55);
  return `${id} · ${name}`.slice(0, 100);
}

function parseBackupListTail(customId?, prefix?) {
  const restStr = String(customId || "").slice(prefix.length);
  const seg = restStr.split(":");
  const withPanelNav = seg[seg.length - 1] === "p";
  const core = withPanelNav ? seg.slice(0, -1) : seg;
  return {
    authorId: String(core[0] || ""),
    pageOnMenu: Math.max(1, Number.parseInt(core[1] || "1", 10) || 1),
    withPanelNav,
  };
}

async function respondListUpdate(interaction?, payload?) {
  const { safeInteractionUpdate, safeMessageEdit } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
  const body = { embeds: payload.embeds, components: payload.components };
  if (interaction.deferred && interaction.message?.edit) {
    try {
      await safeMessageEdit(interaction.message, body, interaction);
      return;
    } catch (err) {
      global.logger?.warn?.("[Buttons/backupList] message.edit (deferred)", err);
    }
  }
  const canUpdate =
    (interaction.isButton?.() || interaction.isStringSelectMenu?.()) &&
    !interaction.deferred &&
    !interaction.replied;
  if (canUpdate) {
    const updated = await safeInteractionUpdate(interaction, body);
    if (updated) return;
  }
  const { safeReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
  await safeReply(interaction, { ...body, flags: EPHEMERAL }).catch(() => {});
}

function match(interaction?) {
  const id = interaction?.customId || "";
  if (interaction.isButton() && (id.startsWith(PREFIX_PREV) || id.startsWith(PREFIX_NEXT))) return true;
  if (interaction.isStringSelectMenu() && id.startsWith(PREFIX_SELECT)) return true;
  return false;
}

async function execute(interaction?) {
  const customId = interaction.customId || "";
  const userId = interaction.user?.id;
  if (!userId) return false;

  const { safeEditReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");

  if (interaction.isStringSelectMenu() && customId.startsWith(PREFIX_SELECT)) {
    const parsed = parseBackupListTail(customId, PREFIX_SELECT);
    if (parsed.authorId && parsed.authorId !== userId) {
      await interaction.reply({ content: `${E.VC_Alert} Questo controllo non appartiene a te.`, flags: EPHEMERAL }).catch(() => {});
      return true;
    }
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    const page = parsed.pageOnMenu;
    const selectedRef = String(interaction.values?.[0] || "").trim();
    try {
      const payload = await renderList(userId, page, parsed.withPanelNav, selectedRef);
      await respondListUpdate(interaction, payload);
      return true;
    } catch (err) {
      global.logger?.error?.("[Buttons/backupList] select", err);
      await interaction.reply({ content: `${E.VC_Alert} Errore durante la selezione.`, flags: EPHEMERAL }).catch(() => {});
      return true;
    }
  }

  if (!interaction.isButton()) return false;

  const prefix = customId.startsWith(PREFIX_PREV) ? PREFIX_PREV : PREFIX_NEXT;
  const parsed = parseBackupListTail(customId, prefix);
  if (parsed.authorId && parsed.authorId !== userId) {
    await interaction.reply({ content: `${E.VC_Alert} Questo controllo non appartiene a te.`, flags: EPHEMERAL }).catch(() => {});
    return true;
  }

  let page = parsed.pageOnMenu;
  if (customId.startsWith(PREFIX_PREV)) {
    page = Math.max(1, page - 1);
  } else if (customId.startsWith(PREFIX_NEXT)) {
    page = page + 1;
  }
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }

  try {
    const payload = await renderList(userId, page, parsed.withPanelNav);
    await respondListUpdate(interaction, payload);
    return true;
  } catch (err) {
    global.logger?.error?.("[Buttons/backupList] execute", err);
    await interaction.reply({ content: `${E.VC_Alert} Errore durante l'aggiornamento della lista.`, flags: EPHEMERAL }).catch(() => {});
    return true;
  }
}

async function renderList(userId?, page = 1, withPanelNav = false, selectedRef = null) {
  const pageSize = 10;
  const { items, total, totalPages, page: currentPage } = await listAllBackupMetasPaginated({ page, pageSize });

  const lines = items.length
    ? items.map((m?, i?) => {
      const ts = toUnixTs(m?.createdAt);
      const createdLabel = ts ? `<t:${ts}:d>` : "N/D";
      return `${(currentPage - 1) * pageSize + i + 1}. **${String(m?.guildName || "?").replace(/\*\*/g, "")}** — \`${m?.backupId || "?"}\` (${createdLabel})`;
    })
    : ["Nessun backup trovato."];

  let body = lines.join("\n").slice(0, 3900) || "-";
  if (selectedRef && items.length) {
    const hit = items.find((m?) => backupMetaToOptionValue(m) === selectedRef);
    if (hit) {
      body = [formatSelectedBackupBlock(hit), "", "*— Lista pagina corrente —*", "", body].join("\n").slice(0, 3900);
    }
  }

  const embed = new EmbedBuilder()
    .setColor("#3498db")
    .setTitle(`${E.VC_InactiveStatus} Lista backup`)
    .setDescription(body)
    .setFooter({ text: `Pagina ${currentPage}/${totalPages} • ${total} backup totali` })
    .setTimestamp();

  const panelSuffix = withPanelNav ? ":p" : "";
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX_PREV}${userId}:${currentPage}${panelSuffix}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(`${E["1343arrowleft"]} `)
      .setDisabled(currentPage <= 1),
    new ButtonBuilder()
      .setCustomId(`${PREFIX_NEXT}${userId}:${currentPage}${panelSuffix}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(E["1343arrowright"])
      .setDisabled(currentPage >= totalPages),
  );

  const components = [];
  if (withPanelNav) {
    const { buildBackupPanelNavRow } = require("../../utils/backupPanelNav") as typeof import("../../utils/backupPanelNav");
    components.push(buildBackupPanelNavRow(userId, "list"));
  }

  if (items.length) {
    const pickOptions = items.map((m?) => ({
      label: labelForMeta(m),
      value: backupMetaToOptionValue(m),
      emoji: E.VC_id,
      default: Boolean(selectedRef && backupMetaToOptionValue(m) === selectedRef),
    }));
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${PREFIX_SELECT}${userId}:${currentPage}${panelSuffix}`)
          .setPlaceholder("Scegli un backup") 
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(pickOptions),
      ),
    );
  }

  components.push(row);
  return { embeds: [embed], components: components.slice(0, 5) };
}

function formatSelectedBackupBlock(m?) {
  const row = m || {};
  const ts = toUnixTs(row?.createdAt);
  return [
    "**Backup selezionato**",
    `${E.VC_Mention} **Server:** ${String(row?.guildName || "?").replace(/\*\*/g, "")}`,
    `${E.VC_id} **Backup ID:** \`${row?.backupId || "?"}\``,
    `${E.VC_opentime} **Creato:** ${ts ? `<t:${ts}:F>` : "N/D"}`,
  ].join("\n");
}

function buildListSelectionInfoEmbed(selectedBackup?) {
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle(`${E.VC_InactiveStatus} Backup selezionato`)
    .setDescription(formatSelectedBackupBlock(selectedBackup));
}

export = { name: "backupList", order: 9, match, execute, renderList, buildListSelectionInfoEmbed };