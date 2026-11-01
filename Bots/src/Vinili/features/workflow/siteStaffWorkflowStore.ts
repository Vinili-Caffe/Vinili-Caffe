const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { SiteDocument } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const {
  guildMemberDisplayAvatarUrlDynamic,
  userAvatarUrlDynamic,
  normalizeDiscordCdnAvatarUrl,
  sitePreferredAvatarUrl,
} = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const {
  getPauseStatusLabel,
  getPausePhase,
  getPauseTimingText,
  computePauseScaledDaysThisYear,
  getCurrentYearBoundsUtc,
  getTodayUtc,
  formatPauseRoleLabelForMessage,
  normalizePauseRoleChoice,
} = require("../../Utils/Pause/pauseHandlersUtils") as typeof import("../../Utils/Pause/pauseHandlersUtils");
const { resolveSubmissionChannel } = require("../../Events/interaction/candidatureApplicationHandlers") as typeof import("../../Events/interaction/candidatureApplicationHandlers");
const {
  listCandidatureApplications,
  getCandidatureApplicationDetail,
  parseCandidateTypeFromMessage,
} = require("../../Events/interaction/candidatureApplicationHandlers") as typeof import("../../Events/interaction/candidatureApplicationHandlers");
const {
  parseAppealFromMessageOrEmbed,
  deriveAppealStatus,
  autoCloseObsoletePendingAppeals,
} = require("../staff/siteStaffAppealsRuntime") as typeof import("../staff/siteStaffAppealsRuntime");
const { memberHasResocontoButtonAccess } = require("../../Utils/Staff/resocontoAccess") as typeof import("../../Utils/Staff/resocontoAccess");
const { RESOCONTO_APPLY_PREFIX, RESOCONTO_REJECT_PREFIX } = require("../../Events/interaction/resocontoHandlers") as typeof import("../../Events/interaction/resocontoHandlers");
const { buildWorkflowDedupeKey, resocontoActionLabelForKey, buildResocontoInboxPreview, deriveResocontoStaffFlags, parseResocontoOutcomeFromContent, deriveResocontoStatusLabel, resolveResocontoDocStatus } = require("./workflowLabels") as typeof import("./workflowLabels");
const { memberToSubjectFields, resolveWorkflowSubject } = require("./workflowSubjects") as typeof import("./workflowSubjects");
const { docToListItem, parseNumberedQaBlocks, docToDetail, snowflakeToDate } = require("./workflowSerialize") as typeof import("./workflowSerialize");
const { enrichResocontoDetailChart, enrichResocontoRolesHistory } = require("./workflowResocontoHistory") as typeof import("./workflowResocontoHistory");
const { WORKFLOW_DOC, upsertStaffWorkflowItem, updateStaffWorkflowStatusByDedupe, updateStaffWorkflowFromMessage, updateStaffWorkflowFromPause } = require("./workflowWrites") as typeof import("./workflowWrites");
const { listUserWorkflowsForMember, listUserInvitedSubjectChats, getUserWorkflowDetailFromDb, getPendingPauseWorkflowForMember, getStaffWorkflowDetailFromDb, upsertPauseWorkflowFromPause } = require("./workflowQueries") as typeof import("./workflowQueries");
const { listStaffWorkflowFromDb } = require("./workflowList") as typeof import("./workflowList");
const { memberStillRelevantForResoconto, memberEligibleForPauseRole, autoCancelPendingPausesIfNotEligible, reconcilePendingPauseWorkflows, parseResocontoFromMessage, syncAppealsToWorkflowStore, syncResocontiToWorkflowStore, ensurePauseWorkflowDoc, syncPauseWorkflowFieldsFromProfiles, syncPausesToWorkflowStore, persistAppealWorkflowFromMessage, persistAppealWorkflowFromPayload } = require("./workflowSync") as typeof import("./workflowSync");
const { persistCandidatureWorkflowFromMessage, persistCandidatureWorkflowFromPayload, persistResocontoWorkflowFromMessage, persistResocontoWorkflowFromPayload, workflowActorExtras, resocontoWorkflowItemFromDoc, resocontoWorkflowItemFromSnapshot } = require("./workflowPersist") as typeof import("./workflowPersist");
const { cancelPendingResocontiWorkflowForUser, pruneDepexedPendingResoconti, cancelPendingPauseWorkflowForUser, filterPauseInboxItemsCachedOnly, prunePendingPauseInboxUsers } = require("./workflowAutoCancel") as typeof import("./workflowAutoCancel");






