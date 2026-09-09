const { HOUSES } = require("./hogwartsSortingBank");
const { hasHogwartsSortingPreviewAccess, memberHasHogwartsEventStaffAccess } = require("./hogwartsEventParticipation");
const IDs = require("../Config/ids");
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

function getRomeOffsetMs(utcDate) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const zoneName = formatter.formatToParts(utcDate).find((part) => part.type === "timeZoneName")?.value;
  const match = String(zoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(year, month, day, hour, minute, second, ms = 0) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
  return new Date(utcMs);
}

function parseEventLocalParts(value) {
  const d = String(value || "").trim();
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: m[4] !== undefined ? Number(m[4]) : null,
    minute: m[5] !== undefined ? Number(m[5]) : 0,
    second: m[6] !== undefined ? Number(m[6]) : 0,
    ms: m[7] !== undefined ? Number(String(m[7]).padEnd(3, "0")) : 0,
  };
}

function parseFallbackTimeParts(fallbackTime) {
  const m = String(fallbackTime || "00:00:00").match(/(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?/);
  if (!m) return { hour: 0, minute: 0, second: 0, ms: 0 };
  return {
    hour: Number(m[1] || 0),
    minute: Number(m[2] || 0),
    second: Number(m[3] || 0),
    ms: m[4] !== undefined ? Number(String(m[4]).padEnd(3, "0")) : 0,
  };
}

function parseEventDateMs(value, timezone, fallbackTime) {
  const parts = parseEventLocalParts(value);
  if (!parts) return null;
  const fb = parseFallbackTimeParts(fallbackTime);
  const hour = parts.hour !== null ? parts.hour : fb.hour;
  const minute = parts.hour !== null ? parts.minute : fb.minute;
  const second = parts.hour !== null ? parts.second : fb.second;
  const ms = parts.hour !== null ? parts.ms : fb.ms;
  const tz = String(timezone || "Europe/Rome").trim() || "Europe/Rome";
  try {
    if (tz === "Europe/Rome") {
      const utc = createUtcFromRomeLocal(parts.year, parts.month, parts.day, hour, minute, second, ms);
      const out = utc.getTime();
      return Number.isFinite(out) ? out : null;
    }
    const normalized =
      parts.hour !== null
        ? `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.${String(ms).padStart(3, "0")}`
        : `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(fb.hour).padStart(2, "0")}:${String(fb.minute).padStart(2, "0")}:${String(fb.second).padStart(2, "0")}.${String(fb.ms).padStart(3, "0")}`;
    const out = new Date(normalized).getTime();
    return Number.isFinite(out) ? out : null;
  } catch {
    return null;
  }
}

function parseDateStart(iso, timezone) {
  return parseEventDateMs(iso, timezone, "00:00:00");
}

function parseDateEnd(iso, timezone) {
  return parseEventDateMs(iso, timezone, "23:59:59.999");
}

function parseDateStartMs(value, timezone) {
  return parseDateStart(value, timezone);
}

function parseDateEndMs(value, timezone) {
  return parseDateEnd(value, timezone);
}

function resolveHogwartsEventConfig(client) {
  const raw = (client?.config?.hogwartsEvent && typeof client.config.hogwartsEvent === "object" ? client.config.hogwartsEvent : null) || {};
  const enabled = readBool(process.env.HOGWARTS_EVENT_ENABLED ?? raw.enabled, true);
  const previewMode = readBool(process.env.HOGWARTS_EVENT_PREVIEW ?? raw.previewMode, false);
  const timezone = String(process.env.HOGWARTS_EVENT_TZ || raw.timezone || "Europe/Rome").trim() || "Europe/Rome";
  const startDate = String(process.env.HOGWARTS_EVENT_START || raw.startDate || "2026-06-01T14:00:00").trim();
  const sortingStartDate = String(
    process.env.HOGWARTS_SORTING_START || raw.sortingStartDate || startDate,
  ).trim();
  const endDate = String(process.env.HOGWARTS_EVENT_END || raw.endDate || "2026-09-01T12:00:00").trim();
  const eventKey = String(process.env.HOGWARTS_EVENT_KEY || raw.eventKey || DEFAULT_EVENT_KEY).trim() || DEFAULT_EVENT_KEY;
  const housesRaw = raw.houses && typeof raw.houses === "object" ? raw.houses : {};
  const houses = {};
  for (const id of HOUSES) {
    const entry = housesRaw[id] && typeof housesRaw[id] === "object" ? housesRaw[id] : {};
    const roleRaw = String(process.env[`HOGWARTS_ROLE_${id.toUpperCase()}`] || entry.roleId || "").trim();
    houses[id] = {
      roleId: roleRaw.split(/[,\s]+/).map((p) => p.trim()).find((p) => /^\d{17,22}$/.test(p)) || "",
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
  const completionRoleRaw = String(
    process.env.HOGWARTS_COMPLETION_ROLE_ID || raw.completionRoleId || "1507000390493798511",
  ).trim();
  const completionRoleId =
    completionRoleRaw.split(/[,\s]+/).map((p) => p.trim()).find((p) => /^\d{17,22}$/.test(p)) ||
    "1507000390493798511";
  const finaleWinnerHouseBonusRoleRaw = String(
    process.env.HOGWARTS_FINALE_WINNER_BONUS_ROLE_ID || raw.finaleWinnerHouseBonusRoleId || "1544830792168116234",
  ).trim();
  const finaleWinnerHouseBonusRoleId =
    finaleWinnerHouseBonusRoleRaw.split(/[,\s]+/).map((p) => p.trim()).find((p) => /^\d{17,22}$/.test(p)) || "";
  const finaleAnnounceChannelId = String(
    process.env.HOGWARTS_FINALE_ANNOUNCE_CHANNEL_ID || raw.finaleAnnounceChannelId || IDs.channels?.eventAnnouncements || "",
  ).trim();
  const finaleCommemorativoRoleRaw = String(
    process.env.HOGWARTS_FINALE_COMMEMORATIVO_ROLE_ID ||
      raw.finaleCommemorativoRoleId ||
      raw.completionRoleId ||
      IDs.roles?.HogwartsEventParticipant ||
      "",
  ).trim();
  const finaleCommemorativoRoleId =
    finaleCommemorativoRoleRaw.split(/[,\s]+/).map((p) => p.trim()).find((p) => /^\d{17,22}$/.test(p)) || "";
  const finaleLotteryChannelId = String(
    process.env.HOGWARTS_FINALE_LOTTERY_CHANNEL_ID || raw.finaleLotteryChannelId || IDs.channels?.vocaleLounge1 || "",
  ).trim();
  const finaleLotteryAt = String(process.env.HOGWARTS_FINALE_LOTTERY_AT || raw.finaleLotteryAt || "2026-09-02T15:00:00").trim();
  const sortingLogChannelId = String(process.env.HOGWARTS_SORTING_LOG_CHANNEL_ID || raw.sortingLogChannelId || "").trim();
  const punticasaPrefectHousesRaw = raw.punticasaPrefectHouses && typeof raw.punticasaPrefectHouses === "object"
    ? raw.punticasaPrefectHouses
    : {};
  const punticasaPrefectHouses = {};
  for (const [uid, house] of Object.entries(punticasaPrefectHousesRaw)) {
    const userId = String(uid || "").trim();
    const houseId = String(house || "").trim();
    if (userId && houseId) punticasaPrefectHouses[userId] = houseId;
  }
  return {
    enabled,
    previewMode,
    timezone,
    startDate,
    sortingStartDate,
    endDate,
    startMs: parseDateStart(startDate, timezone),
    sortingStartMs: parseDateStart(sortingStartDate, timezone),
    endMs: parseDateEnd(endDate, timezone),
    eventKey,
    houses,
    staffBypassUserIds,
    gringott,
    completionRoleId,
    finaleWinnerHouseBonusRoleId,
    finaleAnnounceChannelId,
    finaleCommemorativoRoleId,
    finaleLotteryChannelId,
    finaleLotteryAt,
    sortingLogChannelId,
    punticasaPrefectHouses,
  };
}

function isEventWindowOpen(cfg, nowMs, userId, member = null) {
  if (!cfg?.enabled) return { open: false, phase: "disabled" };
  const now = Number(nowMs || Date.now());
  if (memberHasHogwartsEventStaffAccess(cfg, member, userId)) return { open: true, phase: "staff_bypass" };
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

function resolveHubStartMs(cfg) {
  const ms = Number(cfg?.sortingStartMs ?? cfg?.startMs);
  return Number.isFinite(ms) ? ms : null;
}

function isHubWindowOpen(cfg, nowMs, userId) {
  return isSortingWindowOpen(cfg, nowMs, userId);
}

function isMinigameEventWindowOpen(cfg, nowMs, userId) {
  return isEventWindowOpen(cfg, nowMs, userId);
}

function isSortingWindowOpen(cfg, nowMs, userId, member = null) {
  if (!cfg?.enabled) return { open: false, phase: "disabled" };
  const now = Number(nowMs || Date.now());
  if (memberHasHogwartsEventStaffAccess(cfg, member, userId)) return { open: true, phase: "staff_bypass" };
  const start = Number(cfg.sortingStartMs ?? cfg.startMs);
  const end = Number(cfg.endMs);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { open: false, phase: "misconfigured" };
  if (now < start) return { open: false, phase: "before_start", startsAtMs: start };
  if (now > end) return { open: false, phase: "after_end", endsAtMs: end };
  return { open: true, phase: "live" };
}

function resolveSortingWindowForViewer(cfg, nowMs, member, userId) {
  const dateState = isSortingWindowOpen(cfg, nowMs, userId);
  if (dateState.open) return dateState;
  if (cfg?.previewMode && hasHogwartsSortingPreviewAccess(cfg, member, userId)) {
    return { ...dateState, open: true, phase: "preview" };
  }
  return dateState;
}

function formatSortingWindowIt(cfg) {
  try {
    const format = (value) => {
      const ms = parseEventDateMs(value, cfg.timezone, "12:00:00");
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
    const start = cfg.sortingStartDate ? format(cfg.sortingStartDate) : "";
    const end = cfg.endDate ? format(cfg.endDate) : "";
    if (start && end) return `dal ${start} al ${end}`;
    return "";
  } catch {
    return "";
  }
}

function formatEventWindowIt(cfg) {
  try {
    const format = (value) => {
      const ms = parseEventDateMs(value, cfg.timezone, "12:00:00");
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

function collectHogwartsSystemRoleIds(client = null) {
  const cfg = resolveHogwartsEventConfig(client);
  const ids = new Set();
  const pushExpanded = (raw) => {
    for (const part of String(raw || "").split(/[,\s]+/)) {
      const id = part.trim();
      if (/^\d{17,22}$/.test(id)) ids.add(id);
    }
  };
  for (const house of Object.values(cfg.houses || {})) {
    pushExpanded(house?.roleId);
  }
  pushExpanded(cfg.completionRoleId);
    for (const id of [
    "1504791825657888898",
    "1504791921246339072",
    "1504791899100155987",
    "1504791872671973537",
    "1507000390493798511",
  ]) {
    ids.add(id);
  }
  return ids;
}

function isHogwartsSystemRoleId(roleId, client = null) {
  const id = String(roleId || "").trim();
  if (!id) return false;
  return collectHogwartsSystemRoleIds(client).has(id);
}

module.exports = {
  resolveHogwartsEventConfig,
  resolveHubStartMs,
  parseEventDateMs,
  parseDateStartMs,
  parseDateEndMs,
  isEventWindowOpen,
  isHubWindowOpen,
  isMinigameEventWindowOpen,
  isSortingWindowOpen,
  resolveEventWindowForViewer,
  resolveSortingWindowForViewer,
  formatEventWindowIt,
  formatSortingWindowIt,
  collectHogwartsSystemRoleIds,
  isHogwartsSystemRoleId,
};