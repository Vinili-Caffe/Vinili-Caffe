const cron = require("node-cron");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { aggregateSanctionsByModInWeek } = require("../../Utils/Moderation/modCaseStore");
const { RESOCONTO_APPLY_PREFIX, RESOCONTO_REJECT_PREFIX } = require("../../Events/interaction/resocontoHandlers");
const { getUserOverviewStats } = require("../Community/activityService");
const { getClientGuildCached, getClientChannelCached, getGuildMemberCached, } = require("../../Utils/Interaction/interactionEntityCache");
const { fetchGuildMembersRespectingGatewayRateLimit } = require("../../Utils/Discord/gatewayMemberFetch");
const { addAllRoleMembersToThread } = require("../../Utils/Discord/threadRoleMembers");
const { getDevIds } = require("../../Utils/Moderation/commandPermissions");
const { STAFF_NEW_EMOJI } = require("../../Utils/Community/staffListUtils");
const { getStaffRoleEmojiByRoleId } = require("../../Utils/Community/staffRoleEmoji");
const { ensureStaff } = require("../../Utils/Staff/staffDocUtils");
const { ensureStaffProfileDoc, getStaffDoc, valutazionePositiveAddCore, valutazioneNegativeAddCore, } = require("../../Utils/Staff/valutazionePanelActions");
const TIME_ZONE = "Europe/Rome";
const RESOCONTO_CLOSE_HOUR_ROME = 18;
const RESOCONTO_CRON_SEGMENTS = [
  { segment: "pm", expression: "0 15 * * 0" },
  { segment: "helper", expression: "0 16 * * 0" },
  { segment: "mod", expression: "0 17 * * 0" },
  { segment: "senior_moderator", expression: "30 17 * * 0" },
  { segment: "director", expression: "45 17 * * 0" },
  { segment: "admin", expression: "0 18 * * 0" },
];
const STAFF_RESOCONTO_SEGMENTS = ["helper", "mod", "senior_moderator", "director", "admin"];
const STAFF_ACTIVITY_LIMITS = {
  [String(IDs.roles.Helper)]: { messages: 400, hours: 4 },
  [String(IDs.roles.Mod)]: { messages: 500, hours: 5 },
  [String(IDs.roles.SeniorModerator)]: { messages: 600, hours: 6 },
  [String(IDs.roles.Director)]: { messages: 550, hours: 5.5 },
  [String(IDs.roles.Admin)]: { messages: 500, hours: 5 },
};
const STAFF_SANCTION_LIMITS = {
  [String(IDs.roles.Mod)]: 1,
  [String(IDs.roles.SeniorModerator)]: 2,
  [String(IDs.roles.Director)]: 1,
  [String(IDs.roles.Admin)]: 1,
};
const SANCTION_ACTIONS = new Set(["WARN", "MUTE", "KICK", "BAN"]);
const STAFF_ROLE_PRIORITY = [
  String(IDs.roles.Admin),
  String(IDs.roles.Director),
  String(IDs.roles.SeniorModerator),
  String(IDs.roles.Mod),
  String(IDs.roles.Helper),
];
const RESOCONTO_PM_EXCLUDED_USER_IDS = new Set(
  (Array.isArray(IDs.resocontoExcludePmUserIds) ? IDs.resocontoExcludePmUserIds : [])
    .map((id) => String(id || "").trim())
    .filter((id) => /^\d{17,20}$/.test(id)),
);
const RESOCONTO_ROLE_RANK = new Map(
  [
    IDs.roles.Member,
    IDs.roles.Helper,
    IDs.roles.Mod,
    IDs.roles.SeniorModerator,
    IDs.roles.Director,
    IDs.roles.Admin,
    IDs.roles.Founder,
    IDs.roles.PartnerManager,
  ]
    .filter(Boolean)
    .map((roleId, index) => [String(roleId), index]),
);
const PM_WEEKLY_PARTNER_MIN_FOR_OK = 30;
const PM_WEEKLY_DEPEX_MAX_PARTNERS = 15;
const ROLE_UP = {
  [String(IDs.roles.Member || "")]: String(IDs.roles.Helper),
  [String(IDs.roles.Helper)]: String(IDs.roles.Mod),
  [String(IDs.roles.Mod)]: String(IDs.roles.SeniorModerator),
  [String(IDs.roles.SeniorModerator)]: String(IDs.roles.Director),
  [String(IDs.roles.Director)]: String(IDs.roles.Admin),
};

let weeklyStaffResocontoTasks = [];
const resocontoMemberHydrationStateByGuild = new Map();
const RESOCONTO_MEMBER_HYDRATE_TTL_MS = 2 * 60 * 1000;
const BOT_STATE_KEY_LAST_RESOCONTO = "lastResocontoRun";

function getLastSundayResocontoCloseRomeUtc(now = new Date()) {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const romeParts = getRomeDateParts(yesterday);
  return createUtcFromRomeLocal(romeParts.year, romeParts.month, romeParts.day, RESOCONTO_CLOSE_HOUR_ROME, 0, 0);
}

async function readLastResocontoRun() {
  const data = await getBotState(BOT_STATE_KEY_LAST_RESOCONTO, null);
  const ts = data?.lastRunAt;
  return Number.isFinite(ts) ? ts : null;
}

async function writeLastResocontoRun() {
  await setBotState(BOT_STATE_KEY_LAST_RESOCONTO, { lastRunAt: Date.now() });
}

const BOT_STATE_KEY_STAFF_RESOCONTO_POSTED_PREFIX = "staffResocontoPosted";

function buildStaffResocontoPostedStateKey(guildId, resocontoWeekKey) {
  return `${BOT_STATE_KEY_STAFF_RESOCONTO_POSTED_PREFIX}:${String(guildId || "")}:${String(resocontoWeekKey || "")}`;
}

async function loadStaffResocontoPostedIds(guildId, resocontoWeekKey) {
  const key = buildStaffResocontoPostedStateKey(guildId, resocontoWeekKey);
  const cur = await getBotState(key, { userIds: [] });
  return new Set((Array.isArray(cur?.userIds) ? cur.userIds : [])
    .map((x) => String(x || "").trim())
    .filter((id) => /^\d{17,20}$/.test(id) || /^\d{16,20}:\d{17,20}$/.test(id)));
}

async function appendStaffResocontoPostedId(guildId, resocontoWeekKey, userId) {
  const uid = String(userId || "").trim();
  if (!/^\d{17,20}$/.test(uid)) return;
  const key = buildStaffResocontoPostedStateKey(guildId, resocontoWeekKey);
  const cur = await getBotState(key, { userIds: [] });
  const arr = Array.isArray(cur?.userIds) ? cur.userIds.map((x) => String(x || "").trim()).filter(Boolean) : [];
  if (arr.includes(uid)) return;
  arr.push(uid);
  await setBotState(key, { userIds: arr });
}

async function appendStaffResocontoPostedRoleId(guildId, resocontoWeekKey, userId, roleId) {
  const uid = String(userId || "").trim();
  const rid = String(roleId || "").trim();
  if (!/^\d{17,20}$/.test(uid) || !rid) return;
  const key = buildStaffResocontoPostedStateKey(guildId, resocontoWeekKey);
  const cur = await getBotState(key, { userIds: [] });
  const arr = Array.isArray(cur?.userIds) ? cur.userIds.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const roleKey = `${rid}:${uid}`;
  if (!arr.includes(roleKey)) arr.push(roleKey);
  await setBotState(key, { userIds: arr });
}

function toSafeNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function formatHoursFromSeconds(seconds) {
  const safeSeconds = Math.max(0, Math.floor(toSafeNumber(seconds)));
  const hours = safeSeconds / 3600;
  return `${hours.toFixed(2)}h`;
}

function collectVoiceChannelIdsUnderCategory(guild, categoryId) {
  const out = new Set();
  const cat = String(categoryId || "");
  if (!guild?.channels?.cache || !cat) return out;
  for (const ch of guild.channels.cache.values()) {
    if (!ch?.isVoiceBased?.()) continue;
    if (String(ch.parentId || "") !== cat) continue;
    out.add(String(ch.id));
  }
  return out;
}

function buildResocontoActivityScope(guild) {
  const includeTextChannelIds = new Set();
  const includeVoiceChannelIds = new Set();
  const addText = (id) => {
    const value = String(id || "");
    if (value) includeTextChannelIds.add(value);
  };
  const addVoice = (id) => {
    const value = String(id || "");
    if (value) includeVoiceChannelIds.add(value);
  };

  addText(IDs.channels?.chat);
  addText(IDs.channels?.media);
  addText(IDs.channels?.commands);
  addText(IDs.channels?.forum);
  addText(IDs.channels?.selfieVerificati);

  const forumId = String(IDs.channels?.forum || "");
  const publicsCategoryId = String(IDs.categories?.categoryPublics || "");

  for (const ch of guild?.channels?.cache?.values?.() || []) {
    const parentId = String(ch?.parentId || "");
    const channelId = String(ch?.id || "");
    if (!channelId) continue;
    if (forumId && parentId === forumId && ch?.isThread?.()) {
      includeTextChannelIds.add(channelId);
      continue;
    }
    if (publicsCategoryId && parentId === publicsCategoryId && ch?.isVoiceBased?.()) {
      includeVoiceChannelIds.add(channelId);
      includeTextChannelIds.add(channelId);
    }
  }

  return { includeTextChannelIds, includeVoiceChannelIds };
}