const BACKFILL_STATE_KEY = "staffWorkflowBackfillAt";
const BACKFILL_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const INBOX_SYNC_MIN_MS = 120000;
const INBOX_PRUNE_MIN_MS = 60000;
let backfillInFlight = null;

async function backfillStaffWorkflowFromDiscord(client?, guild?, viewerMember?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId) return { ok: false, counts: {} };
  const counts = { pause: 0, candidature: 0, appelli: 0, resoconti: 0 };

  counts.pause = await syncPausesToWorkflowStore(client, guildId);

  const cands = await listCandidatureApplications(guild, { scope: "all", limit: 100 });
  for (const item of cands) {
    const detail = await getCandidatureApplicationDetail(guild, item.messageId).catch(() => null);
    const member = guild ? await getGuildMemberCached(guild, item.userId).catch(() => null) : null;
    const subject = await resolveWorkflowSubject(guild?.client || client, guild, item.userId);
    const fromMember = memberToSubjectFields(member, item.userId);
    await upsertStaffWorkflowItem({
      guildId,
      queue: "candidature",
      dedupeKey: buildWorkflowDedupeKey("candidature", [item.messageId]),
      userId: item.userId,
      messageId: item.messageId,
      channelId: item.channelId,
      type: item.type,
      status: item.status,
      title: item.title,
      preview: item.preview,
      content: detail?.body || item.preview,
      fields: detail?.fields || [],
      createdAt: item.createdAt,
      displayName: fromMember.displayName || subject.displayName || "",
      avatarUrl: fromMember.avatarUrl || subject.avatarUrl || "",
    });
    counts.candidature += 1;
  }

  counts.appelli = await syncAppealsToWorkflowStore(guild, { scope: "all", maxPages: 10 });

  const channelId = String(IDs.channels?.resocontiStaff || IDs.channels?.valutazioniStaff || "").trim();
  if (channelId) {
    counts.resoconti = await syncResocontiToWorkflowStore(guild, { maxPages: 10 });
  }

  await setBotState(BACKFILL_STATE_KEY, Date.now()).catch(() => null);
  return { ok: true, counts };
}

async function scheduleStaffWorkflowBackfill(client?, guild?, viewerMember?, opts: Record<string, any> = {}) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !client) return false;
  const force = Boolean(opts.force);
  const existing = await SiteDocument.countDocuments({ docType: WORKFLOW_DOC, guildId }).catch(() => 0);
  const last = Number((await getBotState(BACKFILL_STATE_KEY, 0)) || 0);
  const due = Date.now() - last > BACKFILL_MIN_INTERVAL_MS;
  if (!force && existing > 0 && !due) return false;
  if (backfillInFlight) return true;
  backfillInFlight = backfillStaffWorkflowFromDiscord(client, guild, viewerMember)
    .catch((err?) => {
      global.logger?.warn?.("[staff-workflow] backfill failed:", err?.message || err);
      return { ok: false };
    })
    .finally(() => {
      backfillInFlight = null;
    });
  if (opts.awaitCompletion) {
    await backfillInFlight.catch(() => null);
  }
  return true;
}

