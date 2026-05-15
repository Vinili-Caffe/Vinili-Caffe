const { HOUSES } = require("./hogwartsSortingBank");

const DEFAULT_EVENT_KEY = "hogwarts_summer_2026";

function readBool(v, fallback) {
  if (v === true || v === false) return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return fallback;
}

function parseDateStart(iso, tz) {
  const d = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  try {
    const ms = new Date(`${d}T00:00:00`).getTime();
    if (!Number.isFinite(ms)) return null;
    return ms;
  } catch {
    return null;
  }
}

function parseDateEnd(iso) {
  const d = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  try {
    const ms = new Date(`${d}T23:59:59.999`).getTime();
    if (!Number.isFinite(ms)) return null;
    return ms;
  } catch {
    return null;
  }
}

function resolveHogwartsEventConfig(client) {
  const raw =
    (client?.config?.hogwartsEvent && typeof client.config.hogwartsEvent === "object"
      ? client.config.hogwartsEvent
      : null) || {};
  const enabled = readBool(process.env.HOGWARTS_EVENT_ENABLED ?? raw.enabled, true);
  const previewMode = readBool(process.env.HOGWARTS_EVENT_PREVIEW ?? raw.previewMode, false);
  const timezone = String(process.env.HOGWARTS_EVENT_TZ || raw.timezone || "Europe/Rome").trim() || "Europe/Rome";
  const startDate = String(process.env.HOGWARTS_EVENT_START || raw.startDate || "2026-06-01").trim();
  const endDate = String(process.env.HOGWARTS_EVENT_END || raw.endDate || "2026-08-30").trim();
  const eventKey = String(process.env.HOGWARTS_EVENT_KEY || raw.eventKey || DEFAULT_EVENT_KEY).trim() || DEFAULT_EVENT_KEY;
  const housesRaw = raw.houses && typeof raw.houses === "object" ? raw.houses : {};
  const houses = {};
  for (const id of HOUSES) {
    const entry = housesRaw[id] && typeof housesRaw[id] === "object" ? housesRaw[id] : {};
    houses[id] = {
      roleId: String(process.env[`HOGWARTS_ROLE_${id.toUpperCase()}`] || entry.roleId || "").trim(),
      label: String(entry.label || "").trim(),
      crestUrl: String(entry.crestUrl || "").trim(),
    };
  }
  const staffBypassUserIds = Array.isArray(raw.staffBypassUserIds)
    ? raw.staffBypassUserIds.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  return {
    enabled,
    previewMode,
    timezone,
    startDate,
    endDate,
    startMs: parseDateStart(startDate, timezone),
    endMs: parseDateEnd(endDate),
    eventKey,
    houses,
    staffBypassUserIds,
  };
}

function isEventWindowOpen(cfg, nowMs, userId) {
  if (!cfg?.enabled) return { open: false, phase: "disabled" };
  const now = Number(nowMs || Date.now());
  const bypass =
    userId && Array.isArray(cfg.staffBypassUserIds) && cfg.staffBypassUserIds.includes(String(userId));
  if (cfg.previewMode || bypass) return { open: true, phase: cfg.previewMode ? "preview" : "staff_bypass" };
  const start = Number(cfg.startMs);
  const end = Number(cfg.endMs);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { open: false, phase: "misconfigured" };
  if (now < start) return { open: false, phase: "before_start", startsAtMs: start };
  if (now > end) return { open: false, phase: "after_end", endsAtMs: end };
  return { open: true, phase: "live" };
}

function formatEventWindowIt(cfg) {
  try {
    const start = cfg.startDate
      ? new Date(`${cfg.startDate}T12:00:00`).toLocaleDateString("it-IT", {
          timeZone: cfg.timezone || "Europe/Rome",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";
    const end = cfg.endDate
      ? new Date(`${cfg.endDate}T12:00:00`).toLocaleDateString("it-IT", {
          timeZone: cfg.timezone || "Europe/Rome",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";
    if (start && end) return `dal ${start} al ${end}`;
    return "";
  } catch {
    return "";
  }
}

module.exports = {
  resolveHogwartsEventConfig,
  isEventWindowOpen,
  formatEventWindowIt,
};