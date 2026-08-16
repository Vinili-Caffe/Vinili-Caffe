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
  // Solo https: http viene poi strippato dal sanitize embed → riquadro vuoto col solo footer.
  if (!/^https:\/\//i.test(raw)) return false;
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

function normalizeMarkovStickerRef(entry) {
  if (!entry) return null;
  if (typeof entry === "string") {
    const id = entry.trim();
    return /^\d{5,30}$/.test(id) ? { id, url: null } : null;
  }
  const id = String(entry.id || "").trim();
  if (!/^\d{5,30}$/.test(id)) return null;
  const url = String(entry.url || "").trim() || null;
  return { id, url };
}

function extractMessageStickers(message) {
  const stickers = message?.stickers;
  if (!stickers?.size) return [];
  const out = [];
  const seen = new Set();
  for (const sticker of stickers.values()) {
    const ref = normalizeMarkovStickerRef({
      id: sticker?.id,
      url: sticker?.url,
    });
    if (!ref || seen.has(ref.id)) continue;
    seen.add(ref.id);
    out.push(ref);
  }
  return out;
}

function extractMessageStickerIds(message) {
  return extractMessageStickers(message).map((ref) => ref.id);
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
  const file = await resolveMarkovImageAttachment(url, minBytes);
  return Boolean(file);
}

async function resolveMarkovImageAttachment(url, minBytes = MIN_MARKOV_IMAGE_BYTES) {
  const trimmed = String(url || "").trim();
  if (!isLikelyImageUrl(trimmed)) return null;
  try {
    const res = await fetch(trimmed, {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const ct = String(res.headers.get("content-type") || "").toLowerCase();
    if (ct && !ct.startsWith("image/") && !ct.includes("octet-stream")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < minBytes) return null;
    // Evita allegati enormi (limite soft sotto il cap Discord).
    if (buf.length > 8 * 1024 * 1024) return null;
    return {
      attachment: buf,
      name: fileNameFromImageUrl(trimmed, "markov.jpg"),
    };
  } catch {
    return null;
  }
}

async function resolveMarkovImageEmbed(url) {
  const trimmed = String(url || "").trim();
  if (!isLikelyImageUrl(trimmed)) return null;
  if (!(await validateMarkovImageUrl(trimmed))) return null;
  return { image: { url: trimmed } };
}

async function resolveMarkovStickerEmbed(client, stickerRef) {
  const ref = normalizeMarkovStickerRef(stickerRef);
  if (!ref) return null;
  let url = ref.url;
  if (!url && client?.fetchSticker) {
    try {
      const sticker = await client.fetchSticker(ref.id);
      url = String(sticker?.url || "").trim() || null;
    } catch {
      return null;
    }
  }
  if (!url) return null;
  if (/cdn\.discordapp\.com\/stickers\//i.test(url) || /media\.discordapp\.net\/stickers\//i.test(url)) {
    return { image: { url } };
  }
  return resolveMarkovImageEmbed(url);
}

module.exports = {
  extractUserMentionIds,
  buildAllowedMentionsForText,
  isLikelyImageUrl,
  extractMessageImageUrls,
  normalizeMarkovStickerRef,
  extractMessageStickers,
  extractMessageStickerIds,
  pickRandomItem,
  resolveMarkovOutputLimits,
  clampMarkovOutput,
  fileNameFromImageUrl,
  validateMarkovImageUrl,
  resolveMarkovImageAttachment,
  resolveMarkovImageEmbed,
  resolveMarkovStickerEmbed,
};