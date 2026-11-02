/** Compiti staff: controlli periodici (scadenze, assegnazioni, invio automatico, inviti). */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { notifyCompitiSubmitted, notifyCompitiMissed, notifyCompitiAutoFailed, notifyCompitiDeadlineSoon, taskLabelFromMeta } = require("./siteStaffCompitiNotifications") as typeof import("./siteStaffCompitiNotifications");
const { TASKS_META, ALLOWED_TASK_IDS, isAutoTask, taskById } = require("./siteStaffCompitiCatalog") as typeof import("./siteStaffCompitiCatalog");
const { currentRomeIsoWeekKey, sundaySubmitDeadlineMs, sundayReviewDeadlineMs, compitiActiveMonthKey, dateKeysForIsoWeekKey, deadlinesPayload } = require("./compitiCalendar") as typeof import("./compitiCalendar");
const { MAX_NOTE, shouldSkipNegativeValutazione, STATUS, emptyWeek, sanitizeWeekEntry, pruneWeekMap, loadMap, saveMap, applyValutazione } = require("./compitiWeeks") as typeof import("./compitiWeeks");
const { planPoolIds, lockedTaskIdsForMonth, loadPlanMap, isNewStaffCompitiGrace, ensureMonthPlanForUser } = require("./compitiPlan") as typeof import("./compitiPlan");
const { listWorkerMembers } = require("./compitiPeople") as typeof import("./compitiPeople");

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

/**
 * Deadline tick: Sunday 18 miss + Sunday 24 auto-fail pending reviews.
 * Safe to call every minute from bot-scheduler.
 */
async function tickStaffCompitiDeadlines(client?) {
  const guildId = resolveGuildId(client);
  if (!guildId) return { ok: false };
  const now = Date.now();
  const weekKey = currentRomeIsoWeekKey();
  const submitMs = sundaySubmitDeadlineMs();
  const reviewMs = sundayReviewDeadlineMs();
  const dueSoonMs = submitMs - 24 * 60 * 60 * 1000;
  const members = await listWorkerMembers(client, guildId);
  let missed = 0;
  let autoFail = 0;
  let dueSoon = 0;
  const guild =
    client?.guilds?.cache?.get?.(guildId) || (await client?.guilds?.fetch?.(guildId).catch(() => null));

  for (const member of members) {
    const userId = member.id;
    const map = await loadMap(guildId, userId);
    const entry = sanitizeWeekEntry(map[weekKey] || emptyWeek());
    let changed = false;
    const grace = await isNewStaffCompitiGrace({
      guildId,
      userId,
      member,
      now: new Date(now),
    });

    if (
      guild &&
      !grace &&
      now >= dueSoonMs &&
      now < submitMs &&
      (entry.status === STATUS.DRAFT || entry.status === STATUS.REJECTED) &&
      !isAutoTask(entry.taskId)
    ) {
      try {
        const n = await notifyCompitiDeadlineSoon({
          guild,
          guildId,
          workerUserId: userId,
          weekKey,
        });
        if (n) dueSoon += 1;
      } catch (_) {}
    }

    if (now >= submitMs && (entry.status === STATUS.DRAFT || entry.status === STATUS.REJECTED)) {
      if (grace) {
        entry.status = STATUS.SKIPPED;
        entry.updatedAt = now;
        entry.valutazioneApplied = true;
        map[weekKey] = entry;
        changed = true;
      } else {
        entry.status = STATUS.MISSED;
        entry.updatedAt = now;
        if (!entry.valutazioneApplied) {
          const ok = await applyValutazione(client, guildId, userId, "negative", weekKey);
          entry.valutazioneApplied = Boolean(ok);
        }
        map[weekKey] = entry;
        changed = true;
        missed += 1;
        try {
          await notifyCompitiMissed({
            guild,
            guildId,
            workerUserId: userId,
            weekKey,
            skipNegative: shouldSkipNegativeValutazione(weekKey),
          });
        } catch (_) {}
      }
    } else if (now >= reviewMs && entry.status === STATUS.SUBMITTED) {
      entry.status = STATUS.REJECTED;
      entry.reviewedAt = now;
      entry.reviewedBy = "system";
      entry.updatedAt = now;
      if (!entry.valutazioneApplied) {
        if (grace || shouldSkipNegativeValutazione(weekKey)) {
          entry.valutazioneApplied = true;
        } else {
          const ok = await applyValutazione(client, guildId, userId, "negative", weekKey);
          entry.valutazioneApplied = Boolean(ok);
        }
      }
      map[weekKey] = entry;
      changed = true;
      autoFail += 1;
      try {
        await notifyCompitiAutoFailed({
          guild,
          guildId,
          workerUserId: userId,
          weekKey,
          taskLabel: taskLabelFromMeta(TASKS_META, entry.taskId),
        });
      } catch (_) {}
    }

    if (changed) await saveMap(guildId, userId, pruneWeekMap(map, weekKey));
  }

  return { ok: true, weekKey, missed, autoFail, dueSoon };
}

