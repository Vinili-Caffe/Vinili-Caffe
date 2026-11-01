"use strict";

/**
 * Pannelli “pagina” Discord in Components V2:
 * Container con accent palette sito (caffè) + TextDisplay + Separator + thumb + ActionRow.
 * Niente classic EmbedBuilder nello stesso messaggio (regola IsComponentsV2).
 * Preferire thumbnail (logo) a MediaGallery a tutta larghezza.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  SeparatorSpacingSize,
} = require("discord.js") as typeof import("discord.js");
const {
  TENANT_EMBED_COLOR,
  LEGACY_VINILI_EMBED_COLOR_INT,
  normalizeEmbedColorInt,
  resolveEmbedColorForGuild,
} = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");

const DEFAULT_ACCENT_INT =
  normalizeEmbedColorInt(TENANT_EMBED_COLOR) || LEGACY_VINILI_EMBED_COLOR_INT || 0x6f4e37;
const SITE_CAFFE_ACCENT_INT = LEGACY_VINILI_EMBED_COLOR_INT || 0x6f4e37;
const SITE_LOGO_URL = "https://www.viniliecaffe.it/images/og-server-icon.gif?v=20261025ogGif1";
const SITE_DISCORD_INVITE = "https://discord.gg/viniliecaffe";
const SITE_ORIGIN = "https://www.viniliecaffe.it";

function resolvePageAccentColorInt(guildId?, override?) {
  const fromOverride = normalizeEmbedColorInt(override);
  if (fromOverride != null) return fromOverride;
  if (guildId) {
    const fromGuild = normalizeEmbedColorInt(resolveEmbedColorForGuild(guildId));
    if (fromGuild != null) return fromGuild;
  }
  return DEFAULT_ACCENT_INT;
}

function toComponentJson(component?) {
  if (!component) return null;
  if (typeof component.toJSON === "function") return component.toJSON();
  return component;
}

function v2Text(content?) {
  return { type: ComponentType.TextDisplay, content: String(content ?? "") };
}

function v2Separator({ divider = true, spacing = "small" } = {}) {
  return {
    type: ComponentType.Separator,
    divider: Boolean(divider),
    spacing: spacing === "large" ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small,
  };
}

function v2MediaGallery(attachmentOrUrl?) {
  const url = String(attachmentOrUrl || "").trim();
  if (!url) return null;
  const mediaUrl = url.startsWith("attachment://") || /^https?:\/\//i.test(url) ? url : `attachment://${url}`;
  return {
    type: ComponentType.MediaGallery,
    items: [{ media: { url: mediaUrl } }],
  };
}

function buildTitleBlock(title?) {
  const t = String(title || "").trim();
  if (!t) return null;
  if (t.startsWith("#")) return v2Text(t);
  return v2Text(`## ${t}`);
}

function normalizeRichMediaUrl(url?) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("attachment://") || /^https?:\/\//i.test(raw)) return raw;
  return `attachment://${raw}`;
}

function v2ThumbnailAccessory(url?) {
  const mediaUrl = normalizeRichMediaUrl(url);
  if (!mediaUrl) return null;
  return {
    type: ComponentType.Thumbnail,
    media: { url: mediaUrl },
  };
}

function v2Section(textParts?, thumbnailUrl?) {
  const components = [];
  for (const part of textParts || []) {
    if (!part) continue;
    if (typeof part === "string") {
      const t = String(part).trim();
      if (t) components.push(v2Text(t));
      continue;
    }
    components.push(part);
  }
  if (!components.length) return null;
  const accessory = v2ThumbnailAccessory(thumbnailUrl);
  if (!accessory) {
    return components.length === 1 ? components[0] : components;
  }
  return {
    type: ComponentType.Section,
    components: components.slice(0, 3),
    accessory,
  };
}

function flattenRichParts(entry?) {
  if (!entry) return [];
  if (Array.isArray(entry)) return entry.flatMap((e?) => flattenRichParts(e));
  return [entry];
}

function resolveClassicFooterText(fields: Record<string, any> = {}) {
  const footerRaw = fields.footer;
  if (typeof footerRaw === "string") return String(footerRaw).trim();
  if (footerRaw && typeof footerRaw === "object") {
    return String(footerRaw.text || footerRaw.name || "").trim();
  }
  return String(fields.footerText || "").trim();
}

/**
 * Container V2 da campi stile embed classico (author, title, description, thumbnail, image, fields, footer).
 */
function mediaUrlKey(url?) {
  return String(url || "")
    .trim()
    .split("?")[0]
    .replace(/\/$/, "")
    .toLowerCase();
}

