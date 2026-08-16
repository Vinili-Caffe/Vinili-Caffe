const axios = require("axios");
const { AttachmentBuilder } = require("discord.js");
const { registerCanvasFonts } = require("../Render/canvasFonts");
let canvasModule = null;
let createCanvas = null;
let loadImage = null;

try { canvasModule = require("@napi-rs/canvas");
  createCanvas = canvasModule.createCanvas;
  loadImage = canvasModule.loadImage;
  registerCanvasFonts(canvasModule);
} catch (_) {}

const MENTION_TOKEN_RE = /(<@!?&?\d{16,22}>|<#\d{16,22}>|<a?:\w+:\d{16,22}>)/g;
const MARKDOWN_LINK_RE = /(\[[^\]]+\]\([^)]+\))/g;

function hashSeed(input) {
  const s = String(input || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function splitTokenCore(token) {
  const raw = String(token || "");
  const m = raw.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}']+)([^\p{L}\p{N}]*)$/u);
  if (!m) return { lead: "", core: raw, trail: "" };
  return { lead: m[1] || "", core: m[2] || "", trail: m[3] || "" };
}

function shuffleWithRnd(arr, rnd) {
  const out = Array.isArray(arr) ? arr.slice() : [];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function scrambleWord(word, rnd) {
  const w = String(word || "");
  if (w.length <= 1) return w;
  if (w.length === 2) return w[1] + w[0];
  // Burrobirra strong: anagramma completo (non solo swap adiacenti).
  let chars = shuffleWithRnd(w.split(""), rnd);
  let out = chars.join("");
  if (out === w) {
    chars = chars.slice().reverse();
    out = chars.join("");
  }
  if (out === w && chars.length > 2) {
    [chars[0], chars[chars.length - 1]] = [chars[chars.length - 1], chars[0]];
    out = chars.join("");
  }
  if (rnd() < 0.35) return out.toUpperCase();
  if (rnd() < 0.2) {
    return out
      .split("")
      .map((ch) => (rnd() < 0.45 ? ch.toUpperCase() : ch.toLowerCase()))
      .join("");
  }
  return out;
}

function scrambleWordToken(token, rnd) {
  const { lead, core, trail } = splitTokenCore(token);
  if (!core) return token;
  // Non rimescolare cifre pure (es. "12" → "21" rovina i codici); le gestiamo a token.
  if (/^\d+$/.test(core)) return token;
  const scrambledCore = core.includes("'")
    ? core.split("'").map((part) => scrambleWord(part, rnd)).join("'")
    : scrambleWord(core, rnd);
  return `${lead}${scrambledCore}${trail}`;
}

function distortPlainSegment(text, rnd) {
  const raw = String(text || "");
  if (!raw.trim()) return raw;
  const words = raw.split(/(\s+)/);
  for (let i = 0; i < words.length; i += 1) {
    if (!words[i].trim() || /^\s+$/.test(words[i])) continue;
    words[i] = scrambleWordToken(words[i], rnd);
  }
  let out = words.join("");
  if (rnd() < 0.45) out = out.replace(/\./g, "…");
  if (rnd() < 0.25) out = out.replace(/,/g, "‚");
  // Ogni tanto inverte l'ordine delle parole (oltre alle lettere).
  if (rnd() < 0.22) {
    const parts = out.split(/(\s+)/);
    const wordIdx = [];
    for (let i = 0; i < parts.length; i += 1) {
      if (parts[i].trim() && !/^\s+$/.test(parts[i])) wordIdx.push(i);
    }
    if (wordIdx.length >= 3) {
      const values = wordIdx.map((i) => parts[i]);
      const shuffled = shuffleWithRnd(values, rnd);
      wordIdx.forEach((idx, n) => {
        parts[idx] = shuffled[n];
      });
      out = parts.join("");
    }
  }
  return out;
}

/** Mischia token separati da spazio (emoji o numeri cifrario), seed-stabile. */
function shuffleSpacedTokens(text, seed = "") {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return raw;
  const rnd = mulberry32(hashSeed(`shuffle:${seed || raw}`));
  let next = shuffleWithRnd(parts, rnd);
  if (next.join(" ") === parts.join(" ") && parts.length > 1) {
    next = parts.slice().reverse();
  }
  return next.join(" ");
}

function isNumericCipherLine(text) {
  const t = String(text || "").trim();
  return t.length > 0 && /^[\d\s]+$/.test(t);
}

function extractEmojiTokens(text) {
  const raw = String(text || "");
  const ordered = [];
  const re = /<a?:\w+:\d{16,22}>|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu;
  let m;
  while ((m = re.exec(raw)) !== null) ordered.push(m[0]);
  if (ordered.length) return ordered;
  return raw.split(/\s+/).filter(Boolean);
}

/** Mischia l'ordine delle emoji (per sequenza memory in Burrobirra). */
function scrambleEmojiSequenceText(text, seed = "") {
  const tokens = extractEmojiTokens(text);
  if (tokens.length <= 1) return String(text || "").trim();
  const rnd = mulberry32(hashSeed(`emoji:${seed || text}`));
  let next = shuffleWithRnd(tokens, rnd);
  if (next.join("") === tokens.join("")) next = tokens.slice().reverse();
  const sep = rnd() < 0.55 ? "" : rnd() < 0.5 ? "·" : " ";
  return next.join(sep);
}

/** Tiene l'ordine ma rende il blocco più illeggibile (spazi/separatori). */
function chaosEmojiSequenceKeepOrder(text, seed = "") {
  const tokens = extractEmojiTokens(text);
  if (tokens.length <= 1) return String(text || "").trim();
  const rnd = mulberry32(hashSeed(`chaos:${seed || text}`));
  const sep = rnd() < 0.4 ? "" : rnd() < 0.5 ? "·" : "•";
  return tokens.join(sep);
}

function distortMinigameText(text, seed = "") {
  const raw = String(text || "");
  if (!raw.trim()) return raw;
  const rnd = mulberry32(hashSeed(seed || raw));
  const tokens = [];
  let cursor = 0;
  const combined = new RegExp(`${MENTION_TOKEN_RE.source}|${MARKDOWN_LINK_RE.source}`, "g");
  let match = null;
  while ((match = combined.exec(raw)) !== null) {
    if (match.index > cursor) tokens.push({ type: "text", value: raw.slice(cursor, match.index) });
    tokens.push({ type: "keep", value: match[0] });
    cursor = match.index + match[0].length;
  }
  if (cursor < raw.length) tokens.push({ type: "text", value: raw.slice(cursor) });
  return tokens.map((part) => (part.type === "keep" ? part.value : distortPlainSegment(part.value, rnd))).join("");
}

async function flipImageBuffer(inputBuffer, mode = "h") {
  if (!createCanvas || !loadImage || !inputBuffer?.length) return inputBuffer;
  const img = await loadImage(inputBuffer).catch(() => null);
  if (!img?.width || !img?.height) return inputBuffer;
  const w = img.width;
  const h = img.height;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.save();
  if (mode === "v") {
    ctx.translate(0, h);
    ctx.scale(1, -1);
  } else if (mode === "both") {
    ctx.translate(w, h);
    ctx.scale(-1, -1);
  } else {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(img, 0, 0, w, h);
  ctx.restore();
  return canvas.toBuffer("image/png");
}

async function pixelateImageBuffer(inputBuffer, seed = "") {
  if (!createCanvas || !loadImage || !inputBuffer?.length) return inputBuffer;
  const img = await loadImage(inputBuffer).catch(() => null);
  if (!img?.width || !img?.height) return inputBuffer;
  const w = img.width;
  const h = img.height;
  const rnd = mulberry32(hashSeed(seed || "pixel"));
  // Burrobirra strong: pixel più grossolani (immagini quasi illeggibili).
  const scale = 0.07 + rnd() * 0.09;
  const sw = Math.max(10, Math.floor(w * scale));
  const sh = Math.max(10, Math.floor(h * scale));
  const small = createCanvas(sw, sh);
  const sctx = small.getContext("2d");
  sctx.drawImage(img, 0, 0, sw, sh);
  const out = createCanvas(w, h);
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = false;
  octx.drawImage(small, 0, 0, sw, sh, 0, 0, w, h);
  return out.toBuffer("image/png");
}

async function obfuscateMinigameImageBuffer(inputBuffer, seed = "") {
  if (!inputBuffer?.length) return inputBuffer;
  let buf = await pixelateImageBuffer(inputBuffer, seed);
  buf = await flipImageBuffer(buf, pickFlipMode(seed));
  return buf;
}

function pickFlipMode(seed) {
  const rnd = mulberry32(hashSeed(seed));
  const roll = rnd();
  if (roll < 0.45) return "h";
  if (roll < 0.8) return "v";
  return "both";
}

async function distortAttachmentBuilder(file, seed = "") {
  if (!file) return file;
  const safeSeed = seed || file.name || "file";
  try {
    if (file.attachment instanceof Buffer) {
      const obfuscated = await obfuscateMinigameImageBuffer(file.attachment, safeSeed);
      return new AttachmentBuilder(obfuscated, { name: file.name || "burrobirra.png" });
    }
    if (typeof file.toBuffer === "function") {
      const buf = await file.toBuffer().catch(() => null);
      if (buf?.length) {
        const obfuscated = await obfuscateMinigameImageBuffer(buf, safeSeed);
        return new AttachmentBuilder(obfuscated, { name: file.name || "burrobirra.png" });
      }
    }
  } catch (_) {}
  return file;
}

async function fetchAndFlipUrlImage(url, seed = "") {
  const safeUrl = String(url || "").trim();
  if (!/^https?:\/\//i.test(safeUrl)) return null;
  try {
    const res = await axios.get(safeUrl, { responseType: "arraybuffer", timeout: 12_000, maxContentLength: 8 * 1024 * 1024 });
    const buf = Buffer.from(res.data);
    const obfuscated = await obfuscateMinigameImageBuffer(buf, seed || safeUrl);
    const name = `burrobirra_${hashSeed(safeUrl).toString(16)}.png`;
    return new AttachmentBuilder(obfuscated, { name });
  } catch (_) {
    return null;
  }
}

function isEmojiOnlySequenceText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  const stripped = trimmed.replace(/[\s\uFE0F\u200D]/g, "");
  if (!stripped) return false;
  return !/[A-Za-z0-9]/.test(stripped);
}

function distortQuestionDescriptionLine(line, seed) {
  const raw = String(line || "");
  if (!raw.trim()) return raw;
  const domandaMatch = raw.match(/^([\s\S]*?\*\*(?:Domanda|Affermazione):\*\*\s*)([\s\S]*)$/i);
  if (domandaMatch) {
    return domandaMatch[1] + distortMinigameText(domandaMatch[2], `${seed}:domanda`);
  }
  const optionMatch = raw.match(/^(\*\*[A-D]\)\*\*\s*)([\s\S]*)$/i);
  if (optionMatch) {
    return optionMatch[1] + distortMinigameText(optionMatch[2], `${seed}:opt`);
  }
  const wordMatch = raw.match(/^([\s\S]*?parola da queste lettere:\s*)\*\*([^*]+)\*\*([\s\S]*)$/i);
  if (wordMatch) {
    // Le lettere sono già lo scramble del puzzle: non rimescolarle (rischio di ricomporre la parola).
    return raw;
  }
  const rangeMatch = raw.match(/^([\s\S]*?tra\s*)\*\*([^*]+)\*\*(\s+e\s*)\*\*([^*]+)\*\*([\s\S]*)$/i);
  if (rangeMatch) {
    return `${rangeMatch[1]}**${distortMinigameText(rangeMatch[2], `${seed}:min`)}**${rangeMatch[3]}**${distortMinigameText(rangeMatch[4], `${seed}:max`)}**${rangeMatch[5]}`;
  }
  const solveMatch = raw.match(/^([\s\S]*?Risolvi:\s*)\*\*([^*]+)\*\*([\s\S]*)$/i);
  if (solveMatch) {
    return `${solveMatch[1]}**${distortMinigameText(solveMatch[2], `${seed}:expr`)}**${solveMatch[3]}`;
  }
  const hashMatch = raw.match(/^(\#\s+)([\s\S]+)$/);
  if (hashMatch) {
    // Numeri cifrario: già mescolati a monte del game — non invertire le cifre.
    if (isNumericCipherLine(hashMatch[2])) return raw;
    if (isEmojiOnlySequenceText(hashMatch[2])) {
      return `${hashMatch[1]}${scrambleEmojiSequenceText(hashMatch[2], `${seed}:hash-emoji`)}`;
    }
    return `${hashMatch[1]}${distortMinigameText(hashMatch[2], `${seed}:hash`)}`;
  }
  const completaMatch = raw.match(/^([\s\S]*?Completa:\s*)\*\*([^*]+)\*\*([\s\S]*)$/i);
  if (completaMatch) {
    return `${completaMatch[1]}**${distortMinigameText(completaMatch[2], `${seed}:completa`)}**${completaMatch[3]}`;
  }
  const proverbMatch = raw.match(/^([\s\S]*?)\*\*([^*]+)\*\*(\s*\.\.\.\s*Completa il proverbio[\s\S]*)$/i);
  if (proverbMatch) {
    return `${proverbMatch[1]}**${distortMinigameText(proverbMatch[2], `${seed}:proverb`)}**${proverbMatch[3]}`;
  }
  const yearMatch = raw.match(/^([\s\S]*?è uscito\s*)\*\*([^*]+)\*\*([\s\S]*)$/i);
  if (yearMatch) {
    return `${yearMatch[1]}**${distortMinigameText(yearMatch[2], `${seed}:year`)}**${yearMatch[3]}`;
  }
  const emojiMatch = raw.match(/^([\s\S]*?rappresenta\s*)\*\*([^*]+)\*\*([\s\S]*)$/i);
  if (emojiMatch) {
    return `${emojiMatch[1]}**${distortMinigameText(emojiMatch[2], `${seed}:emoji`)}**${emojiMatch[3]}`;
  }
  const cityMatch = raw.match(/^([\s\S]*?si trova\s*)\*\*([^*]+)\*\*([\s\S]*)$/i);
  if (cityMatch) {
    return `${cityMatch[1]}**${distortMinigameText(cityMatch[2], `${seed}:city`)}**${cityMatch[3]}`;
  }
  const synonymMatch = raw.match(/^([\s\S]*?\sdi\s)\*\*([^*]+)\*\*([\s\S]*)$/i);
  if (synonymMatch && /sinonimo|contrario/i.test(raw)) {
    return `${synonymMatch[1]}**${distortMinigameText(synonymMatch[2], `${seed}:word`)}**${synonymMatch[3]}`;
  }
  const quoteMatch = raw.match(/^([\s\S]*?\*")([^"]+)("\*[\s\S]*)$/);
  if (quoteMatch) {
    return `${quoteMatch[1]}${distortMinigameText(quoteMatch[2], `${seed}:quote`)}${quoteMatch[3]}`;
  }
  return raw;
}

function distortEmbedJsonQuestionOnly(embedJson, seed) {
  if (!embedJson || typeof embedJson !== "object") return embedJson;
  const out = { ...embedJson };
  if (out.title) out.title = distortMinigameText(String(out.title), `${seed}:title`);
  if (out.description) {
    const lines = String(out.description).split("\n");
    out.description = lines.map((line, idx) => distortQuestionDescriptionLine(line, `${seed}:l${idx}`)).join("\n");
  }
  if (Array.isArray(out.fields)) {
    out.fields = out.fields.map((field, idx) => {
      const name = String(field?.name || "");
      const value = String(field?.value || "");
      if (/^sequenza$/i.test(name.trim()) && isEmojiOnlySequenceText(value)) {
        // Ordine già deciso dal game: caos solo visivo (separatori), senza riordinare.
        return {
          ...field,
          name: distortMinigameText(name, `${seed}:f${idx}:n`) || name,
          value: chaosEmojiSequenceKeepOrder(value, `${seed}:f${idx}:seq`),
        };
      }
      return {
        ...field,
        name: field?.name ? distortMinigameText(name, `${seed}:f${idx}:n`) : field?.name,
        value: field?.value ? distortMinigameText(value, `${seed}:f${idx}:v`) : field?.value,
      };
    });
  }
  return out;
}

function distortEmbedJson(embedJson, seed) {
  if (!embedJson || typeof embedJson !== "object") return embedJson;
  const out = { ...embedJson };
  if (out.title) out.title = distortMinigameText(out.title, `${seed}:title`);
  if (out.description) out.description = distortMinigameText(out.description, `${seed}:desc`);
  if (out.footer?.text) out.footer = { ...out.footer, text: distortMinigameText(out.footer.text, `${seed}:footer`) };
  if (Array.isArray(out.fields)) {
    out.fields = out.fields.map((field, idx) => ({
      ...field,
      name: field?.name ? distortMinigameText(String(field.name), `${seed}:f${idx}:n`) : field?.name,
      value: field?.value ? distortMinigameText(String(field.value), `${seed}:f${idx}:v`) : field?.value,
    }));
  }
  return out;
}

function shouldSkipBurrobirraFileDistort(file) {
  const name = String(file?.name || "").toLowerCase();
  // Puzzle payload: non pixelare/flippare (invertirebbe l'ordine dei numeri/lettere).
  return (
    name === "hogwarts_cipher.png" ||
    name === "guess_word.png" ||
    name.startsWith("hogwarts_cipher") ||
    name.startsWith("guess_word")
  );
}

async function applyBurrobirraToPayload(payload, seed = "minigame", options = null) {
  if (!payload || typeof payload !== "object") return payload;
  const mode = String(options?.mode || "full").trim().toLowerCase();
  const questionOnly = mode === "question";
  const out = { ...payload };
  if (!questionOnly && typeof out.content === "string" && out.content.trim()) {
    out.content = distortMinigameText(out.content, `${seed}:content`);
  }
  const files = Array.isArray(out.files) ? [...out.files] : [];
  const embeds = Array.isArray(out.embeds) ? [...out.embeds] : [];
  const nextEmbeds = [];
  for (let i = 0; i < embeds.length; i += 1) {
    const embed = embeds[i];
    const json = typeof embed?.toJSON === "function" ? embed.toJSON() : embed;
    const distorted = questionOnly ? distortEmbedJsonQuestionOnly(json, `${seed}:e${i}`) : distortEmbedJson(json, `${seed}:e${i}`);
    const imageUrl = String(distorted?.image?.url || "").trim();
    if (questionOnly && imageUrl.startsWith("http")) {
      const attachment = await fetchAndFlipUrlImage(imageUrl, `${seed}:img${i}`);
      if (attachment) {
        files.push(attachment);
        distorted.image = { url: `attachment://${attachment.name}` };
      }
    } else if (!questionOnly && imageUrl.startsWith("http")) {
      const attachment = await fetchAndFlipUrlImage(imageUrl, `${seed}:img${i}`);
      if (attachment) {
        files.push(attachment);
        distorted.image = { url: `attachment://${attachment.name}` };
      }
    } else if (imageUrl.startsWith("attachment://")) {
      const attName = imageUrl.slice("attachment://".length);
      const idx = files.findIndex((f) => String(f?.name || "") === attName);
      if (idx >= 0 && !shouldSkipBurrobirraFileDistort(files[idx])) {
        files[idx] = await distortAttachmentBuilder(files[idx], `${seed}:att${idx}`);
      }
    }
    nextEmbeds.push(distorted);
  }
  out.embeds = nextEmbeds;
  out.files = await Promise.all(
    files.map((file, idx) =>
      shouldSkipBurrobirraFileDistort(file)
        ? file
        : distortAttachmentBuilder(file, `${seed}:file${idx}`),
    ),
  );
  return out;
}

module.exports = {
  distortMinigameText,
  applyBurrobirraToPayload,
  distortAttachmentBuilder,
  fetchAndFlipUrlImage,
  shuffleSpacedTokens,
  scrambleEmojiSequenceText,
  chaosEmojiSequenceKeepOrder,
};