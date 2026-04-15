const { EmbedBuilder } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getOrCreateStaffDoc, ensureStaff } = require("../../Utils/Staff/staffDocUtils");
const { initPartnerManagerFieldsIfMissing, syncStaffDbAndPauseChannelAfterDepex } = require("../../Utils/Staff/staffPmUtils");
const IDs = require("../../Utils/Config/ids");
const { getClientChannelCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const { memberHasStaffRole } = require("../../Utils/Community/staffListUtils");
const { applyDepexOneLevel } = require("../../Services/Staff/staffWarnService");
const { applyDepexSideEffects: applyResocontoStaffDepexSideEffects } = require("../../Events/interaction/resocontoHandlers");
const { clearStaffPendingPurgeAt } = require("../../Services/Community/userLeaveBackupService");
const ROLE_MEMBER = IDs.roles.Member;
const ROLE_PARTNER_MANAGER = IDs.roles.PartnerManager;
const ROLE_STAFF = IDs.roles.Staff;
const ROLE_HIGH_STAFF = IDs.roles.HighStaff;
const ROLE_HELPER = IDs.roles.Helper;
const ROLE_MODERATOR = IDs.roles.Mod;
const ROLE_COORDINATOR = IDs.roles.Coordinator;
const ROLE_SUPERVISOR = IDs.roles.Supervisor;
const ROLE_ADMIN = IDs.roles.Admin;
const ROLE_CO_OWNER = IDs.roles.CoFounder;
const ROLE_OWNER = IDs.roles.Founder;
const SUCCESS_COLOR = "#6f4e37";

async function refreshMemberRoles(member) {
  const guild = member?.guild;
  const memberId = member?.id;
  if (!guild || !memberId) return member;
  return guild.members.fetch(memberId).catch(() => member);
}

async function ensureRoleState(member, roleId, shouldHaveRole) {
  const refreshedMember = await refreshMemberRoles(member);
  const hasRole = Boolean(refreshedMember?.roles?.cache?.has(roleId));
  return { member: refreshedMember || member, ok: shouldHaveRole ? hasRole : !hasRole };
}

async function ensureMultipleRoleStates(member, checks) {
  const refreshedMember = await refreshMemberRoles(member);
  const ok = (Array.isArray(checks) ? checks : []).every(({ roleId, shouldHaveRole }) => {
    const hasRole = Boolean(refreshedMember?.roles?.cache?.has(roleId));
    return shouldHaveRole ? hasRole : !hasRole;
  });
  return { member: refreshedMember || member, ok };
}

async function fetchMember(guild, userId) {
  if (!guild || !userId) return null;
  return guild.members.cache.get(userId) ||
    guild.members.fetch(userId).catch(() => null);
}

function createMemberResolver(guild) {
  const pendingMembers = new Map();

  return async (userId) => {
    const key = String(userId || "");
    if (!key) return null;

    const cachedMember = guild?.members?.cache?.get(key);
    if (cachedMember) return cachedMember;

    if (pendingMembers.has(key)) {
      return pendingMembers.get(key);
    }

    const fetchPromise = fetchMember(guild, key).finally(() => { pendingMembers.delete(key); });
    pendingMembers.set(key, fetchPromise);
    return fetchPromise;
  };
}

async function ensureMember(interaction, user, resolveMember) {
  const member = await resolveMember(user.id);
  if (!member) {
    await replyError(
      interaction,
      "<:VC_Attention:1482534443632558151> Utente non trovato nel server.",
    );
    return null;
  }

  return member;
}

async function ensureNotSelf(interaction, targetUser) {
  if (interaction.user.id !== targetUser.id) {
    return true;
  }

  await replyError(
    interaction,
    "<:VC_Attention:1482534443632558151> Non puoi usare questo comando su te stesso.",
  );
  return false;
}

async function sendPartnerManagerWelcome(pmChannel, user) {
  await pmChannel.send({
    content: `${user}
# Benvenutx nei Partner Manager <:partnermanager:1443651916838998099>

> **Per iniziare al meglio controlla:** <:VC_id:1478517313618575419>
<:VC_Reply:1482532158080942191> <#1442569199229730836>

__Per qualsiasi cosa l'High Staff è disponibile__ <:staff:1443651912179388548>`,
  }).catch(() => null);
}

async function sendHelperWelcome(staffChannel, user) {
  await staffChannel.send({
    content: `${user}
# Benvenutx nello staff <:staff:1443651912179388548>

> **Per iniziare al meglio controlla:** <:VC_id:1478517313618575419>
<:VC_DoubleReply:1482532332509466797> <#1442569237142044773>
<:VC_DoubleReply:1482532332509466797> <#1442569239063167139>
<:VC_Reply:1482532158080942191> <#1442569243626307634>

__Per qualsiasi cosa l'High Staff è disponibile__ <:staff:1443651912179388548>`,
  }).catch(() => null);
}

const STAFF_LADDER_ROLES = [ROLE_HELPER, ROLE_MODERATOR, ROLE_COORDINATOR, ROLE_SUPERVISOR, ROLE_ADMIN, ROLE_CO_OWNER, ROLE_OWNER];
const ROLES_REQUIRING_HIGH_STAFF = [ROLE_ADMIN, ROLE_CO_OWNER, ROLE_OWNER];

async function applyPexSideEffects(
  member,
  roleId,
  pmChannel,
  staffChannel,
  user,
  hadStaffRolesBeforePex,
) {
  const hadAnyStaffRoleBefore =
    typeof hadStaffRolesBeforePex === "boolean" ? hadStaffRolesBeforePex : memberHasStaffRole(member);
  if (roleId === ROLE_PARTNER_MANAGER) {
    await sendPartnerManagerWelcome(pmChannel, user);
  }

  if (STAFF_LADDER_ROLES.includes(roleId)) {
    await member.roles.add(ROLE_STAFF);
    member = (await ensureRoleState(member, ROLE_STAFF, true)).member;
  }
  if (ROLES_REQUIRING_HIGH_STAFF.includes(roleId)) {
    await member.roles.add(ROLE_HIGH_STAFF);
    member = (await ensureRoleState(member, ROLE_HIGH_STAFF, true)).member;
  }

  if (roleId === ROLE_HELPER) {
    await member.roles.add(ROLE_STAFF);
    const verification = await ensureRoleState(member, ROLE_STAFF, true);
    if (!verification.ok) throw new Error("Pex side effect failed: staff role missing after helper promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_MODERATOR) {
    await member.roles.remove(ROLE_HELPER);
    const verification = await ensureRoleState(member, ROLE_HELPER, false);
    if (!verification.ok) throw new Error("Pex side effect failed: helper role still present after moderator promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_COORDINATOR) {
    await member.roles.remove(ROLE_MODERATOR);
    const verification = await ensureRoleState(member, ROLE_MODERATOR, false);
    if (!verification.ok) throw new Error("Pex side effect failed: moderator role still present after coordinator promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_SUPERVISOR) {
    await member.roles.remove(ROLE_COORDINATOR);
    const verification = await ensureRoleState(member, ROLE_COORDINATOR, false);
    if (!verification.ok) throw new Error("Pex side effect failed: coordinator role still present after supervisor promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_ADMIN) {
    await member.roles.remove(ROLE_SUPERVISOR);
    await member.roles.add(ROLE_HIGH_STAFF);
    const verification = await ensureMultipleRoleStates(member, [{ roleId: ROLE_SUPERVISOR, shouldHaveRole: false }, { roleId: ROLE_HIGH_STAFF, shouldHaveRole: true }]);
    if (!verification.ok) throw new Error("Pex side effect failed: admin side effects not applied.");
    member = verification.member;
  }

  if (roleId === ROLE_CO_OWNER) {
    await member.roles.remove(ROLE_ADMIN);
    const verification = await ensureRoleState(member, ROLE_ADMIN, false);
    if (!verification.ok) throw new Error("Pex side effect failed: admin role still present after co-owner promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_OWNER) {
    await member.roles.remove(ROLE_CO_OWNER);
    const verification = await ensureRoleState(member, ROLE_CO_OWNER, false);
    if (!verification.ok) throw new Error("Pex side effect failed: co-owner role still present after owner promotion.");
  }

  const hasAnyStaffRoleNow = memberHasStaffRole(member);
  if (!hadAnyStaffRoleBefore && hasAnyStaffRoleNow) {
    await sendHelperWelcome(staffChannel, user);
  }
}

async function applyDepexSideEffects(member, roleId) {
  if (roleId === ROLE_PARTNER_MANAGER) {
    await member.roles.remove(roleId);
    const verification = await ensureRoleState(member, roleId, false);
    if (!verification.ok) throw new Error("Depex side effect failed: partner manager role still present.");
    member = verification.member;
  }

  if (roleId === ROLE_HELPER) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
    const verification = await ensureMultipleRoleStates(member, [{ roleId, shouldHaveRole: false }, { roleId: ROLE_STAFF, shouldHaveRole: false }]);
    if (!verification.ok) throw new Error("Depex side effect failed: helper/staff roles still present.");
    member = verification.member;
  }

  if (roleId === ROLE_MODERATOR) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
    const verification = await ensureMultipleRoleStates(member, [{ roleId, shouldHaveRole: false }, { roleId: ROLE_STAFF, shouldHaveRole: false }]);
    if (!verification.ok) throw new Error("Depex side effect failed: moderator/staff roles still present.");
    member = verification.member;
  }

  if (roleId === ROLE_COORDINATOR) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
    const verification = await ensureMultipleRoleStates(member, [{ roleId, shouldHaveRole: false }, { roleId: ROLE_STAFF, shouldHaveRole: false }]);
    if (!verification.ok) throw new Error("Depex side effect failed: coordinator/staff roles still present.");
    member = verification.member;
  }

  if (roleId === ROLE_SUPERVISOR) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
    const verification = await ensureMultipleRoleStates(member, [{ roleId, shouldHaveRole: false }, { roleId: ROLE_STAFF, shouldHaveRole: false }]);
    if (!verification.ok) throw new Error("Depex side effect failed: supervisor/staff roles still present.");
    member = verification.member;
  }

  if (roleId === ROLE_ADMIN) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
    await member.roles.remove(ROLE_HIGH_STAFF);
    const verification = await ensureMultipleRoleStates(member, [{ roleId, shouldHaveRole: false }, { roleId: ROLE_STAFF, shouldHaveRole: false }, { roleId: ROLE_HIGH_STAFF, shouldHaveRole: false }]);
    if (!verification.ok) throw new Error("Depex side effect failed: admin/high staff/staff roles still present.");
    member = verification.member;
  }

  if (roleId === ROLE_CO_OWNER) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
    await member.roles.remove(ROLE_HIGH_STAFF);
    const verification = await ensureMultipleRoleStates(member, [{ roleId, shouldHaveRole: false }, { roleId: ROLE_STAFF, shouldHaveRole: false }, { roleId: ROLE_HIGH_STAFF, shouldHaveRole: false }]);
    if (!verification.ok) throw new Error("Depex side effect failed: co-owner/high staff/staff roles still present.");
  }
}

