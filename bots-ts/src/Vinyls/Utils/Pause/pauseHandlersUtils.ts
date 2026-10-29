const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const mongoose = require("mongoose") as typeof import("mongoose");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../DB/validateWriteIds") as typeof import("../DB/validateWriteIds");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_SET_TIMEOUT_MS = 2147483647;
const pauseStatusRefreshScheduled = new Map();
const PAUSE_FESTIVI_TIMEZONE = "Europe/Rome";
const STAFF_ROLE_PRIORITY = [
  IDs.roles.Founder,
  IDs.roles.Manager,
  IDs.roles.Admin,
  IDs.roles.Director,
  IDs.roles.HighStaff,
  IDs.roles.SeniorModerator,
  IDs.roles.Mod,
  IDs.roles.Helper,
  IDs.roles.Staff,
  IDs.roles.PartnerManager,
].filter(Boolean);

function getRomeDateKey(date?) {
  if (!date || !date.getTime) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: PAUSE_FESTIVI_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p?) => p.type === "year")?.value;
  const month = parts.find((p?) => p.type === "month")?.value;
  const day = parts.find((p?) => p.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function getRomeDayStartUtcMs(dayUtc?) {
  if (!dayUtc || !Number.isFinite(dayUtc.getTime?.())) return null;
  const y = dayUtc.getUTCFullYear();
  const m = dayUtc.getUTCMonth();
  const d = dayUtc.getUTCDate();
  const targetKey = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  let lo = Date.UTC(y, m, d) - 14 * 60 * 60 * 1000;
  let hi = Date.UTC(y, m, d) + 14 * 60 * 60 * 1000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (getRomeDateKey(new Date(mid)) >= targetKey) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function getEasterSunday(year?) {
  const y = Number(year);
  if (!Number.isFinite(y)) return null;
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year: y, month, day };
}

function getFestiviSetForYear(year?) {
  const set = new Set();
  const y = Number(year);
  if (!Number.isFinite(y)) return set;
  const pad = (n?) => String(n).padStart(2, "0");
  set.add(`${y}-12-24`);
  set.add(`${y}-12-25`);
  set.add(`${y}-12-26`);
  set.add(`${y}-12-31`);
  set.add(`${y}-01-01`);
    set.add(`${y}-04-25`);
  set.add(`${y}-05-01`);
  set.add(`${y}-06-02`);
  set.add(`${y}-08-15`);
  const pasqua = getEasterSunday(y);
  if (pasqua) {
    set.add(`${y}-${pad(pasqua.month)}-${pad(pasqua.day)}`);
    const pasquetta = new Date(y, pasqua.month - 1, pasqua.day + 1);
    set.add(`${pasquetta.getFullYear()}-${pad(pasquetta.getMonth() + 1)}-${pad(pasquetta.getDate())}`);
  }
  return set;
}

function countFestiviInRange(start?, end?) {
  if (!start || !end || end < start) return 0;
  let count = 0;
  const startUtc = start.getTime();
  const endUtc = end.getTime();
  for (let t = startUtc; t <= endUtc; t += MS_PER_DAY) {
    const date = new Date(t);
    const key = getRomeDateKey(date);
    if (!key) continue;
    const y = parseInt(key.slice(0, 4), 10);
    if (getFestiviSetForYear(y).has(key)) count += 1;
  }
  return count;
}

const PAUSE_ROLE_LIMITS = {
  Helper: 2,
  Mod: 2,
  "Senior Moderator": 2,
  SeniorModerator: 2,
  Director: 1,
  HighStaff: 1,
  Admin: 1,
  Manager: 1,
  Founder: 1,
  Staff: null,
  PartnerManager: null,
};
const PAUSE_ROLE_STAFF = "Staff";
const PAUSE_ROLE_PM = "PartnerManager";
const PAUSE_ROLE_BOTH = "Entrambi";
const STAFF_RANK_LIMIT_KEY_BY_ROLE_ID = {
  [String(IDs.roles.Helper || "")]: "Helper",
  [String(IDs.roles.Mod || "")]: "Mod",
  [String(IDs.roles.SeniorModerator || "")]: "SeniorModerator",
  [String(IDs.roles.HighStaff || "")]: "HighStaff",
  [String(IDs.roles.Director || "")]: "Director",
  [String(IDs.roles.Admin || "")]: "Admin",
  [String(IDs.roles.Manager || "")]: "Manager",
  [String(IDs.roles.Founder || "")]: "Founder",
  [String(IDs.roles.Staff || "")]: "Staff",
  [String(IDs.roles.PartnerManager || "")]: "PartnerManager",
};
const pauseRankChangeSyncTimers = new Map();

function parseItalianDate(value?) {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  let match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  let day = null;
  let month = null;
  let year = null;
  if (match) {
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  } else {
    match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return date;
}

function getPauseDaysBetween(startRaw?, endRaw?) {
  const start = parseItalianDate(startRaw);
  const end = parseItalianDate(endRaw);
  if (!start || !end || end < start) return null;
  return Math.floor(((end as any) - (start as any)) / MS_PER_DAY) + 1;
}

function getTodayUtc() {
  const key = getRomeDateKey(new Date());
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getCurrentYearBoundsUtc() {
  const now = getTodayUtc();
  const year = now.getUTCFullYear();
  return {
    yearStart: new Date(Date.UTC(year, 0, 1)),
    yearEnd: new Date(Date.UTC(year, 11, 31)),
  };
}

function countOverlapDays(start?, end?, windowStart?, windowEnd?) {
  if (!start || !end || end < start) return 0;
  const overlapStart = start > windowStart ? start : windowStart;
  const overlapEnd = end < windowEnd ? end : windowEnd;
  if (overlapEnd < overlapStart) return 0;
  return Math.floor((overlapEnd - overlapStart) / MS_PER_DAY) + 1;
}

function countEffectiveOverlapDays(start?, end?, windowStart?, windowEnd?) {
  const raw = countOverlapDays(start, end, windowStart, windowEnd);
  if (raw === 0) return 0;
  const overlapStart = start > windowStart ? start : windowStart;
  const overlapEnd = end < windowEnd ? end : windowEnd;
  const festivi = countFestiviInRange(overlapStart, overlapEnd);
  return Math.max(0, raw - festivi);
}

function rangesOverlap(startA?, endA?, startB?, endB?) {
  if (!startA || !endA || !startB || !endB) return false;
  return startA <= endB && startB <= endA;
}

function getMonthBoundsUtc(year?, month?) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return {
    monthStart: new Date(Date.UTC(y, m - 1, 1)),
    monthEnd: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)),
  };
}

function filterPausesByMonth(pauses?, year?, month?) {
  const bounds = getMonthBoundsUtc(year, month);
  if (!bounds || !Array.isArray(pauses)) return [];
  return pauses.filter((pause?) => {
    const start = parseItalianDate(pause?.dataRichiesta);
    const end = parseItalianDate(pause?.dataRitorno);
    return start && end && countOverlapDays(start, end, bounds.monthStart, bounds.monthEnd) > 0;
  });
}

async function computeStaffersInPauseByRoleForRange(guildId?, roleLabel?, rangeStartRaw?, rangeEndRaw?, excludeUserId = null) {
  const targetStart = parseItalianDate(rangeStartRaw);
  const targetEnd = parseItalianDate(rangeEndRaw);
  if (!targetStart || !targetEnd) return 0;

  const g = String(guildId ?? "").trim();
  if (!g) return 0;
  const excluded = String(excludeUserId ?? "").trim();
  const docs = await ActivityUserProfile.find({ guildId: g, staff: { $exists: true } }, { userId: 1, "staff.pauses": 1 })
    .lean()
    .catch(() => []);
  const userIds = new Set();

  for (const doc of docs) {
    if (excluded && String(doc?.userId ?? "").trim() === excluded) continue;
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    const hasOverlap = pauses.some((pause?) => {
      if (!pause || pause.status !== "accepted") return false;
      if (!roleChoiceAppliesTo(roleLabel, pause.ruolo)) return false;
      const pStart = parseItalianDate(pause.dataRichiesta);
      const pEnd = parseItalianDate(pause.dataRitorno);
      return rangesOverlap(targetStart, targetEnd, pStart, pEnd);
    });
    if (hasOverlap && doc?.userId) userIds.add(String(doc.userId));
  }

  return userIds.size;
}

