const path = require("path") as typeof import("path");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");
const { APPLICATION_TYPES, cooldownByUserAndType, cooldownStorageKey, loadCooldownMap, persistCooldownMap } = require("./candidatureEligibility") as typeof import("./candidatureEligibility");
const { DRAFT_TTL_MS, APPLICATION_COOLDOWN_MS, draftByStateKey, APPLICATIONS, persistDraftMap, resolveSubmissionChannel } = require("./candidatureEmbeds") as typeof import("./candidatureEmbeds");
const { memberHasCandidatureReviewAccess, parseCandidateTypeFromMessage, listCandidatureApplications, listPendingCandidatureApplications, getCandidatureApplicationDetail } = require("./candidatureList") as typeof import("./candidatureList");
const { webRejectCandidateApplication, webAcceptCandidateApplication } = require("./candidatureDecision") as typeof import("./candidatureDecision");
const { resolveWebsiteCandidatureMember, getCandidatureEligibilitySummary, submitCandidatureWebsite } = require("./candidatureWebsite") as typeof import("./candidatureWebsite");







const BOT_ROOT = path.resolve(__dirname, "..", "..");
const STATE_TTL_MS = 30 * 60 * 1000;
const pendingApplications = new Map();
/* rebootDurability1: sync pendingApplications → drafts on shutdown */
let candidatureDraftShutdownFlushRegistered = false;

function splitQuestions(questions?, chunkSize = 4) {
  const list = Array.isArray(questions) ? questions : [];
  const size = Math.max(1, Number(chunkSize) || 4);
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks.length ? chunks : [[]];
}

function inferDraftNextStep(stateKey?, answers?) {
  const existing = draftByStateKey.get(stateKey);
  const existingStep = Number(existing?.nextStep || 0);
  if (Number.isFinite(existingStep) && existingStep >= 1) return Math.floor(existingStep);

  const parts = String(stateKey || "").split(":");
  const type = parts[parts.length - 1];
  const cfg = APPLICATIONS[type];
  if (!cfg?.questions?.length) return 1;
  const chunks = splitQuestions(cfg.questions, 4);
  for (let i = 0; i < chunks.length; i += 1) {
    const incomplete = chunks[i].some((q?) => !String(answers?.[q.id] || "").trim());
    if (incomplete) return i + 1;
  }
  return Math.max(1, chunks.length);
}

async function syncPendingApplicationsToDraftsOnShutdown() {
  const now = Date.now();
  let changed = false;
  for (const [stateKey, state] of pendingApplications.entries()) {
    if (!stateKey || !state?.answers || typeof state.answers !== "object") continue;
    const createdAt = Number(state.createdAt || 0);
    if (Number.isFinite(createdAt) && createdAt > 0 && now - createdAt > STATE_TTL_MS) continue;
    draftByStateKey.set(stateKey, {
      answers: state.answers,
      nextStep: inferDraftNextStep(stateKey, state.answers),
      updatedAt: now,
    });
    changed = true;
  }
  if (changed) await persistDraftMap();
}

function ensureCandidatureDraftShutdownFlush() {
  if (candidatureDraftShutdownFlushRegistered) return;
  candidatureDraftShutdownFlushRegistered = true;
  armShutdownCheckpoint();
  registerShutdownFlush("vinyls_candidature_pending_drafts", () =>
    syncPendingApplicationsToDraftsOnShutdown(),
  );
}

ensureCandidatureDraftShutdownFlush();

async function pruneOldStates() {
  const now = Date.now();
  for (const [key, state] of pendingApplications.entries()) {
    if (!state?.createdAt || now - state.createdAt > STATE_TTL_MS) {
      pendingApplications.delete(key);
    }
  }
  let draftChanged = false;
  for (const [key, draft] of draftByStateKey.entries()) {
    const updatedAt = Number(draft?.updatedAt || 0);
    if (!Number.isFinite(updatedAt) || now - updatedAt > DRAFT_TTL_MS) {
      draftByStateKey.delete(key);
      draftChanged = true;
    }
  }
  if (draftChanged) await persistDraftMap();
}

if (!global.__vcCandidatureCleanupTimer) {
  global.__vcCandidatureCleanupTimer = setInterval(pruneOldStates, 5 * 60 * 1000);
  if (typeof global.__vcCandidatureCleanupTimer.unref === "function") {
    global.__vcCandidatureCleanupTimer.unref();
  }
}

async function bumpApplicationCooldownAfterStaffDepex(userId?) {
  const uid = String(userId || "").trim();
  if (!/^\d{16,20}$/.test(uid)) return;
  await loadCooldownMap();
  const floor = Date.now() + APPLICATION_COOLDOWN_MS;
  for (const type of APPLICATION_TYPES) {
    const key = cooldownStorageKey(uid, type);
    const cur = Number(cooldownByUserAndType.get(key) || 0);
    const active = Number.isFinite(cur) && cur > Date.now() ? cur : 0;
    cooldownByUserAndType.set(key, Math.max(floor, active));
  }
  await persistCooldownMap();
}

export = {
  submitCandidatureWebsite,
  getCandidatureEligibilitySummary,
  resolveWebsiteCandidatureMember,
  resolveSubmissionChannel,
  bumpApplicationCooldownAfterStaffDepex,
  memberHasCandidatureReviewAccess,
  parseCandidateTypeFromMessage,
  listCandidatureApplications,
  listPendingCandidatureApplications,
  getCandidatureApplicationDetail,
  webRejectCandidateApplication,
  webAcceptCandidateApplication,
};
