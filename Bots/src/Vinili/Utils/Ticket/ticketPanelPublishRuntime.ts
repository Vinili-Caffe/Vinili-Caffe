const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js") as typeof import("discord.js");
const { buildVcRichFromClassicFields } = require("../Embeds/vcPageEmbedV2") as typeof import("../Embeds/vcPageEmbedV2");
const { upsertPanelMessage } = require("../../../shared/discord/panelUpsertRuntime") as typeof import("../../../shared/discord/panelUpsertRuntime");
const { getClientChannelCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const {
  getGuildPanels,
  mutateGuildPanels,
  ticketTypeToCustomId,
  ticketTypeLabel,
  normalizeSingle,
  normalizeMulti,
} = require("../../MultiGuild/core/tenantTicketPanels") as typeof import("../../MultiGuild/core/tenantTicketPanels");
const {
  TICKET_OPEN_MENU_CUSTOM_ID,
  DEFAULT_DROPDOWN_PLACEHOLDER,
} = require("./ticketOpenMenuComponents") as typeof import("./ticketOpenMenuComponents");
const { personalityPanelUpdateOne } = require("../Global/globalSettingsGuildStores") as typeof import("../Global/globalSettingsGuildStores");
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
} = require("./ticketUiDefaults") as typeof import("./ticketUiDefaults");

const { resolveBotPhotoMedia, botPhotoCdnUrl } = require("../Discord/botPhotosCdn") as typeof import("../Discord/botPhotosCdn");
const TICKET_MEDIA_NAME = "ticket.gif";
const TICKET_MEDIA = resolveBotPhotoMedia(TICKET_MEDIA_NAME);
const TICKET_MEDIA_URL = TICKET_MEDIA.mediaUrl || botPhotoCdnUrl(TICKET_MEDIA_NAME);

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

function colorToInt(hex?) {
  const raw = String(hex || "").replace("#", "");
  const n = Number.parseInt(raw, 16);
  return Number.isFinite(n) ? n : Number.parseInt(DEFAULT_TICKET_PANEL_COLOR.slice(1), 16);
}

