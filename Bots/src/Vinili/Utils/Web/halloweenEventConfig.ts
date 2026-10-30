const { parseEventDateMs } = require("./eventDates") as typeof import("./eventDates");

const DEFAULT_EVENT_KEY = "halloween_2026";

function readBool(v?, fallback?) {
  if (v === true || v === false) return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return fallback;
}

function getTestGuildIdSafe() {
  try {
    const IDs = require("../Config/ids") as typeof import("../Config/ids");
    return String(IDs.guilds?.test || "").trim();
  } catch (_) {
    return "";
  }
}

function isHalloweenForceLiveOnTestGuild(client?, guildId?) {
  const testId = getTestGuildIdSafe();
  const gid = String(guildId || "").trim();
  if (!testId || !gid || gid !== testId) return false;
  const raw =
    (client?.config?.halloweenEvent && typeof client.config.halloweenEvent === "object"
      ? client.config.halloweenEvent
      : null) || {};
  return readBool(process.env.HALLOWEEN_TEST_FORCE_LIVE ?? raw.testGuildForceLive, false);
}

function getRomeOffsetMs(utcDate?) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const zoneName = formatter.formatToParts(utcDate).find((part?) => part.type === "timeZoneName")?.value;
  const match = String(zoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(year?, month?, day?, hour?, minute?, second?, ms = 0) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
  return new Date(utcMs);
}

function resolveHalloweenEventConfig(client?) {
  const raw =
    (client?.config?.halloweenEvent && typeof client.config.halloweenEvent === "object"
      ? client.config.halloweenEvent
      : null) || {};
  const enabled = readBool(process.env.HALLOWEEN_EVENT_ENABLED ?? raw.enabled, false);
  const timezone = String(process.env.HALLOWEEN_EVENT_TZ || raw.timezone || "Europe/Rome").trim() || "Europe/Rome";
  const startDate = String(process.env.HALLOWEEN_EVENT_START || raw.startDate || "2026-10-24T12:00:00").trim();
  const endDate = String(process.env.HALLOWEEN_EVENT_END || raw.endDate || "2026-11-02T12:00:00").trim();
  const eventKey = String(process.env.HALLOWEEN_EVENT_KEY || raw.eventKey || DEFAULT_EVENT_KEY).trim() || DEFAULT_EVENT_KEY;
  const testGuildForceLive = readBool(
    process.env.HALLOWEEN_TEST_FORCE_LIVE ?? raw.testGuildForceLive,
    false,
  );
  return {
    enabled,
    timezone,
    startDate,
    endDate,
    startMs: parseEventDateMs(startDate, timezone, "12:00:00"),
    endMs: parseEventDateMs(endDate, timezone, "12:00:00"),
    eventKey,
    testGuildForceLive,
  };
}

function isHalloweenEventWindowOpen(cfg?, nowMs = Date.now()) {
  if (!cfg?.enabled) return { open: false, phase: "disabled" };
  const now = Number(nowMs || Date.now());
  const start = Number(cfg.startMs);
  const end = Number(cfg.endMs);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { open: false, phase: "misconfigured" };
  if (now < start) return { open: false, phase: "before_start", startsAtMs: start };
  if (now >= end) return { open: false, phase: "after_end", endsAtMs: end };
  return { open: true, phase: "live" };
}

function isHalloweenEventLive(client?, nowMs = Date.now(), guildId = null) {
  const cfg = resolveHalloweenEventConfig(client);
  if (!cfg.enabled) return false;
  const testId = getTestGuildIdSafe();
  const gid = String(guildId || "").trim();
  // Server test: solo staging esplicito (testGuildForceLive). Mai mirror automatico della finestra main.
  if (testId && gid && gid === testId) {
    return isHalloweenForceLiveOnTestGuild(client, guildId);
  }
  return Boolean(isHalloweenEventWindowOpen(cfg, nowMs)?.open);
}

/** Ore candy (react hunt + trick-or-treat): 08:00–24:00 Europe/Rome. */
function isWithinHalloweenCandyHours(nowMs = Date.now(), hourStart = 8, hourEnd = 24) {
  const startH = Math.max(0, Math.min(23, Math.floor(Number(hourStart) || 8)));
  const endH = Math.max(1, Math.min(24, Math.floor(Number(hourEnd) || 24)));
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const map = Object.fromEntries(parts.filter((p?) => p.type !== "literal").map((p?) => [p.type, p.value]));
  const minutes = Number(map.hour) * 60 + Number(map.minute);
  const start = startH * 60;
  const end = endH * 60;
  if (end <= start) return minutes >= start || minutes < end;
  return minutes >= start && minutes < end;
}

export = {
  DEFAULT_EVENT_KEY,
  resolveHalloweenEventConfig,
  isHalloweenEventWindowOpen,
  isHalloweenEventLive,
  isHalloweenForceLiveOnTestGuild,
  isWithinHalloweenCandyHours,
  createUtcFromRomeLocal,
};
