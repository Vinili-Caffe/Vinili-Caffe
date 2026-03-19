const {
  ExpUser,
  ActivityUser,
  ActivityDaily,
  ActivityDailyCompact,
  ActivityHourly,
  ActivityHourlyCompact,
  ActivityUserProfile,
  LevelHistoryUser,
  VoteRole,
  VerificationTenure,
  InviteReminderState,
  ActivityEventReward,
  EventUserExpSnapshot,
  EventWeekWinner,
  StaffEventPoints,
  StaffEventWeeklyReward,
  StaffEventRewardGiven,
  CustomRole,
  AvatarPrivacy,
  BannerPrivacy,
  QuotePrivacy,
  InviteTrack,
} = require("../../Schemas/Community/communitySchemas");
const BirthdayProfile = require("../../Schemas/Community/birthdayProfileSchema");
const NoDmPreference = require("../../Schemas/Community/noDmPreferenceSchema");
const { MinigameUser } = require("../../Schemas/Minigames/minigameSchema");
const AFK = require("../../Schemas/Afk/afkSchema");
const { MentionReaction } = require("../../Schemas/Community/autoInteractionSchemas");
const { RolePersistUser } = require("../../Schemas/Moderation/rolePersistSchema");
const TemporaryRoleGrant = require("../../Schemas/Moderation/temporaryRoleGrantSchema");
const TemporaryCommandPermission = require("../../Schemas/Moderation/temporaryCommandPermissionSchema");
const SupporterStatus = require("../../Schemas/Supporter/supporterStatusSchema");
const VoiceDisconnectCounter = require("../../Schemas/Voice/voiceDisconnectCounterSchema");
const Staff = require("../../Schemas/Staff/staffSchema");
const SuspiciousAccount = require("../../Schemas/Moderation/suspiciousAccountSchema");
const BumpVoteReward = require("../../Schemas/Bump/bumpVoteRewardSchema");
const { DiscadiaVoter } = require("../../Schemas/Discadia/discadiaSchemas");
const OneTimeReminder = require("../../Schemas/Reminders/oneTimeReminderSchema");
const OneTimeReminderUser = require("../../Schemas/Reminders/oneTimeReminderUserSchema");
const AutoModBadUser = require("../../Schemas/Moderation/autoModBadUserSchema");

const ACTIVITY_DAILY_STORAGE_MODE_CLEANUP = String(process.env.ACTIVITY_DAILY_STORAGE_MODE || "dual").trim().toLowerCase();
const ACTIVITY_HOURLY_STORAGE_MODE_CLEANUP = String(process.env.ACTIVITY_HOURLY_STORAGE_MODE || "dual").trim().toLowerCase();
const includeLegacyActivityDaily = ACTIVITY_DAILY_STORAGE_MODE_CLEANUP === "legacy" || ACTIVITY_DAILY_STORAGE_MODE_CLEANUP === "dual";
const includeLegacyActivityHourly = ACTIVITY_HOURLY_STORAGE_MODE_CLEANUP === "legacy" || ACTIVITY_HOURLY_STORAGE_MODE_CLEANUP === "dual";

const guildScoped = [
  [ExpUser, "ExpUser"],
  [ActivityUser, "ActivityUser"],
  [ActivityUserProfile, "ActivityUserProfile"],
  ...(includeLegacyActivityDaily ? [[ActivityDaily, "ActivityDaily"]] : []),
  ...(includeLegacyActivityHourly ? [[ActivityHourly, "ActivityHourly"]] : []),
  [LevelHistoryUser, "LevelHistoryUser"],
  [MinigameUser, "MinigameUser"],
  [AFK, "AFK"],
  [MentionReaction, "MentionReaction"],
  [RolePersistUser, "RolePersistUser"],
  [TemporaryRoleGrant, "TemporaryRoleGrant"],
  [TemporaryCommandPermission, "TemporaryCommandPermission"],
  [SupporterStatus, "SupporterStatus"],
  [VoiceDisconnectCounter, "VoiceDisconnectCounter"],
  [Staff, "Staff"],
  [SuspiciousAccount, "SuspiciousAccount"],
  [BirthdayProfile, "BirthdayProfile"],
  [NoDmPreference, "NoDmPreference"],
  [BumpVoteReward, "BumpVoteReward"],
  [DiscadiaVoter, "DiscadiaVoter"],
  [VoteRole, "VoteRole"],
  [VerificationTenure, "VerificationTenure"],
  [InviteReminderState, "InviteReminderState"],
  [ActivityEventReward, "ActivityEventReward"],
  [EventUserExpSnapshot, "EventUserExpSnapshot"],
  [EventWeekWinner, "EventWeekWinner"],
  [StaffEventPoints, "StaffEventPoints"],
  [StaffEventWeeklyReward, "StaffEventWeeklyReward"],
  [StaffEventRewardGiven, "StaffEventRewardGiven"],
  [CustomRole, "CustomRole"],
  [AvatarPrivacy, "AvatarPrivacy"],
  [BannerPrivacy, "BannerPrivacy"],
  [QuotePrivacy, "QuotePrivacy"],
  [InviteTrack, "InviteTrack"],
];
const userScoped = [
  [OneTimeReminder, "OneTimeReminder"],
  [OneTimeReminderUser, "OneTimeReminderUser"],
  [AutoModBadUser, "AutoModBadUser"],
];

