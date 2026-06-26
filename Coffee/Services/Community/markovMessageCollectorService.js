const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { isMarkovEligibleChannel, listMarkovEligibleChannels, listMarkovEligibleThreads } = require("./markovChannelAccess");
const { extractMessageImageUrls, extractMessageStickerIds } = require("./markovMediaUtils");
const { looksLikeWrittenCommand, sanitizeMarkovCollectLine } = require("./markovCommandStyleService");

const COFFEE_ROOT = path.join(__dirname, "..", "..");
const trimTimers = new Map();
const imageTrimTimers = new Map();
const stickerTrimTimers = new Map();

function getMarkovConfig(client) {
  return client?.config?.markov || {};
}

function isMarkovEnabled(client) {
  const cfg = getMarkovConfig(client);
  return cfg.enabled !== false;
}

function resolveMessagesDir(client) {
  const rel = String(getMarkovConfig(client).messagesPath || "Data/markov/messages").trim() || "Data/markov/messages";
  return path.resolve(COFFEE_ROOT, rel);
}

function resolveImagesDir(client) {
  const rel = String(getMarkovConfig(client).imagesPath || "Data/markov/images").trim() || "Data/markov/images";
  return path.resolve(COFFEE_ROOT, rel);
}

function resolveStickersDir(client) {
  const rel = String(getMarkovConfig(client).stickersPath || "Data/markov/stickers").trim() || "Data/markov/stickers";
  return path.resolve(COFFEE_ROOT, rel);
}

function channelFilePath(client, channelId) {
  const safeId = String(channelId || "").trim();
  if (!/^\d{5,30}$/.test(safeId)) return null;
  return path.join(resolveMessagesDir(client), `${safeId}.txt`);
}

function channelImagesFilePath(client, channelId) {
  const safeId = String(channelId || "").trim();
  if (!/^\d{5,30}$/.test(safeId)) return null;
  return path.join(resolveImagesDir(client), `${safeId}.json`);
}

function channelStickersFilePath(client, channelId) {
  const safeId = String(channelId || "").trim();
  if (!/^\d{5,30}$/.test(safeId)) return null;
  return path.join(resolveStickersDir(client), `${safeId}.json`);
}

function normalizeMarkovLine(content) {
  const text = String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " ")
    .replace(/<@&\d{16,20}>/g, "")
    .replace(/<#\d{16,20}>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function countWords(text) {
  const parts = String(text || "").trim().split(/\s+/).filter(Boolean);
  return parts.length;
}

function shouldSkipPrefixMessage(content, client) {
  if (getMarkovConfig(client).collectPrefixMessages !== false) return false;
  const prefix = String(client?.config?.prefix || ",").trim();
  if (!prefix) return false;
  return String(content || "").trimStart().startsWith(prefix);
}

function canStoreImages(client) {
  return getMarkovConfig(client).storeImages !== false;
}

function canStoreStickers(client) {
  return getMarkovConfig(client).storeStickers !== false;
}

function passesEligibility(message, client, options = {}) {
  if (!message || !message.guild) return false;
  if (!isMarkovEnabled(client)) return false;
  if (message.author?.bot || message.webhookId) return false;
  if (message.system) return false;
  if (options.skipEligibilityCheck) return true;
  return isMarkovEligibleChannel(message.channel, message.guild, client.config || {}, client);
}

function hasCollectibleText(message, client) {
  const content = String(message?.content || "").trim();
  if (!content) return false;
  if (getMarkovConfig(client).collectPrefixMessages !== false && looksLikeWrittenCommand(content)) {
    return Boolean(sanitizeMarkovCollectLine(client, content));
  }
  if (shouldSkipPrefixMessage(content, client)) return false;
  const minWords = Number(getMarkovConfig(client).minStoredWords ?? 2);
  return countWords(content) >= Math.max(1, minWords);
}

function hasCollectibleImages(message, client) {
  if (!canStoreImages(client)) return false;
  return extractMessageImageUrls(message).length > 0;
}

function hasCollectibleStickers(message, client) {
  if (!canStoreStickers(client)) return false;
  return extractMessageStickerIds(message).length > 0;
}

function isCollectibleMessage(message, client, options = {}) {
  if (!passesEligibility(message, client, options)) return false;
  return hasCollectibleText(message, client) || hasCollectibleImages(message, client) || hasCollectibleStickers(message, client);
}