async function listStaffWorkflowForInbox(client?, guild?, viewerMember?, queue?, opts: Record<string, any> = {}) {
  const q = String(queue || "").trim().toLowerCase();
  const guildId = String(guild?.id || "").trim();

  if (q === "appelli" && guild) {
    const appealSyncKey = `appeals:${guildId}`;
    if (!(listStaffWorkflowForInbox as any).__syncAt) (listStaffWorkflowForInbox as any).__syncAt = new Map();
    const lastAppeal = Number((listStaffWorkflowForInbox as any).__syncAt.get(appealSyncKey) || 0);
    const listScope = String(opts.scope || "pending").toLowerCase();
    if (opts.forceSync || Date.now() - lastAppeal > INBOX_SYNC_MIN_MS) {
      (listStaffWorkflowForInbox as any).__syncAt.set(appealSyncKey, Date.now());
      /* inboxLoadFast1: sync Discord sempre in background — lista DB subito */
      void syncAppealsToWorkflowStore(guild, {
        scope: listScope === "pending" ? "pending" : "all",
        maxPages: opts.forceSync ? 4 : 2,
        skipSanctionCheck: Boolean(opts.forceSync),
      }).catch(() => 0);
    }
  }

  if (q === "pause" && client && guildId) {
    const pauseSyncKey = `pause:${guildId}`;
    if (!(listStaffWorkflowForInbox as any).__syncAt) (listStaffWorkflowForInbox as any).__syncAt = new Map();
    const last = Number((listStaffWorkflowForInbox as any).__syncAt.get(pauseSyncKey) || 0);
        if (opts.forceSync || Date.now() - last > INBOX_SYNC_MIN_MS) {
      (listStaffWorkflowForInbox as any).__syncAt.set(pauseSyncKey, Date.now());
      void syncPauseWorkflowFieldsFromProfiles(guildId).catch(() => 0);
    void syncPausesToWorkflowStore(client, guildId).catch(() => 0);
    }
  }

        if (q === "resoconti" && guild) {
    const resoSyncKey = `resoconti:${guildId}`;
    if (!(listStaffWorkflowForInbox as any).__syncAt) (listStaffWorkflowForInbox as any).__syncAt = new Map();
    const lastReso = Number((listStaffWorkflowForInbox as any).__syncAt.get(resoSyncKey) || 0);
    if (opts.forceSync || Date.now() - lastReso > INBOX_SYNC_MIN_MS) {
      (listStaffWorkflowForInbox as any).__syncAt.set(resoSyncKey, Date.now());
      void syncResocontiToWorkflowStore(guild, { maxPages: opts.forceSync ? 2 : 2 }).catch(() => 0);
    }
    if (!(listStaffWorkflowForInbox as any).__pruneAt) (listStaffWorkflowForInbox as any).__pruneAt = new Map();
    const lastPrune = Number((listStaffWorkflowForInbox as any).__pruneAt.get(resoSyncKey) || 0);
    if (opts.forceSync || Date.now() - lastPrune > INBOX_PRUNE_MIN_MS) {
      (listStaffWorkflowForInbox as any).__pruneAt.set(resoSyncKey, Date.now());
      void pruneDepexedPendingResoconti(guild, guildId).catch(() => 0);
    }
  }

  let result = await listStaffWorkflowFromDb(client, guildId, queue, opts);
  let items = result.items;

  /* inboxLoadFast1: empty pending → kick sync in background, niente secondo await Discord */
  if (
    q === "appelli" &&
    guild &&
    opts.forceSync &&
    String(opts.scope || "pending").toLowerCase() === "pending" &&
    !items.length
  ) {
    void syncAppealsToWorkflowStore(guild, {
      scope: "pending",
      maxPages: 6,
      skipSanctionCheck: true,
    }).catch(() => 0);
  }

  if (q === "appelli" && guild) {
    const appealSyncKey = `appeals:${guildId}`;
    if (!(listStaffWorkflowForInbox as any).__pruneAt) (listStaffWorkflowForInbox as any).__pruneAt = new Map();
    const lastAppealPrune = Number((listStaffWorkflowForInbox as any).__pruneAt.get(appealSyncKey) || 0);
    if (opts.forceSync || Date.now() - lastAppealPrune > INBOX_PRUNE_MIN_MS) {
      (listStaffWorkflowForInbox as any).__pruneAt.set(appealSyncKey, Date.now());
      void autoCloseObsoletePendingAppeals(guild, { limit: 30 }).catch(() => 0);
    }
  }

  if (q === "pause" && guild) {
    let knownStaffIds = null;
    try {
      const { loadRosterSnapshot } = require("../staff/siteStaffRosterCache") as typeof import("../staff/siteStaffRosterCache");
      const snap = await loadRosterSnapshot(guildId).catch(() => null);
      if (Array.isArray(snap?.userIds) && snap.userIds.length) {
        knownStaffIds = new Set(snap.userIds.map((id?) => String(id || "").trim()).filter(Boolean));
      }
    } catch (_) {}
        items = filterPauseInboxItemsCachedOnly(guild, items, knownStaffIds);
    const pausePruneKey = `pausePrune:${guildId}`;
    if (!(listStaffWorkflowForInbox as any).__pruneAt) (listStaffWorkflowForInbox as any).__pruneAt = new Map();
    const lastPausePrune = Number((listStaffWorkflowForInbox as any).__pruneAt.get(pausePruneKey) || 0);
    if (opts.forceSync || Date.now() - lastPausePrune > INBOX_PRUNE_MIN_MS) {
      (listStaffWorkflowForInbox as any).__pruneAt.set(pausePruneKey, Date.now());
      const pendingSnapshot = items.filter((item?) => String(item?.status || "") === "pending");
      void prunePendingPauseInboxUsers(guild, client, guildId, pendingSnapshot).catch((err?) => {
        global.logger?.warn?.("[staffWorkflow] prune depexed pauses:", err?.message || err);
      });
    }
  }
  if (q === "resoconti" && viewerMember?.id) {
    items = items.map((item?) => ({
      ...item,
      canAct:
        item.status === "pending" &&
        memberHasResocontoButtonAccess(viewerMember, {
          kind: item.kind,
          userId: item.userId,
          roleId: item.roleId,
        }),
    }));
  }
  return {
    items,
    pagination: result.pagination,
    week: result.week ?? null,
    weeks: result.weeks,
  };
}