/**
 * Elimina (o conta in dryRun) i documenti di utenti non presenti in memberIds per la guild indicata.
 * @param {string} guildId - ID della guild (server principale)
 * @param {string[]} memberIds - array di user ID attualmente nel server
 * @param {{ dryRun?: boolean, includeUserScoped?: boolean }} options - dryRun: true solo conta, false esegue deleteMany
 * @returns {{ total: number, details: Array<{ name: string, count: number }> }}
 */
async function runCleanupUsersNotInServer(guildId, memberIds, { dryRun = false, includeUserScoped = true } = {}) {
  const filterGuild = { guildId: String(guildId), userId: { $nin: memberIds } };
  const filterUser = { userId: { $nin: memberIds } };
  let total = 0;
  const details = [];

  for (const [Model, name] of guildScoped) {
    if (!Model?.countDocuments) continue;
    const n = dryRun
      ? await Model.countDocuments(filterGuild).catch(() => 0)
      : (await Model.deleteMany(filterGuild).catch(() => ({ deletedCount: 0 })))?.deletedCount ?? 0;
    if (n > 0) {
      total += n;
      details.push({ name, count: n });
    }
  }
  const compactMatch = await ActivityDailyCompact.find({ guildId: String(guildId) })
    .select("users")
    .lean()
    .catch(() => []);
  let compactStaleUsers = 0;
  const staleByDateKey = new Map();
  const keep = new Set((memberIds || []).map(String));
  for (const row of compactMatch) {
    const users = row?.users && typeof row.users === "object" ? row.users : {};
    const staleUserIds = Object.keys(users).filter((id) => id && !keep.has(String(id)));
    if (!staleUserIds.length) continue;
    compactStaleUsers += staleUserIds.length;
    staleByDateKey.set(String(row.dateKey || ""), staleUserIds);
  }
  if (compactStaleUsers > 0) {
    if (!dryRun) {
      for (const [dateKey, staleUserIds] of staleByDateKey.entries()) {
        const unset = {};
        for (const userId of staleUserIds) unset[`users.${userId}`] = 1;
        await ActivityDailyCompact.updateOne(
          { guildId: String(guildId), dateKey: String(dateKey) },
          { $unset: unset },
        ).catch(() => ({ modifiedCount: 0 }));
      }
    }
    total += compactStaleUsers;
    details.push({ name: "ActivityDailyCompact(users)", count: compactStaleUsers });
  }
  const compactHourlyRows = await ActivityHourlyCompact.find({ guildId: String(guildId) })
    .select("hourKey users")
    .lean()
    .catch(() => []);
  let compactHourlyStaleUsers = 0;
  const staleHourlyByKey = new Map();
  for (const row of compactHourlyRows) {
    const users = row?.users && typeof row.users === "object" ? row.users : {};
    const staleUserIds = Object.keys(users).filter((id) => id && !keep.has(String(id)));
    if (!staleUserIds.length) continue;
    compactHourlyStaleUsers += staleUserIds.length;
    staleHourlyByKey.set(String(row.hourKey || ""), staleUserIds);
  }
  if (compactHourlyStaleUsers > 0) {
    if (!dryRun) {
      for (const [hourKey, staleUserIds] of staleHourlyByKey.entries()) {
        const unset = {};
        for (const userId of staleUserIds) unset[`users.${userId}`] = 1;
        await ActivityHourlyCompact.updateOne(
          { guildId: String(guildId), hourKey: String(hourKey) },
          { $unset: unset },
        ).catch(() => ({ modifiedCount: 0 }));
      }
    }
    total += compactHourlyStaleUsers;
    details.push({ name: "ActivityHourlyCompact(users)", count: compactHourlyStaleUsers });
  }
  if (includeUserScoped) {
    for (const [Model, name] of userScoped) {
      if (!Model?.countDocuments) continue;
      const n = dryRun
        ? await Model.countDocuments(filterUser).catch(() => 0)
        : (await Model.deleteMany(filterUser).catch(() => ({ deletedCount: 0 })))?.deletedCount ?? 0;
      if (n > 0) {
        total += n;
        details.push({ name, count: n });
      }
    }
  }
  return { total, details };
}

async function runCleanupUserScopedNotInAnyServer(memberIds, { dryRun = false } = {}) {
  const keep = Array.from(new Set((Array.isArray(memberIds) ? memberIds : []).map((id) => String(id).trim()).filter(Boolean)));
  const filterUser = { userId: { $nin: keep } };
  let total = 0;
  const details = [];
  for (const [Model, name] of userScoped) {
    if (!Model?.countDocuments) continue;
    const n = dryRun
      ? await Model.countDocuments(filterUser).catch(() => 0)
      : (await Model.deleteMany(filterUser).catch(() => ({ deletedCount: 0 })))?.deletedCount ?? 0;
    if (n > 0) {
      total += n;
      details.push({ name, count: n });
    }
  }
  return { total, details };
}

module.exports = { runCleanupUsersNotInServer, runCleanupUserScopedNotInAnyServer };