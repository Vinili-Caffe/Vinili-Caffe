const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const mongoose = require("mongoose");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../DB/validateWriteIds");
const IDs = require("../Config/ids");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_SET_TIMEOUT_MS = 2147483647;
const PAUSE_FESTIVI_TIMEZONE = "Europe/Rome";
const STAFF_ROLE_PRIORITY = [
  IDs.roles.Founder,
  IDs.roles.Admin,
  IDs.roles.Director,
  IDs.roles.HighStaff,
  IDs.roles.SeniorModerator,
  IDs.roles.Mod,
  IDs.roles.Helper,
  IDs.roles.Staff,
  IDs.roles.PartnerManager,
].filter(Boolean);

function getRomeDateKey(date) {
  if (!date || !date.getTime) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: PAUSE_FESTIVI_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function getEasterSunday(year) {
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

function getFestiviSetForYear(year) {
  const set = new Set();
  const y = Number(year);
  if (!Number.isFinite(y)) return set;
  const pad = (n) => String(n).padStart(2, "0");
  set.add(`${y}-12-24`);
  set.add(`${y}-12-25`);
  set.add(`${y}-12-26`);
  set.add(`${y}-12-31`);
  set.add(`${y}-01-01`);
  /** Festività nazionali (Europe/Rome): non contano nel limite giorni pausa per tutti. */
  set.add(`${y}-04-25`);
  set.add(`${y}-05-01`);
  set.add(`${y}-06-02`);
  const pasqua = getEasterSunday(y);
  if (pasqua) {
    set.add(`${y}-${pad(pasqua.month)}-${pad(pasqua.day)}`);
    const pasquetta = new Date(y, pasqua.month - 1, pasqua.day + 1);
    set.add(`${pasquetta.getFullYear()}-${pad(pasquetta.getMonth() + 1)}-${pad(pasquetta.getDate())}`);
  }
  return set;
}

function countFestiviInRange(start, end) {
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
  Founder: 1,
  Staff: null,
  PartnerManager: null,
};
const PAUSE_ROLE_STAFF = "Staff";
const PAUSE_ROLE_PM = "PartnerManager";
const PAUSE_ROLE_BOTH = "Entrambi";

function parseItalianDate(value) {
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

function getPauseDaysBetween(startRaw, endRaw) {
  const start = parseItalianDate(startRaw);
  const end = parseItalianDate(endRaw);
  if (!start || !end || end < start) return null;
  return Math.floor((end - start) / MS_PER_DAY) + 1;
}

function getTodayUtc() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function getCurrentYearBoundsUtc() {
  const now = getTodayUtc();
  const year = now.getUTCFullYear();
  return {
    yearStart: new Date(Date.UTC(year, 0, 1)),
    yearEnd: new Date(Date.UTC(year, 11, 31)),
  };
}

function countOverlapDays(start, end, windowStart, windowEnd) {
  if (!start || !end || end < start) return 0;
  const overlapStart = start > windowStart ? start : windowStart;
  const overlapEnd = end < windowEnd ? end : windowEnd;
  if (overlapEnd < overlapStart) return 0;
  return Math.floor((overlapEnd - overlapStart) / MS_PER_DAY) + 1;
}

function countEffectiveOverlapDays(start, end, windowStart, windowEnd) {
  const raw = countOverlapDays(start, end, windowStart, windowEnd);
  if (raw === 0) return 0;
  const overlapStart = start > windowStart ? start : windowStart;
  const overlapEnd = end < windowEnd ? end : windowEnd;
  const festivi = countFestiviInRange(overlapStart, overlapEnd);
  return Math.max(0, raw - festivi);
}

function rangesOverlap(startA, endA, startB, endB) {
  if (!startA || !endA || !startB || !endB) return false;
  return startA <= endB && startB <= endA;
}

function getMonthBoundsUtc(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return {
    monthStart: new Date(Date.UTC(y, m - 1, 1)),
    monthEnd: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)),
  };
}

function filterPausesByMonth(pauses, year, month) {
  const bounds = getMonthBoundsUtc(year, month);
  if (!bounds || !Array.isArray(pauses)) return [];
  return pauses.filter((pause) => {
    const start = parseItalianDate(pause?.dataRichiesta);
    const end = parseItalianDate(pause?.dataRitorno);
    return start && end && countOverlapDays(start, end, bounds.monthStart, bounds.monthEnd) > 0;
  });
}

async function computeStaffersInPauseByRoleForRange(guildId, roleLabel, rangeStartRaw, rangeEndRaw, excludeUserId = null) {
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
    const hasOverlap = pauses.some((pause) => {
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

async function getStaffPauseRecord(guildId, userId) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u) return null;
  return ActivityUserProfile.findOne({ guildId: g, userId: u });
}

/** Cerca Staff e pausa per requestMessageId (fallback quando il pulsante ha un pauseId vecchio/sbagliato). */
async function getStaffAndPauseByRequestMessageId(guildId, messageId) {
  const g = String(guildId ?? "").trim();
  const msgId = String(messageId ?? "").trim();
  if (!g || !msgId) return null;
  const doc = await ActivityUserProfile.findOne({
    guildId: g,
    $or: [{ "staff.pauses.requestMessageId": msgId }, { "staff.pauses.requestMessageIdPm": msgId }],
  });
  if (!doc || !Array.isArray(doc.staff?.pauses)) return null;
  const pause = doc.staff.pauses.find(
    (p) => String(p?.requestMessageId) === msgId || String(p?.requestMessageIdPm) === msgId,
  );
  return pause ? { stafferRecord: doc, pause } : null;
}

function normalizePauseIdForQuery(pauseId) {
  if (!pauseId) return null;
  const str = String(pauseId).trim();
  if (!str) return null;
  if (mongoose.Types.ObjectId.isValid(str) && String(new mongoose.Types.ObjectId(str)) === str) {
    return new mongoose.Types.ObjectId(str);
  }
  return str;
}

async function updatePauseInDb(guildId, userId, pauseId, setFields) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u || !pauseId || !setFields || typeof setFields !== "object") return { ok: false };
  const updates = {};
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

function computeConsumedPauseDays(pauses) {
  if (!Array.isArray(pauses)) return 0;
  const { yearStart, yearEnd } = getCurrentYearBoundsUtc();

  return pauses.reduce((total, pause) => {
    if (!pause) return total;
    const start = parseItalianDate(pause.dataRichiesta);
    const plannedEnd = parseItalianDate(pause.dataRitorno);

    if (pause.status === "accepted") {
      return total + countEffectiveOverlapDays(start, plannedEnd, yearStart, yearEnd);
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
          effectiveEnd = new Date(
            start.getTime() + (consumed - 1) * MS_PER_DAY,
          );
        }
      }
      if (plannedEnd && effectiveEnd && effectiveEnd > plannedEnd)
        effectiveEnd = plannedEnd;
      return total + countEffectiveOverlapDays(start, effectiveEnd, yearStart, yearEnd);
    }

    return total;
  }, 0);
}

