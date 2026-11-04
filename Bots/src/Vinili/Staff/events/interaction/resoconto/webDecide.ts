const { getGuildChannelCached } = require("../../../../../shared/discord/interactionEntityCache") as typeof import("../../../../../shared/discord/interactionEntityCache");
const { E } = require("../../../../../shared/emojis/emojiCatalog") as typeof import("../../../../../shared/emojis/emojiCatalog");
const {
  memberHasResocontoButtonAccess,
} = require("../../../../Staff/utils/resocontoAccess") as typeof import("../../../../Staff/utils/resocontoAccess");
const { onResocontoOutcomeRecorded } = require("../../../../Staff/services/resocontoReviewerRewardService") as typeof import("../../../../Staff/services/resocontoReviewerRewardService");
const {
  STAFF_ACTIONS,
  PM_ACTIONS,
  resolveAutoReasonForResocontoAction,
} = require("./sideEffects") as typeof import("./sideEffects");
const {
  fetchActiveResocontoMessage,
  syncResocontoWorkflowOutcome,
  resocontoActorFields,
  appendOutcomeToMessage,
} = require("./workflowSync") as typeof import("./workflowSync");
const {
  applyStaffAction,
  applyPmAction,
  applyStaffResocontoPendingValutazioni,
  resolveStaffResocontoApplyExecution,
} = require("./applyActions") as typeof import("./applyActions");

