const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../recovery/snapshotStore") as typeof import("../recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../recovery/shutdownCheckpoint") as typeof import("../recovery/shutdownCheckpoint");

function createVoiceSessionService(options: Record<string, any> = {}) {
  const sessions = new Map();
  const SNAPSHOT_PATH = options.snapshotPath
    ? path.resolve(String(options.snapshotPath))
    : path.join(__dirname, "..", "..", "Vinili", "Data", "voiceSessionSnapshot.json");
  const SESSION_TTL_MS = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : 12 * 60 * 60 * 1000;
  const SNAPSHOT_KEY = String(options.snapshotKey || "vinyls_voice_sessions");
  let loaded = false;
  let flushRegistered = false;

  function normalizeGuildId(guildId?) {
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
    const payload: Record<string, any> = {};
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

  function getVoiceSession(guildId?) {
    ensureLoaded();
    const key = normalizeGuildId(guildId);
    if (!key) return null;
    return sessions.get(key) || null;
  }

  function setVoiceSession(guildId?, payload: Record<string, any> = {}) {
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

  function clearVoiceSession(guildId?) {
    ensureLoaded();
    const key = normalizeGuildId(guildId);
    if (!key) return false;
    const deleted = sessions.delete(key);
    persistNow();
    return deleted;
  }

  return { getVoiceSession, setVoiceSession, clearVoiceSession };
}

const voiceSessionSingletons = new Map();

function getVoiceSessionService(options: Record<string, any> = {}) {
  const key = String(options.snapshotKey || options.key || "default").trim() || "default";
  let service = voiceSessionSingletons.get(key);
  if (!service) {
    service = createVoiceSessionService(options);
    voiceSessionSingletons.set(key, service);
  }
  return service;
}

export = { createVoiceSessionService, getVoiceSessionService };
