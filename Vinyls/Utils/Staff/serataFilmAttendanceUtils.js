const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../DB/validateWriteIds");
const { siteWorkflowUrl } = require("../Web/discordWorkflowUiGate");
const TIME_ZONE = "Europe/Rome";
const TARGET_WEEKDAY = 6;
const PANEL_PREFIX = "staff_profile_panel";

const ROME_PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const WEEKDAY_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function getRomeParts(date = new Date()) {
  const parts = {};
  for (const part of ROME_PARTS_FORMATTER.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAY_INDEX[parts.weekday] || 0,
    hour,
    minute: Number(parts.minute),
  };
}

function toDateKey(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const ATTENDANCE_DEADLINE_HOUR = 20;
const ATTENDANCE_DEADLINE_MINUTE = 45;

function getRomeOffsetMs(utcDate) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const zoneName = dtf.formatToParts(utcDate).find((part) => part.type === "timeZoneName")?.value;
  const match = String(zoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(year, month, day, hour, minute) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
  return utcMs;
}

function getSerataFilmAttendanceDeadlineMs(saturdayKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(saturdayKey || "").trim());
  if (!m) return 0;
  return createUtcFromRomeLocal(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    ATTENDANCE_DEADLINE_HOUR,
    ATTENDANCE_DEADLINE_MINUTE,
  );
}

function getRomeSaturdayKeyForWeek(date = new Date()) {
  const parts = getRomeParts(date);
  const utcDate = Date.UTC(parts.year, parts.month - 1, parts.day);
  const saturdayUtc = utcDate + (TARGET_WEEKDAY - Math.max(1, parts.weekday)) * 24 * 60 * 60 * 1000;
  const saturday = new Date(saturdayUtc);
  return toDateKey(saturday.getUTCFullYear(), saturday.getUTCMonth() + 1, saturday.getUTCDate());
}

function getSerataFilmSaturdayKeyForSession(session) {
  const startedAt = Number(session?.startedAt || 0);
  return getRomeSaturdayKeyForWeek(startedAt > 0 ? new Date(startedAt) : new Date());
}

function canEditSerataFilmAttendance(now = new Date(), saturdayKey = getRomeSaturdayKeyForWeek(now)) {
  const deadlineMs = getSerataFilmAttendanceDeadlineMs(saturdayKey);
  return Number.isFinite(deadlineMs) && deadlineMs > 0 && now.getTime() < deadlineMs;
}

function resolveSerataFilmAttendanceForWeek(staff, now = new Date()) {
  const saturdayKey = getRomeSaturdayKeyForWeek(now);
  const keyMatch = String(staff?.serataFilmAttendanceSaturdayKey || "") === saturdayKey;
  const declaredAbsent = keyMatch && staff?.serataFilmWillAttend === false;
  return {
    saturdayKey,
    willAttend: !declaredAbsent,
    declaredAbsent,
    editable: canEditSerataFilmAttendance(now, saturdayKey),
  };
}

function isSerataFilmAbsentExcused(staff, saturdayKey) {
  if (!staff) return false;
  if (String(staff.serataFilmAttendanceSaturdayKey || "") !== String(saturdayKey || "")) return false;
  return staff.serataFilmWillAttend === false;
}

function buildSerataFilmAttendanceDescriptionLine(state, isSelfView = false) {
  const willAttend = Boolean(state?.willAttend);
  const status = willAttend
    ? "**Sì**"
    : "**No** (assenza segnalata)";
  const lines = [
    `<a:VC_Calendar:1482706208149475358> **Serata film:** Presenza prevista ${status}`,
  ];
  if (isSelfView && state?.editable) {
    lines.push(`_Segnala l'assenza sul **sito staff** entro le 20:45 di sabato: <${siteWorkflowUrl("staff")}>_`);
  }
  return lines.join("\n");
}

function normalizeSourceMessageId(raw) {
  const id = String(raw || "").trim();
  return /^\d{16,20}$/.test(id) ? id : null;
}

function withSourceSuffix(baseCustomId, sourceMessageId) {
  const sid = normalizeSourceMessageId(sourceMessageId);
  return sid ? `${baseCustomId}:${sid}` : baseCustomId;
}

