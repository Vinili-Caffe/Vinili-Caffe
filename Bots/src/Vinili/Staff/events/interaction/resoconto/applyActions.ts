const { getGuildMemberCached } = require("../../../../../shared/discord/interactionEntityCache") as typeof import("../../../../../shared/discord/interactionEntityCache");
const { getOrCreateStaffDoc, ensureStaff } = require("../../../../Staff/utils/staffDocUtils") as typeof import("../../../../Staff/utils/staffDocUtils");
const { initPartnerManagerFieldsIfMissing, syncStaffDbAndPauseChannelAfterDepex } = require("../../../../Staff/utils/staffPmUtils") as typeof import("../../../../Staff/utils/staffPmUtils");
const { applyDepexOneLevel } = require("../../../../Staff/services/staffWarnService") as typeof import("../../../../Staff/services/staffWarnService");
const { clearStaffPendingPurgeAt } = require("../../../../Community/services/userLeaveBackupService") as typeof import("../../../../Community/services/userLeaveBackupService");
const { E } = require("../../../../../shared/emojis/emojiCatalog") as typeof import("../../../../../shared/emojis/emojiCatalog");
const {
  WEEKLY_LIMITS_POSITIVE_REASON,
  WEEKLY_LIMITS_NEGATIVE_REASON,
  ROLE_UP,
  ROLE_PARTNER_MANAGER,
  ROLE_MEMBER,
  ROLE_HELPER,
  ROLE_MODERATOR,
  ROLE_SENIOR_MODERATOR,
  ROLE_DIRECTOR,
  ROLE_ADMIN,
  ROLE_MANAGER,
  ROLE_CO_OWNER,
  ROLE_OWNER,
  fireResocontoPexDepexNotif,
  fireResocontoOutcomeNotif,
  resolvePexDepexLogRoleAfterId,
  resolveAutoReasonForResocontoAction,
  shouldOpenReasonModalForResocontoApply,
  ensureRoleAdded,
  ensureRoleRemoved,
  applyPexSideEffects,
  bumpCandidatureCooldownAfterStaffRemoval,
  applyDepexSideEffects,
  sendPexDepexLog,
} = require("./sideEffects") as typeof import("./sideEffects");

