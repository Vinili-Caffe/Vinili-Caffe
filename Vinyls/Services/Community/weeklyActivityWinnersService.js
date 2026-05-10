const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const cron = require("node-cron");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { VOICE_EXP_PER_MINUTE, MESSAGE_EXP } = require("./expService");
const IDs = require("../../Utils/Config/ids");
const { voteCountMonthKeyRome } = require("../../Utils/romeVoteMonthKey");
const { isChannelInTicketCategory } = require("../../Utils/Ticket/ticketCategoryUtils");
const { getClientChannelCached, getClientGuildCached, getGuildChannelCached, getGuildMemberCached, getGuildRoleCached, getUserCached } = require("../../Utils/Interaction/interactionEntityCache");
const { guildIconUrl } = require("../../Utils/Discord/guildDiscordIdentity");

const BACKFILL_HOUR_SUFFIX = "T12";
function shouldSkipBackfillRow(hourKey, hourSet) {
  if (!hourKey || typeof hourKey !== "string") return false;
  if (!hourKey.endsWith(BACKFILL_HOUR_SUFFIX)) return false;
  const dateKey = hourKey.slice(0, -BACKFILL_HOUR_SUFFIX.length);
  return [...hourSet].some((k) => k.startsWith(`${dateKey}T`) && k !== hourKey);
}

const TIME_ZONE = "Europe/Rome";
const TARGET_CHANNEL_ID = IDs.channels.topWeeklyUser;
const INFO_CHANNEL_ID = IDs.channels.info;
const TROPHY_LABELS = ["<:VC_Podio1:1482694399283433582>", "<:VC_Podio2:1482694424411635712>", "<:VC_Podio3:1482694450806259744>"];
const MESSAGE_WINNER_ROLE_ID = IDs.roles.TopWeeklyText;
const VOICE_WINNER_ROLE_ID = IDs.roles.TopWeeklyVoc;
const MINIGAME_WINNER_ROLE_ID = IDs.roles.MVP;
const MONTHLY_MEMBER_ROLE_ID = IDs.roles.TopMonthlyMember;
const MONTHLY_VOTER_ROLE_RANK_1 = IDs.roles.VIPplus || IDs.roles["VIP+"];
const MONTHLY_VOTER_ROLE_RANK_2 = IDs.roles.VIP;
const MONTHLY_VOTER_ROLE_RANK_3 = IDs.roles.Donator;
const MONTHLY_VOTER_REWARD_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MONTHLY_VOTER_REWARD_PATH = "profile.totals.exp.monthlyVoteTopReward";
const MONTHLY_TOP_REWARD_ROLE_RANK_2 = IDs.roles.VIPplus || IDs.roles["VIP+"];
const MONTHLY_TOP_REWARD_ROLE_RANK_3 = IDs.roles.VIP;
const MONTHLY_TOP_REWARD_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MONTHLY_TOP_REWARD_PATH = "profile.totals.exp.monthlyTopReward";
const REQUIRED_MEMBER_ROLE_ID = String(IDs.roles.Member || "");
const WEEKLY_WINNERS_EXCLUDED_ROLE_IDS = new Set(
  [
    IDs.roles.Staff,
    IDs.roles.HighStaff,
    IDs.roles.Helper,
    IDs.roles.Mod,
    IDs.roles.SeniorModerator,
    IDs.roles.Director,
    IDs.roles.Admin,
    IDs.roles.Founder,
  ]
    .filter(Boolean)
    .map((id) => String(id)),
);
const WEEKLY_WINNERS_PUBLISH_INTRO_MARK = "Annunciamo i vincitori di questa settimana";

function getRomeOffsetMs(utcDate) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "shortOffset", hour: "2-digit" });
  const zoneName = formatter.formatToParts(utcDate).find((part) => part.type === "timeZoneName")?.value;
  const match = String(zoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
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
  if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
  return new Date(utcMs);
}

function getRomeDateTimeParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year || 0),
    month: Number(parts.month || 1),
    day: Number(parts.day || 1),
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0),
    second: Number(parts.second || 0),
    weekday: weekdayMap[String(parts.weekday || "Sun")] ?? 0,
  };
}

function getLastSunday21BoundaryMsAtOrBefore(date = new Date()) {
  const nowMs = date instanceof Date ? date.getTime() : Number(date);
  if (!Number.isFinite(nowMs)) return Date.now();
  const p = getRomeDateTimeParts(new Date(nowMs));
  if (p.weekday === 0) {
    const thisSunday21 = createUtcFromRomeLocal(p.year, p.month, p.day, 21, 0, 0).getTime();
    if (nowMs < thisSunday21) {
      return createUtcFromRomeLocal(p.year, p.month, p.day - 7, 21, 0, 0).getTime();
    }
    return thisSunday21;
  }
  return createUtcFromRomeLocal(p.year, p.month, p.day - p.weekday, 21, 0, 0).getTime();
}

/** True se il membro risulta aver avuto un ruolo staff (stesso set delle esclusioni top weekly) in qualunque momento nella finestra attività settimanale (tra due boundary domenica 21:00 Roma), da `staff.rolesHistory`. */
function wasStaffDuringWeeklyActivityWindow(staff, weekPeriodStartMs, weekPeriodEndMs, trackedStaffRoleIds) {
  const set =
    trackedStaffRoleIds instanceof Set
      ? trackedStaffRoleIds
      : new Set((Array.isArray(trackedStaffRoleIds) ? trackedStaffRoleIds : []).map((id) => String(id)).filter(Boolean));
  const start = Number(weekPeriodStartMs);
  const end = Number(weekPeriodEndMs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  const isStaffRole = (roleId) => {
    const id = String(roleId || "").trim();
    return Boolean(id && set.has(id));
  };
  const history = Array.isArray(staff?.rolesHistory) ? [...staff.rolesHistory] : [];
  history.sort((a, b) => new Date(a?.date || 0).getTime() - new Date(b?.date || 0).getTime());
  let roleAtPeriodStart = null;
  for (const row of history) {
    const t = new Date(row?.date || 0).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= start) break;
    if (row?.newRole != null) roleAtPeriodStart = String(row.newRole);
  }
  if (isStaffRole(roleAtPeriodStart)) return true;
  for (const row of history) {
    const t = new Date(row?.date || 0).getTime();
    if (Number.isNaN(t) || t < start) continue;
    if (t > end) break;
    if (isStaffRole(row?.newRole)) return true;
  }
  return false;
}

function effectiveMinigameWeeklyScoreForRankWeek(doc, rankWeekKey) {
  const rk = String(rankWeekKey || "").trim();
  if (!rk) return 0;
  const mg = doc?.profile?.totals?.exp?.minigame || {};
  if (String(mg.weeklyKey || "") === rk) return Math.max(0, Math.floor(Number(mg.weeklyExp || 0)));
  if (String(mg.prevWeekKey || "") === rk) return Math.max(0, Math.floor(Number(mg.prevWeekExp || 0)));
  return 0;
}

function toObjectMap(raw) {
  if (!raw) return {};
  if (raw instanceof Map) return Object.fromEntries(raw.entries());
  if (typeof raw === "object") return raw;
  return {};
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getTimeParts(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
  };
}

