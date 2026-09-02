
const DEFAULT_FORBIDDEN_START = "2026-06-20T12:00:00";
const DEFAULT_FORBIDDEN_END = "2026-09-01T10:00:00";

function parseScheduleMs(value, fallbackTime = "12:00:00") {
  const d = String(value || "").trim();
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const ms = new Date(`${d}T${fallbackTime}`).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const normalized = d.includes("T") || /\s\d{2}:\d{2}/.test(d) ? d.replace(/\s+/, "T") : `${d}T${fallbackTime}`;
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function addDaysYmd(ymd, days) {
  const base = new Date(`${ymd}T12:00:00`);
  if (!Number.isFinite(base.getTime())) return "";
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const day = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseScheduleEndMs(value, options = {}) {
  const endHour = Number.isFinite(Number(options.endHour)) ? Number(options.endHour) : 10;
  const hourStr = `${String(Math.floor(endHour)).padStart(2, "0")}:00:00`;
  const d = String(value || "").trim();
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const nextDay = addDaysYmd(d, 1);
    if (!nextDay) return null;
    const ms = new Date(`${nextDay}T${hourStr}`).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return parseScheduleMs(d, hourStr);
}

function resolveForbiddenBooksSchedule(clientOrConfig) {
  const root = clientOrConfig?.config && typeof clientOrConfig.config === "object" ? clientOrConfig.config : clientOrConfig;
  const raw = root?.hogwartsForbiddenBooks && typeof root.hogwartsForbiddenBooks === "object" ? root.hogwartsForbiddenBooks : {};
  const presence = root?.presence?.forbiddenSectionEvent && typeof root.presence.forbiddenSectionEvent === "object"
    ? root.presence.forbiddenSectionEvent
    : {};
  const startDate = String(raw.startDate || presence.startDate || DEFAULT_FORBIDDEN_START).trim() || DEFAULT_FORBIDDEN_START;
  const endDate = String(raw.endDate || presence.endDate || DEFAULT_FORBIDDEN_END).trim() || DEFAULT_FORBIDDEN_END;
  const startMs = parseScheduleMs(startDate, "12:00:00") ?? new Date(DEFAULT_FORBIDDEN_START).getTime();
  const endMs = parseScheduleEndMs(endDate, { endHour: 10 })
    ?? parseScheduleMs(endDate, "10:00:00")
    ?? new Date(DEFAULT_FORBIDDEN_END).getTime();
  return { startDate, endDate, startMs, endMs };
}

module.exports = {
  DEFAULT_FORBIDDEN_START,
  DEFAULT_FORBIDDEN_END,
  parseScheduleMs,
  parseScheduleEndMs,
  resolveForbiddenBooksSchedule,
};