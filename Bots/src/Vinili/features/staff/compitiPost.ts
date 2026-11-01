/** Compiti staff: azioni dal sito (scelta, invio, revisione, cambi). */
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const { notifyCompitiSubmitted, notifyCompitiApproved, notifyCompitiRejected, taskLabelFromMeta } = require("./siteStaffCompitiNotifications") as typeof import("./siteStaffCompitiNotifications");
const { memberDisplayName } = require("./siteStaffEventNotifications") as typeof import("./siteStaffEventNotifications");
const { TASKS_META, ALLOWED_TASK_IDS, isAutoTask, taskById } = require("./siteStaffCompitiCatalog") as typeof import("./siteStaffCompitiCatalog");
const { currentRomeIsoWeekKey, prevRomeMonthKey, compitiActiveMonthKey, deadlinesPayload } = require("./compitiCalendar") as typeof import("./compitiCalendar");
const { saveProofs } = require("./compitiProofs") as typeof import("./compitiProofs");
const { MAX_NOTE, shouldSkipNegativeValutazione, STATUS, emptyWeek, sanitizeWeekEntry, pruneWeekMap, loadMap, saveMap, applyValutazione } = require("./compitiWeeks") as typeof import("./compitiWeeks");
const { MONTHLY_SWAP_BASE, sanitizePlanEntry, planPoolIds, collectPrevMonthTaskIds, lockedTaskIdsForMonth, planSwapsLeft, pickRandomPoolReplacement, loadPlanMap, savePlanMap, loadSwapBonus, saveSwapBonusState, isNewStaffCompitiGrace, ensureMonthPlanForUser } = require("./compitiPlan") as typeof import("./compitiPlan");
const { buildIdentityFromMember, publicProgress, buildPublicPlan, buildMonthEntries, resolveCompitiRoles } = require("./compitiPeople") as typeof import("./compitiPeople");
const { resolveGuildId } = require("./compitiTicks") as typeof import("./compitiTicks");

/** siteLiveAll1 */
function emitCompitiRealtime(extras: Record<string, any> = {}) {
  try {
    const { broadcastSiteStaffCompitiChanged } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
    broadcastSiteStaffCompitiChanged(extras);
  } catch (_) {}
  try {
    const uid = String(extras.userId || "").trim();
    if (/^\d{16,22}$/.test(uid)) {
      const { clearStaffProfileCacheForUser } = require("./siteStaffProfileApi") as typeof import("./siteStaffProfileApi");
      clearStaffProfileCacheForUser(uid, { action: extras.action || "compiti" });
    }
  } catch (_) {}
}