/**
 * Idempotent monthly assignment on first ISO week of Rome month + invite auto-check.
 */
async function tickStaffCompitiAssignments(client?) {
  const guildId = resolveGuildId(client);
  if (!guildId) return { ok: false };
  const weekKey = currentRomeIsoWeekKey();
  const monthKey = compitiActiveMonthKey(weekKey);
  const members = await listWorkerMembers(client, guildId);
  let assigned = 0;
  let skipped = 0;

  // Assign plans any time a worker is missing one (idempotent); bulk create preferred in first week.
  for (const member of members) {
    const userId = member.id;
    const plans = await loadPlanMap(guildId, userId);
    if (planPoolIds(plans[monthKey]).length) {
      skipped += 1;
      continue;
    }
    await ensureMonthPlanForUser(guildId, userId, { monthKey, weekKey });
    assigned += 1;
  }

  let inviteHits = 0;
  try {
    inviteHits = await tickInviteActiveCompiti(client, { guildId, members, weekKey });
  } catch (err) {
    global.logger?.warn?.("[COMPITI] invite auto", err?.message || err);
  }

  return { ok: true, monthKey, weekKey, assigned, skipped, inviteHits };
}

/**
 * Auto-submit current-week compito when trigger fires. HS must still approve.
 * Marker: compitiAutoSubmit1
 */
async function tryAutoSubmitCompito(client?, opts: Record<string, any> = {}) {
  const guildId = String(opts.guildId || resolveGuildId(client) || "").trim();
  const userId = String(opts.userId || "").trim();
  const taskId = String(opts.taskId || "").trim();
  const weekKey = String(opts.weekKey || currentRomeIsoWeekKey()).trim();
  const evidence = String(opts.evidence || opts.note || "").trim().slice(0, MAX_NOTE);
  if (!guildId || !/^\d{17,20}$/.test(userId) || !ALLOWED_TASK_IDS.has(taskId) || !/^\d{4}-W\d{2}$/.test(weekKey)) {
    return { ok: false, error: "invalid" };
  }
  if (!isAutoTask(taskId)) return { ok: false, error: "not_auto" };

  const monthKey = compitiActiveMonthKey(weekKey);
  let plan = (await loadPlanMap(guildId, userId))[monthKey] || null;
  if (!planPoolIds(plan).length) {
    plan = await ensureMonthPlanForUser(guildId, userId, { monthKey, weekKey });
  }
  const pool = planPoolIds(plan);
  if (!pool.includes(taskId)) {
    return { ok: false, error: "not_in_pool" };
  }

  const deadlines = deadlinesPayload();
  if (!deadlines.submitOpen && weekKey === currentRomeIsoWeekKey()) {
    return { ok: false, error: "deadline" };
  }

  const map = await loadMap(guildId, userId);
  const entry = sanitizeWeekEntry(map[weekKey] || emptyWeek());
  if (
    entry.status === STATUS.SUBMITTED ||
    entry.status === STATUS.APPROVED ||
    entry.status === STATUS.MISSED
  ) {
    return { ok: false, error: "already_locked", status: entry.status };
  }
  // Deve aver scelto QUESTO compito per la settimana: niente auto-pick a caso.
  if (String(entry.taskId || "") !== taskId) {
    return { ok: false, error: "not_selected_this_week" };
  }
  const locked = lockedTaskIdsForMonth(map, monthKey, weekKey, plan);
  if (locked.includes(taskId) && entry.taskId !== taskId) {
    return { ok: false, error: "task_used" };
  }
  entry.taskId = taskId;
  entry.note = evidence || entry.note || `Completamento automatico: ${taskById(taskId)?.label || taskId}`;
  entry.proofs = entry.proofs || [];
  entry.status = STATUS.SUBMITTED;
  entry.done = true;
  entry.autoSubmitted = true;
  entry.submittedAt = Date.now();
  entry.reviewedAt = 0;
  entry.reviewedBy = "";
  entry.updatedAt = Date.now();
  map[weekKey] = entry;
  await saveMap(guildId, userId, pruneWeekMap(map, weekKey));

  try {
    const guild =
      client?.guilds?.cache?.get?.(guildId) || (await client?.guilds?.fetch?.(guildId).catch(() => null));
    await notifyCompitiSubmitted({
      guild,
      guildId,
      workerUserId: userId,
      weekKey,
      taskLabel: taskLabelFromMeta(TASKS_META, taskId),
      auto: true,
    });
  } catch (err) {
    global.logger?.warn?.("[COMPITI] auto-submit notif", err?.message || err);
  }

  return { ok: true, weekKey, taskId, status: STATUS.SUBMITTED };
}

