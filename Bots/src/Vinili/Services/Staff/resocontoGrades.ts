/** Resoconti settimanali: voti, azione proposta e testo dell'azione. */
const { STAFF_ACTIVITY_LIMITS, STAFF_LIMITS_MSG_PER_HOUR_SWAP, evaluateStaffWeeklyLimitsWithSwap, evaluateStaffWeeklyLimitsAtMultiplier, toSafeNumber } = require("./resocontoLimits") as typeof import("./resocontoLimits");

const PM_WEEKLY_PARTNER_MIN_FOR_OK = 30;

function computeActivityGrade(roleId?, weeklyMessages?, weeklyVoiceHours?) {
  const limits = STAFF_ACTIVITY_LIMITS[String(roleId)];
  if (!limits) return "Nessun limite";

  const rawMsg = Math.max(0, Math.floor(toSafeNumber(weeklyMessages)));
  const rawHours = Math.max(0, toSafeNumber(weeklyVoiceHours));
  const limMsg = Number(limits.messages || 0);
  const limHours = Number(limits.hours || 0);

  const reaches = (targetMsg?, targetHrs?) =>
    evaluateStaffWeeklyLimitsWithSwap(rawMsg, rawHours, {
      messages: targetMsg,
      hours: targetHrs,
    }).reached;

  if (evaluateStaffWeeklyLimitsAtMultiplier(rawMsg, rawHours, limits, 3).reached) return "Eccellente";
  if (reaches(limMsg * 2 + 300, limHours * 2 + 2)) return "Ottimo";
  if (evaluateStaffWeeklyLimitsAtMultiplier(rawMsg, rawHours, limits, 2).reached) return "Buono";
  if (reaches(limMsg + 150, limHours + 1.5)) return "Discreto";
  if (reaches(limMsg, limHours)) return "Sufficiente";

  const baseEval = evaluateStaffWeeklyLimitsWithSwap(rawMsg, rawHours, limits);
  const msgDelta = Math.max(0, Number(baseEval.remainingMessages || 0));
  const hoursDelta = Math.max(0, Number(baseEval.remainingHours || 0));
  if (msgDelta <= STAFF_LIMITS_MSG_PER_HOUR_SWAP && hoursDelta <= 1) return "Insufficiente";
  return "Non classificato";
}

function computeBehaviorGrade(positiveCount?, negativeCount?) {
  const positive = Math.max(0, Math.floor(toSafeNumber(positiveCount)));
  const negative = Math.max(0, Math.floor(toSafeNumber(negativeCount)));

  if (positive === 0 && negative === 0) return "Sufficiente";
  if (positive >= 3 && negative === 0) return "Ottimo";
  if (positive === 0 && negative > 0) return "Non classificato";
  if (negative > positive) return "Insufficiente";
  if (positive > negative) return "Discreto";
  return "Sufficiente";
}

function computeStaffAction(activityGrade?, behaviorGrade?, pexedInWeek?, positiveCount?, negativeCount?) {
  if (pexedInWeek) return "Nulla";

  const pos = Math.max(0, Math.floor(toSafeNumber(positiveCount)));
  const neg = Math.max(0, Math.floor(toSafeNumber(negativeCount)));
  const noValutazioni = pos === 0 && neg === 0;

    if (
    (activityGrade === "Ottimo" || activityGrade === "Eccellente") &&
    behaviorGrade === "Ottimo"
  ) {
    return "Valutazione Positiva";
  }
  if (
    activityGrade === "Non classificato" &&
    (behaviorGrade === "Non classificato" || noValutazioni)
  ) {
    return "Nulla";
  }
  if (activityGrade === "Insufficiente" && behaviorGrade === "Insufficiente") {
    return "Valutazione Negativa";
  }
  if (
    (activityGrade === "Buono" || activityGrade === "Discreto") &&
    behaviorGrade === "Discreto"
  ) {
    return "Valutazione Positiva";
  }
  if (activityGrade === "Sufficiente" && behaviorGrade === "Sufficiente") {
    return "Nulla";
  }
  return "Nulla";
}

const BOT_VALUTAZIONE_SUFFIX = " (già registrata)";

function formatValutazioneLabel(type?, alreadyByBot?, purpose?) {
  const base = type === "positive" ? "Valutazione Positiva" : "Valutazione Negativa";
  const purposeText = purpose ? ` — ${purpose}` : "";
  const botNote = alreadyByBot ? BOT_VALUTAZIONE_SUFFIX : "";
  return `${base}${purposeText}${botNote}`;
}

