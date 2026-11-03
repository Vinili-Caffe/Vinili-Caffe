const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { getOrCreateStaffDoc, ensureStaff, applyStaffLadderTrackResetToObject } = require("../staffDocUtils") as typeof import("../staffDocUtils");
const { initPartnerManagerFieldsIfMissing } = require("../staffPmUtils") as typeof import("../staffPmUtils");
const { getStaffRoleEmojiByRoleId } = require("../../../Community/utils/staffRoleEmoji") as typeof import("../../../Community/utils/staffRoleEmoji");
const { getGuildChannelCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const { memberHasStaffRole } = require("../../../Community/utils/staffListUtils") as typeof import("../../../Community/utils/staffListUtils");
const { clearStaffPendingPurgeAt } = require("../../../Community/services/userLeaveBackupService") as typeof import("../../../Community/services/userLeaveBackupService");
const { resolveStaffPexDepexChannel } = require("../staffChannelUtils") as typeof import("../staffChannelUtils");
const {
  ROLE_MEMBER,
  ROLE_PARTNER_MANAGER,
  ROLE_BLOGGER,
  ROLE_HELPER,
  STAFF_LADDER_ROLES,
  pushRolesHistoryWithActor,
  mirrorTrackHistory,
  firePexDepexSiteNotif,
  ensureRoleState,
  createMemberResolver,
  applyPexSideEffects,
  getHighestLadderRole,
  resolveGuildActorMember,
  assertStaffCareerHierarchy,
  getNextLadderRoleId,
} = require("./helpers") as typeof import("./helpers");

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

export = {
  runProspectStaffPex,
  runProspectStaffPexToPartnerManager,
  runProspectStaffPexToBlogger,
  runProfileStaffPex,
};