function getWeekKey(date) {
  const { year, month, day } = getTimeParts(date);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayNr = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 4));
  const weekNr = 1 + Math.round((utcDate - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${utcDate.getUTCFullYear()}-W${pad2(weekNr)}`;
}

function getWeekdayRome(date) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" });
  return formatter.format(date);
}

function getLastCompletedWeekKey(date = new Date()) {
  const wd = getWeekdayRome(date);
  const daysToLastSunday = wd === "Sun" ? 0 : { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0;
  const lastSundayDate = new Date(date.getTime() - daysToLastSunday * 24 * 60 * 60 * 1000);
  return getWeekKey(lastSundayDate);
}

function getDateKeysForWeekKey(weekKey) {
  const match = String(weekKey || "").match(/^(\d{4})-W(\d{2})$/);
  if (!match) return [];
  const year = Number(match[1]);
  const isoWeek = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(isoWeek) || isoWeek < 1) return [];
  const jan4Utc = Date.UTC(year, 0, 4, 12, 0, 0);
  const jan4 = new Date(jan4Utc);
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const mondayWeek1Utc = jan4Utc - jan4Day * 24 * 60 * 60 * 1000;
  const mondayTargetUtc = mondayWeek1Utc + (isoWeek - 1) * 7 * 24 * 60 * 60 * 1000;
  const out = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(mondayTargetUtc + i * 24 * 60 * 60 * 1000);
    const parts = getTimeParts(date);
    out.push(`${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`);
  }
  return out;
}

function buildLast7DaysHourKeys(endMs) {
  const keys = [];
  for (let h = 0; h < 24 * 7; h += 1) {
    const d = new Date(endMs - h * 60 * 60 * 1000);
    const parts = getTimeParts(d);
    keys.push(`${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}`);
  }
  return keys;
}

function daysInCalendarMonthRome(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function buildCalendarMonthHourKeys(year, month1to12) {
  const dim = daysInCalendarMonthRome(year, month1to12);
  const keys = [];
  for (let day = 1; day <= dim; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      keys.push(`${year}-${pad2(month1to12)}-${pad2(day)}T${pad2(hour)}`);
    }
  }
  return keys;
}

function getPreviousRomeCalendarMonth(anchor = new Date()) {
  const p = getRomeDateTimeParts(anchor);
  let y = p.year;
  let m = p.month;
  if (m <= 1) {
    y -= 1;
    m = 12;
  } else {
    m -= 1;
  }
  return { year: y, month: m };
}

const IT_MONTH_NAMES = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

async function loadMonthlyRowsFromRomeCalendarMonth(guild, year, month1to12) {
  const eligible = await getEligibleChannelSets(guild);
  if (!eligible.text.size && !eligible.voice.size) return [];
  const hourKeys = buildCalendarMonthHourKeys(year, month1to12);
  return loadRowsFromHourlyWindowByHourKeys(guild, eligible, hourKeys);
}

function buildLastHoursHourKeys(endMs, hours) {
  const totalHours = Math.max(1, Math.min(24 * 31, Number(hours) || 1));
  const keys = [];
  for (let h = 0; h < totalHours; h += 1) {
    const d = new Date(endMs - h * 60 * 60 * 1000);
    const parts = getTimeParts(d);
    keys.push(`${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}`);
  }
  return keys;
}

function buildAnchorDateFromWeekKey(weekKey) {
  const keys = getDateKeysForWeekKey(weekKey);
  const lastDay = String(keys[keys.length - 1] || "");
  const m = lastDay.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  // 22:00 locale domenica: garantisce boundary alle 21:00 della stessa settimana.
  return createUtcFromRomeLocal(year, month, day, 22, 0, 0);
}

async function resolveMemberRole(guild) {
  if (!guild) return null;
  if (REQUIRED_MEMBER_ROLE_ID) {
    const role = guild.roles.cache.get(REQUIRED_MEMBER_ROLE_ID) || (await getGuildRoleCached(guild, REQUIRED_MEMBER_ROLE_ID));
    if (role) return role;
  }
  return guild.roles.everyone || null;
}

async function getEligibleChannelSets(guild) {
  const role = await resolveMemberRole(guild);
  if (!role) return { text: new Set(), voice: new Set() };
  const excludedChannelIds = new Set(
    [IDs.channels?.ticket, IDs.channels?.ticketLogs]
      .filter(Boolean)
      .map((id) => String(id)),
  );
  const text = new Set();
  const voice = new Set();
  for (const channel of guild.channels.cache.values()) {
    if (excludedChannelIds.has(String(channel?.id || ""))) continue;
    if (isChannelInTicketCategory(channel)) continue;
    const perms = channel?.permissionsFor?.(role);
    if (!perms?.has("ViewChannel")) continue;
    if (perms.has("SendMessages")) text.add(String(channel.id));
    if (perms.has("Connect") && perms.has("Speak")) voice.add(String(channel.id));
  }
  return { text, voice };
}

async function loadWeeklyRowsFromHourlyWindow(guild, anchorDate = new Date()) {
  const eligible = await getEligibleChannelSets(guild);
  if (!eligible.text.size && !eligible.voice.size) return [];
  const endMs = getLastSunday21BoundaryMsAtOrBefore(anchorDate);
  const hourKeys = buildLast7DaysHourKeys(endMs);
  return loadRowsFromHourlyWindowByHourKeys(guild, eligible, hourKeys);
}

async function loadRowsFromHourlyWindowByHourKeys(guild, eligible, hourKeys) {
  const rows = [];
  const profileDocs = await ActivityUserProfile.find({ guildId: guild.id }).select("userId profile.totals.hourly").lean().catch(() => []);
  if (profileDocs.length) {
    const wanted = new Set(hourKeys.map(String));
    for (const doc of profileDocs) {
      const userId = String(doc?.userId || "");
      const hourly = toObjectMap(doc?.profile?.totals?.hourly || {});
      if (!userId) continue;
      for (const [hourKey, value] of Object.entries(hourly)) {
        if (!wanted.has(String(hourKey))) continue;
        if (shouldSkipBackfillRow(String(hourKey), wanted)) continue;
        rows.push({
          userId,
          textChannels: toObjectMap(value?.textChannels || {}),
          voiceChannels: toObjectMap(value?.voiceChannels || {}),
        });
      }
    }
  }
  const perUser = new Map();
  for (const row of rows) {
    const userId = String(row?.userId || "");
    if (!userId) continue;
    let messageCount = 0;
    let voiceSeconds = 0;
    for (const [channelId, value] of extractMapEntries(row?.textChannels)) {
      if (!eligible.text.has(String(channelId))) continue;
      messageCount += Math.max(0, Number(value || 0));
    }
    for (const [channelId, value] of extractMapEntries(row?.voiceChannels)) {
      if (!eligible.voice.has(String(channelId))) continue;
      voiceSeconds += Math.max(0, Number(value || 0));
    }
    if (messageCount <= 0 && voiceSeconds <= 0) continue;
    const current = perUser.get(userId) || { userId, messageCount: 0, voiceSeconds: 0 };
    current.messageCount += messageCount;
    current.voiceSeconds += voiceSeconds;
    perUser.set(userId, current);
  }
  return Array.from(perUser.values()).map((row) => ({
    userId: row.userId,
    messageCount: Math.max(0, Math.floor(row.messageCount)),
    voiceExp: Math.max(0, Math.floor((Math.max(0, row.voiceSeconds) / 60) * VOICE_EXP_PER_MINUTE)),
  }));
}

async function loadDailyRowsFromHourlyWindow(guild, anchorDate = new Date()) {
  const eligible = await getEligibleChannelSets(guild);
  if (!eligible.text.size && !eligible.voice.size) return [];
  const endMs = anchorDate instanceof Date ? anchorDate.getTime() : Date.now();
  const hourKeys = buildLastHoursHourKeys(endMs, 24);
  return loadRowsFromHourlyWindowByHourKeys(guild, eligible, hourKeys);
}

function extractMapEntries(raw) {
  if (!raw) return [];
  if (raw instanceof Map) return Array.from(raw.entries());
  if (typeof raw === "object") return Object.entries(raw);
  return [];
}

async function resolveTopThreeUsers(client, guild, docs, valueGetter, limit = 3, excludedRoleIds = WEEKLY_WINNERS_EXCLUDED_ROLE_IDS) {
  const cap = Math.max(1, Math.min(25, Number(limit) || 3));
  const excludedSet =
    excludedRoleIds instanceof Set
      ? excludedRoleIds
      : new Set((Array.isArray(excludedRoleIds) ? excludedRoleIds : []).map((id) => String(id)).filter(Boolean));
  const out = [];
  for (const doc of docs) {
    if (out.length >= cap) break;
    const userId = String(doc.userId || "");
    if (!userId) continue;
    let user = client.users.cache.get(userId) || null;
    if (!user) user = await client.users.fetch(userId).catch(() => null);
    if (!user || user.bot) continue;
    const member = guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
    if (!member) continue;
    if (REQUIRED_MEMBER_ROLE_ID && !member.roles.cache.has(REQUIRED_MEMBER_ROLE_ID)) continue;
    const hasExcludedRole = Array.from(excludedSet).some((roleId) => member.roles.cache.has(roleId));
    if (hasExcludedRole) continue;
    const value = Math.max(0, Math.floor(Number(valueGetter(doc) || 0)));
    if (value <= 0) continue;
    out.push({ userId, value });
  }
  return out;
}

/** Minigame: se la top “pulita” è vuota ma ci sono punti in DB, garantisce almeno una classifica (annuncio / MVP). */
async function resolveMinigameTopForced(client, guild, docs, valueGetter, limit = 10) {
  const cap = Math.max(1, Math.min(25, Number(limit) || 10));
  let rows = await resolveTopThreeUsers(client, guild, docs, valueGetter, cap, WEEKLY_WINNERS_EXCLUDED_ROLE_IDS);
  if (rows.length) return rows;
  rows = await resolveTopThreeUsers(client, guild, docs, valueGetter, cap, new Set());
  if (rows.length) return rows;
  const out = [];
  const list = Array.isArray(docs) ? docs : [];
  for (const doc of list) {
    if (out.length >= cap) break;
    const userId = String(doc?.userId || "");
    if (!userId) continue;
    const value = Math.max(0, Math.floor(Number(valueGetter(doc) || 0)));
    if (value <= 0) continue;
    const user = client.users.cache.get(userId) || (await client.users.fetch(userId).catch(() => null));
    if (!user || user.bot) continue;
    out.push({ userId, value });
  }
  return out;
}

function uniqueRankingByUserId(rows, limit = 3) {
  const cap = Math.max(1, Math.min(25, Number(limit) || 3));
  const out = [];
  const seen = new Set();
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    const userId = String(row?.userId || "").trim();
    if (!userId || seen.has(userId)) continue;
    out.push(row);
    seen.add(userId);
    if (out.length >= cap) break;
  }
  return out;
}

async function removeRoleFromAllMembers(guild, roleId, keepUserId = "") {
  if (!roleId) return;
  await guild.members.fetch().catch(() => null);
  const keep = keepUserId ? String(keepUserId) : "";
  const toRemove = [];
  for (const [, member] of guild.members.cache) {
    if (!member.roles.cache.has(roleId)) continue;
    if (keep && String(member.id) === keep) continue;
    toRemove.push(member);
  }
  for (const member of toRemove) {
    await member.roles.remove(roleId).catch((err) => {
      global.logger?.warn?.("[WEEKLY ACTIVITY WINNERS] remove role failed:", member.id, roleId, err?.message || err);
    });
  }
}

async function assignRoleToUser(guild, userId, roleId) {
  if (!userId || !roleId) return false;
  const member = await getGuildMemberCached(guild, userId, { preferFresh: true }) || guild.members.cache.get(userId) || (await getGuildMemberCached(guild, userId));
  if (!member) return false;
  await member.roles.add(roleId).catch(() => { });
  const refreshedMember = await getGuildMemberCached(guild, userId, { preferFresh: true });
  return Boolean(refreshedMember?.roles?.cache?.has(roleId));
}

function pickFirstAvailable(ranking, excludedUserIds = new Set()) {
  for (const row of ranking) {
    if (!row?.userId) continue;
    if (excludedUserIds.has(row.userId)) continue;
    return row;
  }
  return null;
}

function deduplicateTopTwoLists(topA, topB, sortedA, sortedB, targetSize = 3) {
  const cap = Math.max(1, Math.min(25, Number(targetSize) || 3));
  const takeA = (topA || []).slice(0, cap);
  const takeB = (topB || []).slice(0, cap);
  const poolA = Array.isArray(sortedA) && sortedA.length ? sortedA : takeA;
  const poolB = Array.isArray(sortedB) && sortedB.length ? sortedB : takeB;
  const idsA = new Set(takeA.map((r) => r?.userId).filter(Boolean));
  const idsB = new Set(takeB.map((r) => r?.userId).filter(Boolean));
  const keptInA = new Set();
  const keptInB = new Set();
  for (const uid of idsA) {
    if (!idsB.has(uid)) {
      keptInA.add(uid);
      continue;
    }
    const rankA = takeA.findIndex((r) => r?.userId === uid) + 1;
    const rankB = takeB.findIndex((r) => r?.userId === uid) + 1;
    if (rankA <= rankB) keptInA.add(uid);
    else keptInB.add(uid);
  }
  for (const uid of idsB) {
    if (!idsA.has(uid)) keptInB.add(uid);
  }
  const resultA = [];
  const resultB = [];
  const usedInA = new Set();
  const usedInB = new Set();
  for (let i = 0; i < cap; i += 1) {
    if (i < takeA.length && keptInA.has(takeA[i].userId)) {
      resultA.push(takeA[i]);
      usedInA.add(takeA[i].userId);
    } else {
      for (const row of poolA) {
        if (!row?.userId || usedInA.has(row.userId) || keptInB.has(row.userId)) continue;
        resultA.push(row);
        usedInA.add(row.userId);
        break;
      }
    }
  }
  for (let i = 0; i < cap; i += 1) {
    if (i < takeB.length && keptInB.has(takeB[i].userId)) {
      resultB.push(takeB[i]);
      usedInB.add(takeB[i].userId);
    } else {
      for (const row of poolB) {
        if (!row?.userId || usedInB.has(row.userId) || keptInA.has(row.userId)) continue;
        resultB.push(row);
        usedInB.add(row.userId);
        break;
      }
    }
  }
  return { listA: resultA, listB: resultB };
}

async function updateWeeklyWinnerRoles(guild, topMessages, topVoice, topMinigame) {
  const chosenUserIds = new Set();
  const messageWinner = pickFirstAvailable(topMessages, chosenUserIds);
  if (messageWinner) chosenUserIds.add(messageWinner.userId);
  const voiceWinner = pickFirstAvailable(topVoice, chosenUserIds);
  if (voiceWinner) chosenUserIds.add(voiceWinner.userId);
  const minigameWinner =
    topMinigame !== false &&
      MINIGAME_WINNER_ROLE_ID &&
      Array.isArray(topMinigame) &&
      topMinigame.length
      ? pickFirstAvailable(topMinigame, chosenUserIds)
      : null;
  const removals = [
    removeRoleFromAllMembers(guild, MESSAGE_WINNER_ROLE_ID, messageWinner?.userId),
    removeRoleFromAllMembers(guild, VOICE_WINNER_ROLE_ID, voiceWinner?.userId),
  ];
  if (MINIGAME_WINNER_ROLE_ID && topMinigame !== false) {
    removals.push(removeRoleFromAllMembers(guild, MINIGAME_WINNER_ROLE_ID, minigameWinner?.userId));
  }
  await Promise.all(removals);
  const assigns = [
    assignRoleToUser(guild, messageWinner?.userId, MESSAGE_WINNER_ROLE_ID),
    assignRoleToUser(guild, voiceWinner?.userId, VOICE_WINNER_ROLE_ID),
  ];
  if (MINIGAME_WINNER_ROLE_ID && topMinigame !== false) {
    assigns.push(assignRoleToUser(guild, minigameWinner?.userId, MINIGAME_WINNER_ROLE_ID));
  }
  await Promise.all(assigns);
  return { messageWinner, voiceWinner, minigameWinner };
}

async function updateMonthlyWinnerRoles(guild, topCombined) {
  const first = Array.isArray(topCombined) && topCombined.length ? topCombined[0] : null;
  const second = Array.isArray(topCombined) && topCombined.length > 1 ? topCombined[1] : null;
  const third = Array.isArray(topCombined) && topCombined.length > 2 ? topCombined[2] : null;
  if (!MONTHLY_MEMBER_ROLE_ID) return { topMonthlyWinner: first, monthlyTopSecond: second, monthlyTopThird: third };
  await removeRoleFromAllMembers(guild, MONTHLY_MEMBER_ROLE_ID);
  await assignRoleToUser(guild, first?.userId, MONTHLY_MEMBER_ROLE_ID);
  return { topMonthlyWinner: first, monthlyTopSecond: second, monthlyTopThird: third };
}

function buildEmptyLine(kind) {
  return `<:VC_InactiveStatus:1482526984234860574> - Nessun dato disponibile per ${kind}.`;
}

function formatRankLine(index, userMention, value, unit) {
  const medal = TROPHY_LABELS[index] || TROPHY_LABELS[2] || "<:VC_Podio3:1482694450806259744>";
  return `${medal} ${userMention} <a:VC_Arrow:1482706699365257397> **${value}** *${unit}*`;
}

async function publishWeeklyActivityWinners(client, options = {}) {
  const mode = String(options.mode || "weekly").trim().toLowerCase() === "daily" ? "daily" : "weekly";
  const skipNormalWeekly = Boolean(options.skipNormalWeekly);
  const editMessage = options.editMessage || null;
  const mainGuildId = String(IDs.guilds?.main || "");
  let guild = null;
  let channel = null;
  if (editMessage?.guild) {
    guild = editMessage.guild;
    channel = editMessage.channel || null;
  } else {
    guild =
      mainGuildId &&
      (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null)));
    if (!guild) {
      const channelIdToUse = options.targetChannelId || TARGET_CHANNEL_ID;
      const ch =
        client.channels.cache.get(channelIdToUse) || (await getClientChannelCached(client, channelIdToUse, { ttlMs: 60_000 }));
      if (!ch?.guild) {
        global.logger?.error?.("[WEEKLY ACTIVITY] Publish skipped: guild not found (main o canale top weekly).");
        return;
      }
      guild = ch.guild;
    }
    if (!skipNormalWeekly) {
      const channelIdToUse = options.targetChannelId || TARGET_CHANNEL_ID;
      channel =
        client.channels.cache.get(channelIdToUse) || (await getClientChannelCached(client, channelIdToUse, { ttlMs: 60_000 }));
      if (!channel?.guild) {
        global.logger?.error?.("[WEEKLY ACTIVITY] Publish skipped: canale top weekly non trovato.", channelIdToUse);
        return;
      }
    }
  }
  const anchorFromWeekKey = options.weekKey ? buildAnchorDateFromWeekKey(options.weekKey) : null;
  const now =
    anchorFromWeekKey && !Number.isNaN(anchorFromWeekKey.getTime())
      ? anchorFromWeekKey
      :
      options.anchorDate instanceof Date && !Number.isNaN(options.anchorDate.getTime())
        ? options.anchorDate
        : new Date();
  let displayTopMessages = [];
  let displayTopVoice = [];
  let displayTopMinigame = [];
  let messageRows = [buildEmptyLine("messaggi")];
  let voiceRows = [buildEmptyLine("exp vocale")];
  let minigameRows = [];
  let awarded = { messageWinner: null, voiceWinner: null, minigameWinner: null };
  let minigameRankWeekKey = "";
  if (!skipNormalWeekly) {
    const rowsSource =
      mode === "daily"
        ? await loadDailyRowsFromHourlyWindow(guild, now)
        : await loadWeeklyRowsFromHourlyWindow(guild, now);
    let messageDocs = rowsSource.filter((row) => Number(row?.messageCount || 0) > 0).sort((a, b) => Number(b.messageCount || 0) - Number(a.messageCount || 0)).slice(0, 200);
    let voiceDocs = rowsSource.filter((row) => Number(row?.voiceExp || 0) > 0).sort((a, b) => Number(b.voiceExp || 0) - Number(a.voiceExp || 0)).slice(0, 200);
    if (mode === "weekly") {
      const weekPeriodEndMs = getLastSunday21BoundaryMsAtOrBefore(now);
      const weekPeriodStartMs = weekPeriodEndMs - 7 * 24 * 60 * 60 * 1000;
      const mvIds = [
        ...new Set(
          [...messageDocs.map((r) => String(r.userId)), ...voiceDocs.map((r) => String(r.userId))].filter(Boolean),
        ),
      ];
      const staffByUserId = new Map();
      if (mvIds.length) {
        const profs = await ActivityUserProfile.find({ guildId: guild.id, userId: { $in: mvIds } })
          .select("userId staff.rolesHistory")
          .lean()
          .catch(() => []);
        for (const p of profs) {
          staffByUserId.set(String(p.userId), p.staff);
        }
      }
      const notStaffThatWeek = (uid) =>
        !wasStaffDuringWeeklyActivityWindow(
          staffByUserId.get(String(uid)),
          weekPeriodStartMs,
          weekPeriodEndMs,
          WEEKLY_WINNERS_EXCLUDED_ROLE_IDS,
        );
      messageDocs = messageDocs.filter((row) => notStaffThatWeek(row.userId));
      voiceDocs = voiceDocs.filter((row) => notStaffThatWeek(row.userId));
    }
    const topMessages = await resolveTopThreeUsers(client, guild, messageDocs, (doc) => Number(doc?.messageCount || 0), 10);
    const topVoice = await resolveTopThreeUsers(client, guild, voiceDocs, (doc) => Number(doc?.voiceExp || 0), 10);
    const dedupe = deduplicateTopTwoLists(topMessages.slice(0, 3), topVoice.slice(0, 3), topMessages, topVoice, 3);
    displayTopMessages = uniqueRankingByUserId(dedupe.listA, 3);
    displayTopVoice = uniqueRankingByUserId(dedupe.listB, 3);
    messageRows = displayTopMessages.length
      ? displayTopMessages.map((item, index) => formatRankLine(index, `<@${item.userId}>`, item.value, "messaggi"))
      : [buildEmptyLine("messaggi")];
    voiceRows = displayTopVoice.length
      ? displayTopVoice.map((item, index) => formatRankLine(index, `<@${item.userId}>`, item.value, "exp"))
      : [buildEmptyLine("exp vocale")];
    if (mode === "weekly") {
      const weekPeriodEndMs = getLastSunday21BoundaryMsAtOrBefore(now);
      const weekPeriodStartMs = weekPeriodEndMs - 7 * 24 * 60 * 60 * 1000;
      minigameRankWeekKey = String(options.weekKey || getLastCompletedWeekKey(now) || "").trim();
      const minigameDocsRaw = await ActivityUserProfile.find({
        guildId: guild.id,
        $or: [
          {
            "profile.totals.exp.minigame.weeklyKey": minigameRankWeekKey,
            "profile.totals.exp.minigame.weeklyExp": { $gt: 0 },
          },
          {
            "profile.totals.exp.minigame.prevWeekKey": minigameRankWeekKey,
            "profile.totals.exp.minigame.prevWeekExp": { $gt: 0 },
          },
        ],
      })
        .select("userId profile.totals.exp.minigame staff.rolesHistory")
        .limit(800)
        .lean()
        .catch(() => []);
      minigameDocsRaw.sort(
        (a, b) => effectiveMinigameWeeklyScoreForRankWeek(b, minigameRankWeekKey) - effectiveMinigameWeeklyScoreForRankWeek(a, minigameRankWeekKey),
      );
      const minigameDocs = minigameDocsRaw
        .slice(0, 450)
        .filter(
          (d) =>
            !wasStaffDuringWeeklyActivityWindow(d?.staff, weekPeriodStartMs, weekPeriodEndMs, WEEKLY_WINNERS_EXCLUDED_ROLE_IDS),
        );
      const mgScore = (doc) => effectiveMinigameWeeklyScoreForRankWeek(doc, minigameRankWeekKey);
      const topMinigame = await resolveTopThreeUsers(client, guild, minigameDocs, mgScore, 10);
      displayTopMinigame = uniqueRankingByUserId(topMinigame, 3);
      const rawPool = minigameDocsRaw.slice(0, 450);
      if (!displayTopMinigame.length && rawPool.some((d) => mgScore(d) > 0)) {
        const forced = await resolveMinigameTopForced(client, guild, rawPool, mgScore, 10);
        displayTopMinigame = uniqueRankingByUserId(forced, 3);
      }
      minigameRows = displayTopMinigame.length
        ? displayTopMinigame.map((item, index) => formatRankLine(index, `<@${item.userId}>`, item.value, "pt minigame"))
        : [buildEmptyLine("minigames")];
    }
    if (options.skipWeeklyRoles) {
      const chosenUserIds = new Set();
      const messageWinner = pickFirstAvailable(displayTopMessages, chosenUserIds);
      if (messageWinner) chosenUserIds.add(messageWinner.userId);
      const voiceWinner = pickFirstAvailable(displayTopVoice, chosenUserIds);
      if (voiceWinner) chosenUserIds.add(voiceWinner.userId);
      const minigameWinner =
        mode === "weekly" && displayTopMinigame.length ? pickFirstAvailable(displayTopMinigame, chosenUserIds) : null;
      awarded = { messageWinner, voiceWinner, minigameWinner };
    } else {
      awarded = await updateWeeklyWinnerRoles(
        guild,
        displayTopMessages,
        displayTopVoice,
        mode === "weekly" ? displayTopMinigame : false,
      );
    }
  }
  if (skipNormalWeekly) return;
  const embedDescLines = [
    `<:VC_Leaderboard:1482534806314287387> // I vantaggi che avete sbloccato sono sul [nostro sito](https://viniliecaffe.it/perks)`,
    "",
    `<a:VC_HeartsPink:1468685897389052008> • **Classifica testuale:**`,
    ...messageRows,
    "",
    `<a:VC_HeartsBlue:1468686100045369404> • **Classifica vocale:**`,
    ...voiceRows,
  ];
  if (mode === "weekly" && minigameRows.length) {
    embedDescLines.push("", `<a:VC_Events:1482706144953897223> • **Classifica minigames:**`, ...minigameRows);
  }
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(embedDescLines.join("\n"))
    .setThumbnail(guildIconUrl(guild, { size: 256 }) || null);
  const messageWinnerTotal = Number(awarded?.messageWinner?.value || 0);
  const voiceWinnerTotal = Number(awarded?.voiceWinner?.value || 0);
  const minigameWinnerTotal = Number(awarded?.minigameWinner?.value || 0);
  const messageWinnerMention = awarded?.messageWinner?.userId ? `<@${awarded.messageWinner.userId}>` : "Nessun vincitore";
  const voiceWinnerMention = awarded?.voiceWinner?.userId ? `<@${awarded.voiceWinner.userId}>` : "Nessun vincitore";
  const minigameWinnerMention = awarded?.minigameWinner?.userId ? `<@${awarded.minigameWinner.userId}>` : "Nessun vincitore";
  const button = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Chat")
      .setStyle(ButtonStyle.Link)
      .setEmoji("<:VC_FrogCute:1331620415185096746>")
      .setURL("https://discord.com/channels/1329080093599076474/1442569130573303898"),
    new ButtonBuilder()
      .setLabel("Vocal")
      .setStyle(ButtonStyle.Link)
      .setEmoji("<:VC_FrogJuice:1331620486517358613>")
      .setURL("https://discord.com/channels/1329080093599076474/1442569101225496819"),
  );
  const isDailyIntro = mode === "daily";
  const introLine = isDailyIntro
    ? "<a:VC_Winner:1482535294757507255> Ciao a tutti! Ecco la Top 3 utenti più attivi di oggi."
    : "<a:VC_Winner:1482535294757507255> Ciao a tutti! Annunciamo i vincitori di questa settimana per attività.";
  const minigameAnnounceLine =
    mode === "weekly" && MINIGAME_WINNER_ROLE_ID
      ? `\n<a:VC_Arrow:1482706699365257397> Con un totale di **${minigameWinnerTotal} pt**, ${minigameWinnerMention} ottieni il primo posto per **__minigames__** e il ruolo <@&${MINIGAME_WINNER_ROLE_ID}>.`
      : "";
  const payload = {
    content: `<@&1442568949605597264>
${introLine}

<a:VC_Arrow:1482706699365257397> Con un totale di **${messageWinnerTotal} messaggi**, ${messageWinnerMention} ottieni il primo posto per **__chat testuale__**.
<a:VC_Arrow:1482706699365257397> Con un totale di **${voiceWinnerTotal} exp**, ${voiceWinnerMention} ottieni il primo posto per **__chat vocale__**.${minigameAnnounceLine}
_ _`,
    embeds: [embed],
    components: [button],
  };
  if (typeof options.dryRunLogger === "function") {
    try {
      options.dryRunLogger({
        mode,
        guildId: guild?.id || null,
        minigameRankWeekKey: minigameRankWeekKey || null,
        skipDiscordSends: Boolean(options.skipDiscordSends),
        skipWeeklyRoles: Boolean(options.skipWeeklyRoles),
        awarded,
        displayTopMessages,
        displayTopVoice,
        displayTopMinigame,
        messageRows,
        voiceRows,
        minigameRows,
        embedDescription: embedDescLines.join("\n"),
        payloadContent: payload.content,
      });
    } catch (e) {
      global.logger?.warn?.("[WEEKLY ACTIVITY] dryRunLogger:", e?.message || e);
    }
  }
  const discordTarget = editMessage || channel;
  if (!options.skipDiscordSends && discordTarget) {
    try {
      if (editMessage) {
        await editMessage.edit(payload);
      } else {
        await channel.send(payload);
      }
    } catch (error) {
      global.logger.error(
        editMessage ? "[WEEKLY ACTIVITY] Failed to edit winners message:" : "[WEEKLY ACTIVITY] Failed to send winners message:",
        error,
      );
    }
  }
}

