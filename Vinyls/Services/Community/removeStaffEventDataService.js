const { ActivityUserProfile, GlobalSettings } = require("../../Schemas/Community/communitySchemas");

async function removeStaffEventData() {
  const [profiles, settings] = await Promise.all([
    ActivityUserProfile.updateMany(
      { "staff.staffEvent": { $exists: true } },
      { $unset: { "staff.staffEvent": "" } },
    ).catch(() => ({ modifiedCount: 0 })),
    GlobalSettings.updateMany(
      {
        $or: [
          { staffEventExpiresAt: { $exists: true } },
          { staffEventStartedAt: { $exists: true } },
        ],
      },
      { $unset: { staffEventExpiresAt: "", staffEventStartedAt: "" } },
    ).catch(() => ({ modifiedCount: 0 })),
  ]);
  return {
    profilesModified: Number(profiles?.modifiedCount || 0),
    settingsModified: Number(settings?.modifiedCount || 0),
  };
}

module.exports = { removeStaffEventData };