/** Ingresso membri: ruoli rimessi a chi rientra (voto Discadia, ruolo personalizzato, anzianità). */
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile, CustomRole } = require("../Community/schemas/communitySchemas") as typeof import("../Community/schemas/communitySchemas");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { hasEventWeekWinnerGrant } = require("../Community/services/weekWinnerGrantsService") as typeof import("../Community/services/weekWinnerGrantsService");
const { hasExtraCustomPerksUnlock } = require("../Community/utils/customPerksUnlock") as typeof import("../Community/utils/customPerksUnlock");
const { addRolesAndGetMember, getGuildRoleCached } = require("../../shared/discord/interactionEntityCache") as typeof import("../../shared/discord/interactionEntityCache");
const { isAlreadyVerifiedInThisGuild } = require("../Community/utils/verifyUtils") as typeof import("../Community/utils/verifyUtils");
const { upsertVerifiedMember, applyTenureForMember } = require("../Community/services/communityOpsService") as typeof import("../Community/services/communityOpsService");
const { resolveVoteRoleIdForGuild } = require("../Community/utils/resolveVoteRoleId") as typeof import("../Community/utils/resolveVoteRoleId");

const VOTE_ROLE_ID = IDs.roles.Voter;
const DISCADIA_VOTE_ROOT = "profile.totals.exp.bumpVoteRewards.discadia_vote";
const VOTE_ROLE_EXPIRES_AT_PATH = `${DISCADIA_VOTE_ROOT}.voteRole.expiresAt`;
const VOTE_RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;
const CUSTOM_ROLE_REQUIRED_ROLE_IDS = [IDs.roles.VIP, IDs.roles.ServerBooster, IDs.roles.DoubleBooster, IDs.roles.Level50].filter(Boolean);

function isCustomRoleDocActive(doc?) {
  const expiresAt = doc?.expiresAt ? new Date(doc.expiresAt) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return true;
  return expiresAt.getTime() > Date.now();
}

async function restoreDiscadiaVoteRoleOnRejoin(member?) {
  if (!member?.guild || !member?.id) return;
  const guildId = String(member.guild.id);
  if (String(guildId) !== String(IDs.guilds.main || "")) return;
  try {
    const { memberIsInMuteMirrorState, shouldDeferRoleRestoreForMuteMirror } = require("../Moderation/services/mutedMirrorRoleService") as typeof import("../Moderation/services/mutedMirrorRoleService");
    if (memberIsInMuteMirrorState(member)) return;
    if (await shouldDeferRoleRestoreForMuteMirror(member).catch(() => false)) return;
  } catch (_) {}

  const doc = await ActivityUserProfile.findOne({ guildId, userId: String(member.id) })
    .select(VOTE_ROLE_EXPIRES_AT_PATH)
    .lean()
    .catch(() => null);
  const expiresAtRaw = doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote?.voteRole?.expiresAt || null;
  if (!expiresAtRaw) return;

  const expiresAt = new Date(expiresAtRaw);
  if (Number.isNaN(expiresAt.getTime())) return;
  const now = Date.now();
  const expiresAtMs = expiresAt.getTime();
  if (expiresAtMs <= now) return;
  if (expiresAtMs - now > VOTE_RESTORE_WINDOW_MS) return;
  const resolvedVoteRoleId = (await resolveVoteRoleIdForGuild(member.guild).catch(() => "")) || VOTE_ROLE_ID;
  if (!resolvedVoteRoleId) return;
  if (member.roles.cache.has(resolvedVoteRoleId)) return;

  const me = member.guild.members.me;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles)) return;
  const role = await getGuildRoleCached(member.guild, resolvedVoteRoleId);
  if (!role) return;
  if (role.position >= me.roles.highest.position) return;

  const refreshed = await addRolesAndGetMember(member.guild, member.id, [resolvedVoteRoleId]).catch(() => null);
  if (!refreshed?.roles?.cache?.has?.(resolvedVoteRoleId)) return;
}

async function restoreCustomRoleOnRejoin(member?) {
  if (!member?.guild || !member?.id) return;
  try {
    const { memberIsInMuteMirrorState, shouldDeferRoleRestoreForMuteMirror } = require("../Moderation/services/mutedMirrorRoleService") as typeof import("../Moderation/services/mutedMirrorRoleService");
    if (memberIsInMuteMirrorState(member)) return;
    if (await shouldDeferRoleRestoreForMuteMirror(member).catch(() => false)) return;
  } catch (_) {}
  const guildId = String(member.guild.id);
  const userId = String(member.id);
  const doc = await CustomRole.findOne({ guildId, userId }).lean().catch(() => null);
  const roleId = String(doc?.roleId || "");
  if (!roleId) return;
  if (!isCustomRoleDocActive(doc)) return;
  if (member.roles.cache.has(roleId)) return;

  const role = await getGuildRoleCached(member.guild, roleId);
  if (!role) return;
  const me = member.guild.members.me;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles)) return;
  if (role.position >= me.roles.highest.position) return;

  const hasRequiredRole = CUSTOM_ROLE_REQUIRED_ROLE_IDS.some((requiredRoleId?) => member.roles.cache.has(requiredRoleId));
  const hasEventWeek2Grant = await hasEventWeekWinnerGrant(guildId, userId, 2).catch(() => false);
  const hasEventWeek3Grant = await hasEventWeekWinnerGrant(guildId, userId, 3).catch(() => false);
  const hasContestExtraUnlock = await hasExtraCustomPerksUnlock(guildId, userId).catch(() => false);
  if (!hasRequiredRole && !hasEventWeek2Grant && !hasEventWeek3Grant && !hasContestExtraUnlock) return;

  const refreshed = await addRolesAndGetMember(member.guild, member.id, [roleId]).catch(() => null);
  if (!refreshed?.roles?.cache?.has?.(roleId)) return;
  if (doc?.customRoleEligibilityLostAt) {
    await CustomRole.updateOne(
      { guildId, userId },
      { $set: { customRoleEligibilityLostAt: null } },
    ).catch(() => {});
  }
}

function memberHasAnyTenureRole(member?) {
  const ids = [IDs.roles?.NuovoUtente, IDs.roles?.Veterano, IDs.roles?.OG].filter(Boolean);
  return ids.some((id?) => Boolean(id && member?.roles?.cache?.has?.(String(id))));
}

async function maybeApplyVerificationTenureOnJoin(member?) {
  if (!member?.guild || member.user?.bot) return;
  const guild = member.guild;
  if (!isAlreadyVerifiedInThisGuild(member, guild.id)) return;
  try {
    const { shouldDeferRoleRestoreForMuteMirror, memberIsInMuteMirrorState } = require("../Moderation/services/mutedMirrorRoleService") as typeof import("../Moderation/services/mutedMirrorRoleService");
    if (memberIsInMuteMirrorState(member)) return;
    if (await shouldDeferRoleRestoreForMuteMirror(member).catch(() => false)) return;
    const record = await upsertVerifiedMember(guild.id, member.id, new Date());
    await applyTenureForMember(member, record);
  } catch (err) {
    global.logger?.warn?.("[guildMemberAdd] verification tenure on join:", err?.message || err);
  }
}

export = { restoreDiscadiaVoteRoleOnRejoin, restoreCustomRoleOnRejoin, memberHasAnyTenureRole, maybeApplyVerificationTenureOnJoin };
