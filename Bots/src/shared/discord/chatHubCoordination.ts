const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../recovery/snapshotStore") as typeof import("../recovery/snapshotStore");
const { pruneMapByAge, pruneMapByMaxSize, ensureMapPruneInterval } = require("../runtime/mapPrune") as typeof import("../runtime/mapPrune");

const CHAT_HUB_SOURCES = Object.freeze({ VINILI: "vinili", COFFEE: "coffee" });
const SNAPSHOT_PATH = path.join(__dirname, "chatHubPacing.snapshot.json");
const DEFAULT_CROSS_BOT_GAP_MS = 4 * 60 * 1000;
const DEFAULT_SAME_BOT_GAP_MS = 3 * 60 * 1000;
const RELOAD_MS = 1500;
const CHAT_HUB_MAX_AGE_MS = Math.max(
  10 * 60 * 1000,
  Number(process.env.VC_CHAT_HUB_MAP_MAX_AGE_MS || 6 * 60 * 60 * 1000) || 6 * 60 * 60 * 1000,
);
const CHAT_HUB_MAX_CHANNELS = Math.max(
  50,
  Number(process.env.VC_CHAT_HUB_MAP_MAX || 500) || 500,
);

const memoryByChannel = new Map();
let lastSnapshotLoadAt = 0;

ensureMapPruneInterval("__vcChatHubPruneInterval", () => {
  const now = Date.now();
  pruneMapByAge(memoryByChannel, {
    maxAgeMs: CHAT_HUB_MAX_AGE_MS,
    now,
    getTs: (_key?, row?) =>
      Math.max(Number(row?.vinili) || 0, Number(row?.coffee) || 0, Number(row?.quietUntil) || 0),
  });
  pruneMapByMaxSize(memoryByChannel, CHAT_HUB_MAX_CHANNELS);
  try {
    persistSnapshot();
  } catch (_) {}
}, 10 * 60 * 1000);

function channelKey(channelId?) {
  return String(channelId || "").trim();
}

function normalizeSource(source?) {
  const src = String(source || "").trim().toLowerCase();
  if (src === CHAT_HUB_SOURCES.VINILI || src === CHAT_HUB_SOURCES.COFFEE) return src;
  return "";
}

function emptyChannelRow() {
  return { vinili: 0, coffee: 0, quietUntil: 0 };
}

function loadSnapshotChannels() {
  const now = Date.now();
  if (now - lastSnapshotLoadAt < RELOAD_MS) return;
  lastSnapshotLoadAt = now;
  const raw = readSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    key: "chat_hub_pacing",
    version: 1,
    fallback: { channels: {} },
  });
  const channels = raw?.channels && typeof raw.channels === "object" ? raw.channels : {};
  for (const [id, row] of Object.entries(channels)) {
    const key = channelKey(id);
    if (!key || !row || typeof row !== "object") continue;
    const mem = memoryByChannel.get(key) || emptyChannelRow();
    mem.vinili = Math.max(mem.vinili, Number(row.vinili) || 0);
    mem.coffee = Math.max(mem.coffee, Number(row.coffee) || 0);
    mem.quietUntil = Math.max(mem.quietUntil, Number(row.quietUntil) || 0);
    memoryByChannel.set(key, mem);
  }
}

function persistSnapshot() {
  const channels: Record<string, any> = {};
  for (const [id, row] of memoryByChannel.entries()) {
    channels[id] = {
      vinili: Number(row.vinili) || 0,
      coffee: Number(row.coffee) || 0,
      quietUntil: Number(row.quietUntil) || 0,
    };
  }
  writeSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    key: "chat_hub_pacing",
    version: 1,
    payload: { channels },
  });
}

function getEntry(channelId?) {
  loadSnapshotChannels();
  const key = channelKey(channelId);
  if (!key) return emptyChannelRow();
  if (!memoryByChannel.has(key)) memoryByChannel.set(key, emptyChannelRow());
  return memoryByChannel.get(key);
}

function recordChatHubBotPost(channelId?, source?) {
  const key = channelKey(channelId);
  const src = normalizeSource(source);
  if (!key || !src) return;
  const entry = getEntry(key);
  entry[src] = Date.now();
  persistSnapshot();
}

