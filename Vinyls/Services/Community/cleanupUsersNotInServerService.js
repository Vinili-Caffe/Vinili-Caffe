const {
  ActivityUserProfile,
  ACTIVITY_MAIN_GUILD_ID,
  InviteReminderState,
  CustomRole,
  AvatarPrivacy,
  BannerPrivacy,
  QuotePrivacy,
} = require("../../Schemas/Community/communitySchemas");
const { automodBadUser } = require("../../Utils/Community/activityUserProfilePaths");
const Staff = require("../../Schemas/Staff/staffSchema");

const guildScoped = [
  [ActivityUserProfile, "ActivityUserProfile"],
  [Staff, "Staff"],
  [InviteReminderState, "InviteReminderState"],
  [CustomRole, "CustomRole"],
  [AvatarPrivacy, "AvatarPrivacy"],
  [BannerPrivacy, "BannerPrivacy"],
  [QuotePrivacy, "QuotePrivacy"],
];

async function clearGlobalAutomodBadUserForUsersNotIn(memberIds, dryRun) {
  const filter = {
    guildId: ACTIVITY_MAIN_GUILD_ID,
    userId: { $nin: memberIds },
    [automodBadUser()]: { $exists: true },
  };
  if (dryRun) {
    const n = await ActivityUserProfile.countDocuments(filter).catch(() => 0);
    return n;
  }
  const res = await ActivityUserProfile.updateMany(filter, {
    $unset: { [automodBadUser()]: "" },
  }).catch(() => ({ modifiedCount: 0 }));
  return res?.modifiedCount ?? 0;
}

/**
 * Elimina (o conta in dryRun) i documenti di utenti non presenti in memberIds per la guild indicata.
 * @param {string} guildId - ID della guild (server principale)
 * @param {string[]} memberIds - array di user ID attualmente nel server
 * @param {{ dryRun?: boolean, includeUserScoped?: boolean }} options - dryRun: true solo conta, false esegue deleteMany
 * @returns {{ total: number, details: Array<{ name: string, count: number }> }}
 */
async function runCleanupUsersNotInServer(guildId, memberIds, { dryRun = false, includeUserScoped = true } = {}) {
  let total = 0;
  const details = [];

  for (const [Model, name] of guildScoped) {
    if (!Model?.countDocuments) continue;
    const filterGuild = { guildId: String(guildId), userId: { $nin: memberIds } };
    
    if (name === "ActivityUserProfile") {
      filterGuild.$or = [
        { moderation: { $exists: false } },
        { moderation: { $size: 0 } },
      ];
    }
    
    const n = dryRun
      ? await Model.countDocuments(filterGuild).catch(() => 0)
      : (await Model.deleteMany(filterGuild).catch(() => ({ deletedCount: 0 })))?.deletedCount ?? 0;
    if (n > 0) {
      total += n;
      details.push({ name, count: n });
    }
  }
  if (includeUserScoped) {
    const n = await clearGlobalAutomodBadUserForUsersNotIn(memberIds, dryRun);
    if (n > 0) {
      total += n;
      details.push({ name: `ActivityUserProfile.${automodBadUser()}(${ACTIVITY_MAIN_GUILD_ID})`, count: n });
    }
  }
  return { total, details };
}

async function runCleanupUserScopedNotInAnyServer(memberIds, { dryRun = false } = {}) {
  const keep = Array.from(new Set((Array.isArray(memberIds) ? memberIds : []).map((id) => String(id).trim()).filter(Boolean)));
  const n = await clearGlobalAutomodBadUserForUsersNotIn(keep, dryRun);
  const total = n;
  const details = n > 0 ? [{ name: `ActivityUserProfile.${automodBadUser()}(${ACTIVITY_MAIN_GUILD_ID})`, count: n }] : [];
  return { total, details };
}

module.exports = { runCleanupUsersNotInServer, runCleanupUserScopedNotInAnyServer };