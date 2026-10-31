/** Caricamento backup: sessioni e caricamento in corso (con annullamento). */
const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");

const LOAD_ACTIONS = [{ key: "delete_roles", label: "Delete Roles", description: "All existing roles will be deleted", emoji: "<:VC_purge:1478861828271636561>", }, { key: "delete_channels", label: "Delete Channels", description: "All existing channels will be deleted", emoji: "<:VC_purge:1478861828271636561>", }, { key: "load_roles", label: "Load Roles", description: "New roles will be loaded", emoji: "<:VC_Mention:1482526855289634997>", }, { key: "load_channels", label: "Load Channels", description: "New channels will be loaded", emoji: "<:channeltext:1443247596922470551>", }, { key: "load_settings", label: "Load Settings", description: "Server settings will be updated", emoji: "<:VC_tools:1478862265305272364>", }, { key: "load_threads", label: "Load Threads", description: "Threads and forum posts will be loaded", emoji: "<:VC_threads:1478515497569095760>", }, { key: "load_member_info", label: "Load Member Info", description: "Member roles and nicknames will be loaded", emoji: "<:member_role_icon:1330530086792728618>", }, { key: "load_bans", label: "Load Bans", description: "Banned members will be loaded", emoji: "<:VC_BanHammer:1482534474502897795>", }, { key: "load_messages", label: "Load Messages", description: "Messages will be loaded", emoji: "<:VC_Chat:1482532573002465413>", }, { key: "load_pinned_messages", label: "Pinned Messages", description: "Pinned messages will be loaded", emoji: "<:VC_BlackPin:1482534513400610948>", }, { key: "load_emojis", label: "Load Emojis", description: "Custom emojis will be loaded", emoji: "<:VC_Reply:1482532158080942191>", }, { key: "load_stickers", label: "Load Stickers", description: "Stickers will be loaded", emoji: "<:VC_Ticket:1482535175283019888>", }, { key: "load_webhooks", label: "Load Webhooks", description: "Webhooks will be restored", emoji: "<:VC_webhooks:1478515450769047704>", }, { key: "load_invites", label: "Load Invites", description: "Invites will be recreated", emoji: "<:link:1470064815899803668>", }, { key: "load_events", label: "Load Events", description: "Scheduled events will be loaded", emoji: "<a:VC_Calendar:1482706208149475358>", }, { key: "load_automod_rules", label: "Load AutoMod Rules", description: "AutoMod rules will be loaded", emoji: "<:VC_AutoMod:1478861194759508039>", },];
const ACTION_KEYS = new Set(LOAD_ACTIONS.map((a?) => a.key));
const DEFAULT_ACTIONS = new Set(LOAD_ACTIONS.map((a?) => a.key));
const DEFAULT_MESSAGES_LIMIT = 1000;
const MAX_MESSAGES_LIMIT = 50000;
const SESSION_TTL_MS = 1000 * 60 * 20;
const ACTIVE_LOAD_STALE_MS = 1000 * 60 * 60 * 6;
const sessions = new Map();
const activeLoadsByGuild = new Map();
const SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "backupLoadRuntimeSnapshot.json");
let runtimeLoaded = false;

function persistRuntimeSnapshotNow() {
  const now = Date.now();
  const payload = {
    sessions: {},
    activeLoadsByGuild: {},
  };
  for (const [id, row] of sessions.entries()) {
    if (!row || Number(row?.expiresAt || 0) <= now) continue;
    payload.sessions[id] = {
      id: String(row.id || ""),
      guildId: String(row.guildId || ""),
      userId: String(row.userId || ""),
      backupId: String(row.backupId || ""),
      sourceGuildId: row.sourceGuildId ? String(row.sourceGuildId) : null,
      actions: Array.from(row.actions || []),
      messagesLimit: row.messagesLimit == null ? null : Number(row.messagesLimit),
      createdAt: Number(row.createdAt || now),
      expiresAt: Number(row.expiresAt || now),
    };
  }
  for (const [gid, row] of activeLoadsByGuild.entries()) {
    if (!row) continue;
    payload.activeLoadsByGuild[gid] = {
      guildId: String(row.guildId || ""),
      userId: String(row.userId || ""),
      backupId: String(row.backupId || ""),
      actions: Array.from(row.actions || []),
      messagesLimit: row.messagesLimit == null ? null : Number(row.messagesLimit),
      startedAtMs: Number(row.startedAtMs || now),
      updatedAtMs: Number(row.updatedAtMs || now),
      cancelRequested: Boolean(row.cancelRequested),
      phase: String(row.phase || ""),
      processed: Number(row.processed || 0),
    };
  }
  writeSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: "vinyls_backup_load_runtime",
    version: 1,
    payload,
  });
}

