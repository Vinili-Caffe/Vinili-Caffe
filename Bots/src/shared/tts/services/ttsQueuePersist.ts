/** TTS: persistenza snapshot coda per guild/canale. */
const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../recovery/snapshotStore") as typeof import("../../recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../recovery/shutdownCheckpoint") as typeof import("../../recovery/shutdownCheckpoint");

const TTS_QUEUE_SNAPSHOT_PATH = process.env.TTS_QUEUE_SNAPSHOT_PATH
  ? path.resolve(String(process.env.TTS_QUEUE_SNAPSHOT_PATH))
  : path.join(__dirname, "..", "..", "..", "Vinili", "Data", "ttsQueueSnapshot.json");
const TTS_QUEUE_SNAPSHOT_INTERVAL_MS = 15000;
const TTS_QUEUE_MAX_PERSISTED_ITEMS = 300;

function serializeTtsQueueItem(item?) {
  const text = String(item?.text || "").trim();
  if (!text) return null;
  const lang = String(item?.lang || "it").trim() || "it";
  return { text, lang };
}

function getTtsStatesMap() {
  const { ttsStates } = require("./ttsEngine") as typeof import("./ttsEngine");
  return ttsStates;
}

function persistTtsQueueSnapshotNow() {
  try {
    const ttsStates = getTtsStatesMap();
    const queues: Record<string, any> = {};
    for (const [channelId, state] of ttsStates.entries()) {
      const gid = String(state?.guildId || "").trim();
      const cid = String(channelId || "").trim();
      if (!gid || !cid) continue;
      const queue = Array.isArray(state?.queue) ? state.queue.map(serializeTtsQueueItem).filter(Boolean) : [];
      if (!queue.length) continue;
      queues[gid] = { channelId: cid, queue: queue.slice(0, TTS_QUEUE_MAX_PERSISTED_ITEMS) };
    }
    writeSnapshotWithMeta({
      filePath: TTS_QUEUE_SNAPSHOT_PATH,
      walPath: `${TTS_QUEUE_SNAPSHOT_PATH}.wal`,
      key: "vinyls_tts_queue",
      version: 1,
      payload: { queues },
    });
  } catch (err) {
    global.logger?.warn?.("[TTS] queue snapshot persist failed:", err?.message || err);
  }
}

function readTtsQueueSnapshotRaw() {
  const raw = readSnapshotWithMeta({
    filePath: TTS_QUEUE_SNAPSHOT_PATH,
    walPath: `${TTS_QUEUE_SNAPSHOT_PATH}.wal`,
    key: "vinyls_tts_queue",
    version: 1,
    fallback: { queues: {} },
  });
  return raw?.queues && typeof raw.queues === "object" ? raw.queues : {};
}

function restoreTtsQueueForChannel(voiceChannel?) {
  const guildId = String(voiceChannel?.guild?.id || "").trim();
  const channelId = String(voiceChannel?.id || "").trim();
  if (!guildId || !channelId) return;
  const queues = readTtsQueueSnapshotRaw();
  const row = queues[guildId];
  if (!row || String(row?.channelId || "") !== channelId) return;
  const { getState, playNext } = require("./ttsEngine") as typeof import("./ttsEngine");
  const state = getState(voiceChannel);
  if (Array.isArray(state.queue) && state.queue.length > 0) return;
  const pending = Array.isArray(row?.queue) ? row.queue : [];
  for (const item of pending) {
    const text = String(item?.text || "").trim();
    if (!text) continue;
    const lang = String(item?.lang || "it").trim() || "it";
    state.queue.push({ voiceChannel, text, lang });
  }
  if (!state.playing && state.queue.length) playNext(state);
}

function startTtsQueueSnapshotLoop(client?) {
  if (client._ttsQueueSnapshotTimer) return;
  armShutdownCheckpoint();
  if (!client._ttsQueueSnapshotFlushRegistered) {
    client._ttsQueueSnapshotFlushRegistered = true;
    registerShutdownFlush("vinyls_tts_queue", () => persistTtsQueueSnapshotNow());
  }
  client._ttsQueueSnapshotTimer = setInterval(() => {
    persistTtsQueueSnapshotNow();
  }, TTS_QUEUE_SNAPSHOT_INTERVAL_MS);
  client._ttsQueueSnapshotTimer.unref?.();
}

export = { persistTtsQueueSnapshotNow, restoreTtsQueueForChannel, startTtsQueueSnapshotLoop };
