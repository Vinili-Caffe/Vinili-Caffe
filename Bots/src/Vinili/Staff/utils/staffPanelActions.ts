const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { getOrCreateStaffDoc, ensureStaff, applyStaffLadderTrackResetToObject } = require("./staffDocUtils") as typeof import("./staffDocUtils");
const { initPartnerManagerFieldsIfMissing, syncStaffDbAndPauseChannelAfterDepex } = require("./staffPmUtils") as typeof import("./staffPmUtils");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getStaffRoleEmojiByRoleId } = require("../../Community/utils/staffRoleEmoji") as typeof import("../../Community/utils/staffRoleEmoji");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { memberHasStaffRole } = require("../../Community/utils/staffListUtils") as typeof import("../../Community/utils/staffListUtils");
const { applyDepexOneLevel } = require("../../Staff/services/staffWarnService") as typeof import("../../Staff/services/staffWarnService");
const { applyDepexSideEffects: applyResocontoStaffDepexSideEffects } = require("../../Events/interaction/resocontoHandlers") as typeof import("../../Events/interaction/resocontoHandlers");
const { clearStaffPendingPurgeAt } = require("../../Community/services/userLeaveBackupService") as typeof import("../../Community/services/userLeaveBackupService");
const { sendPartnerManagerWelcome, sendHelperWelcome } = require("./staffWelcomeMessages") as typeof import("./staffWelcomeMessages");
const { resolveStaffValutazioniChannel, resolveStaffPexDepexChannel } = require("./staffChannelUtils") as typeof import("./staffChannelUtils");
const { stafferAwardRoleIds } = require("./staffRoleHierarchy") as typeof import("./staffRoleHierarchy");
const ROLE_MEMBER = IDs.roles.Member;
const ROLE_PARTNER_MANAGER = IDs.roles.PartnerManager;
const ROLE_BLOGGER = String(IDs.roles.Blogger || "").trim();
const ROLE_STAFF = IDs.roles.Staff;
const ROLE_HIGH_STAFF = IDs.roles.HighStaff;
const ROLE_HELPER = IDs.roles.Helper;
const ROLE_MODERATOR = IDs.roles.Mod;
const ROLE_SENIOR_MODERATOR = IDs.roles.SeniorModerator;
const ROLE_DIRECTOR = IDs.roles.Director;
const ROLE_ADMIN = IDs.roles.Admin;
const ROLE_MANAGER = IDs.roles.Manager;
const ROLE_CO_OWNER = "";

function pushRolesHistoryWithActor(staff, { oldRole, newRole, reason, kind, actorUser }) {
  if (!Array.isArray(staff.rolesHistory)) staff.rolesHistory = [];
  const { actorLabelFromUser } = require("./staffTrackHistory") as typeof import("./staffTrackHistory");
  const actorId = String(actorUser?.id || "").trim() || null;
  const actorName = actorLabelFromUser(actorUser, actorId);
  const entry: Record<string, any> = {
    oldRole: String(oldRole || "").trim(),
    newRole: String(newRole ?? "").trim(),
    reason: String(reason || "").trim() || null,
    date: new Date(),
    kind: kind === "pex" || kind === "depex" ? kind : undefined,
  };
  if (actorId && /^\d{16,22}$/.test(actorId)) entry.actorId = actorId;
  if (actorName) entry.actorName = actorName;
  staff.rolesHistory.push(entry);
  return entry;
}

async function mirrorTrackHistory(guildId?, userId?, entry?, kindOverride?) {
  try {
    const { appendStaffTrackHistory } = require("./staffTrackHistory") as typeof import("./staffTrackHistory");
    await appendStaffTrackHistory(guildId, userId, {
      kind: kindOverride || entry.kind,
      reason: entry.reason,
      date: entry.date,
      actorId: entry.actorId,
      actorName: entry.actorName,
      oldRole: entry.oldRole,
      newRole: entry.newRole,
      entryId: entry.entryId,
    });
  } catch (_) {}
}

function firePexDepexSiteNotif(guild, { kind, targetUser, oldRoleId, newRoleId, reason, actorUser, sourceHint }) {
  const targetUserId = String(targetUser?.id || "").trim();
  try {
    const { notifyStaffPexDepex, memberDisplayName } = require("../../site/staff/siteStaffEventNotifications") as typeof import("../../site/staff/siteStaffEventNotifications");
    void notifyStaffPexDepex({
      guild,
      kind,
      targetUserId,
      targetName: memberDisplayName(null, targetUser, targetUser?.id),
      oldRoleId,
      newRoleId,
      reason,
      actorUserId: String(actorUser?.id || ""),
      actorName: memberDisplayName(null, actorUser, actorUser?.id),
      sourceHint,
    }).catch(() => 0);
  } catch (_) {}
  /* staffProfLiveAll1: clear cache → broadcast WS ai profili aperti */
  try {
    require("../../site/staff/siteStaffProfileApi").clearStaffProfileCacheForUser(targetUserId, {
      action: kind || sourceHint || "career",
    });
  } catch (_) {}
}
const ROLE_OWNER = IDs.roles.Founder;
const SUCCESS_COLOR = "#6f4e37";

async function refreshMemberRoles(member?) {
  const guild = member?.guild;
  const memberId = member?.id;
  if (!guild || !memberId) return member;
  return guild.members.fetch(memberId).catch(() => member);
}

async function ensureRoleState(member?, roleId?, shouldHaveRole?) {
  const refreshedMember = await refreshMemberRoles(member);
  const hasRole = Boolean(refreshedMember?.roles?.cache?.has(roleId));
  return { member: refreshedMember || member, ok: shouldHaveRole ? hasRole : !hasRole };
}