function getRomeDateParts(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", });
  const parts = formatter.formatToParts(date);
  const out = {};
  for (const part of parts) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
  };
}

function getRomeOffsetMs(utcDate) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "shortOffset", hour: "2-digit", });
  const timeZoneName = formatter.formatToParts(utcDate).find((part) => part.type === "timeZoneName")?.value;

  const match = String(timeZoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i,);
  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(year, month, day, hour, minute, second) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) {
    utcMs = baseUtcMs - secondOffsetMs;
  }
  return new Date(utcMs);
}

function parseRomeWallClock(referenceDate) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = f.formatToParts(referenceDate);
  const o = {};
  for (const x of parts) {
    if (x.type !== "literal") o[x.type] = x.value;
  }
  return {
    year: Number(o.year),
    month: Number(o.month),
    day: Number(o.day),
    weekday: String(o.weekday || "").replace(/\.$/, ""),
    hour: Number(o.hour),
    minute: Number(o.minute),
  };
}

function addDaysToRomeYmd(year, month, day, deltaDays) {
  const mid = createUtcFromRomeLocal(year, month, day, 12, 0, 0);
  return getRomeDateParts(new Date(mid.getTime() + deltaDays * 86400000));
}

function getResocontoClosingSundayUtc(referenceNow = new Date()) {
  const r = parseRomeWallClock(referenceNow);
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const w = wdMap[r.weekday];
  const H = RESOCONTO_CLOSE_HOUR_ROME;
  if (w == null) {
    return createUtcFromRomeLocal(r.year, r.month, r.day, H, 0, 0);
  }

  let sunY = r.year;
  let sunM = r.month;
  let sunD = r.day;

  if (w === 0) {
    const thisSunClose = createUtcFromRomeLocal(r.year, r.month, r.day, H, 0, 0);
    if (referenceNow.getTime() < thisSunClose.getTime()) {
      const prev = addDaysToRomeYmd(r.year, r.month, r.day, -7);
      sunY = prev.year;
      sunM = prev.month;
      sunD = prev.day;
    }
  } else {
    const prev = addDaysToRomeYmd(r.year, r.month, r.day, -w);
    sunY = prev.year;
    sunM = prev.month;
    sunD = prev.day;
  }

  return createUtcFromRomeLocal(sunY, sunM, sunD, H, 0, 0);
}

function getPartnerLeaderboardWeekBoundsUtc(now = new Date()) {
  const weekStart = getResocontoClosingSundayUtc(now);
  const sunParts = getRomeDateParts(weekStart);
  const endParts = addDaysToRomeYmd(sunParts.year, sunParts.month, sunParts.day, 7);
  const weekEndExclusive = createUtcFromRomeLocal(
    endParts.year,
    endParts.month,
    endParts.day,
    RESOCONTO_CLOSE_HOUR_ROME,
    0,
    0,
  );
  return { weekStart, weekEndExclusive };
}

function getResocontoPexSkipWindowUtc(referenceNow = new Date()) {
  const closingSunday = getResocontoClosingSundayUtc(referenceNow);
  const sunParts = getRomeDateParts(closingSunday);
  const monParts = addDaysToRomeYmd(sunParts.year, sunParts.month, sunParts.day, -6);
  const windowStart = createUtcFromRomeLocal(monParts.year, monParts.month, monParts.day, 0, 0, 0);
  return { windowStart, windowEndExclusive: closingSunday };
}

function getPmResocontoWindow(now = new Date()) {
  const romeToday = getRomeDateParts(now);
  const romeTodayNoonUtc = new Date(Date.UTC(romeToday.year, romeToday.month - 1, romeToday.day, 12, 0, 0),);
  const dayFromMonday = (romeTodayNoonUtc.getUTCDay() + 6) % 7;

  const mondayNoonUtc = new Date(romeTodayNoonUtc.getTime() - dayFromMonday * 24 * 60 * 60 * 1000,);
  const mondayY = mondayNoonUtc.getUTCFullYear();
  const mondayM = mondayNoonUtc.getUTCMonth() + 1;
  const mondayD = mondayNoonUtc.getUTCDate();

  const sundayNoonUtc = new Date(mondayNoonUtc.getTime() + 6 * 24 * 60 * 60 * 1000,);
  const sundayY = sundayNoonUtc.getUTCFullYear();
  const sundayM = sundayNoonUtc.getUTCMonth() + 1;
  const sundayD = sundayNoonUtc.getUTCDate();

  const thisSundayStart = createUtcFromRomeLocal(sundayY, sundayM, sundayD, RESOCONTO_CLOSE_HOUR_ROME, 1, 0,);
  const weekStart = now.getTime() < thisSundayStart.getTime() ? new Date(thisSundayStart.getTime() - 7 * 24 * 60 * 60 * 1000) : thisSundayStart;
  const scheduledEnd = new Date(weekStart.getTime() + (7 * 24 * 60 * 60 * 1000 - 2 * 60 * 1000),);
  const weekEnd = now.getTime() < scheduledEnd.getTime() ? now : scheduledEnd;

  return { weekStart, weekEnd };
}

function getWeekStartDate(now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() - 7);
  return date;
}

const COSTANZA_BARS = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588";

function dayKeyToWeekdayLabel(dayKey) {
  if (!dayKey || typeof dayKey !== "string") return "?";
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return "?";
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const formatter = new Intl.DateTimeFormat("it-IT", { timeZone: TIME_ZONE, weekday: "short" });
  return formatter.format(date).replace(".", "").slice(0, 3);
}

function buildCostanzaLines(overview) {
  const chart = Array.isArray(overview?.chart) ? overview.chart : [];
  if (!chart.length) return [];
  const points = chart.slice(-7);
  const maxText = Math.max(1, ...points.map((p) => Math.max(0, Number(p?.text ?? 0))));
  const bars = points.map((p) => {
    const text = Math.max(0, Number(p?.text ?? 0));
    const level = maxText > 0 ? Math.min(7, Math.floor((7 * text) / maxText)) : 0;
    return COSTANZA_BARS[level];
  });
  const activeDays = points.filter((p) => (Number(p?.text ?? 0) > 0) || (Number(p?.voiceSeconds ?? 0) >= 600)).length;
  const labels = points.map((p) => dayKeyToWeekdayLabel(p?.dayKey)).join(" ");
  const barLine = bars.map((b) => ` ${b} `).join(" ");
  return [
    `<:VC_Clock:1473359204189474886> **Costanza:** __${activeDays}/${points.length}__ giorni attivi`,
    `\`${labels}\``,
    `\`${barLine}\` messaggi per giorno`,
  ];
}

function parseItalianDate(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return null;
  const date = createUtcFromRomeLocal(y, mo, d, 0, 0, 0);
  const chk = getRomeDateParts(date);
  if (chk.year !== y || chk.month !== mo || chk.day !== d) return null;
  return date;
}

function getRomeStartOfDayUtc(reference = new Date()) {
  const p = getRomeDateParts(reference);
  return createUtcFromRomeLocal(p.year, p.month, p.day, 0, 0, 0);
}

function pauseRoleAppliesToSection(pauseRole, sectionRole) {
  const p = String(pauseRole || "").trim().toLowerCase();
  const s = String(sectionRole || "").trim().toLowerCase();
  if (!s) return true;
  if (!p) return true;
  if (p === "entrambi") return s === "staff" || s === "partnermanager";
  return p === s;
}

function getStaffPauseLine(staffDoc, sectionRole = null) {
  const pauses = Array.isArray(staffDoc?.pauses) ? staffDoc.pauses : [];
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
      return `<a:VC_Calendar:1482706208149475358> **Rientrato** il ${p.dataRitorno}`;
    }
  }
  return null;
}