function getHighestLadderRole(member) {
  if (!member?.roles?.cache) return null;
  for (let i = STAFF_LADDER_ROLES.length - 1; i >= 0; i--) {
    const id = STAFF_LADDER_ROLES[i];
    if (id && member.roles.cache.has(id)) return id;
  }
  return null;
}

function getNextLadderRoleId(currentId) {
  const idx = STAFF_LADDER_ROLES.indexOf(currentId);
  if (idx < 0 || idx >= STAFF_LADDER_ROLES.length - 1) return null;
  return STAFF_LADDER_ROLES[idx + 1];
}

async function runProspectStaffPex(guild, client, targetUser, actorUser, reason, targetRoleId = ROLE_HELPER) {
  if (String(targetUser.id) === String(actorUser.id)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Non puoi usare questa azione su te stesso." };
  }
  const resolveMember = createMemberResolver(guild);
  const member = await resolveMember(targetUser.id);
  if (!member) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Utente non trovato nel server." };
  }
  if (memberHasStaffRole(member)) {
    return {
      ok: false,
      message:
        "<:VC_Attention:1482534443632558151> L'utente ha già un ruolo staff/PM. Usa **Pex** dal pannello completo (`+staff`).",
    };
  }
  const roleAfter = String(targetRoleId || "");
  if (!roleAfter || !STAFF_LADDER_ROLES.includes(roleAfter)) {
    return { ok: false, message: "<:vegax:1443934876440068179> Ruolo target non valido per il PEX iniziale staff." };
  }
  const roleAfterName = guild.roles.cache.get(roleAfter)?.name || roleAfter;
  if (member.roles.cache.has(roleAfter)) {
    return { ok: false, message: `<:VC_Attention:1482534443632558151> L'utente ha già il ruolo ${roleAfterName}.` };
  }
  if (ROLE_MEMBER && !member.roles.cache.has(ROLE_MEMBER)) {
    return {
      ok: false,
      message:
        "<:VC_Attention:1482534443632558151> Per la prima promozione serve il ruolo **Member** sull'utente.",
    };
  }
  const roleBeforeForHistory = ROLE_MEMBER || "";
  const pmChannel =
    guild.channels.cache.get(IDs.channels?.partnersChat) ||
    (await getGuildChannelCached(guild, IDs.channels?.partnersChat));
  const staffChat =
    guild.channels.cache.get(IDs.channels?.staffChat) ||
    (await getGuildChannelCached(guild, IDs.channels?.staffChat));
  const pexDepexChannel =
    guild.channels.cache.get(IDs.channels?.pexDepex) ||
    (await getGuildChannelCached(guild, IDs.channels?.pexDepex));
  const staffDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
  const hadStaffRolesBeforePex = false;
  await member.roles.add(roleAfter);
  const baseRoleVerification = await ensureRoleState(member, roleAfter, true);
  if (!baseRoleVerification.ok) {
    return { ok: false, message: `<:vegax:1443934876440068179> Pex non applicato: impossibile assegnare ${roleAfterName}.` };
  }
  try {
    await applyPexSideEffects(
      baseRoleVerification.member,
      roleAfter,
      pmChannel,
      staffChat,
      targetUser,
      hadStaffRolesBeforePex,
    );
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Pex: errore side-effect ruoli." };
  }
  const profileDoc = staffDoc;
  const s = ensureStaff(profileDoc);
  if (!Array.isArray(s.rolesHistory)) s.rolesHistory = [];
  s.rolesHistory.push({ oldRole: roleBeforeForHistory, newRole: roleAfter, reason, date: new Date() });
  profileDoc.markModified("staff");
  await profileDoc.save();
  await clearStaffPendingPurgeAt(guild.id, targetUser.id);
  const rb = roleBeforeForHistory ? guild.roles.cache.get(roleBeforeForHistory) : null;
  const ra = guild.roles.cache.get(roleAfter);
  await pexDepexChannel
    ?.send?.({
      content: `**<:success:1461731530333229226> PEX** ${targetUser}
<:staff:1443651912179388548> \`${rb?.name || "Member"}\` <a:VC_Arrow:1482706699365257397> \`${ra?.name || roleAfter}\`
<:VC_reason:1478517122929004544> __${reason}__`,
    })
    .catch(() => null);
  return { ok: true };
}

