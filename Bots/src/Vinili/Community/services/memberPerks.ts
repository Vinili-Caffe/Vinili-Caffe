/** Aggiornamento membri: ruoli perk, colori, storico staff, vocale e ruolo personalizzati. */
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { ensureStaff } = require("../../Staff/utils/staffDocUtils") as typeof import("../../Staff/utils/staffDocUtils");
const { ActivityUserProfile, CustomRole } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const { hasEventWeekWinnerGrant } = require("./weekWinnerGrantsService") as typeof import("./weekWinnerGrantsService");
const { hasExtraCustomPerksUnlock } = require("../utils/customPerksUnlock") as typeof import("../utils/customPerksUnlock");
const { getCustomRoleSlotCapFromRoles, getCustomRoleSlotCapWithContest } = require("../utils/customRoleSlots") as typeof import("../utils/customRoleSlots");
const { fetchPartnerManagerTimedPerkLean, partnerManagerCustomBundleActiveFromLean } = require("../../Staff/utils/partnerManagerTimedPerks") as typeof import("../../Staff/utils/partnerManagerTimedPerks");
const { wasRoleRestoredByMuteMirror } = require("../../Moderation/utils/muteRestoreAnnounceSuppress") as typeof import("../../Moderation/utils/muteRestoreAnnounceSuppress");

const PERK_ROLE_ID = IDs.roles.PicPerms;
const CUSTOM_ROLE_VOC_ELIGIBLE_ROLE_IDS = [IDs.roles.VIP, IDs.roles.DoubleBooster, IDs.roles.Level50, IDs.roles.Level70, IDs.roles.Donator, IDs.roles.vip, IDs.roles.VIPplus].filter(Boolean);
const STAFF_HISTORY_ROLES = [IDs.roles.PartnerManager, IDs.roles.Staff, IDs.roles.Helper, IDs.roles.Mod, IDs.roles.SeniorModerator, IDs.roles.HighStaff, IDs.roles.Director, IDs.roles.Admin, IDs.roles.Manager, IDs.roles.Founder,];
const PLUS_COLOR_ROLE_IDS = [IDs.roles.redPlus, IDs.roles.orangePlus, IDs.roles.yellowPlus, IDs.roles.greenPlus, IDs.roles.bluePlus, IDs.roles.purplePlus, IDs.roles.pinkPlus, IDs.roles.blackPlus, IDs.roles.grayPlus, IDs.roles.whitePlus, IDs.roles.brownPlus, IDs.roles.orangeBlackPlus, IDs.roles.greenBlackPlus, IDs.roles.aquaBlackPlus,];

function highestTrackedStaffRole(member?) {
  if (!member?.roles?.cache) return "";
  for (const roleId of STAFF_HISTORY_ROLES) {
    if (member.roles.cache.has(roleId)) return roleId;
  }
  return "";
}

function listStaffRolesAdded(oldMember?, newMember?) {
  const added = [];
  for (const roleId of STAFF_HISTORY_ROLES) {
    const id = String(roleId || "").trim();
    if (!id) continue;
    if (newMember?.roles?.cache?.has?.(id) && !oldMember?.roles?.cache?.has?.(id)) {
      added.push(id);
    }
  }
  const { STAFF_LIST_SECTION_ROLE_IDS } = require("../utils/staffListUtils") as typeof import("../utils/staffListUtils");
  const listSet = new Set(STAFF_LIST_SECTION_ROLE_IDS.map(String));
  return added.sort((a?, b?) => {
    const aListed = listSet.has(a) ? 0 : 1;
    const bListed = listSet.has(b) ? 0 : 1;
    return aListed - bListed;
  });
}

