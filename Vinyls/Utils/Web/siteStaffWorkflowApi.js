const IDs = require("../Config/ids");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi");
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
  return {
    scope,
    page,
    pageSize,
    filter: filter === "all" ? "" : filter,
    week: /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : "",
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

  const canReviewAppelli = memberCanReviewAppelli(member);
  const summary = {
    pause: 0,
    candidature: 0,
    appelli: 0,
    resoconti: 0,
  };

  if (canManageHighStaff) {
    summary.pause = await countPendingWorkflow(guild.id, "pause");
  }
  if (canReviewAppelli) {
    summary.appelli = await countPendingWorkflow(guild.id, "appelli");
  }

  if (memberHasCandidatureReviewAccess(member, guild)) {
    summary.candidature = await countPendingWorkflow(guild.id, "candidature");
  }

  let resocontoWeekKey = "";
  try {
    const { getResocontoCycleWeekKey } = require("../../Services/Staff/weeklyStaffResocontoService");
    resocontoWeekKey = String(getResocontoCycleWeekKey() || "").trim();
  } catch {
    resocontoWeekKey = "";
  }
  summary.resoconti = await countPendingWorkflow(guild.id, "resoconti", {
    weekKey: resocontoWeekKey,
  });

  return {
    ok: true,
    status: 200,
    summary,
    permissions: {
      highStaff: canManageHighStaff,
      candidatureReview: memberHasCandidatureReviewAccess(member, guild),
      appelliReview: canReviewAppelli,
      director: memberHasDirectorRole(member),
    },
  };
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

  // Candidature lunghe: rileggi tutti gli embed Discord (il DB può avere solo il 1° chunk).
  // Site-only: salta Discord e usa subito il DB.
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
            preview: live.preview || detail.preview,
            title: live.title || detail.title,
            status: live.status || detail.status,
            canAct: live.status === "pending",
            type: live.type || detail.type,
          },
        };
      }
    }
  }

  // Appelli: rileggi embed Discord per tenere a capo / Q&A (il DB storico può essere "piatto").
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
    const access = await assertWebsiteStaffAccess(client, accessToken);
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
      // Mai attendere il backfill completo: blocca tutte le code inbox (timeout client).
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

    const listOut = await listStaffWorkflowForInbox(client, guild, access.member, queue, {
      ...listQuery,
      forceSync,
    });
    return res.status(200).json({
      ok: true,
      queue,
      scope: listQuery.scope,
      filter: listQuery.filter || null,
      week: listOut.week || null,
      weeks: Array.isArray(listOut.weeks) ? listOut.weeks : undefined,
      source: "database",
      count: listOut.items.length,
      items: listOut.items,
      pagination: listOut.pagination,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflows GET:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffWorkflowPost(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken);
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
};
