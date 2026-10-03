const IDs = require("../Config/ids");
const { assertWebsiteStaffAccess, normalizeHeaderSecret, memberCanViewResocontiInbox } = require("./siteStaffAccessApi");
const { memberIsHighStaffEligible, memberCanReviewAppelli, memberHasDirectorRole } = require("../Staff/staffRoleHierarchy");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const {
  acceptPauseRequestWeb,
  rejectPauseRequestWeb,
  cancelPauseRequestWeb,
} = require("../Pause/pauseWebActionsRuntime");
const {
  memberHasCandidatureReviewAccess,
  webRejectCandidateApplication,
  webAcceptCandidateApplication,
  getCandidatureApplicationDetail,
} = require("../../Events/interaction/candidatureApplicationHandlers");
const { decideUnbanAppeal, decideUnmuteAppeal, getAppealDetail } = require("./siteStaffAppealsRuntime");
const {
  listStaffWorkflowForInbox,
  getStaffWorkflowDetailFromDb,
  scheduleStaffWorkflowBackfill,
  upsertStaffWorkflowItem,
  buildWorkflowDedupeKey,
} = require("./siteStaffWorkflowStore");
const { decideResocontoFromWeb } = require("../../Events/interaction/resocontoHandlers");
const { memberHasResocontoButtonAccess } = require("../Staff/resocontoAccess");

const WORKFLOW_DOC = SITE_DOCUMENT_TYPE.STAFF_WORKFLOW;
const QUEUES = new Set(["summary", "pause", "candidature", "appelli", "resoconti"]);
/* siteApiW3 / workflowCacheFix1 / workflowCacheFix2: solo globalThis (niente const locale → no TDZ) */
const WORKFLOW_SUMMARY_TTL_MS = 15_000;

function getWorkflowSummaryCache() {
  if (!globalThis.__vcWorkflowSummaryCache) globalThis.__vcWorkflowSummaryCache = new Map();
  return globalThis.__vcWorkflowSummaryCache;
}
function getWorkflowSummaryInflight() {
  if (!globalThis.__vcWorkflowSummaryInflight) globalThis.__vcWorkflowSummaryInflight = new Map();
  return globalThis.__vcWorkflowSummaryInflight;
}

function invalidateWorkflowSummaryCache() {
  getWorkflowSummaryCache().clear();
  getWorkflowSummaryInflight().clear();
}

function workflowSummaryCacheKey(member, canManageHighStaff, resocontoWeekKey, guild) {
  const uid = String(member?.id || "").trim();
  const bits = [
    canManageHighStaff ? "1" : "0",
    memberCanReviewAppelli(member) ? "1" : "0",
    memberHasCandidatureReviewAccess(member, guild) ? "1" : "0",
    memberCanViewResocontiInbox(member) ? "1" : "0",
    String(resocontoWeekKey || ""),
  ].join(":");
  return `${uid}|${bits}`;
}

