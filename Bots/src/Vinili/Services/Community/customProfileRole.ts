"use strict";

/** Custom profile: creazione, delete, rename e membri del ruolo custom. */
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { CustomRole } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { resolveCustomRoleState } = require("../../Utils/Community/customRoleState") as typeof import("../../Utils/Community/customRoleState");
const { getCustomRoleSlotCapFromRoles, getCustomRoleSlotCapWithContest } = require("../../Utils/Community/customRoleSlots") as typeof import("../../Utils/Community/customRoleSlots");
const { hasExtraCustomPerksUnlock } = require("../../Utils/Community/customPerksUnlock") as typeof import("../../Utils/Community/customPerksUnlock");
const { hasEventWeekWinnerGrant } = require("./weekWinnerGrantsService") as typeof import("./weekWinnerGrantsService");
const { fetchPartnerManagerTimedPerkLean, partnerManagerCustomBundleActiveFromLean } = require("../../Utils/Staff/partnerManagerTimedPerks") as typeof import("../../Utils/Staff/partnerManagerTimedPerks");
const { accountUsername } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { ANCHOR_ROLE_ID, okPersist, trimRoleName } = require("./customProfileShared") as typeof import("./customProfileShared");

async function createCustomRole({ client, guild, member, ownerId, slot = "primary" }) {
  if (!guild || !member) return { ok: false, reason: "server_missing" };
  const targetSlot = String(slot || "primary").toLowerCase() === "secondary" ? "secondary" : "primary";

  const [hasExtraUnlock, eventWeek2Grant, eventWeek3Grant, pmPerkLean] = await Promise.all([
    hasExtraCustomPerksUnlock(guild.id, ownerId),
    hasEventWeekWinnerGrant(guild.id, ownerId, 2).catch(() => false),
    hasEventWeekWinnerGrant(guild.id, ownerId, 3).catch(() => false),
    fetchPartnerManagerTimedPerkLean(guild.id, ownerId),
  ]);
  const primarySlotUnlock = hasExtraUnlock || eventWeek2Grant || eventWeek3Grant || partnerManagerCustomBundleActiveFromLean(pmPerkLean);

  if (targetSlot === "primary" && getCustomRoleSlotCapWithContest(member, primarySlotUnlock) < 1) {
    return { ok: false, reason: "missing_customrole_access" };
  }
  if (targetSlot === "secondary" && getCustomRoleSlotCapFromRoles(member) < 2) {
    return { ok: false, reason: "missing_secondary_access" };
  }

  const state = await resolveCustomRoleState({ guild, userId: ownerId, client, cleanupExpired: true }).catch(() => null);
  if (state?.status === "active") {
    if (targetSlot === "primary" && state?.role) return { ok: true, role: state.role, doc: state.doc || null };
    if (targetSlot === "secondary" && state?.secondaryRole) return { ok: true, role: state.secondaryRole, doc: state.doc || null };
  }

  const me = guild.members?.me || guild.members?.cache?.get?.(client?.user?.id);
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles)) {
    return { ok: false, reason: "no_manage_roles" };
  }

  if (targetSlot === "secondary") {
    const primaryRow = await CustomRole.findOne({ guildId: guild.id, userId: ownerId }, { roleId: 1 }).lean().catch(() => null);
    if (!String(primaryRow?.roleId || "").trim()) {
      return { ok: false, reason: "primary_required" };
    }
  }

  const roleName = trimRoleName(accountUsername(member) || "Custom Role");
  const createdRole = await guild.roles.create({
    name: roleName,
    colors: { primaryColor: "#f4b6d7" },
    reason: `Custom role per ${member.user?.tag || ownerId}`,
  }).catch(() => null);
  if (!createdRole) return { ok: false, reason: "create_failed" };

  const anchor = guild.roles.cache.get(ANCHOR_ROLE_ID) || (await guild.roles.fetch(ANCHOR_ROLE_ID).catch(() => null));
  if (anchor?.position) {
    const customRoleDocs = await CustomRole.find({ guildId: guild.id }, { roleId: 1, secondaryRoleId: 1 }).lean().catch(() => []);
    const existingCustomPositions = (Array.isArray(customRoleDocs) ? customRoleDocs : [])
      .flatMap((doc?) => [String(doc?.roleId || ""), String(doc?.secondaryRoleId || "")])
      .filter((id?) => id && id !== createdRole.id)
      .map((id?) => guild.roles.cache.get(id) || null)
      .filter((role?) => role && Number(role.position) > 0 && Number(role.position) < Number(anchor.position))
      .map((role?) => Number(role.position));
    const targetPosition = existingCustomPositions.length
      ? Math.min(Math.max(1, Number(anchor.position) - 1), Math.max(...existingCustomPositions) + 1)
      : Math.max(1, Number(anchor.position) - 1);
    if (createdRole.position !== targetPosition) {
      await createdRole.setPosition(targetPosition).catch(() => {});
    }
  }

  await member.roles.add(createdRole.id).catch(() => {});

  const doc = await CustomRole.findOneAndUpdate(
    { guildId: guild.id, userId: ownerId },
    { $set: targetSlot === "secondary" ? { guildId: guild.id, userId: ownerId, secondaryRoleId: createdRole.id, expiresAt: null } : { guildId: guild.id, userId: ownerId, roleId: createdRole.id, expiresAt: null } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  return okPersist(guild, ownerId, "create_custom_role", { ok: true, role: createdRole, doc });
}

async function deleteCustomRole({ client, guild, member, ownerId, slot = "primary" }) {
  if (!guild) return { ok: false, reason: "server_missing" };
  const me = guild.members?.me || guild.members?.cache?.get?.(client?.user?.id);
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles)) {
    return { ok: false, reason: "no_manage_roles" };
  }

  const ownerDoc = await CustomRole.findOne({ guildId: guild.id, userId: ownerId }).lean().catch(() => null);
  if (!ownerDoc) return { ok: false, reason: "no_custom_role" };

  const targetSlot = String(slot || "primary").toLowerCase() === "secondary" ? "secondary" : "primary";
  const roleId = targetSlot === "secondary" ? String(ownerDoc.secondaryRoleId || "") : String(ownerDoc.roleId || "");
  if (!roleId) return { ok: false, reason: "no_custom_role" };

  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (role) {
    const deleted = await role.delete(`Custom role eliminato via sito da ${ownerId}`).then(() => true).catch(() => false);
    if (!deleted) return { ok: false, reason: "delete_failed" };
  }

  const isSecondary = targetSlot === "secondary";
  const hadSecondary = Boolean(ownerDoc.secondaryRoleId);
  const updatePayload = isSecondary
    ? { $set: { secondaryRoleId: null } }
    : hadSecondary
      ? { $set: { roleId: ownerDoc.secondaryRoleId, secondaryRoleId: null } }
      : { $set: { roleId: null } };
  await CustomRole.updateOne({ guildId: guild.id, userId: ownerId }, updatePayload).catch(() => {});

  return okPersist(guild, ownerId, "delete_custom_role", { ok: true });
}