async function publishMonthlyActivityWinners(client, options = {}) {
  const mainGuildId = String(IDs.guilds?.main || "");
  let guild =
    mainGuildId &&
    (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null)));
  const channelIdToUse = options.targetChannelId || TARGET_CHANNEL_ID;
  if (!guild) {
    const channel =
      client.channels.cache.get(channelIdToUse) || (await getClientChannelCached(client, channelIdToUse, { ttlMs: 60_000 }));
    if (!channel?.guild) {
      global.logger?.error?.("[MONTHLY ACTIVITY] Publish skipped: guild not found (main o canale top weekly).");
      return;
    }
    guild = channel.guild;
  }
  const channel =
    client.channels.cache.get(channelIdToUse) || (await getClientChannelCached(client, channelIdToUse, { ttlMs: 60_000 }));
  if (!channel?.guild) {
    global.logger?.error?.("[MONTHLY ACTIVITY] Publish skipped: canale top weekly non trovato.", channelIdToUse);
    return;
  }
  const anchor =
    options.anchorDate instanceof Date && !Number.isNaN(options.anchorDate.getTime()) ? options.anchorDate : new Date();
  let rankedYear;
  let rankedMonth;
  if (options.rankedYear != null && options.rankedMonth != null) {
    rankedYear = Number(options.rankedYear);
    rankedMonth = Number(options.rankedMonth);
  } else {
    const prev = getPreviousRomeCalendarMonth(anchor);
    rankedYear = prev.year;
    rankedMonth = prev.month;
  }
  if (!Number.isFinite(rankedYear) || !Number.isFinite(rankedMonth) || rankedMonth < 1 || rankedMonth > 12) {
    global.logger?.error?.("[MONTHLY ACTIVITY] Publish skipped: mese non valido.", rankedYear, rankedMonth);
    return;
  }
  const monthNameLabel = `${IT_MONTH_NAMES[rankedMonth - 1] || ""} ${rankedYear}`.trim();
  const rows = await loadMonthlyRowsFromRomeCalendarMonth(guild, rankedYear, rankedMonth);
  const augmented = rows.map((r) => {
    const textExp = Math.max(0, Math.floor(Number(r.messageCount || 0) * MESSAGE_EXP));
    const voiceExp = Math.max(0, Math.floor(Number(r.voiceExp || 0)));
    return {
      userId: r.userId,
      textExp,
      voiceExp,
      totalExp: textExp + voiceExp,
    };
  });
  const combinedDocs = augmented
    .filter((row) => Number(row.totalExp || 0) > 0)
    .sort((a, b) => Number(b.totalExp || 0) - Number(a.totalExp || 0))
    .slice(0, 200);
  const topCombined = await resolveTopThreeUsers(client, guild, combinedDocs, (doc) => Number(doc?.totalExp || 0), 10);
  const displayTopCombined = uniqueRankingByUserId(topCombined, 3);
  const combinedRows = displayTopCombined.length
    ? displayTopCombined.map((item, index) => formatRankLine(index, `<@${item.userId}>`, item.value, "exp totali"))
    : [buildEmptyLine("EXP totali (chat + vocale)")];
  let awarded = { topMonthlyWinner: null, monthlyTopSecond: null, monthlyTopThird: null, monthlyVotersTop: [] };
  if (options.skipMonthlyRoles) {
    awarded = {
      topMonthlyWinner: displayTopCombined[0] || null,
      monthlyTopSecond: displayTopCombined[1] || null,
      monthlyTopThird: displayTopCombined[2] || null,
    };
  } else {
    awarded = await updateMonthlyWinnerRoles(guild, displayTopCombined);
  }
  const monthlyVotersTop = await resolvePreviousMonthTopVoters(client, guild);
  awarded.monthlyVotersTop = monthlyVotersTop;
  if (!options.skipMonthlyRoles) {
    await cleanupExpiredMonthlyVoterRewards(guild).catch(() => null);
    await cleanupExpiredMonthlyTopRewards(guild).catch(() => null);
    await assignMonthlyVoterRewards(guild, monthlyVotersTop).catch(() => null);
    await assignMonthlyTopRewards(guild, displayTopCombined).catch(() => null);
  }
  const voterRows = monthlyVotersTop.length
    ? monthlyVotersTop.map((item, index) => {
      const rewardLabel = index === 0
        ? "VIP+ (30g)"
        : index === 1
          ? "VIP (30g)"
          : "Donator (30g)";
      return `${TROPHY_LABELS[index] || TROPHY_LABELS[2] || "<:VC_Podio3:1482694450806259744>"} <@${item.userId}> <a:VC_Arrow:1482706699365257397> **${item.value}** *voti* · \`${rewardLabel}\``;
    })
    : [buildEmptyLine("voti del mese scorso")];
  const monthlyRewardRows = [
    displayTopCombined[0]?.userId
      ? `${TROPHY_LABELS[0] || "<:VC_Podio1:1482694399283433582>"} <@${displayTopCombined[0].userId}> <a:VC_Arrow:1482706699365257397> <@&${MONTHLY_MEMBER_ROLE_ID}> + **Nitro Boost**`
      : `${TROPHY_LABELS[0] || "<:VC_Podio1:1482694399283433582>"} Nessun vincitore`,
    displayTopCombined[1]?.userId
      ? `${TROPHY_LABELS[1] || "<:VC_Podio2:1482694424411635712>"} <@${displayTopCombined[1].userId}> <a:VC_Arrow:1482706699365257397> **VIP+ (30 giorni) + Decorazione a scolta (max 15,99€)**`
      : `${TROPHY_LABELS[1] || "<:VC_Podio2:1482694424411635712>"} Nessun vincitore`,
    displayTopCombined[2]?.userId
      ? `${TROPHY_LABELS[2] || "<:VC_Podio3:1482694450806259744>"} <@${displayTopCombined[2].userId}> <a:VC_Arrow:1482706699365257397> **VIP (30 giorni) + Nitro Basic**`
      : `${TROPHY_LABELS[2] || "<:VC_Podio3:1482694450806259744>"} Nessun vincitore`,
  ];
  const embedDescLines = [
    `<:VC_Leaderboard:1482534806314287387> // **${monthNameLabel}** — I vantaggi che avete sbloccato sono sul [nostro sito](https://viniliecaffe.it/perks)`,
    "",
    `<a:VC_HeartsPink:1468685897389052008> • **Classifica mensile EXP totale:**`,
    ...combinedRows,
    "",
    `<a:VC_Winner:1482535294757507255> • **Premi Top Monthly:**`,
    ...monthlyRewardRows,
    "",
    `<a:VC_HeartsBlue:1468686100045369404> • **Top Voters:**`,
    ...voterRows,
  ];
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(embedDescLines.join("\n"))
    .setThumbnail(guildIconUrl(guild, { size: 256 }) || null);
  const winnerTotal = Number(awarded?.topMonthlyWinner?.value || 0);
  const winnerMention = awarded?.topMonthlyWinner?.userId ? `<@${awarded.topMonthlyWinner.userId}>` : "Nessun vincitore";
  const secondTotal = Number(awarded?.monthlyTopSecond?.value || 0);
  const secondMention = awarded?.monthlyTopSecond?.userId ? `<@${awarded.monthlyTopSecond.userId}>` : null;
  const thirdTotal = Number(awarded?.monthlyTopThird?.value || 0);
  const thirdMention = awarded?.monthlyTopThird?.userId ? `<@${awarded.monthlyTopThird.userId}>` : null;
  const button = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Chat")
      .setStyle(ButtonStyle.Link)
      .setEmoji("<:VC_FrogCute:1331620415185096746>")
      .setURL("https://discord.com/channels/1329080093599076474/1442569130573303898"),
    new ButtonBuilder()
      .setLabel("Vocal")
      .setStyle(ButtonStyle.Link)
      .setEmoji("<:VC_FrogJuice:1331620486517358613>")
      .setURL("https://discord.com/channels/1329080093599076474/1442569101225496819"),
    new ButtonBuilder()
      .setLabel("Vota")
      .setStyle(ButtonStyle.Link)
      .setEmoji("<a:VC_Vote:1482535223001485473>")
      .setURL("https://www.viniliecaffe.it/vote"),
  );
  if (!options.skipDiscordSends && channel) {
    const roleMention = MONTHLY_MEMBER_ROLE_ID ? `<@&${MONTHLY_MEMBER_ROLE_ID}>` : "il ruolo Top Monthly";
    const introLine = `<a:VC_Winner:1482535294757507255> Ciao a tutti! Annunciamo i vincitori del mese.`;
    const votersRoleTextByIndex = ["VIP+", "VIP", "Donator"];
    const voter1 = monthlyVotersTop[0];
    const voter2 = monthlyVotersTop[1];
    const voter3 = monthlyVotersTop[2];
    const votersTextLine = monthlyVotersTop.length
      ? [
        "\n<a:VC_Arrow:1482706699365257397> **Top Voters:**",
        voter1
          ? `<a:VC_Arrow:1482706699365257397> ${TROPHY_LABELS[0] || "<:VC_Podio1:1482694399283433582>"} <@${voter1.userId}> · **${voter1.value} voti** · ${votersRoleTextByIndex[0]} 30 giorni`
          : null,
        voter2
          ? `<a:VC_Arrow:1482706699365257397> ${TROPHY_LABELS[1] || "<:VC_Podio2:1482694424411635712>"} <@${voter2.userId}> · **${voter2.value} voti** · ${votersRoleTextByIndex[1]} 30 giorni`
          : null,
        voter3
          ? `<a:VC_Arrow:1482706699365257397> ${TROPHY_LABELS[2] || "<:VC_Podio3:1482694450806259744>"} <@${voter3.userId}> · **${voter3.value} voti** · ${votersRoleTextByIndex[2]} 30 giorni`
          : null,
      ].filter(Boolean).join("\n")
      : "";
    const roleLine =
      awarded?.topMonthlyWinner?.userId && MONTHLY_MEMBER_ROLE_ID
        ? `\n<a:VC_Arrow:1482706699365257397> Il primo in classifica riceve ${roleMention} e un **Nitro Boost** riscattabile tramite <#1442569095068254219> \`HIGH STAFF\`.`
        : "";
    const secondLine = secondMention
      ? `\n<a:VC_Arrow:1482706699365257397> Con un totale di **${secondTotal} EXP**, ${secondMention} ottiene il secondo posto e riceve **VIP+ per 30 giorni** e una **Decorazione a scolta (max 15,99€)** riscattabile tramite <#1442569095068254219> \`HIGH STAFF\`..`
      : "";
    const thirdLine = thirdMention
      ? `\n<a:VC_Arrow:1482706699365257397> Con un totale di **${thirdTotal} EXP**, ${thirdMention} ottiene il terzo posto e riceve **VIP per 30 giorni** e un **Nitro Basic** riscattabile tramite <#1442569095068254219> \`HIGH STAFF\`..`
      : "";
    try {
      await channel.send({
        content: `<@&1442568949605597264>
${introLine}

<a:VC_Arrow:1482706699365257397> Con un totale di **${winnerTotal} EXP**, ${winnerMention} ottiene il primo posto della **__classifica mensile__**.
${roleLine}
${secondLine}
${thirdLine}
${votersTextLine}
_ _`,
        embeds: [embed],
        components: [button],
      });
    } catch (error) {
      global.logger.error("[MONTHLY ACTIVITY] Failed to send winners message:", error);
    }
  }
}

