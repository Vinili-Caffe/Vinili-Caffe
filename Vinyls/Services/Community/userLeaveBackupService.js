const { ActivityUserProfile, UserLeaveBackup, RejoinRoleMemory } = require("../../Schemas/Community/communitySchemas");
const { addRolesAndGetMember, getGuildRoleCached } = require("../../Utils/Interaction/interactionEntityCache");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const IDs = require("../../Utils/Config/ids");

const RESTORE_ON_REJOIN_ROLE_IDS = [
  "1463248874725576879",
  "1463248847768785038",
  "1443252279477272647",
];

const DEFAULT_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const NO_AUTO_RESTORE_STAFF_PM_ROLE_IDS = new Set(
  [
    IDs.roles?.PartnerManager,
    IDs.roles?.Staff,
    IDs.roles?.Helper,
    IDs.roles?.Mod,
    IDs.roles?.HighStaff,
    IDs.roles?.Admin,
    IDs.roles?.CoFounder,
    IDs.roles?.Founder,
  ]
    .filter(Boolean)
    .map((id) => String(id)),
);

function filterRestoreRoleIdsExcludingStaffPm(roleIds) {
  return Array.from(
    new Set(
      (Array.isArray(roleIds) ? roleIds : [])
        .map((id) => String(id || "").trim())
        .filter((id) => id && !NO_AUTO_RESTORE_STAFF_PM_ROLE_IDS.has(id)),
    ),
  );
}

function resolveRetentionDays() {
  const raw = Number(process.env.USER_LEAVE_BACKUP_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_RETENTION_DAYS;
  return Math.max(1, Math.floor(raw));
}

function resolveExpiryDate() {
  return new Date(Date.now() + resolveRetentionDays() * DAY_MS);
}

function getTrackedRolesFromMember(member) {
  if (!member?.roles?.cache) return [];
  return RESTORE_ON_REJOIN_ROLE_IDS.filter((roleId) =>
    member.roles.cache.has(String(roleId)),
  );
}

function getRestorableRoleIdsFromMember(member) {
  const cache = member?.roles?.cache;
  const guildId = String(member?.guild?.id || "");
  if (!cache || !guildId) return [];
  return Array.from(cache.values())
    .filter((role) => {
      if (!role?.id) return false;
      if (String(role.id) === guildId) return false;
      if (role.managed) return false;
      return true;
    })
    .map((role) => String(role.id))
    .filter(Boolean);
}

async function backupUserOnLeave(guildId, userId, member = null) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid)) return false;

  const source = await ActivityUserProfile.findOne({ guildId: gid, userId: uid }).lean().catch(() => null);
  const restoreRoleIds = getRestorableRoleIdsFromMember(member);
  const trackedRoleIds = getTrackedRolesFromMember(member);

  if (trackedRoleIds.length > 0) {
    await RejoinRoleMemory.updateOne(
      { guildId: gid, userId: uid },
      { $set: { guildId: gid, userId: uid, roleIds: trackedRoleIds } },
      { upsert: true },
    ).catch(() => null);
  } else {
    await RejoinRoleMemory.deleteOne({ guildId: gid, userId: uid }).catch(() => null);
  }

  if (!source && restoreRoleIds.length === 0) return false;

  await UserLeaveBackup.updateOne(
    { guildId: gid, userId: uid },
    {
      $set: {
        guildId: gid,
        userId: uid,
        backupDoc: source || null,
        restoreRoleIds,
        leftAt: new Date(),
        expiresAt: resolveExpiryDate(),
      },
    },
    { upsert: true },
  ).catch(() => null);
  return true;
}

async function restoreRolesOnJoin(member, roleIds) {
  if (!member || !Array.isArray(roleIds) || roleIds.length === 0) return false;
  const me = member.guild?.members?.me || null;
  if (!me?.permissions?.has?.("ManageRoles")) return false;
  const candidateRoleIds = Array.from(
    new Set(roleIds.map((id) => String(id || "").trim()).filter(Boolean)),
  );
  if (!candidateRoleIds.length) return false;

  const addableRoleIds = [];
  for (const roleId of candidateRoleIds) {
    if (member.roles.cache.has(roleId)) continue;
    const role = await getGuildRoleCached(member.guild, roleId);
    if (!role) continue;
    if (role.position >= me.roles.highest.position) continue;
    addableRoleIds.push(role.id);
  }
  if (!addableRoleIds.length) return false;

  const refreshed = await addRolesAndGetMember(member.guild, member.id, addableRoleIds).catch(() => null);
  if (!refreshed?.roles?.cache) return false;
  const fullyApplied = addableRoleIds.every((roleId) => refreshed.roles.cache.has(roleId));
  return fullyApplied;
}

