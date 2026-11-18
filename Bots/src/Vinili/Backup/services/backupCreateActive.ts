/** Creazione backup manuale in background (dashboard HTTP), con progresso persistito. */
const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");

const activeCreatesByGuild = new Map<string, any>();
const CREATE_STALE_MS = 1000 * 60 * 60 * 2;
const TERMINAL_KEEP_MS = 90_000;
const SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "backupCreateRuntimeSnapshot.json");
let runtimeLoaded = false;

function persistNow() {
  const payload: Record<string, any> = { activeCreatesByGuild: {} };
  for (const [gid, row] of activeCreatesByGuild.entries()) {
    if (!row) continue;
    payload.activeCreatesByGuild[gid] = {
      guildId: String(row.guildId || gid),
      userId: String(row.userId || ""),
      startedAtMs: Number(row.startedAtMs || Date.now()),
      updatedAtMs: Number(row.updatedAtMs || Date.now()),
      phase: String(row.phase || "creating"),
      label: String(row.label || ""),
      percent: Number(row.percent || 0),
      current: row.current == null ? null : Number(row.current),
      total: row.total == null ? null : Number(row.total),
      backupId: row.backupId ? String(row.backupId).toUpperCase() : null,
      error: row.error ? String(row.error) : null,
      sizeBytes: row.sizeBytes == null ? null : Number(row.sizeBytes),
    };
  }
  writeSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: "vinyls_backup_create_runtime",
    version: 1,
    payload,
  });
}

function ensureLoaded() {
  if (runtimeLoaded) return;
  runtimeLoaded = true;
  const raw = readSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: "vinyls_backup_create_runtime",
    version: 1,
    fallback: { activeCreatesByGuild: {} },
  });
  const now = Date.now();
  for (const [gid, row] of Object.entries(raw?.activeCreatesByGuild || {})) {
    if (!gid || !row) continue;
    const updatedAtMs = Number((row as any).updatedAtMs || (row as any).startedAtMs || 0);
    if (!updatedAtMs || now - updatedAtMs > CREATE_STALE_MS) continue;
    activeCreatesByGuild.set(String(gid), {
      guildId: String((row as any).guildId || gid),
      userId: String((row as any).userId || ""),
      startedAtMs: Number((row as any).startedAtMs || now),
      updatedAtMs,
      phase: String((row as any).phase || "creating"),
      label: String((row as any).label || ""),
      percent: Number((row as any).percent || 0),
      current: (row as any).current == null ? null : Number((row as any).current),
      total: (row as any).total == null ? null : Number((row as any).total),
      backupId: (row as any).backupId ? String((row as any).backupId).toUpperCase() : null,
      error: (row as any).error ? String((row as any).error) : null,
      sizeBytes: (row as any).sizeBytes == null ? null : Number((row as any).sizeBytes),
    });
  }
  armShutdownCheckpoint();
  registerShutdownFlush("vinyls_backup_create_runtime", () => persistNow());
}

function getActiveCreate(guildId?) {
  ensureLoaded();
  const key = String(guildId || "");
  if (!key) return null;
  const row = activeCreatesByGuild.get(key) || null;
  if (!row) return null;
  const updated = Number(row.updatedAtMs || row.startedAtMs || 0);
  if (!updated || Date.now() - updated > CREATE_STALE_MS) {
    activeCreatesByGuild.delete(key);
    persistNow();
    return null;
  }
  const phase = String(row.phase || "").toLowerCase();
  if (["done", "failed", "completed"].includes(phase)) {
    if (Date.now() - updated > TERMINAL_KEEP_MS) {
      activeCreatesByGuild.delete(key);
      persistNow();
      return null;
    }
  }
  return row;
}

function isCreateRunning(guildId?) {
  const row = getActiveCreate(guildId);
  if (!row) return false;
  const phase = String(row.phase || "").toLowerCase();
  return !["done", "failed", "completed"].includes(phase);
}

function startCreateIfIdle({ guildId, userId }) {
  ensureLoaded();
  const key = String(guildId || "");
  if (!key) return null;
  if (getActiveCreate(key)) {
    const cur = activeCreatesByGuild.get(key);
    const phase = String(cur?.phase || "").toLowerCase();
    if (!["done", "failed", "completed"].includes(phase)) return null;
    activeCreatesByGuild.delete(key);
  }
  const state = {
    guildId: key,
    userId: String(userId || ""),
    startedAtMs: Date.now(),
    updatedAtMs: Date.now(),
    phase: "creating",
    label: "Avvio snapshot…",
    percent: 1,
    current: null as number | null,
    total: null as number | null,
    backupId: null as string | null,
    error: null as string | null,
    sizeBytes: null as number | null,
  };
  activeCreatesByGuild.set(key, state);
  persistNow();
  return state;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(force = false) {
  if (force) {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    persistNow();
    return;
  }
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistNow();
  }, 1500);
  (persistTimer as any)?.unref?.();
}

function updateCreate(guildId?, patch: Record<string, any> = {}) {
  ensureLoaded();
  const state = activeCreatesByGuild.get(String(guildId || ""));
  if (!state) return null;
  Object.assign(state, patch, { updatedAtMs: Date.now() });
  if (typeof patch.percent === "number") {
    state.percent = Math.max(0, Math.min(100, Math.floor(patch.percent)));
  }
  const phase = String(state.phase || "").toLowerCase();
  schedulePersist(["done", "failed", "completed"].includes(phase));
  return state;
}

function getGuildBackupCreateStatus(guildId?) {
  const state = getActiveCreate(guildId);
  if (!state) return null;
  return {
    guildId: state.guildId,
    userId: state.userId,
    startedAtMs: Number(state.startedAtMs || Date.now()),
    phase: String(state.phase || "creating"),
    label: String(state.label || ""),
    percent: Math.max(0, Math.min(100, Number(state.percent || 0))),
    current: state.current == null ? null : Number(state.current),
    total: state.total == null ? null : Number(state.total),
    backupId: state.backupId ? String(state.backupId).toUpperCase() : null,
    error: state.error ? String(state.error) : null,
    sizeBytes: state.sizeBytes == null ? null : Number(state.sizeBytes),
  };
}

export = {
  startCreateIfIdle,
  updateCreate,
  getGuildBackupCreateStatus,
  isCreateRunning,
};