function wasInPauseDuringWeek(staffDoc, weekStart, weekEnd, sectionRole = null) {
  const pauses = Array.isArray(staffDoc?.pauses) ? staffDoc.pauses : [];
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

function didPauseEndDuringWeek(staffDoc, weekStart, weekEnd, sectionRole = null) {
  const pauses = Array.isArray(staffDoc?.pauses) ? staffDoc.pauses : [];
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

function wasPartnerManagerInPauseForResocontoWeek(staffDoc, weekStart, weekEnd, member) {
  if (wasInPauseDuringWeek(staffDoc, weekStart, weekEnd, "PartnerManager")) return true;
  const pmId = String(IDs.roles?.PartnerManager || "");
  if (pmId && member?.roles?.cache?.has(pmId) && wasInPauseDuringWeek(staffDoc, weekStart, weekEnd, "Staff")) return true;
  return false;
}

function getPmResocontoPauseDisplayLine(staffDoc, member) {
  const pmLine = getStaffPauseLine(staffDoc, "PartnerManager");
  if (pmLine) return pmLine;
  const pmId = String(IDs.roles?.PartnerManager || "");
  if (pmId && member?.roles?.cache?.has(pmId)) return getStaffPauseLine(staffDoc, "Staff");
  return null;
}

function isPmResocontoExcludedUserId(userId) {
  return RESOCONTO_PM_EXCLUDED_USER_IDS.has(String(userId || "").trim());
}

function resolveStaffRole(member) {
  if (!member?.roles?.cache) return null;
  for (const roleId of STAFF_ROLE_PRIORITY) {
    if (member.roles.cache.has(roleId)) return roleId;
  }
  return null;
}

function collectMemberIdsMatchingResocontoStaffSegment(guild, wantStaffRoleId) {
  const want = String(wantStaffRoleId || "").trim();
  if (!want || !guild?.members?.cache) return [];
  const ids = [];
  for (const member of guild.members.cache.values()) {
    if (!member || member.user?.bot) continue;
    const resolved = resolveStaffRole(member);
    if (resolved && String(resolved) === want) ids.push(String(member.id));
  }
  return ids;
}

function collectResocontoDiscordMemberIdsForSegment(guild, segment) {
  if (segment === "pm") {
    const pmId = String(IDs.roles.PartnerManager || "").trim();
    if (!pmId || !guild?.members?.cache) return [];
    const out = [];
    for (const member of guild.members.cache.values()) {
      if (!member || member.user?.bot) continue;
      if (member.roles?.cache?.has(pmId)) out.push(String(member.id));
    }
    return out;
  }
  if (segment === "helper" || segment === "mod" || segment === "senior_moderator" || segment === "director" || segment === "admin") {
    const want =
      segment === "helper"
        ? String(IDs.roles.Helper || "").trim()
        : segment === "mod"
          ? String(IDs.roles.Mod || "").trim()
          : segment === "senior_moderator"
            ? String(IDs.roles.SeniorModerator || "").trim()
            : segment === "director"
              ? String(IDs.roles.Director || "").trim()
              : String(IDs.roles.Admin || "").trim();
    return collectMemberIdsMatchingResocontoStaffSegment(guild, want);
  }
  return [];
}

function collectAllResocontoRelevantMemberIdsFromGuild(guild) {
  if (!guild?.members?.cache) return [];
  const ids = new Set();
  const pmId = String(IDs.roles.PartnerManager || "").trim();
  for (const member of guild.members.cache.values()) {
    if (!member || member.user?.bot) continue;
    if (pmId && member.roles?.cache?.has(pmId)) {
      ids.add(String(member.id));
      continue;
    }
    if (resolveStaffRole(member)) ids.add(String(member.id));
  }
  return Array.from(ids);
}

function getResocontoMemberRank(member) {
  const staffRoleId = resolveStaffRole(member);
  if (staffRoleId) {
    const idx = STAFF_ROLE_PRIORITY.indexOf(String(staffRoleId));
    return idx >= 0 ? idx : 50;
  }
  if (member.roles.cache.has(String(IDs.roles.PartnerManager)))
    return STAFF_ROLE_PRIORITY.length;
  return 999;
}

function compareResocontoMembers(a, b) {
  const ra = getResocontoMemberRank(a);
  const rb = getResocontoMemberRank(b);
  if (ra !== rb) return ra - rb;
  const na = String(a.user?.username || a.id).toLowerCase();
  const nb = String(b.user?.username || b.id).toLowerCase();
  return na.localeCompare(nb);
}

function computeActivityGrade(roleId, weeklyMessages, weeklyVoiceHours) {
  const limits = STAFF_ACTIVITY_LIMITS[String(roleId)];
  if (!limits) return "Non classificato";

  const msg = Math.max(0, Math.floor(toSafeNumber(weeklyMessages)));
  const hours = Math.max(0, toSafeNumber(weeklyVoiceHours));
  const limMsg = limits.messages;
  const limHours = limits.hours;

  if (msg >= limMsg * 3 && hours >= limHours * 3) return "Eccellente";
  if (msg >= limMsg * 2 + 300 && hours >= limHours * 2 + 2) return "Ottimo";
  if (msg >= limMsg * 2 && hours >= limHours * 2) return "Buono";
  if (msg >= limMsg + 150 && hours >= limHours + 1.5) return "Discreto";
  if (msg >= limMsg && hours >= limHours) return "Sufficiente";

  const msgDelta = Math.max(0, limMsg - msg);
  const hoursDelta = Math.max(0, limHours - hours);
  if (msgDelta <= 100 && hoursDelta <= 1) return "Insufficiente";
  return "Non classificato";
}

function computeBehaviorGrade(positiveCount, negativeCount) {
  const positive = Math.max(0, Math.floor(toSafeNumber(positiveCount)));
  const negative = Math.max(0, Math.floor(toSafeNumber(negativeCount)));

  if (positive === 0 && negative === 0) return "Sufficiente";
  if (positive >= 3 && negative === 0) return "Ottimo";
  if (positive === 0 && negative > 0) return "Non classificato";
  if (negative > positive) return "Insufficiente";
  if (positive > negative) return "Discreto";
  return "Sufficiente";
}

function overviewLooksLikeEmptyFallback(overview) {
  if (!overview || overview.__error) return true;
  const d7 = overview?.windows?.d7;
  const text = Math.max(0, Math.floor(toSafeNumber(d7?.text ?? 0)));
  const voiceSeconds = Math.max(0, Math.floor(toSafeNumber(d7?.voiceSeconds ?? 0)));
  return Boolean(
    overview.approximate === true &&
    text === 0 &&
    voiceSeconds === 0 &&
    (!Array.isArray(overview.topChannelsText) || overview.topChannelsText.length === 0) &&
    (!Array.isArray(overview.topChannelsVoice) || overview.topChannelsVoice.length === 0)
  );
}

function isStaffRolesHistoryPexRow(row) {
  const oldRole = String(row?.oldRole || "");
  const newRole = String(row?.newRole || "");
  const oldRank = RESOCONTO_ROLE_RANK.has(oldRole) ? Number(RESOCONTO_ROLE_RANK.get(oldRole)) : null;
  const newRank = RESOCONTO_ROLE_RANK.has(newRole) ? Number(RESOCONTO_ROLE_RANK.get(newRole)) : null;
  const isRankPromotion =
    oldRank != null &&
    newRank != null &&
    newRole &&
    oldRole &&
    newRole !== oldRole &&
    newRank > oldRank;
  const isMappedPromotion = oldRole && newRole && ROLE_UP[oldRole] === newRole;
  const reasonNorm = String(row?.reason || "").toLowerCase();
  const reasonHasDepex = reasonNorm.includes("depex");
  const reasonHasPex = reasonNorm.includes("pex") && !reasonHasDepex;
  return Boolean(isRankPromotion || isMappedPromotion || reasonHasPex);
}

function wasPexedInWeek(staffDoc, weekStart) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const weekStartMs = Number(weekStart.getTime());
  return history.some((row) => {
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    if (when.getTime() < weekStartMs) return false;
    return isStaffRolesHistoryPexRow(row);
  });
}

function wasPexedInResocontoSkipWindow(staffDoc, windowStart, windowEndExclusive) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const t0 = windowStart.getTime();
  const t1 = windowEndExclusive.getTime();
  return history.some((row) => {
    if (!isStaffRolesHistoryPexRow(row)) return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    const ms = when.getTime();
    return ms >= t0 && ms < t1;
  });
}

function wasPmPromotedInResocontoSkipWindow(staffDoc, windowStart, windowEndExclusive) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const pmRoleId = String(IDs.roles.PartnerManager || "");
  if (!pmRoleId) return false;
  const t0 = windowStart.getTime();
  const t1 = windowEndExclusive.getTime();
  return history.some((row) => {
    if (String(row?.newRole || "") !== pmRoleId) return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    const ms = when.getTime();
    return ms >= t0 && ms < t1;
  });
}

function shouldSkipResocontoForPexInCalendarWeek(staffDoc, windowStart, windowEndExclusive) {
  if (!staffDoc) return false;
  return wasPexedInResocontoSkipWindow(staffDoc, windowStart, windowEndExclusive);
}