async function applyStaffAction(guild?, actor?, payload?, reasonOverride = null) {
  const member = await getGuildMemberCached(guild, payload.userId);
  if (!member) return `${E.VC_Alert} Utente non trovato nel server.`;

  if (payload.actionKey === "nl") {
    fireResocontoOutcomeNotif(guild, actor, payload.userId, "nl", "Nessuna azione applicata.", payload.messageId);
    return `${E.VC_Alert} Nessuna azione applicata.`;
  }

  const targetUser = member.user;
  if (payload.actionKey === "vp") {
    const profileDoc = await getOrCreateStaffDoc(guild.id, payload.userId);
    const {
      shouldSkipManualResocontoVp,
      resolveResocontoWeekKey,
    } = require("../../../../Staff/services/weeklyStaffResocontoService") as typeof import("../../../../Staff/services/weeklyStaffResocontoService");
    const staffDoc = ensureStaff(profileDoc);
    const reason = String(reasonOverride || "").trim() || WEEKLY_LIMITS_POSITIVE_REASON;
    if (
      staffDoc &&
      shouldSkipManualResocontoVp(staffDoc, resolveResocontoWeekKey(), payload.roleId, reason)
    ) {
      return `${E.success} Valutazione Positiva già registrata.`;
    }
    const { resolveStaffValutazioniChannel } = require("../../../../Staff/utils/staffChannelUtils") as typeof import("../../../../Staff/utils/staffChannelUtils");
    const channel = await resolveStaffValutazioniChannel(guild);
    const { valutazionePositiveAddCore } = require("../../../../Staff/utils/valutazionePanelActions") as typeof import("../../../../Staff/utils/valutazionePanelActions");
    const result = await valutazionePositiveAddCore(profileDoc, targetUser, reason, actor, channel);
    if (!(result?.ok || result?.message)) {
      return `${E.VC_Alert} Errore registrazione valutazione positiva.`;
    }
    return `${E.thumbsup} Registrata Valutazione Positiva.`;
  }

  if (payload.actionKey === "vn") {
    const profileDoc = await getOrCreateStaffDoc(guild.id, payload.userId);
    const {
      shouldSkipManualResocontoVn,
      resolveResocontoWeekKey,
    } = require("../../../../Staff/services/weeklyStaffResocontoService") as typeof import("../../../../Staff/services/weeklyStaffResocontoService");
    const staffDoc = ensureStaff(profileDoc);
    const reason = String(reasonOverride || "").trim() || WEEKLY_LIMITS_NEGATIVE_REASON;
    if (
      staffDoc &&
      shouldSkipManualResocontoVn(staffDoc, resolveResocontoWeekKey(), payload.roleId, reason)
    ) {
      return `${E.success} Valutazione Negativa già registrata.`;
    }
    const { resolveStaffValutazioniChannel } = require("../../../../Staff/utils/staffChannelUtils") as typeof import("../../../../Staff/utils/staffChannelUtils");
    const channel = await resolveStaffValutazioniChannel(guild);
    const { valutazioneNegativeAddCore } = require("../../../../Staff/utils/valutazionePanelActions") as typeof import("../../../../Staff/utils/valutazionePanelActions");
    const result = await valutazioneNegativeAddCore(guild, profileDoc, targetUser, reason, actor, channel);
    if (!(result?.ok || result?.message)) {
      return `${E.VC_Alert} Errore registrazione valutazione negativa.`;
    }
    return `${E.thumbsdown} Registrata Valutazione Negativa.`;
  }

  const roleBeforeId = String(payload.roleId || "");
  const reason = String(reasonOverride || "").trim();
  if (!reason) return `${E.VC_Alert} Motivazione mancante.`;

  if (payload.actionKey === "px") {
    const roleAfterId = ROLE_UP[roleBeforeId] || null;
    if (!roleAfterId) return `${E.VC_Alert} Pex non applicato: nessun ruolo successivo configurato.`;
    if (member.roles.cache.has(roleAfterId)) return `${E.VC_Alert} Pex non applicato: utente ha già il ruolo successivo.`;

    const roleAdded = await ensureRoleAdded(guild, member, roleAfterId);
    if (!roleAdded) return `${E.VC_Alert} Pex non applicato: impossibile assegnare il ruolo successivo.`;
    const sideEffectsApplied = await applyPexSideEffects(guild, member, roleAfterId);
    if (!sideEffectsApplied) return `${E.VC_Alert} Pex applicato parzialmente: side-effect ruoli non completati.`;
    const profileDoc = await getOrCreateStaffDoc(guild.id, payload.userId);
    const s = ensureStaff(profileDoc);
    if (roleAfterId === ROLE_PARTNER_MANAGER) {
      initPartnerManagerFieldsIfMissing(s);
    }
    if (!Array.isArray(s.rolesHistory)) s.rolesHistory = [];
    s.rolesHistory.push({
      oldRole: roleBeforeId,
      newRole: roleAfterId,
      reason,
      date: new Date(),
    });
    profileDoc.markModified("staff");
    await profileDoc.save();
    await clearStaffPendingPurgeAt(guild.id, payload.userId);
    await sendPexDepexLog(guild, "pex", targetUser, roleBeforeId, roleAfterId, reason);
    fireResocontoPexDepexNotif(guild, actor, targetUser, "pex", roleBeforeId, roleAfterId, reason, `resoconto-pex:${payload.userId}`);
    return `${E.success} Pex applicato.`;
  }

  if (payload.actionKey === "dp") {
    if (!member.roles.cache.has(roleBeforeId)) return `${E.VC_Alert} Depex non applicato: ruolo corrente non presente.`;

    let roleAfterId = "";
    if (String(roleBeforeId) === String(ROLE_PARTNER_MANAGER)) {
      const roleRemoved = await ensureRoleRemoved(guild, member, roleBeforeId);
      if (!roleRemoved) return `${E.VC_Alert} Depex non applicato: impossibile rimuovere il ruolo corrente.`;
      const sideEffectsApplied = await applyDepexSideEffects(guild, member, roleBeforeId);
      if (!sideEffectsApplied) return `${E.VC_Alert} Depex applicato parzialmente: side-effect ruoli non completati.`;
    } else {
      const step = await applyDepexOneLevel(guild, member, roleBeforeId);
      if (!step?.ok) {
        return `${E.VC_Alert} Depex non applicato: ${String(step?.reason || "errore sconosciuto")}`;
      }
      roleAfterId = step.newRole != null && step.newRole !== "" ? String(step.newRole) : "";
    }

    const memberAfterDepex = await getGuildMemberCached(guild, payload.userId, { preferFresh: true }).catch(() => member);
    await syncStaffDbAndPauseChannelAfterDepex(guild, payload.userId, memberAfterDepex);
    if (!roleAfterId) roleAfterId = resolvePexDepexLogRoleAfterId(memberAfterDepex);
    const profileDoc = await getOrCreateStaffDoc(guild.id, payload.userId);
    const s = ensureStaff(profileDoc);
    if (!Array.isArray(s.rolesHistory)) s.rolesHistory = [];
    s.rolesHistory.push({
      oldRole: roleBeforeId,
      newRole: roleAfterId || "",
      reason,
      date: new Date(),
    });
    profileDoc.markModified("staff");
    await profileDoc.save().catch(() => null);
    await sendPexDepexLog(guild, "depex", targetUser, roleBeforeId, roleAfterId, reason);
    fireResocontoPexDepexNotif(guild, actor, targetUser, "depex", roleBeforeId, roleAfterId, reason, `resoconto-depex:${payload.userId}`);
    return `${E.success} Depex applicato.`;
  }

  return `${E.VC_Alert} Nessuna operazione eseguita.`;
}