async function runProspectStaffPexToPartnerManager(guild, client, targetUser, actorUser, reason) {
  if (String(targetUser.id) === String(actorUser.id)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Non puoi usare questa azione su te stesso." };
  }
  const resolveMember = createMemberResolver(guild);
  const member = await resolveMember(targetUser.id);
  if (!member) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Utente non trovato nel server." };
  }
  if (!ROLE_PARTNER_MANAGER) {
    return { ok: false, message: "<:vegax:1443934876440068179> Ruolo Partner Manager non configurato negli ID." };
  }
  if (member.roles.cache.has(ROLE_PARTNER_MANAGER)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> L'utente ha già il ruolo Partner Manager." };
  }
  if (ROLE_MEMBER && !member.roles.cache.has(ROLE_MEMBER)) {
    return {
      ok: false,
      message:
        "<:VC_Attention:1482534443632558151> Per questa promozione serve il ruolo **Member** sull'utente.",
    };
  }
  const roleBeforeForHistory = getHighestLadderRole(member) || (ROLE_MEMBER || "");
  const roleAfter = ROLE_PARTNER_MANAGER;
  const pmChannel =
    guild.channels.cache.get(IDs.channels?.partnersChat) ||
    (await getGuildChannelCached(guild, IDs.channels?.partnersChat));
  const staffChat =
    guild.channels.cache.get(IDs.channels?.staffChat) ||
    (await getGuildChannelCached(guild, IDs.channels?.staffChat));
  const pexDepexChannel =
    guild.channels.cache.get(IDs.channels?.pexDepex) ||
    (await getGuildChannelCached(guild, IDs.channels?.pexDepex));
  const staffDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
  const hadStaffRolesBeforePex = memberHasStaffRole(member);
  await member.roles.add(roleAfter);
  const baseRoleVerification = await ensureRoleState(member, roleAfter, true);
  if (!baseRoleVerification.ok) {
    return { ok: false, message: "<:vegax:1443934876440068179> Pex non applicato: impossibile assegnare Partner Manager." };
  }
  try {
    await applyPexSideEffects(
      baseRoleVerification.member,
      roleAfter,
      pmChannel,
      staffChat,
      targetUser,
      hadStaffRolesBeforePex,
    );
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Pex: errore side-effect ruoli." };
  }
  const profileDoc = staffDoc;
  const s = ensureStaff(profileDoc);
  initPartnerManagerFieldsIfMissing(s);
  if (!Array.isArray(s.rolesHistory)) s.rolesHistory = [];
  s.rolesHistory.push({ oldRole: roleBeforeForHistory, newRole: roleAfter, reason, date: new Date() });
  profileDoc.markModified("staff");
  await profileDoc.save();
  await clearStaffPendingPurgeAt(guild.id, targetUser.id);
  const rb = roleBeforeForHistory ? guild.roles.cache.get(roleBeforeForHistory) : null;
  const ra = guild.roles.cache.get(roleAfter);
  await pexDepexChannel
    ?.send?.({
      content: `**<:success:1461731530333229226> PEX** ${targetUser}
<:staff:1443651912179388548> \`${rb?.name || "Member"}\` <a:VC_Arrow:1482706699365257397> \`${ra?.name || roleAfter}\`
<:VC_reason:1478517122929004544> __${reason}__`,
    })
    .catch(() => null);
  return { ok: true };
}

