const { ActivityUserProfile, UserLeaveBackup } = require("../../Schemas/Community/communitySchemas");

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

async function backupUserOnLeave(guildId, userId) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!gid || !uid) return false;

  const source = await ActivityUserProfile.findOne({ guildId: gid, userId: uid }).lean().catch(() => null);
  if (!source) return false;

  await UserLeaveBackup.updateOne(
    { guildId: gid, userId: uid },
    {
      $set: {
        guildId: gid,
        userId: uid,
        backupDoc: source,
        leftAt: new Date(),
        expiresAt: resolveExpiryDate(),
      },
    },
    { upsert: true },
  ).catch(() => null);
  return true;
}

async function restoreUserOnJoin(guildId, userId) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!gid || !uid) return false;

  const backup = await UserLeaveBackup.findOne({ guildId: gid, userId: uid }).lean().catch(() => null);
  const payload = backup?.backupDoc || null;
  if (!payload || typeof payload !== "object") return false;
  if (backup?.expiresAt && new Date(backup.expiresAt).getTime() <= Date.now()) {
    await UserLeaveBackup.deleteOne({ guildId: gid, userId: uid }).catch(() => null);
    return false;
  }

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
    return false;
  }

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

  await UserLeaveBackup.deleteOne({ _id: backup._id }).catch(() => null);
  return true;
}

async function purgeExpiredUserLeaveBackups() {
  const now = new Date();
  const result = await UserLeaveBackup.deleteMany({ expiresAt: { $lte: now } }).catch(() => ({ deletedCount: 0 }));
  return Number(result?.deletedCount || 0);
}

module.exports = { backupUserOnLeave, restoreUserOnJoin, purgeExpiredUserLeaveBackups };