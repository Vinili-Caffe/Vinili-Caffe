const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const {
  assertWebsiteStaffAccess,
  normalizeHeaderSecret,
} = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const {
  TASKS_META,
  ALLOWED_TASK_IDS,
  publicTasksMeta,
} = require("./siteStaffCompitiCatalog") as typeof import("./siteStaffCompitiCatalog");
const { currentRomeIsoWeekKey, romeMonthKey, weekKeysInRomeMonth, compitiActiveMonthKey, deadlinesPayload } = require("./compitiCalendar") as typeof import("./compitiCalendar");
const { UPLOAD_ROOT, verifyFileToken } = require("./compitiProofs") as typeof import("./compitiProofs");
const { emptyWeek, sanitizeWeekEntry, loadMap, clearGhostDraftPicks, revertUnreviewedRandomAutoPicks } = require("./compitiWeeks") as typeof import("./compitiWeeks");
const { lockedTaskIdsForMonth, grantCompitiSwapBonus, ensureStafferCompitiSwapBonus, isNewStaffCompitiGrace, ensureMonthPlanForUser } = require("./compitiPlan") as typeof import("./compitiPlan");
const { buildIdentityFromMember, publicProgress, buildPublicPlan, buildMonthEntries, workerMembersCache, scanWorkerMembers, listWorkerMembers, resolveCompitiRoles, warmSiteStaffCompitiWorkersCache } = require("./compitiPeople") as typeof import("./compitiPeople");
const { resolveGuildId, tickStaffCompitiDeadlines, tickStaffCompitiAssignments, tryAutoSubmitCompito, tryAutoFailCompito } = require("./compitiTicks") as typeof import("./compitiTicks");
const { handleSiteStaffCompitiPost } = require("./compitiPost") as typeof import("./compitiPost");