async function runProfileStaffPex(guild, client, targetUser, actorUser, reason) {
  if (String(targetUser.id) === String(actorUser.id)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Non puoi usare questa azione su te stesso." };
  }
  const resolveMember = createMemberResolver(guild);
  const member = await resolveMember(targetUser.id);
  if (!member) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Utente non trovato nel server." };
  }
  const roleBefore = getHighestLadderRole(member);
  if (!roleBefore) {
    return {
      ok: false,
      message:
        "<:VC_Attention:1482534443632558151> Nessun ruolo nella scala staff (Helper→Founder) rilevato. Per casi speciali (ruoli manuali) usa il pannello High Staff (`+staff`).",
    };
  }
  const roleAfter = getNextLadderRoleId(roleBefore);
  if (!roleAfter) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> L'utente è già al massimo della scala staff." };
  }
  if (member.roles.cache.has(roleAfter)) {
    return { ok: false, message: `<:VC_Attention:1482534443632558151> ${targetUser} ha già il ruolo successivo.` };
  }
  const pmChannel =
    guild.channels.cache.get(IDs.channels?.partnersChat) ||
    (await getGuildChannelCached(guild, IDs.channels?.partnersChat));
  const staffChat =
    guild.channels.cache.get(IDs.channels?.staffChat) ||
    (await getGuildChannelCached(guild, IDs.channels?.staffChat));
  const pexDepexChannel =
    guild.channels.cache.get(IDs.channels?.pexDepex) ||
    (await getGuildChannelCached(guild, IDs.channels?.pexDepex));
  const staffDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
  const hadStaffRolesBeforePex = memberHasStaffRole(member);
  await member.roles.add(roleAfter);
  const baseRoleVerification = await ensureRoleState(member, roleAfter, true);
  if (!baseRoleVerification.ok) {
    return { ok: false, message: "<:vegax:1443934876440068179> Pex non applicato: impossibile assegnare il ruolo successivo." };
  }
  try {
    await applyPexSideEffects(
      baseRoleVerification.member,
      roleAfter,
      pmChannel,
      staffChat,
      targetUser,
      hadStaffRolesBeforePex,
    );
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Pex: errore side-effect ruoli." };
  }
  const profileDoc = staffDoc;
  const s = ensureStaff(profileDoc);
  if (roleAfter === ROLE_PARTNER_MANAGER) initPartnerManagerFieldsIfMissing(s);
  if (!Array.isArray(s.rolesHistory)) s.rolesHistory = [];
  s.rolesHistory.push({ oldRole: roleBefore, newRole: roleAfter, reason, date: new Date() });
  profileDoc.markModified("staff");
  await profileDoc.save();
  await clearStaffPendingPurgeAt(guild.id, targetUser.id);
  const rb = guild.roles.cache.get(roleBefore);
  const ra = guild.roles.cache.get(roleAfter);
  await pexDepexChannel
    ?.send?.({
      content: `**<:success:1461731530333229226> PEX** ${targetUser}
<:staff:1443651912179388548> \`${rb?.name || roleBefore}\` <a:VC_Arrow:1482706699365257397> \`${ra?.name || roleAfter}\`
<:VC_reason:1478517122929004544> __${reason}__`,
    })
    .catch(() => null);
  return { ok: true };
}

