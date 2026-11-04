const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../recovery/snapshotStore") as typeof import("../recovery/snapshotStore");
const { pruneMapByAge, pruneMapByMaxSize, ensureMapPruneInterval } = require("../runtime/mapPrune") as typeof import("../runtime/mapPrune");

/** Vinili is the live chat-hub bot; COFFEE remains only for legacy snapshot rows. */
const CHAT_HUB_SOURCES = Object.freeze({ VINILI: "vinili", COFFEE: "coffee" });

const CHAT_HUB_KINDS = Object.freeze({
  MINIGAME: "minigame",
  REPOST: "repost",
  REMINDER: "reminder",
  MARKOV: "markov",
});

const KIND_PRIORITY = Object.freeze({
  [CHAT_HUB_KINDS.MINIGAME]: 40,
  [CHAT_HUB_KINDS.REPOST]: 30,
  [CHAT_HUB_KINDS.REMINDER]: 20,
  [CHAT_HUB_KINDS.MARKOV]: 10,
});

const SNAPSHOT_PATH = path.join(__dirname, "chatHubPacing.snapshot.json");
const DEFAULT_CROSS_BOT_GAP_MS = 4 * 60 * 1000;
const DEFAULT_SAME_BOT_GAP_MS = Math.max(
  60_000,
  Number(process.env.VC_CHAT_HUB_SAME_BOT_GAP_MS || 5 * 60 * 1000) || 5 * 60 * 1000,
);
const DEFAULT_AFTER_MINIGAME_GAP_MS = Math.max(
  90_000,
  Number(process.env.VC_CHAT_HUB_AFTER_MINIGAME_MS || 3 * 60 * 1000) || 3 * 60 * 1000,
);
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
/** @type {Map<string, Map<string, number>>} */
const pendingClaimsByChannel = new Map();
let lastSnapshotLoadAt = 0;
let pendingClaimSeq = 0;

ensureMapPruneInterval("__vcChatHubPruneInterval", () => {
  const now = Date.now();
  pruneMapByAge(memoryByChannel, {
    maxAgeMs: CHAT_HUB_MAX_AGE_MS,
    now,
    getTs: (_key?, row?) => {
      const byKind = row?.byKind && typeof row.byKind === "object" ? row.byKind : {};
      return Math.max(
        Number(row?.vinili) || 0,
        Number(row?.coffee) || 0,
        Number(row?.quietUntil) || 0,
        Number(byKind.minigame) || 0,
        Number(byKind.repost) || 0,
        Number(byKind.reminder) || 0,
        Number(byKind.markov) || 0,
      );
    },
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

function normalizeKind(kind?) {
  const k = String(kind || "").trim().toLowerCase();
  if (
    k === CHAT_HUB_KINDS.MINIGAME ||
    k === CHAT_HUB_KINDS.REPOST ||
    k === CHAT_HUB_KINDS.REMINDER ||
    k === CHAT_HUB_KINDS.MARKOV
  ) {
    return k;
  }
  return "";
}

function emptyByKind() {
  return {
    minigame: 0,
    repost: 0,
    reminder: 0,
    markov: 0,
  };
}

function emptyChannelRow() {
  return { vinili: 0, coffee: 0, quietUntil: 0, lastKind: null, byKind: emptyByKind() };
}

function mergeByKind(target?, incoming?) {
  const out = emptyByKind();
  const a = target && typeof target === "object" ? target : {};
  const b = incoming && typeof incoming === "object" ? incoming : {};
  for (const key of Object.keys(out)) {
    out[key] = Math.max(Number(a[key]) || 0, Number(b[key]) || 0);
  }
  return out;
}

function migrateSnapshotV1ToV2(payload?) {
  const channelsIn = payload?.channels && typeof payload.channels === "object" ? payload.channels : {};
  const channels: Record<string, any> = {};
  for (const [id, row] of Object.entries(channelsIn)) {
    if (!row || typeof row !== "object") continue;
    channels[id] = {
      vinili: Number((row as any).vinili) || 0,
      coffee: Number((row as any).coffee) || 0,
      quietUntil: Number((row as any).quietUntil) || 0,
      lastKind: normalizeKind((row as any).lastKind) || null,
      byKind: mergeByKind(emptyByKind(), (row as any).byKind),
    };
  }
  return { channels };
}

function loadSnapshotChannels() {
  const now = Date.now();
  if (now - lastSnapshotLoadAt < RELOAD_MS) return;
  lastSnapshotLoadAt = now;
  const raw = readSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    key: "chat_hub_pacing",
    version: 2,
    migrate: {
      1: migrateSnapshotV1ToV2,
    },
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
    mem.byKind = mergeByKind(mem.byKind, row.byKind);
    const incomingKind = normalizeKind(row.lastKind);
    if (incomingKind) mem.lastKind = incomingKind;
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
      lastKind: normalizeKind(row.lastKind) || null,
      byKind: mergeByKind(emptyByKind(), row.byKind),
    };
  }
  writeSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    key: "chat_hub_pacing",
    version: 2,
    payload: { channels },
  });
}

