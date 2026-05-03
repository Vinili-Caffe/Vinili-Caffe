const cron = require("node-cron");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { aggregateSanctionsByModInWeek } = require("../../Utils/Moderation/modCaseStore");
const { RESOCONTO_APPLY_PREFIX, RESOCONTO_REJECT_PREFIX } = require("../../Events/interaction/resocontoHandlers");
const { getUserOverviewStats } = require("../Community/activityService");
const { getClientGuildCached, getClientChannelCached, getGuildMemberCached, } = require("../../Utils/Interaction/interactionEntityCache");
const { getDevIds } = require("../../Utils/Moderation/commandPermissions");
const { STAFF_NEW_EMOJI } = require("../../Utils/Community/staffListUtils");
const { getStaffRoleEmojiByRoleId } = require("../../Utils/Community/staffRoleEmoji");
const TIME_ZONE = "Europe/Rome";
/** Chiusura settimana resoconti (Europe/Rome): ultimo invio = Admin domenica. */
const RESOCONTO_CLOSE_HOUR_ROME = 18;
const RESOCONTO_CRON_SEGMENTS = [
  { segment: "pm", expression: "0 15 * * 0" },
  { segment: "helper", expression: "0 16 * * 0" },
  { segment: "mod", expression: "0 17 * * 0" },
  { segment: "admin", expression: "0 18 * * 0" },
];
const STAFF_ACTIVITY_LIMITS = {
  [String(IDs.roles.Helper)]: { messages: 350, hours: 3.5 },
  [String(IDs.roles.Mod)]: { messages: 450, hours: 4.5 },
  /** Admin in resoconto: soglie allineate al ruolo (≥ Mod). */
  [String(IDs.roles.Admin)]: { messages: 500, hours: 5 },
};
const STAFF_SANCTION_LIMITS = {
  [String(IDs.roles.Mod)]: 1,
  [String(IDs.roles.Admin)]: 4,
};
const SANCTION_ACTIONS = new Set(["WARN", "MUTE", "KICK", "BAN"]);
/** Ruoli con resoconto attività/sanzioni: Admin, Mod, Helper (High Staff è escluso). */
const STAFF_ROLE_PRIORITY = [String(IDs.roles.Admin), String(IDs.roles.Mod), String(IDs.roles.Helper)];
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
    IDs.roles.Admin,
    IDs.roles.Founder,
    IDs.roles.PartnerManager,
  ]
    .filter(Boolean)
    .map((roleId, index) => [String(roleId), index]),
);
/** Partner settimanali da PM: sotto questo numero (salvo eccezioni) non si va in “Nulla” sul resoconto. */
const PM_WEEKLY_PARTNER_MIN_FOR_OK = 25;
const ROLE_UP = {
  [String(IDs.roles.Member || "")]: String(IDs.roles.Helper),
  [String(IDs.roles.Helper)]: String(IDs.roles.Mod),
  [String(IDs.roles.Mod)]: String(IDs.roles.Admin),
};

let weeklyStaffResocontoTasks = [];
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

function toSafeNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function formatHoursFromSeconds(seconds) {
  const safeSeconds = Math.max(0, Math.floor(toSafeNumber(seconds)));
  const hours = safeSeconds / 3600;
  return `${hours.toFixed(2)}h`;
}

/** Canali vocali (e stage) con parent = categoria: il tempo non conta per i resoconti staff. */
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

/** Domenica all'ora di chiusura resoconti (Europe/Rome) che delimita il ciclo rispetto a `referenceNow`. */
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

/**
 * Finestra classifica partner “settimanale”: [chiusura resoconti domenica, stessa ora dopo 7 giorni) in Europe/Rome.
 */
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

/** Lunedì 00:00 → domenica chiusura resoconti (escluso) Roma per la settimana chiusa da quel ciclo. */
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

/** Data calendario `dd/mm/yyyy` come inizio del giorno in **Europe/Rome** (non UTC). */
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

/** Pausa rilevante per il blocco resoconto PM: ruolo PM/Entrambi, oppure pausa “staff” se l’utente è comunque Partner Manager (stesso periodo di assenza). */
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

/** Utenti in cache il cui ruolo staff per resoconto coincide col tier (stesso criterio di `resolveStaffRole`). Copre chi non ha ancora `staff` su Mongo. */
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

/** ID membri da includere per questo segmento cron (helper / mod / admin / pm), dalla cache guild. */
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
  if (segment === "helper" || segment === "mod" || segment === "admin") {
    const want =
      segment === "helper"
        ? String(IDs.roles.Helper || "").trim()
        : segment === "mod"
          ? String(IDs.roles.Mod || "").trim()
          : String(IDs.roles.Admin || "").trim();
    return collectMemberIdsMatchingResocontoStaffSegment(guild, want);
  }
  return [];
}

/** Tutti gli ID staff (scala helper→admin) o PM presenti in guild — per promemoria e liste oltre al solo DB `staff`. */
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

