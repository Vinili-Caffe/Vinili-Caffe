const path = require("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint");

const sessions = new Map();
const SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "voiceSessionSnapshot.json");
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SNAPSHOT_KEY = "coffee_voice_sessions";

let loaded = false;
let flushRegistered = false;

function normalizeGuildId(guildId) {
  const value = String(guildId || "").trim();
  return value || null;
}

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  const raw = readSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: SNAPSHOT_KEY,
    version: 1,
    fallback: {},
  });
  const now = Date.now();
  for (const [guildId, row] of Object.entries(raw || {})) {
    const key = normalizeGuildId(guildId);
    if (!key) continue;
    const updatedAt = Number(row?.updatedAt || 0);
    if (!Number.isFinite(updatedAt) || updatedAt <= 0 || now - updatedAt > SESSION_TTL_MS) continue;
    sessions.set(key, {
      mode: String(row?.mode || "unknown"),
      channelId: String(row?.channelId || ""),
      ownerId: row?.ownerId != null ? String(row?.ownerId || "") : "",
      updatedAt,
    });
  }
  armShutdownCheckpoint();
  if (!flushRegistered) {
    flushRegistered = true;
    registerShutdownFlush(SNAPSHOT_KEY, () => persistNow());
  }
}

function persistNow() {
  const now = Date.now();
  const payload = {};
  for (const [guildId, row] of sessions.entries()) {
    if (!row || now - Number(row.updatedAt || 0) > SESSION_TTL_MS) continue;
    payload[guildId] = {
      mode: String(row.mode || "unknown"),
      channelId: String(row.channelId || ""),
      ownerId: row.ownerId != null ? String(row.ownerId || "") : "",
      updatedAt: Number(row.updatedAt || now),
    };
  }
  writeSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: SNAPSHOT_KEY,
    version: 1,
    payload,
  });
}

function getVoiceSession(guildId) {
  ensureLoaded();
  const key = normalizeGuildId(guildId);
  if (!key) return null;
  return sessions.get(key) || null;
}

function setVoiceSession(guildId, payload = {}) {
  ensureLoaded();
  const key = normalizeGuildId(guildId);
  if (!key) return null;
  const next = {
    mode: String(payload.mode || "unknown"),
    channelId: String(payload.channelId || ""),
    ownerId: payload.ownerId != null ? String(payload.ownerId || "") : "",
    updatedAt: Date.now(),
  };
  sessions.set(key, next);
  persistNow();
  return next;
}

function clearVoiceSession(guildId) {
  ensureLoaded();
  const key = normalizeGuildId(guildId);
  if (!key) return false;
  const deleted = sessions.delete(key);
  persistNow();
  return deleted;
}

function isDifferentVoiceSession(guildId, channelId) {
  const current = getVoiceSession(guildId);
  if (!current?.channelId) return false;
  return String(current.channelId) !== String(channelId || "");
}

module.exports = {
  getVoiceSession,
  setVoiceSession,
  clearVoiceSession,
  isDifferentVoiceSession,
};