function getMemberStaffRankRoleId(member?) {
  if (!member?.roles?.cache) return null;
  for (const roleId of STAFF_ROLE_PRIORITY) {
    const id = String(roleId || "").trim();
    if (id && member.roles.cache.has(id)) return id;
  }
  return null;
}

function getStaffRankLimitKey(rankRoleId?) {
  const id = String(rankRoleId || "").trim();
  if (!id) return null;
  return STAFF_RANK_LIMIT_KEY_BY_ROLE_ID[id] || null;
}

function resolvePauseStaffRankRoleId(member?, pause?) {
  const live = getMemberStaffRankRoleId(member);
  if (live) return live;
  const stored = String(pause?.ruoloGradeId || "").trim();
  return stored || null;
}

async function computeStaffersInPauseByStaffRankForRange(
  guild?,
  guildId?,
  targetRankRoleId?,
  rangeStartRaw?,
  rangeEndRaw?,
  excludeUserId = null,
  pauseTrack = PAUSE_ROLE_STAFF,
) {
  const targetRank = String(targetRankRoleId || "").trim();
  if (!targetRank) return 0;
  const track = normalizePauseRoleChoice(pauseTrack) || PAUSE_ROLE_STAFF;
  const targetStart = parseItalianDate(rangeStartRaw);
  const targetEnd = parseItalianDate(rangeEndRaw);
  if (!targetStart || !targetEnd) return 0;

  const g = String(guildId ?? guild?.id ?? "").trim();
  if (!g) return 0;
  const excluded = String(excludeUserId ?? "").trim();
  const docs = await ActivityUserProfile.find({ guildId: g, staff: { $exists: true } }, { userId: 1, "staff.pauses": 1 })
    .lean()
    .catch(() => []);

  const candidates = [];
  for (const doc of docs) {
    const uid = String(doc?.userId ?? "").trim();
    if (!uid || (excluded && uid === excluded)) continue;
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    const matching = pauses.find((pause?) => {
      if (!pause || pause.status !== "accepted") return false;
      if (!roleChoiceAppliesTo(track, pause.ruolo)) return false;
      const pStart = parseItalianDate(pause.dataRichiesta);
      const pEnd = parseItalianDate(pause.dataRitorno);
      return rangesOverlap(targetStart, targetEnd, pStart, pEnd);
    });
    if (matching) candidates.push({ userId: uid, pause: matching });
  }
  if (!candidates.length) return 0;

  let matched = 0;
  for (const { userId, pause } of candidates) {
    let member = guild?.members?.cache?.get(userId) || null;
    if (!member && guild?.members?.fetch) {
      member = await guild.members.fetch(userId).catch(() => null);
    }
    const rankId = resolvePauseStaffRankRoleId(member, pause);
    if (rankId && rankId === targetRank) matched += 1;
  }
  return matched;
}

function buildAcceptedPauseLogContent({
  roleLabel,
  effectiveUserId,
  pauseTimingText,
  dataRichiesta,
  dataRitorno,
  giorniUsati,
  maxGiorni,
  giorniRimanenti,
  sameRoleActiveCount,
  roleLimitWarning,
}) {
  return `<a:VC_Calendar:1482706208149475358> **\`${roleLabel}\`** - **<@${effectiveUserId}>** ${pauseTimingText}.\n<:VC_Clock:1473359204189474886> Dal **\`${dataRichiesta}\`** al **\`${dataRitorno}\`**\n<:VC_update:1478721333096349817> __\`${giorniUsati}/${maxGiorni}\`__ giorni utilizzati (\`${giorniRimanenti}\` rimanenti) - <:VC_Staff:1494286904089247754> __\`${sameRoleActiveCount}\`__ staffer in pausa in quel ruolo${roleLimitWarning || ""}`;
}

function buildCancelledPauseLogContent({
  roleLabel,
  effectiveUserId,
  dataRichiesta,
  dataRitorno,
  giorniScalati,
  giorniTotaliUsati,
  maxGiorni,
  giorniRimanenti,
}) {
  return [
    `<a:VC_Calendar:1482706208149475358> **\`${roleLabel}\`** - **<@${effectiveUserId}>** aveva una pausa **annullata**.`,
    `<:VC_Clock:1473359204189474886> Dal **\`${dataRichiesta}\`** al **\`${dataRitorno}\`**`,
    `<:VC_update:1478721333096349817> Giorni scalati: __\`${giorniScalati}\`__ · Totale usati: __\`${giorniTotaliUsati}/${maxGiorni}\`__ (\`${giorniRimanenti}\` rimanenti)`,
    "",
    "<:cancel:1461730653677551691> **__`ANNULLATA`__**",
  ].join("\n");
}

function formatPauseRoleLabelForMessage(guild?, roleChoice?, member?) {
  const normalized = normalizePauseRoleChoice(roleChoice) || PAUSE_ROLE_STAFF;
  const pmRole = guild?.roles?.cache?.get(String(IDs.roles?.PartnerManager || ""));
  const pmLabel = pmRole?.name || "Partner Manager";
  const staffRole = guild?.roles?.cache?.get(String(IDs.roles?.Staff || ""));
  const staffFallback = staffRole?.name || "Staff";
  const staffLabel = member ? getMemberRoleLabel(member) : staffFallback;

  if (normalized === PAUSE_ROLE_PM) return pmLabel;
  if (normalized === PAUSE_ROLE_BOTH) {
    const left = staffLabel || staffFallback;
    if (left && pmLabel && left.toLowerCase() !== pmLabel.toLowerCase()) return `${left} e ${pmLabel}`;
    return left || pmLabel || "Entrambi";
  }
  if (member) return staffLabel;
  return staffFallback;
}

async function buildAcceptedPauseMessageContent(guild?, userId?, pause?, { forPm = false } = {}) {
  const uid = String(userId || "").trim();
  if (!guild || !uid || !pause) return null;
  let member = guild.members?.cache?.get(uid) || null;
  if (!member && guild.members?.fetch) {
    member = await guild.members.fetch(uid).catch(() => null);
  }
  const staffDoc = await getStaffPauseRecord(guild.id, uid);
  const roleChoice = normalizePauseRoleChoice(pause.ruolo || pause.ruoloRichiesto) || PAUSE_ROLE_STAFF;
  const pauseTimingText = getPauseTimingText(pause.dataRichiesta, pause.dataRitorno);
  const baseLimit = getBasePauseLimit(member, forPm ? PAUSE_ROLE_PM : roleChoice === PAUSE_ROLE_BOTH ? PAUSE_ROLE_STAFF : roleChoice);
  const bonusPause = getStaffPauseBonusDaysTotal(member, staffDoc);
  const maxGiorni = baseLimit + bonusPause;
  const giorniUsati = Number(pause.giorniUsati);
  const used = Number.isFinite(giorniUsati) ? giorniUsati : 0;
  const giorniRimanenti = maxGiorni - used;

  let roleLabel;
  let sameRoleActiveCount = 1;
  let roleLimitWarning = "";

  if (forPm || roleChoice === PAUSE_ROLE_PM) {
    roleLabel = formatPauseRoleLabelForMessage(guild, PAUSE_ROLE_PM, member);
    const overlapPm = await computeStaffersInPauseByRoleForRange(
      guild.id,
      PAUSE_ROLE_PM,
      pause.dataRichiesta,
      pause.dataRitorno,
      uid,
    );
    sameRoleActiveCount = overlapPm + 1;
  } else {
    roleLabel = formatPauseRoleLabelForMessage(guild, PAUSE_ROLE_STAFF, member);
    const rankId = resolvePauseStaffRankRoleId(member, pause);
    if (rankId) {
      const overlap = await computeStaffersInPauseByStaffRankForRange(
        guild,
        guild.id,
        rankId,
        pause.dataRichiesta,
        pause.dataRitorno,
        uid,
        PAUSE_ROLE_STAFF,
      );
      sameRoleActiveCount = overlap + 1;
      const limitKey = getStaffRankLimitKey(rankId);
      const roleLimit = getPauseRoleLimit(limitKey);
      if (roleLimit != null && sameRoleActiveCount > roleLimit) {
        const shown = guild.roles?.cache?.get(rankId)?.name || limitKey;
        roleLimitWarning = `\n\n⚠️ Limite ruolo \`${shown}\` superato (max ${roleLimit} in pausa). Accettata comunque da High Staff.`;
      }
    } else {
      const overlapStaff = await computeStaffersInPauseByRoleForRange(
        guild.id,
        PAUSE_ROLE_STAFF,
        pause.dataRichiesta,
        pause.dataRitorno,
        uid,
      );
      sameRoleActiveCount = overlapStaff + 1;
    }
  }

  return buildAcceptedPauseLogContent({
    roleLabel,
    effectiveUserId: uid,
    pauseTimingText,
    dataRichiesta: pause.dataRichiesta,
    dataRitorno: pause.dataRitorno,
    giorniUsati: used,
    maxGiorni,
    giorniRimanenti,
    sameRoleActiveCount,
    roleLimitWarning,
  });
}

