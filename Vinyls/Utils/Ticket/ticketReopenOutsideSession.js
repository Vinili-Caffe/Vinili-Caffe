const fs = require("fs");
const path = require("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint");

const SESSION_TTL_MS = 45 * 60 * 1000;
const SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "ticketReopenOutsideSessions.json");

let loadedFromDisk = false;

function readSnapshotFile() {
  return readSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: "vinyls_ticket_reopen_sessions",
    version: 1,
    fallback: {},
  });
}

function writeSnapshotFile(rows) {
  writeSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: "vinyls_ticket_reopen_sessions",
    version: 1,
    payload: rows || {},
  });
}

function sanitizeSessionRow(row = {}) {
  const authorId = String(row?.authorId || "").trim();
  const guildId = String(row?.guildId || "").trim();
  const filterQuery = row?.filterQuery != null ? String(row.filterQuery).trim() : "";
  const page = Math.max(0, Number(row?.page) || 0);
  const expiresAt = Number(row?.expiresAt || 0);
  if (!authorId || !guildId || !Number.isFinite(expiresAt) || expiresAt <= 0) return null;
  return { authorId, guildId, filterQuery, page, expiresAt };
}

function ensureLoaded(client) {
  if (loadedFromDisk) return;
  armShutdownCheckpoint();
  loadedFromDisk = true;
  const b = bucket(client);
  const now = Date.now();
  const rows = readSnapshotFile();
  for (const [messageId, row] of Object.entries(rows)) {
    const mid = String(messageId || "").trim();
    if (!mid) continue;
    const safe = sanitizeSessionRow(row);
    if (!safe) continue;
    if (safe.expiresAt < now) continue;
    b.set(mid, safe);
  }
  if (client && !client._ticketReopenOutsideSnapshotFlushRegistered) {
    client._ticketReopenOutsideSnapshotFlushRegistered = true;
    registerShutdownFlush("vinyls_ticket_reopen_sessions", () => persistBucket(client));
  }
}

function persistBucket(client) {
  const b = bucket(client);
  const now = Date.now();
  const out = {};
  for (const [messageId, row] of b.entries()) {
    const mid = String(messageId || "").trim();
    if (!mid) continue;
    const safe = sanitizeSessionRow(row);
    if (!safe) continue;
    if (safe.expiresAt < now) continue;
    out[mid] = safe;
  }
  writeSnapshotFile(out);
}

function bucket(client) {
  if (!client._ticketReopenOutsideSessions) {
    client._ticketReopenOutsideSessions = new Map();
  }
  return client._ticketReopenOutsideSessions;
}

function rememberTicketReopenOutsideSession(client, messageId, payload) {
  const mid = String(messageId || "");
  if (!mid || !client) return;
  ensureLoaded(client);
  const b = bucket(client);
  b.set(mid, {
    authorId: String(payload?.authorId || ""),
    guildId: String(payload?.guildId || ""),
    filterQuery: payload?.filterQuery != null ? String(payload.filterQuery).trim() : "",
    page: Math.max(0, Number(payload?.page) || 0),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  persistBucket(client);
}

function readTicketReopenOutsideSession(client, messageId) {
  const mid = String(messageId || "");
  if (!mid || !client) return null;
  ensureLoaded(client);
  const b = bucket(client);
  const row = b.get(mid);
  if (!row || Number(row.expiresAt || 0) < Date.now()) {
    b.delete(mid);
    persistBucket(client);
    return null;
  }
  return row;
}

function updateTicketReopenOutsideSession(client, messageId, patch = {}) {
  const cur = readTicketReopenOutsideSession(client, messageId);
  if (!cur) return null;
  const next = {
    ...cur,
    ...patch,
    filterQuery: patch.filterQuery != null ? String(patch.filterQuery).trim() : cur.filterQuery,
    page: patch.page != null ? Math.max(0, Number(patch.page) || 0) : cur.page,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  bucket(client).set(String(messageId), next);
  persistBucket(client);
  return next;
}

module.exports = {
  rememberTicketReopenOutsideSession,
  readTicketReopenOutsideSession,
  updateTicketReopenOutsideSession,
};