const { readChannelLines, readGuildCorpus, getMarkovConfig, isMarkovEnabled } = require("./markovMessageCollectorService");
const { isMarkovEligibleChannel } = require("./markovChannelAccess");
const { filterUnsafeMarkovLines } = require("../../../shared/moderation/markovTextSafety");
const generateCooldowns = new Map();

function parseGeneratorUrl(client) {
  const raw = String(getMarkovConfig(client).generatorServiceUrl || "").trim();
  return raw || null;
}

function getGenerateCooldownMs(client) {
  const ms = Number(getMarkovConfig(client).generateCooldownMs ?? 5000);
  return Number.isFinite(ms) && ms > 0 ? ms : 5000;
}

function checkGenerateCooldown(userId, channelId, client) {
  const key = `${String(userId)}:${String(channelId)}`;
  const now = Date.now();
  const waitMs = getGenerateCooldownMs(client);
  const last = generateCooldowns.get(key) || 0;
  if (now - last < waitMs) {
    return { ok: false, retryAfterMs: waitMs - (now - last) };
  }
  generateCooldowns.set(key, now);
  return { ok: true, retryAfterMs: 0 };
}

function buildMarkovModel(lines, keySize = 2) {
  const model = new Map();
  for (const line of lines) {
    const words = String(line || "").trim().split(/\s+/).filter(Boolean);
    if (words.length <= keySize) continue;
    for (let i = 0; i < words.length - keySize; i += 1) {
      const key = words.slice(i, i + keySize).join(" ");
      const next = words[i + keySize];
      if (!model.has(key)) model.set(key, []);
      model.get(key).push(next);
    }
  }
  return model;
}

function pickRandom(items) {
  if (!items?.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function generateLocalMarkov(lines, options = {}) {
  const hardMax = Math.min(Math.max(Number(options.maxSymbols) || 180, 1), 500);
  const minTarget = Math.max(40, Math.floor(hardMax * 0.4));
  const targetLen = Number.isFinite(Number(options.targetSymbols))
    ? Math.min(hardMax, Math.max(minTarget, Number(options.targetSymbols)))
    : minTarget + Math.floor(Math.random() * (hardMax - minTarget + 1));
  const count = Math.min(Math.max(Number(options.count) || 1, 1), 5);
  const keySize = Math.min(Math.max(Number(options.keySize) || 2, 1), 3);
  const begin = String(options.begin || "").trim();
  const model = buildMarkovModel(lines, keySize);
  if (!model.size) return [];
  const out = [];
  for (let n = 0; n < count; n += 1) {
    let words = begin ? begin.split(/\s+/).filter(Boolean) : [];
    if (!words.length) {
      const starter = pickRandom(lines);
      if (!starter) continue;
      words = starter.split(/\s+/).filter(Boolean).slice(0, keySize);
    }
    while (words.length < keySize) {
      const seed = pickRandom(lines);
      if (!seed) break;
      const seedWords = seed.split(/\s+/).filter(Boolean);
      words = seedWords.slice(0, keySize);
    }
    let text = words.join(" ");
    let guard = 0;
    while (text.length < targetLen && guard < hardMax) {
      guard += 1;
      const key = words.slice(-keySize).join(" ");
      const nextWords = model.get(key);
      if (!nextWords?.length) break;
      const next = pickRandom(nextWords);
      const candidate = `${text} ${next}`;
      if (candidate.length > hardMax) break;
      words.push(next);
      text = candidate;
    }
    const trimmed = text.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

async function requestRemoteGeneration(client, channelId, options = {}) {
  const baseUrl = parseGeneratorUrl(client);
  if (!baseUrl) return null;
  const url = new URL(baseUrl);
  url.searchParams.set("channel_id", String(channelId));
  if (options.maxSymbols != null) url.searchParams.set("max_symbols", String(options.maxSymbols));
  if (options.count != null) url.searchParams.set("count", String(options.count));
  if (options.keySize != null) url.searchParams.set("key_size", String(options.keySize));
  if (options.begin) url.searchParams.set("begin", String(options.begin));
  if (options.filterLinks != null) url.searchParams.set("filter_links", options.filterLinks ? "true" : "false");
  const controller = new AbortController();
  const timeoutMs = Number(getMarkovConfig(client).generatorTimeoutMs ?? 8000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), { method: "GET", signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`generator HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("generator response is not an array");
    return data.map((line) => String(line || "").trim()).filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

async function generateMarkovLines(client, channel, options = {}) {
  if (!client || !channel) return { ok: false, reason: "missing_channel", lines: [] };
  if (!isMarkovEnabled(client)) return { ok: false, reason: "disabled", lines: [] };
  const guild = channel.guild;
  if (!guild) return { ok: false, reason: "missing_guild", lines: [] };
  const useGuildCorpus = options.corpusScope === "guild";
  if (!useGuildCorpus && !isMarkovEligibleChannel(channel, guild, client.config || {}, client)) {
    return { ok: false, reason: "channel_not_eligible", lines: [] };
  }
  const cfg = getMarkovConfig(client);
  const genOptions = {
    maxSymbols: options.maxSymbols ?? cfg.defaultMaxSymbols ?? 180,
    count: options.count ?? 1,
    keySize: options.keySize ?? cfg.defaultKeySize ?? 2,
    begin: options.begin || "",
    filterLinks: options.filterLinks ?? cfg.filterLinks !== false,
  };
  const channelId = String(channel.id);
  let lines = [];
  let source = "local";
  if (parseGeneratorUrl(client) && !useGuildCorpus) {
    try {
      const remote = await requestRemoteGeneration(client, channelId, genOptions);
      if (remote?.length) {
        lines = remote;
        source = "remote";
      }
    } catch (err) {
      global.logger?.warn?.("[MARKOV] remote generator failed:", err?.message || err);
      if (cfg.fallbackLocalOnRemoteError === false) {
        return { ok: false, reason: "remote_failed", lines: [], error: err?.message || String(err) };
      }
    }
  }
  if (!lines.length) {
    const readOpts = {
      maxLines: Number(cfg.maxLinesPerChannel ?? 10000),
      cleanLinks: genOptions.filterLinks,
    };
    const corpus = Array.isArray(options.corpusLines) && options.corpusLines.length
      ? filterUnsafeMarkovLines(options.corpusLines)
      : filterUnsafeMarkovLines(
          useGuildCorpus
            ? await readGuildCorpus(client, readOpts)
            : await readChannelLines(client, channelId, readOpts),
        );
    if (!corpus.length) return { ok: false, reason: "no_corpus", lines: [] };
    lines = generateLocalMarkov(corpus, genOptions);
    source = useGuildCorpus ? "local-guild" : "local";
  }
  lines = filterUnsafeMarkovLines(lines);
  if (!lines.length) return { ok: false, reason: "generation_failed", lines: [] };
  return { ok: true, reason: null, lines, source };
}

module.exports = { checkGenerateCooldown, generateLocalMarkov, requestRemoteGeneration, generateMarkovLines };