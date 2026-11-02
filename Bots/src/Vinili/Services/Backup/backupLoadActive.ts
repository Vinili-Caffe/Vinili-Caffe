const {
  DEFAULT_MESSAGES_LIMIT,
  ACTIVE_LOAD_STALE_MS,
  activeLoadsByGuild,
  persistRuntimeSnapshotNow,
  ensureRuntimeLoaded,
  sanitizeActions,
  normalizeMessagesLimit,
} = require("./backupLoadSessions") as typeof import("./backupLoadSessions");

class BackupLoadCancelledError extends Error {
  declare code: any;
  constructor(message = "<a:VC_Alert:1482706673176150077> Backup load cancelled by user.") {
    super(message);
    this.name = "BackupLoadCancelledError";
    this.code = "BACKUP_LOAD_CANCELLED";
  }
}

function getActiveLoadState(guildId?) {
  ensureRuntimeLoaded();
  const key = String(guildId || "");
  if (!key) return null;
  const state = activeLoadsByGuild.get(key) || null;
  if (!state) return null;

  const phase = String(state.phase || "").toLowerCase();
  const startedAt = Number(state.startedAtMs || 0);
  const updatedAt = Number(state.updatedAtMs || startedAt || 0);
  const now = Date.now();

  if (["completed", "failed", "cancelled", "done"].includes(phase)) {
    activeLoadsByGuild.delete(key);
    return null;
  }

  if (!startedAt || now - Math.max(startedAt, updatedAt) > ACTIVE_LOAD_STALE_MS) {
    activeLoadsByGuild.delete(key);
    return null;
  }

  return state;
}

function startActiveLoad({ guildId, userId, backupId, actions, messagesLimit }) {
  ensureRuntimeLoaded();
  const key = String(guildId || "");
  if (!key) return null;
  const state = { guildId: key, userId: String(userId || ""), backupId: String(backupId || "").toUpperCase(), actions: Array.from(sanitizeActions(actions)), messagesLimit: normalizeMessagesLimit(messagesLimit, DEFAULT_MESSAGES_LIMIT), startedAtMs: Date.now(), updatedAtMs: Date.now(), cancelRequested: false, phase: "starting", processed: 0, };
  activeLoadsByGuild.set(key, state);
  persistRuntimeSnapshotNow();
  return state;
}

function startActiveLoadIfIdle({ guildId, userId, backupId, actions, messagesLimit }) {
  const key = String(guildId || "");
  if (!key) return null;
  clearStaleActiveLoad(key);
  if (getActiveLoadState(key)) return null;
  return startActiveLoad({
    guildId: key,
    userId,
    backupId,
    actions,
    messagesLimit,
  });
}

function finishActiveLoad(guildId?) {
  ensureRuntimeLoaded();
  const key = String(guildId || "");
  if (!key) return;
  activeLoadsByGuild.delete(key);
  persistRuntimeSnapshotNow();
}

function updateActiveLoad(guildId?, patch: Record<string, any> = {}) {
  ensureRuntimeLoaded();
  const state = getActiveLoadState(guildId);
  if (!state) return null;
  Object.assign(state, patch, { updatedAtMs: Date.now() });
  persistRuntimeSnapshotNow();
  return state;
}

function requestCancelActiveLoad(guildId?) {
  ensureRuntimeLoaded();
  const state = getActiveLoadState(guildId);
  if (!state) return false;
  state.cancelRequested = true;
  state.updatedAtMs = Date.now();
  persistRuntimeSnapshotNow();
  return true;
}

function throwIfCancelled(guildId?) {
  const state = getActiveLoadState(guildId);
  if (state?.cancelRequested) {
    throw new BackupLoadCancelledError();
  }
}

function clearStaleActiveLoad(guildId?) {
  const key = String(guildId || "");
  if (!key) return false;
  const current = activeLoadsByGuild.get(key);
  if (!current) return false;

  const phase = String(current.phase || "").toLowerCase();
  const startedAt = Number(current.startedAtMs || 0);
  const updatedAt = Number(current.updatedAtMs || startedAt || 0);
  const now = Date.now();

  const isTerminal = ["completed", "failed", "cancelled", "done"].includes(phase);
  const isStale = !startedAt || now - Math.max(startedAt, updatedAt) > ACTIVE_LOAD_STALE_MS;

  if (isTerminal || isStale) {
    activeLoadsByGuild.delete(key);
    return true;
  }

  return false;
}

function getGuildBackupLoadStatus(guildId?) {
  const state = getActiveLoadState(guildId);
  if (!state) return null;
  return {
    guildId: state.guildId,
    userId: state.userId,
    backupId: state.backupId,
    actions: Array.isArray(state.actions) ? [...state.actions] : [],
    startedAtMs: Number(state.startedAtMs || Date.now()),
    cancelRequested: Boolean(state.cancelRequested),
    phase: String(state.phase || "starting"),
    processed: Number(state.processed || 0),
    messagesLimit: normalizeMessagesLimit(state.messagesLimit, DEFAULT_MESSAGES_LIMIT),
    checkpointId: state.checkpointId ? String(state.checkpointId).toUpperCase() : null,
  };
}

function cancelGuildBackupLoad(guildId?) {
  return requestCancelActiveLoad(guildId);
}

export = {
  BackupLoadCancelledError,
  getActiveLoadState,
  startActiveLoadIfIdle,
  finishActiveLoad,
  updateActiveLoad,
  throwIfCancelled,
  getGuildBackupLoadStatus,
  cancelGuildBackupLoad,
};