async function applyPmAction(guild?, payload?, reasonOverride = null, actor = null) {
  const member = await getGuildMemberCached(guild, payload.userId);
  if (!member) return `${E.VC_Alert} Utente non trovato nel server.`;

  if (payload.actionKey === "nl") {
    fireResocontoOutcomeNotif(guild, actor, payload.userId, "nl", "Nessuna azione applicata.", payload.messageId);
    return `${E.VC_Alert} Nessuna azione applicata.`;
  }
  if (payload.actionKey === "rc") {
    const reason = String(reasonOverride || "").trim() || "Richiamo resoconto PM";
    fireResocontoOutcomeNotif(guild, actor, payload.userId, "rc", reason, payload.messageId);
    return `${E.VC_Alert} Richiamo non applica modifiche automatiche.`;
  }
  if (payload.actionKey !== "dp") return `${E.VC_Alert} Nessuna operazione eseguita.`;

  /* depexPmKeepStaff1: depex PM = SOLO Partner Manager (+ Member).
     Mai togliere scala staff / Staff / High Staff (prima wipeava dual-track a caso). */
  const hadLadderBefore =
    Boolean(ROLE_HELPER && member.roles.cache.has(ROLE_HELPER)) ||
    Boolean(ROLE_MODERATOR && member.roles.cache.has(ROLE_MODERATOR)) ||
    Boolean(ROLE_SENIOR_MODERATOR && member.roles.cache.has(ROLE_SENIOR_MODERATOR)) ||
    Boolean(ROLE_DIRECTOR && member.roles.cache.has(ROLE_DIRECTOR)) ||
    Boolean(ROLE_ADMIN && member.roles.cache.has(ROLE_ADMIN)) ||
    Boolean(ROLE_MANAGER && member.roles.cache.has(ROLE_MANAGER)) ||
    Boolean(ROLE_CO_OWNER && member.roles.cache.has(ROLE_CO_OWNER)) ||
    Boolean(ROLE_OWNER && member.roles.cache.has(ROLE_OWNER));
  const partnerRoleRemoved = await ensureRoleRemoved(guild, member, ROLE_PARTNER_MANAGER);
  if (!partnerRoleRemoved) return `${E.VC_Alert} Depex PM non applicato: impossibile rimuovere il ruolo Partner Manager.`;
  if (ROLE_MEMBER) {
    const memberRoleAdded = await ensureRoleAdded(guild, member, ROLE_MEMBER);
    if (!memberRoleAdded) return `${E.VC_Alert} Depex PM applicato parzialmente: impossibile ripristinare il ruolo Member.`;
  }
  const memberAfterPmDepex = await getGuildMemberCached(guild, payload.userId, { preferFresh: true }).catch(() => member);
  await syncStaffDbAndPauseChannelAfterDepex(guild, payload.userId, memberAfterPmDepex);
  const depexReason = String(reasonOverride || "").trim() || "Limiti settimanali non raggiunti";
  const logNewRoleId = hadLadderBefore
    ? resolvePexDepexLogRoleAfterId(memberAfterPmDepex) || ROLE_MEMBER || ""
    : ROLE_MEMBER || "";
  await sendPexDepexLog(
    guild,
    "depex",
    member.user,
    ROLE_PARTNER_MANAGER,
    logNewRoleId,
    depexReason,
  );
  fireResocontoPexDepexNotif(
    guild,
    actor,
    member.user,
    "depex",
    ROLE_PARTNER_MANAGER,
    logNewRoleId,
    depexReason,
    `resoconto-pm-depex:${payload.userId}`,
  );
  /* Solo se era PM-only (niente scala) ha senso il cooldown candidatura staff. */
  if (!hadLadderBefore) await bumpCandidatureCooldownAfterStaffRemoval(payload.userId);
  return `${E.success} Depex PM applicato.`;
}