function getMemberRoleLabel(member) {
  for (const roleId of STAFF_ROLE_PRIORITY) {
    const role = member.roles.cache.get(roleId);
    if (role) return role.name;
  }
  return "Staff";
}

function normalizePauseRoleChoice(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return null;
  if (value === "staff") return PAUSE_ROLE_STAFF;
  if (value === "pm" || value === "partnermanager" || value === "partner_manager") return PAUSE_ROLE_PM;
  if (value === "entrambi" || value === "both") return PAUSE_ROLE_BOTH;
  return null;
}

function getMemberPauseRoleChoices(member) {
  const hasStaff = Boolean(member?.roles?.cache?.has(IDs.roles.Staff));
  const hasPm = Boolean(member?.roles?.cache?.has(IDs.roles.PartnerManager));
  if (hasStaff && hasPm) return [PAUSE_ROLE_PM, PAUSE_ROLE_STAFF, PAUSE_ROLE_BOTH];
  if (hasStaff) return [PAUSE_ROLE_STAFF];
  if (hasPm) return [PAUSE_ROLE_PM];
  return [];
}

function getPauseRoleTargets(roleChoice, member) {
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

function roleChoiceAppliesTo(baseRole, pauseRoleChoice) {
  const role = normalizePauseRoleChoice(baseRole);
  const pause = normalizePauseRoleChoice(pauseRoleChoice);
  if (!role || !pause) return false;
  if (pause === PAUSE_ROLE_BOTH) return role === PAUSE_ROLE_STAFF || role === PAUSE_ROLE_PM;
  return role === pause;
}

function getPauseRoleLimit(roleLabel) {
  if (!roleLabel || typeof roleLabel !== "string") return null;
  const key = roleLabel.trim();
  if (Object.prototype.hasOwnProperty.call(PAUSE_ROLE_LIMITS, key))
    return PAUSE_ROLE_LIMITS[key];
  return null;
}

function getRomeMonthKey(date) {
  if (!date || !date.getTime) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  if (!year || !month) return null;
  return { year: Number(year), month: Number(month) };
}

function getRomeDateParts(date) {
  if (!date || !date.getTime) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return null;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

function getMonthKeyForPauseCount(dataRichiesta, dataRitorno) {
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

function getOnePausePerMonthWarning(staffDoc, normalized) {
  const pauses = Array.isArray(staffDoc?.staff?.pauses) ? staffDoc.staff.pauses : [];
  const newCountKey = getMonthKeyForPauseCount(normalized?.dataRichiesta, normalized?.dataRitorno);
  if (!newCountKey) return null;
  const excludeId = normalized?.excludePauseId;
  const countSameMonth = pauses.filter((p) => {
    if (!p || p.status === "rejected") return false;
    if (excludeId && String(p._id) === String(excludeId)) return false;
    const k = getMonthKeyForPauseCount(p.dataRichiesta, p.dataRitorno);
    return k && k.year === newCountKey.year && k.month === newCountKey.month;
  }).length;
  if (countSameMonth >= 1) return "<:VC_Attention:1482534443632558151> Hai già una richiesta pausa in questo mese. L’High Staff può accettare comunque.";
  return null;
}

function getOneWeekBetweenWarning(staffDoc, excludePauseId = null) {
  const pauses = Array.isArray(staffDoc?.staff?.pauses) ? staffDoc.staff.pauses : [];
  const withDate = pauses
    .filter((p) => p && (p.createdAt || p._id) && String(p._id) !== String(excludePauseId))
    .map((p) => ({ ...p, at: p.createdAt ? new Date(p.createdAt).getTime() : 0 }))
    .filter((p) => p.at > 0)
    .sort((a, b) => b.at - a.at);
  const last = withDate[0];
  if (!last) return null;
  const weekAgo = Date.now() - 7 * MS_PER_DAY;
  if (last.at > weekAgo) return "<:VC_Attention:1482534443632558151> Meno di 1 settimana dall’ultima richiesta. L’High Staff può accettare comunque.";
  return null;
}

function getSpanTwoMonthsFiveDaysWarning(normalized) {
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

function getBasePauseLimit(member, requestedRole = null) {
  const targets = getPauseRoleTargets(requestedRole, member);
  const values = targets.map((t) => (t === PAUSE_ROLE_PM ? 45 : 60));
  return values.length ? Math.max(...values) : 60;
}

function getPauseStatusLabel(pause, todayUtc) {
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

function getPauseTimingText(startRaw, endRaw) {
  const start = parseItalianDate(startRaw);
  const end = parseItalianDate(endRaw);
  const today = getTodayUtc();
  if (!start || !end) return "è in pausa";
  if (today < start) return "sarà in pausa";
  if (today > end) return "è stato in pausa";
  return "è in pausa";
}

function computePauseScaledDaysThisYear(pause, todayUtc, yearStart, yearEnd) {
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

function buildRequestButtonsRow(userId, pauseId, disabled = false) {
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
  if (disabled) row.components.forEach((c) => c.setDisabled(true));
  return row;
}

function buildAcceptedButtonsRow(userId, pauseId, options = {}) {
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

/** Recupera la motivazione dal messaggio di richiesta pausa (canale pause). Ritorna null se non disponibile. */
async function getPauseReasonFromMessage(client, pause) {
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

function schedulePauseButtonsRemoval(guild, channelId, messageId, pauseStartRaw, pauseEndRaw, userId, pauseId, requestMessageIdPm = null) {
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

function normalizePauseStatusPhrase(content, targetPhrase) {
  const raw = String(content || "");
  if (!raw) return raw;
  return raw
    .replace(" sarà in pausa.", ` ${targetPhrase}.`)
    .replace(" è in pausa.", ` ${targetPhrase}.`)
    .replace(" era in pausa.", ` ${targetPhrase}.`)
    .replace(" è stato in pausa.", ` ${targetPhrase}.`);
}

function getPausePhase(startRaw, endRaw, atDate) {
  const start = parseItalianDate(startRaw);
  const end = parseItalianDate(endRaw);
  const today = atDate instanceof Date ? atDate : getTodayUtc();
  if (!start || !end) return "active";
  if (today < start) return "planned";
  if (today > end) return "ended";
  return "active";
}

function hasActiveAcceptedStaffPause(pauses, atDate) {
  if (!Array.isArray(pauses)) return false;
  const today = atDate instanceof Date ? atDate : getTodayUtc();
  return pauses.some((pause) => {
    if (!pause || pause.status !== "accepted") return false;
    return getPausePhase(pause.dataRichiesta, pause.dataRitorno, today) === "active";
  });
}

async function applyAcceptedPausePhaseToDiscordMessage(channel, messageId, userId, pauseId, phase, withControls) {
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (!msg) return;
  const currentContent = String(msg.content || "");
  let nextContent = currentContent;
  let nextComponents = [];
  if (withControls) {
    if (phase === "planned") {
      nextContent = normalizePauseStatusPhrase(currentContent, "sarà in pausa");
      nextComponents = [buildAcceptedButtonsRow(userId, pauseId, { hideCancel: false, disableCancel: false })];
    } else if (phase === "active") {
      nextContent = normalizePauseStatusPhrase(currentContent, "è in pausa");
      nextComponents = [buildAcceptedButtonsRow(userId, pauseId, { hideCancel: false, disableCancel: false })];
    } else {
      nextContent = normalizePauseStatusPhrase(currentContent, "è stato in pausa");
      nextComponents = [];
    }
  } else {
    if (phase === "planned") nextContent = normalizePauseStatusPhrase(currentContent, "sarà in pausa");
    else if (phase === "active") nextContent = normalizePauseStatusPhrase(currentContent, "è in pausa");
    else nextContent = normalizePauseStatusPhrase(currentContent, "è stato in pausa");
    nextComponents = [];
  }
  const sameContent = nextContent === currentContent;
  const hasComponentsNow = Array.isArray(msg.components) && msg.components.length > 0;
  const hasComponentsNext = Array.isArray(nextComponents) && nextComponents.length > 0;
  if (sameContent && hasComponentsNow === hasComponentsNext) return;
  await msg.edit({ content: nextContent, components: nextComponents }).catch(() => null);
}

async function syncSingleAcceptedPauseMessage(guild, userId, pause) {
  const channelId = String(pause?.requestChannelId || "").trim();
  const messageId = String(pause?.requestMessageId || "").trim();
  const messageIdPm = String(pause?.requestMessageIdPm || "").trim();
  const pauseId = String(pause?._id || "").trim();
  if (!guild || !channelId || !messageId || !pauseId) return;
  const phase = getPausePhase(pause?.dataRichiesta, pause?.dataRitorno);
  const channel = await getGuildChannelCached(guild, channelId);
  if (!channel?.isTextBased?.()) return;
  await applyAcceptedPausePhaseToDiscordMessage(channel, messageId, userId, pauseId, phase, true);
  if (messageIdPm) {
    await applyAcceptedPausePhaseToDiscordMessage(channel, messageIdPm, userId, pauseId, phase, true);
  }
}

function scheduleDelayedCallback(runAtMs, callback) {
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

function schedulePauseStatusRefresh(guild, userId, pause) {
  const start = parseItalianDate(pause?.dataRichiesta);
  const end = parseItalianDate(pause?.dataRitorno);
  if (!guild || !pause || !start || !end) return;
  const checkpoints = [start.getTime(), end.getTime() + MS_PER_DAY];
  for (const at of checkpoints) {
    scheduleDelayedCallback(at, () => {
      syncSingleAcceptedPauseMessage(guild, userId, pause).catch(() => null);
    });
  }
}

function pauseHistoryImpliesBestStaffBonusForYear(pauses, year) {
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

function getBestStaffPauseBonusDays(member, staffDoc) {
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

function getValPosTradedPauseBonusDays(staffDoc) {
  const n = Number(staffDoc?.staff?.valPosTradedPauseBonusDays ?? staffDoc?.valPosTradedPauseBonusDays ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function getStaffPauseBonusDaysTotal(member, staffDoc) {
  return getBestStaffPauseBonusDays(member, staffDoc) + getValPosTradedPauseBonusDays(staffDoc);
}

async function grantBestStaffPauseBonusYear(guildId, userId, year = null) {
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

async function restorePauseMessageStatusSync(client) {
  const guildId = String(IDs.guilds?.main || client?.guilds?.cache?.first?.()?.id || "").trim();
  if (!guildId) return;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return;
  const docs = await ActivityUserProfile.find(
    { guildId, "staff.pauses.status": "accepted" },
    { userId: 1, "staff.pauses": 1 },
  )
    .lean()
    .catch(() => []);
  for (const doc of docs) {
    const userId = String(doc?.userId || "").trim();
    if (!userId) continue;
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    for (const pause of pauses) {
      if (!pause || pause.status !== "accepted") continue;
      await syncSingleAcceptedPauseMessage(guild, userId, pause);
      schedulePauseStatusRefresh(guild, userId, pause);
    }
  }
}

module.exports = { MS_PER_DAY, parseItalianDate, getPauseDaysBetween, getTodayUtc, getCurrentYearBoundsUtc, getMonthBoundsUtc, filterPausesByMonth, countOverlapDays, countEffectiveOverlapDays, rangesOverlap, computeStaffersInPauseByRoleForRange, getStaffPauseRecord, getStaffAndPauseByRequestMessageId, updatePauseInDb, computeConsumedPauseDays, getMemberRoleLabel, getBasePauseLimit, getPauseRoleLimit, getPauseStatusLabel, getPauseTimingText, computePauseScaledDaysThisYear, buildRequestButtonsRow, buildAcceptedButtonsRow, schedulePauseButtonsRemoval, restorePauseMessageStatusSync, getRomeMonthKey, getOnePausePerMonthWarning, getOneWeekBetweenWarning, getPauseReasonFromMessage, PAUSE_ROLE_STAFF, PAUSE_ROLE_PM, PAUSE_ROLE_BOTH, normalizePauseRoleChoice, getMemberPauseRoleChoices, getPauseRoleTargets, roleChoiceAppliesTo, getBestStaffPauseBonusDays, getValPosTradedPauseBonusDays, getStaffPauseBonusDaysTotal, grantBestStaffPauseBonusYear, getPausePhase, hasActiveAcceptedStaffPause };