function pushPendingManualAction(pendingManualActions?, actionKey?, reason?) {
  const key = String(actionKey || "").trim();
  const text = String(reason || "").trim();
  if (!key || !text) return;
  const duplicate = pendingManualActions.some(
    (row?) => row.actionKey === key && row.reason.toLowerCase() === text.toLowerCase(),
  );
  if (duplicate) return;
  pendingManualActions.push({ actionKey: key, reason: text });
}

function hasStaffAutoValutazioneForCycle(staffDoc?, resocontoWeekKey?, staffRoleId?, kind?) {
  const rid = String(staffRoleId || "").trim();
  const wk = String(resocontoWeekKey || "").trim();
  if (!rid || !wk) return false;
  const key =
    kind === "sanzioni"
      ? `weekly_sanzioni:${wk}:${rid}`
      : `weekly_limits:${wk}:${rid}`;
  return Boolean(findAutoValutazioneEntry(staffDoc, key));
}

function hasStaffLimitsValutazioneForCycle(staffDoc?, resocontoWeekKey?, staffRoleId?) {
      return hasStaffAutoValutazioneForCycle(staffDoc, resocontoWeekKey, staffRoleId, "limits");
}

function hasStaffSanctionsValutazioneForCycle(staffDoc?, resocontoWeekKey?, staffRoleId?) {
  return hasStaffAutoValutazioneForCycle(staffDoc, resocontoWeekKey, staffRoleId, "sanzioni");
}

