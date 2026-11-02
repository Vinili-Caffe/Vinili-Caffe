/** Candidature: accetta o rifiuta dal sito. */
const { deleteThreadForMessage } = require("../../../Staff/utils/staffDocUtils") as typeof import("../../../Staff/utils/staffDocUtils");
const { APPLICATION_TYPES } = require("./candidatureEligibility") as typeof import("./candidatureEligibility");
const { applicationTypeLabel, setApplicationMessageStatusColor, resolveSubmissionChannel } = require("./candidatureEmbeds") as typeof import("./candidatureEmbeds");
const { applyCandidatePex } = require("./candidaturePex") as typeof import("./candidaturePex");
const { memberHasCandidatureReviewAccess, parseCandidateTypeFromMessage, resolveCandidatureBoundFromStore, stripDiscordDecorations } = require("./candidatureList") as typeof import("./candidatureList");

const WEB_ACCEPT_PEX_REASON = "Candidatura accettata.";
const APPLICATION_REJECTED_COLOR = "#ED4245";

async function webRejectCandidateApplication(guild?, actorMember?, messageId?, type?, userId?) {
  if (!memberHasCandidatureReviewAccess(actorMember, guild)) {
    return { ok: false, status: 403, message: "Non hai i permessi per rifiutare candidature." };
  }
  const decidedBy = String(actorMember?.id || "");
  const decidedByName = String(
    actorMember?.displayName || actorMember?.user?.globalName || actorMember?.user?.username || "",
  );
  /* candidatureSiteAccept1: candidature dal sito hanno messageId non-snowflake (channelId=site). */
  const mid = String(messageId || "").trim();
  const isDiscordMsgId = /^\d{16,22}$/.test(mid);
  const channel = isDiscordMsgId ? await resolveSubmissionChannel(guild) : null;
  const msg = channel ? await channel.messages.fetch(mid).catch(() => null) : null;
  const bound = msg ? parseCandidateTypeFromMessage(msg) : null;
  let boundType = String(bound?.type || type || "")
    .trim()
    .toLowerCase();
  let boundUserId = String(bound?.userId || userId || "").trim();
  if (!boundUserId || !APPLICATION_TYPES.includes(boundType)) {
    const fromStore = await resolveCandidatureBoundFromStore(guild.id, mid, boundType, boundUserId);
    boundType = fromStore.boundType;
    boundUserId = fromStore.boundUserId;
  }
  if (!boundUserId || !APPLICATION_TYPES.includes(boundType)) {
    return { ok: false, status: 400, message: "Candidatura non trovata o dati incompleti (type/userId)." };
  }
  if (msg) {
    await setApplicationMessageStatusColor(msg, APPLICATION_REJECTED_COLOR, decidedBy, decidedByName);
    await deleteThreadForMessage(guild, msg);
  }
  /* notifCandRejectClear1: sempre workflow + purge inbox staff (come accept) */
  try {
    const { updateStaffWorkflowFromMessage } = require("../../workflow/siteStaffWorkflowStore") as typeof import("../../workflow/siteStaffWorkflowStore");
    await updateStaffWorkflowFromMessage(guild.id, "candidature", String(messageId), "rejected", {
      decidedBy,
      decidedByName,
    });
  } catch (_) {}
  try {
    const {
      clearWorkflowLifecycleNotifs,
      inboxOpenUrl,
    } = require("../../workflow/siteStaffWorkflowNotifications") as typeof import("../../workflow/siteStaffWorkflowNotifications");
    const { removeSiteInAppNotificationsMatching } = require("../../notifications/siteInAppNotificationsService") as typeof import("../../notifications/siteInAppNotificationsService");
    const mid = String(messageId || "").trim();
    const openUrls = mid ? [inboxOpenUrl("candidature", mid)] : [];
    await clearWorkflowLifecycleNotifs({
      workflowQueue: "candidature",
      dedupeKey: mid,
      userId: boundUserId,
    }).catch(() => null);
    if (mid) {
      await removeSiteInAppNotificationsMatching({
        exactKeys: [`inbox:candidature:new:${mid}`],
        openUrls,
        forceDismiss: true,
      }).catch(() => null);
    }
  } catch (_) {}
  const rejType = boundType;
  const rejUid = boundUserId;
  if (rejUid && APPLICATION_TYPES.includes(rejType)) {
    try {
      const { enqueueSiteInAppNotification } = require("../../notifications/siteInAppNotificationsService") as typeof import("../../notifications/siteInAppNotificationsService");
      const label = applicationTypeLabel(rejType);
      const mid = String(messageId || "");
      const openUrl = mid
        ? `/candidature/?chat=${encodeURIComponent(`candidature:${mid}`)}`
        : "/candidature/";
      await enqueueSiteInAppNotification({
        guildId: guild.id,
        userId: rejUid,
        title: "Candidatura rifiutata",
        body: `La tua candidatura per ${label} non è stata accettata. Puoi inviare una nuova richiesta dopo il cooldown indicato sul sito.`,
        kind: "workflow_decision",
        channel: "personal",
        openUrl,
        dedupeKey: `cand-rej-${rejType}-${rejUid}-${messageId}`,
        dedupeWindowMs: 86_400_000,
        replaceDedupe: true,
      });
    } catch (_) {}
  }
  return { ok: true, status: 200, message: "Candidatura rifiutata." };
}

