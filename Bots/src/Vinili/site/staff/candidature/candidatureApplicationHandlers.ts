const { APPLICATION_TYPES, cooldownByUserAndType, cooldownStorageKey, loadCooldownMap, persistCooldownMap } = require("./candidatureEligibility") as typeof import("./candidatureEligibility");
const { APPLICATION_COOLDOWN_MS, draftByStateKey, DRAFT_TTL_MS, persistDraftMap, resolveSubmissionChannel } = require("./candidatureEmbeds") as typeof import("./candidatureEmbeds");
const { memberHasCandidatureReviewAccess, parseCandidateTypeFromMessage, listCandidatureApplications, getCandidatureApplicationDetail } = require("./candidatureList") as typeof import("./candidatureList");
const { webRejectCandidateApplication, webAcceptCandidateApplication } = require("./candidatureDecision") as typeof import("./candidatureDecision");
const { resolveWebsiteCandidatureMember, getCandidatureEligibilitySummary, submitCandidatureWebsite } = require("./candidatureWebsite") as typeof import("./candidatureWebsite");

async function pruneOldDrafts() {
  const now = Date.now();
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
  global.__vcCandidatureCleanupTimer = setInterval(pruneOldDrafts, 5 * 60 * 1000);
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
  getCandidatureApplicationDetail,
  webRejectCandidateApplication,
  webAcceptCandidateApplication,
};
