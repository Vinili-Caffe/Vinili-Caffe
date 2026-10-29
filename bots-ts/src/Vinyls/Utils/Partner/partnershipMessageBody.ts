
const TEXT_DISPLAY_TYPE = 10;

function normalizeDescriptionText(value?) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function isForwardedDiscordMessage(message?) {
  if (!message) return false;
  const refType = Number(message?.reference?.type);
  if (Number.isFinite(refType) && refType === 1) return true;
  const snaps = message.messageSnapshots;
  if (snaps && typeof snaps.size === "number" && snaps.size > 0) return true;
  if (Array.isArray(snaps) && snaps.length > 0) return true;
  return false;
}

function resolvePartnershipSourceMessage(message?) {
  if (!message) return null;
  const snaps = message.messageSnapshots;
  let first = null;
  if (snaps && typeof snaps.values === "function") {
    first = [...snaps.values()][0] || null;
  } else if (Array.isArray(snaps) && snaps.length) {
    first = snaps[0];
  }
  if (first) {
    const inner = first.message || first;
    if (inner && (inner.content != null || inner.embeds || inner.components)) {
      return inner;
    }
  }
  return message;
}

function unwrapDiscordForwardQuoteDump(text?) {
  const raw = normalizeDescriptionText(text);
  if (!raw) return "";
  const lines = raw.split("\n");
  const nonEmpty = lines.filter((line?) => line.trim().length > 0);
  if (nonEmpty.length < 2) return raw;

  const quoted = nonEmpty.filter((line?) => /^>\s?/.test(line) || line.trim() === ">");
  if (quoted.length / nonEmpty.length < 0.7) return raw;

  return lines
    .map((line?) => line.replace(/^>\s?/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function embedPayload(embed?) {
  if (embed?.data && typeof embed.data === "object" && !Array.isArray(embed.data)) {
    return embed.data;
  }
  return embed && typeof embed === "object" ? embed : null;
}

function isAutoPreviewEmbed(embed?) {
  const data = embedPayload(embed);
  if (!data) return false;
  const type = String(data.type || "").toLowerCase();
  if (type === "article" || type === "link" || type === "gifv" || type === "image" || type === "video") {
    return true;
  }
  const url = String(data.url || "");
  if (/discord(?:app)?\.com\/invite\/|discord\.gg\//i.test(url)) return true;
  return false;
}

function flattenEmbedText(embed?) {
  const data = embedPayload(embed);
  if (!data) return "";

  const parts = [];
  if (data.author?.name) parts.push(String(data.author.name));
  if (data.title) parts.push(String(data.title));
  if (data.description) parts.push(String(data.description));
  if (Array.isArray(data.fields)) {
    for (const field of data.fields) {
      const name = String(field?.name || "").trim();
      const value = String(field?.value || "").trim();
      if (name || value) parts.push([name, value].filter(Boolean).join("\n"));
    }
  }
  const url = String(data.url || "").trim();
  const joined = parts.join("\n");
  if (/^https?:\/\/[^\s<>()[\]\"]+$/i.test(url) && !joined.includes(url)) {
    parts.push(url);
  }
  if (data.footer?.text) parts.push(String(data.footer.text));
  return parts.join("\n\n").trim();
}

function walkComponentText(nodes?, out?) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const data = node.data && typeof node.data === "object" ? node.data : node;
    const type = Number(data.type ?? node.type ?? 0);
    const content =
      (typeof data.content === "string" && data.content) ||
      (typeof node.content === "string" && node.content) ||
      "";
    if (type === TEXT_DISPLAY_TYPE && content) {
      out.push(content);
    } else if (!type && content && !data.custom_id && !data.customId) {
            out.push(content);
    }
    const kids = node.components || data.components;
    if (Array.isArray(kids) && kids.length) walkComponentText(kids, out);
  }
}

function flattenComponentsText(message?) {
  const parts = [];
  walkComponentText(message?.components, parts);
  return parts.join("\n\n").trim();
}

function collectMessageTextLayers(message?, { forHaystack = false } = {}) {
  if (!message) return [];
  const layers = [];
  const content = unwrapDiscordForwardQuoteDump(message.content || "");
  if (content) layers.push(content);

  const components = unwrapDiscordForwardQuoteDump(flattenComponentsText(message));
  if (components && components !== content) layers.push(components);

  const hasBody = Boolean(content || components);
      if (forHaystack || !hasBody) {
    const embeds = Array.isArray(message.embeds) ? message.embeds : [];
    for (const embed of embeds) {
      if (!forHaystack && isAutoPreviewEmbed(embed)) continue;
      const flat = unwrapDiscordForwardQuoteDump(flattenEmbedText(embed));
      if (flat) layers.push(flat);
    }
  }

  return layers;
}

function extractPartnershipMessageText(message?) {
  if (!message) return "";
  const source = resolvePartnershipSourceMessage(message);
  const sourceLayers = collectMessageTextLayers(source);
  if (sourceLayers.length) {
    return normalizeDescriptionText(sourceLayers.join("\n\n"));
  }
  if (source !== message) {
    const wrapperLayers = collectMessageTextLayers(message);
    if (wrapperLayers.length) {
      return normalizeDescriptionText(wrapperLayers.join("\n\n"));
    }
  }
  return "";
}

function extractPartnershipMessageHaystack(message?) {
  if (!message) return "";
  const parts = [];
  const source = resolvePartnershipSourceMessage(message);
  parts.push(...collectMessageTextLayers(source, { forHaystack: true }));
  if (source !== message) {
    parts.push(...collectMessageTextLayers(message, { forHaystack: true }));
  }
    const seen = new Set();
  const unique = [];
  for (const part of parts) {
    const key = String(part || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(key);
  }
  return normalizeDescriptionText(unique.join("\n\n"));
}

export = {
  normalizeDescriptionText,
  isForwardedDiscordMessage,
  resolvePartnershipSourceMessage,
  unwrapDiscordForwardQuoteDump,
  flattenEmbedText,
  extractPartnershipMessageText,
  extractPartnershipMessageHaystack,
};