function applyEmoji(builder?, emoji?) {
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

function buildSinglePanelClassicFields(panel?, options: Record<string, any> = {}) {
  const lang = options.lang;
  const useDefault = isDefaultishSinglePanelEmbed(panel);
  const color = useDefault
    ? DEFAULT_TICKET_PANEL_COLOR
    : panel.color || DEFAULT_TICKET_PANEL_COLOR;
  const title = useDefault
    ? getDefaultTicketPanelTitle(lang)
    : String(panel.title || DEFAULT_TICKET_PANEL_TITLE).slice(0, 256);
  const description = useDefault
    ? getDefaultTicketPanelDescription(lang)
    : panel.content
      ? String(panel.content).slice(0, 4096)
      : "";
  return {
    accentColor: colorToInt(color),
    guildId: options.guildId,
    title,
    description,
    thumbnailUrl: panel.smallImageUrl || "",
    imageUrl: panel.largeImageUrl || "",
    footerText: useDefault ? getDefaultTicketPanelFooter(lang) : "",
  };
}

function buildMultiPanelClassicFields(multi?, options: Record<string, any> = {}) {
  const lang = options.lang;
  if (isDefaultishMultiPanelEmbed(multi)) {
    return {
      accentColor: colorToInt(DEFAULT_TICKET_PANEL_COLOR),
      guildId: options.guildId,
      title: getDefaultTicketPanelTitle(lang),
      description: getDefaultTicketPanelDescription(lang),
      footerText: getDefaultTicketPanelFooter(lang),
    };
  }
  const fields = {
    accentColor: colorToInt(multi.color || DEFAULT_TICKET_PANEL_COLOR),
    guildId: options.guildId,
    title: String(multi.title || "").trim().slice(0, 256),
    titleUrl: multi.titleUrl || "",
    description: multi.description ? String(multi.description).slice(0, 4096) : "",
    authorName: multi.authorName ? multi.authorName.slice(0, 256) : "",
    authorIconUrl: multi.authorIconUrl || "",
    thumbnailUrl: multi.smallImageUrl || "",
    imageUrl: multi.largeImageUrl || "",
    footerText: multi.footerText ? String(multi.footerText).slice(0, 2048) : "",
    footerIconUrl: multi.footerIconUrl || "",
    timestampEnabled: Boolean(multi.footerTimestamp),
    fields: (Array.isArray(multi.fields) ? multi.fields : []).slice(0, 25).map((f?) => ({
      name: String(f?.name || "\u200b").slice(0, 256),
      value: String(f?.value || "\u200b").slice(0, 1024),
      inline: Boolean(f?.inline),
    })),
  };
  return fields;
}

function buildSinglePanelRichPayload(panel?, options: Record<string, any> = {}) {
  const rows = options.rows || [];
  const classic: any = buildSinglePanelClassicFields(panel, options);
  if (options.attachTicketGif && !classic.imageUrl) {
    classic.imageUrl = TICKET_MEDIA.mediaUrl || TICKET_MEDIA_URL;
    if (TICKET_MEDIA.files?.length) {
      classic.files = TICKET_MEDIA.files;
      classic.mediaName = TICKET_MEDIA.mediaName;
    }
  }
  return buildVcRichFromClassicFields({ ...classic, rows });
}

function buildMultiPanelRichPayload(multi?, options: Record<string, any> = {}) {
  const rows = options.rows || [];
  const classic: any = buildMultiPanelClassicFields(multi, options);
  if (options.attachTicketGif !== false && !classic.imageUrl) {
    classic.imageUrl = TICKET_MEDIA.mediaUrl || TICKET_MEDIA_URL;
    if (TICKET_MEDIA.files?.length) {
      classic.files = TICKET_MEDIA.files;
      classic.mediaName = TICKET_MEDIA.mediaName;
    }
  }
  return buildVcRichFromClassicFields({ ...classic, rows });
}

/** @deprecated — returns V2 payload; prefer buildSinglePanelRichPayload */
function buildSingleEmbed(panel?, options: Record<string, any> = {}) {
  return buildSinglePanelRichPayload(panel, options);
}

/** @deprecated — returns V2 payload; prefer buildMultiPanelRichPayload */
function buildMultiEmbed(multi?, options: Record<string, any> = {}) {
  return buildMultiPanelRichPayload(multi, options);
}

function resolveLinkedSingles(multi?, bucket?) {
  const byId = new Map((bucket.singles || []).map((s?) => [String(s.id), s]));
  const linked = [];
  for (const id of multi.panelIds || []) {
    const hit: any = byId.get(String(id));
    if (!hit || hit.disabled) continue;
    linked.push(hit);
  }
  return linked;
}

function buildSingleComponents(panel?) {
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

function resolveMultiOptionPresentation(panel?, multi?) {
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

function buildMultiComponents(multi?, linkedSingles?) {
  if (!linkedSingles.length) return [];
  if (multi.useDropdown !== false) {
    const options = linkedSingles.slice(0, 25).map((panel?) => {
      const customId = panel.openCustomId || ticketTypeToCustomId(panel.ticketType);
      const presentation = resolveMultiOptionPresentation(panel, multi);
      const opt: Record<string, any> = {
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

  const buttons = linkedSingles.slice(0, 25).map((panel?) => {
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

async function resolveChannel(client?, channelId?) {
  const id = String(channelId || "").trim();
  if (!id) return null;
  return (
    client.channels.cache.get(id) ||
    (await getClientChannelCached(client, id).catch(() => null))
  );
}

async function publishSinglePanel(client?, guildId?, panelId?, options: Record<string, any> = {}) {
  const bucket = await getGuildPanels(guildId);
  const panel = (bucket.singles || []).find((s?) => String(s.id) === String(panelId));
  if (!panel) return { ok: false, reason: "not_found" };
  if (!panel.channelId) return { ok: false, reason: "missing_channel" };
  const channel = await resolveChannel(client, panel.channelId);
  if (!channel?.isTextBased?.()) return { ok: false, reason: "invalid_channel" };

  const components = panel.disabled ? [] : buildSingleComponents(panel);
  const guild = client?.guilds?.cache?.get?.(String(guildId)) || null;
  const lang = resolveTicketBotLanguage(guildId, guild);
  const editOnly = options.editOnly === true;
  const rich = buildSinglePanelRichPayload(panel, {
    lang,
    guildId,
    rows: components,
    attachTicketGif: options.attachTicketGif === true,
  });
  const payload: Record<string, any> = {
    messageId: options.forceNew === true ? null : panel.messageId || null,
    forceNew: options.forceNew === true,
    editOnly,
    ...rich,
  };
  const message = await upsertPanelMessage(channel, client, payload);
  if (!message?.id) {
    const staleId = payload.__staleMessageId || (editOnly ? panel.messageId : null);
    if (staleId) {
      const now = new Date().toISOString();
      await mutateGuildPanels(guildId, (prev?) => ({
        ...prev,
        singles: (prev.singles || []).map((row?) =>
          String(row.id) === String(panelId)
            ? normalizeSingle({ ...row, messageId: null, updatedAt: now })
            : row,
        ),
      }));
    }
    return { ok: false, reason: editOnly ? "edit_failed" : "publish_failed", clearedMessageId: Boolean(staleId) };
  }

  const now = new Date().toISOString();
  const updated = await mutateGuildPanels(guildId, (prev?) => ({
    ...prev,
    singles: (prev.singles || []).map((row?) =>
      String(row.id) === String(panelId)
        ? normalizeSingle({ ...row, messageId: message.id, publishedAt: now, updatedAt: now })
        : row,
    ),
  }));
  return {
    ok: true,
    panel: (updated.bucket?.singles || []).find((s?) => String(s.id) === String(panelId)) || null,
    messageId: message.id,
  };
}

async function publishMultiPanel(client?, guildId?, multiId?, options: Record<string, any> = {}) {
  const bucket = await getGuildPanels(guildId);
  const multi = (bucket.multis || []).find((m?) => String(m.id) === String(multiId));
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
  const attachGif = options.attachTicketGif !== false;
  const rich = buildMultiPanelRichPayload(multi, {
    lang,
    guildId,
    rows: components,
    attachTicketGif: attachGif,
  });
  const payload: Record<string, any> = {
    messageId: options.forceNew === true ? null : multi.messageId || null,
    forceNew: options.forceNew === true,
    editOnly,
    ...rich,
  };
  const message = await upsertPanelMessage(channel, client, payload);
  if (!message?.id) {
    const staleId = payload.__staleMessageId || (editOnly ? multi.messageId : null);
    if (staleId) {
      const now = new Date().toISOString();
      await mutateGuildPanels(guildId, (prev?) => ({
        ...prev,
        multis: (prev.multis || []).map((row?) =>
          String(row.id) === String(multiId)
            ? normalizeMulti({ ...row, messageId: null, updatedAt: now })
            : row,
        ),
      }));
    }
    return { ok: false, reason: editOnly ? "edit_failed" : "publish_failed", clearedMessageId: Boolean(staleId) };
  }

  const now = new Date().toISOString();
  const updated = await mutateGuildPanels(guildId, (prev?) => ({
    ...prev,
    multis: (prev.multis || []).map((row?) =>
      String(row.id) === String(multiId)
        ? normalizeMulti({ ...row, messageId: message.id, publishedAt: now, updatedAt: now })
        : row,
    ),
  }));

  try {
    await (personalityPanelUpdateOne as any)(
      { guildId: String(guildId), channelId: String(multi.channelId) },
      { $set: { ticketInfoMessageId: message.id } },
      { upsert: true },
    );
  } catch (_) {
      }

  return {
    ok: true,
    panel: (updated.bucket?.multis || []).find((m?) => String(m.id) === String(multiId)) || null,
    messageId: message.id,
  };
}

export = {
  buildSingleEmbed,
  buildMultiEmbed,
  buildSinglePanelClassicFields,
  buildMultiPanelClassicFields,
  buildSinglePanelRichPayload,
  buildMultiPanelRichPayload,
  buildSingleComponents,
  buildMultiComponents,
  publishSinglePanel,
  publishMultiPanel,
  resolveLinkedSingles,
  resolveMultiOptionPresentation,
  DEFAULT_OPTION_META,
  TICKET_MEDIA_URL,
  TICKET_MEDIA_NAME,
};