function computeStaffAction(activityGrade, behaviorGrade, pexedInWeek, positiveCount, negativeCount) {
  if (pexedInWeek) return "Nulla";

  const pos = Math.max(0, Math.floor(toSafeNumber(positiveCount)));
  const neg = Math.max(0, Math.floor(toSafeNumber(negativeCount)));
  const noValutazioni = pos === 0 && neg === 0;

  if (
    (activityGrade === "Ottimo" || activityGrade === "Eccellente") &&
    behaviorGrade === "Ottimo"
  ) {
    return "Pex";
  }
  if (
    activityGrade === "Non classificato" &&
    (behaviorGrade === "Non classificato" || noValutazioni)
  ) {
    return "Depex";
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

function wasPmPexedInWeek(staffDoc, weekStart) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const weekStartMs = Number(weekStart.getTime());
  const pmRoleId = String(IDs.roles.PartnerManager || "");
  if (!pmRoleId) return false;
  return history.some((row) => {
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    if (when.getTime() < weekStartMs) return false;
    return String(row?.newRole || "") === pmRoleId;
  });
}

function wasPromotedToRoleInLastDays(staffDoc, roleId, days, now = new Date()) {
  const targetRoleId = String(roleId || "");
  if (!targetRoleId) return false;
  const safeDays = Math.max(1, Math.floor(toSafeNumber(days)));
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const thresholdMs = now.getTime() - safeDays * 24 * 60 * 60 * 1000;
  return history.some((row) => {
    if (String(row?.newRole || "") !== targetRoleId) return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    return when.getTime() >= thresholdMs;
  });
}

function computePmAction(weeklyPartners, pmPexedInWeek) {
  if (pmPexedInWeek) return "Nulla";
  const partners = Math.max(0, Math.floor(toSafeNumber(weeklyPartners)));
  if (partners <= PM_WEEKLY_DEPEX_MAX_PARTNERS) return "Depex";
  if (partners < PM_WEEKLY_PARTNER_MIN_FOR_OK) return "Richiamo";
  return "Nulla";
}

function resocontoAutoActor(guild) {
  return { user: guild?.client?.user || { username: "Automazione Resoconti" }, member: null };
}

async function ensureWeeklyLimitAutoValutazione({ guild, member, key, type, reason }) {
  if (!guild || !member?.user || !key || !type) return { ok: false };
  const channel = guild.channels.cache.get(IDs.channels?.valutazioniStaff) ||
    (await getClientChannelCached(guild.client, IDs.channels?.valutazioniStaff).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, skipped: "no_channel" };

  const profileDoc = await ensureStaffProfileDoc(
    await getStaffDoc(guild.id, member.id),
    guild.id,
    member.id,
  );
  const staff = ensureStaff(profileDoc);
  if (!staff) return { ok: false, skipped: "no_staff_doc" };
  if (!Array.isArray(staff.autoValutazioni)) staff.autoValutazioni = [];
  const existing = staff.autoValutazioni.find((entry) => String(entry?.key || "") === String(key));
  if (existing) return { ok: true, skipped: "exists" };

  const actor = resocontoAutoActor(guild);
  const result = type === "negative"
    ? await valutazioneNegativeAddCore(guild, profileDoc, member.user, reason, actor, channel)
    : await valutazionePositiveAddCore(profileDoc, member.user, reason, actor, channel);

  const freshStaff = ensureStaff(profileDoc);
  if (!Array.isArray(freshStaff.autoValutazioni)) freshStaff.autoValutazioni = [];
  freshStaff.autoValutazioni.push({
    key: String(key),
    type: String(type),
    reason: String(reason || ""),
    channelId: String(channel.id || ""),
    messageId: result?.message?.id ? String(result.message.id) : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  profileDoc.markModified("staff");
  await profileDoc.save();
  return { ok: true };
}

function staffActionToKey(action) {
  if (action === "Pex") return "px";
  if (action === "Depex") return "dp";
  if (action === "Valutazione Positiva") return "vp";
  if (action === "Valutazione Negativa") return "vn";
  return "nl";
}

function pmActionToKey(action) {
  if (action === "Depex") return "dp";
  if (action === "Richiamo") return "rc";
  return "nl";
}

function buildResocontoButtons(kind, userId, actionKey, roleId = null) {
  const payload = kind === "s" ? `${kind}:${userId}:${roleId}:${actionKey}`
    : `${kind}:${userId}:${actionKey}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${RESOCONTO_APPLY_PREFIX}:${payload}`)
      .setEmoji("<:vegacheckmark:1443666279058772028>")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${RESOCONTO_REJECT_PREFIX}:${payload}`)
      .setEmoji("<:vegax:1443934876440068179>")
      .setStyle(ButtonStyle.Danger),
  );
}

function formatThreadDateTime(value) {
  const when = value instanceof Date ? value : new Date(value);
  if (!when || Number.isNaN(when.getTime())) return null;
  return when.toLocaleString("it-IT", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getLatestAcceptedPause(staffDoc) {
  const pauses = Array.isArray(staffDoc?.pauses) ? staffDoc.pauses : [];
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

function getPexHistoryRows(staffDoc) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  return history
    .filter((row) => isStaffRolesHistoryPexRow(row))
    .map((row) => {
      const when = row?.date ? new Date(row.date) : null;
      if (!when || Number.isNaN(when.getTime())) return null;
      return {
        oldRole: String(row?.oldRole || ""),
        newRole: String(row?.newRole || ""),
        when,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.when.getTime() - a.when.getTime());
}

function roleLabelById(guild, roleId) {
  const id = String(roleId || "");
  if (!id) return "Sconosciuto";
  return guild?.roles?.cache?.get(id)?.name || `<@&${id}>`;
}

async function sendResocontoThreadSummary(thread, guild, staffDoc) {
  if (!thread?.isTextBased?.()) return;
  const lines = [];

  const latestPause = getLatestAcceptedPause(staffDoc);
  if (latestPause?.start && latestPause?.end) {
    lines.push(
      `<a:VC_Calendar:1482706208149475358> **Pausa:** iniziata il **${formatThreadDateTime(latestPause.start)}**, finita il **${formatThreadDateTime(latestPause.end)}**`,
    );
  }

  const positive = Math.max(0, Math.floor(toSafeNumber(staffDoc?.positiveCount)));
  const negative = Math.max(0, Math.floor(toSafeNumber(staffDoc?.negativeCount)));
  if (positive > 0 || negative > 0) {
    lines.push(`<:VC_Eye:1331619214410383381> **Valutazioni:** positive **${positive}**, negative **${negative}**`);
  }

  const warnCount = Math.max(0, Math.floor(toSafeNumber(staffDoc?.warnCount)));
  if (warnCount > 0) {
    lines.push(`<:VC_BanHammer:1482534474502897795> **Warn staff:** **${warnCount}**`);
  }

  const pexRows = getPexHistoryRows(staffDoc).slice(0, 5);
  if (pexRows.length > 0) {
    lines.push("<:success:1461731530333229226> **Storico PEX recente:**");
    for (const row of pexRows) {
      lines.push(
        `- ${formatThreadDateTime(row.when)} -> \`${roleLabelById(guild, row.oldRole)}\` -> \`${roleLabelById(guild, row.newRole)}\``,
      );
    }
  }

  if (!lines.length) return;
  await thread
    .send({
      content: lines.join("\n").slice(0, 1900),
    })
    .catch(() => null);
}

async function createResocontoThread(message, userId, userLabel = null, staffDoc = null) {
  if (!message?.startThread) return;
  const safeUserId = String(userId || "");
  if (!/^\d{16,20}$/.test(safeUserId)) return;
  const threadLabel = String(userLabel || safeUserId).trim().slice(0, 70) || safeUserId;

  const thread = await message.startThread({
    name: `Resoconto di ${threadLabel}`,
    autoArchiveDuration: 10080,
    type: ChannelType.PublicThread,
    reason: "Thread automatico resoconto staff/pm",
  })
    .catch(() => null);
  if (!thread?.isTextBased?.()) return;

  const guild = message?.guild;
  const highStaffRoleId = String(IDs.roles.HighStaff || "").trim();
  if (guild && highStaffRoleId) {
    await addAllRoleMembersToThread(thread, guild, highStaffRoleId, { logTag: "[WEEKLY STAFF RESOCONTO thread]" });
  }

  const mentionMsg = await thread.send({ content: `<@&${IDs.roles.HighStaff}>` })
    .catch(() => null);
  if (mentionMsg) {
    await mentionMsg.delete().catch(() => null);
  }
  await sendResocontoThreadSummary(thread, message?.guild, staffDoc);
}

function countPmWeeklyPartners(staffDoc, weekStart, weekEnd) {
  const actions = Array.isArray(staffDoc?.partnerActions) ? staffDoc.partnerActions : [];
  const weekStartMs = Number(weekStart.getTime());
  const weekEndMs = Number(weekEnd.getTime());
  let count = 0;
  for (const action of actions) {
    if (String(action?.action || "").toLowerCase() !== "create") continue;
    const when = action?.date ? new Date(action.date) : null;
    if (!when || Number.isNaN(when.getTime())) continue;
    const whenMs = when.getTime();
    if (whenMs >= weekStartMs && whenMs <= weekEndMs) count += 1;
  }
  return count;
}