function normalizePendingManualActions(pendingManualActions?) {
  const rows = Array.isArray(pendingManualActions) ? pendingManualActions : [];
  const seen = new Set();
  const normalized = [];
  for (const row of rows) {
    const actionKey = String(row?.actionKey || "").trim();
    const reason = String(row?.reason || "").trim();
    if (!actionKey || !reason) continue;
        const dedupe = `${actionKey}::${reason.toLowerCase()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    normalized.push({ actionKey, reason });
  }
  return normalized;
}

function buildStaffResocontoAzioneDisplay({
  staffDoc,
  staffRoleId,
  resocontoWeekKey,
  graceNewStaffRole,
  overviewUnavailable,
  inPauseDuringWeek,
  currentlyInPause,
  endedPauseDuringWeek,
  activityGrade,
  behaviorGrade,
  reachedWeeklyLimits,
  reachedDoubleWeeklyLimits,
  canEvaluateWeeklyLimits,
  metWeeklySanctionLimit,
  pexedInWeek = false,
  member = null,
}) {
  if (graceNewStaffRole) {
    return { display: "Nulla — nuovo in staff", actionKey: "nl", isNulla: true, pendingManualActions: [] };
  }
  if (currentlyInPause) {
    return { display: "Nulla — in pausa", actionKey: "nl", isNulla: true, pendingManualActions: [] };
  }
    if (endedPauseDuringWeek) {
    return { display: "Nulla — rientrato da pausa", actionKey: "nl", isNulla: true, pendingManualActions: [] };
  }
  if (inPauseDuringWeek) {
    return { display: "Nulla — pausa nella settimana", actionKey: "nl", isNulla: true, pendingManualActions: [] };
  }
  if (overviewUnavailable) {
    return { display: "Nulla — stats non disponibili", actionKey: "nl", isNulla: true, pendingManualActions: [] };
  }

  const parts = [];
  const pendingManualActions = [];
  let actionKey = "nl";

  const pushPart = (label?) => {
    if (!label || parts.includes(label)) return;
    parts.push(label);
  };

  if (canEvaluateWeeklyLimits) {
    const limitsByBot = hasStaffLimitsValutazioneForCycle(staffDoc, resocontoWeekKey, staffRoleId);
    if (reachedDoubleWeeklyLimits) {
      pushPart(formatValutazioneLabel("positive", limitsByBot, "limiti settimanali superati almeno del doppio"));
      if (!limitsByBot) {
        pushPendingManualAction(
          pendingManualActions,
          "vp",
          "Limiti settimanali superati almeno del doppio.",
        );
      }
    } else if (reachedWeeklyLimits) {
      /* Solo 1×: limiti ok, ma VP solo dal doppio (o da altri compiti). */
      pushPart("Limiti settimanali rispettati (nessuna VP: serve almeno il doppio)");
    } else if (!inPauseDuringWeek) {
      pushPart(formatValutazioneLabel("negative", limitsByBot, "limiti settimanali non raggiunti"));
      if (!limitsByBot) {
        pushPendingManualAction(
          pendingManualActions,
          "vn",
          "Limiti settimanali non raggiunti.",
        );
      }
    }
  }

  if (metWeeklySanctionLimit) {
    const sanctionsByBot = hasStaffSanctionsValutazioneForCycle(staffDoc, resocontoWeekKey, staffRoleId);
        if (!parts.some((part?) => /compito sanzioni/i.test(part))) {
      pushPart(formatValutazioneLabel("positive", sanctionsByBot, "compito sanzioni completato"));
    }
    if (!sanctionsByBot) {
      pushPendingManualAction(
        pendingManualActions,
        "vp",
        "Compito sanzioni completato.",
      );
    }
  }

  const gradeAction = computeStaffAction(
    activityGrade,
    behaviorGrade,
    pexedInWeek,
    staffDoc?.positiveCount,
    staffDoc?.negativeCount,
  );

  if ((gradeAction as any) === "Pex" || (gradeAction as any) === "Depex") {
      } else if (gradeAction === "Valutazione Positiva") {
    if (!parts.some((part?) => part.startsWith("Valutazione Positiva"))) {
      pushPart(formatValutazioneLabel("positive", false, "griglia attività/condotta"));
      pushPendingManualAction(
        pendingManualActions,
        "vp",
        "Valutazione positiva da griglia attività/condotta.",
      );
    }
  } else if (gradeAction === "Valutazione Negativa") {
    if (!parts.some((part?) => part.startsWith("Valutazione Negativa"))) {
      pushPart(formatValutazioneLabel("negative", false, "griglia attività/condotta"));
      pushPendingManualAction(
        pendingManualActions,
        "vn",
        "Valutazione negativa da griglia attività/condotta.",
      );
    }
  }

  const resolvedPendingManualActions = normalizePendingManualActions(pendingManualActions).filter(
    (row?) => row.actionKey !== "px" && row.actionKey !== "dp",
  );
  if (resolvedPendingManualActions.length === 1) {
    actionKey = resolvedPendingManualActions[0].actionKey;
  } else if (resolvedPendingManualActions.length > 1) {
    actionKey = "batch";
  }

  if (!parts.length) {
    if (endedPauseDuringWeek) {
      return { display: "Nulla — rientrato da pausa", actionKey: "nl", isNulla: true, pendingManualActions: [] };
    }
    if (inPauseDuringWeek) {
      return { display: "Nulla — pausa nella settimana", actionKey: "nl", isNulla: true, pendingManualActions: [] };
    }
    return { display: "Nulla", actionKey: "nl", isNulla: true, pendingManualActions: [] };
  }

  return {
    display: parts.join(" + "),
    actionKey,
    isNulla: false,
    pendingManualActions: resolvedPendingManualActions,
  };
}

function computePmAction(weeklyPartners?, pmPexedInWeek?) {
  if (pmPexedInWeek) return "Nulla";
  const partners = Math.max(0, Math.floor(toSafeNumber(weeklyPartners)));
    if (partners < PM_WEEKLY_PARTNER_MIN_FOR_OK) return "Richiamo";
  return "Nulla";
}

function findAutoValutazioneEntry(staff?, keyStr?) {
  if (!Array.isArray(staff?.autoValutazioni)) return null;
  return staff.autoValutazioni.find((entry?) => String(entry?.key || "") === keyStr) || null;
}

function staffActionToKey(action?) {
  if (action === "Pex") return "px";
  if (action === "Depex") return "dp";
  if (action === "Valutazione Positiva") return "vp";
  if (action === "Valutazione Negativa") return "vn";
  return "nl";
}

function pmActionToKey(action?) {
  if (action === "Depex") return "dp";
  if (action === "Richiamo") return "rc";
  return "nl";
}

export = { computeActivityGrade, computeBehaviorGrade, hasStaffLimitsValutazioneForCycle, hasStaffSanctionsValutazioneForCycle, buildStaffResocontoAzioneDisplay, computePmAction, findAutoValutazioneEntry, pmActionToKey };