async function ensureMessagesDir(client) {
  const dir = resolveMessagesDir(client);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function ensureImagesDir(client) {
  const dir = resolveImagesDir(client);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function ensureStickersDir(client) {
  const dir = resolveStickersDir(client);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function readChannelLines(client, channelId, opts = {}) {
  const filePath = channelFilePath(client, channelId);
  if (!filePath || !fs.existsSync(filePath)) return [];
  const maxLines = Number.isFinite(Number(opts.maxLines)) ? Number(opts.maxLines) : -1;
  const cleanLinks = Boolean(opts.cleanLinks);
  const raw = await fsp.readFile(filePath, "utf8").catch(() => "");
  const uriRe = /https?:\/\/[^\s/$.?#][^\s]*/gi;
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  const sliced = maxLines > 0 ? lines.slice(-maxLines) : lines;
  if (!cleanLinks) return sliced;
  return sliced.map((line) => line.replace(uriRe, "").replace(/\s+/g, " ").trim()).filter(Boolean);
}

async function readChannelImages(client, channelId, opts = {}) {
  const filePath = channelImagesFilePath(client, channelId);
  if (!filePath || !fs.existsSync(filePath)) return [];
  const maxImages = Number.isFinite(Number(opts.maxImages)) ? Number(opts.maxImages) : -1;
  let parsed = [];
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      parsed = data.map((entry) => String(entry?.url || entry || "").trim()).filter(Boolean);
    }
  } catch {
    parsed = [];
  }
  if (maxImages > 0) return parsed.slice(-maxImages);
  return parsed;
}

async function readChannelStickers(client, channelId, opts = {}) {
  const filePath = channelStickersFilePath(client, channelId);
  if (!filePath || !fs.existsSync(filePath)) return [];
  const maxStickers = Number.isFinite(Number(opts.maxStickers)) ? Number(opts.maxStickers) : -1;
  let parsed = [];
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      parsed = data
        .map((entry) => String(entry?.id || entry || "").trim())
        .filter((id) => /^\d{5,30}$/.test(id));
    }
  } catch {
    parsed = [];
  }
  if (maxStickers > 0) return parsed.slice(-maxStickers);
  return parsed;
}

function resolveStoredDir(client, kind = "messages") {
  if (kind === "images") return resolveImagesDir(client);
  if (kind === "stickers") return resolveStickersDir(client);
  return resolveMessagesDir(client);
}

async function listStoredChannelIds(client, kind = "messages") {
  const dir = resolveStoredDir(client, kind);
  if (!fs.existsSync(dir)) return [];
  const suffix = kind === "messages" ? ".txt" : ".json";
  const entries = await fsp.readdir(dir).catch(() => []);
  return entries
    .filter((name) => name.endsWith(suffix))
    .map((name) => name.slice(0, -suffix.length))
    .filter((id) => /^\d{5,30}$/.test(id));
}

async function readGuildCorpus(client, opts = {}) {
  await ensureMessagesDir(client);
  const channelIds = await listStoredChannelIds(client, "messages");
  const lines = [];
  for (const channelId of channelIds) {
    const part = await readChannelLines(client, channelId, opts);
    if (part.length) lines.push(...part);
  }
  return lines;
}

async function readGuildImages(client, opts = {}) {
  await ensureImagesDir(client);
  const channelIds = await listStoredChannelIds(client, "images");
  const images = [];
  const seen = new Set();
  for (const channelId of channelIds) {
    const part = await readChannelImages(client, channelId, opts);
    for (const url of part) {
      if (seen.has(url)) continue;
      seen.add(url);
      images.push(url);
    }
  }
  return images;
}

async function readGuildStickers(client, opts = {}) {
  await ensureStickersDir(client);
  const channelIds = await listStoredChannelIds(client, "stickers");
  const stickers = [];
  const seen = new Set();
  for (const channelId of channelIds) {
    const part = await readChannelStickers(client, channelId, opts);
    for (const id of part) {
      if (seen.has(id)) continue;
      seen.add(id);
      stickers.push(id);
    }
  }
  return stickers;
}

async function writeChannelImages(client, channelId, urls) {
  const filePath = channelImagesFilePath(client, channelId);
  if (!filePath) return false;
  await ensureImagesDir(client);
  const payload = urls.map((url) => ({ url }));
  await fsp.writeFile(filePath, JSON.stringify(payload), "utf8");
  return true;
}

