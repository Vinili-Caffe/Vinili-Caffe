/** Ruoli personalizzati: richieste in attesa (dal sito e da Discord), salvate nel database. */
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../../Community/schemas/communitySchemas") as typeof import("../../../Community/schemas/communitySchemas");
const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../../shared/recovery/snapshotStore") as typeof import("../../../../shared/recovery/snapshotStore");

const pendingRoleGrants = new Map();
const pendingSiteRoleRequests = new Map();
const PENDING_SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "customRolePendingRequestsSnapshot.json");
let pendingLoaded = false;
const PENDING_SITE_ROLE_DOC = SITE_DOCUMENT_TYPE.ROLE_REQUEST_PENDING;
const PENDING_ROLE_GRANT_DOC = SITE_DOCUMENT_TYPE.ROLE_GRANT_PENDING;

function mapPendingSiteRoleDoc(doc?) {
  if (!doc) return null;
  const expiresAt = doc.expiresAt ? new Date(doc.expiresAt).getTime() : 0;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return {
    guildId: String(doc.guildId || ""),
    requesterId: String(doc.requesterId || ""),
    ownerId: String(doc.ownerId || ""),
    roleId: String(doc.roleId || ""),
    reason: String(doc.reason || doc.content || ""),
    dmChannelId: String(doc.dmChannelId || ""),
    dmMessageId: String(doc.dmMessageId || ""),
    expiresAt,
  };
}

