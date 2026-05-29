const CHAT_HUB_SOURCES = Object.freeze({ VINILI: "vinili", COFFEE: "coffee" });
const lastPostByChannel = new Map();
const DEFAULT_CROSS_BOT_GAP_MS = 2 * 60 * 1000;

function channelKey(channelId) {
  return String(channelId || "").trim();
}

function getEntry(channelId) {
  const key = channelKey(channelId);
  if (!key) return { vinili: 0, coffee: 0 };
  if (!lastPostByChannel.has(key)) lastPostByChannel.set(key, { vinili: 0, coffee: 0 });
  return lastPostByChannel.get(key);
}

function recordChatHubBotPost(channelId, source) {
  const key = channelKey(channelId);
  const src = String(source || "").trim().toLowerCase();
  if (!key || (src !== CHAT_HUB_SOURCES.VINILI && src !== CHAT_HUB_SOURCES.COFFEE)) return;
  const entry = getEntry(key);
  entry[src] = Date.now();
}

function msUntilOtherBotGap(channelId, source, gapMs = DEFAULT_CROSS_BOT_GAP_MS) {
  const key = channelKey(channelId);
  const src = String(source || "").trim().toLowerCase();
  if (!key || (src !== CHAT_HUB_SOURCES.VINILI && src !== CHAT_HUB_SOURCES.COFFEE)) return 0;
  const other = src === CHAT_HUB_SOURCES.VINILI ? CHAT_HUB_SOURCES.COFFEE : CHAT_HUB_SOURCES.VINILI;
  const entry = getEntry(key);
  const last = Number(entry[other] || 0);
  if (!last) return 0;
  const gap = Math.max(30_000, Number(gapMs) || DEFAULT_CROSS_BOT_GAP_MS);
  return Math.max(0, last + gap - Date.now());
}

function waitMs(ms) {
  const n = Math.max(0, Math.floor(Number(ms) || 0));
  if (!n) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, n);
    if (typeof t.unref === "function") t.unref();
  });
}

async function waitForChatHubBotGap(channelId, source, gapMs = DEFAULT_CROSS_BOT_GAP_MS) {
  const wait = msUntilOtherBotGap(channelId, source, gapMs);
  if (wait > 0) await waitMs(wait);
}

export { CHAT_HUB_SOURCES, DEFAULT_CROSS_BOT_GAP_MS, recordChatHubBotPost, msUntilOtherBotGap, waitForChatHubBotGap };