async function handleSiteStaffCompitiPost(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const guildId = resolveGuildId(client) || String(access.member?.guild?.id || "").trim();
    const viewer = access.member;
    const viewerId = String(viewer?.id || access.user?.id || "").trim();
    const roles = resolveCompitiRoles(viewer, req);
    const highStaff = roles.highStaff;
    const workerSelf = roles.workerSelf;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = String(body.action || "save").trim();
    const weekKey = currentRomeIsoWeekKey();
    const monthKey = compitiActiveMonthKey(weekKey);
    const deadlines = deadlinesPayload();

    if (roles.deny) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: `Preview (${roles.viewAs}): niente azioni sui compiti.`,
        viewAs: roles.viewAs,
      });
    }

    if (action === "review") {
      if (!highStaff) {
        return res.status(403).json({ ok: false, error: "forbidden", message: "Solo High Staff può revisionare." });
      }
      const targetId = String(body.userId || "").trim();
      const decision = String(body.decision || "").trim(); // approve | reject
      if (!/^\d{17,20}$/.test(targetId) || (decision !== "approve" && decision !== "reject")) {
        return res.status(400).json({ ok: false, error: "invalid", message: "Revisione non valida." });
      }
      const bodyWeek = String(body.weekKey || "").trim();
      const reviewWeekKey =
        /^(\d{4})-W(\d{2})$/.test(bodyWeek) && bodyWeek <= weekKey ? bodyWeek : weekKey;
      const map = await loadMap(guildId, targetId);
      const entry = sanitizeWeekEntry(map[reviewWeekKey] || emptyWeek());
      if (entry.status !== STATUS.SUBMITTED) {
        return res.status(400).json({ ok: false, error: "not_submitted", message: "Nessuna prova da revisionare." });
      }
      entry.reviewedAt = Date.now();
      entry.reviewedBy = viewerId;
      entry.updatedAt = Date.now();

      /* compitiReviewUnlock1: prima salva+rispondi; valutazione/notif in background (niente UI bloccata) */
      let reviewGrace = false;
      try {
        const guildForGrace =
          client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
        const targetMember =
          guildForGrace?.members?.cache?.get?.(targetId) ||
          (await guildForGrace?.members?.fetch?.(targetId).catch(() => null)) ||
          null;
        reviewGrace = await isNewStaffCompitiGrace({
          guildId,
          userId: targetId,
          member: targetMember,
        });
      } catch (_) {
        reviewGrace = false;
      }
      const needPositiveVal = decision === "approve" && !entry.valutazioneApplied;
      const needNegativeVal =
        decision !== "approve" &&
        !deadlines.submitOpen &&
        !entry.valutazioneApplied &&
        !reviewGrace;

      if (decision === "approve") {
        entry.status = STATUS.APPROVED;
        entry.done = true;
      } else if (deadlines.submitOpen) {
        // Reject with time left → staff can retry same/other task until Sunday 18:00.
        entry.status = STATUS.REJECTED;
        entry.done = false;
        entry.valutazioneApplied = false;
      } else {
        // Past Sunday 18 → final reject + negative (unless grace week).
        entry.status = STATUS.REJECTED;
        entry.done = false;
      }

      map[reviewWeekKey] = entry;
      await saveMap(guildId, targetId, pruneWeekMap(map, reviewWeekKey));

      const planAfter = (await loadPlanMap(guildId, targetId))[monthKey] || null;
      const swapBonusAfter = (await loadSwapBonus(guildId, targetId, monthKey)).bonus;
      const currentEntry = sanitizeWeekEntry(map[weekKey] || emptyWeek());
      const locked = lockedTaskIdsForMonth(map, monthKey, weekKey, planAfter).filter(
        (id?) => id !== currentEntry.taskId,
      );
      res.status(200).json({
        ok: true,
        weekKey,
        progress: publicProgress(weekKey, targetId, currentEntry, locked, monthKey, map, deadlines, planAfter),
        monthEntries: buildMonthEntries(monthKey, targetId, map, planAfter, deadlines, weekKey),
        plan: buildPublicPlan(monthKey, planAfter, map, weekKey, swapBonusAfter),
      });
      emitCompitiRealtime({ userId: targetId, weekKey, action: decision === "approve" ? "approve" : "reject" });

      setImmediate(() => {
        Promise.resolve()
          .then(async () => {
            if (needPositiveVal) {
              const ok = await applyValutazione(client, guildId, targetId, "positive", reviewWeekKey);
              if (ok) {
                entry.valutazioneApplied = true;
                map[reviewWeekKey] = entry;
                await saveMap(guildId, targetId, pruneWeekMap(map, reviewWeekKey));
              }
            } else if (needNegativeVal) {
              const ok = await applyValutazione(client, guildId, targetId, "negative", reviewWeekKey);
              if (ok) {
                entry.valutazioneApplied = true;
                map[reviewWeekKey] = entry;
                await saveMap(guildId, targetId, pruneWeekMap(map, reviewWeekKey));
              }
            }
            if (!roles.viewAs) {
              const guild =
                viewer?.guild ||
                client?.guilds?.cache?.get?.(guildId) ||
                (await client?.guilds?.fetch?.(guildId).catch(() => null));
              const taskLabel = taskLabelFromMeta(TASKS_META, entry.taskId);
              const reviewerName = memberDisplayName(viewer, viewer?.user || access.user, viewerId);
              if (decision === "approve") {
                await notifyCompitiApproved({
                  guild,
                  guildId,
                  workerUserId: targetId,
                  weekKey: reviewWeekKey,
                  taskLabel,
                  reviewerName,
                });
              } else {
                await notifyCompitiRejected({
                  guild,
                  guildId,
                  workerUserId: targetId,
                  weekKey: reviewWeekKey,
                  taskLabel,
                  reviewerName,
                  softRetry: Boolean(deadlines.submitOpen),
                  skipNegative:
                    shouldSkipNegativeValutazione(reviewWeekKey) || Boolean(reviewGrace),
                });
              }
            }
          })
          .catch((errBg?) => {
            global.logger?.warn?.(
              "[WEBHOOK] site-staff-compiti review bg:",
              errBg?.message || errBg,
            );
          });
      });
      return;
    }

    // Staff save/submit — any day until Sunday 18:00
    if (!workerSelf || highStaff) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "High Staff non svolge i compiti: revisiona quelli dello staff.",
      });
    }

    if (action === "swap_one") {
      const replaceTaskId = String(body.taskId || body.replaceTaskId || "").trim();
      if (!ALLOWED_TASK_IDS.has(replaceTaskId)) {
        return res.status(400).json({
          ok: false,
          error: "invalid_task",
          message: "Scegli un compito del pool da sostituire.",
        });
      }
      let plan = (await loadPlanMap(guildId, viewerId))[monthKey] || null;
      if (!planPoolIds(plan).length) {
        plan = await ensureMonthPlanForUser(guildId, viewerId, { monthKey, weekKey });
      }
      const pool = planPoolIds(plan);
      if (!pool.includes(replaceTaskId)) {
        return res.status(400).json({
          ok: false,
          error: "not_in_pool",
          message: "Quel compito non è nel tuo pool di questo mese.",
        });
      }
      let bonusState = await loadSwapBonus(guildId, viewerId, monthKey);
      let bonus = bonusState.bonus;
      if (planSwapsLeft(plan, bonus) < 1) {
        return res.status(400).json({
          ok: false,
          error: "no_swaps",
          message: "Nessuno scambio rimasto questo mese (1 base + bonus Staffer della settimana).",
        });
      }
      const map = await loadMap(guildId, viewerId);
      const locked = new Set(lockedTaskIdsForMonth(map, monthKey, weekKey, plan));
      const curEntry = sanitizeWeekEntry(map[weekKey] || emptyWeek());
      if (locked.has(replaceTaskId) && curEntry.taskId !== replaceTaskId) {
        return res.status(400).json({
          ok: false,
          error: "task_locked",
          message: "Quel compito è già usato in un'altra settimana: non si può cambiare.",
        });
      }
      if (
        curEntry.taskId === replaceTaskId &&
        (curEntry.status === STATUS.SUBMITTED ||
          curEntry.status === STATUS.APPROVED ||
          curEntry.status === STATUS.MISSED ||
          curEntry.status === STATUS.SKIPPED)
      ) {
        return res.status(400).json({
          ok: false,
          error: "task_locked",
          message: "Non puoi cambiare un compito già inviato o chiuso.",
        });
      }
      const plans = await loadPlanMap(guildId, viewerId);
      const exclude = collectPrevMonthTaskIds(plans, map, prevRomeMonthKey(monthKey));
      const replacement = pickRandomPoolReplacement(pool, exclude, replaceTaskId);
      if (!replacement) {
        return res.status(400).json({
          ok: false,
          error: "no_replacement",
          message: "Nessun altro compito disponibile da sorteggiare.",
        });
      }
      const used = Math.max(0, Math.floor(Number(plan.swapUsedCount) || 0));
      if (used < MONTHLY_SWAP_BASE) {
        plan.swapUsedCount = used + 1;
      } else {
        bonus = Math.max(0, bonus - 1);
        await saveSwapBonusState(guildId, viewerId, {
          bonus,
          weekKey: bonusState.weekKey,
          monthKey,
        });
      }
      plan.taskIds = pool.map((id?) => (id === replaceTaskId ? replacement : id));
      plan.byWeek = {};
      plans[monthKey] = sanitizePlanEntry(plan);
      await savePlanMap(guildId, viewerId, plans);
      plan = plans[monthKey];

      if (curEntry.taskId === replaceTaskId && curEntry.status === STATUS.DRAFT) {
        curEntry.taskId = "";
        curEntry.updatedAt = Date.now();
        map[weekKey] = curEntry;
        await saveMap(guildId, viewerId, pruneWeekMap(map, weekKey));
      } else if (curEntry.taskId === replaceTaskId && curEntry.status === STATUS.REJECTED) {
        curEntry.taskId = "";
        curEntry.updatedAt = Date.now();
        map[weekKey] = curEntry;
        await saveMap(guildId, viewerId, pruneWeekMap(map, weekKey));
      }

      const mapFresh = await loadMap(guildId, viewerId);
      const entryFresh = sanitizeWeekEntry(mapFresh[weekKey] || emptyWeek());
      const lockedFresh = lockedTaskIdsForMonth(mapFresh, monthKey, weekKey, plan).filter(
        (id?) => id !== entryFresh.taskId,
      );
      emitCompitiRealtime({ userId: viewerId, weekKey, action: "swap" });
      return res.status(200).json({
        ok: true,
        weekKey,
        swapped: { from: replaceTaskId, to: replacement },
        plan: buildPublicPlan(monthKey, plan, mapFresh, weekKey, bonus),
        progress: publicProgress(
          weekKey,
          viewerId,
          entryFresh,
          lockedFresh,
          monthKey,
          mapFresh,
          deadlines,
          plan,
        ),
        monthEntries: buildMonthEntries(monthKey, viewerId, mapFresh, plan, deadlines, weekKey),
        message: `Compito sostituito: ora hai «${taskById(replacement)?.label || replacement}».`,
      });
    }

    // Staff save/submit — any day until Sunday 18:00
    if (!workerSelf || highStaff) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "High Staff non svolge i compiti: revisiona quelli dello staff.",
      });
    }

    let plan = (await loadPlanMap(guildId, viewerId))[monthKey] || null;
    if (!planPoolIds(plan).length) {
      plan = await ensureMonthPlanForUser(guildId, viewerId, { monthKey, weekKey });
    }
    const pool = planPoolIds(plan);
    if (!pool.length) {
      return res.status(400).json({
        ok: false,
        error: "no_plan",
        message: "Nessun pool di compiti assegnato per questo mese.",
      });
    }

    const map = await loadMap(guildId, viewerId);
    const entry = sanitizeWeekEntry(map[weekKey] || emptyWeek());
    if (entry.status === STATUS.APPROVED || entry.status === STATUS.MISSED) {
      return res.status(400).json({ ok: false, error: "locked", message: "Questa settimana è già chiusa." });
    }
    if (entry.status === STATUS.REJECTED && !deadlines.submitOpen) {
      return res.status(400).json({
        ok: false,
        error: "deadline",
        message: "Scadenza domenica ore 18: non puoi più riprovare.",
      });
    }
    if (entry.status === STATUS.SUBMITTED) {
      return res.status(400).json({ ok: false, error: "submitted", message: "Già inviato in revisione." });
    }
    if (!deadlines.submitOpen) {
      return res.status(400).json({
        ok: false,
        error: "deadline",
        message: "Scadenza domenica ore 18: non puoi più inviare.",
      });
    }

    const taskId = String(body.taskId || "").trim();
    if (!pool.includes(taskId)) {
      return res.status(400).json({
        ok: false,
        error: "invalid_task",
        message: "Scegli uno dei compiti del pool di questo mese.",
      });
    }
    const locked = lockedTaskIdsForMonth(map, monthKey, weekKey, plan).filter((id?) => id !== entry.taskId);
    if (locked.includes(taskId) && entry.taskId !== taskId) {
      return res.status(400).json({
        ok: false,
        error: "task_used",
        message: "Questo compito è già stato usato in un'altra settimana di questo mese.",
      });
    }

    const note = String(body.note == null ? "" : body.note).slice(0, MAX_NOTE);
    const submit = Boolean(body.submit) || Boolean(body.done);
    if (submit && isAutoTask(taskId)) {
      return res.status(400).json({
        ok: false,
        error: "auto_task",
        message: "Questo compito si completa da solo quando scatta il trigger. Puoi solo selezionarlo.",
      });
    }
    const proofsInput = Array.isArray(body.proofs) ? body.proofs : Array.isArray(body.images) ? body.images : [];
    let proofs = entry.proofs || [];
    if (proofsInput.length) {
      proofs = await saveProofs(weekKey, viewerId, proofsInput);
    }

    entry.taskId = taskId;
    entry.note = note;
    entry.proofs = proofs;
    entry.done = submit;
    entry.updatedAt = Date.now();
    entry.reviewedAt = 0;
    entry.reviewedBy = "";
    entry.autoSubmitted = false;
    if (submit) {
      if (!note.trim() && proofs.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "proof_required",
          message: "Per inviare serve una nota e/o almeno una prova (foto/file).",
        });
      }
      entry.status = STATUS.SUBMITTED;
      entry.submittedAt = Date.now();
    } else {
      entry.status = STATUS.DRAFT;
    }

    map[weekKey] = entry;
    await saveMap(guildId, viewerId, pruneWeekMap(map, weekKey));

    if (submit && !roles.viewAs) {
      try {
        const guild =
          viewer?.guild ||
          client?.guilds?.cache?.get?.(guildId) ||
          (await client?.guilds?.fetch?.(guildId).catch(() => null));
        await notifyCompitiSubmitted({
          guild,
          guildId,
          workerUserId: viewerId,
          workerMember: viewer,
          workerUser: viewer?.user || access.user,
          weekKey,
          taskLabel: taskLabelFromMeta(TASKS_META, taskId),
          actorUserId: viewerId,
        });
      } catch (errNotif) {
        global.logger?.warn?.("[WEBHOOK] site-staff-compiti submit notif:", errNotif?.message || errNotif);
      }
    }

    emitCompitiRealtime({
      userId: viewerId,
      weekKey,
      action: String(req.body?.action || req.body?.mode || "save").trim().toLowerCase() || "save",
    });
    return res.status(200).json({
      ok: true,
      weekKey,
      plan: buildPublicPlan(monthKey, plan, map, weekKey, (await loadSwapBonus(guildId, viewerId, monthKey)).bonus),
      progress: publicProgress(weekKey, viewerId, entry, locked, monthKey, map, deadlines, plan),
      identity: buildIdentityFromMember(viewer, viewer.user || access.user),
      deadlines,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-compiti post:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = { handleSiteStaffCompitiPost };