export = {
  WORKFLOW_DOC,
  buildWorkflowDedupeKey,
  upsertStaffWorkflowItem,
  updateStaffWorkflowStatusByDedupe,
  updateStaffWorkflowFromMessage,
  updateStaffWorkflowFromPause,
  cancelPendingResocontiWorkflowForUser,
  cancelPendingPauseWorkflowForUser,
  autoCancelPendingPausesIfNotEligible,
  reconcilePendingPauseWorkflows,
  pruneDepexedPendingResoconti,
  memberStillRelevantForResoconto,
  memberEligibleForPauseRole,
  listStaffWorkflowFromDb,
  listStaffWorkflowForInbox,
  listUserWorkflowsForMember,
  listUserInvitedSubjectChats,
  getUserWorkflowDetailFromDb,
  getPendingPauseWorkflowForMember,
  getStaffWorkflowDetailFromDb,
  scheduleStaffWorkflowBackfill,
  syncPausesToWorkflowStore,
  syncPauseWorkflowFieldsFromProfiles,
  upsertPauseWorkflowFromPause,
  ensurePauseWorkflowDoc,
  persistCandidatureWorkflowFromMessage,
  persistCandidatureWorkflowFromPayload,
  persistAppealWorkflowFromMessage,
  persistAppealWorkflowFromPayload,
  persistResocontoWorkflowFromMessage,
  persistResocontoWorkflowFromPayload,
  parseAppealFromMessageOrEmbed,
  deriveAppealStatus,
  parseCandidateTypeFromMessage,
  parseResocontoFromMessage,
  syncResocontiToWorkflowStore,
  workflowActorExtras,
  memberToSubjectFields,
  resocontoActionLabelForKey,
  resocontoWorkflowItemFromDoc,
  resocontoWorkflowItemFromSnapshot,
  parseResocontoOutcomeFromContent,
  resolveResocontoDocStatus,
  deriveResocontoStatusLabel,
  buildResocontoInboxPreview,
  deriveResocontoStaffFlags,
};