async function getWeeklySanctionCountByMod(guildId, weekStart, weekEnd) {
  return aggregateSanctionsByModInWeek(guildId, weekStart, weekEnd, SANCTION_ACTIONS);
}

async function resolveChannel(client, channelId) {
  if (!channelId) return null;
  return client.channels.cache.get(channelId) ||
    (await getClientChannelCached(client, String(channelId))) ||
    (await client.channels.fetch(String(channelId)).catch(() => null));
}

async function recentStaffResocontoMessageExists(channel, userId, roleId, sinceDate) {
  if (!channel?.messages?.fetch) return false;
  const uid = String(userId || "").trim();
  const rid = String(roleId || "").trim();
  const sinceMs = sinceDate instanceof Date ? sinceDate.getTime() : 0;
  if (!uid || !rid) return false;
  const batch = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!batch?.size) return false;
  for (const message of batch.values()) {
    if (sinceMs && Number(message.createdTimestamp || 0) < sinceMs) continue;
    const content = String(message.content || "");
    if (!content.includes("**Staffer:**")) continue;
    if (!content.includes(`<@${uid}>`) && !content.includes(`<@!${uid}>`)) continue;
    if (!content.includes(`<@&${rid}>`)) continue;
    return true;
  }
  return false;
}

async function sendResocontoMessageWithRetry(channel, payload, context = {}) {
  if (!channel?.send) return null;
  const first = await channel.send(payload).catch((err) => {
    global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] send failed:", {
      userId: context.userId || null,
      segment: context.segment || null,
      err: err?.message || String(err),
      code: err?.code,
    });
    return null;
  });
  if (first) return first;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return channel.send(payload).catch((err) => {
    global.logger?.error?.("[WEEKLY STAFF RESOCONTO] send retry failed:", {
      userId: context.userId || null,
      segment: context.segment || null,
      err: err?.message || String(err),
      code: err?.code,
    });
    return null;
  });
}

async function hydrateGuildMembersForResoconto(guild, segment) {
  if (!guild?.members?.fetch) return false;
  const guildId = String(guild.id || "");
  const now = Date.now();
  const state = resocontoMemberHydrationStateByGuild.get(guildId);
  if (state?.lastOkAt && now - Number(state.lastOkAt || 0) < RESOCONTO_MEMBER_HYDRATE_TTL_MS) {
    return true;
  }
  if (state?.promise) {
    return state.promise;
  }

  const promise = fetchGuildMembersRespectingGatewayRateLimit(guild, {
    maxAttempts: 12,
    onRateLimit: (waitMs, attempt, maxAttempts) => {
      global.logger?.info?.(
        `[WEEKLY STAFF RESOCONTO] Member fetch rate-limited (${segment || "unknown"}), retry ${attempt}/${maxAttempts} in ~${Math.round(waitMs / 1000)}s.`,
      );
    },
  })
    .then(() => {
      resocontoMemberHydrationStateByGuild.set(guildId, { lastOkAt: Date.now(), promise: null });
      return true;
    })
    .catch((err) => {
      global.logger?.warn?.(
        `[WEEKLY STAFF RESOCONTO] Member fetch failed (${segment || "unknown"}):`,
        err?.message || err,
      );
      resocontoMemberHydrationStateByGuild.set(guildId, { lastOkAt: 0, promise: null });
      return false;
    });

  resocontoMemberHydrationStateByGuild.set(guildId, { lastOkAt: Number(state?.lastOkAt || 0), promise });
  return promise;
}

