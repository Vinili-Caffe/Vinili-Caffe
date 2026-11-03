/** Workflow staff: creazione e aggiornamento delle richieste. */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { stripDiscordDecorations, weekKeyFromDate, buildWorkflowDedupeKey, normalizeStatus, statusLabelFor, normalizeResocontoActionKey } = require("./workflowLabels") as typeof import("./workflowLabels");
const { pickSubjectDisplayName } = require("./workflowSubjects") as typeof import("./workflowSubjects");
const { snowflakeToDate } = require("./workflowSerialize") as typeof import("./workflowSerialize");

const WORKFLOW_DOC = SITE_DOCUMENT_TYPE.STAFF_WORKFLOW;

async function upsertStaffWorkflowItem(payload?) {
  const guildId = String(payload?.guildId || IDs.guilds.main || "").trim();
  const queue = String(payload?.queue || payload?.workflowQueue || "").trim().toLowerCase();
  const userId = String(payload?.userId || "").trim();
  const dedupeKey = String(payload?.dedupeKey || "").trim();
  if (!guildId || !queue || !dedupeKey) return null;

  const statusIncoming = normalizeStatus(payload?.status, "pending");
  const existing = await SiteDocument.findOne({ docType: WORKFLOW_DOC, guildId, dedupeKey })
    .select(
      "workflowDecidedBy workflowDecidedByName decidedAt status workflowSubjectName workflowSubjectAvatarUrl createdAt workflowWeekKey workflowActionKey staffReason workflowFields content body reason",
    )
    .lean()
    .catch(() => null);
  const existingStatus = normalizeStatus(existing?.status, "");
    let status = statusIncoming;
  const preserveDecided =
    queue === "resoconti" &&
    statusIncoming === "pending" &&
    (existingStatus === "cancelled" ||
      existingStatus === "closed" ||
      existingStatus === "accepted" ||
      existingStatus === "rejected");
  if (preserveDecided) {
    status = existingStatus;
  }
  const decidedBy = String(payload?.decidedBy || payload?.workflowDecidedBy || "").trim();
  const subjectDisplayName = pickSubjectDisplayName(
    userId,
    payload?.displayName,
    payload?.subjectDisplayName,
    payload?.workflowSubjectName,
    existing?.workflowSubjectName,
  );
  const subjectAvatarUrl = String(payload?.avatarUrl || payload?.subjectAvatarUrl || payload?.workflowSubjectAvatarUrl || "").trim();
  const incomingWorkflowFields = payload?.workflowFields ?? payload?.fields ?? null;
  const keepEmoji = queue === "resoconti";
  const createdFromPayload = payload?.createdAt ? new Date(payload.createdAt) : null;
  const createdFromSnow = snowflakeToDate(payload?.messageId || payload?.workflowMessageId);
  const createdAt =
    createdFromPayload && !Number.isNaN(createdFromPayload.getTime())
      ? createdFromPayload
      : createdFromSnow;
  const weekKey =
    queue === "resoconti"
      ? String(payload?.weekKey || payload?.workflowWeekKey || "").trim() ||
        weekKeyFromDate(createdAt || existing?.createdAt) ||
        ""
      : "";
  const incomingActionKey = normalizeResocontoActionKey(payload?.actionKey || payload?.workflowActionKey || "");
  const appliedActionKey =
    preserveDecided && existing?.workflowActionKey
      ? normalizeResocontoActionKey(existing.workflowActionKey)
      : incomingActionKey;
  const incomingStaffReason = String(payload?.staffReason || payload?.statusLabel || "").trim();
  const staffReason = (
    preserveDecided && existing?.staffReason
      ? String(existing.staffReason)
      : incomingStaffReason
  ).slice(0, 200);
  const preservedStatusLabel = String(existing?.workflowFields?.statusLabel || existing?.staffReason || "").trim();
  const incomingStatusLabel = String(payload?.statusLabel || payload?.staffReason || "").trim();
  const workflowStatusLabel =
    preserveDecided && preservedStatusLabel
      ? preservedStatusLabel.slice(0, 200)
      : incomingStatusLabel.slice(0, 200);
  const update: Record<string, any> = {
    docType: WORKFLOW_DOC,
    guildId,
    userId,
    dedupeKey,
    workflowQueue: queue,
    workflowKind: String(payload?.kind || payload?.workflowKind || ""),
    workflowType: String(payload?.type || payload?.workflowType || ""),
    workflowMessageId: String(payload?.messageId || payload?.workflowMessageId || ""),
    workflowChannelId: String(payload?.channelId || payload?.workflowChannelId || ""),
    workflowPauseId: String(payload?.pauseId || payload?.workflowPauseId || ""),
    workflowRoleId: payload?.roleId != null ? String(payload.roleId) : "",
    workflowActionKey: appliedActionKey,
    workflowWeekKey: weekKey,
    title: stripDiscordDecorations(payload?.title || "", { keepCustomEmoji: keepEmoji }).slice(0, 120),
    body: stripDiscordDecorations(payload?.preview || payload?.body || "", {
      keepCustomEmoji: keepEmoji,
    }).slice(0, 500),
    /* inboxSheetFullText1: non sovrascrivere content pieno con body/preview corti */
    content: (() => {
      const incoming = stripDiscordDecorations(
        payload?.content || payload?.bodyFull || payload?.body || "",
        { keepNewlines: true, keepCustomEmoji: keepEmoji },
      ).slice(0, 50000);
      const prev = stripDiscordDecorations(existing?.content || "", {
        keepNewlines: true,
        keepCustomEmoji: keepEmoji,
      }).slice(0, 50000);
      if (!incoming) return prev;
      if (!prev) return incoming;
      return incoming.length >= prev.length ? incoming : prev;
    })(),
    reason: (() => {
      const incoming = stripDiscordDecorations(payload?.reason || payload?.motivazione || "", {
        keepNewlines: true,
        keepCustomEmoji: keepEmoji,
      }).slice(0, 4000);
      const prev = stripDiscordDecorations(existing?.reason || "", {
        keepNewlines: true,
        keepCustomEmoji: keepEmoji,
      }).slice(0, 4000);
      if (!incoming) return prev;
      if (!prev) return incoming;
      return incoming.length >= prev.length ? incoming : prev;
    })(),
    status,
    workflowSubjectName:
      subjectDisplayName ||
      pickSubjectDisplayName(userId, existing?.workflowSubjectName) ||
      "",
    workflowSubjectAvatarUrl: subjectAvatarUrl.slice(0, 512) || String(existing?.workflowSubjectAvatarUrl || ""),
    staffReason,
    workflowDecidedBy: decidedBy || String(existing?.workflowDecidedBy || ""),
    decidedAt:
      payload?.decidedAt ||
      (status !== "pending" ? existing?.decidedAt || new Date() : null),
  };
  if (
    Array.isArray(incomingWorkflowFields) &&
    incomingWorkflowFields.length
  ) {
    update.workflowFields = incomingWorkflowFields
      .map((field?) => ({
        name: stripDiscordDecorations(field?.name || "", { keepNewlines: true }).slice(0, 240),
        value: stripDiscordDecorations(field?.value || "", { keepNewlines: true }).slice(0, 8000),
      }))
      .filter((field?) => field.name || field.value)
      .slice(0, 40);
  } else if (
    incomingWorkflowFields &&
    typeof incomingWorkflowFields === "object" &&
    !Array.isArray(incomingWorkflowFields)
  ) {
    const prevFields =
      existing?.workflowFields &&
      typeof existing.workflowFields === "object" &&
      !Array.isArray(existing.workflowFields)
        ? { ...existing.workflowFields }
        : {};
    update.workflowFields = { ...prevFields, ...incomingWorkflowFields };
  }
  if (queue === "resoconti" && workflowStatusLabel) {
    const mergedFields =
      update.workflowFields && typeof update.workflowFields === "object" && !Array.isArray(update.workflowFields)
        ? { ...update.workflowFields }
        : existing?.workflowFields && typeof existing.workflowFields === "object" && !Array.isArray(existing.workflowFields)
          ? { ...existing.workflowFields }
          : {};
    mergedFields.statusLabel = workflowStatusLabel;
    update.workflowFields = mergedFields;
  }

  const updateOps: Record<string, any> = { $set: update };
  if (createdAt) {
    updateOps.$set.createdAt = createdAt;
  } else {
    updateOps.$setOnInsert = { createdAt: new Date() };
  }

  const doc = await SiteDocument.findOneAndUpdate(
    { docType: WORKFLOW_DOC, guildId, dedupeKey },
    updateOps,
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((err?) => {
    global.logger?.warn?.("[staff-workflow] upsert failed:", dedupeKey, err?.message || err);
    return null;
  });
  /* siteLiveAll1 + inboxBadgeLive1: bust summary + WS subito */
  if (doc) {
    try {
      const { invalidateWorkflowSummaryCache } = require("./siteStaffWorkflowApi") as typeof import("./siteStaffWorkflowApi");
      invalidateWorkflowSummaryCache();
    } catch (_) {}
    try {
      const { broadcastSiteStaffWorkflowChangedDebounced } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
      broadcastSiteStaffWorkflowChangedDebounced(queue);
    } catch (_) {}
  }
  return doc;
}

async function updateStaffWorkflowStatusByDedupe(guildId?, dedupeKey?, status?, extras: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const key = String(dedupeKey || "").trim();
  const next = normalizeStatus(status, "closed");
  if (!gid || !key) return null;
  const resolvedStatusLabel =
    String(extras.statusLabel || extras.staffReason || "").trim() || statusLabelFor(next);
  const set: Record<string, any> = {
    status: next,
    decidedAt: extras.decidedAt || new Date(),
    staffReason: resolvedStatusLabel.slice(0, 200),
    workflowDecidedBy: String(extras.decidedBy || "").slice(0, 32),
  };
  const decidedByName = String(extras.decidedByName || extras.decidedByDisplayName || "").trim();
  if (decidedByName) set.workflowDecidedByName = decidedByName.slice(0, 120);
  {
    const existingFieldsDoc = await SiteDocument.findOne({ docType: WORKFLOW_DOC, guildId: gid, dedupeKey: key })
      .select("workflowFields")
      .lean()
      .catch(() => null);
    const mergedFields =
      existingFieldsDoc?.workflowFields &&
      typeof existingFieldsDoc.workflowFields === "object" &&
      !Array.isArray(existingFieldsDoc.workflowFields)
        ? { ...existingFieldsDoc.workflowFields }
        : {};
    mergedFields.statusLabel = resolvedStatusLabel.slice(0, 200);
    set.workflowFields = mergedFields;
  }
  const appliedActionKey = normalizeResocontoActionKey(extras.workflowActionKey || extras.actionKey || "");
  if (appliedActionKey) set.workflowActionKey = appliedActionKey;
  const messageContent = String(extras.messageContent || extras.content || "").trim();
  if (messageContent) {
    set.content = messageContent.slice(0, 50000);
    set.body = stripDiscordDecorations(messageContent, {
      keepNewlines: true,
      keepCustomEmoji: false,
    }).slice(0, 500);
  }
  let doc = await SiteDocument.findOneAndUpdate(
    { docType: WORKFLOW_DOC, guildId: gid, dedupeKey: key },
    { $set: set },
    { new: true },
  ).catch(() => null);
  if (!doc && key.startsWith("resoconti:")) {
    const messageId = key.slice("resoconti:".length);
    if (/^\d{16,22}$/.test(messageId)) {
      doc = await SiteDocument.findOneAndUpdate(
        { docType: WORKFLOW_DOC, guildId: gid, workflowQueue: "resoconti", workflowMessageId: messageId },
    { $set: set },
    { new: true },
  ).catch(() => null);
    }
    if (!doc) {
      const uid = String(extras.userId || "").trim();
      if (/^\d{16,22}$/.test(messageId) && /^\d{16,22}$/.test(uid)) {
        doc = await upsertStaffWorkflowItem({
          guildId: gid,
          queue: "resoconti",
          dedupeKey: key,
          userId: uid,
          messageId,
          channelId: String(extras.channelId || ""),
          kind: String(extras.kind || ""),
          roleId: extras.roleId != null ? String(extras.roleId) : "",
          actionKey: appliedActionKey,
          status: next,
          statusLabel: resolvedStatusLabel || set.staffReason,
          staffReason: resolvedStatusLabel || set.staffReason,
          content: messageContent,
          preview: messageContent.slice(0, 400),
          ...(extras.decidedBy ? { decidedBy: extras.decidedBy } : {}),
          ...(extras.decidedByName ? { decidedByName: extras.decidedByName } : {}),
        });
      }
    }
  }
    if (doc && next !== "pending") {
    try {
      const { broadcastSiteStaffWorkflowChanged } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
      broadcastSiteStaffWorkflowChanged(String(doc.workflowQueue || ""));
    } catch (_) {}
    /* resoPendBadge1 + staffProfLiveAll1: invalida + WS profili aperti */
    try {
      const uid = String(doc.userId || extras.userId || "").trim();
      if (uid) {
        const { clearStaffProfileCacheForUser } = require("../staff/siteStaffProfileApi") as typeof import("../staff/siteStaffProfileApi");
        clearStaffProfileCacheForUser(uid, {
          action: String(doc.workflowQueue || "workflow"),
        });
      }
    } catch (_) {}
    /* smartNotifLifecycle1: decide/close → purge inbox+chat push residue */
    if (["accepted", "rejected", "cancelled", "closed"].includes(String(next || "").toLowerCase())) {
      try {
        const { clearWorkflowLifecycleNotifs } = require("./siteStaffWorkflowNotifications") as typeof import("./siteStaffWorkflowNotifications");
        void clearWorkflowLifecycleNotifs(doc).catch(() => null);
      } catch (_) {}
    }
  }
  return doc;
}

async function updateStaffWorkflowFromMessage(guildId?, queue?, messageId?, status?, extras: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const mid = String(messageId || "").trim();
  if (!gid || !mid) return null;
  const dedupeKey = buildWorkflowDedupeKey(queue, [mid]);
  return updateStaffWorkflowStatusByDedupe(gid, dedupeKey, status, extras);
}

async function updateStaffWorkflowFromPause(guildId?, userId?, pauseId?, status?, extras: Record<string, any> = {}) {
  const dedupeKey = buildWorkflowDedupeKey("pause", [userId, pauseId]);
  const st = String(status || "").trim().toLowerCase();
  const updated = await updateStaffWorkflowStatusByDedupe(guildId, dedupeKey, status, extras);
  if (["accepted", "rejected", "cancelled"].includes(st)) {
    try {
      const { notifyPauseRequesterDecision } = require("./siteStaffWorkflowNotifications") as typeof import("./siteStaffWorkflowNotifications");
      const decidedBy = String(extras.decidedBy || "").trim();
      const uid = String(userId || "").trim();
            if (!(st === "cancelled" && decidedBy && decidedBy === uid)) {
        const fields = updated?.workflowFields || extras.workflowFields || {};
        const start = String(fields.start || extras.start || "").trim();
        const end = String(fields.end || extras.end || "").trim();
        const periodText = start && end ? `${start} → ${end}` : "";
        void notifyPauseRequesterDecision({
          guildId,
          userId: uid,
          pauseId,
          status: st,
          decidedByName: String(extras.decidedByName || "").trim(),
          periodText,
        }).catch(() => false);
      }
    } catch (_) {}
  }
    return updated;
}

export = { WORKFLOW_DOC, upsertStaffWorkflowItem, updateStaffWorkflowStatusByDedupe, updateStaffWorkflowFromMessage, updateStaffWorkflowFromPause };