async function getStaffPauseRecord(guildId?, userId?) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u) return null;
  return ActivityUserProfile.findOne({ guildId: g, userId: u });
}

async function getStaffAndPauseByRequestMessageId(guildId?, messageId?) {
  const g = String(guildId ?? "").trim();
  const msgId = String(messageId ?? "").trim();
  if (!g || !msgId) return null;
  const doc = await ActivityUserProfile.findOne({
    guildId: g,
    $or: [{ "staff.pauses.requestMessageId": msgId }, { "staff.pauses.requestMessageIdPm": msgId }],
  });
  if (!doc || !Array.isArray(doc.staff?.pauses)) return null;
  const pause = doc.staff.pauses.find(
    (p?) => String(p?.requestMessageId) === msgId || String(p?.requestMessageIdPm) === msgId,
  );
  return pause ? { stafferRecord: doc, pause } : null;
}

function normalizePauseIdForQuery(pauseId?) {
  if (!pauseId) return null;
  const str = String(pauseId).trim();
  if (!str) return null;
  if (mongoose.Types.ObjectId.isValid(str) && String(new mongoose.Types.ObjectId(str)) === str) {
    return new mongoose.Types.ObjectId(str);
  }
  return str;
}

async function updatePauseInDb(guildId?, userId?, pauseId?, setFields?) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u || !pauseId || !setFields || typeof setFields !== "object") return { ok: false };
  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(setFields)) {
    if (key && value !== undefined) updates[`staff.pauses.$.${key}`] = value;
  }
  if (Object.keys(updates).length === 0) return { ok: true };
  const pauseIdQuery = normalizePauseIdForQuery(pauseId);
  if (!pauseIdQuery) return { ok: false };
  const result = await ActivityUserProfile.updateOne(
    { guildId: g, userId: u, "staff.pauses._id": pauseIdQuery },
    { $set: updates },
  ).catch(() => null);
  return { ok: Boolean(result?.modifiedCount === 1 || result?.matchedCount === 1) };
}

function computeConsumedPauseDays(pauses?) {
  if (!Array.isArray(pauses)) return 0;
  const { yearStart, yearEnd } = getCurrentYearBoundsUtc();
  /* pauseBothSplit1: stessi giorni su Staff+PM non devono contare due volte */
  const ranges = [];

  for (const pause of pauses) {
    if (!pause) continue;
    const start = parseItalianDate(pause.dataRichiesta);
    const plannedEnd = parseItalianDate(pause.dataRitorno);

    if (pause.status === "accepted") {
      if (start && plannedEnd) ranges.push([start.getTime(), plannedEnd.getTime()]);
      continue;
    }

    if (pause.status === "cancelled") {
      let effectiveEnd = null;
      if (pause.cancelledAt) {
        const c = new Date(pause.cancelledAt);
        effectiveEnd = new Date(
          Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate()),
        );
      } else if (start) {
        const consumed = Number(pause.giorniUsati);
        if (Number.isFinite(consumed) && consumed > 0) {
          effectiveEnd = new Date(start.getTime() + (consumed - 1) * MS_PER_DAY);
        }
      }
      if (plannedEnd && effectiveEnd && effectiveEnd > plannedEnd) effectiveEnd = plannedEnd;
      if (start && effectiveEnd) ranges.push([start.getTime(), effectiveEnd.getTime()]);
    }
  }

  if (!ranges.length) return 0;
  ranges.sort((a?, b?) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [s, e] of ranges) {
    if (!merged.length || s > merged[merged.length - 1][1]) {
      merged.push([s, e]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    }
  }
  return merged.reduce(
    (total, [s, e]) => total + countEffectiveOverlapDays(new Date(s), new Date(e), yearStart, yearEnd),
    0,
  );
}

function getMemberRoleLabel(member?) {
  if (!member?.roles?.cache) return "Staff";
  for (const roleId of STAFF_ROLE_PRIORITY) {
    const role = member.roles.cache.get(roleId);
    if (role) return role.name;
  }
  return "Staff";
}

function normalizePauseRoleChoice(raw?) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return null;
  if (value === "staff") return PAUSE_ROLE_STAFF;
  if (value === "pm" || value === "partnermanager" || value === "partner_manager") return PAUSE_ROLE_PM;
  if (value === "entrambi" || value === "both") return PAUSE_ROLE_BOTH;
  return null;
}

function getMemberPauseRoleChoices(member?) {
  const hasStaff = Boolean(member?.roles?.cache?.has(IDs.roles.Staff));
  const hasPm = Boolean(member?.roles?.cache?.has(IDs.roles.PartnerManager));
  if (hasStaff && hasPm) return [PAUSE_ROLE_PM, PAUSE_ROLE_STAFF, PAUSE_ROLE_BOTH];
  if (hasStaff) return [PAUSE_ROLE_STAFF];
  if (hasPm) return [PAUSE_ROLE_PM];
  return [];
}

function getPauseRoleTargets(roleChoice?, member?) {
  const normalized = normalizePauseRoleChoice(roleChoice);
  if (normalized === PAUSE_ROLE_STAFF) return [PAUSE_ROLE_STAFF];
  if (normalized === PAUSE_ROLE_PM) return [PAUSE_ROLE_PM];
  if (normalized === PAUSE_ROLE_BOTH) return [PAUSE_ROLE_STAFF, PAUSE_ROLE_PM];
  const fallback = getMemberPauseRoleChoices(member);
  if (fallback.includes(PAUSE_ROLE_STAFF) && fallback.includes(PAUSE_ROLE_PM)) return [PAUSE_ROLE_STAFF];
  if (fallback.includes(PAUSE_ROLE_STAFF)) return [PAUSE_ROLE_STAFF];
  if (fallback.includes(PAUSE_ROLE_PM)) return [PAUSE_ROLE_PM];
  return [PAUSE_ROLE_STAFF];
}

function roleChoiceAppliesTo(baseRole?, pauseRoleChoice?) {
  const role = normalizePauseRoleChoice(baseRole);
  const pause = normalizePauseRoleChoice(pauseRoleChoice);
  if (!role || !pause) return false;
  if (pause === PAUSE_ROLE_BOTH) return role === PAUSE_ROLE_STAFF || role === PAUSE_ROLE_PM;
  return role === pause;
}

/** pauseBothSplit1: stessa finestra già accettata sull'altro track → non riscalare i giorni */
function hasSiblingAcceptedPauseSameRange(pauses?, targetPause?) {
  const tid = String(targetPause?._id || targetPause?.id || "").trim();
  const start = String(targetPause?.dataRichiesta || "").trim();
  const end = String(targetPause?.dataRitorno || "").trim();
  if (!start || !end) return false;
  return (Array.isArray(pauses) ? pauses : []).some((p?) => {
    if (!p || String(p.status || "") !== "accepted") return false;
    if (tid && String(p._id || "") === tid) return false;
    return String(p.dataRichiesta || "").trim() === start && String(p.dataRitorno || "").trim() === end;
  });
}

function getPauseRoleLimit(roleLabel?) {
  if (!roleLabel || typeof roleLabel !== "string") return null;
  const key = roleLabel.trim();
  if (Object.prototype.hasOwnProperty.call(PAUSE_ROLE_LIMITS, key))
    return PAUSE_ROLE_LIMITS[key];
  return null;
}

function getRomeMonthKey(date?) {
  if (!date || !date.getTime) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p?) => p.type === "year")?.value;
  const month = parts.find((p?) => p.type === "month")?.value;
  if (!year || !month) return null;
  return { year: Number(year), month: Number(month) };
}

function getRomeDateParts(date?) {
  if (!date || !date.getTime) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p?) => p.type === "year")?.value;
  const month = parts.find((p?) => p.type === "month")?.value;
  const day = parts.find((p?) => p.type === "day")?.value;
  if (!year || !month || !day) return null;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

