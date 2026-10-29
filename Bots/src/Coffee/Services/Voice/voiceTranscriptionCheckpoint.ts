const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");
const SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "voiceTranscriptionCheckpoint.json");
const SNAPSHOT_KEY = "coffee_voice_transcription_checkpoints";
const CHANNEL_ROW_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CHANNEL_ROWS = 600;
const checkpoints = new Map();
let loaded = false;
let flushRegistered = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  const raw = readSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: SNAPSHOT_KEY,
    version: 1,
    fallback: { channels: {} },
  });
  const channels = raw?.channels && typeof raw.channels === "object" ? raw.channels : {};
  const now = Date.now();
  for (const [channelId, row] of Object.entries(channels)) {
    const cid = String(channelId || "").trim();
    if (!cid) continue;
    const updatedAt = Number(row?.updatedAt || 0);
    if (!Number.isFinite(updatedAt) || updatedAt <= 0 || now - updatedAt > CHANNEL_ROW_TTL_MS) continue;
    checkpoints.set(cid, {
      lastMessageId: String(row?.lastMessageId || "").trim(),
      lastProcessedAt: Number(row?.lastProcessedAt || 0),
      updatedAt,
    });
  }
  armShutdownCheckpoint();
  if (!flushRegistered) {
    flushRegistered = true;
    registerShutdownFlush(SNAPSHOT_KEY, () => persistNow());
  }
}

function pruneCheckpoints(now = Date.now()) {
  for (const [cid, row] of checkpoints.entries()) {
    const updatedAt = Number(row?.updatedAt || 0);
    if (!updatedAt || now - updatedAt > CHANNEL_ROW_TTL_MS) checkpoints.delete(cid);
  }
  if (checkpoints.size <= MAX_CHANNEL_ROWS) return;
  const sorted = [...checkpoints.entries()].sort((a?, b?) => Number(a[1]?.updatedAt || 0) - Number(b[1]?.updatedAt || 0));
  const drop = sorted.length - MAX_CHANNEL_ROWS;
  for (let i = 0; i < drop; i += 1) checkpoints.delete(sorted[i][0]);
}

function persistNow() {
  const now = Date.now();
  pruneCheckpoints(now);
  const channels: Record<string, any> = {};
  for (const [channelId, row] of checkpoints.entries()) {
    channels[channelId] = {
      lastMessageId: String(row?.lastMessageId || ""),
      lastProcessedAt: Number(row?.lastProcessedAt || 0),
      updatedAt: Number(row?.updatedAt || now),
    };
  }
  writeSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: SNAPSHOT_KEY,
    version: 1,
    payload: { channels },
  });
}

function getVoiceTranscriptionCheckpoint(channelId?) {
  ensureLoaded();
  const cid = String(channelId || "").trim();
  if (!cid) return null;
  return checkpoints.get(cid) || null;
}

function saveVoiceTranscriptionCheckpoint(channelId?, messageId?, processedAt?) {
  ensureLoaded();
  const cid = String(channelId || "").trim();
  const mid = String(messageId || "").trim();
  const ts = Number(processedAt);
  if (!cid || !mid || !Number.isFinite(ts) || ts <= 0) return;
  const prev = checkpoints.get(cid);
  let keep = true;
  if (prev?.lastMessageId) {
    try {
      keep = BigInt(mid) >= BigInt(prev.lastMessageId);
    } catch {
      keep = ts >= Number(prev.lastProcessedAt || 0);
    }
  }
  if (!keep) return;
  checkpoints.set(cid, {
    lastMessageId: mid,
    lastProcessedAt: ts,
    updatedAt: Date.now(),
  });
  persistNow();
}

function isMessageAfterTranscriptionCheckpoint(message?, checkpoint?, fallbackCutoffMs?) {
  const createdAt = Number(message?.createdTimestamp || 0);
  const fallback = Number(fallbackCutoffMs);
  if (!checkpoint?.lastMessageId) {
    return Number.isFinite(fallback) ? createdAt > fallback : true;
  }
  try {
    return BigInt(String(message.id)) > BigInt(String(checkpoint.lastMessageId));
  } catch {
    const lastAt = Number(checkpoint.lastProcessedAt || 0);
    return createdAt > lastAt;
  }
}

export = {
  getVoiceTranscriptionCheckpoint,
  saveVoiceTranscriptionCheckpoint,
  isMessageAfterTranscriptionCheckpoint,
};