function previousMonthKeyRome(now = new Date()) {
  const p = getPreviousRomeCalendarMonth(now);
  return `${p.year}-${pad2(p.month)}`;
}

async function resolvePreviousMonthTopVoters(client, guild) {
  const monthKey = previousMonthKeyRome(new Date());
  const docs = await ActivityUserProfile.find({
    guildId: guild.id,
    "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountMonthKey": monthKey,
    $or: [
      { "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountTopgg": { $gt: 0 } },
      { "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountDiscadia": { $gt: 0 } },
    ],
  })
    .select("userId profile.totals.exp.bumpVoteRewards.discadia_vote")
    .lean()
    .catch(() => []);
  const sorted = docs
    .map((doc) => {
      const vote = doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote || {};
      const total = Math.max(0, Number(vote.voteCountTopgg || 0)) + Math.max(0, Number(vote.voteCountDiscadia || 0));
      return { ...doc, _voteTotal: total };
    })
    .filter((doc) => Number(doc?._voteTotal || 0) > 0)
    .sort((a, b) => Number(b._voteTotal || 0) - Number(a._voteTotal || 0))
    .slice(0, 200);
  return resolveTopThreeUsers(
    client,
    guild,
    sorted,
    (doc) => Number(doc?._voteTotal || 0),
    3,
    WEEKLY_WINNERS_EXCLUDED_ROLE_IDS,
  );
}

