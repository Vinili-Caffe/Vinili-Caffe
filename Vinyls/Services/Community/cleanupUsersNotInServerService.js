const {
  ActivityUserProfile,
  InviteReminderState,
  CustomRole,
  AvatarPrivacy,
  BannerPrivacy,
  QuotePrivacy,
} = require("../../Schemas/Community/communitySchemas");
const VoiceDisconnectCounter = require("../../Schemas/Voice/voiceDisconnectCounterSchema");
const Staff = require("../../Schemas/Staff/staffSchema");
const SuspiciousAccount = require("../../Schemas/Moderation/suspiciousAccountSchema");
const AutoModBadUser = require("../../Schemas/Moderation/autoModBadUserSchema");

const guildScoped = [
  [ActivityUserProfile, "ActivityUserProfile"],
  [VoiceDisconnectCounter, "VoiceDisconnectCounter"],
  [Staff, "Staff"],
  [SuspiciousAccount, "SuspiciousAccount"],
  [InviteReminderState, "InviteReminderState"],
  [CustomRole, "CustomRole"],
  [AvatarPrivacy, "AvatarPrivacy"],
  [BannerPrivacy, "BannerPrivacy"],
  [QuotePrivacy, "QuotePrivacy"],
];
const userScoped = [
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