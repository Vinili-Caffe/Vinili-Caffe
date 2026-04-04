const { ActivityUserProfile, UserLeaveBackup, RejoinRoleMemory } = require("../../Schemas/Community/communitySchemas");
const { addRolesAndGetMember, getGuildRoleCached } = require("../../Utils/Interaction/interactionEntityCache");

const RESTORE_ON_REJOIN_ROLE_IDS = [
  "1463248874725576879",
  "1463248847768785038",
  "1443252279477272647",
];

const DEFAULT_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function resolveRetentionDays() {
  const raw = Number(process.env.USER_LEAVE_BACKUP_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_RETENTION_DAYS;
  return Math.max(1, Math.floor(raw));
}

function resolveExpiryDate() {
  return new Date(Date.now() + resolveRetentionDays() * DAY_MS);
}

function toMs(value) {
  const t = new Date(value || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

function getTrackedRolesFromMember(member) {
  if (!member?.roles?.cache) return [];
  return RESTORE_ON_REJOIN_ROLE_IDS.filter((roleId) =>
    member.roles.cache.has(String(roleId)),
  );
}

async function backupUserOnLeave(guildId, userId, member = null) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!gid || !uid) return false;

  const source = await ActivityUserProfile.findOne({ guildId: gid, userId: uid }).lean().catch(() => null);
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

  if (!source && trackedRoleIds.length === 0) return false;

  await UserLeaveBackup.updateOne(
    { guildId: gid, userId: uid },
    {
      $set: {
        guildId: gid,
        userId: uid,
        backupDoc: source || null,
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
  if (!gid || !uid) return false;

  const backup = await UserLeaveBackup.findOne({ guildId: gid, userId: uid }).lean().catch(() => null);
  const roleMemory = await RejoinRoleMemory.findOne({ guildId: gid, userId: uid }).lean().catch(() => null);
  const roleIdsFromMemory = Array.isArray(roleMemory?.roleIds) ? roleMemory.roleIds : [];
  const roleIdsFallback = Array.isArray(backup?.restoreRoleIds) ? backup.restoreRoleIds : [];
  const restoreRoleIds = roleIdsFromMemory.length > 0 ? roleIdsFromMemory : roleIdsFallback;
  let payload = backup?.backupDoc || null;
  if (backup?.expiresAt && new Date(backup.expiresAt).getTime() <= Date.now()) {
    await UserLeaveBackup.deleteOne({ guildId: gid, userId: uid }).catch(() => null);
    payload = null;
  }
  if ((!payload || typeof payload !== "object") && restoreRoleIds.length === 0) return false;

  let restoredProfile = false;
  if (payload && typeof payload === "object") {
    const current = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
      .select("updatedAt")
      .lean()
      .catch(() => null);
    const backupUpdatedMs = Math.max(toMs(payload?.updatedAt), toMs(backup?.leftAt));
    const currentUpdatedMs = toMs(current?.updatedAt);

    // Protezione anti-overwrite: se il documento attuale è più recente del backup,
    // non ripristinare e scarta il backup.
    if (current && currentUpdatedMs > backupUpdatedMs) {
      await UserLeaveBackup.deleteOne({ _id: backup._id }).catch(() => null);
      payload = null;
    } else {
      const setPayload = {
        ...(payload?.profile && typeof payload.profile === "object" ? { profile: payload.profile } : {}),
        ...(payload?.moderation && typeof payload.moderation === "object" ? { moderation: payload.moderation } : {}),
        ...(payload?.staff && typeof payload.staff === "object" ? { staff: payload.staff } : {}),
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
  }

  let restoredRoles = false;
  if (member && restoreRoleIds.length > 0) {
    restoredRoles = await restoreRolesOnJoin(member, restoreRoleIds).catch(() => false);
  }

  if (backup?._id) {
    await UserLeaveBackup.deleteOne({ _id: backup._id }).catch(() => null);
  }
  return restoredProfile || restoredRoles;
}

async function purgeExpiredUserLeaveBackups() {
  const now = new Date();
  const result = await UserLeaveBackup.deleteMany({ expiresAt: { $lte: now } }).catch(() => ({ deletedCount: 0 }));
  return Number(result?.deletedCount || 0);
}

module.exports = { backupUserOnLeave, restoreUserOnJoin, purgeExpiredUserLeaveBackups };