async function ensureMultipleRoleStates(member?, checks?) {
  const refreshedMember = await refreshMemberRoles(member);
  const ok = (Array.isArray(checks) ? checks : []).every(({ roleId, shouldHaveRole }) => {
    const hasRole = Boolean(refreshedMember?.roles?.cache?.has(roleId));
    return shouldHaveRole ? hasRole : !hasRole;
  });
  return { member: refreshedMember || member, ok };
}

async function fetchMember(guild?, userId?) {
  if (!guild || !userId) return null;
  const cached = guild.members.cache.get(userId);
  if (cached) return cached;
  const first = await guild.members.fetch(userId).catch(() => null);
  if (first) return first;
    return guild.members.fetch(userId).catch(() => null);
}

function createMemberResolver(guild?) {
  const pendingMembers = new Map();

  return async (userId?) => {
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

const STAFF_LADDER_ROLES = [
  ROLE_HELPER,
  ROLE_MODERATOR,
  ROLE_SENIOR_MODERATOR,
  ROLE_DIRECTOR,
  ROLE_ADMIN,
  ROLE_MANAGER,
  ROLE_CO_OWNER,
  ROLE_OWNER,
].filter(Boolean);
const ROLES_REQUIRING_HIGH_STAFF = [ROLE_ADMIN, ROLE_MANAGER, ROLE_CO_OWNER, ROLE_OWNER].filter(Boolean);

async function applyPexSideEffects(
  member?,
  roleId?,
  client?,
  staffChannel?,
  user?,
  hadStaffRolesBeforePex?,
) {
  const hadAnyStaffRoleBefore =
    typeof hadStaffRolesBeforePex === "boolean" ? hadStaffRolesBeforePex : memberHasStaffRole(member);
  if (roleId === ROLE_PARTNER_MANAGER) {
    await sendPartnerManagerWelcome(client || member?.client, member);
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

  if (roleId === ROLE_SENIOR_MODERATOR) {
    await member.roles.remove(ROLE_MODERATOR);
    const verification = await ensureRoleState(member, ROLE_MODERATOR, false);
    if (!verification.ok) throw new Error("Pex side effect failed: moderator role still present after senior moderator promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_DIRECTOR) {
    await member.roles.remove(ROLE_SENIOR_MODERATOR);
    const verification = await ensureRoleState(member, ROLE_SENIOR_MODERATOR, false);
    if (!verification.ok) throw new Error("Pex side effect failed: senior moderator role still present after director promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_ADMIN) {
    await member.roles.remove(ROLE_DIRECTOR || ROLE_MODERATOR);
    await member.roles.add(ROLE_HIGH_STAFF);
    const verification = await ensureMultipleRoleStates(member, [
      { roleId: ROLE_DIRECTOR || ROLE_MODERATOR, shouldHaveRole: false },
      { roleId: ROLE_HIGH_STAFF, shouldHaveRole: true },
    ]);
    if (!verification.ok) throw new Error("Pex side effect failed: admin side effects not applied.");
    member = verification.member;
  }

  if (roleId === ROLE_MANAGER) {
    await member.roles.remove(ROLE_ADMIN);
    await member.roles.add(ROLE_HIGH_STAFF);
    const verification = await ensureMultipleRoleStates(member, [
      { roleId: ROLE_ADMIN, shouldHaveRole: false },
      { roleId: ROLE_HIGH_STAFF, shouldHaveRole: true },
    ]);
    if (!verification.ok) throw new Error("Pex side effect failed: manager side effects not applied.");
    member = verification.member;
  }

  if (roleId === ROLE_CO_OWNER) {
    await member.roles.remove(ROLE_ADMIN);
    const verification = await ensureRoleState(member, ROLE_ADMIN, false);
    if (!verification.ok) throw new Error("Pex side effect failed: admin role still present after co-owner promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_OWNER) {
    await member.roles.remove([ROLE_MANAGER, ROLE_CO_OWNER].filter(Boolean));
    const verification = await ensureMultipleRoleStates(member, [
      ...(ROLE_MANAGER ? [{ roleId: ROLE_MANAGER, shouldHaveRole: false }] : []),
      ...(ROLE_CO_OWNER ? [{ roleId: ROLE_CO_OWNER, shouldHaveRole: false }] : []),
    ]);
    if (!verification.ok) throw new Error("Pex side effect failed: manager/co-owner role still present after owner promotion.");
  }

  const hasLadderRoleNow = Boolean(getHighestLadderRole(member));
  if (!hadAnyStaffRoleBefore && hasLadderRoleNow) {
    await sendHelperWelcome(staffChannel, member);
  }
}

function getHighestLadderRole(member?) {
  if (!member?.roles?.cache) return null;
  for (let i = STAFF_LADDER_ROLES.length - 1; i >= 0; i--) {
    const id = STAFF_LADDER_ROLES[i];
    if (id && member.roles.cache.has(id)) return id;
  }
  return null;
}

/** Index in STAFF_LADDER_ROLES (Helper=0 … Founder/Owner=max). -1 = fuori scala. */
function staffLadderRankIndex(roleId?) {
  const id = String(roleId || "").trim();
  if (!id) return -1;
  return STAFF_LADDER_ROLES.indexOf(id);
}

function getMemberStaffLadderRank(member?) {
  return staffLadderRankIndex(getHighestLadderRole(member));
}

async function resolveGuildActorMember(guild?, actorUserOrMember?) {
  if (actorUserOrMember?.roles?.cache) return actorUserOrMember;
  const id = String(actorUserOrMember?.id || "").trim();
  if (!id || !guild) return null;
  return (
    guild.members?.cache?.get?.(id) ||
    (await guild.members?.fetch?.(id).catch(() => null)) ||
    null
  );
}

/**
 * staffCareerRankGuard1: niente pex/depex su pari o superiori; niente pex verso ruolo >= al proprio.
 * Target senza scala (es. PM-only) ok se l'attore ha un grado ladder (o è Founder/Owner).
 */
function assertStaffCareerHierarchy(actorMember?, targetMember?, { destinationRoleId = null } = {}) {
  if (!actorMember || !targetMember) {
    return {
      ok: false,
      message:
        "<:VC_Lock:1482526739044368476> Impossibile verificare i ruoli per pex/depex.",
    };
  }
  if (String(actorMember.id) === String(targetMember.id)) {
    return {
      ok: false,
      message: "<:VC_Attention:1482534443632558151> Non puoi usare questa azione su te stesso.",
    };
  }

  const actorRank = getMemberStaffLadderRank(actorMember);
  const targetRank = getMemberStaffLadderRank(targetMember);
  const topRoleId = STAFF_LADDER_ROLES.length
    ? STAFF_LADDER_ROLES[STAFF_LADDER_ROLES.length - 1]
    : "";
  const actorIsTop = Boolean(topRoleId && actorMember.roles?.cache?.has?.(topRoleId));

  if (targetRank >= 0) {
    if (actorRank < 0) {
      return {
        ok: false,
        message:
          "<:VC_Lock:1482526739044368476> Non puoi pexare o depexare un membro con ruolo nella scala staff: il tuo grado è inferiore o assente.",
      };
    }
    if (!actorIsTop && targetRank >= actorRank) {
      return {
        ok: false,
        message:
          "<:VC_Lock:1482526739044368476> Non puoi pexare o depexare un membro con ruolo uguale o superiore al tuo.",
      };
    }
  }

  const destId = String(destinationRoleId || "").trim();
  if (destId) {
    const destRank = staffLadderRankIndex(destId);
    if (destRank >= 0 && (actorRank < 0 || (!actorIsTop && destRank >= actorRank))) {
      return {
        ok: false,
        message:
          "<:VC_Lock:1482526739044368476> Non puoi pexare a un ruolo uguale o superiore al tuo.",
      };
    }
  }

  return { ok: true };
}

function getNextLadderRoleId(currentId?) {
  const idx = STAFF_LADDER_ROLES.indexOf(currentId);
  if (idx < 0 || idx >= STAFF_LADDER_ROLES.length - 1) return null;
  return STAFF_LADDER_ROLES[idx + 1];
}

function peekDepexLadderTargetRoleId(ladderRoleId?) {
  const roleId = String(ladderRoleId || "").trim();
  if (!roleId) return null;
  if (ROLE_OWNER && roleId === ROLE_OWNER) return ROLE_MANAGER || ROLE_ADMIN || null;
  if (ROLE_MANAGER && roleId === ROLE_MANAGER) return ROLE_ADMIN || null;
  if (ROLE_ADMIN && roleId === ROLE_ADMIN) return ROLE_DIRECTOR || null;
  if (ROLE_DIRECTOR && roleId === ROLE_DIRECTOR) return ROLE_SENIOR_MODERATOR || null;
  if (ROLE_SENIOR_MODERATOR && roleId === ROLE_SENIOR_MODERATOR) return ROLE_MODERATOR || null;
  if ((ROLE_MODERATOR && roleId === ROLE_MODERATOR) || (ROLE_HELPER && roleId === ROLE_HELPER)) {
    return ROLE_MEMBER || "";
  }
  const idx = STAFF_LADDER_ROLES.indexOf(roleId);
  if (idx > 0) return STAFF_LADDER_ROLES[idx - 1];
  if (idx === 0) return ROLE_MEMBER || "";
  return null;
}

async function runProspectStaffPex(guild?, client?, targetUser?, actorUser?, reason?, targetRoleId = ROLE_HELPER) {
  if (String(targetUser.id) === String(actorUser.id)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Non puoi usare questa azione su te stesso." };
  }
  const resolveMember = createMemberResolver(guild);
  const member = await resolveMember(targetUser.id);
  if (!member) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Utente non trovato nel server." };
  }
  if (getHighestLadderRole(member)) {
    return {
      ok: false,
      message:
        "<:VC_Attention:1482534443632558151> L'utente ha già un ruolo nella scala staff. Usa **Pex** da **Gestione** sul sito staff.",
    };
  }
  const roleAfter = String(targetRoleId || "");
  if (!roleAfter || !STAFF_LADDER_ROLES.includes(roleAfter)) {
    return { ok: false, message: "<:vegax:1443934876440068179> Ruolo target non valido per il PEX iniziale staff." };
  }
  /* staffCareerRankGuard1 */
  {
    const actorMember = await resolveGuildActorMember(guild, actorUser);
    const rankGate = assertStaffCareerHierarchy(actorMember, member, { destinationRoleId: roleAfter });
    if (!rankGate.ok) return rankGate;
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
  const roleBeforeForHistory =
    getHighestLadderRole(member) ||
    (ROLE_PARTNER_MANAGER && member.roles.cache.has(ROLE_PARTNER_MANAGER) ? ROLE_PARTNER_MANAGER : "") ||
    ROLE_MEMBER ||
    "";
  const staffChat =
    guild.channels.cache.get(IDs.channels?.staffChat) ||
    (await getGuildChannelCached(guild, IDs.channels?.staffChat));
  const pexDepexChannel = await resolveStaffPexDepexChannel(guild, client || guild.client);
  const staffDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
  const hadLadderRoleBeforePex = Boolean(getHighestLadderRole(member));
  const wasPmOnlyBeforePex = Boolean(
    ROLE_PARTNER_MANAGER && member.roles.cache.has(ROLE_PARTNER_MANAGER) && !hadLadderRoleBeforePex,
  );
  if (wasPmOnlyBeforePex) {
    applyStaffLadderTrackResetToObject(ensureStaff(staffDoc));
  }
  await member.roles.add(roleAfter);
  const baseRoleVerification = await ensureRoleState(member, roleAfter, true);
  if (!baseRoleVerification.ok) {
    return { ok: false, message: `<:vegax:1443934876440068179> Pex non applicato: impossibile assegnare ${roleAfterName}.` };
  }
  try {
    await applyPexSideEffects(
      baseRoleVerification.member,
      roleAfter,
      client || guild.client,
      staffChat,
      targetUser,
      hadLadderRoleBeforePex,
    );
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Pex: errore side-effect ruoli." };
  }
  const profileDoc = staffDoc;
  const s = ensureStaff(profileDoc);
  const histEntry = pushRolesHistoryWithActor(s, {
    oldRole: roleBeforeForHistory,
    newRole: roleAfter,
    reason,
    kind: "pex",
    actorUser,
  });
  profileDoc.markModified("staff");
  await profileDoc.save();
  await mirrorTrackHistory(guild.id, targetUser.id, histEntry, "pex");
  await clearStaffPendingPurgeAt(guild.id, targetUser.id);
  const rb = roleBeforeForHistory ? guild.roles.cache.get(roleBeforeForHistory) : null;
  const ra = guild.roles.cache.get(roleAfter);
  const actionEmoji = getStaffRoleEmojiByRoleId(roleAfter);
  await pexDepexChannel
    ?.send?.({
      content: `**<:success:1461731530333229226> PEX** ${targetUser}
${actionEmoji} \`${rb?.name || "Member"}\` <a:VC_Arrow:1482706699365257397> \`${ra?.name || roleAfter}\`
<:VC_reason:1478517122929004544> __${reason}__`,
    __skipNoticeEmbed: true,
    })
    .catch(() => null);
  firePexDepexSiteNotif(guild, {
    kind: "pex",
    targetUser,
    oldRoleId: roleBeforeForHistory,
    newRoleId: roleAfter,
    reason,
    actorUser,
    sourceHint: "prospect-pex",
  });
  return { ok: true };
}

async function runProspectStaffPexToPartnerManager(guild?, client?, targetUser?, actorUser?, reason?) {
  if (String(targetUser.id) === String(actorUser.id)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Non puoi usare questa azione su te stesso." };
  }
  /* staffCareerRankGuard1: PM non è scala, ma blocca se il target ha già grado >= attore */
  {
    const resolveMemberEarly = createMemberResolver(guild);
    const targetEarly = await resolveMemberEarly(targetUser.id);
    const actorMember = await resolveGuildActorMember(guild, actorUser);
    if (targetEarly) {
      const rankGate = assertStaffCareerHierarchy(actorMember, targetEarly, {});
      if (!rankGate.ok) return rankGate;
    }
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
  const staffChat =
    guild.channels.cache.get(IDs.channels?.staffChat) ||
    (await getGuildChannelCached(guild, IDs.channels?.staffChat));
  const pexDepexChannel = await resolveStaffPexDepexChannel(guild, client || guild.client);
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
      client || guild.client,
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
  const histEntry = pushRolesHistoryWithActor(s, {
    oldRole: roleBeforeForHistory,
    newRole: roleAfter,
    reason,
    kind: "pex",
    actorUser,
  });
  profileDoc.markModified("staff");
  await profileDoc.save();
  await mirrorTrackHistory(guild.id, targetUser.id, histEntry, "pex");
  await clearStaffPendingPurgeAt(guild.id, targetUser.id);
  const rb = roleBeforeForHistory ? guild.roles.cache.get(roleBeforeForHistory) : null;
  const ra = guild.roles.cache.get(roleAfter);
  const actionEmoji = getStaffRoleEmojiByRoleId(roleAfter);
  await pexDepexChannel
    ?.send?.({
      content: `**<:success:1461731530333229226> PEX** ${targetUser}
${actionEmoji} \`${rb?.name || "Member"}\` <a:VC_Arrow:1482706699365257397> \`${ra?.name || roleAfter}\`
<:VC_reason:1478517122929004544> __${reason}__`,
    __skipNoticeEmbed: true,
    })
    .catch(() => null);
  firePexDepexSiteNotif(guild, {
    kind: "pex",
    targetUser,
    oldRoleId: roleBeforeForHistory,
    newRoleId: roleAfter,
    reason,
    actorUser,
    sourceHint: "prospect-pex-pm",
  });
  return { ok: true };
}

/** Pex Blogger (add-on): senza scala Staff / side-effect Helper. */
async function runProspectStaffPexToBlogger(guild?, client?, targetUser?, actorUser?, reason?) {
  if (String(targetUser.id) === String(actorUser.id)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Non puoi usare questa azione su te stesso." };
  }
  {
    const resolveMemberEarly = createMemberResolver(guild);
    const targetEarly = await resolveMemberEarly(targetUser.id);
    const actorMember = await resolveGuildActorMember(guild, actorUser);
    if (targetEarly) {
      const rankGate = assertStaffCareerHierarchy(actorMember, targetEarly, {});
      if (!rankGate.ok) return rankGate;
    }
  }
  const resolveMember = createMemberResolver(guild);
  const member = await resolveMember(targetUser.id);
  if (!member) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Utente non trovato nel server." };
  }
  if (!ROLE_BLOGGER) {
    return { ok: false, message: "<:vegax:1443934876440068179> Ruolo Blogger non configurato negli ID." };
  }
  if (member.roles.cache.has(ROLE_BLOGGER)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> L'utente ha già il ruolo Blogger." };
  }
  if (ROLE_MEMBER && !member.roles.cache.has(ROLE_MEMBER)) {
    return {
      ok: false,
      message:
        "<:VC_Attention:1482534443632558151> Per questa promozione serve il ruolo **Member** sull'utente.",
    };
  }
  const roleBeforeForHistory =
    getHighestLadderRole(member) ||
    (ROLE_PARTNER_MANAGER && member.roles.cache.has(ROLE_PARTNER_MANAGER) ? ROLE_PARTNER_MANAGER : "") ||
    (ROLE_MEMBER || "");
  const roleAfter = ROLE_BLOGGER;
  const pexDepexChannel = await resolveStaffPexDepexChannel(guild, client || guild.client);
  const staffDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
  await member.roles.add(roleAfter);
  const baseRoleVerification = await ensureRoleState(member, roleAfter, true);
  if (!baseRoleVerification.ok) {
    return { ok: false, message: "<:vegax:1443934876440068179> Pex non applicato: impossibile assegnare Blogger." };
  }
  const profileDoc = staffDoc;
  const s = ensureStaff(profileDoc);
  const histEntry = pushRolesHistoryWithActor(s, {
    oldRole: roleBeforeForHistory,
    newRole: roleAfter,
    reason,
    kind: "pex",
    actorUser,
  });
  profileDoc.markModified("staff");
  await profileDoc.save();
  await mirrorTrackHistory(guild.id, targetUser.id, histEntry, "pex");
  await clearStaffPendingPurgeAt(guild.id, targetUser.id);
  const rb = roleBeforeForHistory ? guild.roles.cache.get(roleBeforeForHistory) : null;
  const ra = guild.roles.cache.get(roleAfter);
  const actionEmoji = getStaffRoleEmojiByRoleId(roleAfter) || "📝";
  await pexDepexChannel
    ?.send?.({
      content: `**<:success:1461731530333229226> PEX** ${targetUser}
${actionEmoji} \`${rb?.name || "Member"}\` <a:VC_Arrow:1482706699365257397> \`${ra?.name || "Blogger"}\`
<:VC_reason:1478517122929004544> __${reason}__`,
      __skipNoticeEmbed: true,
    })
    .catch(() => null);
  firePexDepexSiteNotif(guild, {
    kind: "pex",
    targetUser,
    oldRoleId: roleBeforeForHistory,
    newRoleId: roleAfter,
    reason,
    actorUser,
    sourceHint: "prospect-pex-blogger",
  });
  return { ok: true };
}

async function runProfileStaffPex(guild?, client?, targetUser?, actorUser?, reason?) {
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
        "<:VC_Attention:1482534443632558151> Nessun ruolo nella scala staff (Helper→Founder) rilevato. Per casi speciali (ruoli manuali) usa **Gestione** sul sito staff.",
    };
  }
  const roleAfter = getNextLadderRoleId(roleBefore);
  if (!roleAfter) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> L'utente è già al massimo della scala staff." };
  }
  if (member.roles.cache.has(roleAfter)) {
    return { ok: false, message: `<:VC_Attention:1482534443632558151> ${targetUser} ha già il ruolo successivo.` };
  }
  /* staffCareerRankGuard1 */
  {
    const actorMember = await resolveGuildActorMember(guild, actorUser);
    const rankGate = assertStaffCareerHierarchy(actorMember, member, { destinationRoleId: roleAfter });
    if (!rankGate.ok) return rankGate;
  }
  const staffChat =
    guild.channels.cache.get(IDs.channels?.staffChat) ||
    (await getGuildChannelCached(guild, IDs.channels?.staffChat));
  const pexDepexChannel = await resolveStaffPexDepexChannel(guild, client || guild.client);
  const staffDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
  const hadLadderRoleBeforePex = Boolean(getHighestLadderRole(member));
  await member.roles.add(roleAfter);
  const baseRoleVerification = await ensureRoleState(member, roleAfter, true);
  if (!baseRoleVerification.ok) {
    return { ok: false, message: "<:vegax:1443934876440068179> Pex non applicato: impossibile assegnare il ruolo successivo." };
  }
  try {
    await applyPexSideEffects(
      baseRoleVerification.member,
      roleAfter,
      client || guild.client,
      staffChat,
      targetUser,
      hadLadderRoleBeforePex,
    );
  } catch (err) {
    global.logger.error(err);
    return { ok: false, message: "<:vegax:1443934876440068179> Pex: errore side-effect ruoli." };
  }
  const profileDoc = staffDoc;
  const s = ensureStaff(profileDoc);
  if (roleAfter === ROLE_PARTNER_MANAGER) initPartnerManagerFieldsIfMissing(s);
  const histEntry = pushRolesHistoryWithActor(s, {
    oldRole: roleBefore,
    newRole: roleAfter,
    reason,
    kind: "pex",
    actorUser,
  });
  profileDoc.markModified("staff");
  await profileDoc.save();
  await mirrorTrackHistory(guild.id, targetUser.id, histEntry, "pex");
  await clearStaffPendingPurgeAt(guild.id, targetUser.id);
  const rb = guild.roles.cache.get(roleBefore);
  const ra = guild.roles.cache.get(roleAfter);
  const actionEmoji = getStaffRoleEmojiByRoleId(roleAfter);
  await pexDepexChannel
    ?.send?.({
      content: `**<:success:1461731530333229226> PEX** ${targetUser}
${actionEmoji} \`${rb?.name || roleBefore}\` <a:VC_Arrow:1482706699365257397> \`${ra?.name || roleAfter}\`
<:VC_reason:1478517122929004544> __${reason}__`,
    __skipNoticeEmbed: true,
    })
    .catch(() => null);
  firePexDepexSiteNotif(guild, {
    kind: "pex",
    targetUser,
    oldRoleId: roleBefore,
    newRoleId: roleAfter,
    reason,
    actorUser,
    sourceHint: "profile-pex",
  });
  return { ok: true };
}

async function runProfileStaffDepex(guild?, client?, targetUser?, actorUser?, reason?, targetRemoval = "auto") {
  if (String(targetUser.id) === String(actorUser.id)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Non puoi usare questa azione su te stesso." };
  }
  const resolveMember = createMemberResolver(guild);
  const member = await resolveMember(targetUser.id);
  if (!member) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Utente non trovato nel server." };
  }
  /* staffCareerRankGuard1 */
  {
    const actorMember = await resolveGuildActorMember(guild, actorUser);
    const rankGate = assertStaffCareerHierarchy(actorMember, member, {});
    if (!rankGate.ok) return rankGate;
  }
  const pexDepexChannel = await resolveStaffPexDepexChannel(guild, client || guild.client);
  const mode = String(targetRemoval || "auto").toLowerCase();
  const ladderRole = getHighestLadderRole(member);
  const hasPmRole = Boolean(ROLE_PARTNER_MANAGER && member.roles.cache.has(ROLE_PARTNER_MANAGER));
  const hasBloggerRole = Boolean(ROLE_BLOGGER && member.roles.cache.has(ROLE_BLOGGER));
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
  } else if (mode === "blogger") {
    if (!ROLE_BLOGGER || !hasBloggerRole) {
      return {
        ok: false,
        message: "<:VC_Attention:1482534443632558151> L'utente non ha il ruolo **Blogger**.",
      };
    }
    await member.roles.remove(ROLE_BLOGGER).catch(() => null);
    const stillHas = (await resolveMember(targetUser.id)) || member;
    if (stillHas.roles?.cache?.has?.(ROLE_BLOGGER)) {
      return { ok: false, message: "<:vegax:1443934876440068179> Depex Blogger: impossibile rimuovere il ruolo." };
    }
    if (ROLE_MEMBER) await stillHas.roles.add(ROLE_MEMBER).catch(() => null);
    oldRoleForLog = ROLE_BLOGGER;
    newRoleForLog =
      getHighestLadderRole(stillHas) ||
      (ROLE_PARTNER_MANAGER && stillHas.roles?.cache?.has?.(ROLE_PARTNER_MANAGER)
        ? ROLE_PARTNER_MANAGER
        : "") ||
      ROLE_MEMBER ||
      "";
  } else if (mode === "ladder") {
    if (!ladderRole) {
      return {
        ok: false,
        message:
          "<:VC_Attention:1482534443632558151> Nessun ruolo sulla scala staff (Helper→Founder) da depexare. Usa **Depex → Partner Manager** se ha solo PM.",
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
  } else if (hasBloggerRole) {
    return runProfileStaffDepex(guild, client, targetUser, actorUser, reason, "blogger");
  } else {
    return {
      ok: false,
      message:
        "<:VC_Attention:1482534443632558151> Nessun ruolo staff rilevato per il depex. Per depex manuale sui ruoli usa **Gestione** sul sito staff.",
    };
  }

  // History BEFORE sync/archive so the depex row lands in rolesHistory (and then retention).
  const profileDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
  const s = ensureStaff(profileDoc);
  const histEntry = pushRolesHistoryWithActor(s, {
    oldRole: oldRoleForLog,
    newRole: newRoleForLog || "",
    reason,
    kind: "depex",
    actorUser,
  });
  profileDoc.markModified("staff");
  await profileDoc.save().catch(() => null);
  await mirrorTrackHistory(guild.id, targetUser.id, histEntry, "depex");

  const refreshedMember = (await resolveMember(targetUser.id)) || member;
  await syncStaffDbAndPauseChannelAfterDepex(guild, targetUser.id, refreshedMember);

  const oldRoleObj = guild.roles.cache.get(oldRoleForLog);
  const newRoleObj = newRoleForLog ? guild.roles.cache.get(newRoleForLog) : null;
  const newLabel = newRoleObj?.name || newRoleForLog || "Nessuno";
  const actionEmoji = getStaffRoleEmojiByRoleId(oldRoleForLog);
  await pexDepexChannel
    ?.send?.({
      content: `**<:cancel:1461730653677551691> DEPEX** ${targetUser}
${actionEmoji} \`${oldRoleObj?.name || oldRoleForLog}\` <a:VC_Arrow:1482706699365257397> \`${newLabel}\`
<:VC_reason:1478517122929004544> __${reason}__`,
    __skipNoticeEmbed: true,
    })
    .catch(() => null);
  firePexDepexSiteNotif(guild, {
    kind: "depex",
    targetUser,
    oldRoleId: oldRoleForLog,
    newRoleId: newRoleForLog || "",
    reason,
    actorUser,
    sourceHint: "profile-depex",
  });
  return { ok: true };
}

async function runProfileStaffWarnAdd(guild?, client?, targetUser?, actorUser?, reason?) {
  if (String(targetUser.id) === String(actorUser.id)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Non puoi usare questa azione su te stesso." };
  }
  const warnChannel = await resolveStaffValutazioniChannel(guild, client);
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
  try {
    const { appendStaffTrackHistory, actorLabelFromUser } = require("./staffTrackHistory") as typeof import("./staffTrackHistory");
    await appendStaffTrackHistory(guild.id, targetUser.id, {
      kind: "warn",
      reason,
      date: new Date(),
      actorId: String(actorUser?.id || "").trim() || null,
      actorName: actorLabelFromUser(actorUser, actorUser?.id),
      entryId: Math.max(0, Math.floor(Number(s.warnCount) || 0)) || null,
    });
  } catch (_) {}
  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  const warnEmbed = new EmbedBuilder()
    .setAuthor({
      name: `Warn eseguito da ${actorUser.username}`,
      iconURL: guildMemberDisplayAvatarUrlDynamic(actorUser) || undefined,
    })
    .setTitle(`<a:VC_Alert:1482706673176150077> • **__WARN STAFF__**\`#${s.warnCount}\``)
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(targetMember || targetUser) || undefined)
    .setDescription(
      `<:VC_Staff:1494286904089247754> <a:VC_Arrow:1482706699365257397> ${targetUser}
            <:VC_reason:1478517122929004544> __${reason}__ 
            <:VC_id:1478517313618575419> **ID Warn:** __\`${s.warnCount}\`__`,
    )
    .setColor(SUCCESS_COLOR);
  /* Warn staff: solo sito (niente post canale Discord). */
  try {
    const freshDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
    const warnCount = Math.max(0, Number(ensureStaff(freshDoc)?.warnCount || s.warnCount || 0));
    const { notifyStaffWarn, memberDisplayName } = require("../../site/staff/siteStaffEventNotifications") as typeof import("../../site/staff/siteStaffEventNotifications");
    void notifyStaffWarn({
      guild,
      staffUserId: targetUser.id,
      staffName: memberDisplayName(targetMember, targetUser, targetUser.id),
      warnCount,
      reason,
      actorName: memberDisplayName(null, actorUser, actorUser?.id),
      needsDepexDecision: warnCount === 2,
    }).catch(() => 0);
  } catch (_) {}
  try {
    require("../../site/staff/siteStaffProfileApi").clearStaffProfileCacheForUser(targetUser.id, {
      action: "warn_add",
    });
  } catch (_) {}
  return { ok: true };
}

const WARN_REMOVE_POS_TRADE_MAX = 100;

async function runProfileStaffWarnRemove(guild?, client?, targetUser?, actorUser?, removeId?, reason?, options: Record<string, any> = {}) {
  const tradeCountRaw = Math.floor(Number(options?.positiveTradeCount || 0));
  const tradeCount = Number.isFinite(tradeCountRaw) && tradeCountRaw > 0 ? tradeCountRaw : 0;
  const profileDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
  const s = ensureStaff(profileDoc);
  const idx = removeId - 1;
  if (!Number.isInteger(removeId) || removeId < 1 || !s.warnReasons?.[idx]) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> ID warn non valido (usa il numero dalla lista in **Warn staff**)." };
  }
  if (tradeCount > 0) {
    if (tradeCount > WARN_REMOVE_POS_TRADE_MAX) {
      return {
        ok: false,
        message: `<:VC_Attention:1482534443632558151> Massimo \`${WARN_REMOVE_POS_TRADE_MAX}\` positive per scambio.`,
      };
    }
    const available = Array.isArray(s.positiveReasons) ? s.positiveReasons.length : 0;
    if (available < tradeCount) {
      return {
        ok: false,
        message: `<:VC_Attention:1482534443632558151> Servono **almeno ${tradeCount} valutazioni positive** per lo scambio (ne ha \`${available}\`).`,
      };
    }
  }

  const warnChannel = await resolveStaffValutazioniChannel(guild, client);
  let tradedPositives = 0;
  if (tradeCount > 0) {
    const { removeOldestPositiveValutazioni } = require("./valutazionePanelActions") as typeof import("./valutazionePanelActions");
    const tradeReason = `Scambio: ${tradeCount} positive → rimozione warn staff #${removeId}`;
    const posResult = await removeOldestPositiveValutazioni(
      s,
      tradeCount,
      actorUser,
      targetUser,
      warnChannel,
      guild,
      tradeReason,
      (finalPos?) =>
        `<:VC_OnlineStatus:1482527088912240650> Ora ${targetUser?.id ? `<@${targetUser.id}>` : "lo staffer"} è a \`${finalPos}\` valutazioni positive!`,
    );
    tradedPositives = Number(posResult?.removed || tradeCount);
  }

  s.warnReasons.splice(idx, 1);
  s.warnCount = Math.max(0, Number(s.warnCount || 0) - 1);
  profileDoc.markModified("staff");
  await profileDoc.save();
  try {
    const { appendStaffTrackHistory, actorLabelFromUser } = require("./staffTrackHistory") as typeof import("./staffTrackHistory");
    await appendStaffTrackHistory(guild.id, targetUser.id, {
      kind: "warn_rm",
      reason: reason || `Rimozione warn #${removeId}`,
      date: new Date(),
      actorId: String(actorUser?.id || "").trim() || null,
      actorName: actorLabelFromUser(actorUser, actorUser?.id),
      entryId: removeId,
    });
  } catch (_) {}

  if (warnChannel?.isTextBased?.()) {
    const tradeLine = tradedPositives
      ? `\n<:thumbsup:1471292172145004768> **Scambio:** rimosse **${tradedPositives}** positive più vecchie.`
      : "";
    const embed = new EmbedBuilder()
      .setAuthor({
        name: `Warn staff rimosso da ${actorUser.username}`,
        iconURL: guildMemberDisplayAvatarUrlDynamic(actorUser) || undefined,
      })
      .setTitle(`<a:VC_Alert:1482706673176150077> • **__WARN STAFF RIMOSSO__**`)
      .setThumbnail(guildMemberDisplayAvatarUrlDynamic(targetUser) || undefined)
      .setDescription(
        `<:VC_Staff:1494286904089247754> ${targetUser}\n<:VC_reason:1478517122929004544> __${String(reason).slice(0, 500)}__\n**Rimosso warn #${removeId}**${tradeLine}`,
      )
      .setColor(SUCCESS_COLOR);
  }
  try {
    const { notifyStaffWarnRemoved, memberDisplayName } = require("../../site/staff/siteStaffEventNotifications") as typeof import("../../site/staff/siteStaffEventNotifications");
    void notifyStaffWarnRemoved({
      guild,
      staffUserId: targetUser.id,
      removeId,
      reason: reason || `Rimozione warn #${removeId}`,
      actorName: memberDisplayName(null, actorUser, actorUser?.id),
      warnCountAfter: Math.max(0, Number(s.warnCount || 0)),
    }).catch(() => 0);
  } catch (_) {}
  try {
    require("../../site/staff/siteStaffProfileApi").clearStaffProfileCacheForUser(targetUser.id, {
      action: "warn_rm",
    });
  } catch (_) {}
  return {
    ok: true,
    tradedPositives,
    message: tradedPositives
      ? `<a:VC_Verified:1482532479637127188> Warn rimosso. Scambiate anche **${tradedPositives}** positive.`
      : null,
  };
}

function actorIsHighStaffOrAbove(member?) {
  const cache = member?.roles?.cache;
  if (!cache) return false;
  const allowRoles = [
    IDs.roles.Founder,
    IDs.roles.Manager,
    IDs.roles.Admin,
    IDs.roles.Director,
    IDs.roles.HighStaff,
  ].filter(Boolean);
  return allowRoles.some((roleId?) => cache.has(roleId));
}

async function runProfileStaffCompleteDepex(guild?, client?, targetUser?, actorMember?, reason?) {
  const actorUser = actorMember?.user || null;
  if (!actorUser || String(targetUser?.id || "") === String(actorUser.id || "")) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Non puoi usare questa azione su te stesso." };
  }
  if (!actorIsHighStaffOrAbove(actorMember)) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Solo da **High Staff** in su." };
  }
  const resolveMember = createMemberResolver(guild);
  const member = await resolveMember(targetUser.id);
  if (!member) {
    return { ok: false, message: "<:VC_Attention:1482534443632558151> Utente non trovato nel server." };
  }
  /* staffCareerRankGuard1 */
  {
    const rankGate = assertStaffCareerHierarchy(actorMember, member, {});
    if (!rankGate.ok) return rankGate;
  }
  const completeDepexRoleChain = [
    ROLE_HELPER,
    ROLE_MODERATOR,
    ROLE_SENIOR_MODERATOR,
    ROLE_DIRECTOR,
    ROLE_ADMIN,
    ROLE_MANAGER,
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
    /* depexPmOnlyFullFix1: depex_full su PM-only → stesso path di depex_pm */
    if (ROLE_PARTNER_MANAGER && member.roles.cache.has(ROLE_PARTNER_MANAGER)) {
      return runProfileStaffDepex(guild, client, targetUser, actorUser, reason, "partner_manager");
    }
    if (ROLE_BLOGGER && member.roles.cache.has(ROLE_BLOGGER)) {
      return runProfileStaffDepex(guild, client, targetUser, actorUser, reason, "blogger");
    }
    return { ok: false, message: "<:VC_Attention:1482534443632558151> L'utente non ha un ruolo staff da depexare." };
  }
  const isAdminOrAbove = [ROLE_ADMIN, ROLE_MANAGER, ROLE_CO_OWNER, ROLE_OWNER].filter(Boolean).includes(roleToRemove);
  const roleIdsToRemove = [
    ROLE_STAFF,
    roleToRemove,
    ...(ROLE_BLOGGER ? [ROLE_BLOGGER] : []),
    ...(isAdminOrAbove ? [ROLE_HIGH_STAFF] : []),
    ...stafferAwardRoleIds(),
  ].filter(Boolean);
  await member.roles.remove(roleIdsToRemove).catch(() => null);
  if (ROLE_MEMBER) await member.roles.add(ROLE_MEMBER).catch(() => null);
  const verification = await ensureMultipleRoleStates(
    member,
    [
      ...roleIdsToRemove.map((roleId?) => ({ roleId, shouldHaveRole: false })),
      ...(ROLE_MEMBER ? [{ roleId: ROLE_MEMBER, shouldHaveRole: true }] : []),
    ],
  );
  if (!verification.ok) {
    return { ok: false, message: "<:vegax:1443934876440068179> Depex completo non applicato correttamente." };
  }
  // History BEFORE sync/archive (complete depex previously skipped organico history entirely).
  const profileDoc = await getOrCreateStaffDoc(guild.id, targetUser.id);
  const s = ensureStaff(profileDoc);
  const histEntry = pushRolesHistoryWithActor(s, {
    oldRole: roleToRemove,
    newRole: ROLE_MEMBER || "",
    reason,
    kind: "depex",
    actorUser,
  });
  profileDoc.markModified("staff");
  await profileDoc.save().catch(() => null);
  await mirrorTrackHistory(guild.id, targetUser.id, histEntry, "depex");

  const refreshedMember = (await resolveMember(targetUser.id)) || verification.member || member;
  await syncStaffDbAndPauseChannelAfterDepex(guild, targetUser.id, refreshedMember);

  const pexDepexChannel = await resolveStaffPexDepexChannel(guild, client || guild.client);
  const oldRoleObj = guild.roles.cache.get(roleToRemove);
  const actionEmoji = getStaffRoleEmojiByRoleId(roleToRemove);
  await pexDepexChannel
    ?.send?.({
      content: `**<:cancel:1461730653677551691> DEPEX** ${targetUser}
${actionEmoji} \`${oldRoleObj?.name || roleToRemove}\` <a:VC_Arrow:1482706699365257397> \`${guild.roles.cache.get(ROLE_MEMBER)?.name || "Member"}\`
<:VC_reason:1478517122929004544> __${String(reason || "").slice(0, 500)}__`,
    __skipNoticeEmbed: true,
    })
    .catch(() => null);
  firePexDepexSiteNotif(guild, {
    kind: "depex",
    targetUser,
    oldRoleId: roleToRemove,
    newRoleId: ROLE_MEMBER || "",
    reason,
    actorUser,
    sourceHint: "profile-depex-complete",
  });
  return { ok: true };
}

export = {
  runProfileStaffPex,
  runProspectStaffPex,
  runProspectStaffPexToPartnerManager,
  runProspectStaffPexToBlogger,
  runProfileStaffDepex,
  runProfileStaffCompleteDepex,
  runProfileStaffWarnAdd,
  runProfileStaffWarnRemove,
  getHighestLadderRole,
  getNextLadderRoleId,
  peekDepexLadderTargetRoleId,
  staffLadderRankIndex,
  getMemberStaffLadderRank,
  assertStaffCareerHierarchy,
};