function getMonthKeyForPauseCount(dataRichiesta?, dataRitorno?) {
  const start = parseItalianDate(dataRichiesta);
  const end = parseItalianDate(dataRitorno);
  if (!start || !end) return null;
  const startKey = getRomeMonthKey(start);
  const endKey = getRomeMonthKey(end);
  if (!startKey || !endKey) return null;
  if (startKey.year === endKey.year && startKey.month === endKey.month) return startKey;
  const endParts = getRomeDateParts(end);
  if (!endParts) return startKey;
  if (endParts.day <= 5) return startKey;
  return endKey;
}

function getOnePausePerMonthWarning(staffDoc?, normalized?) {
  const pauses = Array.isArray(staffDoc?.staff?.pauses) ? staffDoc.staff.pauses : [];
  const newCountKey = getMonthKeyForPauseCount(normalized?.dataRichiesta, normalized?.dataRitorno);
  if (!newCountKey) return null;
  const excludeIds = new Set();
  if (normalized?.excludePauseId) excludeIds.add(String(normalized.excludePauseId));
  if (Array.isArray(normalized?.excludePauseIds)) {
    for (const id of normalized.excludePauseIds) {
      if (id != null && String(id)) excludeIds.add(String(id));
    }
  }
  const countSameMonth = pauses.filter((p?) => {
    if (!p || p.status === "rejected") return false;
    if (excludeIds.has(String(p._id))) return false;
    const k = getMonthKeyForPauseCount(p.dataRichiesta, p.dataRitorno);
    return k && k.year === newCountKey.year && k.month === newCountKey.month;
  }).length;
  if (countSameMonth >= 1) return "<:VC_Attention:1482534443632558151> Hai già una richiesta pausa in questo mese. L’High Staff può accettare comunque.";
  return null;
}

function getOneWeekBetweenWarning(staffDoc?, excludePauseId = null) {
  const pauses = Array.isArray(staffDoc?.staff?.pauses) ? staffDoc.staff.pauses : [];
  const excludeIds = new Set();
  if (excludePauseId != null && String(excludePauseId)) excludeIds.add(String(excludePauseId));
  if (Array.isArray(excludePauseId)) {
    for (const id of excludePauseId) {
      if (id != null && String(id)) excludeIds.add(String(id));
    }
  }
  const withDate = pauses
    .filter((p?) => p && (p.createdAt || p._id) && !excludeIds.has(String(p._id)))
    .map((p?) => ({ ...p, at: p.createdAt ? new Date(p.createdAt).getTime() : 0 }))
    .filter((p?) => p.at > 0)
    .sort((a?, b?) => b.at - a.at);
  const last = withDate[0];
  if (!last) return null;
  const weekAgo = Date.now() - 7 * MS_PER_DAY;
  if (last.at > weekAgo) return "<:VC_Attention:1482534443632558151> Meno di 1 settimana dall’ultima richiesta. L’High Staff può accettare comunque.";
  return null;
}

function getSpanTwoMonthsFiveDaysWarning(normalized?) {
  if (!normalized?.dataRichiesta || !normalized?.dataRitorno) return null;
  const start = parseItalianDate(normalized.dataRichiesta);
  const end = parseItalianDate(normalized.dataRitorno);
  if (!start || !end) return null;
  const startKey = getRomeMonthKey(start);
  const endKey = getRomeMonthKey(end);
  if (!startKey || !endKey) return null;
  if (startKey.year === endKey.year && startKey.month === endKey.month) return null;
  const endDay = end.getUTCDate();
  if (endDay > 5) return "<:VC_Attention:1482534443632558151> La pausa copre due mesi: il ritorno non dovrebbe superare il 5° giorno dell’altro mese. L’High Staff può accettare comunque.";
  return null;
}

function getBasePauseLimit(member?, requestedRole = null) {
  const targets = getPauseRoleTargets(requestedRole, member);
  const values = targets.map((t?) => (t === PAUSE_ROLE_PM ? 45 : 60));
  return values.length ? Math.max(...values) : 60;
}

function getPauseStatusLabel(pause?, todayUtc?) {
  if (!pause) return "Sconosciuto";
  if (pause.status === "cancelled") return "Annullata";
  if (pause.status === "pending") return "Richiesta";
  if (pause.status === "rejected") return "Rifiutata";
  if (pause.status !== "accepted") return pause.status;

  const start = parseItalianDate(pause.dataRichiesta);
  const end = parseItalianDate(pause.dataRitorno);
  if (!start || !end) return "Accettata";
  if (todayUtc < start) return "Programmata";
  if (todayUtc > end) return "Finita";
  return "In corso";
}

function getPauseTimingText(startRaw?, endRaw?) {
  const start = parseItalianDate(startRaw);
  const end = parseItalianDate(endRaw);
  const today = getTodayUtc();
  if (!start || !end) return "è in pausa";
  if (today < start) return "andrà in pausa";
  if (today > end) return "era in pausa";
  return "è in pausa";
}

function computePauseScaledDaysThisYear(pause?, todayUtc?, yearStart?, yearEnd?) {
  const start = parseItalianDate(pause?.dataRichiesta);
  const plannedEnd = parseItalianDate(pause?.dataRitorno);
  if (!start || !plannedEnd) return 0;

  if (pause.status === "cancelled") {
    let effectiveEnd = null;
    if (pause.cancelledAt) {
      const c = new Date(pause.cancelledAt);
      effectiveEnd = new Date(
        Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate()),
      );
    } else {
      const consumed = Number(pause.giorniUsati);
      if (Number.isFinite(consumed) && consumed > 0) {
        effectiveEnd = new Date(start.getTime() + (consumed - 1) * MS_PER_DAY);
      }
    }
    if (plannedEnd && effectiveEnd && effectiveEnd > plannedEnd)
      effectiveEnd = plannedEnd;
    return countEffectiveOverlapDays(start, effectiveEnd, yearStart, yearEnd);
  }

  if (pause.status === "accepted") {
    if (todayUtc < start) return 0;
    const effectiveEnd = todayUtc > plannedEnd ? plannedEnd : todayUtc;
    return countEffectiveOverlapDays(start, effectiveEnd, yearStart, yearEnd);
  }

  return 0;
}