async function restoreUserOnJoin(guildId, userId, member = null) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid)) return false;

  const backup = await UserLeaveBackup.findOne({ guildId: gid, userId: uid }).lean().catch(() => null);
  const roleMemory = await RejoinRoleMemory.findOne({ guildId: gid, userId: uid }).lean().catch(() => null);
  const roleIdsFromMemory = Array.isArray(roleMemory?.roleIds) ? roleMemory.roleIds : [];
  const roleIdsFallback = Array.isArray(backup?.restoreRoleIds) ? backup.restoreRoleIds : [];
  const restoreRoleIds = filterRestoreRoleIdsExcludingStaffPm(
    [...roleIdsFromMemory, ...roleIdsFallback].map((id) => String(id || "").trim()).filter(Boolean),
  );
  let payload = backup?.backupDoc || null;
  if (backup?.expiresAt && new Date(backup.expiresAt).getTime() <= Date.now()) {
    await UserLeaveBackup.deleteOne({ guildId: gid, userId: uid }).catch(() => null);
    payload = null;
  }
  if ((!payload || typeof payload !== "object") && restoreRoleIds.length === 0) return false;

  let restoredProfile = false;
  if (payload && typeof payload === "object") {
    const current = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
      .select("profile moderation staff staffPendingPurgeAt")
      .lean()
      .catch(() => null);
    const nextProfile =
      payload?.profile && typeof payload.profile === "object"
        ? payload.profile
        : current?.profile && typeof current.profile === "object"
          ? current.profile
          : null;
    const nextModeration =
      payload?.moderation && typeof payload.moderation === "object"
        ? payload.moderation
        : current?.moderation && typeof current.moderation === "object"
          ? current.moderation
          : null;
    const staffFromCurrent = current?.staff && typeof current.staff === "object" ? current.staff : null;
    const staffFromPayload = payload?.staff && typeof payload.staff === "object" ? payload.staff : null;
    const nextStaff = staffFromCurrent || staffFromPayload;

    const setPayload = {
      ...(nextProfile ? { profile: nextProfile } : {}),
      ...(nextModeration ? { moderation: nextModeration } : {}),
      ...(nextStaff ? { staff: nextStaff } : {}),
      updatedAt: new Date(),
    };
    const setOnInsert = {
      guildId: gid,
      userId: uid,
      ...(payload?.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
    };
    await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      { $setOnInsert: setOnInsert, $set: setPayload },
      { upsert: true },
    ).catch(() => null);
    restoredProfile = true;
  }

  let restoredRoles = false;
  if (member && restoreRoleIds.length > 0) {
    restoredRoles = await restoreRolesOnJoin(member, restoreRoleIds).catch(() => false);
  }

  const hasPendingRoleRestore = restoreRoleIds.length > 0 && !restoredRoles;
  if (backup?._id && !hasPendingRoleRestore) {
    await UserLeaveBackup.deleteOne({ _id: backup._id }).catch(() => null);
  }
  return restoredProfile || restoredRoles;
}

async function purgeDueStaffGraceProfiles() {
  const now = new Date();
  await ActivityUserProfile.updateMany(
    { staffPendingPurgeAt: { $lte: now } },
    { $unset: { staff: "", staffPendingPurgeAt: "" } },
  ).catch(() => null);
}

function startStaffGracePurgeLoop(client) {
  if (!client || client._staffGracePurgeInterval) return;
  const tick = () => purgeDueStaffGraceProfiles().catch(() => null);
  tick();
  const timer = setInterval(tick, 60 * 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
  client._staffGracePurgeInterval = timer;
}

async function clearStaffPendingPurgeAt(guildId, userId) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid)) return;
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    { $unset: { staffPendingPurgeAt: "" } },
  ).catch(() => null);
}

async function purgeExpiredUserLeaveBackups() {
  const now = new Date();
  const result = await UserLeaveBackup.deleteMany({ expiresAt: { $lte: now } }).catch(() => ({ deletedCount: 0 }));
  return Number(result?.deletedCount || 0);
}

module.exports = {
  backupUserOnLeave,
  restoreUserOnJoin,
  purgeExpiredUserLeaveBackups,
  purgeDueStaffGraceProfiles,
  startStaffGracePurgeLoop,
  clearStaffPendingPurgeAt,
};