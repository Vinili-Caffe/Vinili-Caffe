/**
 * Pulizia DB: rimuove documenti di utenti che non sono più nel server (guildId).
 * Usato all'avvio del bot (ready) e dallo script scripts/cleanup-db-users-not-in-server.js.
 * Non connette a MongoDB: il chiamante deve aver già mongoose connesso.
 */
const {
  ExpUser,
  ActivityUser,
  ActivityDaily,
  ActivityHourly,
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
const RolePersist = require("../../Schemas/Moderation/rolePersistSchema");
const TemporaryRoleGrant = require("../../Schemas/Moderation/temporaryRoleGrantSchema");
const TemporaryCommandPermission = require("../../Schemas/Moderation/temporaryCommandPermissionSchema");
const SupporterStatus = require("../../Schemas/Supporter/supporterStatusSchema");
const VoiceDisconnectCounter = require("../../Schemas/Voice/voiceDisconnectCounterSchema");
const Staff = require("../../Schemas/Staff/staffSchema");
const SuspiciousAccount = require("../../Schemas/Moderation/suspiciousAccountSchema");
const BumpVoteReward = require("../../Schemas/Bump/bumpVoteRewardSchema");
const { DiscadiaVoter } = require("../../Schemas/Discadia/discadiaSchemas");
const OneTimeReminder = require("../../Schemas/Reminders/oneTimeReminderSchema");
const AutoModBadUser = require("../../Schemas/Moderation/autoModBadUserSchema");

const guildScoped = [
  [ExpUser, "ExpUser"],
  [ActivityUser, "ActivityUser"],
  [ActivityDaily, "ActivityDaily"],
  [ActivityHourly, "ActivityHourly"],
  [LevelHistoryUser, "LevelHistoryUser"],
  [MinigameUser, "MinigameUser"],
  [AFK, "AFK"],
  [MentionReaction, "MentionReaction"],
  [RolePersist, "RolePersist"],
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
  [AutoModBadUser, "AutoModBadUser"],
];

/**
 * Elimina (o conta in dryRun) i documenti di utenti non presenti in memberIds per la guild indicata.
 * @param {string} guildId - ID della guild (server principale)
 * @param {string[]} memberIds - array di user ID attualmente nel server
 * @param {{ dryRun?: boolean }} options - dryRun: true solo conta, false esegue deleteMany
 * @returns {{ total: number, details: Array<{ name: string, count: number }> }}
 */
async function runCleanupUsersNotInServer(guildId, memberIds, { dryRun = false } = {}) {
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

module.exports = { runCleanupUsersNotInServer };