function monthlyVoterRewardRoleByRank(rankIndex) {
  if (rankIndex === 0) return MONTHLY_VOTER_ROLE_RANK_1;
  if (rankIndex === 1) return MONTHLY_VOTER_ROLE_RANK_2;
  if (rankIndex === 2) return MONTHLY_VOTER_ROLE_RANK_3;
  return null;
}

async function cleanupExpiredMonthlyVoterRewards(guild) {
  const now = new Date();
  const nowMs = Date.now();
  const rows = await ActivityUserProfile.find({
    guildId: guild.id,
    [`${MONTHLY_VOTER_REWARD_PATH}.expiresAt`]: { $lte: now },
  })
    .select(`userId ${MONTHLY_VOTER_REWARD_PATH} ${MONTHLY_TOP_REWARD_PATH}`)
    .lean()
    .catch(() => []);
  for (const row of rows) {
    const userId = String(row?.userId || "");
    const reward = row?.profile?.totals?.exp?.monthlyVoteTopReward || null;
    const roleId = String(reward?.roleId || "");
    const hadRoleBefore = Boolean(reward?.hadRoleBefore);
    const keepByTopReward = hasActiveMonthlyTopRewardOnRole(row, roleId, nowMs);
    if (userId && roleId && !hadRoleBefore && !keepByTopReward) {
      const member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
      if (member?.roles?.cache?.has(roleId)) {
        await member.roles.remove(roleId).catch(() => null);
      }
    }
    await ActivityUserProfile.updateOne(
      { guildId: guild.id, userId },
      { $unset: { [MONTHLY_VOTER_REWARD_PATH]: "" } },
    ).catch(() => null);
  }
}