function stripDiscordDecorations(text) {
  return String(text || "")
    .replace(/<a?:[\w~]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/[*_`~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseWorkflowScope(raw) {
  const scope = String(raw || "all").trim().toLowerCase();
  return scope === "pending" ? "pending" : "all";
}

function parseWorkflowListQuery(query) {
  const scope = parseWorkflowScope(query?.scope);
  const page = Math.max(1, Number(query?.page) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(query?.pageSize || query?.limit) || 20));
  const filter = String(query?.filter || query?.kind || query?.type || "")
    .trim()
    .toLowerCase();
  const week = String(query?.week || query?.weekKey || "").trim();
  const userId = String(query?.userId || query?.uid || "").trim();
  return {
    scope,
    page,
    pageSize,
    filter: filter === "all" ? "" : filter,
    week: /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : "",
    userId: /^\d{16,22}$/.test(userId) ? userId : "",
  };
}

async function countPendingWorkflow(guildId, queue, extras = {}) {
  const filter = {
    docType: WORKFLOW_DOC,
    guildId: String(guildId || ""),
    workflowQueue: String(queue || ""),
    status: "pending",
  };
  const weekKey = String(extras.weekKey || "").trim();
  if (weekKey && /^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
    filter.workflowWeekKey = weekKey;
  }
  return SiteDocument.countDocuments(filter).catch(() => 0);
}

async function resolveMainGuild(client) {
  const guildId = String(IDs.guilds.main || "").trim();
  if (!guildId) return null;
  return client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
}

async function buildWorkflowSummary(client, member, canManageHighStaff) {
  const guild = await resolveMainGuild(client);
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server non disponibile." };
  }

  let resocontoWeekKey = "";
  try {
    const { getResocontoCycleWeekKey } = require("../../Services/Staff/weeklyStaffResocontoService");
    resocontoWeekKey = String(getResocontoCycleWeekKey() || "").trim();
  } catch {
    resocontoWeekKey = "";
  }

  const cacheKey = workflowSummaryCacheKey(member, canManageHighStaff, resocontoWeekKey, guild);
  const now = Date.now();
  const hit = getWorkflowSummaryCache().get(cacheKey);
  if (hit && now - hit.at < WORKFLOW_SUMMARY_TTL_MS) {
    return { ...hit.payload, cached: true };
  }
  let inflight = getWorkflowSummaryInflight().get(cacheKey);
  if (inflight) return inflight;

  inflight = (async () => {
    const canReviewAppelli = memberCanReviewAppelli(member);
    const summary = {
      pause: 0,
      candidature: 0,
      appelli: 0,
      resoconti: 0,
    };

    const canReviewCandidature = memberHasCandidatureReviewAccess(member, guild);
    const canViewResoconti = memberCanViewResocontiInbox(member);
    const [pauseN, appelliN, candidatureN, resocontiN] = await Promise.all([
      canManageHighStaff ? countPendingWorkflow(guild.id, "pause") : Promise.resolve(0),
      canReviewAppelli ? countPendingWorkflow(guild.id, "appelli") : Promise.resolve(0),
      canReviewCandidature ? countPendingWorkflow(guild.id, "candidature") : Promise.resolve(0),
      canViewResoconti
        ? countPendingWorkflow(guild.id, "resoconti", { weekKey: resocontoWeekKey })
        : Promise.resolve(0),
    ]);
    summary.pause = pauseN;
    summary.appelli = appelliN;
    summary.candidature = candidatureN;
    summary.resoconti = resocontiN;

    const payload = {
      ok: true,
      status: 200,
      summary,
      permissions: {
        highStaff: canManageHighStaff,
        candidatureReview: canReviewCandidature,
        appelliReview: canReviewAppelli,
        director: memberHasDirectorRole(member),
        canViewResoconti,
      },
      revision: `${summary.pause}:${summary.candidature}:${summary.appelli}:${summary.resoconti}:${resocontoWeekKey}`,
    };
    getWorkflowSummaryCache().set(cacheKey, { at: Date.now(), payload });
    if (getWorkflowSummaryCache().size > 200) {
      const cutoff = Date.now() - WORKFLOW_SUMMARY_TTL_MS;
      for (const [k, v] of getWorkflowSummaryCache()) {
        if (!v || v.at < cutoff) getWorkflowSummaryCache().delete(k);
      }
    }
    return payload;
  })().finally(() => {
    getWorkflowSummaryInflight().delete(cacheKey);
  });

  getWorkflowSummaryInflight().set(cacheKey, inflight);
  return inflight;
}

async function fetchWorkflowItemDetail(client, guild, access, queue, itemId, userId) {
  const canManageHighStaff = memberIsHighStaffEligible(access.member);
  const q = String(queue || "").trim().toLowerCase();
  const id = String(itemId || "").trim();
  const { isDiscordWorkflowChannelPostsEnabled } = require("./discordWorkflowUiGate");
  const discordPosts = isDiscordWorkflowChannelPostsEnabled();

  if (q === "pause" && !canManageHighStaff) {
    return { ok: false, status: 403, error: "forbidden", message: "Solo High Staff." };
  }
  if (q === "candidature" && !memberHasCandidatureReviewAccess(access.member, guild)) {
    return { ok: false, status: 403, error: "forbidden", message: "Non autorizzato." };
  }
  if (q === "appelli" && !memberCanReviewAppelli(access.member)) {
    return { ok: false, status: 403, error: "forbidden", message: "Solo High Staff o Director." };
  }
  if (q === "resoconti") {
    const viewerId = String(access.member?.id || "").trim();
    const subjectId = String(userId || "").trim();
    const canInbox = memberCanViewResocontiInbox(access.member);
    const isSelf = Boolean(viewerId && subjectId && viewerId === subjectId);
    if (!canInbox && !isSelf) {
      return {
        ok: false,
        status: 403,
        error: "forbidden",
        message: "Puoi vedere solo i tuoi resoconti, oppure avere accesso review.",
      };
    }
  }

      if (q === "candidature" && id && discordPosts) {
    const live = await getCandidatureApplicationDetail(guild, id).catch(() => null);
    if (live?.userId && live.body) {
      await upsertStaffWorkflowItem({
        guildId: guild.id,
        queue: "candidature",
        dedupeKey: buildWorkflowDedupeKey("candidature", [id]),
        userId: live.userId,
        messageId: id,
        channelId: live.channelId,
        type: live.type,
        status: live.status,
        title: live.title,
        preview: live.preview,
        content: live.body,
        createdAt: live.createdAt,
      }).catch(() => null);
      const detail = await getStaffWorkflowDetailFromDb(client, guild.id, q, id, live.userId);
      if (detail) {
        return {
          ok: true,
          status: 200,
          queue: q,
          item: {
            ...detail,
            body: live.body,
            content: live.body,
            preview: live.preview || detail.preview,
            title: live.title || detail.title,
            status: live.status || detail.status,
            canAct: live.status === "pending",
            type: live.type || detail.type,
            fields:
              Array.isArray(detail.fields) && detail.fields.length
                ? detail.fields
                : Array.isArray(live.fields)
                  ? live.fields
                  : detail.fields,
          },
        };
      }
    }
  }

    if (q === "appelli" && id && discordPosts) {
    const live = await getAppealDetail(guild, id).catch(() => null);
    if (live?.userId && live.body) {
      await upsertStaffWorkflowItem({
        guildId: guild.id,
        queue: "appelli",
        dedupeKey: buildWorkflowDedupeKey("appelli", [id]),
        userId: live.userId,
        messageId: id,
        channelId: live.channelId,
        kind: live.kind,
        status: live.status,
        title: live.title,
        preview: live.preview,
        content: live.body,
        createdAt: live.createdAt,
        displayName: live.displayName || "",
        avatarUrl: live.avatarUrl || "",
      }).catch(() => null);
      const detail = await getStaffWorkflowDetailFromDb(client, guild.id, q, id, live.userId);
      if (detail) {
        return {
          ok: true,
          status: 200,
          queue: q,
          item: {
            ...detail,
            body: live.body,
            content: live.body,
            preview: live.preview || detail.preview,
            title: live.title || detail.title,
            status: live.status || detail.status,
            canAct: live.status === "pending",
            kind: live.kind || detail.kind,
            fields: Array.isArray(live.fields) && live.fields.length ? live.fields : detail.fields,
            displayName: live.displayName || detail.displayName,
            avatarUrl: live.avatarUrl || detail.avatarUrl,
          },
        };
      }
    }
  }

  const detail = await getStaffWorkflowDetailFromDb(client, guild.id, q, id, userId);
  if (!detail) {
    return { ok: false, status: 404, error: "not_found", message: "Voce non trovata." };
  }
  return { ok: true, status: 200, queue: q, item: detail };
}

async function handleSiteStaffWorkflowGet(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const queue = String(req.query?.queue || "summary").trim().toLowerCase();
    if (!QUEUES.has(queue)) {
      return res.status(400).json({ ok: false, error: "bad_queue", message: "Coda non valida." });
    }

    const guild = await resolveMainGuild(client);
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    const canManageHighStaff = memberIsHighStaffEligible(access.member);
    const listQuery = parseWorkflowListQuery(req.query);
    const itemId = String(req.query?.itemId || req.query?.id || "").trim();
    const userId = String(req.query?.userId || "").trim();
    const forceSync = String(req.query?.sync || "").trim() === "1";

    if (forceSync && queue !== "resoconti") {
            void scheduleStaffWorkflowBackfill(client, guild, access.member, {
        force: true,
        awaitCompletion: false,
      }).catch(() => null);
    }

    if (itemId && queue !== "summary") {
      const detailOut = await fetchWorkflowItemDetail(client, guild, access, queue, itemId, userId);
      return res.status(Number(detailOut.status) || 500).json(detailOut);
    }

    if (queue === "summary") {
      const out = await buildWorkflowSummary(client, access.member, canManageHighStaff);
      if (out && out.ok && out.revision) {
        const etag = `"wfs-${out.revision}"`;
        res.setHeader("ETag", etag);
        res.setHeader("Cache-Control", "private, no-cache");
        const inm = String(req.headers["if-none-match"] || "").trim();
        if (inm && inm === etag) {
          return res.status(304).end();
        }
      }
      return res.status(Number(out.status) || 500).json(out);
    }

    if (queue === "pause" && !canManageHighStaff) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Solo High Staff." });
    }
    if (queue === "candidature" && !memberHasCandidatureReviewAccess(access.member, guild)) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Non autorizzato a revisionare candidature." });
    }
    if (queue === "appelli" && !memberCanReviewAppelli(access.member)) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Solo High Staff o Director." });
    }
    if (queue === "resoconti") {
      const viewerId = String(access.member?.id || access.user?.id || "").trim();
      const canInbox = memberCanViewResocontiInbox(access.member);
      const scopedUid = String(listQuery.userId || "").trim();
      const isSelfScoped = Boolean(scopedUid && viewerId && scopedUid === viewerId);
      /* resoProfile1: self vede i propri; reviewer/HS la coda o qualsiasi profilo */
      if (!canInbox && !isSelfScoped) {
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message: "Puoi vedere solo i tuoi resoconti, oppure avere accesso review.",
        });
      }
      if (!canInbox && isSelfScoped) {
        listQuery.scope = "all";
      }
    }

    const [listOut, summaryOut] = await Promise.all([
      listStaffWorkflowForInbox(client, guild, access.member, queue, {
        ...listQuery,
        forceSync,
      }),
            buildWorkflowSummary(client, access.member, canManageHighStaff).catch(() => null),
    ]);
    return res.status(200).json({
      ok: true,
      queue,
      scope: listQuery.scope,
      filter: listQuery.filter || null,
      userId: listQuery.userId || null,
      week: listOut.week || null,
      weeks: Array.isArray(listOut.weeks) ? listOut.weeks : undefined,
      source: "database",
      count: listOut.items.length,
      items: listOut.items,
      pagination: listOut.pagination,
      ...(summaryOut?.ok && summaryOut.summary
        ? { summary: summaryOut.summary, permissions: summaryOut.permissions }
        : {}),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflows GET:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffWorkflowPost(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const queue = String(body.queue || "").trim().toLowerCase();
    const action = String(body.action || "").trim().toLowerCase();
    if (!QUEUES.has(queue) || queue === "summary") {
      return res.status(400).json({ ok: false, error: "bad_queue", message: "Coda non valida." });
    }

    const guild = await resolveMainGuild(client);
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    const canManageHighStaff = memberIsHighStaffEligible(access.member);
    let result = null;

    if (queue === "pause") {
      if (!canManageHighStaff) {
        return res.status(403).json({ ok: false, error: "forbidden", message: "Solo High Staff." });
      }
      const userId = String(body.userId || "").trim();
      const pauseId = String(body.pauseId || body.id || "").trim();
      if (!userId || !pauseId) {
        return res.status(400).json({ ok: false, error: "missing_fields", message: "userId e pauseId richiesti." });
      }
      if (action === "accept") {
        result = await acceptPauseRequestWeb(client, guild, access.member, userId, pauseId);
      } else if (action === "reject") {
        result = await rejectPauseRequestWeb(client, guild, access.member, userId, pauseId);
      } else if (action === "cancel") {
        result = await cancelPauseRequestWeb(client, guild, access.member, userId, pauseId);
      } else {
        return res.status(400).json({ ok: false, error: "bad_action", message: "Azione non valida." });
      }
    } else if (queue === "candidature") {
      if (!memberHasCandidatureReviewAccess(access.member, guild)) {
        return res.status(403).json({ ok: false, error: "forbidden", message: "Non autorizzato." });
      }
      const messageId = String(body.messageId || "").trim();
      const type = String(body.type || "").trim();
      const userId = String(body.userId || "").trim();
      if (!messageId || !type || !userId) {
        return res.status(400).json({ ok: false, error: "missing_fields", message: "messageId, type e userId richiesti." });
      }
      if (action === "accept") {
        result = await webAcceptCandidateApplication(
          guild,
          access.member,
          messageId,
          type,
          userId,
          body.reason || body.motivo,
        );
      } else if (action === "reject") {
        result = await webRejectCandidateApplication(guild, access.member, messageId, type, userId);
      } else {
        return res.status(400).json({ ok: false, error: "bad_action", message: "Azione non valida." });
      }
    } else if (queue === "appelli") {
      if (!memberCanReviewAppelli(access.member)) {
        return res.status(403).json({ ok: false, error: "forbidden", message: "Solo High Staff o Director." });
      }
      const messageId = String(body.messageId || "").trim();
      const userId = String(body.userId || "").trim();
      const kind = String(body.kind || "").trim();
      if (!messageId || !userId || !kind) {
        return res.status(400).json({ ok: false, error: "missing_fields", message: "messageId, userId e kind richiesti." });
      }
      if (action === "accept") {
        result =
          kind === "unmute"
            ? await decideUnmuteAppeal(guild, userId, messageId, true, access.member)
            : await decideUnbanAppeal(guild, userId, messageId, true, access.member);
      } else if (action === "reject") {
        result =
          kind === "unmute"
            ? await decideUnmuteAppeal(guild, userId, messageId, false, access.member)
            : await decideUnbanAppeal(guild, userId, messageId, false, access.member);
      } else {
        return res.status(400).json({ ok: false, error: "bad_action", message: "Azione non valida." });
      }
    } else if (queue === "resoconti") {
      const messageId = String(body.messageId || "").trim();
      const userId = String(body.userId || "").trim();
      const kind = String(body.kind || "").trim().toLowerCase();
      const roleId = String(body.roleId || "").trim();
      const channelId = String(body.channelId || "").trim();
      const actionKey = String(body.actionKey || "").trim();
      const overrideActionKey = String(body.overrideActionKey || body.altActionKey || "").trim();
      const reason = String(body.reason || body.motivo || "").trim();
      if (!messageId || !userId || !kind) {
        return res.status(400).json({
          ok: false,
          error: "missing_fields",
          message: "messageId, userId e kind richiesti.",
        });
      }
      if (!memberHasResocontoButtonAccess(access.member, { kind, userId, roleId })) {
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message: "Non autorizzato a gestire questo resoconto.",
        });
      }
      if (action !== "accept" && action !== "reject") {
        return res.status(400).json({ ok: false, error: "bad_action", message: "Azione non valida." });
      }
      result = await decideResocontoFromWeb(guild, access.member, {
        action,
        messageId,
        userId,
        kind,
        roleId,
        channelId,
        actionKey,
        overrideActionKey,
        reason,
      });
    } else {
      return res.status(400).json({ ok: false, error: "bad_queue", message: "Coda non valida." });
    }

    const status = Number(result?.status) || (result?.ok ? 200 : 400);
    if (result?.ok) invalidateWorkflowSummaryCache();
    return res.status(status).json({
      ok: Boolean(result?.ok),
      message: stripDiscordDecorations(result?.message) || (result?.ok ? "Operazione completata." : "Operazione non riuscita."),
      ...(result?.item ? { item: result.item } : {}),
      ...(result?.giorniScalati != null ? { giorniScalati: result.giorniScalati } : {}),
      ...(result?.needsReason ? { needsReason: true, actionKey: result.actionKey || null } : {}),
      ...(Array.isArray(result?.alternatives) ? { alternatives: result.alternatives } : {}),
      ...(result?.error ? { error: result.error } : {}),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflows POST:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = {
  handleSiteStaffWorkflowGet,
  handleSiteStaffWorkflowPost,
  invalidateWorkflowSummaryCache,
};