async function runProfileStaffDepex(guild, client, targetUser, actorUser, reason, targetRemoval = "auto") {
  if (String(targetUser.id) === String(actorUser.id)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Non puoi usare questa azione su te stesso." };
  }
  const resolveMember = createMemberResolver(guild);
  const member = await resolveMember(targetUser.id);
  if (!member) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Utente non trovato nel server." };
  }
  const pexDepexChannel =
    guild.channels.cache.get(IDs.channels?.pexDepex) ||
    (await getGuildChannelCached(guild, IDs.channels?.pexDepex));
  const mode = String(targetRemoval || "auto").toLowerCase();
  const ladderRole = getHighestLadderRole(member);
  const hasPmRole = member.roles.cache.has(ROLE_PARTNER_MANAGER);
  let oldRoleForLog = null;
  let newRoleForLog = null;

  if (mode === "partner_manager") {
    if (!hasPmRole) {
      return {
        ok: false,
        message: "<:VC_Attention:1482534443632558151> L'utente non ha il ruolo **Partner Manager**.",
      };
    }
    const sideOk = await applyResocontoStaffDepexSideEffects(guild, member, ROLE_PARTNER_MANAGER);
    if (!sideOk) {
      return { ok: false, message: "<:vegax:1443934876440068179> Depex PM: side-effect ruoli non completati." };
    }
    oldRoleForLog = ROLE_PARTNER_MANAGER;
    newRoleForLog = ROLE_MEMBER || "";
  } else if (mode === "ladder") {
    if (!ladderRole) {
      return {
        ok: false,
        message:
          "<:VC_Attention:1482534443632558151> Nessun ruolo sulla scala staff (Helper→Founder) da depexare. Usa **Depex Partner Manager** se ha solo PM.",
      };
    }
    if (!member.roles.cache.has(ladderRole)) {
      return { ok: false, message: "<:VC_Attention:1482534443632558151> Ruolo da depexare non presente sull'utente." };
    }
    const step = await applyDepexOneLevel(guild, member, ladderRole);
    if (!step?.ok) {
      return {
        ok: false,
        message: `<:VC_Attention:1482534443632558151> ${String(step?.reason || "Depex non applicato.")}`,
      };
    }
    oldRoleForLog = ladderRole;
    newRoleForLog = step.newRole != null && step.newRole !== "" ? step.newRole : ROLE_MEMBER || "";
  } else if (ladderRole) {
    if (!member.roles.cache.has(ladderRole)) {
      return { ok: false, message: "<:VC_Attention:1482534443632558151> Ruolo da depexare non presente sull'utente." };
    }
    const step = await applyDepexOneLevel(guild, member, ladderRole);
    if (!step?.ok) {
      return {
        ok: false,
        message: `<:VC_Attention:1482534443632558151> ${String(step?.reason || "Depex non applicato.")}`,
      };
    }
    oldRoleForLog = ladderRole;
    newRoleForLog = step.newRole != null && step.newRole !== "" ? step.newRole : ROLE_MEMBER || "";
  } else if (hasPmRole) {
    const sideOk = await applyResocontoStaffDepexSideEffects(guild, member, ROLE_PARTNER_MANAGER);
    if (!sideOk) {
      return { ok: false, message: "<:vegax:1443934876440068179> Depex PM: side-effect ruoli non completati." };
    }
    oldRoleForLog = ROLE_PARTNER_MANAGER;
    newRoleForLog = ROLE_MEMBER || "";
  } else {
    return {
      ok: false,
      message:
        "<:VC_Attention:1482534443632558151> Nessun ruolo staff rilevato per il depex. Per depex manuale sui ruoli usa il pannello High Staff (`+staff`).",
    };
  }

  const refreshedMember = (await resolveMember(targetUser.id)) || member;
  await syncStaffDbAndPauseChannelAfterDepex(guild, targetUser.id, refreshedMember);

  const profileDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
  const s = ensureStaff(profileDoc);
  if (!Array.isArray(s.rolesHistory)) s.rolesHistory = [];
  s.rolesHistory.push({
    oldRole: oldRoleForLog,
    newRole: newRoleForLog || "",
    reason,
    date: new Date(),
  });
  profileDoc.markModified("staff");
  await profileDoc.save().catch(() => null);

  const oldRoleObj = guild.roles.cache.get(oldRoleForLog);
  const newRoleObj = newRoleForLog ? guild.roles.cache.get(newRoleForLog) : null;
  const newLabel = newRoleObj?.name || newRoleForLog || "Nessuno";
  await pexDepexChannel
    ?.send?.({
      content: `**<:cancel:1461730653677551691> DEPEX** ${targetUser}
<:staff:1443651912179388548> \`${oldRoleObj?.name || oldRoleForLog}\` <a:VC_Arrow:1482706699365257397> \`${newLabel}\`
<:VC_reason:1478517122929004544> __${reason}__`,
    })
    .catch(() => null);
  return { ok: true };
}