async function assignMonthlyVoterRewards(guild, ranking) {
  const now = Date.now();
  for (let i = 0; i < Math.min(3, Array.isArray(ranking) ? ranking.length : 0); i += 1) {
    const row = ranking[i];
    const userId = String(row?.userId || "");
    const roleId = String(monthlyVoterRewardRoleByRank(i) || "");
    if (!userId || !roleId) continue;
    const member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
    if (!member) continue;
    const existing = await ActivityUserProfile.findOne({ guildId: guild.id, userId })
      .select(MONTHLY_VOTER_REWARD_PATH)
      .lean()
      .catch(() => null);
    const existingReward = existing?.profile?.totals?.exp?.monthlyVoteTopReward || null;
    const existingRoleId = String(existingReward?.roleId || "");
    const existingHadRoleBefore = Boolean(existingReward?.hadRoleBefore);
    if (existingRoleId && existingRoleId !== roleId && !existingHadRoleBefore && member.roles.cache.has(existingRoleId)) {
      await member.roles.remove(existingRoleId).catch(() => null);
    }
    const hadRoleBefore = member.roles.cache.has(roleId);
    if (!hadRoleBefore) {
      await member.roles.add(roleId).catch(() => null);
    }
    await ActivityUserProfile.updateOne(
      { guildId: guild.id, userId },
      {
        $set: {
          [`${MONTHLY_VOTER_REWARD_PATH}.rank`]: i + 1,
          [`${MONTHLY_VOTER_REWARD_PATH}.roleId`]: roleId,
          [`${MONTHLY_VOTER_REWARD_PATH}.awardedAt`]: new Date(now),
          [`${MONTHLY_VOTER_REWARD_PATH}.expiresAt`]: new Date(now + MONTHLY_VOTER_REWARD_DURATION_MS),
          [`${MONTHLY_VOTER_REWARD_PATH}.hadRoleBefore`]: hadRoleBefore,
          [`${MONTHLY_VOTER_REWARD_PATH}.monthKey`]: voteCountMonthKeyRome(new Date(now)),
        },
      },
    ).catch(() => null);
  }
}