function getEntry(channelId?) {
  loadSnapshotChannels();
  const key = channelKey(channelId);
  if (!key) return emptyChannelRow();
  if (!memoryByChannel.has(key)) memoryByChannel.set(key, emptyChannelRow());
  const entry = memoryByChannel.get(key);
  if (!entry.byKind || typeof entry.byKind !== "object") entry.byKind = emptyByKind();
  return entry;
}

function recordChatHubBotPost(channelId?, source?, kind?, atMs?) {
  const key = channelKey(channelId);
  const src = normalizeSource(source);
  if (!key || !src) return;
  const entry = getEntry(key);
  const ts = Math.floor(Number(atMs) || 0);
  const when = ts > 0 ? ts : Date.now();
  entry[src] = Math.max(Number(entry[src]) || 0, when);
  const k = normalizeKind(kind);
  if (k) {
    entry.byKind = mergeByKind(entry.byKind, { [k]: when });
    entry.lastKind = k;
  }
  persistSnapshot();
}

function noteChatHubKindAt(channelId?, kind?, atMs?) {
  const key = channelKey(channelId);
  const k = normalizeKind(kind);
  const when = Math.floor(Number(atMs) || 0);
  if (!key || !k || when <= 0) return;
  const entry = getEntry(key);
  entry.byKind = mergeByKind(entry.byKind, { [k]: when });
  entry.lastKind = k;
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

function msUntilKindGap(channelId?, kind?, gapMs?) {
  const k = normalizeKind(kind);
  const gap = Math.max(0, Math.floor(Number(gapMs) || 0));
  if (!k || !gap) return 0;
  const entry = getEntry(channelId);
  const last = Number(entry.byKind?.[k] || 0);
  if (!last) return 0;
  return Math.max(0, last + gap - Date.now());
}

function msUntilAfterKindGaps(channelId?, afterKindGaps?) {
  if (!afterKindGaps || typeof afterKindGaps !== "object") return 0;
  const entry = getEntry(channelId);
  let wait = 0;
  for (const [rawKind, rawGap] of Object.entries(afterKindGaps)) {
    const k = normalizeKind(rawKind);
    const gap = Math.max(0, Math.floor(Number(rawGap) || 0));
    if (!k || !gap) continue;
    const last = Number(entry.byKind?.[k] || 0);
    if (!last) continue;
    wait = Math.max(wait, last + gap - Date.now());
  }
  return Math.max(0, wait);
}

function msUntilChatHubAllowsPost(channelId?, source?, options: Record<string, any> = {}) {
  const crossGapMs = options.crossBotGapMs ?? DEFAULT_CROSS_BOT_GAP_MS;
  const sameBotGapMs = options.sameBotGapMs ?? DEFAULT_SAME_BOT_GAP_MS;
  const kind = normalizeKind(options.kind);
  return Math.max(
    msUntilChatHubQuiet(channelId),
    msUntilOtherBotGap(channelId, source, crossGapMs),
    msUntilSameBotGap(channelId, source, sameBotGapMs),
    kind ? msUntilKindGap(channelId, kind, options.kindGapMs) : 0,
    msUntilAfterKindGaps(channelId, options.afterKindGaps),
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

function kindPriority(kind?) {
  const k = normalizeKind(kind);
  return Number(KIND_PRIORITY[k] || 0);
}

function registerPendingClaim(channelId?, kind?) {
  const key = channelKey(channelId);
  const k = normalizeKind(kind);
  if (!key || !k) return 0;
  if (!pendingClaimsByChannel.has(key)) pendingClaimsByChannel.set(key, new Map());
  const bucket = pendingClaimsByChannel.get(key);
  const token = ++pendingClaimSeq;
  bucket.set(k, token);
  return token;
}

function unregisterPendingClaim(channelId?, kind?, token?) {
  const key = channelKey(channelId);
  const k = normalizeKind(kind);
  if (!key || !k) return;
  const bucket = pendingClaimsByChannel.get(key);
  if (!bucket) return;
  if (token && bucket.get(k) !== token) return;
  bucket.delete(k);
  if (bucket.size === 0) pendingClaimsByChannel.delete(key);
}

function hasHigherPriorityPending(channelId?, kind?) {
  const key = channelKey(channelId);
  const mine = kindPriority(kind);
  if (!key || !mine) return false;
  const bucket = pendingClaimsByChannel.get(key);
  if (!bucket || bucket.size === 0) return false;
  for (const pendingKind of bucket.keys()) {
    if (kindPriority(pendingKind) > mine) return true;
  }
  return false;
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

/**
 * Claim a chat-hub slot for a typed producer.
 * Higher-priority pending claims force lower kinds to defer (return false) instead of waiting forever.
 */
async function claimChatHubSlot(channelId?, options: Record<string, any> = {}) {
  const key = channelKey(channelId);
  const kind = normalizeKind(options.kind);
  const source = normalizeSource(options.source) || CHAT_HUB_SOURCES.VINILI;
  if (!key || !kind) return false;

  const maxWaitMs = Math.max(0, Math.floor(Number(options.maxWaitMs) || 0));
  const pollMs = Math.max(5_000, Math.floor(Number(options.pollMs) || 15_000));
  const slotOptions = {
    crossBotGapMs: options.crossBotGapMs ?? DEFAULT_CROSS_BOT_GAP_MS,
    sameBotGapMs: options.sameBotGapMs ?? DEFAULT_SAME_BOT_GAP_MS,
    kind,
    kindGapMs: options.kindGapMs,
    afterKindGaps: options.afterKindGaps,
  };

  const token = registerPendingClaim(key, kind);
  const started = Date.now();
  try {
    for (;;) {
      if (hasHigherPriorityPending(key, kind)) return false;
      const wait = msUntilChatHubAllowsPost(key, source, slotOptions);
      if (wait <= 0) {
        if (hasHigherPriorityPending(key, kind)) return false;
        return true;
      }
      if (maxWaitMs <= 0) return false;
      if (Date.now() - started + wait > maxWaitMs) return false;
      const remaining = maxWaitMs - (Date.now() - started);
      const step = Math.min(wait, pollMs, remaining);
      if (step <= 0) return false;
      await waitMs(step);
    }
  } finally {
    unregisterPendingClaim(key, kind, token);
  }
}

export = {
  CHAT_HUB_SOURCES,
  CHAT_HUB_KINDS,
  DEFAULT_CROSS_BOT_GAP_MS,
  DEFAULT_SAME_BOT_GAP_MS,
  DEFAULT_AFTER_MINIGAME_GAP_MS,
  recordChatHubBotPost,
  noteChatHubKindAt,
  extendChatHubQuietUntil,
  extendChatHubQuietForMs,
  msUntilOtherBotGap,
  msUntilChatHubAllowsPost,
  waitForChatHubBotGap,
  waitForChatHubSlot,
  claimChatHubSlot,
};