async function recordManualStaffRoleHistoryIfNeeded(oldMember?, newMember?) {
  const guildId = String(newMember?.guild?.id || "").trim();
  if (!guildId || guildId !== String(IDs.guilds?.main || "")) return;
  if (newMember?.user?.bot) return;
  const { isSocialRoleAnnounceGloballySuppressed } = require("../../Moderation/utils/muteRestoreAnnounceSuppress") as typeof import("../../Moderation/utils/muteRestoreAnnounceSuppress");
  if (isSocialRoleAnnounceGloballySuppressed()) return;
    const founderRoleId = String(IDs.roles?.Founder || "").trim();
  if (founderRoleId && newMember?.roles?.cache?.has?.(founderRoleId)) return;
  const addedRoleIds = listStaffRolesAdded(oldMember, newMember);
  if (!addedRoleIds.length) return;

  const beforeRoleId = highestTrackedStaffRole(oldMember) || String(IDs.roles?.Member || "").trim();
  const now = new Date();
  const profileDoc = await ActivityUserProfile.findOneAndUpdate(
    { guildId, userId: String(newMember.id) },
    { $setOnInsert: { guildId, userId: String(newMember.id) } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  const staff = ensureStaff(profileDoc);
  if (!profileDoc || !staff) return;
  if (!Array.isArray(staff.rolesHistory)) staff.rolesHistory = [];

  let changed = false;
  for (const addedRoleId of addedRoleIds) {
    if (wasRoleRestoredByMuteMirror(guildId, newMember.id, addedRoleId)) continue;
    // organicoPexReskip1: only skip near-duplicate adds (5m). Lifetime hadRoleBefore hid re-pex after depex.
    const hasRecentSameRole = staff.rolesHistory.some((row?) => {
      if (String(row?.newRole || "") !== String(addedRoleId)) return false;
      const when = row?.date ? new Date(row.date) : null;
      if (!when || Number.isNaN(when.getTime())) return false;
      return Math.abs(now.getTime() - when.getTime()) <= 5 * 60 * 1000;
    });
    if (hasRecentSameRole) continue;
    staff.rolesHistory.push({
      oldRole: beforeRoleId,
      newRole: addedRoleId,
      reason: "Ruolo staff aggiunto manualmente.",
      date: now,
      displayName: String(newMember.displayName || newMember.user?.globalName || newMember.user?.username || "").trim() || null,
      username: String(newMember.user?.username || "").trim() || null,
      avatarUrl:
        (typeof newMember.displayAvatarURL === "function"
          ? newMember.displayAvatarURL({ size: 128, extension: "png" })
          : "") || null,
    });
    changed = true;
  }
  if (!changed) return;
  profileDoc.markModified("staff");
  await profileDoc.save().catch((err?) => {
    global.logger?.warn?.("[guildMemberUpdate] manual staff rolesHistory save:", newMember.id, err?.message || err);
  });
}

function hasManageRolesPermission(member?) {
  const me = member.guild.members.me;
  return Boolean(me?.permissions?.has(PermissionsBitField.Flags.ManageRoles));
}

async function addPerkRoleIfPossible(member?) {
  if (!PERK_ROLE_ID) return;
  const me = member.guild.members.me;
  if (!me) return;
  if (!hasManageRolesPermission(member)) return;

  const role = member.guild.roles.cache.get(PERK_ROLE_ID);
  if (!role) return;
  if (role.position >= me.roles.highest.position) return;
  if (member.roles.cache.has(PERK_ROLE_ID)) return;

  const added = await member.roles.add(role).then(() => true).catch(() => false);
  if (added) return;
  const refreshedMember = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  if (!refreshedMember?.roles?.cache?.has(PERK_ROLE_ID)) {
    global.logger?.warn?.("[guildMemberUpdate] Failed to add perk role:", member.guild.id, member.id, PERK_ROLE_ID);
  }
}

async function removePlusColorsIfNotEligible(member?) {
  const me = member.guild.members.me;
  if (!me) return;
  if (!hasManageRolesPermission(member)) return;

  const unlocks = require("../utils/personalityColorUnlocks") as typeof import("../utils/personalityColorUnlocks");
  const canPickPlus = await unlocks.memberHasPlusColorFullEligibilityAsync(member);
  const level = await unlocks.fetchNumericProfileLevel(member.guild.id, member.id);
  /* i "& Black" sono colori di livello: restano a chi ha il livello anche senza Plus */
  const allowedPlus = new Set([
    ...unlocks.listUnlockedPlusRoleIds(member.guild, canPickPlus, level),
    ...unlocks.listUnlockedTierRoleIds(level),
  ]);

  const heldPlusRoles = PLUS_COLOR_ROLE_IDS.filter((roleId?) => member.roles.cache.has(roleId));
  const removableRoleIds = heldPlusRoles.filter((roleId?) => {
    if (allowedPlus.has(roleId)) return false;
    const role = member.guild.roles.cache.get(roleId);
    return role && role.position < me.roles.highest.position;
  });
  if (!removableRoleIds.length) return;

  const removed = await member.roles.remove(removableRoleIds).then(() => true).catch(() => false);
  if (removed) return;
  const refreshedMember = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  const stillHeldRoles = removableRoleIds.filter((roleId?) => refreshedMember?.roles?.cache?.has(roleId));
  if (stillHeldRoles.length) {
    global.logger?.warn?.("[guildMemberUpdate] Failed to remove plus color roles:", member.guild.id, member.id, stillHeldRoles);
  }
}

async function ensureCustomVocAccess(newMember?) {
  const guild = newMember?.guild;
  if (!guild || !newMember?.id) return;
  const me = guild.members?.me;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels)) return;

  const { syncCustomVocChannelForOwner } = require("./customVocPermissionsService") as typeof import("./customVocPermissionsService");
  await syncCustomVocChannelForOwner(guild, newMember.id).catch(() => {});
}

