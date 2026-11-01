/** Mute: protezione dello staff mutato (niente depex automatico) e recupero dopo l'unmute. */
const mongoose = require("mongoose") as typeof import("mongoose");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../../Utils/DB/validateWriteIds");
const { ensureMongoReady } = require("../../Utils/Database/mongoConnect") as typeof import("../../Utils/Database/mongoConnect");

const RECENT_UNMUTE_RECOVERY_DEDUPE_MS = 6 * 60 * 60 * 1000;
const MUTE_MIRROR_STAFF_PROTECT_MS = 7 * 24 * 60 * 60 * 1000;
const recentUnmuteProfileRecoveryUntil = new Map();
const muteMirrorStaffProtectUntil = new Map();
const memorySnapshots = new Map();
const postUnmuteReconciledMemory = new Set();

function getLatestUnmuteCaseAt(profileDoc?) {
  const cases = Array.isArray(profileDoc?.moderation?.modCases) ? profileDoc.moderation.modCases : [];
  let latest = 0;
  for (const row of cases) {
    if (String(row?.action || "").toUpperCase() !== "UNMUTE") continue;
    const ts = new Date(row?.createdAt || 0).getTime();
    if (Number.isFinite(ts) && ts > latest) latest = ts;
  }
  return latest;
}

function isPostUnmuteReconciliationCurrent(profileDoc?, guildId?, userId?) {
  const key = snapshotKey(guildId, userId);
  if (key && postUnmuteReconciledMemory.has(key)) return true;
  const unmuteAt = getLatestUnmuteCaseAt(profileDoc);
  if (!unmuteAt) return false;
  const reconciledAt = new Date(profileDoc?.moderation?.postUnmuteRolesReconciledAt || 0).getTime();
  return Number.isFinite(reconciledAt) && reconciledAt > 0 && reconciledAt >= unmuteAt;
}

function profileResyncMadeChanges(profileResync?) {
  if (!profileResync?.ok) return false;
  return Boolean(
    (Array.isArray(profileResync.levelRoles) && profileResync.levelRoles.length) ||
    (Array.isArray(profileResync.customRole) && profileResync.customRole.length) ||
    (Array.isArray(profileResync.secondaryCustomRole) && profileResync.secondaryCustomRole.length) ||
    (Array.isArray(profileResync.personality) && profileResync.personality.length) ||
    (Array.isArray(profileResync.minigame) && profileResync.minigame.length),
  );
}

async function markPostUnmuteReconciliationComplete(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const key = snapshotKey(gid, uid);
  if (key) postUnmuteReconciledMemory.add(key);
  markRecentUnmuteProfileRecovery(gid, uid);
  if (!isValidGuildUserId(gid, uid) || !dbReady()) return;
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    { $set: { "moderation.postUnmuteRolesReconciledAt": new Date() } },
  ).maxTimeMS(5000).catch(() => null);
}

function cleanupRecentUnmuteProfileRecovery(now = Date.now()) {
  for (const [key, until] of recentUnmuteProfileRecoveryUntil.entries()) {
    if (!until || now >= Number(until)) recentUnmuteProfileRecoveryUntil.delete(key);
  }
}

function markRecentUnmuteProfileRecovery(guildId?, userId?, now = Date.now()) {
  recentUnmuteProfileRecoveryUntil.set(snapshotKey(guildId, userId), now + RECENT_UNMUTE_RECOVERY_DEDUPE_MS);
}

function wasRecentUnmuteProfileRecoveryDone(guildId?, userId?, now = Date.now()) {
  cleanupRecentUnmuteProfileRecovery(now);
  const until = recentUnmuteProfileRecoveryUntil.get(snapshotKey(guildId, userId));
  return Boolean(until && now < Number(until));
}

function cleanupMuteMirrorStaffProtect(now = Date.now()) {
  for (const [key, until] of muteMirrorStaffProtectUntil.entries()) {
    if (!until || now >= Number(until)) muteMirrorStaffProtectUntil.delete(key);
  }
}

function markMuteMirrorStaffProtect(guildId?, userId?, now = Date.now()) {
  const key = snapshotKey(guildId, userId);
  if (!key || key === ":") return;
  muteMirrorStaffProtectUntil.set(key, now + MUTE_MIRROR_STAFF_PROTECT_MS);
  if (muteMirrorStaffProtectUntil.size > 4000) cleanupMuteMirrorStaffProtect(now);
}

function clearMuteMirrorStaffProtect(guildId?, userId?) {
  muteMirrorStaffProtectUntil.delete(snapshotKey(guildId, userId));
}

function isMuteMirrorStaffProtectActive(guildId?, userId?, now = Date.now()) {
  cleanupMuteMirrorStaffProtect(now);
  const until = muteMirrorStaffProtectUntil.get(snapshotKey(guildId, userId));
  return Boolean(until && now < Number(until));
}