function isDecorativeDividerUrl(url?) {
  try {
    const { DIVIDER_URL } = require("../../../shared/discord/constants") as typeof import("../../../shared/discord/constants");
    const a = mediaUrlKey(url);
    const b = mediaUrlKey(DIVIDER_URL);
    return Boolean(a && b && a === b);
  } catch (_) {
    return false;
  }
}

function buildVcRichContainerFromClassicFields(fields: Record<string, any> = {}) {
  const accentColor = resolvePageAccentColorInt(
    fields.guildId,
    fields.accentColor ?? fields.color,
  );
  const parts = [];

  const authorName = String(fields.authorName || "").trim();
  const authorIconUrl = fields.authorIconUrl || fields.authorIcon || "";
  if (authorName) {
    // Una sola foto: in V2 author-icon e thumbnail diventano entrambe accessory → doppia foto
    const authorBlock = v2Section([authorName.startsWith("#") ? authorName : `### ${authorName}`], authorIconUrl);
    for (const p of flattenRichParts(authorBlock)) parts.push(p);
    parts.push(v2Separator({ spacing: "small" }));
  }

  const titleRaw = String(fields.title || "").trim();
  const titleUrl = String(fields.titleUrl || fields.url || "").trim();
  let titleLine = titleRaw;
  if (titleLine && titleUrl && /^https?:\/\//i.test(titleUrl) && !titleLine.includes("](")) {
    titleLine = `[${titleLine}](${titleUrl})`;
  }
  const description = String(fields.description ?? "").trim();
  const bodyTexts = [];
  if (titleLine) {
    const titleBlock = buildTitleBlock(titleLine);
    bodyTexts.push(titleBlock ? titleBlock.content : titleLine);
  }
  if (description) bodyTexts.push(description);

  let thumbnailUrl = fields.thumbnailUrl || fields.thumbnail || "";
  // Se c’è già l’icona author, non ripetere lo stesso (o un secondo) thumb sul body
  if (authorIconUrl && thumbnailUrl) {
    if (mediaUrlKey(authorIconUrl) === mediaUrlKey(thumbnailUrl) || authorName) {
      thumbnailUrl = "";
    }
  }
  if (bodyTexts.length) {
    const main = v2Section(bodyTexts, thumbnailUrl);
    for (const p of flattenRichParts(main)) parts.push(p);
  } else if (thumbnailUrl) {
    const gallery = v2MediaGallery(thumbnailUrl);
    if (gallery) {
      parts.push(v2Separator({ spacing: "small" }));
      parts.push(gallery);
    }
  }

  for (const field of fields.fields || []) {
    const name = String(field?.name || "").trim();
    const value = String(field?.value || "").trim();
    if (!name && !value) continue;
    parts.push(v2Separator({ spacing: "small" }));
    if (name) parts.push(v2Text(name.startsWith("#") ? name : `### ${name}`));
    if (value) parts.push(v2Text(value));
  }

  let footer = resolveClassicFooterText(fields);
  const tsEnabled =
    fields.timestampEnabled === true ||
    fields.footerTimestamp === true ||
    (fields.timestamp === true && fields.timestampEnabled !== false);
  if (tsEnabled) {
    const ts = `<t:${Math.floor(Date.now() / 1000)}:f>`;
    footer = footer ? `${footer} • ${ts}` : ts;
  }
  if (footer) {
    parts.push(v2Separator({ spacing: "small" }));
    parts.push(v2Text(footer.startsWith("-#") ? footer : `-# ${footer}`));
  }

  const imageUrl = fields.imageUrl || fields.image || "";
  // Divider bar classico → in V2 finisce come MediaGallery rotta/grigia: salta
  if (imageUrl && !isDecorativeDividerUrl(imageUrl)) {
    parts.push(v2Separator({ spacing: "small" }));
    const gallery = v2MediaGallery(imageUrl);
    if (gallery) parts.push(gallery);
  }

  for (const row of fields.rows || []) {
    const json = toComponentJson(row);
    if (json) parts.push(json);
  }

  return {
    type: ComponentType.Container,
    accentColor,
    components: parts,
  };
}