async function renameCustomRole({ guild, member, ownerId, roleId, name }) {
  if (!guild || !roleId) return { ok: false, reason: "invalid_params" };
  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return { ok: false, reason: "role_not_found" };

  const newName = trimRoleName(String(name || "").trim() || accountUsername(member) || "Custom Role");
  const edited = await role.edit({ name: newName }, `Custom role rename via sito da ${ownerId}`).then(() => true).catch(() => false);
  return edited
    ? okPersist(guild, ownerId, "rename_custom_role", { ok: true, name: newName })
    : { ok: false, reason: "edit_failed" };
}

async function removeCustomRoleMember({ guild, ownerId, roleId, memberId }) {
  if (!guild || !roleId || !memberId) return { ok: false, reason: "invalid_params" };
  if (String(memberId) === String(ownerId)) {
    return { ok: false, reason: "cannot_remove_owner", message: "Non puoi rimuovere te stesso: sei il proprietario del ruolo." };
  }
  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return { ok: false, reason: "role_not_found" };

  const target = guild.members.cache.get(memberId) || (await guild.members.fetch(memberId).catch(() => null));
  if (!target) return { ok: false, reason: "member_not_found" };

  const removed = await target.roles.remove(roleId, `Custom role member revoke via sito da ${ownerId}`).then(() => true).catch(() => false);
  if (!removed) return { ok: false, reason: "remove_failed" };
  try {
    const { dropMemberFromRoleSnapshot } = require("../../Utils/Discord/threadRoleMembers") as typeof import("../../Utils/Discord/threadRoleMembers");
    dropMemberFromRoleSnapshot(guild.id, roleId, memberId);
  } catch {
    /* ignore */
  }
  return { ok: true };
}

async function addCustomRoleMember({ client, guild, ownerId, roleId, memberId }) {
  if (!guild || !roleId || !memberId) return { ok: false, reason: "invalid_params" };
  if (String(memberId) === String(ownerId)) {
    return { ok: false, reason: "cannot_add_owner", message: "Sei già il proprietario del ruolo." };
  }
  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return { ok: false, reason: "role_not_found" };

  const target = guild.members.cache.get(memberId) || (await guild.members.fetch(memberId).catch(() => null));
  if (!target) return { ok: false, reason: "member_not_found" };

  if (target.roles.cache.has(roleId)) {
    return { ok: true, alreadyHad: true, message: "L'utente ha già questo ruolo." };
  }

  const { createCustomRoleGrantRequest } = require("../../Events/interaction/customRoleHandlers") as typeof import("../../Events/interaction/customRoleHandlers");
  const started = await createCustomRoleGrantRequest({
    client,
    guildId: guild.id,
    channelId: null,
    requesterId: ownerId,
    targetId: memberId,
    roleId,
  });

  if (!started?.ok) {
    if (started?.error === "dm_closed") {
      return {
        ok: false,
        reason: "dm_closed",
        message: "Non posso inviare la DM: l'utente ha i messaggi privati chiusi.",
      };
    }
    return {
      ok: false,
      reason: "request_failed",
      message: "Non sono riuscito a inviare la richiesta in DM. Riprova tra poco.",
    };
  }

  return {
    ok: true,
    pending: true,
    message: "Richiesta inviata in DM: il ruolo verrà assegnato solo se l'utente accetta.",
  };
}

export = {
  createCustomRole,
  deleteCustomRole,
  renameCustomRole,
  removeCustomRoleMember,
  addCustomRoleMember,
};