function formatSerataFilmAttendanceCustomId(action, viewerId, targetId, sourceMessageId = null) {
  const act = String(action || "").toLowerCase() === "no" ? "no" : "yes";
  return withSourceSuffix(`${PANEL_PREFIX}:sf_att:${act}:${String(viewerId)}:${String(targetId)}`, sourceMessageId);
}

function parseSerataFilmAttendanceCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 5 || parts[0] !== PANEL_PREFIX || parts[1] !== "sf_att") return null;
  const action = String(parts[2] || "").toLowerCase();
  if (action !== "yes" && action !== "no") return null;
  return {
    action,
    viewerId: parts[3],
    targetId: parts[4],
    sourceMessageId: normalizeSourceMessageId(parts[5]),
    willAttend: action === "yes",
  };
}

function buildSerataFilmAttendanceButtonRow(viewerId, targetId, state, sourceMessageId = null) {
  if (!state?.editable) return null;
  const v = String(viewerId);
  const t = String(targetId);
  const btn = state.willAttend
    ? new ButtonBuilder()
      .setCustomId(formatSerataFilmAttendanceCustomId("no", v, t, sourceMessageId))
      .setLabel("Segnala assenza serata film")
      .setEmoji("<a:VC_Cross:1482532424570376253>")
      .setStyle(ButtonStyle.Danger)
    : new ButtonBuilder()
      .setCustomId(formatSerataFilmAttendanceCustomId("yes", v, t, sourceMessageId))
      .setLabel("Ripristina presenza")
      .setEmoji("<a:VC_Verified:1482532479637127188>")
      .setStyle(ButtonStyle.Success);
  return new ActionRowBuilder().addComponents(btn);
}

async function setSerataFilmWillAttend(guildId, userId, willAttend, now = new Date()) {
  if (!isValidGuildUserId(guildId, userId)) return { ok: false, code: "bad_input" };
  if (!canEditSerataFilmAttendance(now)) return { ok: false, code: "closed" };
  const saturdayKey = getRomeSaturdayKeyForWeek(now);
  if (willAttend === true) {
    const unsetRes = await ActivityUserProfile.updateOne(
      { guildId: String(guildId), userId: String(userId), "staff.serataFilmAttendanceSaturdayKey": saturdayKey },
      { $unset: { "staff.serataFilmWillAttend": "", "staff.serataFilmAttendanceSaturdayKey": "" } },
    ).catch(() => null);
    // Nessun match = già presente (default): ok.
    if (!unsetRes) return { ok: false, code: "db_error" };
    return { ok: true };
  }
  const setRes = await ActivityUserProfile.findOneAndUpdate(
    { guildId: String(guildId), userId: String(userId) },
    { $set: { "staff.serataFilmAttendanceSaturdayKey": saturdayKey, "staff.serataFilmWillAttend": false } },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  if (!setRes) return { ok: false, code: "db_error" };
  return { ok: true };
}

async function loadSerataFilmStaffAttendanceByUserId(guildId, userIds) {
  const ids = [...new Set(userIds.map((id) => String(id || "")).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  const docs = await ActivityUserProfile.find(
    { guildId: String(guildId), userId: { $in: ids } },
    { userId: 1, "staff.serataFilmAttendanceSaturdayKey": 1, "staff.serataFilmWillAttend": 1 },
  )
    .lean()
    .catch(() => []);
  for (const doc of docs) {
    const uid = String(doc?.userId || "");
    if (!uid) continue;
    map.set(uid, doc?.staff || {});
  }
  return map;
}

module.exports = {
  getRomeSaturdayKeyForWeek,
  getSerataFilmSaturdayKeyForSession,
  canEditSerataFilmAttendance,
  resolveSerataFilmAttendanceForWeek,
  isSerataFilmAbsentExcused,
  buildSerataFilmAttendanceDescriptionLine,
  formatSerataFilmAttendanceCustomId,
  parseSerataFilmAttendanceCustomId,
  buildSerataFilmAttendanceButtonRow,
  setSerataFilmWillAttend,
  loadSerataFilmStaffAttendanceByUserId,
};