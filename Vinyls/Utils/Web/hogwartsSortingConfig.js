const { HOUSES } = require("./hogwartsSortingBank");
const { hasHogwartsSortingPreviewAccess } = require("./hogwartsEventParticipation");
const DEFAULT_EVENT_KEY = "hogwarts_summer_2026";

function readBool(v, fallback) {
  if (v === true || v === false) return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return fallback;
}

function readPositiveInt(v, fallback) {
  const n = Math.floor(Number(v));
  if (Number.isFinite(n) && n > 0) return n;
  return fallback;
}

function parseEventDateMs(value, fallbackTime) {
  const d = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)?$/.test(d)) return null;
  try {
    const normalized = d.includes("T") || /\s\d{2}:\d{2}/.test(d) ? d.replace(/\s+/, "T") : `${d}T${fallbackTime}`;
    const ms = new Date(normalized).getTime();
    if (!Number.isFinite(ms)) return null;
    return ms;
  } catch {
    return null;
  }
}

function parseDateStart(iso) {
  return parseEventDateMs(iso, "00:00:00");
}

function parseDateEnd(iso) {
  return parseEventDateMs(iso, "23:59:59.999");
}

function resolveHogwartsEventConfig(client) {
  const raw = (client?.config?.hogwartsEvent && typeof client.config.hogwartsEvent === "object" ? client.config.hogwartsEvent : null) || {};
  const enabled = readBool(process.env.HOGWARTS_EVENT_ENABLED ?? raw.enabled, true);
  const previewMode = readBool(process.env.HOGWARTS_EVENT_PREVIEW ?? raw.previewMode, false);
  const timezone = String(process.env.HOGWARTS_EVENT_TZ || raw.timezone || "Europe/Rome").trim() || "Europe/Rome";
  const startDate = String(process.env.HOGWARTS_EVENT_START || raw.startDate || "2026-06-01T14:00:00").trim();
  const endDate = String(process.env.HOGWARTS_EVENT_END || raw.endDate || "2026-09-01T12:00:00").trim();
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
  const gringottRaw = raw.gringott && typeof raw.gringott === "object" ? raw.gringott : {};
  const gringott = {
    sortingReward: readPositiveInt(process.env.HOGWARTS_GRINGOTT_SORTING_REWARD ?? gringottRaw.sortingReward, 250),
  };
  const completionRoleId = String(process.env.HOGWARTS_COMPLETION_ROLE_ID || raw.completionRoleId || "1507000390493798511").trim();
  return { enabled, previewMode, timezone, startDate, endDate, startMs: parseDateStart(startDate), endMs: parseDateEnd(endDate), eventKey, houses, staffBypassUserIds, gringott, completionRoleId };
}

function isEventWindowOpen(cfg, nowMs, userId) {
  if (!cfg?.enabled) return { open: false, phase: "disabled" };
  const now = Number(nowMs || Date.now());
  const bypass =
    userId && Array.isArray(cfg.staffBypassUserIds) && cfg.staffBypassUserIds.includes(String(userId));
  if (bypass) return { open: true, phase: "staff_bypass" };
  const start = Number(cfg.startMs);
  const end = Number(cfg.endMs);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { open: false, phase: "misconfigured" };
  if (now < start) return { open: false, phase: "before_start", startsAtMs: start };
  if (now > end) return { open: false, phase: "after_end", endsAtMs: end };
  return { open: true, phase: "live" };
}

function resolveEventWindowForViewer(cfg, nowMs, member, userId) {
  const dateState = isEventWindowOpen(cfg, nowMs, userId);
  if (dateState.open) return dateState;
  if (cfg?.previewMode && hasHogwartsSortingPreviewAccess(cfg, member, userId)) {
    return { ...dateState, open: true, phase: "preview" };
  }
  return dateState;
}

function formatEventWindowIt(cfg) {
  try {
    const format = (value) => {
      const ms = parseEventDateMs(value, "12:00:00");
      if (!Number.isFinite(ms)) return "";
      return new Date(ms).toLocaleString("it-IT", {
        timeZone: cfg.timezone || "Europe/Rome",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };
    const start = cfg.startDate
      ? format(cfg.startDate)
      : "";
    const end = cfg.endDate
      ? format(cfg.endDate)
      : "";
    if (start && end) return `dal ${start} al ${end}`;
    return "";
  } catch {
    return "";
  }
}

module.exports = { resolveHogwartsEventConfig, isEventWindowOpen, resolveEventWindowForViewer, formatEventWindowIt };