function assembleVcRichSendPayload(opts: Record<string, any> = {}, container?) {
  const files = opts.files
    ? Array.isArray(opts.files)
      ? opts.files.filter(Boolean)
      : [opts.files].filter(Boolean)
    : [];
  const payload: Record<string, any> = {
    content: String(opts.content ?? "").trim(),
    embeds: [],
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
  const mediaName = String(opts.mediaName || opts.attachmentName || "").trim() || undefined;
  if (mediaName) payload.attachmentName = mediaName;
  if (files.length) payload.files = files;
  if (opts.allowedMentions != null) payload.allowedMentions = opts.allowedMentions;
  if (opts.messageId != null) payload.messageId = opts.messageId;
  if (opts.forceNew === true) payload.forceNew = true;
  if (opts.editOnly === true) payload.editOnly = true;
  if (opts.includeBanner === false) payload.includeBanner = false;
  if (opts.__skipDefaultEmbedFooter === true) payload.__skipDefaultEmbedFooter = true;
  return payload;
}

function normalizeSitePageUrl(pageUrl?) {
  const raw = String(pageUrl || "").trim();
  if (!raw) return SITE_ORIGIN + "/";
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${SITE_ORIGIN}${path}`;
}

/** ActionRow Link: apri pagina sito + entra Discord. */
function buildVcSitePageCtaRows(opts: Record<string, any> = {}) {
  const pageUrl = normalizeSitePageUrl(opts.pageUrl || opts.url);
  const inviteUrl = String(opts.inviteUrl || SITE_DISCORD_INVITE).trim() || SITE_DISCORD_INVITE;
  const pageLabel = String(opts.pageLabel || "Apri la pagina").slice(0, 80);
  const inviteLabel = String(opts.inviteLabel || "Entra su Discord").slice(0, 80);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(pageUrl).setLabel(pageLabel),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(inviteUrl).setLabel(inviteLabel),
  );
  return [row];
}

/**
 * Share pagina sito in V2: titolo + desc con screenshot come thumbnail, poi CTA.
 */
function buildVcSitePageSharePayload(opts: Record<string, any> = {}) {
  const pageUrl = normalizeSitePageUrl(opts.pageUrl || opts.url);
  const thumb =
    String(opts.thumbnailUrl || opts.thumbnail || opts.imageUrl || opts.image || "").trim() ||
    SITE_LOGO_URL;
  const ctaRows = buildVcSitePageCtaRows({
    pageUrl,
    inviteUrl: opts.inviteUrl,
    pageLabel: opts.pageLabel,
    inviteLabel: opts.inviteLabel,
  });
  const extraRows = Array.isArray(opts.rows) ? opts.rows : [];
  return buildVcRichFromClassicFields({
    ...opts,
    guildId: opts.guildId,
    accentColor: opts.accentColor ?? opts.color ?? SITE_CAFFE_ACCENT_INT,
    title: opts.title,
    titleUrl: opts.titleUrl || pageUrl,
    description: opts.description,
    thumbnailUrl: thumb,
    imageUrl: "",
    footer: opts.footer,
    footerText: opts.footerText,
    rows: [...ctaRows, ...extraRows],
    files: opts.files,
    content: opts.content,
    allowedMentions: opts.allowedMentions,
    __skipDefaultEmbedFooter: true,
  });
}

/**
 * Payload inviabile da campi stile embed classico (+ content/files/rows fuori dal container se content).
 */
function buildVcRichFromClassicFields(fields: Record<string, any> = {}) {
  const container = buildVcRichContainerFromClassicFields(fields);
  return assembleVcRichSendPayload(fields, container);
}

/**
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {string|string[]} [opts.body]
 * @param {Array<{ heading?: string, body: string }>} [opts.sections]
 * @param {string} [opts.footer] - stilizzato come -# (sottotesto Discord)
 * @param {string} [opts.mediaName] - nome file in files[] → MediaGallery attachment://
 * @param {string} [opts.mediaUrl] - URL http(s) o attachment:// già pronto
 * @param {import('discord.js').AttachmentBuilder|import('discord.js').AttachmentBuilder[]} [opts.files]
 * @param {Array} [opts.rows] - ActionRowBuilder o JSON
 * @param {string} [opts.guildId]
 * @param {string|number} [opts.accentColor]
 * @param {boolean} [opts.includeBanner] - passato attraverso per compat upsert (ignorato in V2)
 */
function buildVcPageContainer(opts: Record<string, any> = {}) {
  const accentColor = resolvePageAccentColorInt(opts.guildId, opts.accentColor);
  const parts = [];

  const title = buildTitleBlock(opts.title);
  if (title) parts.push(title);

  const bodyRaw = Array.isArray(opts.body) ? opts.body.join("\n") : opts.body;
  const body = String(bodyRaw ?? "").trim();
  if (body) {
    if (parts.length) parts.push(v2Separator({ spacing: "small" }));
    parts.push(v2Text(body));
  }

  for (const section of opts.sections || []) {
    const heading = String(section?.heading || "").trim();
    const sectionBody = String(section?.body || "").trim();
    if (!heading && !sectionBody) continue;
    parts.push(v2Separator({ spacing: "small" }));
    if (heading) {
      parts.push(v2Text(heading.startsWith("#") ? heading : `### ${heading}`));
    }
    if (sectionBody) parts.push(v2Text(sectionBody));
  }

  const footer = String(opts.footer || "").trim();
  if (footer) {
    parts.push(v2Separator({ spacing: "small" }));
    parts.push(v2Text(footer.startsWith("-#") ? footer : `-# ${footer}`));
  }

  const mediaUrl = opts.mediaUrl
    ? String(opts.mediaUrl).trim()
    : opts.mediaName
      ? `attachment://${String(opts.mediaName).trim()}`
      : "";
  if (mediaUrl) {
    parts.push(v2Separator({ spacing: "small" }));
    const gallery = v2MediaGallery(mediaUrl);
    if (gallery) parts.push(gallery);
  }

  for (const row of opts.rows || []) {
    const json = toComponentJson(row);
    if (json) parts.push(json);
  }

  return {
    type: ComponentType.Container,
    accentColor,
    components: parts,
  };
}

