const RECENT_JOIN_GATE_KICKS = new Map();
const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "joinGateKickCacheSnapshot.json");
const DEFAULT_TTL_MS = 5 * 60_000;
let loaded = false;

function nowMs() {
  return Date.now();
}

function buildKey(guildId?, userId?) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function pruneExpired(at = nowMs()) {
  for (const [key, value] of RECENT_JOIN_GATE_KICKS.entries()) {
    if (Number(value?.expiresAt || 0) <= at) {
      RECENT_JOIN_GATE_KICKS.delete(key);
    }
  }
}

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  const raw = readSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: "vinyls_join_gate_kick_cache",
    version: 1,
    fallback: {},
  });
  const at = nowMs();
  for (const [key, value] of Object.entries(raw || {})) {
    const expiresAt = Number(value?.expiresAt || 0);
    if (!key || expiresAt <= at) continue;
    RECENT_JOIN_GATE_KICKS.set(key, {
      reason: String(value?.reason || ""),
      at: Number(value?.at || at),
      expiresAt,
    });
  }
}

function persistNow() {
  const at = nowMs();
  const payload: Record<string, any> = {};
  for (const [key, value] of RECENT_JOIN_GATE_KICKS.entries()) {
    const expiresAt = Number(value?.expiresAt || 0);
    if (expiresAt <= at) continue;
    payload[key] = {
      reason: String(value?.reason || ""),
      at: Number(value?.at || at),
      expiresAt,
    };
  }
  writeSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: "vinyls_join_gate_kick_cache",
    version: 1,
    payload,
  });
}

function markJoinGateKick(guildId?, userId?, reason?, ttlMs = DEFAULT_TTL_MS) {
  ensureLoaded();
  const key = buildKey(guildId, userId);
  if (!key || key === ":") return;
  const at = nowMs();
  pruneExpired(at);
  RECENT_JOIN_GATE_KICKS.set(key, {
    reason: String(reason || "").trim(),
    at,
    expiresAt: at + Math.max(1_000, Number(ttlMs || DEFAULT_TTL_MS)),
  });
  persistNow();
}

function getRecentJoinGateKick(guildId?, userId?) {
  ensureLoaded();
  const key = buildKey(guildId, userId);
  if (!key || key === ":") return null;
  const at = nowMs();
  pruneExpired(at);
  const payload = RECENT_JOIN_GATE_KICKS.get(key) || null;
  if (!payload) return null;
  if (Number(payload.expiresAt || 0) <= at) {
    RECENT_JOIN_GATE_KICKS.delete(key);
    return null;
  }
  return payload;
}

function consumeRecentJoinGateKick(guildId?, userId?) {
  ensureLoaded();
  const key = buildKey(guildId, userId);
  if (!key || key === ":") return null;
  const payload = getRecentJoinGateKick(guildId, userId);
  if (payload) RECENT_JOIN_GATE_KICKS.delete(key);
  persistNow();
  return payload;
}

export = { markJoinGateKick, getRecentJoinGateKick, consumeRecentJoinGateKick };