async function persistPendingSiteRoleRequest(token?, row?) {
  const t = String(token || "").trim();
  if (!t || !row) return;
  await SiteDocument.findOneAndUpdate(
    { docType: PENDING_SITE_ROLE_DOC, requestToken: t },
    {
      $set: {
        guildId: String(row.guildId || ""),
        requesterId: String(row.requesterId || ""),
        ownerId: String(row.ownerId || ""),
        roleId: String(row.roleId || ""),
        reason: String(row.reason || "").slice(0, 500),
        dmChannelId: String(row.dmChannelId || ""),
        dmMessageId: String(row.dmMessageId || ""),
        expiresAt: new Date(Number(row.expiresAt) || Date.now()),
        status: "pending",
      },
      $setOnInsert: {
        docType: PENDING_SITE_ROLE_DOC,
        requestToken: t,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((err?) => {
    global.logger?.warn?.("[site-role-request] persist pending:", err?.message || err);
  });
}

async function loadPendingSiteRoleRequest(token?) {
  const t = String(token || "").trim();
  if (!t) return null;
  const doc = await SiteDocument.findOne({ docType: PENDING_SITE_ROLE_DOC, requestToken: t })
    .lean()
    .catch(() => null);
  const mapped = mapPendingSiteRoleDoc(doc);
  if (!mapped) {
    if (doc) {
      await SiteDocument.deleteOne({ docType: PENDING_SITE_ROLE_DOC, requestToken: t }).catch(() => {});
    }
    return null;
  }
  return mapped;
}

async function deletePendingSiteRoleRequest(token?) {
  const t = String(token || "").trim();
  if (!t) return;
  pendingSiteRoleRequests.delete(t);
  await SiteDocument.deleteOne({ docType: PENDING_SITE_ROLE_DOC, requestToken: t }).catch(() => {});
}

async function resolvePendingSiteRoleRequest(token?) {
  const t = String(token || "").trim();
  if (!t) return null;
  ensurePendingLoaded();
  let request = pendingSiteRoleRequests.get(t) || null;
  if (request && Number(request.expiresAt || 0) > Date.now()) return request;
  request = await loadPendingSiteRoleRequest(t);
  if (request) pendingSiteRoleRequests.set(t, request);
  return request;
}

function mapPendingRoleGrantDoc(doc?) {
  if (!doc) return null;
  const expiresAt = doc.expiresAt ? new Date(doc.expiresAt).getTime() : 0;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return {
    guildId: String(doc.guildId || ""),
    channelId: String(doc.workflowChannelId || doc.channelId || "") || null,
    requesterId: String(doc.requesterId || ""),
    targetId: String(doc.userId || doc.targetId || ""),
    roleId: String(doc.roleId || ""),
    promptMessageId: String(doc.workflowMessageId || doc.promptMessageId || "") || null,
    dmChannelId: String(doc.dmChannelId || ""),
    dmMessageId: String(doc.dmMessageId || ""),
    expiresAt,
  };
}

async function persistPendingRoleGrant(token?, row?) {
  const t = String(token || "").trim();
  if (!t || !row) return;
  await SiteDocument.findOneAndUpdate(
    { docType: PENDING_ROLE_GRANT_DOC, requestToken: t },
    {
      $set: {
        guildId: String(row.guildId || ""),
        requesterId: String(row.requesterId || ""),
        userId: String(row.targetId || ""),
        roleId: String(row.roleId || ""),
        workflowChannelId: String(row.channelId || ""),
        workflowMessageId: String(row.promptMessageId || ""),
        dmChannelId: String(row.dmChannelId || ""),
        dmMessageId: String(row.dmMessageId || ""),
        expiresAt: new Date(Number(row.expiresAt) || Date.now()),
        status: "pending",
      },
      $setOnInsert: {
        docType: PENDING_ROLE_GRANT_DOC,
        requestToken: t,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((err?) => {
    global.logger?.warn?.("[custom-role-grant] persist pending:", err?.message || err);
  });
}

async function loadPendingRoleGrant(token?) {
  const t = String(token || "").trim();
  if (!t) return null;
  const doc = await SiteDocument.findOne({ docType: PENDING_ROLE_GRANT_DOC, requestToken: t })
    .lean()
    .catch(() => null);
  const mapped = mapPendingRoleGrantDoc(doc);
  if (!mapped) {
    if (doc) {
      await SiteDocument.deleteOne({ docType: PENDING_ROLE_GRANT_DOC, requestToken: t }).catch(() => {});
    }
    return null;
  }
  return mapped;
}

async function deletePendingRoleGrant(token?) {
  const t = String(token || "").trim();
  if (!t) return;
  pendingRoleGrants.delete(t);
  await SiteDocument.deleteOne({ docType: PENDING_ROLE_GRANT_DOC, requestToken: t }).catch(() => {});
}

async function resolvePendingRoleGrant(token?) {
  const t = String(token || "").trim();
  if (!t) return null;
  ensurePendingLoaded();
  let request = pendingRoleGrants.get(t) || null;
  if (request && Number(request.expiresAt || 0) > Date.now()) return request;
  request = await loadPendingRoleGrant(t);
  if (request) pendingRoleGrants.set(t, request);
  return request;
}

function persistPendingNow() {
  const now = Date.now();
  const payload = { roleGrants: {}, siteRoleRequests: {} };
  for (const [token, row] of pendingRoleGrants.entries()) {
    const expiresAt = Number(row?.expiresAt || 0);
    if (!token || !expiresAt || expiresAt <= now) continue;
    payload.roleGrants[token] = { ...row };
  }
  for (const [token, row] of pendingSiteRoleRequests.entries()) {
    const expiresAt = Number(row?.expiresAt || 0);
    if (!token || !expiresAt || expiresAt <= now) continue;
    payload.siteRoleRequests[token] = { ...row };
  }
  writeSnapshotWithMeta({ filePath: PENDING_SNAPSHOT_PATH, walPath: `${PENDING_SNAPSHOT_PATH}.wal`, key: "vinyls_custom_role_pending", version: 1, payload, });
}

function ensurePendingLoaded() {
  if (pendingLoaded) return;
  pendingLoaded = true;
  const raw = readSnapshotWithMeta({ filePath: PENDING_SNAPSHOT_PATH, walPath: `${PENDING_SNAPSHOT_PATH}.wal`, key: "vinyls_custom_role_pending", version: 1, fallback: { roleGrants: {}, siteRoleRequests: {} }, });
  const now = Date.now();
  for (const [token, row] of Object.entries(raw?.roleGrants || {})) {
    const expiresAt = Number(row?.expiresAt || 0);
    if (!token || !expiresAt || expiresAt <= now) continue;
    pendingRoleGrants.set(token, row);
  }
  for (const [token, row] of Object.entries(raw?.siteRoleRequests || {})) {
    const expiresAt = Number(row?.expiresAt || 0);
    if (!token || !expiresAt || expiresAt <= now) continue;
    pendingSiteRoleRequests.set(token, row);
  }
}

function getPendingRoleGrantByToken(token?) {
  if (!token) return null;
  ensurePendingLoaded();
  return pendingRoleGrants.get(String(token)) || null;
}

export = { pendingRoleGrants, pendingSiteRoleRequests, PENDING_SITE_ROLE_DOC, persistPendingSiteRoleRequest, deletePendingSiteRoleRequest, resolvePendingSiteRoleRequest, persistPendingRoleGrant, deletePendingRoleGrant, resolvePendingRoleGrant, persistPendingNow, ensurePendingLoaded, getPendingRoleGrantByToken };