async function writeChannelStickers(client, channelId, ids) {
  const filePath = channelStickersFilePath(client, channelId);
  if (!filePath) return false;
  await ensureStickersDir(client);
  const payload = ids.map((id) => ({ id }));
  await fsp.writeFile(filePath, JSON.stringify(payload), "utf8");
  return true;
}

async function trimChannelFile(client, channelId) {
  const cfg = getMarkovConfig(client);
  const maxLines = Number(cfg.maxLinesPerChannel ?? 10000);
  if (!Number.isFinite(maxLines) || maxLines <= 0) return;
  const filePath = channelFilePath(client, channelId);
  if (!filePath || !fs.existsSync(filePath)) return;
  const lines = await readChannelLines(client, channelId);
  if (lines.length <= maxLines) return;
  const kept = lines.slice(-maxLines);
  await fsp.writeFile(filePath, kept.join("\n"), "utf8");
}

async function trimChannelImages(client, channelId) {
  const cfg = getMarkovConfig(client);
  const maxImages = Number(cfg.maxImagesPerChannel ?? 500);
  if (!Number.isFinite(maxImages) || maxImages <= 0) return;
  const images = await readChannelImages(client, channelId);
  if (images.length <= maxImages) return;
  await writeChannelImages(client, channelId, images.slice(-maxImages));
}

async function trimChannelStickers(client, channelId) {
  const cfg = getMarkovConfig(client);
  const maxStickers = Number(cfg.maxStickersPerChannel ?? 200);
  if (!Number.isFinite(maxStickers) || maxStickers <= 0) return;
  const stickers = await readChannelStickers(client, channelId);
  if (stickers.length <= maxStickers) return;
  await writeChannelStickers(client, channelId, stickers.slice(-maxStickers));
}

function scheduleTrimChannelFile(client, channelId) {
  const key = String(channelId || "");
  if (!key || trimTimers.has(key)) return;
  const timer = setTimeout(() => {
    trimTimers.delete(key);
    void trimChannelFile(client, channelId).catch((err) => {
      global.logger?.warn?.("[MARKOV] trim failed:", err?.message || err);
    });
  }, 15000);
  trimTimers.set(key, timer);
}

function scheduleTrimChannelImages(client, channelId) {
  const key = String(channelId || "");
  if (!key || imageTrimTimers.has(key)) return;
  const timer = setTimeout(() => {
    imageTrimTimers.delete(key);
    void trimChannelImages(client, channelId).catch((err) => {
      global.logger?.warn?.("[MARKOV] image trim failed:", err?.message || err);
    });
  }, 15000);
  imageTrimTimers.set(key, timer);
}

function scheduleTrimChannelStickers(client, channelId) {
  const key = `sticker:${String(channelId || "")}`;
  if (!key || stickerTrimTimers.has(key)) return;
  const timer = setTimeout(() => {
    stickerTrimTimers.delete(key);
    void trimChannelStickers(client, channelId).catch((err) => {
      global.logger?.warn?.("[MARKOV] sticker trim failed:", err?.message || err);
    });
  }, 15000);
  stickerTrimTimers.set(key, timer);
}

async function appendMarkovLine(client, channelId, line) {
  const sanitized = sanitizeMarkovCollectLine(client, line);
  const normalized = normalizeMarkovLine(sanitized);
  if (!normalized) return false;
  await ensureMessagesDir(client);
  const filePath = channelFilePath(client, channelId);
  if (!filePath) return false;
  await fsp.appendFile(filePath, `${normalized}\n`, "utf8");
  scheduleTrimChannelFile(client, channelId);
  return true;
}

async function appendMarkovImages(client, channelId, urls) {
  const incoming = (Array.isArray(urls) ? urls : []).map((url) => String(url || "").trim()).filter(Boolean);
  if (!incoming.length) return false;
  const existing = await readChannelImages(client, channelId);
  const merged = [...existing, ...incoming];
  const deduped = [];
  const seen = new Set();
  for (const url of merged) {
    if (seen.has(url)) continue;
    seen.add(url);
    deduped.push(url);
  }
  await writeChannelImages(client, channelId, deduped);
  scheduleTrimChannelImages(client, channelId);
  return true;
}

async function appendMarkovStickers(client, channelId, ids) {
  const incoming = (Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim())
    .filter((id) => /^\d{5,30}$/.test(id));
  if (!incoming.length) return false;
  const existing = await readChannelStickers(client, channelId);
  const merged = [...existing, ...incoming];
  const deduped = [];
  const seen = new Set();
  for (const id of merged) {
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
  }
  await writeChannelStickers(client, channelId, deduped);
  scheduleTrimChannelStickers(client, channelId);
  return true;
}