async function runProfileStaffWarnAdd(guild, client, targetUser, actorUser, reason) {
  if (String(targetUser.id) === String(actorUser.id)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Non puoi usare questa azione su te stesso." };
  }
  const warnChannel =
    guild.channels.cache.get(IDs.channels?.warnStaff) ||
    (await getGuildChannelCached(guild, IDs.channels?.warnStaff)) ||
    (await getClientChannelCached(client, IDs.channels?.warnStaff));
  await ActivityUserProfile.findOneAndUpdate(
    { guildId: guild.id, userId: targetUser.id },
    {
      $setOnInsert: { guildId: guild.id, userId: targetUser.id },
      $inc: { "staff.idCount": 1, "staff.warnCount": 1 },
      $push: { "staff.warnReasons": String(reason || "").slice(0, 500) },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  const profileDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
  const s = ensureStaff(profileDoc);
  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  const warnEmbed = new EmbedBuilder()
    .setAuthor({
      name: `Warn eseguito da ${actorUser.username}`,
      iconURL: actorUser.displayAvatarURL(),
    })
    .setTitle(`<a:VC_Alert:1482706673176150077> • **__WARN STAFF__**\`#${s.warnCount}\``)
    .setThumbnail((targetMember || targetUser).displayAvatarURL())
    .setDescription(
      `<:staff:1443651912179388548> <a:VC_Arrow:1482706699365257397> ${targetUser} 
            <:VC_reason:1478517122929004544> __${reason}__ 
            <:VC_id:1478517313618575419> **ID Valutazione:** __\`${s.idCount}\`__`,
    )
    .setColor(SUCCESS_COLOR);
  if (warnChannel) {
    await warnChannel.send({ content: `${targetUser}`, embeds: [warnEmbed] }).catch(() => null);
  }
  return { ok: true };
}

async function runProfileStaffWarnRemove(guild, client, targetUser, actorUser, removeId, reason) {
  const profileDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
  const s = ensureStaff(profileDoc);
  const idx = removeId - 1;
  if (!Number.isInteger(removeId) || removeId < 1 || !s.warnReasons?.[idx]) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> ID warn non valido (usa il numero dalla lista in **Warn staff**)." };
  }
  s.warnReasons.splice(idx, 1);
  s.warnCount = Math.max(0, Number(s.warnCount || 0) - 1);
  profileDoc.markModified("staff");
  await profileDoc.save();
  const warnChannel =
    guild.channels.cache.get(IDs.channels?.warnStaff) ||
    (await getGuildChannelCached(guild, IDs.channels?.warnStaff)) ||
    (await getClientChannelCached(client, IDs.channels?.warnStaff));
  if (warnChannel?.isTextBased?.()) {
    const embed = new EmbedBuilder()
      .setAuthor({
        name: `<:cancel:1461730653677551691> Warn staff rimosso da ${actorUser.username}`,
        iconURL: actorUser.displayAvatarURL(),
      })
      .setTitle(`<a:VC_Alert:1482706673176150077> • **__WARN STAFF RIMOSSO__**`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setDescription(
        `<:staff:1443651912179388548> ${targetUser}\n<:VC_reason:1478517122929004544> __${String(reason).slice(0, 500)}__\n**Rimosso warn #${removeId}**`,
      )
      .setColor(SUCCESS_COLOR);
    await warnChannel.send({ content: `${targetUser}`, embeds: [embed] }).catch(() => null);
  }
  return { ok: true };
}

function actorIsCoordinatorPlus(member) {
  const cache = member?.roles?.cache;
  if (!cache) return false;
  const allowRoles = [
    IDs.roles.Coordinator,
    IDs.roles.Supervisor,
    IDs.roles.Admin,
    IDs.roles.CoFounder,
    IDs.roles.Founder,
    IDs.roles.HighStaff,
  ].filter(Boolean);
  return allowRoles.some((roleId) => cache.has(roleId));
}

async function runProfileStaffCompleteDepex(guild, client, targetUser, actorMember, reason) {
  const actorUser = actorMember?.user || null;
  if (!actorUser || String(targetUser?.id || "") === String(actorUser.id || "")) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Non puoi usare questa azione su te stesso." };
  }
  if (!actorIsCoordinatorPlus(actorMember)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Solo da **Coordinator** in su." };
  }
  const resolveMember = createMemberResolver(guild);
  const member = await resolveMember(targetUser.id);
  if (!member) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Utente non trovato nel server." };
  }
  const completeDepexRoleChain = [
    ROLE_COORDINATOR,
    ROLE_SUPERVISOR,
    ROLE_ADMIN,
    ROLE_CO_OWNER,
    ROLE_OWNER,
  ].filter(Boolean);
  let roleToRemove = null;
  for (let i = completeDepexRoleChain.length - 1; i >= 0; i--) {
    const roleId = completeDepexRoleChain[i];
    if (member.roles.cache.has(roleId)) {
      roleToRemove = roleId;
      break;
    }
  }
  if (!roleToRemove) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> L'utente non ha un ruolo da **Coordinator** in su da depexare." };
  }
  const isAdminOrAbove = [ROLE_ADMIN, ROLE_CO_OWNER, ROLE_OWNER].filter(Boolean).includes(roleToRemove);
  const roleIdsToRemove = [ROLE_STAFF, roleToRemove, ...(isAdminOrAbove ? [ROLE_HIGH_STAFF] : [])].filter(Boolean);
  await member.roles.remove(roleIdsToRemove).catch(() => null);
  const verification = await ensureMultipleRoleStates(
    member,
    roleIdsToRemove.map((roleId) => ({ roleId, shouldHaveRole: false })),
  );
  if (!verification.ok) {
    return { ok: false, message: "<:vegax:1443934876440068179> Depex completo non applicato correttamente." };
  }
  const refreshedMember = (await resolveMember(targetUser.id)) || verification.member || member;
  await syncStaffDbAndPauseChannelAfterDepex(guild, targetUser.id, refreshedMember);

  const pexDepexChannel =
    guild.channels.cache.get(IDs.channels?.pexDepex) ||
    (await getGuildChannelCached(guild, IDs.channels?.pexDepex));
  const oldRoleObj = guild.roles.cache.get(roleToRemove);
  await pexDepexChannel
    ?.send?.({
      content: `**<:cancel:1461730653677551691> DEPEX** ${targetUser}
<:staff:1443651912179388548> \`${oldRoleObj?.name || roleToRemove}\` <a:VC_Arrow:1482706699365257397> \`${guild.roles.cache.get(ROLE_MEMBER)?.name || "Member"}\`
<:VC_reason:1478517122929004544> __${String(reason || "").slice(0, 500)}__`,
    })
    .catch(() => null);
  return { ok: true };
}


module.exports = {
  runProfileStaffPex,
  runProspectStaffPex,
  runProspectStaffPexToPartnerManager,
  runProfileStaffDepex,
  runProfileStaffCompleteDepex,
  runProfileStaffWarnAdd,
  runProfileStaffWarnRemove,
};