async function runWeeklyStaffResocontoSegment(client, segment, opts = {}) {
  const allowed = new Set(["pm", "helper", "mod", "senior_moderator", "director", "admin"]);
  if (!allowed.has(segment)) return { sent: 0, eligible: 0, segment };
  const targetUserId = String(opts.userId || opts.targetUserId || "").trim();
  const forceTarget = Boolean(opts.force && /^\d{16,20}$/.test(targetUserId));

  const guildId = String(IDs.guilds?.main || "");
  const channelId = String(IDs.channels?.resocontiStaff || "");
  if (!guildId || !channelId) return { sent: 0, eligible: 0, segment };

  const guild = await getClientGuildCached(client, guildId);
  if (!guild) return { sent: 0, eligible: 0, segment };
  await hydrateGuildMembersForResoconto(guild, segment);

  const resocontoExcludeVoiceChannels = collectVoiceChannelIdsUnderCategory(
    guild,
    String(IDs.categories?.categoryPrivate || ""),
  );
  const resocontoOverviewVoiceExclude =
    resocontoExcludeVoiceChannels.size > 0 ? resocontoExcludeVoiceChannels : null;
  const resocontoScope = buildResocontoActivityScope(guild);

  const channel = await resolveChannel(client, channelId);
  if (!channel?.isTextBased?.()) return { sent: 0, eligible: 0, segment };

  const now = new Date();
  const weekStart = getWeekStartDate(now);
  const weekEnd = now;
  const pexSkipWindow = getResocontoPexSkipWindowUtc(now);
  const nowRomeParts = getRomeDateParts(now);
  const resocontoMessageSince = createUtcFromRomeLocal(nowRomeParts.year, nowRomeParts.month, nowRomeParts.day, 0, 0, 0);
  const closingPartsForResocontoKey = getRomeDateParts(pexSkipWindow.windowEndExclusive);
  const resocontoWeekKey = `${closingPartsForResocontoKey.year}-${String(closingPartsForResocontoKey.month).padStart(2, "0")}-${String(closingPartsForResocontoKey.day).padStart(2, "0")}`;
  const staffResocontoPostedIds = await loadStaffResocontoPostedIds(guildId, resocontoWeekKey);
  const staffDocs = await ActivityUserProfile.find({ guildId, staff: { $exists: true } }, { userId: 1, staff: 1 }).lean().catch(() => []);

  const wantStaffForSegment =
    segment === "helper" || segment === "mod" || segment === "senior_moderator" || segment === "director" || segment === "admin"
      ? String(
          segment === "helper"
            ? IDs.roles.Helper
            : segment === "mod"
              ? IDs.roles.Mod
              : segment === "senior_moderator"
                ? IDs.roles.SeniorModerator
                : segment === "director"
                  ? IDs.roles.Director
                  : IDs.roles.Admin,
        )
      : null;

  const idsFromStaffDocs = (Array.isArray(staffDocs) ? staffDocs : [])
    .map((row) => String(row?.userId || ""))
    .filter(Boolean);
  const idsFromGuildRoles = collectResocontoDiscordMemberIdsForSegment(guild, segment);
  const knownStaffUserIds = forceTarget
    ? [targetUserId]
    : Array.from(new Set([...idsFromStaffDocs, ...idsFromGuildRoles]));
  if (!knownStaffUserIds.length) return { sent: 0, eligible: 0, segment };

  const fetchedMembers = await Promise.all(knownStaffUserIds.map((userId) => getGuildMemberCached(guild, userId)),);

  const candidateMembers = [];
  for (const member of fetchedMembers) {
    if (!member) continue;
    if (member.user?.bot) continue;

    const hasStaffRole = Boolean(resolveStaffRole(member));
    const hasPmRole = member.roles.cache.has(String(IDs.roles.PartnerManager));
    if (!hasStaffRole && !hasPmRole) continue;

    candidateMembers.push(member);
  }
  if (!candidateMembers.length) return { sent: 0, eligible: 0, segment };

  const staffMap = new Map((Array.isArray(staffDocs) ? staffDocs : []).map((row) => [String(row.userId), row.staff || {}]));

  const staffUserIds = candidateMembers.filter((m) => resolveStaffRole(m)).map((m) => String(m.id));
  const overviewResults = await Promise.all(
    staffUserIds.map((uid) =>
      getUserOverviewStats(
        guildId,
        uid,
        7,
        resocontoOverviewVoiceExclude,
        resocontoScope,
      ).catch((err) => {
        global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] overview stats failed:", uid, err?.message || err);
        return { __error: true };
      })),
  );
  const overviewMap = new Map(staffUserIds.map((id, i) => [id, overviewResults[i] || null]),);
  const sanctionCountByModId = await getWeeklySanctionCountByMod(guildId, weekStart, weekEnd);
  let sentCount = 0;
  let eligibleCount = 0;
  let completedCount = 0;

  for (const member of candidateMembers) {
    const userId = String(member.id);
    const staffDoc = staffMap.get(userId) || null;
    const staffRoleId = resolveStaffRole(member);
    const graceNewStaffRole =
      Boolean(staffRoleId) && wasPromotedToRoleInLastDays(staffDoc, staffRoleId, 7, now);
    const pmPexedInLast7Days = wasPromotedToRoleInLastDays(staffDoc, IDs.roles.PartnerManager, 7, now);
    const skipForStaffPexInWindow = shouldSkipResocontoForPexInCalendarWeek(
      staffDoc,
      pexSkipWindow.windowStart,
      pexSkipWindow.windowEndExclusive,
    );
    const skipForPmPromotionInWindow = wasPmPromotedInResocontoSkipWindow(
      staffDoc,
      pexSkipWindow.windowStart,
      pexSkipWindow.windowEndExclusive,
    );
    const shouldSkipStaffResoconto = skipForStaffPexInWindow && !graceNewStaffRole;
    const shouldSkipPmResoconto = skipForPmPromotionInWindow && !pmPexedInLast7Days;

    const matchStaffSegment =
      wantStaffForSegment && staffRoleId && String(staffRoleId) === wantStaffForSegment;
    if (matchStaffSegment) eligibleCount += 1;

    const alreadyHadStaffResocontoThisCycle =
      !forceTarget &&
      staffRoleId &&
      (
        staffResocontoPostedIds.has(`${staffRoleId}:${userId}`) ||
        await recentStaffResocontoMessageExists(channel, userId, staffRoleId, resocontoMessageSince)
      );
    if (matchStaffSegment && alreadyHadStaffResocontoThisCycle) completedCount += 1;

    if (matchStaffSegment && !shouldSkipStaffResoconto && !alreadyHadStaffResocontoThisCycle) {
      const overview = overviewMap.get(userId);
      if (overviewLooksLikeEmptyFallback(overview)) {
        global.logger?.warn?.(
          `[WEEKLY STAFF RESOCONTO] Staff skipped: ${userId} (${member.user?.tag || member.user?.username || "unknown"}) segment=${segment} reason=activity_stats_unavailable`,
        );
        continue;
      }
      const d7 = overview?.windows?.d7;
      const weeklyMessages = Math.max(0, Math.floor(toSafeNumber(d7?.text ?? 0)),);
      const weeklyVoiceSeconds = Math.max(0, Math.floor(toSafeNumber(d7?.voiceSeconds ?? 0)),);
      const weeklyVoiceHours = weeklyVoiceSeconds / 3600;
      const activityGrade = computeActivityGrade(staffRoleId, weeklyMessages, weeklyVoiceHours,);
      const behaviorGrade = computeBehaviorGrade(staffDoc?.positiveCount, staffDoc?.negativeCount,);
      const pexedInWeek = wasPexedInWeek(staffDoc, weekStart);
      const endedPauseDuringWeek = didPauseEndDuringWeek(staffDoc, weekStart, weekEnd, "Staff");
      const sanctionLimit = STAFF_SANCTION_LIMITS[String(staffRoleId)];
      const weeklySanctions = sanctionLimit != null ? sanctionCountByModId.get(userId) || 0 : 0;
      const metWeeklySanctionLimit =
        sanctionLimit != null &&
        weeklySanctions >= sanctionLimit &&
        !graceNewStaffRole &&
        !skipForStaffPexInWindow;
      const baseAction = endedPauseDuringWeek
        ? "Nulla"
        : computeStaffAction(
            activityGrade,
            behaviorGrade,
            pexedInWeek,
            staffDoc?.positiveCount,
            staffDoc?.negativeCount,
          );
      const action = graceNewStaffRole ? "Nulla" : metWeeklySanctionLimit ? "Valutazione Positiva" : baseAction;
      const staffNewBadge = action === "Nulla" && graceNewStaffRole ? ` ${STAFF_NEW_EMOJI}` : "";

      const staffRoleEmoji = getStaffRoleEmojiByRoleId(staffRoleId);
      const contentLines = [
        `${staffRoleEmoji} **Staffer:** __**<@${userId}>**__${staffNewBadge}`,
        `<:VC_Mention:1482526855289634997> **Ruolo:** __<@&${staffRoleId}>__`,
        `<:VC_Chat:1482532573002465413> **Messaggi in una settimana:** __${weeklyMessages}__`,
        `<:voice:1467639623735054509> **Ore in una settimana:** __${formatHoursFromSeconds(weeklyVoiceSeconds)}__`,
        ...buildCostanzaLines(overview),
        `<a:VC_Exclamation:1482534702077444217>  **Attività:** __${activityGrade}__`,
        `<:VC_Eye:1331619214410383381> **Condotta:** __${behaviorGrade}__`,
      ];
      if (sanctionLimit != null) {
        contentLines.push(`<:VC_Dot:1443660294596329582> **Sanzioni nella settimana:** __${weeklySanctions}__ (minimo __${sanctionLimit}__)`);
      }
      contentLines.push(`<:VC_BanHammer:1482534474502897795> **Azione:** __${action}__`);
      const pauseLine = getStaffPauseLine(staffDoc, "Staff");
      if (pauseLine) contentLines.push(pauseLine);

      const staffComponents = [
        buildResocontoButtons(
          "s",
          userId,
          staffActionToKey(action),
          staffRoleId,
        ),
      ];

      const staffMsg = await sendResocontoMessageWithRetry(
        channel,
        {
          content: contentLines.join("\n"),
          ...(staffComponents.length ? { components: staffComponents } : {}),
        },
        { userId, segment },
      );
      if (staffMsg) {
        sentCount += 1;
        completedCount += 1;
        await createResocontoThread(staffMsg, userId, member.user?.username, staffDoc);
        await appendStaffResocontoPostedId(guildId, resocontoWeekKey, userId);
        await appendStaffResocontoPostedRoleId(guildId, resocontoWeekKey, userId, staffRoleId);
        staffResocontoPostedIds.add(userId);
        staffResocontoPostedIds.add(`${staffRoleId}:${userId}`);
        const limits = STAFF_ACTIVITY_LIMITS[String(staffRoleId)];
        if (limits && !graceNewStaffRole && !skipForStaffPexInWindow) {
          const reachedWeeklyLimits =
            weeklyMessages >= Number(limits.messages || 0) &&
            weeklyVoiceHours >= Number(limits.hours || 0);
          const evalType = reachedWeeklyLimits ? "positive" : "negative";
          const evalReason = reachedWeeklyLimits
            ? "Limiti settimanali completati."
            : "Limiti settimanali non raggiunti.";
          await ensureWeeklyLimitAutoValutazione({
            guild,
            member,
            key: `weekly_limits:${resocontoWeekKey}:${staffRoleId}`,
            type: evalType,
            reason: evalReason,
          }).catch((err) => {
            global.logger?.warn?.(
              "[WEEKLY STAFF RESOCONTO] weekly limit valutazione failed:",
              userId,
              err?.message || err,
            );
          });
        }
      }
    } else if (matchStaffSegment) {
      const reason = alreadyHadStaffResocontoThisCycle
        ? "already_posted_this_cycle"
        : shouldSkipStaffResoconto
          ? "staff_pex_skip_window"
          : "unknown";
      global.logger?.info?.(
        `[WEEKLY STAFF RESOCONTO] Staff skipped: ${userId} (${member.user?.tag || member.user?.username || "unknown"}) segment=${segment} reason=${reason}`,
      );
    }

    if (
      segment === "pm" &&
      member.roles.cache.has(String(IDs.roles.PartnerManager)) &&
      !shouldSkipPmResoconto &&
      !isPmResocontoExcludedUserId(userId)
    ) {
      const pmWindow = getPmResocontoWindow(new Date());
      const weeklyPartners = countPmWeeklyPartners(staffDoc, pmWindow.weekStart, pmWindow.weekEnd,);
      const pmPexedInWeek = wasPmPexedInWeek(staffDoc, pmWindow.weekStart);
      const pmInPauseDuringWeek = wasPartnerManagerInPauseForResocontoWeek(staffDoc, pmWindow.weekStart, pmWindow.weekEnd, member);
      const basePmAction = pmInPauseDuringWeek ? "Nulla" : computePmAction(weeklyPartners, pmPexedInWeek);
      const action = pmPexedInLast7Days ? "Nulla" : basePmAction;
      const pmPauseLine = getPmResocontoPauseDisplayLine(staffDoc, member);
      const pmNewBadge = action === "Nulla" && pmPexedInLast7Days ? ` ${STAFF_NEW_EMOJI}` : "";
      const pmContentLines = [
        `<:VC_PartnerManager:1494286911286808576> **Partner Manager:** __<@${userId}>__${pmNewBadge}`,
        `<:partneredserverowner:1443651871125409812> **Partner:** __${weeklyPartners}__`,
        `<:VC_BanHammer:1482534474502897795> **Azione:** __${action}__`,
      ];
      if (pmPauseLine) pmContentLines.push(pmPauseLine);

      const pmComponents = [buildResocontoButtons("p", userId, pmActionToKey(action))];
      await channel
        .send({
          content: pmContentLines.join("\n"),
          ...(pmComponents.length ? { components: pmComponents } : {}),
        })
        .then((msg) => createResocontoThread(msg, userId, member.user?.username, staffDoc))
        .then(() => {
          sentCount += 1;
        })
        .catch(() => null);
    } else if (segment === "pm" && member.roles.cache.has(String(IDs.roles.PartnerManager))) {
      const reason = isPmResocontoExcludedUserId(userId)
        ? "excluded_config"
        : shouldSkipPmResoconto
          ? "pm_promotion_skip_window"
          : "unknown";
      global.logger?.info?.(
        `[WEEKLY STAFF RESOCONTO] PM skipped: ${userId} (${member.user?.tag || member.user?.username || "unknown"}) reason=${reason}`,
      );
    }
  }
  if (segment === "admin") {
    await writeLastResocontoRun();
  }
  return { sent: sentCount, eligible: eligibleCount, completed: completedCount, segment };
}

