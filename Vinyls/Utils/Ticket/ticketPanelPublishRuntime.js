const path = require("path");
const {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const { upsertPanelMessage } = require("../../../shared/discord/panelUpsertRuntime");
const { getClientChannelCached } = require("../Interaction/interactionEntityCache");
const {
  getGuildPanels,
  mutateGuildPanels,
  ticketTypeToCustomId,
  ticketTypeLabel,
  normalizeSingle,
  normalizeMulti,
} = require("../../MultiGuild/core/tenantTicketPanels");
const {
  TICKET_OPEN_MENU_CUSTOM_ID,
  DEFAULT_DROPDOWN_PLACEHOLDER,
} = require("./ticketOpenMenuComponents");
const { personalityPanelUpdateOne } = require("../Global/globalSettingsGuildStores");
const {
  DEFAULT_TICKET_PANEL_TITLE,
  DEFAULT_TICKET_PANEL_COLOR,
  DEFAULT_TICKET_BUTTON_EMOJI,
  getDefaultTicketPanelFooter,
  getDefaultTicketPanelTitle,
  getDefaultTicketPanelDescription,
  isDefaultishSinglePanelEmbed,
  isDefaultishMultiPanelEmbed,
  resolveTicketBotLanguage,
} = require("./ticketUiDefaults");

const TICKET_MEDIA_NAME = "ticket.gif";
const TICKET_MEDIA_PATH = path.join(__dirname, "..", "..", "Photos", TICKET_MEDIA_NAME);

const STYLE_MAP = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

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

function colorToInt(hex) {
  const raw = String(hex || "").replace("#", "");
  const n = Number.parseInt(raw, 16);
  return Number.isFinite(n) ? n : Number.parseInt(DEFAULT_TICKET_PANEL_COLOR.slice(1), 16);
}

function applyEmoji(builder, emoji) {
  if (!emoji) return builder;
  try {
    if (emoji.id) {
      builder.setEmoji({ id: String(emoji.id), name: String(emoji.name || "emoji"), animated: Boolean(emoji.animated) });
    } else if (emoji.name) {
      builder.setEmoji(String(emoji.name));
    }
  } catch (_) {
      }
  return builder;
}

function buildSingleEmbed(panel, options = {}) {
  const lang = options.lang;
  const useDefault = isDefaultishSinglePanelEmbed(panel);
  const color = useDefault
    ? DEFAULT_TICKET_PANEL_COLOR
    : panel.color || DEFAULT_TICKET_PANEL_COLOR;
  const title = useDefault
    ? getDefaultTicketPanelTitle(lang)
    : String(panel.title || DEFAULT_TICKET_PANEL_TITLE).slice(0, 256);
  const embed = new EmbedBuilder().setColor(colorToInt(color)).setTitle(title);
  if (useDefault) {
    embed.setDescription(getDefaultTicketPanelDescription(lang));
  } else if (panel.content) {
    embed.setDescription(String(panel.content).slice(0, 4096));
  }
  if (panel.largeImageUrl) embed.setImage(panel.largeImageUrl);
  if (panel.smallImageUrl) embed.setThumbnail(panel.smallImageUrl);
  if (useDefault) {
    embed.setFooter({ text: getDefaultTicketPanelFooter(lang) });
  }
  return embed;
}

function buildMultiEmbed(multi, options = {}) {
  const lang = options.lang;
  if (isDefaultishMultiPanelEmbed(multi)) {
    return new EmbedBuilder()
      .setColor(colorToInt(DEFAULT_TICKET_PANEL_COLOR))
      .setTitle(getDefaultTicketPanelTitle(lang))
      .setDescription(getDefaultTicketPanelDescription(lang))
      .setFooter({ text: getDefaultTicketPanelFooter(lang) });
  }
  const embed = new EmbedBuilder().setColor(colorToInt(multi.color || DEFAULT_TICKET_PANEL_COLOR));
  const title = String(multi.title || "").trim();
  if (title) {
    embed.setTitle(title.slice(0, 256));
    if (multi.titleUrl) embed.setURL(multi.titleUrl);
  }
  if (multi.description) embed.setDescription(String(multi.description).slice(0, 4096));
  if (multi.authorName) {
    embed.setAuthor({
      name: multi.authorName.slice(0, 256),
      iconURL: multi.authorIconUrl || undefined,
      url: multi.authorUrl || undefined,
    });
  }
  if (multi.largeImageUrl) embed.setImage(multi.largeImageUrl);
  if (multi.smallImageUrl) embed.setThumbnail(multi.smallImageUrl);
  if (multi.footerText || multi.footerIconUrl) {
    embed.setFooter({
      text: String(multi.footerText || "\u200b").slice(0, 2048),
      iconURL: multi.footerIconUrl || undefined,
    });
  }
  if (multi.footerTimestamp) embed.setTimestamp(new Date());
  const fields = Array.isArray(multi.fields) ? multi.fields : [];
  if (fields.length) {
    embed.addFields(
      fields.slice(0, 25).map((f) => ({
        name: String(f?.name || "\u200b").slice(0, 256),
        value: String(f?.value || "\u200b").slice(0, 1024),
        inline: Boolean(f?.inline),
      })),
    );
  }
  return embed;
}

function resolveLinkedSingles(multi, bucket) {
  const byId = new Map((bucket.singles || []).map((s) => [String(s.id), s]));
  const linked = [];
  for (const id of multi.panelIds || []) {
    const hit = byId.get(String(id));
    if (!hit || hit.disabled) continue;
    linked.push(hit);
  }
  return linked;
}

function buildSingleComponents(panel) {
  const customId = panel.openCustomId || ticketTypeToCustomId(panel.ticketType);
  if (!customId) return [];
  const btn = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(String(panel.buttonText || DEFAULT_TICKET_PANEL_TITLE).slice(0, 80))
    .setStyle(STYLE_MAP[panel.buttonStyle] || ButtonStyle.Primary)
    .setDisabled(panel.disabled === true);
  applyEmoji(
    btn,
    panel.buttonEmoji ||
      (isDefaultishSinglePanelEmbed(panel)
        ? DEFAULT_TICKET_BUTTON_EMOJI
        : DEFAULT_OPTION_META[panel.ticketType]?.emoji) ||
      DEFAULT_TICKET_BUTTON_EMOJI,
  );
  return [new ActionRowBuilder().addComponents(btn)];
}

function resolveMultiOptionPresentation(panel, multi) {
  const meta = DEFAULT_OPTION_META[panel.ticketType] || {};
  const overrides =
    multi?.optionOverrides && typeof multi.optionOverrides === "object"
      ? multi.optionOverrides[String(panel.id)] || null
      : null;
  const label = String(
    (overrides && overrides.label) || panel.buttonText || ticketTypeLabel(panel.ticketType) || "Ticket",
  ).slice(0, 100);
  const description = String(
    (overrides && overrides.description) || meta.description || panel.content || "Apri ticket",
  ).slice(0, 100);
  let emoji = panel.buttonEmoji || meta.emoji || DEFAULT_TICKET_BUTTON_EMOJI;
  if (overrides && overrides.useCustomEmoji) {
    emoji = overrides.emoji || null;
  }
  return { label, description, emoji };
}

function buildMultiComponents(multi, linkedSingles) {
  if (!linkedSingles.length) return [];
  if (multi.useDropdown !== false) {
    const options = linkedSingles.slice(0, 25).map((panel) => {
      const customId = panel.openCustomId || ticketTypeToCustomId(panel.ticketType);
      const presentation = resolveMultiOptionPresentation(panel, multi);
      const opt = {
        label: presentation.label,
        description: presentation.description,
        value: customId || `ticket_${panel.ticketType}`,
      };
      const emoji = presentation.emoji;
      if (emoji?.id) opt.emoji = { id: String(emoji.id), name: String(emoji.name || "emoji") };
      else if (emoji?.name) opt.emoji = emoji.name;
      return opt;
    });
    const menu = new StringSelectMenuBuilder()
      .setCustomId(TICKET_OPEN_MENU_CUSTOM_ID)
      .setPlaceholder(
        String(multi.dropdownPlaceholder || DEFAULT_DROPDOWN_PLACEHOLDER)
          .trim()
          .slice(0, 150) || DEFAULT_DROPDOWN_PLACEHOLDER,
      )
      .addOptions(options);
    return [new ActionRowBuilder().addComponents(menu)];
  }

  const buttons = linkedSingles.slice(0, 25).map((panel) => {
    const customId = panel.openCustomId || ticketTypeToCustomId(panel.ticketType);
    const presentation = resolveMultiOptionPresentation(panel, multi);
    const btn = new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(String(presentation.label).slice(0, 80))
      .setStyle(STYLE_MAP[panel.buttonStyle] || ButtonStyle.Primary)
      .setDisabled(panel.disabled === true);
    applyEmoji(btn, presentation.emoji);
    return btn;
  });
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  return rows;
}

async function resolveChannel(client, channelId) {
  const id = String(channelId || "").trim();
  if (!id) return null;
  return (
    client.channels.cache.get(id) ||
    (await getClientChannelCached(client, id).catch(() => null))
  );
}

async function publishSinglePanel(client, guildId, panelId, options = {}) {
  const bucket = await getGuildPanels(guildId);
  const panel = (bucket.singles || []).find((s) => String(s.id) === String(panelId));
  if (!panel) return { ok: false, reason: "not_found" };
  if (!panel.channelId) return { ok: false, reason: "missing_channel" };
  const channel = await resolveChannel(client, panel.channelId);
  if (!channel?.isTextBased?.()) return { ok: false, reason: "invalid_channel" };

  const components = panel.disabled ? [] : buildSingleComponents(panel);
  const guild = client?.guilds?.cache?.get?.(String(guildId)) || null;
  const lang = resolveTicketBotLanguage(guildId, guild);
  const editOnly = options.editOnly === true;
  const payload = {
    messageId: options.forceNew === true ? null : panel.messageId || null,
    forceNew: options.forceNew === true,
    editOnly,
    embeds: [buildSingleEmbed(panel, { lang })],
    components,
  };
  if (options.attachTicketGif === true) {
    payload.files = [new AttachmentBuilder(TICKET_MEDIA_PATH, { name: TICKET_MEDIA_NAME })];
    payload.attachmentName = TICKET_MEDIA_NAME;
  }

  const message = await upsertPanelMessage(channel, client, payload);
  if (!message?.id) {
    const staleId = payload.__staleMessageId || (editOnly ? panel.messageId : null);
    if (staleId) {
      const now = new Date().toISOString();
      await mutateGuildPanels(guildId, (prev) => ({
        ...prev,
        singles: (prev.singles || []).map((row) =>
          String(row.id) === String(panelId)
            ? normalizeSingle({ ...row, messageId: null, updatedAt: now })
            : row,
        ),
      }));
    }
    return { ok: false, reason: editOnly ? "edit_failed" : "publish_failed", clearedMessageId: Boolean(staleId) };
  }

  const now = new Date().toISOString();
  const updated = await mutateGuildPanels(guildId, (prev) => ({
    ...prev,
    singles: (prev.singles || []).map((row) =>
      String(row.id) === String(panelId)
        ? normalizeSingle({ ...row, messageId: message.id, publishedAt: now, updatedAt: now })
        : row,
    ),
  }));
  return {
    ok: true,
    panel: (updated.bucket?.singles || []).find((s) => String(s.id) === String(panelId)) || null,
    messageId: message.id,
  };
}

async function publishMultiPanel(client, guildId, multiId, options = {}) {
  const bucket = await getGuildPanels(guildId);
  const multi = (bucket.multis || []).find((m) => String(m.id) === String(multiId));
  if (!multi) return { ok: false, reason: "not_found" };
  if (!multi.channelId) return { ok: false, reason: "missing_channel" };
  const linked = resolveLinkedSingles(multi, bucket);
  if (linked.length < 2) return { ok: false, reason: "need_two_panels" };

  const channel = await resolveChannel(client, multi.channelId);
  if (!channel?.isTextBased?.()) return { ok: false, reason: "invalid_channel" };

  const components = buildMultiComponents(multi, linked);
  const guild = client?.guilds?.cache?.get?.(String(guildId)) || null;
  const lang = resolveTicketBotLanguage(guildId, guild);
  const editOnly = options.editOnly === true;
  const payload = {
    messageId: options.forceNew === true ? null : multi.messageId || null,
    forceNew: options.forceNew === true,
    editOnly,
    embeds: [buildMultiEmbed(multi, { lang })],
    components,
  };
  if (options.attachTicketGif !== false) {
    payload.files = [new AttachmentBuilder(TICKET_MEDIA_PATH, { name: TICKET_MEDIA_NAME })];
    payload.attachmentName = TICKET_MEDIA_NAME;
  }

  const message = await upsertPanelMessage(channel, client, payload);
  if (!message?.id) {
    const staleId = payload.__staleMessageId || (editOnly ? multi.messageId : null);
    if (staleId) {
      const now = new Date().toISOString();
      await mutateGuildPanels(guildId, (prev) => ({
        ...prev,
        multis: (prev.multis || []).map((row) =>
          String(row.id) === String(multiId)
            ? normalizeMulti({ ...row, messageId: null, updatedAt: now })
            : row,
        ),
      }));
    }
    return { ok: false, reason: editOnly ? "edit_failed" : "publish_failed", clearedMessageId: Boolean(staleId) };
  }

  const now = new Date().toISOString();
  const updated = await mutateGuildPanels(guildId, (prev) => ({
    ...prev,
    multis: (prev.multis || []).map((row) =>
      String(row.id) === String(multiId)
        ? normalizeMulti({ ...row, messageId: message.id, publishedAt: now, updatedAt: now })
        : row,
    ),
  }));

  try {
    await personalityPanelUpdateOne(
      { guildId: String(guildId), channelId: String(multi.channelId) },
      { $set: { ticketInfoMessageId: message.id } },
      { upsert: true },
    );
  } catch (_) {
      }

  return {
    ok: true,
    panel: (updated.bucket?.multis || []).find((m) => String(m.id) === String(multiId)) || null,
    messageId: message.id,
  };
}

module.exports = {
  buildSingleEmbed,
  buildMultiEmbed,
  buildSingleComponents,
  buildMultiComponents,
  publishSinglePanel,
  publishMultiPanel,
  resolveLinkedSingles,
  resolveMultiOptionPresentation,
  DEFAULT_OPTION_META,
  TICKET_MEDIA_PATH,
  TICKET_MEDIA_NAME,
};