function monthlyTopRewardRoleByRank(rankIndex) {
  if (rankIndex === 1) return MONTHLY_TOP_REWARD_ROLE_RANK_2;
  if (rankIndex === 2) return MONTHLY_TOP_REWARD_ROLE_RANK_3;
  return null;
}

function hasActiveMonthlyTopRewardOnRole(profile, roleId, now = Date.now()) {
  const role = String(roleId || "");
  if (!role) return false;
  const reward = profile?.profile?.totals?.exp?.monthlyTopReward || null;
  if (String(reward?.roleId || "") !== role) return false;
  const expiresAt = Number(new Date(reward?.expiresAt || 0).getTime() || 0);
  return expiresAt > now;
}

function hasActiveMonthlyVoterRewardOnRole(profile, roleId, now = Date.now()) {
  const role = String(roleId || "");
  if (!role) return false;
  const reward = profile?.profile?.totals?.exp?.monthlyVoteTopReward || null;
  if (String(reward?.roleId || "") !== role) return false;
  const expiresAt = Number(new Date(reward?.expiresAt || 0).getTime() || 0);
  return expiresAt > now;
}

async function cleanupExpiredMonthlyTopRewards(guild) {
  const now = new Date();
  const nowMs = Date.now();
  const rows = await ActivityUserProfile.find({
    guildId: guild.id,
    [`${MONTHLY_TOP_REWARD_PATH}.expiresAt`]: { $lte: now },
  })
    .select(`userId ${MONTHLY_TOP_REWARD_PATH} ${MONTHLY_VOTER_REWARD_PATH}`)
    .lean()
    .catch(() => []);
  for (const row of rows) {
    const userId = String(row?.userId || "");
    const reward = row?.profile?.totals?.exp?.monthlyTopReward || null;
    const roleId = String(reward?.roleId || "");
    const hadRoleBefore = Boolean(reward?.hadRoleBefore);
    const keepByVoterReward = hasActiveMonthlyVoterRewardOnRole(row, roleId, nowMs);
    if (userId && roleId && !hadRoleBefore && !keepByVoterReward) {
      const member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
      if (member?.roles?.cache?.has(roleId)) {
        await member.roles.remove(roleId).catch(() => null);
      }
    }
    await ActivityUserProfile.updateOne(
      { guildId: guild.id, userId },
      { $unset: { [MONTHLY_TOP_REWARD_PATH]: "" } },
    ).catch(() => null);
  }
}

async function assignMonthlyTopRewards(guild, ranking) {
  const now = Date.now();
  for (let i = 1; i <= 2; i += 1) {
    const row = Array.isArray(ranking) ? ranking[i] : null;
    const userId = String(row?.userId || "");
    const roleId = String(monthlyTopRewardRoleByRank(i) || "");
    if (!userId || !roleId) continue;
    const member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
    if (!member) continue;
    const existing = await ActivityUserProfile.findOne({ guildId: guild.id, userId })
      .select(`${MONTHLY_TOP_REWARD_PATH} ${MONTHLY_VOTER_REWARD_PATH}`)
      .lean()
      .catch(() => null);
    const existingReward = existing?.profile?.totals?.exp?.monthlyTopReward || null;
    const existingRoleId = String(existingReward?.roleId || "");
    const existingHadRoleBefore = Boolean(existingReward?.hadRoleBefore);
    const keepByVoterReward = hasActiveMonthlyVoterRewardOnRole(existing, existingRoleId, now);
    if (
      existingRoleId &&
      existingRoleId !== roleId &&
      !existingHadRoleBefore &&
      !keepByVoterReward &&
      member.roles.cache.has(existingRoleId)
    ) {
      await member.roles.remove(existingRoleId).catch(() => null);
    }
    const hadRoleBefore = member.roles.cache.has(roleId);
    if (!hadRoleBefore) {
      await member.roles.add(roleId).catch(() => null);
    }
    await ActivityUserProfile.updateOne(
      { guildId: guild.id, userId },
      {
        $set: {
          [`${MONTHLY_TOP_REWARD_PATH}.rank`]: i + 1,
          [`${MONTHLY_TOP_REWARD_PATH}.roleId`]: roleId,
          [`${MONTHLY_TOP_REWARD_PATH}.awardedAt`]: new Date(now),
          [`${MONTHLY_TOP_REWARD_PATH}.expiresAt`]: new Date(now + MONTHLY_TOP_REWARD_DURATION_MS),
          [`${MONTHLY_TOP_REWARD_PATH}.hadRoleBefore`]: hadRoleBefore,
          [`${MONTHLY_TOP_REWARD_PATH}.monthKey`]: voteCountMonthKeyRome(new Date(now)),
        },
      },
    ).catch(() => null);
  }
}