function buildRequestButtonsRow(userId?, pauseId?, disabled = false) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pause_accept:${userId}:${pauseId}`)
      .setEmoji(`<:vegacheckmark:1443666279058772028>`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`pause_reject:${userId}:${pauseId}`)
      .setEmoji(`<:vegax:1443934876440068179>`)
      .setStyle(ButtonStyle.Danger),
  );
  if (disabled) row.components.forEach((c?: any) => c.setDisabled(true));
  return row;
}

function buildAcceptedButtonsRow(userId?, pauseId?, options: Record<string, any> = {}) {
  const { hideCancel = false, disableCancel = false } = options;
  const components = [];
  if (!hideCancel) {
    components.push(
      new ButtonBuilder()
        .setCustomId(`pause_cancel:${userId}:${pauseId}`)
        .setLabel("Annulla")
        .setEmoji(`<:vegax:1443934876440068179>`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disableCancel),
    );
  }
  components.push(
    new ButtonBuilder()
      .setCustomId(`pause_list:${userId}:${pauseId}`)
      .setEmoji(`<:customprofile:1443925456972808304>`)
      .setLabel("Lista pause")
      .setStyle(ButtonStyle.Secondary),
  );
  return new ActionRowBuilder().addComponents(components);
}

async function getPauseReasonFromMessage(client?, pause?) {
  const channelId = pause?.requestChannelId;
  const messageId = pause?.requestMessageId;
  if (!channelId || !messageId || !client) return null;
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return null;
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    const content = String(msg?.content ?? "");
    const prefix = "Motivo: ";
    const idx = content.indexOf(prefix);
    if (idx === -1) return null;
    const raw = content.slice(idx + prefix.length).trim();
    return raw ? raw.slice(0, 800) : null;
  } catch {
    return null;
  }
}

function schedulePauseButtonsRemoval(guild?, channelId?, messageId?, pauseStartRaw?, pauseEndRaw?, userId?, pauseId?, requestMessageIdPm = null) {
  if (!guild || !channelId || !messageId || !userId || !pauseId) return;
  const pmId = String(requestMessageIdPm ?? "").trim() || null;
  const pause = {
    _id: pauseId,
    dataRichiesta: pauseStartRaw,
    dataRitorno: pauseEndRaw,
    requestChannelId: channelId,
    requestMessageId: messageId,
    requestMessageIdPm: pmId,
    status: "accepted",
  };
  schedulePauseStatusRefresh(guild, String(userId), pause);
}

function normalizePauseStatusPhrase(content?, targetPhrase?) {
  const raw = String(content || "");
  if (!raw) return raw;
  const target = String(targetPhrase || "");
  const esc = (value?) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return raw
    .replace(new RegExp(esc("è stata in pausa"), "gi"), target)
    .replace(new RegExp(esc("è stato in pausa"), "gi"), target)
    .replace(new RegExp(esc("sarà in pausa"), "gi"), target)
    .replace(new RegExp(esc("andrà in pausa"), "gi"), target)
    .replace(new RegExp(esc("avrà pausa"), "gi"), target)
    .replace(new RegExp(esc("era in pausa"), "gi"), target)
    .replace(new RegExp(esc("è in pausa"), "gi"), target);
}

function getPausePhase(startRaw?, endRaw?, atDate?) {
  const start = parseItalianDate(startRaw);
  const end = parseItalianDate(endRaw);
  const today = atDate instanceof Date ? atDate : getTodayUtc();
  if (!start || !end) return "active";
  if (today < start) return "planned";
  if (today > end) return "ended";
  return "active";
}

function hasActiveAcceptedStaffPause(pauses?, atDate?) {
  if (!Array.isArray(pauses)) return false;
  const today = atDate instanceof Date ? atDate : getTodayUtc();
  return pauses.some((pause?) => {
    if (!pause || pause.status !== "accepted") return false;
    return getPausePhase(pause.dataRichiesta, pause.dataRitorno, today) === "active";
  });
}

async function applyAcceptedPausePhaseToDiscordMessage(channel?, messageId?, userId?, pauseId?, phase?, withControls?, rebuiltContent = null) {
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (!msg) return false;
  const currentContent = String(msg.content || "");
  const phrase =
    phase === "planned" ? "andrà in pausa" : phase === "active" ? "è in pausa" : "era in pausa";
  let nextContent = rebuiltContent
    ? normalizePauseStatusPhrase(String(rebuiltContent), phrase)
    : normalizePauseStatusPhrase(currentContent, phrase);
  let nextComponents = [];
  if (withControls) {
    if (phase === "ended") nextComponents = [];
    else nextComponents = [buildAcceptedButtonsRow(userId, pauseId, { hideCancel: false, disableCancel: phase === "ended" })];
  } else {
    nextComponents = [];
  }
  const sameContent = nextContent === currentContent;
  const hasComponentsNow = Array.isArray(msg.components) && msg.components.length > 0;
  const hasComponentsNext = Array.isArray(nextComponents) && nextComponents.length > 0;
  if (sameContent && hasComponentsNow === hasComponentsNext) return true;
  const edited = await msg.edit({ content: nextContent, components: nextComponents }).catch((err?) => {
    global.logger?.warn?.("[PAUSE] sync edit failed:", String(messageId || ""), err?.message || err);
    return null;
  });
  return Boolean(edited);
}

async function syncAcceptedPauseMessagePhaseOnly(guild?, userId?, pause?) {
  const channelId = String(pause?.requestChannelId || IDs.channels?.pause || "").trim();
  const messageId = String(pause?.requestMessageId || "").trim();
  const messageIdPm = String(pause?.requestMessageIdPm || "").trim();
  const pauseId = String(pause?._id || "").trim();
  if (!guild || !channelId || !messageId || !pauseId) return false;
  const phase = getPausePhase(pause?.dataRichiesta, pause?.dataRitorno);
  const channel = await getGuildChannelCached(guild, channelId);
  if (!channel?.isTextBased?.()) return false;
  let ok = await applyAcceptedPausePhaseToDiscordMessage(channel, messageId, userId, pauseId, phase, true, null);
  if (messageIdPm) {
    ok =
      (await applyAcceptedPausePhaseToDiscordMessage(channel, messageIdPm, userId, pauseId, phase, true, null)) || ok;
  }
  return ok;
}

async function syncSingleAcceptedPauseMessage(guild?, userId?, pause?) {
  const channelId = String(pause?.requestChannelId || IDs.channels?.pause || "").trim();
  const messageId = String(pause?.requestMessageId || "").trim();
  const messageIdPm = String(pause?.requestMessageIdPm || "").trim();
  const pauseId = String(pause?._id || "").trim();
  if (!guild || !channelId || !messageId || !pauseId) {
    if (!channelId || !messageId) {
      global.logger?.warn?.("[PAUSE] sync skip: missing refs", { userId, channelId: channelId || null, messageId: messageId || null, pauseId: pauseId || null });
    }
    return false;
  }
  const phase = getPausePhase(pause?.dataRichiesta, pause?.dataRitorno);
  const channel = await getGuildChannelCached(guild, channelId);
  if (!channel?.isTextBased?.()) {
    global.logger?.warn?.("[PAUSE] sync skip: channel unavailable", channelId);
    return false;
  }

  let member = guild.members?.cache?.get(String(userId)) || null;
  if (guild.members?.fetch) {
    member = await guild.members.fetch({ user: String(userId), force: true }).catch(() => member);
  }
  const liveRankId = getMemberStaffRankRoleId(member);
  if (liveRankId && String(pause?.ruoloGradeId || "").trim() !== liveRankId) {
    await updatePauseInDb(guild.id, userId, pauseId, { ruoloGradeId: liveRankId });
    pause.ruoloGradeId = liveRankId;
  }

  const roleChoice = normalizePauseRoleChoice(pause.ruolo || pause.ruoloRichiesto) || PAUSE_ROLE_STAFF;
  const primaryIsPm = roleChoice === PAUSE_ROLE_PM;
  const primaryContent = await buildAcceptedPauseMessageContent(guild, userId, pause, { forPm: primaryIsPm });
  const pmContent = messageIdPm
    ? await buildAcceptedPauseMessageContent(guild, userId, pause, { forPm: true })
    : null;

  let ok = false;
  ok = (await applyAcceptedPausePhaseToDiscordMessage(channel, messageId, userId, pauseId, phase, true, primaryContent)) || ok;
  if (messageIdPm) {
    ok = (await applyAcceptedPausePhaseToDiscordMessage(channel, messageIdPm, userId, pauseId, phase, true, pmContent)) || ok;
  }
  const countMatch = String(primaryContent || "").match(/__`(\d+)`__ staffer in pausa/);
  if (countMatch) {
    const nextCount = Number(countMatch[1]);
    if (Number.isFinite(nextCount) && nextCount !== Number(pause.stafferInPausa)) {
      await updatePauseInDb(guild.id, userId, pauseId, { stafferInPausa: nextCount });
      pause.stafferInPausa = nextCount;
    }
  }
  return ok;
}

async function scheduleAcceptedPauseMessagesRefreshAfterRankChange(guild?, userId?) {
  const guildId = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!guildId || !uid || !guild?.client) return;
  const inAcceptedPause = await ActivityUserProfile.exists({
    guildId,
    userId: uid,
    "staff.pauses": { $elemMatch: { status: "accepted" } },
  }).catch(() => null);
  if (!inAcceptedPause) return;
  const prev = pauseRankChangeSyncTimers.get(guildId);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    pauseRankChangeSyncTimers.delete(guildId);
    restorePauseMessageStatusSync(guild.client).catch((err?) => {
      global.logger?.warn?.("[PAUSE] rank-change pause message sync failed:", err?.message || err);
    });
  }, 2500);
  if (typeof timer?.unref === "function") timer.unref();
  pauseRankChangeSyncTimers.set(guildId, timer);
}

function scheduleDelayedCallback(runAtMs?, callback?) {
  const delayMs = runAtMs - Date.now();
  if (delayMs <= 0) {
    callback();
    return;
  }
  const waitMs = Math.min(delayMs, MAX_SET_TIMEOUT_MS);
  const timer = setTimeout(() => {
    if (Date.now() < runAtMs) {
      scheduleDelayedCallback(runAtMs, callback);
      return;
    }
    callback();
  }, waitMs);
  if (typeof timer?.unref === "function") timer.unref();
}

function pauseStatusRefreshKey(guildId?, userId?, pauseId?) {
  return `${String(guildId || "").trim()}:${String(userId || "").trim()}:${String(pauseId || "").trim()}`;
}

function schedulePauseStatusRefresh(guild?, userId?, pause?) {
  const start = parseItalianDate(pause?.dataRichiesta);
  const end = parseItalianDate(pause?.dataRitorno);
  const pauseId = String(pause?._id || "").trim();
  if (!guild || !pause || !start || !end || !pauseId) return;
  const key = pauseStatusRefreshKey(guild.id, userId, pauseId);
  const flags = pauseStatusRefreshScheduled.get(key) || { start: false, end: false };
  const runPhaseSync = () => {
        syncAcceptedPauseMessagePhaseOnly(guild, userId, pause).catch(() => null);
    try {
      const { scheduleStaffListRefresh } = require("../Community/staffListUtils") as typeof import("../Community/staffListUtils");
      scheduleStaffListRefresh(guild.client, guild.id, 800);
    } catch {
          }
  };
      const startAt = getRomeDayStartUtcMs(start) ?? start.getTime();
  const dayAfterEnd = new Date(end.getTime() + MS_PER_DAY);
  const endAt = getRomeDayStartUtcMs(dayAfterEnd) ?? dayAfterEnd.getTime();
  const now = Date.now();
  const phase = getPausePhase(pause?.dataRichiesta, pause?.dataRitorno);

  if (!flags.start) {
    flags.start = true;
    if (now < startAt) {
      scheduleDelayedCallback(startAt, runPhaseSync);
    }
  }
  if (!flags.end) {
    flags.end = true;
    if (now < endAt) {
      scheduleDelayedCallback(endAt, runPhaseSync);
    }
  }
  pauseStatusRefreshScheduled.set(key, flags);

      if (phase === "ended" && now >= endAt) {
    runPhaseSync();
  }
}

function pauseHistoryImpliesBestStaffBonusForYear(pauses?, year?) {
  if (!Number.isFinite(year)) return false;
  if (!Array.isArray(pauses)) return false;
  for (const p of pauses) {
    if (!p || (p.status !== "accepted" && p.status !== "cancelled")) continue;
    if (Number(p.giorniAggiuntivi) < 5) continue;
    const start = parseItalianDate(p.dataRichiesta);
    if (start && start.getUTCFullYear() === year) return true;
    if (p.createdAt) {
      const c = new Date(p.createdAt);
      if (Number.isFinite(c.getTime()) && c.getUTCFullYear() === year) return true;
    }
  }
  return false;
}

function getBestStaffPauseBonusDays(member?, staffDoc?) {
  const roleId = String(IDs.roles?.StafferDelMese || "").trim();
  if (roleId && member?.roles?.cache?.has(roleId)) return 5;
  const y = getTodayUtc().getUTCFullYear();
  const years = Array.isArray(staffDoc?.staff?.bestStaffPauseBonusYears)
    ? staffDoc.staff.bestStaffPauseBonusYears
    : [];
  if (years.includes(y)) return 5;
  const pauses = Array.isArray(staffDoc?.staff?.pauses) ? staffDoc.staff.pauses : [];
  return pauseHistoryImpliesBestStaffBonusForYear(pauses, y) ? 5 : 0;
}

function getValPosTradedPauseBonusDays(staffDoc?) {
  const n = Number(staffDoc?.staff?.valPosTradedPauseBonusDays ?? staffDoc?.valPosTradedPauseBonusDays ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

async function grantBestStaffPauseBonusYear(guildId?, userId?, year = null) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!isValidGuildUserId(g, u)) return;
  const y = year == null ? getTodayUtc().getUTCFullYear() : Number(year);
  if (!Number.isFinite(y)) return;
  await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    { $setOnInsert: { guildId: g, userId: u }, $addToSet: { "staff.bestStaffPauseBonusYears": y } },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

function getStaffWeekKeyNow(now = new Date()) {
  const { getStaffWeekKeyNow: resolveWeekKey } = require("../Staff/stafferDellaSettimanaWeekKey") as typeof import("../Staff/stafferDellaSettimanaWeekKey");
  return resolveWeekKey(now);
}

function formatRomeMonthKey(date = new Date()) {
  const { formatRomeMonthKey: fmt } = require("../Staff/stafferDellaSettimanaWeekKey") as typeof import("../Staff/stafferDellaSettimanaWeekKey");
  return fmt(date);
}

function coerceMonthKey(raw?) {
  const { coerceMonthKey: coerce } = require("../Staff/stafferDellaSettimanaWeekKey") as typeof import("../Staff/stafferDellaSettimanaWeekKey");
  return coerce(raw);
}

function resolveStafferBonusMonthKey(opts: Record<string, any> = {}) {
  const { resolveStafferBonusMonthKey: resolve } = require("../Staff/stafferDellaSettimanaWeekKey") as typeof import("../Staff/stafferDellaSettimanaWeekKey");
  return resolve(opts);
}

function grantEntryMonthKey(grant?) {
  const mk = coerceMonthKey(grant?.monthKey);
  if (mk) return mk;
  const { monthKeyForStaffWeekKey } = require("../Staff/stafferDellaSettimanaWeekKey") as typeof import("../Staff/stafferDellaSettimanaWeekKey");
  return monthKeyForStaffWeekKey(grant?.weekKey) || "";
}

function listBestStaffWeekPauseGrants(staffDoc?) {
  const raw =
    staffDoc?.staff?.bestStaffWeekPauseBonusWeeks ?? staffDoc?.bestStaffWeekPauseBonusWeeks;
  return Array.isArray(raw) ? raw : [];
}

function getBestStaffWeekPauseBonusGrantedForMonth(
  staffDoc?,
  monthKey = resolveStafferBonusMonthKey({ weekKey: getStaffWeekKeyNow() }),
) {
  const mk = coerceMonthKey(monthKey) || resolveStafferBonusMonthKey({ weekKey: getStaffWeekKeyNow() });
  if (!mk) return 0;
  let total = 0;
  for (const g of listBestStaffWeekPauseGrants(staffDoc)) {
    if (grantEntryMonthKey(g) !== mk) continue;
    const days = Number(g?.days);
    total += Number.isFinite(days) && days > 0 ? Math.floor(days) : 1;
  }
  return total;
}

function computeWeekBonusDaysConsumed(pauses?, monthKey = null) {
  if (!Array.isArray(pauses)) return 0;
  const mk = monthKey == null ? null : coerceMonthKey(monthKey) || String(monthKey || "").trim();
  const { yearStart, yearEnd } = getCurrentYearBoundsUtc();
  let total = 0;
  for (const pause of pauses) {
    if (!pause || (pause.status !== "accepted" && pause.status !== "cancelled")) continue;
    const n = Math.max(0, Math.floor(Number(pause.giorniAggiuntiviSettimana) || 0));
    if (!n) continue;
    const start = parseItalianDate(pause.dataRichiesta);
    if (!start) continue;
    if (start < yearStart || start > yearEnd) continue;
    if (mk) {
      const { monthKeyForRomeDateViaIsoWeek } = require("../Staff/stafferDellaSettimanaWeekKey") as typeof import("../Staff/stafferDellaSettimanaWeekKey");
      if (monthKeyForRomeDateViaIsoWeek(start) !== mk) continue;
    }
    total += n;
  }
  return total;
}

function getBestStaffWeekPauseBonusDaysRemaining(
  staffDoc?,
  monthKey = resolveStafferBonusMonthKey({ weekKey: getStaffWeekKeyNow() }),
) {
  const mk =
    coerceMonthKey(monthKey) || resolveStafferBonusMonthKey({ weekKey: getStaffWeekKeyNow() });
  const granted = getBestStaffWeekPauseBonusGrantedForMonth(staffDoc, mk);
  const spent = computeWeekBonusDaysConsumed(
    Array.isArray(staffDoc?.staff?.pauses) ? staffDoc.staff.pauses : staffDoc?.pauses,
    mk,
  );
  return Math.max(0, granted - spent);
}

function allocateBestStaffWeekPauseBonusDays(staffDoc?, giorniRichiesti?) {
  const need = Math.max(0, Math.floor(Number(giorniRichiesti) || 0));
  if (!need) return 0;
  return Math.min(getBestStaffWeekPauseBonusDaysRemaining(staffDoc), need);
}

function computeStaffPauseDayBudget(member?, staffDoc?, roleChoice?) {
  const baseLimit = getBasePauseLimit(member, roleChoice);
  const annualBonus =
    getBestStaffPauseBonusDays(member, staffDoc) + getValPosTradedPauseBonusDays(staffDoc);
  const weekRemaining = getBestStaffWeekPauseBonusDaysRemaining(staffDoc);
  const pauses = Array.isArray(staffDoc?.staff?.pauses)
    ? staffDoc.staff.pauses
    : Array.isArray(staffDoc?.pauses)
      ? staffDoc.pauses
      : [];
  const usedRaw = computeConsumedPauseDays(pauses);
  const weekConsumedYear = computeWeekBonusDaysConsumed(pauses, null);
  const usedDays = Math.max(0, usedRaw - weekConsumedYear);
  const maxGiorni = baseLimit + annualBonus + weekRemaining;
  return {
    baseLimit,
    annualBonus,
    weekRemaining,
    usedRaw,
    usedDays,
    maxGiorni,
    remaining: maxGiorni - usedDays,
  };
}

function getStaffPauseBonusDaysTotal(member?, staffDoc?) {
  return (
    getBestStaffPauseBonusDays(member, staffDoc) +
    getValPosTradedPauseBonusDays(staffDoc) +
    getBestStaffWeekPauseBonusDaysRemaining(staffDoc)
  );
}

async function grantBestStaffWeekPauseBonus(guildId?, userId?, options: Record<string, any> = {}) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!isValidGuildUserId(g, u)) return { ok: false, reason: "bad_ids" };
  const weekKey = String(options.weekKey || getStaffWeekKeyNow()).trim();
  /* stafferMonthBridge1: mese = giovedì della weekKey (non calendario del grant). */
  const monthKey = resolveStafferBonusMonthKey({
    weekKey,
    monthKey: options.monthKey,
  });
  if (!weekKey || !monthKey) return { ok: false, reason: "bad_keys" };

  const entry = {
    weekKey,
    monthKey,
    days: 1,
    grantedAt: new Date(),
  };

  // Atomic: push solo se weekKey non è già in array (anti double-grant memberUpdate+audit).
  let result;
  try {
    result = await ActivityUserProfile.updateOne(
      {
        guildId: g,
        userId: u,
        "staff.bestStaffWeekPauseBonusWeeks": {
          $not: { $elemMatch: { weekKey } },
        },
      },
      {
        $setOnInsert: { guildId: g, userId: u },
        $push: { "staff.bestStaffWeekPauseBonusWeeks": entry },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    // Race su upsert unico guildId+userId: rileggi, non fingere successo.
    const after = await ActivityUserProfile.findOne(
      { guildId: g, userId: u },
      { "staff.bestStaffWeekPauseBonusWeeks": 1 },
    )
      .lean()
      .catch(() => null);
    if (
      listBestStaffWeekPauseGrants(after || {}).some(
        (row?) => String(row?.weekKey || "").trim() === weekKey,
      )
    ) {
      return { ok: true, already: true, weekKey, monthKey };
    }
    global.logger?.warn?.(
      "[PAUSE] grantBestStaffWeekPauseBonus failed",
      err?.message || err,
    );
    return { ok: false, reason: "db_error", weekKey, monthKey };
  }

  if (result.modifiedCount > 0 || result.upsertedCount > 0) {
    return { ok: true, already: false, weekKey, monthKey };
  }
  return { ok: true, already: true, weekKey, monthKey };
}

async function restorePauseMessageStatusSync(client?) {
  const guildId = String(IDs.guilds?.main || client?.guilds?.cache?.first?.()?.id || "").trim();
  if (!guildId) return { ok: false, reason: "no_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  const docs = await ActivityUserProfile.find(
    { guildId, "staff.pauses.status": "accepted" },
    { userId: 1, "staff.pauses": 1 },
  )
    .lean()
    .catch(() => []);
  let synced = 0;
  let examined = 0;
  for (const doc of docs) {
    const userId = String(doc?.userId || "").trim();
    if (!userId) continue;
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    for (const pause of pauses) {
      if (!pause || pause.status !== "accepted") continue;
      examined += 1;
      if (await syncAcceptedPauseMessagePhaseOnly(guild, userId, pause)) synced += 1;
      schedulePauseStatusRefresh(guild, userId, pause);
    }
  }
  return { ok: true, examined, synced };
}

async function scheduleAcceptedPauseStatusTimersOnly(client?) {
  const guildId = String(IDs.guilds?.main || client?.guilds?.cache?.first?.()?.id || "").trim();
  if (!guildId) return { ok: false, reason: "no_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  const docs = await ActivityUserProfile.find(
    { guildId, "staff.pauses.status": "accepted" },
    { userId: 1, "staff.pauses": 1 },
  )
    .lean()
    .catch(() => []);
  let scheduled = 0;
  for (const doc of docs) {
    const userId = String(doc?.userId || "").trim();
    if (!userId) continue;
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    for (const pause of pauses) {
      if (!pause || pause.status !== "accepted") continue;
      schedulePauseStatusRefresh(guild, userId, pause);
      scheduled += 1;
    }
  }
  return { ok: true, scheduled };
}

function computeConsumedDaysForCancelledPause(pause?) {
  const todayUtc = getTodayUtc();
  const start = parseItalianDate(pause?.dataRichiesta);
  const end = parseItalianDate(pause?.dataRitorno);
  const totalScheduledDays = getPauseDaysBetween(pause?.dataRichiesta, pause?.dataRitorno) || 0;
  if (!start || !end) return 0;
  if (todayUtc < start) return 0;
  if (todayUtc > end) return totalScheduledDays;
  return Math.max(1, Math.floor(((todayUtc as any) - (start as any)) / MS_PER_DAY) + 1);
}

async function cancelOpenPausesOnMemberLeave(guild?, userId?, options: Record<string, any> = {}) {
  const guildId = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!guildId || !uid) return { cancelled: 0 };
  const stafferRecord = await getStaffPauseRecord(guildId, uid);
  if (!stafferRecord) return { cancelled: 0 };
  const pauses = Array.isArray(stafferRecord.staff?.pauses) ? stafferRecord.staff.pauses : [];
  if (!pauses.length) return { cancelled: 0 };

  let cancelled = 0;

  async function deletePauseDiscordMessages(pause?) {
    const channelId = String(pause?.requestChannelId || IDs.channels?.pause || "").trim();
    const channel = channelId ? await getGuildChannelCached(guild, channelId) : null;
    if (!channel?.isTextBased?.()) return;
    const messageIds = [pause?.requestMessageId, pause?.requestMessageIdPm]
      .map((id?) => String(id || "").trim())
      .filter(Boolean);
    for (const mid of messageIds) {
      const msg = await channel.messages.fetch(mid).catch(() => null);
      if (msg) await msg.delete().catch(() => null);
    }
    const threadId = String(pause?.requestThreadId || "").trim();
    if (threadId) {
      let thread = await guild.channels.fetch(threadId).catch(() => null);
      if (!thread && guild.client) thread = await guild.client.channels.fetch(threadId).catch(() => null);
      if (thread?.isThread?.()) await thread.delete().catch(() => null);
    }
  }

  for (const pause of pauses) {
    const status = String(pause?.status || "");
    const pauseId = String(pause?._id || "").trim();
    if (!pauseId) continue;

    if (status === "pending") {
      await updatePauseInDb(guildId, uid, pauseId, { status: "cancelled", cancelledAt: new Date() });
      pause.status = "cancelled";
      pause.cancelledAt = new Date();
      cancelled += 1;
      try {
        const { updateStaffWorkflowFromPause } = require("../Web/siteStaffWorkflowStore") as typeof import("../Web/siteStaffWorkflowStore");
        await updateStaffWorkflowFromPause(guildId, uid, pauseId, "cancelled", {
          statusLabel: String(options.reason || "Annullato (uscita)").slice(0, 200),
          staffReason: String(options.reason || "Annullato (uscita)").slice(0, 200),
          decidedBy: "system",
        });
      } catch (_) {}
      await deletePauseDiscordMessages(pause);
      continue;
    }

    if (status !== "accepted") continue;
    if (getPausePhase(pause.dataRichiesta, pause.dataRitorno) === "ended") continue;

    const consumed = computeConsumedDaysForCancelledPause(pause);
    await updatePauseInDb(guildId, uid, pauseId, {
      status: "cancelled",
      giorniUsati: consumed,
      cancelledAt: new Date(),
    });
    pause.status = "cancelled";
    pause.giorniUsati = consumed;
    pause.cancelledAt = new Date();
    cancelled += 1;
    await deletePauseDiscordMessages(pause);
  }

  if (cancelled > 0) {
    try {
      const { scheduleStaffListRefresh } = require("../Community/staffListUtils") as typeof import("../Community/staffListUtils");
      scheduleStaffListRefresh(guild.client || options.client, guildId, 800);
    } catch {
    }
    try {
      const { broadcastSiteStaffPausesChanged } = require("../Web/siteSuggestionsBroadcast") as typeof import("../Web/siteSuggestionsBroadcast");
      broadcastSiteStaffPausesChanged();
    } catch {
    }
    /* staffProfLiveAll1 */
    try {
      if (/^\d{16,22}$/.test(uid)) {
        require("../Web/siteStaffProfileApi").clearStaffProfileCacheForUser(uid, { action: "pause" });
      }
    } catch {
    }
  }
  return { cancelled };
}

function cancelledPauseMessageLooksStale(content?) {
  const text = String(content || "");
  if (!text) return false;
  if (/aveva una pausa \*\*annullata\*\*/i.test(text)) return false;
    if (/ANNULLATA/i.test(text) && /(è in pausa|andrà in pausa|era in pausa)/i.test(text)) return true;
  if (/ANNULLATA/i.test(text) && /Limite ruolo/i.test(text)) return true;
  return false;
}

async function applyCancelledPauseContentToMessage(channel?, messageId?, content?, userId?, pauseId?) {
  const msg = await channel.messages.fetch(String(messageId)).catch(() => null);
  if (!msg) return false;
  if (!cancelledPauseMessageLooksStale(msg.content) && String(msg.content || "") === String(content || "")) {
    return false;
  }
  if (!cancelledPauseMessageLooksStale(msg.content) && /aveva una pausa \*\*annullata\*\*/i.test(String(msg.content || ""))) {
    return false;
  }
  const components = [buildAcceptedButtonsRow(userId, pauseId, { hideCancel: true })];
  const edited = await msg.edit({ content, components }).catch((err?) => {
    global.logger?.warn?.("[PAUSE] cancelled message rewrite failed:", String(messageId), err?.message || err);
    return null;
  });
  return Boolean(edited);
}

async function rewriteStaleCancelledPauseMessages(client?) {
  const guildId = String(IDs.guilds?.main || client?.guilds?.cache?.first?.()?.id || "").trim();
  if (!guildId) return { ok: false, reason: "no_guild", rewritten: 0 };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found", rewritten: 0 };

  const docs = await ActivityUserProfile.find(
    { guildId, "staff.pauses.status": "cancelled" },
    { userId: 1, staff: 1 },
  )
    .lean()
    .catch(() => []);

  let examined = 0;
  let rewritten = 0;
  for (const doc of docs) {
    const userId = String(doc?.userId || "").trim();
    if (!userId) continue;
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    let member = guild.members?.cache?.get(userId) || null;
    if (!member && guild.members?.fetch) {
      member = await guild.members.fetch({ user: userId }).catch(() => null);
    }
    for (const pause of pauses) {
      if (!pause || pause.status !== "cancelled") continue;
      const pauseId = String(pause._id || "").trim();
      const channelId = String(pause.requestChannelId || IDs.channels?.pause || "").trim();
      const messageId = String(pause.requestMessageId || "").trim();
      const messageIdPm = String(pause.requestMessageIdPm || "").trim();
      if (!pauseId || !channelId || !messageId) continue;
      examined += 1;

      const channel = await getGuildChannelCached(guild, channelId);
      if (!channel?.isTextBased?.()) continue;

      const roleChoice = normalizePauseRoleChoice(pause.ruolo || pause.ruoloRichiesto) || PAUSE_ROLE_STAFF;
      const baseLimit = getBasePauseLimit(member, roleChoice);
      const bonusPause = member
        ? getStaffPauseBonusDaysTotal(member, doc)
        : getValPosTradedPauseBonusDays(doc);
      const maxGiorni = baseLimit + bonusPause;
      const giorniTotaliUsati = computeConsumedPauseDays(doc?.staff?.pauses);
      const giorniRimanenti = Math.max(0, maxGiorni - giorniTotaliUsati);
      const giorniScalati = Number.isFinite(Number(pause.giorniUsati))
        ? Math.max(0, Number(pause.giorniUsati))
        : computeConsumedDaysForCancelledPause(pause);

      const roleLabel = formatPauseRoleLabelForMessage(
        guild,
        roleChoice === PAUSE_ROLE_BOTH ? PAUSE_ROLE_STAFF : roleChoice,
        member,
      );
      const staffContent = buildCancelledPauseLogContent({
        roleLabel,
        effectiveUserId: userId,
        dataRichiesta: pause.dataRichiesta,
        dataRitorno: pause.dataRitorno,
        giorniScalati,
        giorniTotaliUsati,
        maxGiorni,
        giorniRimanenti,
      });
      if (await applyCancelledPauseContentToMessage(channel, messageId, staffContent, userId, pauseId)) {
        rewritten += 1;
      }

      if (messageIdPm) {
        const pmRole = guild.roles?.cache?.get(String(IDs.roles?.PartnerManager || ""));
        const pmContent = buildCancelledPauseLogContent({
          roleLabel: pmRole?.name || "Partner Manager",
          effectiveUserId: userId,
          dataRichiesta: pause.dataRichiesta,
          dataRitorno: pause.dataRitorno,
          giorniScalati,
          giorniTotaliUsati,
          maxGiorni,
          giorniRimanenti,
        });
        if (await applyCancelledPauseContentToMessage(channel, messageIdPm, pmContent, userId, pauseId)) {
          rewritten += 1;
        }
      }
    }
  }
  return { ok: true, examined, rewritten };
}

function startPauseMessageStatusMaintenance(client?) {
  if (!client || client.__vcPauseMessageStatusMaintenanceStarted) return;
  client.__vcPauseMessageStatusMaintenanceStarted = true;
  void scheduleAcceptedPauseStatusTimersOnly(client).catch((err?) => {
    global.logger?.warn?.("[PAUSE] schedule pause status timers failed:", err?.message || err);
  });
}

export = { MS_PER_DAY, parseItalianDate, getPauseDaysBetween, getTodayUtc, getCurrentYearBoundsUtc, getMonthBoundsUtc, filterPausesByMonth, countOverlapDays, countEffectiveOverlapDays, rangesOverlap, computeStaffersInPauseByRoleForRange, computeStaffersInPauseByStaffRankForRange, getMemberStaffRankRoleId, getStaffRankLimitKey, resolvePauseStaffRankRoleId, buildAcceptedPauseLogContent, buildCancelledPauseLogContent, formatPauseRoleLabelForMessage, buildAcceptedPauseMessageContent, getStaffPauseRecord, getStaffAndPauseByRequestMessageId, updatePauseInDb, computeConsumedPauseDays, getMemberRoleLabel, getBasePauseLimit, getPauseRoleLimit, getPauseStatusLabel, getPauseTimingText, computePauseScaledDaysThisYear, buildRequestButtonsRow, buildAcceptedButtonsRow, schedulePauseButtonsRemoval, restorePauseMessageStatusSync, startPauseMessageStatusMaintenance, rewriteStaleCancelledPauseMessages, syncSingleAcceptedPauseMessage, scheduleAcceptedPauseMessagesRefreshAfterRankChange, getRomeMonthKey, getOnePausePerMonthWarning, getOneWeekBetweenWarning, getPauseReasonFromMessage, cancelOpenPausesOnMemberLeave, computeConsumedDaysForCancelledPause, PAUSE_ROLE_STAFF, PAUSE_ROLE_PM, PAUSE_ROLE_BOTH, normalizePauseRoleChoice, getMemberPauseRoleChoices, getPauseRoleTargets, roleChoiceAppliesTo, hasSiblingAcceptedPauseSameRange, getBestStaffPauseBonusDays, getValPosTradedPauseBonusDays, getStaffPauseBonusDaysTotal, grantBestStaffPauseBonusYear, getStaffWeekKeyNow, getBestStaffWeekPauseBonusDaysRemaining, allocateBestStaffWeekPauseBonusDays, computeStaffPauseDayBudget, grantBestStaffWeekPauseBonus, computeWeekBonusDaysConsumed, getPausePhase, hasActiveAcceptedStaffPause };