async function applyStaffResocontoPendingValutazioni(
  guild?,
  actor?,
  payload?,
  pendingActions?,
  reasonOverride = null,
  reasonActionKey = null,
) {
  const {
    shouldSkipManualResocontoVp,
    shouldSkipManualResocontoVn,
    resolveResocontoWeekKey,
  } = require("../../../../Staff/services/weeklyStaffResocontoService") as typeof import("../../../../Staff/services/weeklyStaffResocontoService");
  const actions = Array.isArray(pendingActions) ? pendingActions : [];
  if (!actions.length) {
    return `${E.success} Valutazioni già registrate dal sistema.`;
  }

  const resocontoWeekKey = resolveResocontoWeekKey();
  const profileDoc = await getOrCreateStaffDoc(guild.id, payload.userId).catch(() => null);
  const staffDoc = profileDoc ? ensureStaff(profileDoc) : null;
  const actionPriority = { px: 0, dp: 0, vp: 1, vn: 1, nl: 2 };
  const sortedActions = [...actions].sort(
    (left?, right?) =>
      (actionPriority[String(left?.actionKey || "")] ?? 9) -
      (actionPriority[String(right?.actionKey || "")] ?? 9),
  );

  const lines = [];
  for (const action of sortedActions) {
    const actionKey = String(action?.actionKey || "").trim();
    if (!actionKey) continue;
    if (
      actionKey === "vp" &&
      staffDoc &&
      shouldSkipManualResocontoVp(staffDoc, resocontoWeekKey, payload.roleId, action?.reason)
    ) {
      lines.push(`${E.success} Valutazione Positiva già registrata.`);
      continue;
    }
    if (
      actionKey === "vn" &&
      staffDoc &&
      shouldSkipManualResocontoVn(staffDoc, resocontoWeekKey, payload.roleId, action?.reason)
    ) {
      lines.push(`${E.success} Valutazione Negativa già registrata.`);
      continue;
    }
    const useOverride = Boolean(
      reasonOverride &&
        (!reasonActionKey || actionKey === String(reasonActionKey || "").trim()),
    );
    const reason = useOverride
      ? String(reasonOverride).trim()
      : String(action?.reason || "").trim() ||
        resolveAutoReasonForResocontoAction({
          ...payload,
          actionKey,
          resocontoReason: action?.reason,
        });
    const line = await applyStaffAction(guild, actor, { ...payload, actionKey }, reason);
    if (line) lines.push(line);
  }
  return lines.length ? lines.join(" ") : `${E.VC_Alert} Nessuna operazione eseguita.`;
}