/** Soglie PM: ≤5 Depex, 6–(min−1) Richiamo, ≥min Nulla. */
function computePmAction(weeklyPartners, pmPexedInWeek) {
  if (pmPexedInWeek) return "Nulla";
  const partners = Math.max(0, Math.floor(toSafeNumber(weeklyPartners)));
  if (partners <= 5) return "Depex";
  if (partners < PM_WEEKLY_PARTNER_MIN_FOR_OK) return "Richiamo";
  return "Nulla";
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

async function runWeeklyStaffResocontoSegment(client, segment) {
  const allowed = new Set(["pm", "helper", "mod", "admin"]);
  if (!allowed.has(segment)) return;

  const guildId = String(IDs.guilds?.main || "");
  const channelId = String(IDs.channels?.resocontiStaff || "");
  if (!guildId || !channelId) return;

  const guild = await getClientGuildCached(client, guildId);
  if (!guild) return;

  const resocontoExcludeVoiceChannels = collectVoiceChannelIdsUnderCategory(
    guild,
    String(IDs.categories?.categoryPrivate || ""),
  );
  const resocontoOverviewVoiceExclude =
    resocontoExcludeVoiceChannels.size > 0 ? resocontoExcludeVoiceChannels : null;
  const resocontoScope = buildResocontoActivityScope(guild);

  const channel = await resolveChannel(client, channelId);
  if (!channel?.isTextBased?.()) return;

  const now = new Date();
  const weekStart = getWeekStartDate(now);
  const weekEnd = now;
  const pexSkipWindow = getResocontoPexSkipWindowUtc(now);
  const staffDocs = await ActivityUserProfile.find({ guildId, staff: { $exists: true } }, { userId: 1, staff: 1 }).lean().catch(() => []);

  const wantStaffForSegment =
    segment === "helper" || segment === "mod" || segment === "admin"
      ? String(
          segment === "helper"
            ? IDs.roles.Helper
            : segment === "mod"
              ? IDs.roles.Mod
              : IDs.roles.Admin,
        )
      : null;

  const idsFromStaffDocs = (Array.isArray(staffDocs) ? staffDocs : [])
    .map((row) => String(row?.userId || ""))
    .filter(Boolean);
  const idsFromGuildRoles = collectResocontoDiscordMemberIdsForSegment(guild, segment);
  const knownStaffUserIds = Array.from(new Set([...idsFromStaffDocs, ...idsFromGuildRoles]));
  if (!knownStaffUserIds.length) return;

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
  if (!candidateMembers.length) return;

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
      )),
  );
  const overviewMap = new Map(staffUserIds.map((id, i) => [id, overviewResults[i] || null]),);
  const sanctionCountByModId = await getWeeklySanctionCountByMod(guildId, weekStart, weekEnd);

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

    if (matchStaffSegment && !shouldSkipStaffResoconto) {
      const overview = overviewMap.get(userId);
      const d7 = overview?.windows?.d7;
      const weeklyMessages = Math.max(0, Math.floor(toSafeNumber(d7?.text ?? 0)),);
      const weeklyVoiceSeconds = Math.max(0, Math.floor(toSafeNumber(d7?.voiceSeconds ?? 0)),);
      const weeklyVoiceHours = weeklyVoiceSeconds / 3600;
      const activityGrade = computeActivityGrade(staffRoleId, weeklyMessages, weeklyVoiceHours,);
      const behaviorGrade = computeBehaviorGrade(staffDoc?.positiveCount, staffDoc?.negativeCount,);
      const pexedInWeek = wasPexedInWeek(staffDoc, weekStart);
      const endedPauseDuringWeek = didPauseEndDuringWeek(staffDoc, weekStart, weekEnd, "Staff");
      const baseAction = endedPauseDuringWeek
        ? "Nulla"
        : computeStaffAction(
            activityGrade,
            behaviorGrade,
            pexedInWeek,
            staffDoc?.positiveCount,
            staffDoc?.negativeCount,
          );
      const action = graceNewStaffRole ? "Nulla" : baseAction;
      const staffNewBadge = action === "Nulla" && graceNewStaffRole ? ` ${STAFF_NEW_EMOJI}` : "";

      const sanctionLimit = STAFF_SANCTION_LIMITS[String(staffRoleId)];
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
        const weeklySanctions = sanctionCountByModId.get(userId) || 0;
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

      await channel
        .send({
          content: contentLines.join("\n"),
          ...(staffComponents.length ? { components: staffComponents } : {}),
        })
        .then((msg) => createResocontoThread(msg, userId, member.user?.username, staffDoc))
        .catch(() => null);
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
        .catch(() => null);
    }
  }
  if (segment === "admin") {
    await writeLastResocontoRun();
  }
}

async function runWeeklyStaffResoconti(client, opts = {}) {
  const seg = opts.segment;
  if (seg && seg !== "all") {
    await runWeeklyStaffResocontoSegment(client, seg);
    return;
  }
  for (const { segment: s } of RESOCONTO_CRON_SEGMENTS) {
    await runWeeklyStaffResocontoSegment(client, s);
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
    "**domenica (ora italiana):** Partner Manager **15:00**, Helper **16:00**, Mod **17:00**, Admin **18:00**";
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
      const depexHint = weeklyPartners < 5 ? " (sotto 5 rischi Depex)" : "";
      await member.send({
        content: `<:VC_PartnerManager:1494286911286808576> **Promemoria resoconto**\n\nIl resoconto staff è ${resocontoTime}.\n\nCome Partner Manager ti mancano **${mancano}** partner per raggiungere il minimo di ${minPartners}${depexHint}. Attualmente ne hai **${weeklyPartners}**.`,
      }).catch(() => null);
    }
  }
}

function getRomeWeekdayShort(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" });
  return formatter.format(now);
}

function startWeeklyStaffResocontoLoop(client) {
  if (weeklyStaffResocontoTasks.length) return weeklyStaffResocontoTasks[0];

  for (const { segment, expression } of RESOCONTO_CRON_SEGMENTS) {
    const task = cron.schedule(
      expression,
      async () => {
        await runWeeklyStaffResocontoSegment(client, segment).catch((err) => {
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
  getPartnerLeaderboardWeekBoundsUtc,
};