async function ingestMarkovMessage(message, client, options = {}) {
  if (!passesEligibility(message, client, options)) return false;
  let stored = false;
  if (hasCollectibleText(message, client)) {
    stored = await appendMarkovLine(client, message.channelId, message.content) || stored;
  }
  if (hasCollectibleImages(message, client)) {
    const urls = extractMessageImageUrls(message);
    stored = await appendMarkovImages(client, message.channelId, urls) || stored;
  }
  if (hasCollectibleStickers(message, client)) {
    const ids = extractMessageStickerIds(message);
    stored = await appendMarkovStickers(client, message.channelId, ids) || stored;
  }
  return stored;
}

async function ingestMarkovMessageCreate(message, client) {
  try {
    return await ingestMarkovMessage(message, client);
  } catch (err) {
    global.logger?.warn?.("[MARKOV] ingest failed:", err?.message || err);
    return false;
  }
}

async function backfillChannelHistory(channel, client, limit) {
  if (!channel || typeof channel.messages?.fetch !== "function") return 0;
  const fetchLimit = Math.min(Math.max(1, Number(limit) || 100), 100);
  const batch = await channel.messages.fetch({ limit: fetchLimit }).catch(() => null);
  if (!batch?.size) return 0;
  const sorted = [...batch.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  let added = 0;
  for (const message of sorted) {
    const ok = await ingestMarkovMessage(message, client, { skipEligibilityCheck: true });
    if (ok) added += 1;
  }
  return added;
}

async function backfillMarkovCorpus(client) {
  const cfg = getMarkovConfig(client);
  if (!isMarkovEnabled(client)) return { channels: 0, threads: 0, lines: 0, skipped: false };
  if (cfg.backfillOnStartup === false) return { channels: 0, threads: 0, lines: 0, skipped: false };
  const guildId = String(client?.config?.mainGuildId || "").trim();
  if (!/^\d{5,30}$/.test(guildId)) return { channels: 0, threads: 0, lines: 0, skipped: false };

  const skipIfLines = Number(
    cfg.backfillSkipIfGuildLinesAtLeast ?? cfg.autoSend?.minCorpusLines ?? 30,
  );
  if (Number.isFinite(skipIfLines) && skipIfLines > 0) {
    const existing = await readGuildCorpus(client);
    if (existing.length >= skipIfLines) {
      return { channels: 0, threads: 0, lines: 0, skipped: true };
    }
  }

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { channels: 0, threads: 0, lines: 0, skipped: false };
  await ensureMessagesDir(client);
  await ensureImagesDir(client);
  await ensureStickersDir(client);
  const perChannel = Number(cfg.backfillMessagesPerChannel ?? 100);
  const channels = await listMarkovEligibleChannels(guild, client.config || {}, client);
  const threads = await listMarkovEligibleThreads(guild, client.config || {}, client);
  let lines = 0;
  for (const channel of channels) {
    lines += await backfillChannelHistory(channel, client, perChannel);
  }
  for (const thread of threads) {
    lines += await backfillChannelHistory(thread, client, perChannel);
  }
  return { channels: channels.length, threads: threads.length, lines, skipped: false };
}

function startMarkovBackfill(client) {
  void backfillMarkovCorpus(client).catch((err) => {
    global.logger?.warn?.("[MARKOV] backfill failed:", err?.message || err);
  });
}

module.exports = { COFFEE_ROOT, getMarkovConfig, isMarkovEnabled, resolveMessagesDir, resolveImagesDir, resolveStickersDir, channelFilePath, channelImagesFilePath, channelStickersFilePath, normalizeMarkovLine, readChannelLines, readChannelImages, readChannelStickers, readGuildCorpus, readGuildImages, readGuildStickers, listStoredChannelIds, appendMarkovLine, appendMarkovImages, appendMarkovStickers, ingestMarkovMessage, ingestMarkovMessageCreate, backfillMarkovCorpus, startMarkovBackfill, ensureMessagesDir, ensureImagesDir, ensureStickersDir, trimChannelFile, trimChannelImages, trimChannelStickers, scheduleTrimChannelFile, scheduleTrimChannelImages, scheduleTrimChannelStickers, extractMessageImageUrls, extractMessageStickerIds };