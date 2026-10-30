const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js") as typeof import("discord.js");
const {
  resetPanelSelectMenu,
  payloadWithDefaultEphemeral,
  beginPanelSelectDefer,
} = require("../../../shared/discord/panelSelectMenuRuntime") as typeof import("../../../shared/discord/panelSelectMenuRuntime");
const {
  getTicketSettingsSync,
  refreshTicketConfigCache,
} = require("../../MultiGuild/core/tenantTicketSettings") as typeof import("../../MultiGuild/core/tenantTicketSettings");
const {
  getGuildPanelsSync,
  refreshTicketPanelsCache,
  ticketTypeToCustomId,
  ticketTypeLabel,
} = require("../../MultiGuild/core/tenantTicketPanels") as typeof import("../../MultiGuild/core/tenantTicketPanels");

const TICKET_OPEN_MENU_CUSTOM_ID = "ticket_open_menu";
const DEFAULT_DROPDOWN_PLACEHOLDER = "Seleziona un argomento...";

const TICKET_OPEN_OPTIONS = [
  {
    type: "supporto",
    label: "SUPPORTO",
    description: "Supporto generale • Segnalazioni • Problemi",
    value: "ticket_supporto",
    emoji: { id: "1443651872258003005", name: "discordstaff" },
  },
  {
    type: "partnership",
    label: "PARTNERSHIP",
    description: "Partnership",
    value: "ticket_partnership",
    emoji: { id: "1443651871125409812", name: "partneredserverowner" },
  },
  {
    type: "high",
    label: "HIGH STAFF",
    description: "Donazioni • Sponsor • Amministrazione",
    value: "ticket_highstaff",
    emoji: { id: "1443670575376765130", name: "reportmessage" },
  },
  {
    type: "perks",
    label: "PERKS",
    description: "Verifica Selfie • Supporter • Follower",
    value: "ticket_perks",
    emoji: { id: "1482534921472835895", name: "VC_Vip" },
  },
];

const DEFAULT_OPTION_META = {
  supporto: {
    description: "Supporto generale • Segnalazioni • Problemi",
    emoji: { id: "1443651872258003005", name: "discordstaff" },
  },
  partnership: {
    description: "Partnership",
    emoji: { id: "1443651871125409812", name: "partneredserverowner" },
  },
  high: {
    description: "Donazioni • Sponsor • Amministrazione",
    emoji: { id: "1443670575376765130", name: "reportmessage" },
  },
  perks: {
    description: "Verifica Selfie • Supporter • Follower",
    emoji: { id: "1482534921472835895", name: "VC_Vip" },
  },
};

function pickMultipanelForReset(guildId?, options: Record<string, any> = {}) {
  const bucket = getGuildPanelsSync(guildId);
  const multis = Array.isArray(bucket.multis) ? bucket.multis : [];
  const messageId = String(options.messageId || "").trim();
  const channelId = String(options.channelId || "").trim();
  if (messageId) {
    const byMsg = multis.find((m?) => String(m.messageId || "") === messageId);
    if (byMsg) return { bucket, multi: byMsg };
  }
  if (channelId) {
    const byCh = multis.find(
      (m?) => String(m.channelId || "") === channelId && m.useDropdown !== false,
    );
    if (byCh) return { bucket, multi: byCh };
  }
  const any = multis.find((m?) => m.useDropdown !== false && m.messageId);
  return { bucket, multi: any || null };
}

function buildMultipanelSelectRows(multi?, bucket?) {
  const byId = new Map((bucket.singles || []).map((s?) => [String(s.id), s]));
  const linked = [];
  for (const id of multi.panelIds || []) {
    const hit: any = byId.get(String(id));
    if (!hit || hit.disabled) continue;
    linked.push(hit);
  }
  if (!linked.length) return null;
  const options = linked.slice(0, 25).map((panel?) => {
    const customId = panel.openCustomId || ticketTypeToCustomId(panel.ticketType);
    const meta = DEFAULT_OPTION_META[panel.ticketType] || {};
    const ov =
      multi.optionOverrides && typeof multi.optionOverrides === "object"
        ? multi.optionOverrides[String(panel.id)] || null
        : null;
    const opt: Record<string, any> = {
      label: String((ov && ov.label) || panel.buttonText || ticketTypeLabel(panel.ticketType) || "Ticket").slice(
        0,
        100,
      ),
      description: String(
        (ov && ov.description) || meta.description || panel.content || "Apri ticket",
      ).slice(0, 100),
      value: customId || `ticket_${panel.ticketType}`,
    };
    let emoji = panel.buttonEmoji || meta.emoji;
    if (ov && ov.useCustomEmoji) emoji = ov.emoji || null;
    if (emoji?.id) opt.emoji = { id: String(emoji.id), name: String(emoji.name || "emoji") };
    else if (emoji?.name) opt.emoji = emoji.name;
    return opt;
  });
  const placeholder = String(multi.dropdownPlaceholder || DEFAULT_DROPDOWN_PLACEHOLDER)
    .trim()
    .slice(0, 150) || DEFAULT_DROPDOWN_PLACEHOLDER;
  const ticketMenu = new StringSelectMenuBuilder()
    .setCustomId(TICKET_OPEN_MENU_CUSTOM_ID)
    .setPlaceholder(placeholder)
    .addOptions((options as any));
  return [new ActionRowBuilder().addComponents(ticketMenu)];
}