function getStaffResocontoChainSegments(segment) {
  const idx = STAFF_RESOCONTO_SEGMENTS.indexOf(String(segment || ""));
  if (idx < 0) return [];
  return STAFF_RESOCONTO_SEGMENTS.slice(idx);
}

async function runWeeklyStaffResocontoChain(client, segment, opts = {}) {
  const chain = getStaffResocontoChainSegments(segment);
  if (!chain.length || opts.force) return runWeeklyStaffResocontoSegment(client, segment, opts);

  let totalSent = 0;
  let totalCompleted = 0;
  const results = [];
  for (const currentSegment of chain) {
    const result = await runWeeklyStaffResocontoSegment(client, currentSegment, opts);
    results.push(result);
    totalSent += Number(result?.sent || 0);
    totalCompleted += Number(result?.completed || 0);
  }
  return { sent: totalSent, completed: totalCompleted, results };
}

async function runWeeklyStaffResoconti(client, opts = {}) {
  const seg = opts.segment;
  if (seg && seg !== "all") {
    if (STAFF_RESOCONTO_SEGMENTS.includes(seg)) {
      await runWeeklyStaffResocontoChain(client, seg, opts);
    } else {
      await runWeeklyStaffResocontoSegment(client, seg, opts);
    }
    return;
  }
  for (const { segment: s } of RESOCONTO_CRON_SEGMENTS) {
    if (STAFF_RESOCONTO_SEGMENTS.includes(s)) {
      await runWeeklyStaffResocontoChain(client, s, opts);
    } else {
      await runWeeklyStaffResocontoSegment(client, s, opts);
    }
  }
}

async function runPreResocontoReminders(client) {
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return;
  const guild = await getClientGuildCached(client, guildId);
  if (!guild) return;

  const resocontoExcludeVoiceChannels = collectVoiceChannelIdsUnderCategory(
    guild,
    String(IDs.categories?.categoryPrivate || ""),
  );
  const resocontoOverviewVoiceExclude =
    resocontoExcludeVoiceChannels.size > 0 ? resocontoExcludeVoiceChannels : null;
  const resocontoScope = buildResocontoActivityScope(guild);

  const staffDocs = await ActivityUserProfile.find({ guildId, staff: { $exists: true } }, { userId: 1, staff: 1 }).lean().catch(() => []);
  const idsFromStaffDocs = (staffDocs || [])
    .map((r) => String(r?.userId || ""))
    .filter((id) => /^\d{16,20}$/.test(id));
  const idsFromGuild = collectAllResocontoRelevantMemberIdsFromGuild(guild).filter((id) => /^\d{16,20}$/.test(id));
  const staffUserIds = Array.from(new Set([...idsFromStaffDocs, ...idsFromGuild]));
  if (!staffUserIds.length) return;

  const fetchedMembers = await Promise.all(staffUserIds.map((id) => getGuildMemberCached(guild, id)));
  const hasStaffRole = (m) => Boolean(resolveStaffRole(m));
  const hasPmRole = (m) => m.roles.cache.has(String(IDs.roles.PartnerManager));
  const reminderMembers = fetchedMembers.filter(
    (m) => m && !m.user?.bot && (hasStaffRole(m) || hasPmRole(m)),
  );
  if (!reminderMembers.length) return;

  reminderMembers.sort(compareResocontoMembers);

  const staffMap = new Map((staffDocs || []).map((r) => [String(r.userId), r.staff || {}]));
  const staffOnlyIds = reminderMembers.filter(hasStaffRole).map((m) => m.id);
  const overviewResults = await Promise.all(
    staffOnlyIds.map((uid) =>
      getUserOverviewStats(
        guildId,
        uid,
        7,
        resocontoOverviewVoiceExclude,
        resocontoScope,
      )),
  );
  const overviewByUserId = new Map(staffOnlyIds.map((id, i) => [String(id), overviewResults[i] || null]));
  const resocontoTime =
    "**domenica (ora italiana):** Partner Manager **15:00**, Helper **16:00**, Mod **17:00**, Senior Moderator **17:30**, Director **17:45**, Admin **18:00**";
  const reminderWindow = getPmResocontoWindow(new Date());
  const skipDmUserIds = new Set(getDevIds(client).map((id) => String(id)).filter((id) => /^\d{16,20}$/.test(id)));

  for (const member of reminderMembers) {
    const userId = String(member.id);
    if (skipDmUserIds.has(userId)) continue;
    const staffDoc = staffMap.get(userId);
    if (wasInPauseDuringWeek(staffDoc, reminderWindow.weekStart, reminderWindow.weekEnd, "Staff") || wasInPauseDuringWeek(staffDoc, reminderWindow.weekStart, reminderWindow.weekEnd, "PartnerManager")) continue;

    const staffRoleId = resolveStaffRole(member);
    if (staffRoleId && !wasPexedInWeek(staffDoc, reminderWindow.weekStart)) {
      const limits = STAFF_ACTIVITY_LIMITS[String(staffRoleId)];
      if (limits) {
        const overview = overviewByUserId.get(userId);
        const d7 = overview?.windows?.d7;
        const msg = Math.max(0, Math.floor(toSafeNumber(d7?.text ?? 0)));
        const voiceSec = Math.max(0, Math.floor(toSafeNumber(d7?.voiceSeconds ?? 0)));
        const hours = voiceSec / 3600;
        const needMsg = Math.max(0, limits.messages - msg);
        const needHours = Math.max(0, limits.hours - hours);
        if (needMsg > 0 || needHours > 0) {
          const parts = [];
          if (needMsg > 0) parts.push(`**${needMsg}** messaggi`);
          if (needHours > 0) parts.push(`**${needHours.toFixed(2)}** ore in vocale`);
          const text = `<:VC_Staff:1494286904089247754> **Promemoria resoconto**\n\nIl resoconto staff è ${resocontoTime}.\n\nPer rientrare nei limiti ti mancano: ${parts.join(" e ")}.`;
          await member.send({ content: text }).catch(() => null);
        }
      }
    }

    if (hasPmRole(member)) {
      if (isPmResocontoExcludedUserId(userId)) continue;
      const pmWindow = reminderWindow;
      if (wasPmPexedInWeek(staffDoc, pmWindow.weekStart)) continue;
      const weeklyPartners = countPmWeeklyPartners(staffDoc, pmWindow.weekStart, pmWindow.weekEnd);
      const minPartners = PM_WEEKLY_PARTNER_MIN_FOR_OK;
      if (weeklyPartners >= minPartners) continue;
      const mancano = minPartners - weeklyPartners;
      const tierHint =
        weeklyPartners <= PM_WEEKLY_DEPEX_MAX_PARTNERS
          ? " (0–15: al resoconto **Depex**)"
          : weeklyPartners < minPartners
            ? " (resoconto: **16**–**29** → **Richiamo**; **≥30** → **Nulla**)"
            : "";
      await member.send({
        content: `<:VC_PartnerManager:1494286911286808576> **Promemoria resoconto**\n\nIl resoconto staff è ${resocontoTime}.\n\nCome Partner Manager ti mancano **${mancano}** partner per raggiungere il minimo di ${minPartners}${tierHint}. Attualmente ne hai **${weeklyPartners}**.`,
      }).catch(() => null);
    }
  }
}

function getRomeWeekdayShort(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" });
  return formatter.format(now);
}

function getStaffRoleIdForResocontoSegment(segment) {
  if (segment === "helper") return String(IDs.roles.Helper || "").trim();
  if (segment === "mod") return String(IDs.roles.Mod || "").trim();
  if (segment === "senior_moderator") return String(IDs.roles.SeniorModerator || "").trim();
  if (segment === "director") return String(IDs.roles.Director || "").trim();
  if (segment === "admin") return String(IDs.roles.Admin || "").trim();
  return "";
}

function getPassedStaffResocontoSegments(now = new Date()) {
  const r = parseRomeWallClock(now);
  if (r.weekday !== "Sun") return [];
  const currentMinutes = Number(r.hour || 0) * 60 + Number(r.minute || 0);
  const starts = [
    { segment: "helper", minutes: 16 * 60 },
    { segment: "mod", minutes: 17 * 60 },
    { segment: "senior_moderator", minutes: 17 * 60 + 30 },
    { segment: "director", minutes: 17 * 60 + 45 },
    { segment: "admin", minutes: 18 * 60 },
  ];
  return starts.filter((item) => currentMinutes >= item.minutes).map((item) => item.segment);
}