function collectStaffOrPmRoleIdsFromList(roleIds?) {
  const staffIds = new Set(
    [
      IDs.roles?.Staff,
      IDs.roles?.Helper,
      IDs.roles?.Mod,
      IDs.roles?.SeniorModerator,
      IDs.roles?.Director,
      IDs.roles?.HighStaff,
      IDs.roles?.PartnerManager,
    ]
      .map((x?) => String(x || "").trim())
      .filter(Boolean),
  );
  return normalizeSnapshotRoleIds(roleIds).filter((id?) => staffIds.has(id));
}

async function discordStateStillHasStaffOrPm(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!isValidGuildUserId(gid, uid) || !dbReady()) return false;
  const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("profile.discordState.roleIds profile.muteRoleSnapshot.roleIds")
    .lean()
    .catch(() => null);
  const fromState = collectStaffOrPmRoleIdsFromList(doc?.profile?.discordState?.roleIds);
  if (fromState.length) return true;
  return collectStaffOrPmRoleIdsFromList(doc?.profile?.muteRoleSnapshot?.roleIds).length > 0;
}

function memberIsInMuteMirrorState(member?) {
  const mutedId = String(IDs.roles?.Muted || "").trim();
  if (mutedId && member?.roles?.cache?.has(mutedId)) return true;
  return isCommunicationTimeoutActive(member);
}

/**
 * Blocca depex staff/PM e side-effect (cancel pause/resoconti/unclaim) mentre
 * il mute mirror sta strip/restoreando i ruoli — anche per staff/PM.
 */
async function shouldSuppressStaffDepexForMuteMirror(member?) {
  if (!member?.guild?.id || !member?.id) return false;
  const gid = String(member.guild.id);
  const uid = String(member.id);
  if (memberIsInMuteMirrorState(member)) return true;
  if (isMuteMirrorStaffProtectActive(gid, uid)) return true;
  if (wasRecentUnmuteProfileRecoveryDone(gid, uid)) return true;
  if (await hasPendingMuteMirrorSnapshot(gid, uid).catch(() => false)) return true;
  const mutedId = String(IDs.roles?.Muted || "").trim();
  if (memberLooksRoleWiped(member, mutedId) && (await discordStateStillHasStaffOrPm(gid, uid).catch(() => false))) {
    return true;
  }
  return false;
}

function snapshotKey(guildId?, userId?) {
  return `${String(guildId || "").trim()}:${String(userId || "").trim()}`;
}

function normalizeSnapshotRoleIds(roleIds?) {
  return [...new Set((Array.isArray(roleIds) ? roleIds : []).map((x?) => String(x || "").trim()).filter(Boolean))];
}

function dbReady() {
  return mongoose.connection?.readyState === 1;
}

async function loadProfileMuteSnapshotRoleIds(guildId?, userId?) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid) || !dbReady()) return [];
  const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("profile.muteRoleSnapshot.roleIds")
    .lean()
    .catch(() => null);
  return normalizeSnapshotRoleIds(doc?.profile?.muteRoleSnapshot?.roleIds);
}

async function loadSnapshot(guildId?, userId?) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  const key = snapshotKey(gid, uid);
  if (!isValidGuildUserId(gid, uid)) return [];

  const mem = memorySnapshots.get(key);
  if (Array.isArray(mem) && mem.length) return [...mem];

  await ensureMongoReady({ maxWaitMs: 5000 }).catch(() => false);
  if (!dbReady()) return [];

  const fromProfile = await loadProfileMuteSnapshotRoleIds(gid, uid);
  if (fromProfile.length) {
    memorySnapshots.set(key, fromProfile);
    return fromProfile;
  }
  return [];
}

function memberLooksRoleWiped(member?, mutedRoleId?) {
  const guildId = String(member?.guild?.id || "");
  const muted = String(mutedRoleId || "").trim();
  const cache = member?.roles?.cache;
  if (!cache) return true;
  let count = 0;
  for (const [id] of cache) {
    const rid = String(id || "").trim();
    if (!rid || rid === guildId) continue;
    if (muted && rid === muted) continue;
    count += 1;
  }
  return count < 2;
}

function isCommunicationTimeoutActive(member?) {
  const until =
    Number(member?.communicationDisabledUntilTimestamp || 0) ||
    (member?.communicationDisabledUntil
      ? new Date(member.communicationDisabledUntil).getTime()
      : 0);
  return Boolean(Number.isFinite(until) && until > Date.now());
}

async function hasPendingMuteMirrorSnapshot(guildId?, userId?) {
  const saved = await loadSnapshot(guildId, userId);
  return saved.length > 0;
}

export = { memorySnapshots, isPostUnmuteReconciliationCurrent, profileResyncMadeChanges, markPostUnmuteReconciliationComplete, markRecentUnmuteProfileRecovery, wasRecentUnmuteProfileRecoveryDone, markMuteMirrorStaffProtect, clearMuteMirrorStaffProtect, memberIsInMuteMirrorState, shouldSuppressStaffDepexForMuteMirror, snapshotKey, normalizeSnapshotRoleIds, dbReady, loadProfileMuteSnapshotRoleIds, loadSnapshot, memberLooksRoleWiped, isCommunicationTimeoutActive, hasPendingMuteMirrorSnapshot };
