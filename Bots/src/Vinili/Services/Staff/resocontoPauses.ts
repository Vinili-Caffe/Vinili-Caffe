/** Resoconti settimanali: pause dello staff durante la settimana. */
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { applyPronounGenderToTextForMember } = require("../../Utils/Community/pronounGenderUtils") as typeof import("../../Utils/Community/pronounGenderUtils");
const { normalizePauseRoleChoice, roleChoiceAppliesTo, PAUSE_ROLE_PM } = require("../../Utils/Pause/pauseHandlersUtils") as typeof import("../../Utils/Pause/pauseHandlersUtils");
/* pauseHalfDay1: le mezze giornate contano nel resoconto solo se mattina + pomeriggio dello stesso giorno */
const { pausesForWeeklyRules } = require("../../Utils/Pause/pauseHalfDay") as typeof import("../../Utils/Pause/pauseHalfDay");
const { getRomeDateParts, createUtcFromRomeLocal, addDaysToRomeYmd, parseItalianDate, getRomeStartOfDayUtc } = require("./resocontoTime") as typeof import("./resocontoTime");

function pauseRoleAppliesToSection(pauseRole?, sectionRole?) {
  const section = String(sectionRole || "").trim();
  if (!section) return true;
  const raw = String(pauseRole || "").trim();
  if (!raw) return true;
    if (roleChoiceAppliesTo(section, raw)) return true;
  const normalized = normalizePauseRoleChoice(raw);
  if (normalized && roleChoiceAppliesTo(section, normalized)) return true;
    if (String(section).toLowerCase() === "staff") {
    const low = raw.toLowerCase();
    if (low === "staff" || low.includes("helper") || low.includes("mod") || low.includes("director") || low.includes("admin") || low.includes("manager") || low.includes("founder") || low.includes("high")) {
      return true;
    }
        if (!normalizePauseRoleChoice(raw) && !/partner\s*manager|\bpm\b/i.test(raw)) {
      return true;
    }
  }
  if (String(section).toLowerCase() === "partnermanager") {
    return Boolean(normalizePauseRoleChoice(raw) === PAUSE_ROLE_PM || /partner\s*manager|\bpm\b/i.test(raw));
  }
  return false;
}

function getStaffPauseLine(staffDoc?, sectionRole = null, member = null) {
  const pauses = pausesForWeeklyRules(staffDoc?.pauses);
  const now = new Date();
  const today = getRomeStartOfDayUtc(now);
  const romeToday = getRomeDateParts(now);
  const agoParts = addDaysToRomeYmd(romeToday.year, romeToday.month, romeToday.day, -7);
  const sevenDaysAgo = createUtcFromRomeLocal(agoParts.year, agoParts.month, agoParts.day, 0, 0, 0);
  for (const p of pauses) {
    if (!p || p.status !== "accepted") continue;
    if (!pauseRoleAppliesToSection(p.ruolo || p.ruoloRichiesto, sectionRole)) continue;
    const start = parseItalianDate(p.dataRichiesta);
    const end = parseItalianDate(p.dataRitorno);
    if (!start || !end) continue;
    if (today >= start && today <= end) {
      return `<a:VC_Calendar:1482706208149475358> **In pausa** fino al ${p.dataRitorno}`;
    }
    if (end < today && end >= sevenDaysAgo) {
      const line = `<a:VC_Calendar:1482706208149475358> **Rientrato/a** il ${p.dataRitorno}`;
      return member ? applyPronounGenderToTextForMember(line, member) : line;
    }
  }
  return null;
}

function wasInPauseDuringWeek(staffDoc?, weekStart?, weekEnd?, sectionRole = null) {
  const pauses = pausesForWeeklyRules(staffDoc?.pauses);
  const ws = weekStart.getTime();
  const we = weekEnd.getTime();
  for (const p of pauses) {
    if (!p || p.status !== "accepted") continue;
    if (!pauseRoleAppliesToSection(p.ruolo || p.ruoloRichiesto, sectionRole)) continue;
    const start = parseItalianDate(p.dataRichiesta);
    const end = parseItalianDate(p.dataRitorno);
    if (!start || !end) continue;
    const ps = start.getTime();
    const pe = end.getTime();
    if (ps <= we && pe >= ws) return true;
  }
  return false;
}

function hadPauseAtLeastOneDayDuringWeek(staffDoc?, weekStart?, weekEnd?, sectionRole = null) {
  const pauses = pausesForWeeklyRules(staffDoc?.pauses);
  const ws = weekStart.getTime();
  const we = weekEnd.getTime();
  if (!Number.isFinite(ws) || !Number.isFinite(we) || we < ws) return false;

  const acceptedPauses = [];
  for (const p of pauses) {
    if (!p || p.status !== "accepted") continue;
    if (!pauseRoleAppliesToSection(p.ruolo || p.ruoloRichiesto, sectionRole)) continue;
    const start = parseItalianDate(p.dataRichiesta);
    const end = parseItalianDate(p.dataRitorno);
    if (!start || !end) continue;
    acceptedPauses.push({ start: start.getTime(), end: end.getTime() });
  }
  if (!acceptedPauses.length) return false;

  let cursorParts = getRomeDateParts(weekStart);
  const endParts = getRomeDateParts(weekEnd);
  for (let guard = 0; guard < 14; guard += 1) {
    const dayStart = createUtcFromRomeLocal(cursorParts.year, cursorParts.month, cursorParts.day, 0, 0, 0);
    const dayEnd = createUtcFromRomeLocal(cursorParts.year, cursorParts.month, cursorParts.day, 23, 59, 59);
    const ds = dayStart.getTime();
    const de = dayEnd.getTime();
    if (ds > we) break;
    if (de >= ws) {
      for (const pause of acceptedPauses) {
        if (pause.start <= de && pause.end >= ds) return true;
      }
    }
    if (cursorParts.year === endParts.year && cursorParts.month === endParts.month && cursorParts.day === endParts.day) break;
    cursorParts = addDaysToRomeYmd(cursorParts.year, cursorParts.month, cursorParts.day, 1);
  }
  return false;
}