async function resolveStaffResocontoApplyExecution(guild?, payload?) {
  if (payload?.kind !== "s") {
    return {
      pendingManualActions: [],
      requiresModal: shouldOpenReasonModalForResocontoApply(payload),
      autoReason: resolveAutoReasonForResocontoAction(payload),
    };
  }

      if (payload?.explicitChoice === true || String(payload?.actionKey || "") === "nl") {
    const actionKey = String(payload.actionKey || "").trim();
    if (actionKey === "nl") {
      return {
        pendingManualActions: [],
        requiresModal: false,
        autoReason: null,
        mergedPayload: payload,
      };
    }
    const mergedPayload = { ...payload, actionKey };
    const reason = resolveAutoReasonForResocontoAction(mergedPayload) || "";
    if (actionKey === "vp" || actionKey === "vn") {
      const {
        shouldSkipManualResocontoVp,
        shouldSkipManualResocontoVn,
        resolveResocontoWeekKey,
      } = require("../../../../Staff/services/weeklyStaffResocontoService") as typeof import("../../../../Staff/services/weeklyStaffResocontoService");
      const profileDoc = await getOrCreateStaffDoc(guild.id, payload.userId).catch(() => null);
      const staffDoc = profileDoc ? ensureStaff(profileDoc) : null;
      const weekKey = resolveResocontoWeekKey();
      const skip =
        actionKey === "vp"
          ? staffDoc &&
            shouldSkipManualResocontoVp(staffDoc, weekKey, payload.roleId, reason)
          : staffDoc &&
            shouldSkipManualResocontoVn(staffDoc, weekKey, payload.roleId, reason);
      if (skip) {
    return {
          pendingManualActions: [],
          requiresModal: false,
          autoReason: null,
          mergedPayload,
          alreadyHandled: true,
          alreadyHandledActionKey: actionKey,
        };
      }
    }
    return {
      pendingManualActions: [{ actionKey, reason }],
      requiresModal: shouldOpenReasonModalForResocontoApply(mergedPayload),
      autoReason: resolveAutoReasonForResocontoAction(mergedPayload),
      mergedPayload,
    };
  }

  const { buildStaffResocontoApplyPlanForMember } = require("../../../../Staff/services/weeklyStaffResocontoService") as typeof import("../../../../Staff/services/weeklyStaffResocontoService");
  const plan = await buildStaffResocontoApplyPlanForMember(
    guild,
    payload.userId,
    payload.roleId,
  );
  const pendingManualActions = Array.isArray(plan?.pendingManualActions) ? plan.pendingManualActions : [];

  const findModalPendingAction = (actions?) =>
    actions.find((action?) =>
      shouldOpenReasonModalForResocontoApply({
        ...payload,
        actionKey: action.actionKey,
        resocontoReason: action.reason,
      }),
    ) || null;

  if (payload.actionKey === "batch" || pendingManualActions.length > 1) {
    if (String(payload.actionKey || "") === "batch" && !pendingManualActions.length) {
      return {
        pendingManualActions: [],
        requiresModal: false,
        autoReason: null,
        plan,
        alreadyHandled: true,
        alreadyHandledActionKey: "batch",
      };
    }
    const modalAction = findModalPendingAction(pendingManualActions);
    return {
      pendingManualActions,
      requiresModal: Boolean(modalAction),
      autoReason: null,
      plan,
      mergedPayload: modalAction
        ? { ...payload, actionKey: modalAction.actionKey, resocontoReason: modalAction.reason }
        : null,
    };
  }

  if (pendingManualActions.length === 1) {
    const only = pendingManualActions[0];
    const mergedPayload = {
      ...payload,
      actionKey: only.actionKey,
      resocontoReason: only.reason,
    };
    return {
      pendingManualActions,
      requiresModal: shouldOpenReasonModalForResocontoApply(mergedPayload),
      autoReason: resolveAutoReasonForResocontoAction(mergedPayload),
      plan,
      mergedPayload,
    };
  }

  if (["vp", "vn", "batch"].includes(String(payload?.actionKey || "")) && !pendingManualActions.length) {
    return {
      pendingManualActions: [],
      requiresModal: false,
      autoReason: null,
      plan,
      alreadyHandled: true,
    };
  }

  return {
    pendingManualActions: [],
    requiresModal: shouldOpenReasonModalForResocontoApply(payload),
    autoReason: resolveAutoReasonForResocontoAction(payload),
    plan,
  };
}

export = {
  applyStaffAction,
  applyPmAction,
  applyStaffResocontoPendingValutazioni,
  resolveStaffResocontoApplyExecution,
};