async function webAcceptCandidateApplication(guild?, actorMember?, messageId?, type?, userId?, reason?) {
  if (!memberHasCandidatureReviewAccess(actorMember, guild)) {
    return { ok: false, status: 403, message: "Non hai i permessi per accettare candidature." };
  }
  const trimmedReason = String(reason || "").trim() || WEB_ACCEPT_PEX_REASON;
  const decidedBy = String(actorMember?.id || "");
  const decidedByName = String(
    actorMember?.displayName || actorMember?.user?.globalName || actorMember?.user?.username || "",
  );
  /* candidatureSiteAccept1: candidature dal sito → niente messaggio Discord; usa type/userId body (+ store). */
  const mid = String(messageId || "").trim();
  const isDiscordMsgId = /^\d{16,22}$/.test(mid);
  const channel = isDiscordMsgId ? await resolveSubmissionChannel(guild) : null;
  const msg = channel ? await channel.messages.fetch(mid).catch(() => null) : null;
  const bound = msg ? parseCandidateTypeFromMessage(msg) : null;
  let boundType = String(bound?.type || type || "")
    .trim()
    .toLowerCase();
  let boundUserId = String(bound?.userId || userId || "").trim();
  if (!boundUserId || !APPLICATION_TYPES.includes(boundType)) {
    const fromStore = await resolveCandidatureBoundFromStore(guild.id, mid, boundType, boundUserId);
    boundType = fromStore.boundType;
    boundUserId = fromStore.boundUserId;
  }
  if (!boundUserId || !APPLICATION_TYPES.includes(boundType)) {
    return { ok: false, status: 400, message: "Candidatura non trovata o dati incompleti (type/userId)." };
  }
  /* Se c’è messaggio Discord, preferisci i dati parsati; altrimenti body/store (sito). */
  const status = await applyCandidatePex(guild, actorMember, boundType, boundUserId, trimmedReason, msg);
  const ok = !String(status || "").toLowerCase().includes("impossibile") && !String(status || "").toLowerCase().includes("non trovato");
  if (ok) {
    try {
      const { updateStaffWorkflowFromMessage } = require("../../workflow/siteStaffWorkflowStore") as typeof import("../../workflow/siteStaffWorkflowStore");
      await updateStaffWorkflowFromMessage(guild.id, "candidature", String(messageId), "accepted", {
        decidedBy,
        decidedByName,
      });
    } catch (_) {}
  }
  return {
    ok,
    status: ok ? 200 : 400,
    message: stripDiscordDecorations(status) || (ok ? "Candidatura accettata." : "Operazione non riuscita."),
  };
}

export = { webRejectCandidateApplication, webAcceptCandidateApplication };