async function runWeeklyLimitAutoValutazioniCatchupSegment(client, segment, now = new Date()) {
  const staffRoleId = getStaffRoleIdForResocontoSegment(segment);
  const limits = STAFF_ACTIVITY_LIMITS[String(staffRoleId)];
  if (!staffRoleId || !limits) return;

  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return;
  const guild = await getClientGuildCached(client, guildId);
  if (!guild) return;
  await hydrateGuildMembersForResoconto(guild, `catchup_${segment}`);

  const resocontoExcludeVoiceChannels = collectVoiceChannelIdsUnderCategory(
    guild,
    String(IDs.categories?.categoryPrivate || ""),
  );
  const resocontoOverviewVoiceExclude =
    resocontoExcludeVoiceChannels.size > 0 ? resocontoExcludeVoiceChannels : null;
  const resocontoScope = buildResocontoActivityScope(guild);
  const pexSkipWindow = getResocontoPexSkipWindowUtc(now);
  const nowRomeParts = getRomeDateParts(now);
  const resocontoMessageSince = createUtcFromRomeLocal(nowRomeParts.year, nowRomeParts.month, nowRomeParts.day, 0, 0, 0);
  const closingPartsForResocontoKey = getRomeDateParts(pexSkipWindow.windowEndExclusive);
  const resocontoWeekKey = `${closingPartsForResocontoKey.year}-${String(closingPartsForResocontoKey.month).padStart(2, "0")}-${String(closingPartsForResocontoKey.day).padStart(2, "0")}`;
  const channel = await resolveChannel(client, String(IDs.channels?.resocontiStaff || ""));
  if (!channel?.isTextBased?.()) return;

  const staffDocs = await ActivityUserProfile.find({ guildId, staff: { $exists: true } }, { userId: 1, staff: 1 }).lean().catch(() => []);
  const staffMap = new Map((Array.isArray(staffDocs) ? staffDocs : []).map((row) => [String(row.userId), row.staff || {}]));
  const idsFromGuildRoles = collectMemberIdsMatchingResocontoStaffSegment(guild, staffRoleId);
  const idsFromStaffDocs = (Array.isArray(staffDocs) ? staffDocs : [])
    .map((row) => String(row?.userId || ""))
    .filter(Boolean);
  const userIds = Array.from(new Set([...idsFromGuildRoles, ...idsFromStaffDocs]));
  if (!userIds.length) return;

  const fetchedMembers = await Promise.all(userIds.map((userId) => getGuildMemberCached(guild, userId)));
  const members = fetchedMembers.filter((member) =>
    member &&
    !member.user?.bot &&
    String(resolveStaffRole(member) || "") === String(staffRoleId),
  );
  if (!members.length) return;

  const overviewResults = await Promise.all(
    members.map((member) =>
      getUserOverviewStats(
        guildId,
        member.id,
        7,
        resocontoOverviewVoiceExclude,
        resocontoScope,
      ).catch((err) => {
        global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] catchup overview stats failed:", member.id, err?.message || err);
        return { __error: true };
      })),
  );

  for (let i = 0; i < members.length; i += 1) {
    const member = members[i];
    const userId = String(member.id);
    const staffDoc = staffMap.get(userId) || null;
    const graceNewStaffRole = wasPromotedToRoleInLastDays(staffDoc, staffRoleId, 7, now);
    const skipForStaffPexInWindow = shouldSkipResocontoForPexInCalendarWeek(
      staffDoc,
      pexSkipWindow.windowStart,
      pexSkipWindow.windowEndExclusive,
    );
    if (graceNewStaffRole || skipForStaffPexInWindow) continue;
    const hasResoconto = await recentStaffResocontoMessageExists(channel, userId, staffRoleId, resocontoMessageSince);
    if (!hasResoconto) {
      global.logger?.info?.(
        `[WEEKLY STAFF RESOCONTO] same-day catchup skipped: ${userId} reason=no_resoconto_message`,
      );
      continue;
    }
    if (overviewLooksLikeEmptyFallback(overviewResults[i])) {
      global.logger?.warn?.(
        `[WEEKLY STAFF RESOCONTO] same-day catchup skipped: ${userId} reason=activity_stats_unavailable`,
      );
      continue;
    }

    const d7 = overviewResults[i]?.windows?.d7;
    const weeklyMessages = Math.max(0, Math.floor(toSafeNumber(d7?.text ?? 0)));
    const weeklyVoiceSeconds = Math.max(0, Math.floor(toSafeNumber(d7?.voiceSeconds ?? 0)));
    const weeklyVoiceHours = weeklyVoiceSeconds / 3600;
    const reachedWeeklyLimits =
      weeklyMessages >= Number(limits.messages || 0) &&
      weeklyVoiceHours >= Number(limits.hours || 0);
    await ensureWeeklyLimitAutoValutazione({
      guild,
      member,
      key: `weekly_limits:${resocontoWeekKey}:${staffRoleId}`,
      type: reachedWeeklyLimits ? "positive" : "negative",
      reason: reachedWeeklyLimits
        ? "Limiti settimanali completati."
        : "Limiti settimanali non raggiunti.",
    }).catch((err) => {
      global.logger?.warn?.(
        "[WEEKLY STAFF RESOCONTO] same-day catchup valutazione failed:",
        userId,
        err?.message || err,
      );
    });
  }
}

async function runSameDayWeeklyLimitAutoValutazioniRecovery(client) {
  const now = new Date();
  if (parseRomeWallClock(now).weekday !== "Sun") return;
  const segments = STAFF_RESOCONTO_SEGMENTS;
  if (!segments.length) return;
  global.logger?.info?.(
    `[WEEKLY STAFF RESOCONTO] Same-day recovery: weekly limit valutazioni following existing resoconti (${segments.join(", ")}).`,
  );
  for (const segment of segments) {
    await runWeeklyLimitAutoValutazioniCatchupSegment(client, segment, now).catch((err) => {
      global.logger?.error?.(`[WEEKLY STAFF RESOCONTO] Same-day recovery failed (${segment}):`, err);
    });
  }
}

function startWeeklyStaffResocontoLoop(client) {
  if (weeklyStaffResocontoTasks.length) return weeklyStaffResocontoTasks[0];

  for (const { segment, expression } of RESOCONTO_CRON_SEGMENTS) {
    const task = cron.schedule(
      expression,
      async () => {
        const runner = STAFF_RESOCONTO_SEGMENTS.includes(segment)
          ? runWeeklyStaffResocontoChain
          : runWeeklyStaffResocontoSegment;
        await runner(client, segment).catch((err) => {
          global.logger?.error?.(`[WEEKLY STAFF RESOCONTO] Execution failed (${segment})`, err);
        });
      },
      { timezone: TIME_ZONE },
    );
    weeklyStaffResocontoTasks.push(task);
  }

  const preResocontoTask = cron.schedule(
    "0 18 * * 5",
    async () => {
      await runPreResocontoReminders(client).catch((err) => {
        global.logger?.error?.("[WEEKLY STAFF RESOCONTO] Pre-reminder failed", err);
      });
    },
    { timezone: TIME_ZONE },
  );
  if (typeof preResocontoTask?.ref === "function") preResocontoTask.ref();

  setTimeout(() => {
    runSameDayWeeklyLimitAutoValutazioniRecovery(client).catch((err) => {
      global.logger?.error?.("[WEEKLY STAFF RESOCONTO] Same-day recovery failed:", err);
    });
  }, 60_000).unref?.();

  setImmediate(async () => {
    const wd = getRomeWeekdayShort(new Date());
    if (wd !== "Mon") return;
    const lastRunAt = await readLastResocontoRun();
    const lastSundayClose = getLastSundayResocontoCloseRomeUtc(new Date());
    const twoHoursMs = 2 * 60 * 60 * 1000;
    if (lastRunAt != null && lastRunAt >= lastSundayClose.getTime() - twoHoursMs) {
      return;
    }
    global.logger?.info?.(
      "[WEEKLY STAFF RESOCONTO] Recovery: running missed resoconto segments (bot was likely offline Sunday).",
    );
    runWeeklyStaffResoconti(client, { segment: "all" }).catch((err) =>
      global.logger?.error?.("[WEEKLY STAFF RESOCONTO] Recovery failed:", err),
    );
  });

  return weeklyStaffResocontoTasks[0];
}

module.exports = {
  startWeeklyStaffResocontoLoop,
  runWeeklyStaffResoconti,
  runWeeklyStaffResocontoSegment,
  getPartnerLeaderboardWeekBoundsUtc,
  buildResocontoActivityScope,
  getWeekStartDate,
  getWeeklySanctionCountByMod,
  resolveStaffRole,
  STAFF_ACTIVITY_LIMITS,
  STAFF_SANCTION_LIMITS,
};