function stripResocontoWebMessage(text?) {
  return String(text || "")
    .replace(/<a?:[\w~-]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/[*_`~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveResocontoChannelId(channelId?) {
  const fromArg = String(channelId || "").trim();
  if (fromArg === "site") return "site";
  if (/^\d{16,22}$/.test(fromArg)) return fromArg;
  return "site";
}

function buildWebResocontoAlternatives(kind?) {
  if (String(kind || "") === "p") {
    return [
      { actionKey: "rc", label: "Richiamo" },
      { actionKey: "dp", label: "Depex" },
    ];
  }
  return [
    { actionKey: "vp", label: "Valutazione +" },
    { actionKey: "vn", label: "Valutazione -" },
    { actionKey: "nl", label: "Nulla" },
  ];
}

async function decideResocontoFromWeb(guild?, actorMember?, opts: Record<string, any> = {}) {
  const action = String(opts.action || "").trim().toLowerCase();
  const messageId = String(opts.messageId || "").trim();
  const userId = String(opts.userId || "").trim();
  const kind = String(opts.kind || "").trim().toLowerCase();
  const roleId = String(opts.roleId || "").trim();
  let channelId = resolveResocontoChannelId(opts.channelId);
  const reason = String(opts.reason || opts.motivo || "").trim().slice(0, 500);
  const overrideActionKey = String(opts.overrideActionKey || opts.altActionKey || "").trim().toLowerCase();
  const proposedActionKey = String(opts.actionKey || "").trim().toLowerCase();

  const { isWorkflowMessageId } = require("../../../../site/http/discordWorkflowUiGate") as typeof import("../../../../site/http/discordWorkflowUiGate");
  if (!channelId) channelId = "site";

  if (!guild || !actorMember?.id) {
    return { ok: false, status: 400, error: "bad_request", message: "Richiesta non valida." };
  }
  if (!["accept", "reject"].includes(action)) {
    return { ok: false, status: 400, error: "bad_action", message: "Azione non valida." };
  }
  if (!isWorkflowMessageId(messageId) || !/^\d{16,22}$/.test(userId)) {
    return {
      ok: false,
      status: 400,
      error: "missing_fields",
      message: "messageId e userId richiesti.",
    };
  }
  if (kind !== "s" && kind !== "p") {
    return { ok: false, status: 400, error: "bad_kind", message: "Tipo resoconto non valido." };
  }
  if (overrideActionKey === "px" || proposedActionKey === "px") {
    return {
      ok: false,
      status: 400,
      error: "pex_depex_disabled",
      message: "I resoconti non possono suggerire né applicare Pex.",
    };
  }
  if ((overrideActionKey === "dp" || proposedActionKey === "dp") && kind !== "p") {
    return {
      ok: false,
      status: 400,
      error: "pex_depex_disabled",
      message: "Depex dai resoconti è consentito solo per Partner Manager.",
    };
  }

  const accessPayload = { kind, userId, roleId: kind === "s" ? roleId : null };
  if (!memberHasResocontoButtonAccess(actorMember, accessPayload)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Non autorizzato a gestire questo resoconto.",
    };
  }

  const resocontoItemCtx = { messageId, userId, kind, roleId, channelId };
  const ensureResocontoItem = (syncedItem?, extra: Record<string, any> = {}) => {
    if (syncedItem) return syncedItem;
    try {
      const { resocontoWorkflowItemFromSnapshot } = require("../../../../site/workflow/siteStaffWorkflowStore") as typeof import("../../../../site/workflow/siteStaffWorkflowStore");
      return resocontoWorkflowItemFromSnapshot({ ...resocontoItemCtx, ...extra });
    } catch {
      return null;
    }
  };

  const activeMessage =
    channelId && channelId !== "site"
      ? await fetchActiveResocontoMessage(guild, channelId, messageId)
      : null;

  let dbWorkflowDetail = null;
  if (!activeMessage) {
    try {
      const { getStaffWorkflowDetailFromDb } = require("../../../../site/workflow/siteStaffWorkflowStore") as typeof import("../../../../site/workflow/siteStaffWorkflowStore");
      dbWorkflowDetail = await getStaffWorkflowDetailFromDb(
        guild.client,
        guild.id,
        "resoconti",
        messageId,
        userId,
      );
    } catch (_) {
      dbWorkflowDetail = null;
    }
    const dbPending = String(dbWorkflowDetail?.status || "").toLowerCase() === "pending";
    if (!dbPending) {
      const syncedItem = await syncResocontoWorkflowOutcome(guild, channelId, messageId, {
        ...resocontoActorFields(actorMember),
        userId,
        kind,
        roleId: kind === "s" ? roleId : null,
        channelId,
      });
      const item = ensureResocontoItem(syncedItem, { status: "accepted", statusLabel: "Accettata" });
      return {
        ok: false,
        status: 409,
        error: "already_handled",
        message: "Questo resoconto è già stato gestito.",
        ...(item ? { item } : {}),
      };
    }
  }

  const channel =
    channelId && channelId !== "site"
      ? (await getGuildChannelCached(guild, channelId).catch(() => null)) || activeMessage?.channel || null
      : null;
  const markWorkflow = async (status?, statusLabel?, appliedActionKey = "", editedMessage = null) => {
    return syncResocontoWorkflowOutcome(guild, channelId, messageId, {
      ...resocontoActorFields(actorMember),
      userId,
      kind,
      roleId: kind === "s" ? roleId : null,
      channelId,
      actionKey: appliedActionKey,
      accepted: status !== "rejected",
      statusLabel,
      ...(editedMessage ? { message: editedMessage } : {}),
    });
  };
  const decisionLabel = (actionKey?, rejected = false) => {
    if (rejected) return "Azione negata";
    try {
      const { resocontoActionLabelForKey } = require("../../../../site/workflow/siteStaffWorkflowStore") as typeof import("../../../../site/workflow/siteStaffWorkflowStore");
      return resocontoActionLabelForKey(actionKey) || "Accettata";
    } catch {
      return "Accettata";
    }
  };

    if (action === "reject" && !overrideActionKey) {
    const editedMsg = await appendOutcomeToMessage(guild, channelId, messageId, actorMember.id, false, "");
    const syncedItem = await markWorkflow("rejected", decisionLabel("", true), "", editedMsg);
    void onResocontoOutcomeRecorded(guild, channel, actorMember.id, accessPayload).catch(() => null);
    const item = ensureResocontoItem(syncedItem, {
      status: "rejected",
      statusLabel: decisionLabel("", true),
      body: String(editedMsg?.content || ""),
    });
    return {
      ok: true,
      status: 200,
      message: "Resoconto rifiutato (nessuna azione applicata).",
      alternatives: buildWebResocontoAlternatives(kind),
      ...(item ? { item } : {}),
    };
  }

  let resolvedProposedKey = proposedActionKey;
  if (!overrideActionKey && !resolvedProposedKey && activeMessage) {
    try {
      const { parseResocontoFromMessage } = require("../../../../site/workflow/siteStaffWorkflowStore") as typeof import("../../../../site/workflow/siteStaffWorkflowStore");
      const parsed = parseResocontoFromMessage(activeMessage);
      resolvedProposedKey = String(parsed?.actionKey || "").trim().toLowerCase();
    } catch (_) {}
  }
  if (!overrideActionKey && !resolvedProposedKey && dbWorkflowDetail) {
    resolvedProposedKey = String(dbWorkflowDetail.actionKey || "").trim().toLowerCase();
  }

  const acceptDefaultKey = kind === "p" ? "nl" : "batch";
  const effectiveActionKey =
    overrideActionKey ||
    (action === "accept" ? resolvedProposedKey || acceptDefaultKey : "");
  if (kind === "s" && effectiveActionKey && !STAFF_ACTIONS.has(effectiveActionKey)) {
    return { ok: false, status: 400, error: "bad_action_key", message: "Azione staff non valida." };
  }
  if (kind === "p" && effectiveActionKey && !PM_ACTIONS.has(effectiveActionKey)) {
    return { ok: false, status: 400, error: "bad_action_key", message: "Azione PM non valida." };
  }

  const payload = {
    mode: "apply",
    kind,
    userId,
    roleId: kind === "s" ? roleId : null,
    actionKey: effectiveActionKey || (kind === "s" ? "batch" : "nl"),
    messageId,
    explicitChoice: Boolean(overrideActionKey),
  };

  const execution = await resolveStaffResocontoApplyExecution(guild, payload);
  if (execution.alreadyHandled) {
    const handledKey = String(execution.alreadyHandledActionKey || payload.actionKey || "batch").trim();
    const handledLabel = decisionLabel(handledKey);
    const handledStatus =
      handledKey === "vp"
        ? "${E.success} Valutazione Positiva già registrata."
        : handledKey === "vn"
          ? "${E.success} Valutazione Negativa già registrata."
          : "${E.success} Valutazioni già registrate dal sistema.";
    await appendOutcomeToMessage(
      guild,
      channelId,
      messageId,
      actorMember.id,
      true,
      handledStatus,
    );
    await onResocontoOutcomeRecorded(guild, channel, actorMember.id, payload);
    const syncedItem = await markWorkflow("accepted", handledLabel, handledKey);
    const item = ensureResocontoItem(syncedItem, {
      status: "accepted",
      actionKey: handledKey,
      statusLabel: handledLabel,
    });
    return {
      ok: true,
      status: 200,
      message:
        handledKey === "vp"
          ? "Valutazione Positiva già registrata."
          : handledKey === "vn"
            ? "Valutazione Negativa già registrata."
            : "Valutazioni già registrate dal sistema.",
      ...(item ? { item } : {}),
    };
  }

  if (execution.requiresModal && !reason) {
    const modalKey = String(execution.mergedPayload?.actionKey || payload.actionKey || "").trim();
    return {
      ok: false,
      status: 400,
      error: "reason_required",
      message:
        modalKey === "px"
          ? "Inserisci il motivo del Pex."
          : modalKey === "dp"
            ? "Inserisci il motivo del Depex."
            : "Inserisci una motivazione per proseguire.",
      needsReason: true,
      actionKey: modalKey || null,
      alternatives: buildWebResocontoAlternatives(kind),
    };
  }

  let statusText;
  if (execution.pendingManualActions?.length) {
    statusText = await applyStaffResocontoPendingValutazioni(
      guild,
      actorMember,
      payload,
      execution.pendingManualActions,
      reason || null,
      reason ? String(execution.mergedPayload?.actionKey || payload.actionKey || "") : null,
    );
  } else if (payload.kind === "s") {
    statusText = await applyStaffAction(
      guild,
      actorMember,
      execution.mergedPayload || payload,
      reason || execution.autoReason || resolveAutoReasonForResocontoAction(payload) || null,
    );
  } else {
    statusText = await applyPmAction(
      guild,
      payload,
      reason || resolveAutoReasonForResocontoAction(payload) || null,
      actorMember,
    );
  }

  const editedMsg = await appendOutcomeToMessage(guild, channelId, messageId, actorMember.id, true, statusText);
  const appliedKey = effectiveActionKey || payload.actionKey;
  const appliedLabel = decisionLabel(appliedKey);
  const syncedItem = await markWorkflow("accepted", appliedLabel, appliedKey, editedMsg);
  void onResocontoOutcomeRecorded(guild, channel, actorMember.id, payload).catch(() => null);

  const item = ensureResocontoItem(syncedItem, {
    status: "accepted",
    actionKey: appliedKey,
    statusLabel: appliedLabel,
    body: String(editedMsg?.content || ""),
  });

  return {
    ok: true,
    status: 200,
    message: stripResocontoWebMessage(statusText) || "Resoconto applicato.",
    ...(item ? { item } : {}),
  };
}

export = {
  decideResocontoFromWeb,
};