function didPauseEndDuringWeek(staffDoc?, weekStart?, weekEnd?, sectionRole = null) {
  const pauses = pausesForWeeklyRules(staffDoc?.pauses);
  const ws = weekStart.getTime();
  const we = weekEnd.getTime();
  for (const p of pauses) {
    if (!p || p.status !== "accepted") continue;
    if (!pauseRoleAppliesToSection(p.ruolo || p.ruoloRichiesto, sectionRole)) continue;
    const end = parseItalianDate(p.dataRitorno);
    if (!end) continue;
    const pe = end.getTime();
    if (pe >= ws && pe <= we) return true;
  }
  return false;
}

function wasPartnerManagerInPauseForResocontoWeek(staffDoc?, weekStart?, weekEnd?, member?) {
  if (wasInPauseDuringWeek(staffDoc, weekStart, weekEnd, "PartnerManager")) return true;
  const pmId = String(IDs.roles?.PartnerManager || "");
  if (pmId && member?.roles?.cache?.has(pmId) && wasInPauseDuringWeek(staffDoc, weekStart, weekEnd, "Staff")) return true;
  return false;
}

function getPmResocontoPauseDisplayLine(staffDoc?, member?) {
  const pmLine = getStaffPauseLine(staffDoc, "PartnerManager", member);
  if (pmLine) return pmLine;
  const pmId = String(IDs.roles?.PartnerManager || "");
  if (pmId && member?.roles?.cache?.has(pmId)) return getStaffPauseLine(staffDoc, "Staff", member);
  return null;
}

async function hydrateStaffPausesFromWorkflowIfMissing(guildId?, userId?, staffDoc?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid || !staffDoc || typeof staffDoc !== "object") return false;
  if (!Array.isArray(staffDoc.pauses)) staffDoc.pauses = [];
  let SiteDocument;
  try {
    ({ SiteDocument } = require("../../Schemas/Community/communitySchemas"));
  } catch {
    return false;
  }
  const docs = await SiteDocument.find({
    guildId: gid,
    docType: "staff_workflow",
    workflowQueue: "pause",
    userId: uid,
    status: { $in: ["accepted", "cancelled"] },
  })
    .select({ status: 1, workflowPauseId: 1, workflowFields: 1, body: 1, reason: 1, content: 1, createdAt: 1 })
    .lean()
    .catch(() => []);
  if (!docs?.length) return false;
  let added = 0;
  for (const wf of docs) {
    const pauseId = String(wf.workflowPauseId || "").trim();
    if (!pauseId) continue;
    if (staffDoc.pauses.some((p?) => String(p?._id || "") === pauseId)) continue;
    const fields = wf.workflowFields || {};
    const from = fields.dataRichiesta || fields.start;
    const to = fields.dataRitorno || fields.end;
    if (!from || !to) continue;
    staffDoc.pauses.push({
      _id: pauseId,
      dataRichiesta: String(from),
      dataRitorno: String(to),
      motivazione: String(wf.body || wf.reason || wf.content || "").slice(0, 500),
      giorniUsati: Number(fields.giorniScalati) || 0,
      giorniAggiuntivi: 0,
      ruoloRichiesto: String(fields.ruoloRichiesto || fields.ruoloTrack || "Staff"),
      halfDay: fields.halfDay || null,
      ruolo: String(fields.ruoloLabel || fields.ruoloTrack || "Staff"),
      status: String(wf.status || "accepted"),
      cancelledAt: String(wf.status) === "cancelled" ? new Date() : null,
      createdAt: wf.createdAt || new Date(),
    });
    added += 1;
  }
  return added > 0;
}

function getLatestAcceptedPause(staffDoc?) {
  const pauses = pausesForWeeklyRules(staffDoc?.pauses);
  let best = null;
  let bestMs = -Infinity;
  for (const pause of pauses) {
    if (!pause || pause.status !== "accepted") continue;
    const start = parseItalianDate(pause.dataRichiesta);
    const end = parseItalianDate(pause.dataRitorno);
    if (!start && !end) continue;
    const refMs = Math.max(start?.getTime?.() || -Infinity, end?.getTime?.() || -Infinity);
    if (refMs > bestMs) {
      bestMs = refMs;
      best = { start, end };
    }
  }
  return best;
}

export = { getStaffPauseLine, hadPauseAtLeastOneDayDuringWeek, didPauseEndDuringWeek, wasPartnerManagerInPauseForResocontoWeek, getPmResocontoPauseDisplayLine, hydrateStaffPausesFromWorkflowIfMissing, getLatestAcceptedPause };
