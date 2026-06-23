function extractUserMentionIds(text) {
  const ids = [];
  const re = /<@!?(\d{16,20})>/g;
  for (const match of String(text || "").matchAll(re)) {
    ids.push(match[1]);
  }
  return [...new Set(ids)];
}

function buildAllowedMentionsForText(text, config = {}) {
  if (config.allowUserMentions === false) {
    return { parse: [] };
  }
  const users = extractUserMentionIds(text);
  if (!users.length) return { parse: [] };
  return { users, roles: [], parse: [] };
}

function isLikelyImageUrl(url) {
  const raw = String(url || "").trim();
  if (!/^https?:\/\//i.test(raw)) return false;
  if (/\.(png|jpe?g|gif|webp|bmp|avif)(\?|$)/i.test(raw)) return true;
  if (/cdn\.discordapp\.com\/attachments\//i.test(raw)) return true;
  if (/media\.discordapp\.net\//i.test(raw)) return true;
  return false;
}

function extractMessageImageUrls(message) {
  const urls = new Set();
  const attachments = message?.attachments;
  if (attachments?.size) {
    for (const att of attachments.values()) {
      const url = String(att?.url || "").trim();
      if (!url) continue;
      const type = String(att?.contentType || "").toLowerCase();
      if (type.startsWith("image/") || isLikelyImageUrl(url)) urls.add(url);
    }
  }
  const embeds = Array.isArray(message?.embeds) ? message.embeds : [];
  for (const embed of embeds) {
    const imageUrl = String(embed?.image?.url || "").trim();
    const thumbUrl = String(embed?.thumbnail?.url || "").trim();
    if (imageUrl && isLikelyImageUrl(imageUrl)) urls.add(imageUrl);
    if (thumbUrl && isLikelyImageUrl(thumbUrl)) urls.add(thumbUrl);
  }
  const content = String(message?.content || "");
  const inline = content.match(/https?:\/\/[^\s>]+/gi) || [];
  for (const url of inline) {
    if (isLikelyImageUrl(url)) urls.add(url);
  }
  return [...urls];
}

function extractMessageStickerIds(message) {
  const stickers = message?.stickers;
  if (!stickers?.size) return [];
  const ids = [];
  for (const sticker of stickers.values()) {
    const id = String(sticker?.id || "").trim();
    if (/^\d{5,30}$/.test(id)) ids.push(id);
  }
  return [...new Set(ids)];
}

function pickRandomItem(items) {
  if (!Array.isArray(items) || !items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function resolveMarkovOutputLimits(limits = {}) {
  const maxSymbols = Math.min(500, Math.max(40, Number(limits.maxSymbols) || 180));
  const maxWords = Math.min(80, Math.max(4, Number(limits.maxWords) || 22));
  return { maxSymbols, maxWords };
}

function clampMarkovOutput(text, limits = {}) {
  const { maxSymbols, maxWords } = resolveMarkovOutputLimits(limits);
  let out = String(text || "").replace(/\s+/g, " ").trim();
  if (!out) return "";
  const words = out.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    out = words.slice(0, maxWords).join(" ");
  }
  if (out.length <= maxSymbols) return out;
  const slice = out.slice(0, maxSymbols);
  const punctIdx = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("… "),
  );
  if (punctIdx >= Math.floor(maxSymbols * 0.45)) {
    return slice.slice(0, punctIdx + 1).trim();
  }
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > Math.floor(maxSymbols * 0.5)) {
    return slice.slice(0, lastSpace).trim();
  }
  return slice.trim();
}

const MIN_MARKOV_IMAGE_BYTES = 512;

function fileNameFromImageUrl(url, fallback = "markov.jpg") {
  try {
    const base = new URL(String(url || "")).pathname.split("/").pop() || "";
    if (/\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(base)) return base.slice(0, 80);
  } catch {
    /* ignore */
  }
  return fallback;
}

async function validateMarkovImageUrl(url, minBytes = MIN_MARKOV_IMAGE_BYTES) {
  const trimmed = String(url || "").trim();
  if (!isLikelyImageUrl(trimmed)) return false;
  try {
    const res = await fetch(trimmed, { redirect: "follow" });
    if (!res.ok) return false;
    const ct = String(res.headers.get("content-type") || "").toLowerCase();
    if (ct && !ct.startsWith("image/")) return false;
    const len = Number(res.headers.get("content-length") || 0);
    if (len > 0 && len < minBytes) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length >= minBytes;
  } catch {
    return false;
  }
}

async function resolveMarkovImageEmbed(url) {
  const trimmed = String(url || "").trim();
  if (!isLikelyImageUrl(trimmed)) return null;
  if (!(await validateMarkovImageUrl(trimmed))) return null;
  return { image: { url: trimmed } };
}

module.exports = {
  extractUserMentionIds,
  buildAllowedMentionsForText,
  isLikelyImageUrl,
  extractMessageImageUrls,
  extractMessageStickerIds,
  pickRandomItem,
  resolveMarkovOutputLimits,
  clampMarkovOutput,
  fileNameFromImageUrl,
  validateMarkovImageUrl,
  resolveMarkovImageEmbed,
};