/**
 * invite_active: invitato dallo staff con ≥100 msg o ≥2h vocali nella settimana ISO corrente.
 */
async function tickInviteActiveCompiti(client?, opts: Record<string, any> = {}) {
  const guildId = String(opts.guildId || resolveGuildId(client) || "").trim();
  if (!guildId) return 0;
  const weekKey = String(opts.weekKey || currentRomeIsoWeekKey()).trim();
  const members = Array.isArray(opts.members) ? opts.members : await listWorkerMembers(client, guildId);
  const dateKeys = dateKeysForIsoWeekKey(weekKey);
  if (!dateKeys.length) return 0;

  let hits = 0;
  for (const member of members) {
    const staffId = String(member?.id || "").trim();
    if (!staffId) continue;
    const plan = (await loadPlanMap(guildId, staffId))[compitiActiveMonthKey(weekKey)] || null;
    if (!planPoolIds(plan).includes("invite_active")) continue;
    const map = await loadMap(guildId, staffId);
    const entry = sanitizeWeekEntry(map[weekKey] || emptyWeek());
    if (String(entry.taskId || "") !== "invite_active") continue;
    if (entry.status === STATUS.SUBMITTED || entry.status === STATUS.APPROVED || entry.status === STATUS.MISSED) {
      continue;
    }

    const invitees = await ActivityUserProfile.find({
      guildId,
      "profile.inviteTrack.inviterId": staffId,
      "profile.inviteTrack.active": { $ne: false },
    })
      .select("userId profile.totals.daily")
      .lean()
      .catch(() => []);

    let best = null;
    for (const doc of invitees || []) {
      const daily = doc?.profile?.totals?.daily;
      if (!daily || typeof daily !== "object") continue;
      let text = 0;
      let voice = 0;
      for (const dk of dateKeys) {
        const row = daily[dk];
        if (!row || typeof row !== "object") continue;
        text += Math.max(0, Number(row.textCount || row.text || 0));
        voice += Math.max(0, Number(row.voiceSeconds || row.voice || 0));
      }
      if (text >= 100 || voice >= 2 * 3600) {
        best = { userId: String(doc.userId || ""), text, voice };
        break;
      }
    }
    if (!best) continue;

    const out = await tryAutoSubmitCompito(client, {
      guildId,
      userId: staffId,
      taskId: "invite_active",
      weekKey,
      evidence: `Invitato ${best.userId}: ${best.text} msg / ${(best.voice / 3600).toFixed(1)}h vocali (${weekKey})`,
    });
    if (out?.ok) hits += 1;
  }
  return hits;
}

export = { resolveGuildId, tickStaffCompitiDeadlines, tickStaffCompitiAssignments, tryAutoSubmitCompito };