function ensureRuntimeLoaded() {
  if (runtimeLoaded) return;
  runtimeLoaded = true;
  const raw = readSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: "vinyls_backup_load_runtime",
    version: 1,
    fallback: { sessions: {}, activeLoadsByGuild: {} },
  });
  const now = Date.now();
  for (const [id, row] of Object.entries(raw?.sessions || {})) {
    if (!id || Number(row?.expiresAt || 0) <= now) continue;
    sessions.set(String(id), {
      id: String(row?.id || id),
      guildId: String(row?.guildId || ""),
      userId: String(row?.userId || ""),
      backupId: String(row?.backupId || "").trim().toUpperCase(),
      sourceGuildId: row?.sourceGuildId ? String(row.sourceGuildId) : null,
      actions: sanitizeActions(row?.actions),
      messagesLimit: normalizeMessagesLimit(row?.messagesLimit, DEFAULT_MESSAGES_LIMIT),
      createdAt: Number(row?.createdAt || now),
      expiresAt: Number(row?.expiresAt || now + SESSION_TTL_MS),
    });
  }
  for (const [gid, row] of Object.entries(raw?.activeLoadsByGuild || {})) {
    if (!gid) continue;
    const updatedAtMs = Number(row?.updatedAtMs || row?.startedAtMs || 0);
    if (!updatedAtMs || now - updatedAtMs > ACTIVE_LOAD_STALE_MS) continue;
    activeLoadsByGuild.set(String(gid), {
      guildId: String(row?.guildId || gid),
      userId: String(row?.userId || ""),
      backupId: String(row?.backupId || "").toUpperCase(),
      actions: Array.from(sanitizeActions(row?.actions)),
      messagesLimit: normalizeMessagesLimit(row?.messagesLimit, DEFAULT_MESSAGES_LIMIT),
      startedAtMs: Number(row?.startedAtMs || now),
      updatedAtMs,
      cancelRequested: Boolean(row?.cancelRequested),
      phase: String(row?.phase || "starting"),
      processed: Number(row?.processed || 0),
    });
  }
  armShutdownCheckpoint();
  registerShutdownFlush("vinyls_backup_load_runtime", () => persistRuntimeSnapshotNow());
}

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function makeSessionId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function pruneSessions() {
  ensureRuntimeLoaded();
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (!session || session.expiresAt <= now) sessions.delete(id);
  }
  persistRuntimeSnapshotNow();
}

function sanitizeActions(values?) {
  const out = new Set();
  const arr = Array.isArray(values) ? values : [];
  for (const value of arr) {
    const key = String(value || "").trim();
    if (ACTION_KEYS.has(key)) out.add(key);
  }
  if (!out.size) return new Set(DEFAULT_ACTIONS);
  return out;
}

function normalizeMessagesLimit(value?, fallback = DEFAULT_MESSAGES_LIMIT) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "ALL" || raw === "0" || raw === "NONE" || raw === "UNLIMITED") {
    return null;
  }
  const num = Number(raw || fallback);
  if (!Number.isFinite(num)) {
    return Number(fallback || DEFAULT_MESSAGES_LIMIT);
  }
  const safe = Math.max(1, Math.min(MAX_MESSAGES_LIMIT, Math.floor(num)));
  return safe;
}

function formatMessagesLimit(limit?) {
  if (limit == null) return "ALL";
  return String(Number(limit || 0));
}

function createLoadSession({ guildId, userId, backupId, sourceGuildId = null, selectedActions = null, messagesLimit = DEFAULT_MESSAGES_LIMIT }) {
  pruneSessions();
  const id = makeSessionId();
  const actions = sanitizeActions(selectedActions || [...DEFAULT_ACTIONS]);
  sessions.set(id, {
    id,
    guildId: String(guildId),
    userId: String(userId),
    backupId: String(backupId || "").trim().toUpperCase(),
    sourceGuildId: sourceGuildId ? String(sourceGuildId) : null,
    actions,
    messagesLimit: normalizeMessagesLimit(messagesLimit, DEFAULT_MESSAGES_LIMIT),
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  persistRuntimeSnapshotNow();
  return id;
}

function getLoadSession(sessionId?) {
  pruneSessions();
  const id = String(sessionId || "");
  const session = sessions.get(id);
  if (!session) return null;
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function updateLoadSessionActions(sessionId?, values?) {
  const session = getLoadSession(sessionId);
  if (!session) return null;
  session.actions = sanitizeActions(values);
  return session;
}

function updateLoadSessionMessagesLimit(sessionId?, value?) {
  const session = getLoadSession(sessionId);
  if (!session) return null;
  session.messagesLimit = normalizeMessagesLimit(value, session.messagesLimit);
  return session;
}

function deleteLoadSession(sessionId?) {
  ensureRuntimeLoaded();
  sessions.delete(String(sessionId || ""));
  persistRuntimeSnapshotNow();
}

export = { LOAD_ACTIONS, DEFAULT_ACTIONS, DEFAULT_MESSAGES_LIMIT, ACTIVE_LOAD_STALE_MS, activeLoadsByGuild, persistRuntimeSnapshotNow, ensureRuntimeLoaded, sleep, sanitizeActions, normalizeMessagesLimit, formatMessagesLimit, createLoadSession, getLoadSession, updateLoadSessionActions, updateLoadSessionMessagesLimit, deleteLoadSession };