async function syncCustomVocEligibilityWindow(newMember?) {
  const guild = newMember?.guild;
  if (!guild || !newMember?.id) return;
  const guildId = String(guild.id);
  const userId = String(newMember.id);

  const doc = await CustomRole.findOne({ guildId, userId }).lean().catch(() => null);
  if (!doc?.customVocChannelId) return;

  const hasRequiredRole = CUSTOM_ROLE_VOC_ELIGIBLE_ROLE_IDS.some((roleId?) => newMember.roles.cache.has(roleId));
  const hasEventWeek2Grant = await hasEventWeekWinnerGrant(guildId, userId, 2).catch(() => false);
  const hasEventWeek3Grant = await hasEventWeekWinnerGrant(guildId, userId, 3).catch(() => false);
  const hasContestExtraUnlock = await hasExtraCustomPerksUnlock(guildId, userId).catch(() => false);
  const eligible = hasRequiredRole || hasEventWeek2Grant || hasEventWeek3Grant || hasContestExtraUnlock;

  if (eligible) {
    if (doc.customVocEligibilityLostAt) {
      await CustomRole.updateOne(
        { guildId, userId },
        { $set: { customVocEligibilityLostAt: null } },
      ).catch(() => { });
    }
    return;
  }

  if (!doc.customVocEligibilityLostAt) {
    await CustomRole.updateOne(
      { guildId, userId },
      { $set: { customVocEligibilityLostAt: new Date() } },
    ).catch(() => { });
  }
}

async function resolveCustomRolePrimarySlotUnlock(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return false;
  const [hasExtraUnlock, eventWeek2Grant, eventWeek3Grant, pmPerkLean] = await Promise.all([
    hasExtraCustomPerksUnlock(gid, uid).catch(() => false),
    hasEventWeekWinnerGrant(gid, uid, 2).catch(() => false),
    hasEventWeekWinnerGrant(gid, uid, 3).catch(() => false),
    fetchPartnerManagerTimedPerkLean(gid, uid).catch(() => null),
  ]);
  return Boolean(
    hasExtraUnlock || eventWeek2Grant || eventWeek3Grant || partnerManagerCustomBundleActiveFromLean(pmPerkLean),
  );
}

async function stripSecondaryCustomRoleIfNeeded(guild?, userId?, secondaryRoleId?) {
  const rid = String(secondaryRoleId || "").trim();
  const uid = String(userId || "").trim();
  if (!guild || !rid || !uid) return;
  const role = guild.roles.cache.get(rid) || (await guild.roles.fetch(rid).catch(() => null));
  if (role) {
    await role.delete(`Secondary custom role removed: slot cap < 2 for user ${uid}`).catch(() => {});
  }
  await CustomRole.updateOne(
    { guildId: String(guild.id), userId: uid },
    { $set: { secondaryRoleId: null } },
  ).catch(() => {});
}

async function syncCustomRoleEligibilityWindow(newMember?) {
  const guild = newMember?.guild;
  if (!guild || !newMember?.id) return;
  const guildId = String(guild.id);
  const userId = String(newMember.id);

  const doc = await CustomRole.findOne({ guildId, userId }).lean().catch(() => null);
  if (!doc?.roleId && !doc?.secondaryRoleId) return;

  /* Stessa regola di Personalizza / createCustomRole (non la lista VOC Level70/Donator). */
  const primarySlotUnlock = await resolveCustomRolePrimarySlotUnlock(guildId, userId);
  const slotCap = getCustomRoleSlotCapWithContest(newMember, primarySlotUnlock);
  const roleSlotCap = getCustomRoleSlotCapFromRoles(newMember);
  const eligible = slotCap >= 1;

  if (doc.secondaryRoleId && roleSlotCap < 2) {
    await stripSecondaryCustomRoleIfNeeded(guild, userId, doc.secondaryRoleId);
  }

  if (eligible) {
    if (doc.customRoleEligibilityLostAt) {
      await CustomRole.updateOne(
        { guildId, userId },
        { $set: { customRoleEligibilityLostAt: null } },
      ).catch(() => { });
    }
    return;
  }

  if (!doc.customRoleEligibilityLostAt) {
    await CustomRole.updateOne(
      { guildId, userId },
      { $set: { customRoleEligibilityLostAt: new Date() } },
    ).catch(() => { });
  }
}

export = { recordManualStaffRoleHistoryIfNeeded, addPerkRoleIfPossible, removePlusColorsIfNotEligible, ensureCustomVocAccess, syncCustomVocEligibilityWindow, syncCustomRoleEligibilityWindow };
