const { getOrCreateStaffDoc, ensureStaff } = require("../staffDocUtils") as typeof import("../staffDocUtils");
const { syncStaffDbAndPauseChannelAfterDepex } = require("../staffPmUtils") as typeof import("../staffPmUtils");
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { getStaffRoleEmojiByRoleId } = require("../../../Community/utils/staffRoleEmoji") as typeof import("../../../Community/utils/staffRoleEmoji");
const { applyDepexOneLevel } = require("../../../Staff/services/staffWarnService") as typeof import("../../../Staff/services/staffWarnService");
const { applyDepexSideEffects: applyResocontoStaffDepexSideEffects } = require("../../events/interaction/resocontoHandlers") as typeof import("../../events/interaction/resocontoHandlers");
const { resolveStaffPexDepexChannel } = require("../staffChannelUtils") as typeof import("../staffChannelUtils");
const { stafferAwardRoleIds } = require("../staffRoleHierarchy") as typeof import("../staffRoleHierarchy");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const {
  ROLE_MEMBER,
  ROLE_PARTNER_MANAGER,
  ROLE_BLOGGER,
  ROLE_STAFF,
  ROLE_HIGH_STAFF,
  ROLE_HELPER,
  ROLE_MODERATOR,
  ROLE_SENIOR_MODERATOR,
  ROLE_DIRECTOR,
  ROLE_ADMIN,
  ROLE_MANAGER,
  ROLE_CO_OWNER,
  ROLE_OWNER,
  pushRolesHistoryWithActor,
  mirrorTrackHistory,
  firePexDepexSiteNotif,
  ensureMultipleRoleStates,
  createMemberResolver,
  getHighestLadderRole,
  resolveGuildActorMember,
  assertStaffCareerHierarchy,
} = require("./helpers") as typeof import("./helpers");

async function runProfileStaffDepex(guild?, client?, targetUser?, actorUser?, reason?, targetRemoval = "auto") {
  if (String(targetUser.id) === String(actorUser.id)) {
    return { ok: false, message: `${E.VC_Attention} Non puoi usare questa azione su te stesso.` };
  }
  const resolveMember = createMemberResolver(guild);
  const member = await resolveMember(targetUser.id);
  if (!member) {
    return { ok: false, message: `${E.VC_Attention} Utente non trovato nel server.` };
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
        message: `${E.VC_Attention} L'utente non ha il ruolo **Partner Manager**.`,
      };
    }
    const sideOk = await applyResocontoStaffDepexSideEffects(guild, member, ROLE_PARTNER_MANAGER);
    if (!sideOk) {
      return { ok: false, message: `${E.vegax} Depex PM: side-effect ruoli non completati.` };
    }
    oldRoleForLog = ROLE_PARTNER_MANAGER;
    newRoleForLog = ROLE_MEMBER || "";
  } else if (mode === "blogger") {
    if (!ROLE_BLOGGER || !hasBloggerRole) {
      return {
        ok: false,
        message: `${E.VC_Attention} L'utente non ha il ruolo **Blogger**.`,
      };
    }
    await member.roles.remove(ROLE_BLOGGER).catch(() => null);
    const stillHas = (await resolveMember(targetUser.id)) || member;
    if (stillHas.roles?.cache?.has?.(ROLE_BLOGGER)) {
      return { ok: false, message: `${E.vegax} Depex Blogger: impossibile rimuovere il ruolo.` };
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
          `${E.VC_Attention} Nessun ruolo sulla scala staff (Helper→Founder) da depexare. Usa **Depex → Partner Manager** se ha solo PM.`,
      };
    }
    if (!member.roles.cache.has(ladderRole)) {
      return { ok: false, message: `${E.VC_Attention} Ruolo da depexare non presente sull'utente.` };
    }
    const step = await applyDepexOneLevel(guild, member, ladderRole);
    if (!step?.ok) {
      return {
        ok: false,
        message: `${E.VC_Attention} ${String(step?.reason || "Depex non applicato.")}`,
      };
    }
    oldRoleForLog = ladderRole;
    newRoleForLog = step.newRole != null && step.newRole !== "" ? step.newRole : ROLE_MEMBER || "";
  } else if (ladderRole) {
    if (!member.roles.cache.has(ladderRole)) {
      return { ok: false, message: `${E.VC_Attention} Ruolo da depexare non presente sull'utente.` };
    }
    const step = await applyDepexOneLevel(guild, member, ladderRole);
    if (!step?.ok) {
      return {
        ok: false,
        message: `${E.VC_Attention} ${String(step?.reason || "Depex non applicato.")}`,
      };
    }
    oldRoleForLog = ladderRole;
    newRoleForLog = step.newRole != null && step.newRole !== "" ? step.newRole : ROLE_MEMBER || "";
  } else if (hasPmRole) {
    const sideOk = await applyResocontoStaffDepexSideEffects(guild, member, ROLE_PARTNER_MANAGER);
    if (!sideOk) {
      return { ok: false, message: `${E.vegax} Depex PM: side-effect ruoli non completati.` };
    }
    oldRoleForLog = ROLE_PARTNER_MANAGER;
    newRoleForLog = ROLE_MEMBER || "";
  } else if (hasBloggerRole) {
    return runProfileStaffDepex(guild, client, targetUser, actorUser, reason, "blogger");
  } else {
    return {
      ok: false,
      message:
        `${E.VC_Attention} Nessun ruolo staff rilevato per il depex. Per depex manuale sui ruoli usa **Gestione** sul sito staff.`,
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
      content: `**${E.cancel} DEPEX** ${targetUser}
${actionEmoji} \`${oldRoleObj?.name || oldRoleForLog}\` ${E.VC_Arrow} \`${newLabel}\`
${E.VC_reason} __${reason}__`,
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
    return { ok: false, message: `${E.VC_Attention} Non puoi usare questa azione su te stesso.` };
  }
  if (!actorIsHighStaffOrAbove(actorMember)) {
    return { ok: false, message: `${E.VC_Attention} Solo da **High Staff** in su.` };
  }
  const resolveMember = createMemberResolver(guild);
  const member = await resolveMember(targetUser.id);
  if (!member) {
    return { ok: false, message: `${E.VC_Attention} Utente non trovato nel server.` };
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
    return { ok: false, message: `${E.VC_Attention} L'utente non ha un ruolo staff da depexare.` };
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
    return { ok: false, message: `${E.vegax} Depex completo non applicato correttamente.` };
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
      content: `**${E.cancel} DEPEX** ${targetUser}
${actionEmoji} \`${oldRoleObj?.name || roleToRemove}\` ${E.VC_Arrow} \`${guild.roles.cache.get(ROLE_MEMBER)?.name || "Member"}\`
${E.VC_reason} __${String(reason || "").slice(0, 500)}__`,
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
  runProfileStaffDepex,
  runProfileStaffCompleteDepex,
};