function buildLegacyTicketOpenSelectRows(guildId?) {
  const settings = getTicketSettingsSync(guildId);
  const options = TICKET_OPEN_OPTIONS.filter((opt?) => {
    if (settings.enabled !== true) return false;
    return settings.types?.[opt.type]?.enabled !== false;
  }).map((opt?) => ({
    label: opt.label,
    description: opt.description,
    value: opt.value,
    emoji: opt.emoji,
  }));
  const safeOptions = options.length
    ? options
    : [
        {
          label: "SUPPORTO",
          description: "Supporto generale • Segnalazioni • Problemi",
          value: "ticket_supporto",
          emoji: { id: "1443651872258003005", name: "discordstaff" },
        },
      ];
  const ticketMenu = new StringSelectMenuBuilder()
    .setCustomId(TICKET_OPEN_MENU_CUSTOM_ID)
    .setPlaceholder(DEFAULT_DROPDOWN_PLACEHOLDER)
    .addOptions(safeOptions);
  return [new ActionRowBuilder().addComponents(ticketMenu)];
}

function buildTicketOpenSelectRows(guildId?, options: Record<string, any> = {}) {
  const { bucket, multi } = pickMultipanelForReset(guildId, options);
  if (multi && multi.useDropdown !== false) {
    const rows = buildMultipanelSelectRows(multi, bucket);
    if (rows) return rows;
  }
  return buildLegacyTicketOpenSelectRows(guildId);
}

function selectRowsRebuildArgs(interaction?) {
  return {
    messageId: interaction?.message?.id || null,
    channelId: interaction?.channelId || interaction?.message?.channelId || null,
  };
}

function isTicketOpenMenuSelect(interaction?) {
  return (
    Boolean(interaction?.isStringSelectMenu?.()) &&
    interaction.isStringSelectMenu() &&
    String(interaction.customId || "") === TICKET_OPEN_MENU_CUSTOM_ID
  );
}

async function refreshTicketOpenMenuCaches() {
  await Promise.all([
    refreshTicketConfigCache().catch(() => null),
    refreshTicketPanelsCache().catch(() => null),
  ]);
}

async function resetTicketOpenPanelAfterInteraction(interaction?) {
  if (!isTicketOpenMenuSelect(interaction)) return false;
  await refreshTicketOpenMenuCaches();
  const guildId = interaction.guildId || interaction.guild?.id;
  const args = selectRowsRebuildArgs(interaction);
  return resetPanelSelectMenu(interaction, () => buildTicketOpenSelectRows(guildId, args));
}

async function replyTicketOpenPanel(interaction?, payload?, safeReply?) {
  if (isTicketOpenMenuSelect(interaction)) {
    if (!interaction.replied && !interaction.deferred) {
      const guildId = interaction.guildId || interaction.guild?.id;
      const args = selectRowsRebuildArgs(interaction);
      await resetPanelSelectMenu(interaction, () => buildTicketOpenSelectRows(guildId, args));
    }
    return interaction.followUp(payloadWithDefaultEphemeral(payload, true)).catch(() => null);
  }
  const sent = await safeReply(interaction, payload);
  await resetTicketOpenPanelAfterInteraction(interaction);
  return sent;
}

async function deferTicketOpenPanel(interaction?) {
  if (!isTicketOpenMenuSelect(interaction)) return false;
  await refreshTicketOpenMenuCaches();
  const guildId = interaction.guildId || interaction.guild?.id;
  const args = selectRowsRebuildArgs(interaction);
  return beginPanelSelectDefer(
    interaction,
    () => buildTicketOpenSelectRows(guildId, args),
    { flags: 1 << 6 },
  );
}

export = {
  TICKET_OPEN_MENU_CUSTOM_ID,
  DEFAULT_DROPDOWN_PLACEHOLDER,
  buildTicketOpenSelectRows,
  isTicketOpenMenuSelect,
  resetTicketOpenPanelAfterInteraction,
  replyTicketOpenPanel,
  deferTicketOpenPanel,
};
