const { ActivityUserProfile, GlobalSettings, UserLeaveBackup } = require("../../Schemas/Community/communitySchemas");

async function removeStaffEventData() {
  const [profiles, settings, backups] = await Promise.all([
    ActivityUserProfile.collection.updateMany(
      { "staff.staffEvent": { $exists: true } },
      { $unset: { "staff.staffEvent": "" } },
    ).catch(() => ({ modifiedCount: 0 })),
    GlobalSettings.collection.updateMany(
      {
        $or: [
          { staffEventExpiresAt: { $exists: true } },
          { staffEventStartedAt: { $exists: true } },
        ],
      },
      { $unset: { staffEventExpiresAt: "", staffEventStartedAt: "" } },
    ).catch(() => ({ modifiedCount: 0 })),
    UserLeaveBackup.collection.updateMany(
      { "backupDoc.staff.staffEvent": { $exists: true } },
      { $unset: { "backupDoc.staff.staffEvent": "" } },
    ).catch(() => ({ modifiedCount: 0 })),
  ]);
  return {
    profilesModified: Number(profiles?.modifiedCount || 0),
    settingsModified: Number(settings?.modifiedCount || 0),
    backupsModified: Number(backups?.modifiedCount || 0),
  };
}

module.exports = { removeStaffEventData };