function extendChatHubQuietUntil(channelId?, untilMs?) {
  const key = channelKey(channelId);
  const until = Math.floor(Number(untilMs) || 0);
  if (!key || until <= Date.now()) return;
  const entry = getEntry(key);
  entry.quietUntil = Math.max(Number(entry.quietUntil) || 0, until);
  persistSnapshot();
}

function extendChatHubQuietForMs(channelId?, durationMs?) {
  const ms = Math.max(0, Math.floor(Number(durationMs) || 0));
  if (!ms) return;
  extendChatHubQuietUntil(channelId, Date.now() + ms);
}

function msUntilOtherBotGap(channelId?, source?, gapMs = DEFAULT_CROSS_BOT_GAP_MS) {
  const key = channelKey(channelId);
  const src = normalizeSource(source);
  if (!key || !src) return 0;
  const other = src === CHAT_HUB_SOURCES.VINILI ? CHAT_HUB_SOURCES.COFFEE : CHAT_HUB_SOURCES.VINILI;
  const entry = getEntry(key);
  const last = Number(entry[other] || 0);
  if (!last) return 0;
  const gap = Math.max(60_000, Number(gapMs) || DEFAULT_CROSS_BOT_GAP_MS);
  return Math.max(0, last + gap - Date.now());
}

function msUntilSameBotGap(channelId?, source?, gapMs = DEFAULT_SAME_BOT_GAP_MS) {
  const key = channelKey(channelId);
  const src = normalizeSource(source);
  if (!key || !src) return 0;
  const entry = getEntry(key);
  const last = Number(entry[src] || 0);
  if (!last) return 0;
  const gap = Math.max(30_000, Number(gapMs) || DEFAULT_SAME_BOT_GAP_MS);
  return Math.max(0, last + gap - Date.now());
}

function msUntilChatHubQuiet(channelId?) {
  const entry = getEntry(channelId);
  const until = Number(entry.quietUntil) || 0;
  if (!until) return 0;
  return Math.max(0, until - Date.now());
}

function msUntilChatHubAllowsPost(channelId?, source?, options: Record<string, any> = {}) {
  const crossGapMs = options.crossBotGapMs ?? DEFAULT_CROSS_BOT_GAP_MS;
  const sameBotGapMs = options.sameBotGapMs ?? DEFAULT_SAME_BOT_GAP_MS;
  return Math.max(
    msUntilChatHubQuiet(channelId),
    msUntilOtherBotGap(channelId, source, crossGapMs),
    msUntilSameBotGap(channelId, source, sameBotGapMs),
  );
}

function waitMs(ms?) {
  const n = Math.max(0, Math.floor(Number(ms) || 0));
  if (!n) return Promise.resolve();
  return new Promise((resolve?) => {
    const t = setTimeout(resolve, n);
    if (typeof t.unref === "function") t.unref();
  });
}

async function waitForChatHubBotGap(channelId?, source?, gapMs = DEFAULT_CROSS_BOT_GAP_MS) {
  const wait = msUntilOtherBotGap(channelId, source, gapMs);
  if (wait > 0) await waitMs(wait);
}

async function waitForChatHubSlot(channelId?, source?, options: Record<string, any> = {}) {
  const maxWaitMs = Math.max(0, Math.floor(Number(options.maxWaitMs) || 0));
  const pollMs = Math.max(5_000, Math.floor(Number(options.pollMs) || 15_000));
  const started = Date.now();
  for (;;) {
    const wait = msUntilChatHubAllowsPost(channelId, source, options);
    if (wait <= 0) return true;
    if (maxWaitMs > 0 && Date.now() - started + wait > maxWaitMs) return false;
    const step = maxWaitMs > 0 ? Math.min(wait, pollMs, maxWaitMs - (Date.now() - started)) : Math.min(wait, pollMs);
    if (step <= 0) return false;
    await waitMs(step);
  }
}

export = {
  CHAT_HUB_SOURCES,
  DEFAULT_CROSS_BOT_GAP_MS,
  recordChatHubBotPost,
  extendChatHubQuietUntil,
  extendChatHubQuietForMs,
  msUntilOtherBotGap,
  msUntilChatHubAllowsPost,
  waitForChatHubBotGap,
  waitForChatHubSlot,
};