async function handleSiteStaffCompitiGet(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const guildId = resolveGuildId(client) || String(access.member?.guild?.id || "").trim();
    const viewer = access.member;
    const viewerUser = viewer?.user || access.user;
    const viewerId = String(viewer?.id || viewerUser?.id || "").trim();
    const roles = resolveCompitiRoles(viewer, req);
    const highStaff = roles.highStaff;
    const workerSelf = roles.workerSelf;
    const weekKey = currentRomeIsoWeekKey();
    const monthKey = compitiActiveMonthKey(weekKey);
    const deadlines = deadlinesPayload();

    if (roles.deny || (!highStaff && !workerSelf)) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: roles.viewAs
          ? `Preview (${roles.viewAs}): niente accesso ai compiti.`
          : "I compiti settimanali sono riservati allo staff operativo.",
        viewAs: roles.viewAs || null,
      });
    }

    const skipStaffList =
      highStaff &&
      (String(req.query?.skipStaffList || "") === "1" || String(req.query?.skipStaffList || "") === "true");

    let staffList = null;
    if (highStaff && !skipStaffList) {
      // compitiPhoneLoad1: force solo se cache non full — force:true ad ogni GET rallentava il telefono
      const cachedWorkers = workerMembersCache.get(guildId);
      const forceFull = !(cachedWorkers && cachedWorkers.fetchedFull);
      const members = await listWorkerMembers(client, guildId, { force: forceFull });
      staffList = members.map((m?) => buildIdentityFromMember(m, m.user));
    }

    let targetId = viewerId;
    if (highStaff) {
      const q = String(req.query?.userId || "").trim();
      if (/^\d{17,20}$/.test(q)) {
        targetId = q;
      } else if (Array.isArray(staffList) && staffList[0]?.userId) {
        /* HS default: primo staffer in lista, mai il viewer */
        targetId = staffList[0].userId;
      } else {
        /* compitiFirstStaffer1: anche con skipStaffList (prima paint veloce) */
        const cached = workerMembersCache.get(guildId);
        const fromCache = Array.isArray(cached?.members) ? cached.members[0] : null;
        let firstId = fromCache
          ? String(fromCache?.user?.id || fromCache?.id || "").trim()
          : "";
        if (!/^\d{17,20}$/.test(firstId)) {
          try {
            const guild =
              client.guilds.cache.get(guildId) ||
              (await client.guilds.fetch(guildId).catch(() => null));
            const quick = guild ? scanWorkerMembers(guild) : [];
            firstId = quick[0] ? String(quick[0].user?.id || quick[0].id || "").trim() : "";
          } catch (_) {
            firstId = "";
          }
        }
        if (/^\d{17,20}$/.test(firstId)) targetId = firstId;
      }
    }

    let plan = await ensureMonthPlanForUser(guildId, targetId, { monthKey, weekKey });
    await clearGhostDraftPicks(guildId, targetId, monthKey);
    const reverted = await revertUnreviewedRandomAutoPicks(guildId, targetId, monthKey, weekKey, plan);
    plan = reverted.plan || plan;
    const mapFresh = reverted.map || (await loadMap(guildId, targetId));
    const entry = sanitizeWeekEntry(mapFresh[weekKey] || emptyWeek());
    const lockedForUi = lockedTaskIdsForMonth(mapFresh, monthKey, weekKey, plan).filter(
      (id?) => id !== entry.taskId,
    );

    let identity;
    if (highStaff && targetId !== viewerId) {
      const fromList = Array.isArray(staffList)
        ? staffList.find((s?) => s.userId === targetId)
        : null;
      if (fromList) {
        identity = fromList;
      } else {
        // compitiPhoneLoad1: riusa cache workers (skipStaffList) prima di un fetch Discord extra
        const cached = workerMembersCache.get(guildId);
        const hit = Array.isArray(cached?.members)
          ? cached.members.find((m?) => String(m?.user?.id || m?.id || "") === String(targetId))
          : null;
        if (hit) {
          identity = buildIdentityFromMember(hit, hit.user);
        } else {
          try {
            const guild = await client.guilds.fetch(guildId);
            let m = guild.members.cache.get(targetId) || null;
            if (!m) m = await guild.members.fetch(targetId);
            identity = buildIdentityFromMember(m, m.user);
          } catch (_) {
            identity = { userId: targetId, displayName: "Staff", username: "", avatarUrl: "" };
          }
        }
      }
    } else {
      identity = buildIdentityFromMember(viewer, viewerUser);
    }

    const progress = publicProgress(
      weekKey,
      targetId,
      entry,
      lockedForUi,
      monthKey,
      mapFresh,
      deadlines,
      plan,
    );
    const monthEntries = buildMonthEntries(monthKey, targetId, mapFresh, plan, deadlines, weekKey);
    const swapBonus = (await ensureStafferCompitiSwapBonus(client, guildId, targetId, monthKey)).bonus;

    let graceMember = null;
    if (targetId === viewerId) {
      graceMember = viewer;
    } else {
      try {
        const guild =
          client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
        graceMember =
          guild?.members?.cache?.get?.(targetId) ||
          (await guild?.members?.fetch?.(targetId).catch(() => null)) ||
          null;
      } catch (_) {
        graceMember = null;
      }
    }
    const newStaffGraceActive = await isNewStaffCompitiGrace({
      guildId,
      userId: targetId,
      member: graceMember,
    });

    res.setHeader("Cache-Control", "private, no-store");
    const payload: Record<string, any> = {
      ok: true,
      weekKey,
      monthKey,
      mode: highStaff ? "highstaff" : "staff",
      canSubmit: workerSelf && !highStaff,
      canReview: highStaff,
      viewerId,
      targetUserId: targetId,
      deadlines,
      tasks: publicTasksMeta(),
      plan: buildPublicPlan(monthKey, plan, mapFresh, weekKey, swapBonus),
      monthEntries,
      progress,
      identity,
      newStaffGrace: {
        active: Boolean(newStaffGraceActive),
        message: newStaffGraceActive
          ? "Sei stato pexato questa settimana: il compito non è obbligatorio fino a lunedì prossimo."
          : "",
      },
    };
    if (roles.viewAs) {
      payload.viewAs = roles.viewAs;
      payload.viewAsActive = true;
    }
    if (Array.isArray(staffList)) payload.staffList = staffList;
    return res.status(200).json(payload);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-compiti get:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffCompitiFileGet(client?, req?, res?) {
  try {
    const weekKey = decodeURIComponent(String(req.params.weekKey || ""));
    const userId = decodeURIComponent(String(req.params.userId || ""));
    const fileName = decodeURIComponent(String(req.params.fileName || ""));
    if (!/^\d{4}-W\d{2}$/.test(weekKey) || !/^\d{17,20}$/.test(userId) || !fileName || fileName.includes("..")) {
      return res.status(400).end();
    }
    const st = String(req.query.st || "");
    if (!verifyFileToken(st, weekKey, userId, fileName)) {
      return res.status(403).end();
    }
    const fp = path.join(UPLOAD_ROOT, weekKey, userId, path.basename(fileName));
    if (!fp.startsWith(path.join(UPLOAD_ROOT, weekKey, userId))) return res.status(400).end();
    if (fs.existsSync(fp)) {
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.sendFile(fp);
    }
    const { redirectToCdnIfConfigured } = require("../../site/http/siteCdnMedia") as typeof import("../../site/http/siteCdnMedia");
    if (redirectToCdnIfConfigured(res, `uploads/staff-compiti/${weekKey}/${userId}/${path.basename(fileName)}`)) return;
    return res.status(404).end();
  } catch (_) {
    return res.status(500).end();
  }
}

export = {
  handleSiteStaffCompitiGet,
  handleSiteStaffCompitiPost,
  handleSiteStaffCompitiFileGet,
  tickStaffCompitiDeadlines,
  tickStaffCompitiAssignments,
  tryAutoSubmitCompito,
  tryAutoFailCompito,
  ensureMonthPlanForUser,
  grantCompitiSwapBonus,
  isNewStaffCompitiGrace,
  ALLOWED_TASK_IDS,
  TASKS_META,
  currentRomeIsoWeekKey,
  romeMonthKey,
  weekKeysInRomeMonth,
  warmSiteStaffCompitiWorkersCache,
};
