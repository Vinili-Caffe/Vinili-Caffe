/** Profilo staff: pausa attuale e storico delle pause. */
const { getPausePhase, getPauseStatusLabel, getTodayUtc, parseItalianDate, PAUSE_ROLE_STAFF, PAUSE_ROLE_PM, roleChoiceAppliesTo, formatPauseRoleLabelForMessage, getMemberRoleLabel, normalizePauseRoleChoice } = require("../../site/staff/pause/pauseHandlersUtils") as typeof import("../../site/staff/pause/pauseHandlersUtils");
const { PROFILE_PM_ONLY } = require("../../Utils/Staff/staffProfilePanelRuntime") as typeof import("../../Utils/Staff/staffProfilePanelRuntime");

function stripDiscordDecorations(text?) {
  return String(text || "")
    .replace(/<a?:[\w~]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/[*_`~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toIsoDay(date?) {
  if (!date || !(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolvePauseSnapshot(staffObj?, profileKind?) {
  const allPauses = Array.isArray(staffObj?.pauses) ? staffObj.pauses : [];
  const pauses =
    profileKind === PROFILE_PM_ONLY
      ? allPauses.filter((p?) => roleChoiceAppliesTo(PAUSE_ROLE_PM, p?.ruolo || p?.ruoloRichiesto))
      : allPauses;

  let active = null;
  let planned = null;
  let recentlyReturned = null;
  for (const p of pauses) {
    if (!p || String(p.status || "") !== "accepted") continue;
    const phase = getPausePhase(p.dataRichiesta, p.dataRitorno);
    if (phase === "active") {
      if (!active) active = p;
      continue;
    }
    if (phase === "planned") {
      if (!planned) planned = p;
      continue;
    }
    if (phase === "ended") {
      const end = parseItalianDate(p.dataRitorno);
      if (!end) continue;
      const ageMs = Date.now() - end.getTime();
      if (ageMs >= 0 && ageMs <= 7 * 24 * 60 * 60 * 1000) {
        if (!recentlyReturned || end > parseItalianDate(recentlyReturned.dataRitorno)) {
          recentlyReturned = p;
        }
      }
    }
  }

  if (active) {
    return {
      phase: "active",
      statusLine: `In pausa fino al ${String(active.dataRitorno || "").trim()}`,
      start: String(active.dataRichiesta || "").trim() || null,
      end: String(active.dataRitorno || "").trim() || null,
      motivazione: stripDiscordDecorations(active.motivazione || "") || null,
    };
  }
  if (planned) {
    return {
      phase: "planned",
      statusLine: `Pausa programmata dal ${String(planned.dataRichiesta || "").trim()} al ${String(planned.dataRitorno || "").trim()}`,
      start: String(planned.dataRichiesta || "").trim() || null,
      end: String(planned.dataRitorno || "").trim() || null,
      motivazione: stripDiscordDecorations(planned.motivazione || "") || null,
    };
  }
  if (recentlyReturned) {
    return {
      phase: "recently_returned",
      statusLine: `Rientrato/a il ${String(recentlyReturned.dataRitorno || "").trim()}`,
      start: String(recentlyReturned.dataRichiesta || "").trim() || null,
      end: String(recentlyReturned.dataRitorno || "").trim() || null,
      motivazione: null,
    };
  }
  return {
    phase: "none",
    statusLine: "Nessuna pausa in corso",
    start: null,
    end: null,
    motivazione: null,
  };
}

function serializePauseHistory(staffObj?, profileKind?, limit = 48, ctx: Record<string, any> = {}) {
  const today = getTodayUtc();
  const member = ctx.member || null;
  const guild = ctx.guild || member?.guild || null;
  const allPauses = Array.isArray(staffObj?.pauses) ? staffObj.pauses : [];
  const pauses =
    profileKind === PROFILE_PM_ONLY
      ? allPauses.filter((p?) => roleChoiceAppliesTo(PAUSE_ROLE_PM, p?.ruolo || p?.ruoloRichiesto))
      : allPauses;

  const rows = pauses
    .filter((p?) => p && ["accepted", "pending", "cancelled", "rejected"].includes(String(p.status || "")))
    .map((p?) => {
      const start = parseItalianDate(p.dataRichiesta);
      const end = parseItalianDate(p.dataRitorno);
      const status = String(p.status || "").trim() || "pending";
      const pauseId = String(p._id || p.id || "").trim();
      const trackRaw = String(p.ruolo || p.ruoloRichiesto || "").trim();
      const track = normalizePauseRoleChoice(trackRaw) || trackRaw || PAUSE_ROLE_STAFF;
      /* pauseRolePrecise1: badge = grado reale (Helper/Mod/…), non generico Staff */
      let ruoloLabel = "";
      try {
        ruoloLabel = formatPauseRoleLabelForMessage(guild, track || PAUSE_ROLE_STAFF, member);
      } catch (_) {
        ruoloLabel = "";
      }
      if (!ruoloLabel || /^(staff)$/i.test(String(ruoloLabel).trim())) {
        try {
          if (normalizePauseRoleChoice(track) === PAUSE_ROLE_PM) {
            ruoloLabel = "Partner Manager";
          } else {
            ruoloLabel = getMemberRoleLabel(member) || trackRaw || "Staff";
          }
        } catch (_) {
          ruoloLabel = trackRaw || "Staff";
        }
      }
      ruoloLabel = stripDiscordDecorations(ruoloLabel) || ruoloLabel;
      return {
        /* pauseReviewFix1: id+canAct servono al form HS (Entrambi non deve restare senza azioni) */
        id: pauseId,
        pauseId,
        start: String(p.dataRichiesta || "").trim(),
        end: String(p.dataRitorno || "").trim(),
        startIso: toIsoDay(start),
        endIso: toIsoDay(end),
        status,
        statusLabel: getPauseStatusLabel(p, today),
        phase: getPausePhase(p.dataRichiesta, p.dataRitorno),
        motivazione: stripDiscordDecorations(p.motivazione || "") || null,
        ruolo: ruoloLabel || trackRaw || null,
        ruoloLabel: ruoloLabel || null,
        ruoloTrack: track || null,
        ruoloRichiesto: trackRaw || null,
        canAct: status === "pending" && Boolean(pauseId),
        _sort: start ? start.getTime() : 0,
      };
    })
    .sort((a?, b?) => b._sort - a._sort)
    .slice(0, limit)
    .map(({ _sort, ...rest }) => rest);

  return rows;
}

export = { stripDiscordDecorations, resolvePauseSnapshot, serializePauseHistory };