/**
 * Payload pronto per channel.send / message.edit / upsertPanelMessage.
 * Sempre senza embeds; flags IsComponentsV2.
 */
function buildVcPagePayload(opts: Record<string, any> = {}) {
  const container = buildVcPageContainer(opts);
  const mediaName = String(opts.mediaName || opts.attachmentName || "").trim() || undefined;
  const files = opts.files
    ? Array.isArray(opts.files)
      ? opts.files.filter(Boolean)
      : [opts.files].filter(Boolean)
    : [];

  const payload: Record<string, any> = {
    content: "",
    embeds: [],
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
  if (mediaName) payload.attachmentName = mediaName;
  if (files.length) payload.files = files;
  if (opts.messageId != null) payload.messageId = opts.messageId;
  if (opts.forceNew === true) payload.forceNew = true;
  if (opts.editOnly === true) payload.editOnly = true;
  if (opts.includeBanner === false) payload.includeBanner = false;
  return payload;
}

function isComponentsV2Payload(payload?) {
  const flags = Number(payload?.flags || 0);
  if (flags & MessageFlags.IsComponentsV2) return true;
  const comps = Array.isArray(payload?.components) ? payload.components : [];
  return comps.some((c?) => {
    const t = typeof c?.toJSON === "function" ? c.toJSON()?.type : c?.type;
    return Number(t) === ComponentType.Container;
  });
}

function isComponentsV2Message(message?) {
  const flags = Number(message?.flags?.bitfield ?? message?.flags ?? 0);
  if (flags & MessageFlags.IsComponentsV2) return true;
  const comps = Array.isArray(message?.components) ? message.components : [];
  return comps.some((c?) => Number(c?.type ?? c?.data?.type) === ComponentType.Container);
}

function componentTypeOf(c?) {
  if (!c) return 0;
  const raw = typeof c.toJSON === "function" ? c.toJSON() : c;
  return Number(raw?.type) || 0;
}

/** Unisce ActionRow (type 1) dentro il Container V2 (type 17). */
function mergeActionRowsIntoV2Payload(v2Payload?, rows = []) {
  if (!v2Payload || typeof v2Payload !== "object") return v2Payload;
  const list = (Array.isArray(rows) ? rows : []).filter(Boolean).map((row?) =>
    typeof row?.toJSON === "function" ? row.toJSON() : row,
  );
  const comps = (Array.isArray(v2Payload.components) ? v2Payload.components : []).map((c?) =>
    typeof c?.toJSON === "function" ? c.toJSON() : c && typeof c === "object" ? { ...c } : c,
  );
  if (!comps.length && Array.isArray(v2Payload.containers) && v2Payload.containers.length) {
    for (const c of v2Payload.containers) {
      comps.push(typeof c?.toJSON === "function" ? c.toJSON() : c);
    }
  }
  const idx = comps.findIndex((c?) => componentTypeOf(c) === ComponentType.Container);
  if (idx >= 0 && list.length) {
    const container = { ...comps[idx] };
    const inner = Array.isArray(container.components) ? [...container.components] : [];
    for (const row of list) {
      if (row && componentTypeOf(row) === ComponentType.ActionRow) inner.push(row);
    }
    container.components = inner;
    comps[idx] = container;
  } else if (list.length) {
    for (const row of list) {
      if (row) comps.push(row);
    }
  }
  const out = {
    ...v2Payload,
    components: comps,
    embeds: [],
    flags: (Number(v2Payload.flags) || 0) | MessageFlags.IsComponentsV2,
  };
  delete out.containers;
  return out;
}

export = {
  SITE_CAFFE_ACCENT_INT,
  MessageFlags,
  v2Text,
  v2Separator,
  buildVcPagePayload,
  buildVcRichFromClassicFields,
  buildVcSitePageSharePayload,
  isComponentsV2Payload,
  isComponentsV2Message,
  mergeActionRowsIntoV2Payload,
};
