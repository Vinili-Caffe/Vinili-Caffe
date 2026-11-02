/** Mute: ruoli del profilo rimessi dopo (personalizzati, minigiochi). */
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile, CustomRole } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { addRolesAndGetMember, getGuildRoleCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { getUserExpStats, syncLevelRolesForMember } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
const { applyTenureForMember } = require("../../Services/Community/communityOpsService") as typeof import("../../Services/Community/communityOpsService");
const { applyZodiacRoleFromBirthday } = require("../../Utils/Community/zodiacRoles") as typeof import("../../Utils/Community/zodiacRoles");
const { applyAgeBracketRoleFromBirthday } = require("../../Utils/Community/ageBracketRoles") as typeof import("../../Utils/Community/ageBracketRoles");
const { restorePersistedPersonalityRoles } = require("../../Utils/Community/personalityRolePersistence") as typeof import("../../Utils/Community/personalityRolePersistence");
const { registerMuteMirrorRestoreRoleSuppress } = require("../utils/muteRestoreAnnounceSuppress") as typeof import("../utils/muteRestoreAnnounceSuppress");
const { syncClanTagRolesForUserEverywhereAfterMemberEvent } = require("../../Services/Community/clanTagRoleService") as typeof import("../../Services/Community/clanTagRoleService");
const { hasEventWeekWinnerGrant } = require("../../Services/Community/weekWinnerGrantsService") as typeof import("../../Services/Community/weekWinnerGrantsService");
const { hasExtraCustomPerksUnlock } = require("../../Utils/Community/customPerksUnlock") as typeof import("../../Utils/Community/customPerksUnlock");
const { resolveGuildBotMember } = require("./muteRoleRest") as typeof import("./muteRoleRest");

const CUSTOM_ROLE_REQUIRED_ROLE_IDS = [IDs.roles.VIP, IDs.roles.ServerBooster, IDs.roles.DoubleBooster, IDs.roles.Level50].filter(Boolean);

function isCustomRoleDocActive(doc?) {
  if (!doc) return false;
  const expiresAt = doc?.expiresAt ? new Date(doc.expiresAt).getTime() : 0;
  if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= Date.now()) return false;
  return Boolean(String(doc?.roleId || "").trim());
}