async function resetWeeklyActivityCounters(client, options = {}) {
  const channel = client.channels.cache.get(TARGET_CHANNEL_ID) || (await getClientChannelCached(client, TARGET_CHANNEL_ID, { ttlMs: 60_000 }));
  const guildId = channel?.guild?.id;
  if (!guildId) {
    global.logger?.error?.("[WEEKLY ACTIVITY] Reset skipped: channel or guild not found.", TARGET_CHANNEL_ID);
    return;
  }
  const now = new Date();
  const nextWeekKey = String(options.nextWeekKey != null ? options.nextWeekKey : getWeekKey(now));
  await ActivityUserProfile.updateMany(
    { guildId },
    [
      {
        $set: {
          "profile.totals.messagesWeekly": 0,
          "profile.totals.messagesWeeklyKey": nextWeekKey,
          "profile.totals.voiceWeeklySeconds": 0,
          "profile.totals.voiceWeeklyKey": nextWeekKey,
          "profile.totals.exp.weeklyExp": 0,
          "profile.totals.exp.weeklyKey": nextWeekKey,
          "profile.totals.exp.minigame.prevWeekKey": { $ifNull: ["$profile.totals.exp.minigame.weeklyKey", ""] },
          "profile.totals.exp.minigame.prevWeekExp": { $ifNull: ["$profile.totals.exp.minigame.weeklyExp", 0] },
          "profile.totals.exp.minigame.weeklyExp": 0,
          "profile.totals.exp.minigame.weeklyKey": nextWeekKey,
        },
      },
    ],
  );
}

async function refreshLatestWeeklyWinnersPostForCurrentWeek(client) {
  if (!client?.user?.id) return;
  const channel =
    client.channels.cache.get(TARGET_CHANNEL_ID) || (await getClientChannelCached(client, TARGET_CHANNEL_ID, { ttlMs: 60_000 }));
  if (!channel?.messages?.fetch) return;
  const boundaryMs = getLastSunday21BoundaryMsAtOrBefore(new Date());
  const fetched = await channel.messages.fetch({ limit: 40 }).catch(() => null);
  if (!fetched?.size) return;
  const botId = String(client.user.id);
  const candidates = [];
  for (const msg of fetched.values()) {
    if (Number(msg?.createdTimestamp || 0) < boundaryMs) continue;
    if (String(msg?.author?.id || "") !== botId) continue;
    if (!String(msg?.content || "").includes(WEEKLY_WINNERS_PUBLISH_INTRO_MARK)) continue;
    candidates.push(msg);
  }
  if (!candidates.length) return;
  candidates.sort((a, b) => Number(b.createdTimestamp || 0) - Number(a.createdTimestamp || 0));
  const target = candidates[0];
  try {
    await publishWeeklyActivityWinners(client, {
      editMessage: target,
      skipWeeklyRoles: true,
      mode: "weekly",
    });
    global.logger?.info?.("[WEEKLY ACTIVITY] Post top weekly aggiornato (classifiche coerenti con le regole attuali).");
  } catch (err) {
    global.logger?.error?.("[WEEKLY ACTIVITY] Aggiornamento post top weekly fallito:", err);
  }
}

let weeklyActivityWinnersLoopStarted = false;
function startWeeklyActivityWinnersLoop(client) {
  if (weeklyActivityWinnersLoopStarted) return;
  weeklyActivityWinnersLoopStarted = true;
  cron.schedule(
    "0 21 * * 0",
    async () => {
      try {
        await publishWeeklyActivityWinners(client);
        await resetWeeklyActivityCounters(client);
      } catch (error) {
        global.logger.error("[WEEKLY ACTIVITY] Scheduled execution failed:", error);
      }
    },
    { timezone: TIME_ZONE },
  );
  cron.schedule(
    "0 21 1 * *",
    async () => {
      try {
        await publishMonthlyActivityWinners(client);
      } catch (error) {
        global.logger.error("[MONTHLY ACTIVITY] Scheduled execution failed:", error);
      }
    },
    { timezone: TIME_ZONE },
  );
  cron.schedule(
    "5 0 * * *",
    async () => {
      try {
        const mainGuildId = String(IDs.guilds?.main || "");
        const guild =
          (mainGuildId && (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null)))) ||
          null;
        if (!guild) return;
        await cleanupExpiredMonthlyVoterRewards(guild);
        await cleanupExpiredMonthlyTopRewards(guild);
      } catch (error) {
        global.logger.error("[MONTHLY REWARDS] Daily expiry cleanup failed:", error);
      }
    },
    { timezone: TIME_ZONE },
  );
  const wasWeeklyPostAlreadyPublishedAfterBoundary = async (channel, boundaryMs) => {
    if (!channel?.messages?.fetch || !client?.user?.id || !Number.isFinite(boundaryMs)) return false;
    const fetched = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!fetched?.size) return false;
    for (const msg of fetched.values()) {
      if (Number(msg?.createdTimestamp || 0) < boundaryMs) continue;
      if (String(msg?.author?.id || "") !== String(client.user.id)) continue;
      const content = String(msg?.content || "");
      if (!content.includes(WEEKLY_WINNERS_PUBLISH_INTRO_MARK)) continue;
      return true;
    }
    return false;
  };
  const runRecoveryIfNeeded = async () => {
    const now = new Date();
    const channel = client.channels.cache.get(TARGET_CHANNEL_ID) || (await getClientChannelCached(client, TARGET_CHANNEL_ID, { ttlMs: 60_000 }));
    const gid = channel?.guild?.id;
    if (!gid) {
      global.logger?.warn?.(
        "[WEEKLY ACTIVITY] Recovery skipped: canale top weekly non risolto al boot.",
        String(TARGET_CHANNEL_ID || ""),
      );
      return;
    }
    const lastSunday21BoundaryMs = getLastSunday21BoundaryMsAtOrBefore(now);
    const alreadyPublished = await wasWeeklyPostAlreadyPublishedAfterBoundary(channel, lastSunday21BoundaryMs);
    if (alreadyPublished) return;
    const currentWeekKey = getWeekKey(now);
    const previousWeekKey = getLastCompletedWeekKey(now);
    try {
      global.logger.info("[WEEKLY ACTIVITY] Recovery: running missed weekly winners (bot was likely offline Sunday 21:00).");
      /* Di domenica ISO `previousWeekKey` coincide con `currentWeekKey` (ultima domenica = “oggi”):
       * il vecchio `return` bloccava per sempre la recovery dopo il 21:00 domenica mancato. */
      if (previousWeekKey !== currentWeekKey) {
        await publishWeeklyActivityWinners(client, { weekKey: previousWeekKey });
        await resetWeeklyActivityCounters(client, { nextWeekKey: currentWeekKey });
      } else {
        await publishWeeklyActivityWinners(client);
        await resetWeeklyActivityCounters(client);
      }
    } catch (error) {
      global.logger.error("[WEEKLY ACTIVITY] Recovery run failed:", error);
    }
  };
  /* Nessuna recovery mensile al boot: con canale senza storico o testo intro diverso,
   * scambiava per “mancato” il post e lanciava publishMonthlyActivityWinners subito al riavvio.
   * Il cron `0 21 1 * *` basta; se serve un mese perso: publishMonthlyActivityWinners(client) a mano. */
  setTimeout(() => {
    runRecoveryIfNeeded()
      .catch((err) => global.logger?.error?.("[WEEKLY ACTIVITY] Recovery on start failed:", err))
      .finally(() => {
        refreshLatestWeeklyWinnersPostForCurrentWeek(client).catch((err) =>
          global.logger?.error?.("[WEEKLY ACTIVITY] Weekly post refresh on start failed:", err),
        );
      });
  }, 15_000);
  setTimeout(async () => {
    try {
      const mainGuildId = String(IDs.guilds?.main || "");
      const guild =
        (mainGuildId && (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null)))) ||
        null;
      if (!guild) return;
      await cleanupExpiredMonthlyVoterRewards(guild);
      await cleanupExpiredMonthlyTopRewards(guild);
    } catch (err) {
      global.logger?.error?.("[MONTHLY REWARDS] Startup expiry cleanup failed:", err);
    }
  }, 20_000);
}

module.exports = {
  startWeeklyActivityWinnersLoop,
  publishWeeklyActivityWinners,
  publishMonthlyActivityWinners,
  resetWeeklyActivityCounters,
  refreshLatestWeeklyWinnersPostForCurrentWeek,
  getLastCompletedWeekKey,
  getDateKeysForWeekKey,
  getWeekKey,
};