async function restoreCustomRoleIfEligible(member?) {
  if (!member?.guild?.id || !member?.id) return { ok: false, added: [] };
  const guildId = String(member.guild.id);
  const userId = String(member.id);
  const doc = await CustomRole.findOne({ guildId, userId }).lean().catch(() => null);
  const roleId = String(doc?.roleId || "").trim();
  if (!roleId || !isCustomRoleDocActive(doc)) return { ok: true, added: [] };
  if (member.roles.cache.has(roleId)) return { ok: true, added: [] };

  const role = await getGuildRoleCached(member.guild, roleId);
  const me = await resolveGuildBotMember(member.guild);
  if (!role || !me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return { ok: false, added: [] };
  if (role.position >= me.roles.highest.position) return { ok: false, added: [] };

  const hasRequiredRole = CUSTOM_ROLE_REQUIRED_ROLE_IDS.some((rid?) => member.roles.cache.has(rid));
  const hasEventWeek2Grant = await hasEventWeekWinnerGrant(guildId, userId, 2).catch(() => false);
  const hasEventWeek3Grant = await hasEventWeekWinnerGrant(guildId, userId, 3).catch(() => false);
  const hasContestExtraUnlock = await hasExtraCustomPerksUnlock(guildId, userId).catch(() => false);
  if (!hasRequiredRole && !hasEventWeek2Grant && !hasEventWeek3Grant && !hasContestExtraUnlock) {
    return { ok: true, skipped: true, added: [] };
  }

  const refreshed = await addRolesAndGetMember(member.guild, userId, [roleId]).catch(() => null);
  if (!refreshed?.roles?.cache?.has(roleId)) return { ok: false, added: [] };
  return { ok: true, added: [roleId] };
}

async function restoreSecondaryCustomRoleIfEligible(member?) {
  if (!member?.guild?.id || !member?.id) return { ok: false, added: [] };
  const guildId = String(member.guild.id);
  const userId = String(member.id);
  const doc = await CustomRole.findOne({ guildId, userId }).lean().catch(() => null);
  const roleId = String(doc?.secondaryRoleId || "").trim();
  if (!roleId || !isCustomRoleDocActive(doc)) return { ok: true, added: [] };
  if (member.roles.cache.has(roleId)) return { ok: true, added: [] };

  const role = await getGuildRoleCached(member.guild, roleId);
  const me = await resolveGuildBotMember(member.guild);
  if (!role || !me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return { ok: false, added: [] };
  if (role.position >= me.roles.highest.position) return { ok: false, added: [] };

  const hasRequiredRole = CUSTOM_ROLE_REQUIRED_ROLE_IDS.some((rid?) => member.roles.cache.has(rid));
  const hasEventWeek2Grant = await hasEventWeekWinnerGrant(guildId, userId, 2).catch(() => false);
  const hasEventWeek3Grant = await hasEventWeekWinnerGrant(guildId, userId, 3).catch(() => false);
  const hasContestExtraUnlock = await hasExtraCustomPerksUnlock(guildId, userId).catch(() => false);
  if (!hasRequiredRole && !hasEventWeek2Grant && !hasEventWeek3Grant && !hasContestExtraUnlock) {
    return { ok: true, skipped: true, added: [] };
  }

  const refreshed = await addRolesAndGetMember(member.guild, userId, [roleId]).catch(() => null);
  if (!refreshed?.roles?.cache?.has(roleId)) return { ok: false, added: [] };
  return { ok: true, added: [roleId] };
}

const MINIGAME_EXP_REWARD_TIERS = [
  [500, IDs.roles.Rookie],
  [1000, IDs.roles.Scout],
  [1500, IDs.roles.Explorer],
  [2500, IDs.roles.Tracker],
  [5000, IDs.roles.Achiever],
  [10000, IDs.roles.Vanguard],
  [50000, IDs.roles.Mentor],
  [100000, IDs.roles.Strategist],
].filter(([, rid]) => rid);

async function syncMinigameRewardRolesForMember(member?, totalExp?, reason = "Recupero ruoli minigame") {
  if (!member?.guild || member.user?.bot) return [];
  const expValue = Number(totalExp || 0);
  if (!Number.isFinite(expValue) || expValue <= 0) return [];
  const added = [];
  for (const [threshold, roleId] of MINIGAME_EXP_REWARD_TIERS) {
    const rid = String(roleId || "").trim();
    if (!rid || expValue < threshold) continue;
    if (member.roles.cache.has(rid)) continue;
    const ok = await member.roles.add(rid, reason).then(() => true).catch(() => false);
    if (ok) added.push(rid);
  }
  return added;
}

async function resyncProfileDerivedRolesForMember(member?, client?, options: Record<string, any> = {}) {
  if (!member?.guild?.id || !member?.id) return { ok: false, reason: "invalid_member" };
  const guildId = String(member.guild.id);
  const userId = String(member.id);
  const reason = String(options.reason || "Recupero ruoli post-mute");
  const out = { levelRoles: [], tenure: false, zodiac: false, ageBracket: false, clanTag: false, customRole: [], secondaryCustomRole: [], personality: [], minigame: [] };

  const stats = await getUserExpStats(guildId, userId).catch(() => null);
  if (stats?.level != null) {
    out.levelRoles = await syncLevelRolesForMember(member.guild, userId, stats.level).catch(() => []);
  }

  const profileDoc = await ActivityUserProfile.findOne({ guildId, userId }).lean().catch(() => null);
  if (profileDoc) {
    await applyTenureForMember(member, profileDoc).catch(() => null);
    out.tenure = true;
    const bday = profileDoc?.profile?.birthday;
    if (bday?.month && bday?.day) {
      const z = await applyZodiacRoleFromBirthday(member.guild, userId, bday.month, bday.day).catch(() => null);
      out.zodiac = Boolean(z?.ok);
      if (bday?.birthYear) {
        const a = await applyAgeBracketRoleFromBirthday(member.guild, userId, bday.day, bday.month, bday.birthYear).catch(() => null);
        out.ageBracket = Boolean(a?.ok);
      }
    }
    const personality = await restorePersistedPersonalityRoles(member, { reason, profileDoc }).catch(() => ({ added: [] }));
    if (Array.isArray(personality?.added) && personality.added.length) {
      registerMuteMirrorRestoreRoleSuppress(guildId, userId, personality.added);
      out.personality = personality.added;
    }
    const minigameExp = Number(profileDoc?.profile?.totals?.exp?.minigame?.totalExp || 0);
    if (minigameExp > 0) {
      out.minigame = await syncMinigameRewardRolesForMember(member, minigameExp, reason).catch(() => []);
    }
  }

  if (client) {
    await syncClanTagRolesForUserEverywhereAfterMemberEvent(client, member.user).catch(() => null);
    out.clanTag = true;
  }

  const custom = await restoreCustomRoleIfEligible(member).catch(() => ({ added: [] }));
  out.customRole = Array.isArray(custom?.added) ? custom.added : [];
  const secondary = await restoreSecondaryCustomRoleIfEligible(member).catch(() => ({ added: [] }));
  out.secondaryCustomRole = Array.isArray(secondary?.added) ? secondary.added : [];

  if (!options.skipMutedRemove) {
    const mutedId = String(IDs.roles?.Muted || "").trim();
    if (mutedId && member.roles.cache.has(mutedId)) {
      await member.roles.remove(mutedId, reason).catch(() => null);
    }
  }

  return { ok: true, ...out };
}

export = { resyncProfileDerivedRolesForMember };
