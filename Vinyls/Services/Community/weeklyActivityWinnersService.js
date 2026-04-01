const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const cron = require("node-cron");
const { ActivityUserProfile, GlobalSettings } = require("../../Schemas/Community/communitySchemas");
const { VOICE_EXP_PER_MINUTE, getGuildExpSettings, invalidateSettingsCache, isEventStaffMember } = require("./expService");
const { getEventWeekNumber, getEventWeekRomeDateKeys, getCompletedEventWeekForSundayPayout, getLastSunday21BoundaryMsAtOrBefore, grantEventLevels, addEventWeekWinner, hasEventWeekWinnerGrant, getEventWeekHourKeys, getTop10ExpDuringEventExcludingHighStaff } = require("./activityEventRewardsService");
const { sendEventRewardLog, sendEventRewardDm } = require("./eventRewardLogService");
const { loadLiveVoiceSessions, secondsInDateKeys } = require("./activityService");
const BACKFILL_HOUR_SUFFIX = "T12";
function shouldSkipBackfillRow(hourKey, hourSet) {
  if (!hourKey || typeof hourKey !== "string") return false;
  if (!hourKey.endsWith(BACKFILL_HOUR_SUFFIX)) return false;
  const dateKey = hourKey.slice(0, -BACKFILL_HOUR_SUFFIX.length);
  return [...hourSet].some((k) => k.startsWith(`${dateKey}T`) && k !== hourKey);
}
const IDs = require("../../Utils/Config/ids");
const { isChannelInTicketCategory } = require("../../Utils/Ticket/ticketCategoryUtils");
const { getClientChannelCached, getClientGuildCached, getGuildChannelCached, getGuildMemberCached, getGuildRoleCached, getUserCached } = require("../../Utils/Interaction/interactionEntityCache");
const TIME_ZONE = "Europe/Rome";
const TARGET_CHANNEL_ID = IDs.channels.topWeeklyUser;
const EVENT_ANNOUNCEMENT_CHANNEL_ID = IDs.channels.eventAnnouncements;
const INFO_CHANNEL_ID = IDs.channels.info;
const TROPHY_LABELS = ["<:VC_Podio1:1482694399283433582>", "<:VC_Podio2:1482694424411635712>", "<:VC_Podio3:1482694450806259744>",];
const MESSAGE_WINNER_ROLE_ID = IDs.roles.TopWeeklyText;
const VOICE_WINNER_ROLE_ID = IDs.roles.TopWeeklyVoc;
const REQUIRED_MEMBER_ROLE_ID = String(IDs.roles.Member || "");
const EXCLUDED_ROLE_IDS = new Set([IDs.roles.Staff, IDs.roles.HighStaff,].filter(Boolean).map((id) => String(id)),);

const EVENT_WEEK3_SKIP_ROLE_IDS = [
  IDs.roles.ServerBooster,
  IDs.roles.vip,
  IDs.roles.Donator,
  IDs.roles.Level50,
  IDs.roles.Level70,
].filter(Boolean).map(String);

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

function getNextWeekKey(date) {
  const next = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  return getWeekKey(next);
}

function getWeekdayRome(date) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short", });
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
  if (!Number.isFinite(year) || !Number.isFinite(isoWeek) || isoWeek < 1)
    return [];

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

function getEventWeekDateKeys(settings, weekNum) {
  if (!settings?.eventStartedAt || !settings?.eventExpiresAt) return [];
  return getEventWeekRomeDateKeys(settings, weekNum);
}

function getEventWeekHourKeysFallback(settings, weekNum) {
  if (!settings?.eventStartedAt || !settings?.eventExpiresAt) return [];
  return getEventWeekHourKeys(settings, weekNum);
}

async function loadActivityRowsFromDateKeys(guild, dateKeys) {
  if (!dateKeys?.length) return [];
  const eligible = await getEligibleChannelSets(guild);
  if (!eligible.text.size && !eligible.voice.size) return [];
  const perUser = new Map();
  const rows = [];
  const profileDocs = await ActivityUserProfile.find({ guildId: guild.id }).select("userId profile.totals.daily").lean().catch(() => []);
  if (profileDocs.length) {
    const wanted = new Set(dateKeys.map(String));
    for (const doc of profileDocs) {
      const userId = String(doc?.userId || "");
      const daily = toObjectMap(doc?.profile?.totals?.daily || {});
      if (!userId) continue;
      for (const [dateKey, value] of Object.entries(daily)) {
        if (!wanted.has(String(dateKey))) continue;
        rows.push({
          userId,
          textChannels: toObjectMap(value?.textChannels || {}),
          voiceChannels: toObjectMap(value?.voiceChannels || {}),
        });
      }
    }
  }
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
    voiceSeconds: Math.max(0, Math.floor(row.voiceSeconds)),
  }));
}

async function loadActivityRowsFromHourKeys(guild, hourKeys) {
  if (!hourKeys?.length) return [];
  const eligible = await getEligibleChannelSets(guild);
  if (!eligible.text.size && !eligible.voice.size) return [];
  const perUser = new Map();
  const rows = [];
  const profileDocs = await ActivityUserProfile.find({ guildId: guild.id }).select("userId profile.totals.hourly").lean().catch(() => []);
  if (profileDocs.length) {
    const wanted = new Set(hourKeys.map(String));
    for (const doc of profileDocs) {
      const userId = String(doc?.userId || "");
      const hourly = toObjectMap(doc?.profile?.totals?.hourly || {});
      if (!userId) continue;
      for (const [key, value] of Object.entries(hourly)) {
        if (!wanted.has(String(key))) continue;
        if (shouldSkipBackfillRow(String(key), wanted)) continue;
        rows.push({
          userId,
          textChannels: toObjectMap(value?.textChannels || {}),
          voiceChannels: toObjectMap(value?.voiceChannels || {}),
        });
      }
    }
  }
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
    voiceSeconds: Math.max(0, Math.floor(row.voiceSeconds)),
  }));
}

async function getEventWeekTopThreeTextAndVoice(guild, eventWeekNum, opts = {}) {
  if (!guild?.id || !Number.isFinite(eventWeekNum) || eventWeekNum < 1 || eventWeekNum > 4)
    return { topMessages: [], topVoice: [] };
  const settings = await getGuildExpSettings(guild.id).catch(() => null);
  if (!settings?.eventStartedAt) return { topMessages: [], topVoice: [] };
  const hourKeys = getEventWeekHourKeysFallback(settings, eventWeekNum);
  if (!hourKeys.length) return { topMessages: [], topVoice: [] };
  const asOfMs = Number.isFinite(Number(opts.asOfMs)) ? Number(opts.asOfMs) : Date.now();
  const rows = await loadActivityRowsFromHourKeys(guild, hourKeys);
  const eligible = await getEligibleChannelSets(guild);
  const liveSessions = await loadLiveVoiceSessions(guild.id).catch(() => []);
  const rowsByUser = new Map(rows.map((r) => [r.userId, { userId: r.userId, messageCount: r.messageCount || 0, voiceSeconds: r.voiceSeconds || 0 }]));
  for (const session of liveSessions) {
    const channelId = String(session?.voice?.sessionChannelId || "");
    if (!channelId || !eligible.voice.has(channelId)) continue;
    const sStart = session.voice?.sessionStartedAt ? new Date(session.voice.sessionStartedAt) : null;
    if (!sStart || Number.isNaN(sStart.getTime())) continue;

    // Convert session started at to hour key approximation
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
    const p = fmt.formatToParts(sStart).reduce((a, x) => { if (x.type !== "literal") a[x.type] = x.value; return a; }, {});
    const hk = `${p.year}-${p.month}-${p.day}T${p.hour}`;

    if (!hourKeys.includes(hk)) continue;

    const add = Math.max(0, Math.floor((asOfMs - sStart.getTime()) / 1000));
    if (add <= 0) continue;
    const userId = String(session?.userId || "");
    if (!userId) continue;
    const row = rowsByUser.get(userId) || { userId, messageCount: 0, voiceSeconds: 0 };
    row.voiceSeconds = (row.voiceSeconds || 0) + add;
    rowsByUser.set(userId, row);
  }
  const rowsWithLive = Array.from(rowsByUser.values());
  const sortedMessages = [...rowsWithLive].filter((r) => Number(r?.messageCount || 0) > 0).sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0));
  const sortedVoice = [...rowsWithLive].filter((r) => Number(r?.voiceSeconds || 0) > 0).sort((a, b) => (b.voiceSeconds || 0) - (a.voiceSeconds || 0));
  const poolSize = 20;
  const sortedMessagesFiltered = [];
  for (const row of sortedMessages) {
    if (sortedMessagesFiltered.length >= poolSize) break;
    const member = await getGuildMemberCached(guild, row.userId);
    if (member && !isEventStaffMember(member))
      sortedMessagesFiltered.push({ userId: row.userId, messageCount: row.messageCount });
  }
  const sortedVoiceFiltered = [];
  for (const row of sortedVoice) {
    if (sortedVoiceFiltered.length >= poolSize) break;
    const member = await getGuildMemberCached(guild, row.userId);
    if (member && !isEventStaffMember(member))
      sortedVoiceFiltered.push({ userId: row.userId, voiceSeconds: row.voiceSeconds });
  }
  const { listA: topMessages, listB: topVoice } = deduplicateTopTwoLists(
    sortedMessagesFiltered.slice(0, 3),
    sortedVoiceFiltered.slice(0, 3),
    sortedMessagesFiltered,
    sortedVoiceFiltered,
    3,
  );
  return { topMessages, topVoice };
}

async function getEventWeekTopNTextAndVoice(guild, eventWeekNum, limit = 10, opts = {}) {
  if (!guild?.id || !Number.isFinite(eventWeekNum) || eventWeekNum < 1 || eventWeekNum > 4)
    return { topMessages: [], topVoice: [] };
  const settings = await getGuildExpSettings(guild.id).catch(() => null);
  if (!settings?.eventStartedAt) return { topMessages: [], topVoice: [] };
  const hourKeys = getEventWeekHourKeysFallback(settings, eventWeekNum);
  if (!hourKeys.length) return { topMessages: [], topVoice: [] };
  const asOfMs = Number.isFinite(Number(opts.asOfMs)) ? Number(opts.asOfMs) : Date.now();
  const cap = Math.max(1, Math.min(25, Number(limit) || 10));
  const rows = await loadActivityRowsFromHourKeys(guild, hourKeys);
  const eligible = await getEligibleChannelSets(guild);
  const liveSessions = await loadLiveVoiceSessions(guild.id).catch(() => []);
  const rowsByUser = new Map(rows.map((r) => [r.userId, { userId: r.userId, messageCount: r.messageCount || 0, voiceSeconds: r.voiceSeconds || 0 }]));
  for (const session of liveSessions) {
    const channelId = String(session?.voice?.sessionChannelId || "");
    if (!channelId || !eligible.voice.has(channelId)) continue;

    const sStart = session.voice?.sessionStartedAt ? new Date(session.voice.sessionStartedAt) : null;
    if (!sStart || Number.isNaN(sStart.getTime())) continue;
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
    const p = fmt.formatToParts(sStart).reduce((a, x) => { if (x.type !== "literal") a[x.type] = x.value; return a; }, {});
    const hk = `${p.year}-${p.month}-${p.day}T${p.hour}`;
    if (!hourKeys.includes(hk)) continue;

    const add = Math.max(0, Math.floor((asOfMs - sStart.getTime()) / 1000));
    if (add <= 0) continue;
    const userId = String(session?.userId || "");
    if (!userId) continue;
    const row = rowsByUser.get(userId) || { userId, messageCount: 0, voiceSeconds: 0 };
    row.voiceSeconds = (row.voiceSeconds || 0) + add;
    rowsByUser.set(userId, row);
  }
  const rowsWithLive = Array.from(rowsByUser.values());
  const sortedMessages = [...rowsWithLive].filter((r) => Number(r?.messageCount || 0) > 0).sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0));
  const sortedVoice = [...rowsWithLive].filter((r) => Number(r?.voiceSeconds || 0) > 0).sort((a, b) => (b.voiceSeconds || 0) - (a.voiceSeconds || 0));
  const topMessages = [];
  const topVoice = [];
  for (const row of sortedMessages) {
    if (topMessages.length >= cap) break;
    const member = await getGuildMemberCached(guild, row.userId);
    if (member && !isEventStaffMember(member))
      topMessages.push({ userId: row.userId, messageCount: row.messageCount });
  }
  for (const row of sortedVoice) {
    if (topVoice.length >= cap) break;
    const member = await getGuildMemberCached(guild, row.userId);
    if (member && !isEventStaffMember(member))
      topVoice.push({ userId: row.userId, voiceSeconds: row.voiceSeconds });
  }
  return { topMessages, topVoice };
}

function memberHasAnyRole(member, roleIds = []) {
  if (!member?.roles?.cache) return false;
  return roleIds.some((id) => member.roles.cache.has(String(id)));
}

async function shouldSkipEventWinner(guild, userId, eventWeekNum) {
  const w = Number(eventWeekNum || 0);
  const member = await getGuildMemberCached(guild, userId).catch(() => null);
  if (!member) return true;
  if (isEventStaffMember(member)) return true;

  if (w === 3) {
    if (memberHasAnyRole(member, EVENT_WEEK3_SKIP_ROLE_IDS)) return true;
    const alreadyGranted = await hasEventWeekWinnerGrant(guild.id, userId, 3).catch(() => false);
    if (alreadyGranted) return true;
    return false;
  }

  if (w === 4) {
    const vipId = IDs.roles.VIP;
    if (vipId && member.roles.cache.has(String(vipId))) return true;
    return false;
  }

  return false;
}

async function filterEventTopForWeek(guild, eventWeekNum, topMessages = [], topVoice = []) {
  const w = Number(eventWeekNum || 0);
  if (w !== 3 && w !== 4) return { topMessages, topVoice };
  const outMessages = [];
  for (const row of Array.isArray(topMessages) ? topMessages : []) {
    if (!row?.userId) continue;
    if (await shouldSkipEventWinner(guild, row.userId, w)) continue;
    outMessages.push(row);
  }
  const outVoice = [];
  for (const row of Array.isArray(topVoice) ? topVoice : []) {
    if (!row?.userId) continue;
    if (await shouldSkipEventWinner(guild, row.userId, w)) continue;
    outVoice.push(row);
  }
  return { topMessages: outMessages, topVoice: outVoice };
}

function buildEmptyLine(kind) {
  return `<:VC_InactiveStatus:1482526984234860574> - Nessun dato disponibile per ${kind}.`;
}

function formatRankLine(index, userMention, value, unit) {
  const medal = TROPHY_LABELS[index] || "[#]";
  return `${medal} ${userMention} <a:VC_Arrow:1482706699365257397> **${value}** *${unit}*`;
}

function extractMapEntries(raw) {
  if (!raw) return [];
  if (raw instanceof Map) return Array.from(raw.entries());
  if (typeof raw === "object") return Object.entries(raw);
  return [];
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

function buildLast7DaysHourKeys(endMs) {
  const endDate = new Date(endMs);
  const keys = [];
  for (let h = 0; h < 24 * 7; h += 1) {
    const d = new Date(endMs - h * 60 * 60 * 1000);
    const parts = getTimeParts(d);
    keys.push(`${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}`);
  }
  return keys;
}

async function loadWeeklyRowsFromHourlyWindow(guild, anchorDate = new Date()) {
  const eligible = await getEligibleChannelSets(guild);
  if (!eligible.text.size && !eligible.voice.size) return [];

  const endMs = getLastSunday21BoundaryMsAtOrBefore(anchorDate);
  const hourKeys = buildLast7DaysHourKeys(endMs);
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
    voiceExp: Math.max(
      0,
      Math.floor((Math.max(0, row.voiceSeconds) / 60) * VOICE_EXP_PER_MINUTE),
    ),
  }));
}

async function resolveTopThreeUsers(client, guild, docs, valueGetter, limit = 3) {
  const cap = Math.max(1, Math.min(25, Number(limit) || 3));
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
    if (REQUIRED_MEMBER_ROLE_ID && !member.roles.cache.has(REQUIRED_MEMBER_ROLE_ID))
      continue;

    const hasExcludedRole = Array.from(EXCLUDED_ROLE_IDS).some((roleId) => member.roles.cache.has(roleId),);
    if (hasExcludedRole) continue;

    const value = Math.max(0, Math.floor(Number(valueGetter(doc) || 0)));
    if (value <= 0) continue;
    out.push({ userId, value });
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

/** Deduplica due top (es. messaggi e vocale): stessa persona in una sola lista, in quella con posizione migliore; l'altra viene riempita con il successivo in classifica. */
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

async function updateWeeklyWinnerRoles(guild, topMessages, topVoice) {
  const chosenUserIds = new Set();
  const messageWinner = pickFirstAvailable(topMessages, chosenUserIds);
  if (messageWinner) chosenUserIds.add(messageWinner.userId);

  const voiceWinner = pickFirstAvailable(topVoice, chosenUserIds);
  if (voiceWinner) chosenUserIds.add(voiceWinner.userId);

  await Promise.all([
    removeRoleFromAllMembers(guild, MESSAGE_WINNER_ROLE_ID, messageWinner?.userId),
    removeRoleFromAllMembers(guild, VOICE_WINNER_ROLE_ID, voiceWinner?.userId),
  ]);

  await Promise.all([
    assignRoleToUser(guild, messageWinner?.userId, MESSAGE_WINNER_ROLE_ID),
    assignRoleToUser(guild, voiceWinner?.userId, VOICE_WINNER_ROLE_ID),
  ]);

  return { messageWinner, voiceWinner };
}

function formatVoiceDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getEventWeeklyRewardLabel(week) {
  const w = Number(week || 0);
  if (w === 1) return "10 livelli";
  if (w === 2) return "un colore gradiente a scelta";
  if (w === 3) return "un ruolo custom e vocale privata permanente";
  if (w === 4) return "ruolo VIP permanente";
  return "ricompensa evento";
}

async function sendEventWeekAnnouncementToNews(client, guild, eventWeek, topMessages, topVoice) {
  if (!EVENT_ANNOUNCEMENT_CHANNEL_ID) return;
  const eventChannel = client.channels.cache.get(EVENT_ANNOUNCEMENT_CHANNEL_ID) || (await getClientChannelCached(client, EVENT_ANNOUNCEMENT_CHANNEL_ID));
  if (!eventChannel?.guild) return;
  const msgLines = topMessages.length ? topMessages.map((item, i) => {
    const medal = TROPHY_LABELS[i] || ""; return `${medal}<@${item.userId}> <a:VC_Arrow:1482706699365257397> **${item.messageCount}** _messaggi_`;
  })
    : ["<:VC_InactiveStatus:1482526984234860574> - Nessun dato per la classifica testuale."];
  const voiceLines = topVoice.length ? topVoice.map((item, i) => {
    const medal = TROPHY_LABELS[i] || ""; return `${medal}<@${item.userId}> <a:VC_Arrow:1482706699365257397> **${formatVoiceDuration(item.voiceSeconds)}** _in vocale_`;
  })
    : ["<:VC_InactiveStatus:1482526984234860574> - Nessun dato per la classifica vocale."];
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`<:VC_Leaderboard:1482534806314287387> Evento Activity EXP — Settimana ${eventWeek}`)
    .setDescription(
      [
        "<a:VC_HeartsPink:1468685897389052008> **Top 3 testuale**:",
        ...msgLines,
        "",
        "<a:VC_HeartsBlue:1468686100045369404> **Top 3 vocale**:",
        ...voiceLines,
      ].join("\n"),
    )
    .setThumbnail(guild.iconURL({ size: 256 }) || null)
    .setFooter({ text: `Settimana ${eventWeek} di ${eventWeek === 1 ? "evento" : "evento"} • Premi assegnati ai vincitori` }).setTimestamp();
  await eventChannel.send({
    content: `<@&1442568949605597264>
<a:VC_Winner:1482535294757507255> Ciao a tutti! Annunciamo i vincitori dell'Activity Event EXP della settimana ${eventWeek}

<:VC_EXP:1482534670896730143> Avete ricevuto __${getEventWeeklyRewardLabel(eventWeek)}__ come ricompensa di questa settimana

<a:VC_Events:1482706144953897223> Vi aspettiamo la prossima settimana, con i vincitori che vinceranno __${getEventWeeklyRewardLabel(eventWeek + 1)}__`,
    embeds: [embed],
  }).catch((err) => {
    global.logger?.error?.("[WEEKLY ACTIVITY] Event week announcement failed:", err);
  });
}

const EVENT_END_ANNOUNCEMENT_MESSAGE = ["<:VC_Calendar:1448670320180592724> **L'evento Activity EXP è terminato.**", "", "> <a:VC_HeartsPink:1468685897389052008> Grazie a tutti per aver partecipato! Di seguito la **classifica EXP finale** dell'evento.", "",].join("\n");

async function trySendEventEndAnnouncementToNews(client) {
  const mainGuildId = IDs.guilds?.main;
  if (!mainGuildId) return;
  const doc = await GlobalSettings.findOne({ guildId: mainGuildId }).lean().catch(() => null);
  const expiresAtMs = doc?.expEventMultiplierExpiresAt ? new Date(doc.expEventMultiplierExpiresAt).getTime() : null;
  if (expiresAtMs != null && expiresAtMs > Date.now()) return;
  const sentForMs = doc?.expEventEndAnnouncementSentForExpiresAt ? new Date(doc.expEventEndAnnouncementSentForExpiresAt).getTime() : null;
  const pastExpiryStillInDb = expiresAtMs != null && expiresAtMs <= Date.now();
  const announcementAlreadyForThisExpiry = pastExpiryStillInDb && sentForMs === expiresAtMs;

  if (announcementAlreadyForThisExpiry) {
    await performEndOfEventCleanup(client, mainGuildId);
    return;
  }

  if (pastExpiryStillInDb) {
    const guild = client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId));
    if (guild && EVENT_ANNOUNCEMENT_CHANNEL_ID) {
      const topExp = await getTop10ExpDuringEventExcludingHighStaff(guild, 10).catch(() => []);
      const expLines = topExp.length
        ? topExp.map((item, i) => {
          const value = Number(
            item.activityExpDuringEvent != null
              ? item.activityExpDuringEvent
              : item.expDuringEvent,
          );
          const label = TROPHY_LABELS[i] || `**${i + 1}.**`;
          return `${label} <@${item.userId}> <a:VC_Arrow:1482706699365257397> **${value}** _EXP_`;
        })
        : ["<:VC_InactiveStatus:1482526984234860574> - Nessun dato per la classifica EXP."];
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("<:VC_Leaderboard:1482534806314287387> Evento Activity EXP")
        .setDescription(
          [
            "_Classifica EXP dell'evento_",
            "",
            "<:VC_Leaderboard:1482534806314287387> **Top 10 EXP**:",
            ...expLines,
          ].join("\n"),
        )
        .setThumbnail(guild.iconURL({ size: 256 }) || null)
        .setFooter({ text: "Evento terminato • Grazie per la partecipazione!" })
        .setTimestamp();
      const eventChannel = client.channels.cache.get(EVENT_ANNOUNCEMENT_CHANNEL_ID) || (await getClientChannelCached(client, EVENT_ANNOUNCEMENT_CHANNEL_ID));
      if (eventChannel?.guild) {
        await eventChannel.send({
          content: `${EVENT_END_ANNOUNCEMENT_MESSAGE}\n\n<a:VC_Ping:1482694298687246377>︲<@&1442569012063109151>`,
          embeds: [embed],
          allowedMentions: { parse: ["everyone"] },
        }).catch((err) => {
          global.logger?.error?.("[WEEKLY ACTIVITY] Event end announcement failed:", err);
        });
      }
    }
    await GlobalSettings.findOneAndUpdate(
      { guildId: mainGuildId },
      { $set: { expEventEndAnnouncementSentForExpiresAt: doc.expEventMultiplierExpiresAt } },
    ).catch(() => null);
    await performEndOfEventCleanup(client, mainGuildId);
    return;
  }

  await performEndOfEventCleanup(client, mainGuildId);
}

async function performEndOfEventCleanup(client, guildId) {
  const gid = String(guildId || "");
  if (!gid) return;
  const doc = await GlobalSettings.findOne({ guildId: gid }).lean().catch(() => null);
  const expMs = doc?.expEventMultiplierExpiresAt ? new Date(doc.expEventMultiplierExpiresAt).getTime() : null;
  if (expMs != null && expMs > Date.now()) {
    global.logger?.info?.(`[EVENT_CLEANUP] Skip: evento ancora attivo g:${gid}`);
    return;
  }
  const overrides = doc?.expEventRoleOverrides;
  const extraIds = doc?.expEventExtraMultiplierRoleIds;
  const settingsNeedsWork = Boolean(
    doc &&
      (doc.expEventEndAnnouncementSentForExpiresAt != null ||
        doc.expEventMultiplierExpiresAt != null ||
        doc.expEventStartedAt != null ||
        doc.staffEventStartedAt != null ||
        doc.staffEventExpiresAt != null ||
        (overrides != null && typeof overrides === "object" && Object.keys(overrides).length > 0) ||
        (Array.isArray(extraIds) && extraIds.length > 0) ||
        (doc.expEventMultiplier != null && Number(doc.expEventMultiplier) !== 1)),
  );
  let profilesNeedWork = false;
  if (!settingsNeedsWork) {
    profilesNeedWork = Boolean(
      await ActivityUserProfile.exists({
        guildId: gid,
        $or: [
          { "profile.totals.exp.event.rewards": { $exists: true } },
          { "profile.totals.exp.event.snapshot": { $exists: true } },
        ],
      }).catch(() => false),
    );
  }
  if (!settingsNeedsWork && !profilesNeedWork) return;

  global.logger?.info?.(`[EVENT_CLEANUP] Avvio pulizia post-evento per g:${gid}`);

  try {
    await GlobalSettings.updateOne(
      { guildId: gid },
      {
        $unset: {
          expEventEndAnnouncementSentForExpiresAt: 1,
          expEventExtraMultiplierRoleIds: 1,
          expEventMultiplierExpiresAt: 1,
          expEventRoleOverrides: 1,
          expEventStartedAt: 1,
          staffEventExpiresAt: 1,
          staffEventStartedAt: 1,
        },
        $set: {
          expEventMultiplier: 1,
        },
      },
    );

    await ActivityUserProfile.updateMany(
      { guildId: gid },
      {
        $unset: {
          "profile.totals.exp.event.rewards": 1,
          "profile.totals.exp.event.snapshot": 1,
        },
      },
    );

    await ActivityUserProfile.updateMany(
      { guildId: gid, "profile.totals.exp.event.weekWinners": { $size: 0 } },
      { $unset: { "profile.totals.exp.event.weekWinners": 1 } },
    );

    invalidateSettingsCache(gid);
    global.logger?.info?.("[EVENT_CLEANUP] Pulizia completata con successo.");
  } catch (err) {
    global.logger?.error?.("[EVENT_CLEANUP] Errore durante la pulizia post-evento:", err);
  }
}

async function publishWeeklyActivityWinners(client, options = {}) {
  const skipNormalWeekly = Boolean(options.skipNormalWeekly);
  const mainGuildId = String(IDs.guilds?.main || "");
  let guild =
    mainGuildId &&
    (client.guilds.cache.get(mainGuildId) ||
      (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null)));
  if (!guild) {
    const channelIdToUse = options.targetChannelId || TARGET_CHANNEL_ID;
    const channel =
      client.channels.cache.get(channelIdToUse) ||
      (await getClientChannelCached(client, channelIdToUse, { ttlMs: 60_000 }));
    if (!channel?.guild) {
      global.logger?.error?.("[WEEKLY ACTIVITY] Publish skipped: guild not found (main o canale top weekly).");
      return;
    }
    guild = channel.guild;
  }
  let channel = null;
  if (!skipNormalWeekly) {
    const channelIdToUse = options.targetChannelId || TARGET_CHANNEL_ID;
    channel =
      client.channels.cache.get(channelIdToUse) ||
      (await getClientChannelCached(client, channelIdToUse, { ttlMs: 60_000 }));
    if (!channel?.guild) {
      global.logger?.error?.("[WEEKLY ACTIVITY] Publish skipped: canale top weekly non trovato.", channelIdToUse);
      return;
    }
  }
  const now =
    options.anchorDate instanceof Date && !Number.isNaN(options.anchorDate.getTime())
      ? options.anchorDate
      : new Date();
  const atMs = now.getTime();
  const currentWeekKey = options.weekKey != null ? options.weekKey : getWeekKey(now);

  const settings = await getGuildExpSettings(guild.id).catch(() => null);
  let eventPayoutWeek = 0;
  if (settings && !options.skipEvent) {
    if (options.forceEventPayoutWeek != null) {
      const w = Number(options.forceEventPayoutWeek);
      if (w >= 1 && w <= 4) eventPayoutWeek = w;
    } else {
      eventPayoutWeek = getCompletedEventWeekForSundayPayout(settings, atMs);
    }
  }
  let eventTopMessages = [];
  let eventTopVoice = [];
  if (eventPayoutWeek >= 1 && eventPayoutWeek <= 4) {
    const pool = await getEventWeekTopNTextAndVoice(guild, eventPayoutWeek, 20, { asOfMs: atMs });
    const filtered = await filterEventTopForWeek(guild, eventPayoutWeek, pool.topMessages || [], pool.topVoice || []);
    const deduped = deduplicateTopTwoLists(
      (filtered.topMessages || []).slice(0, 3),
      (filtered.topVoice || []).slice(0, 3),
      filtered.topMessages || [],
      filtered.topVoice || [],
      3,
    );
    eventTopMessages = deduped.listA || [];
    eventTopVoice = deduped.listB || [];
  }

  let displayTopMessages = [];
  let displayTopVoice = [];
  let messageRows = [buildEmptyLine("messaggi")];
  let voiceRows = [buildEmptyLine("exp vocale")];
  let awarded = { messageWinner: null, voiceWinner: null };

  if (!skipNormalWeekly) {
    const weeklyRows = await loadWeeklyRowsFromHourlyWindow(guild, now);

    const messageDocs = weeklyRows.filter((row) => Number(row?.messageCount || 0) > 0).sort((a, b) => Number(b.messageCount || 0) - Number(a.messageCount || 0)).slice(0, 200);
    const voiceDocs = weeklyRows.filter((row) => Number(row?.voiceExp || 0) > 0).sort((a, b) => Number(b.voiceExp || 0) - Number(a.voiceExp || 0)).slice(0, 200);

    const topMessages = await resolveTopThreeUsers(client, guild, messageDocs, (doc) => Number(doc?.messageCount || 0), 10);
    const topVoice = await resolveTopThreeUsers(client, guild, voiceDocs, (doc) => Number(doc?.voiceExp || 0), 10);

    const dedupe = deduplicateTopTwoLists(topMessages.slice(0, 3), topVoice.slice(0, 3), topMessages, topVoice, 3);
    displayTopMessages = dedupe.listA;
    displayTopVoice = dedupe.listB;

    messageRows = displayTopMessages.length ? displayTopMessages.map((item, index) => formatRankLine(index, `<@${item.userId}>`, item.value, "messaggi"),
    )
      : [buildEmptyLine("messaggi")];

    voiceRows = displayTopVoice.length ? displayTopVoice.map((item, index) => formatRankLine(index, `<@${item.userId}>`, item.value, "exp"),
    )
      : [buildEmptyLine("exp vocale")];

    if (options.skipWeeklyRoles) {
      const chosenUserIds = new Set();
      const messageWinner = pickFirstAvailable(displayTopMessages, chosenUserIds);
      if (messageWinner) chosenUserIds.add(messageWinner.userId);
      const voiceWinner = pickFirstAvailable(displayTopVoice, chosenUserIds);
      awarded = { messageWinner, voiceWinner };
    } else {
      awarded = await updateWeeklyWinnerRoles(guild, displayTopMessages, displayTopVoice);
    }
  }
  const topSixUserIds = new Set();
  for (const item of eventTopMessages) if (item?.userId) topSixUserIds.add(item.userId);
  for (const item of eventTopVoice) if (item?.userId) topSixUserIds.add(item.userId);
  if (!options.skipEventDbGrants && eventPayoutWeek >= 1 && eventPayoutWeek <= 4 && topSixUserIds.size > 0) {
    const VIP_ID = IDs.roles.VIP;
    const me = guild.members.me;
    for (const userId of topSixUserIds) {
      try {
        const member = await getGuildMemberCached(guild, userId);
        if (member && isEventStaffMember(member)) continue;
        if (eventPayoutWeek === 1) {
          await grantEventLevels(
            guild.id,
            userId,
            10,
            "Evento settimanale: top 3 testuale/vocale",
            member,
            client,
          );
        } else if (eventPayoutWeek === 2) {
          await addEventWeekWinner(guild.id, userId, 2);
          await sendEventRewardLog(client, {
            userId,
            guildId: guild.id,
            label: "Top settimana 2 — colore gradiente",
            detail: "Premio settimanale evento: vincitore top testuale/vocale",
            week: 2,
          }).catch(() => { });
          await sendEventRewardDm(client, userId, guild.id, {
            label: "Top settimana 2 — colore gradiente a scelta",
            week: 2,
          }).catch(() => { });
        } else if (eventPayoutWeek === 3) {
          await addEventWeekWinner(guild.id, userId, 3);
          await sendEventRewardLog(client, {
            userId,
            guildId: guild.id,
            label: "Top settimana 3 — ruolo custom e vocale privata",
            detail: "Premio settimanale evento: vincitore top testuale/vocale",
            week: 3,
          }).catch(() => { });
          await sendEventRewardDm(client, userId, guild.id, {
            label: "Top settimana 3 — ruolo custom e vocale privata permanente",
            week: 3,
          }).catch(() => { });
        } else if (eventPayoutWeek === 4 && VIP_ID && me?.permissions?.has("ManageRoles")) {
          await assignRoleToUser(guild, userId, VIP_ID);
          await sendEventRewardLog(client, {
            userId,
            guildId: guild.id,
            label: "Top settimana 4 — ruolo VIP permanente",
            roleId: VIP_ID,
            detail: "Premio settimanale evento: vincitore top testuale/vocale",
            week: 4,
          }).catch(() => { });
          await sendEventRewardDm(client, userId, guild.id, {
            label: "Top settimana 4 — ruolo VIP permanente",
            roleId: VIP_ID,
            week: 4,
          }).catch(() => { });
        }
      } catch (err) {
        global.logger?.error?.("[WEEKLY ACTIVITY] Event reward for user", userId, err);
      }
    }
  }
  const announceWeeks = options.eventAnnouncementOnlyForWeeks;
  const allowEventNews =
    !options.skipDiscordSends &&
    eventPayoutWeek >= 1 &&
    eventPayoutWeek <= 4 &&
    EVENT_ANNOUNCEMENT_CHANNEL_ID &&
    (!Array.isArray(announceWeeks) ||
      announceWeeks.length === 0 ||
      announceWeeks.includes(eventPayoutWeek));
  if (allowEventNews) {
    await sendEventWeekAnnouncementToNews(client, guild, eventPayoutWeek, eventTopMessages, eventTopVoice);
  }

  if (skipNormalWeekly) {
    return;
  }

  const embed = new EmbedBuilder().setColor("#6f4e37").setDescription([`<:VC_Leaderboard:1482534806314287387> // I vantaggi che avete sbloccato sono in "badge" nel canale <#${INFO_CHANNEL_ID}>`,
    "",
    `<a:VC_HeartsPink:1468685897389052008> • **Classifica testuale:**`,
  ...messageRows,
    "",
    `<a:VC_HeartsBlue:1468686100045369404> • **Classifica vocale:**`,
  ...voiceRows,
  ].join("\n"),
  )
    .setThumbnail(guild.iconURL({ size: 256 }) || null);

  const messageWinnerTotal = Number(awarded?.messageWinner?.value || 0);
  const voiceWinnerTotal = Number(awarded?.voiceWinner?.value || 0);
  const messageWinnerMention = awarded?.messageWinner?.userId ? `<@${awarded.messageWinner.userId}>`
    : "Nessun vincitore";
  const voiceWinnerMention = awarded?.voiceWinner?.userId ? `<@${awarded.voiceWinner.userId}>`
    : "Nessun vincitore";

  const button = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Chat").setStyle(ButtonStyle.Link).setEmoji("<:VC_FrogCute:1331620415185096746>").setURL("https://discord.com/channels/1329080093599076474/1442569130573303898"), new ButtonBuilder().setLabel("Vocal").setStyle(ButtonStyle.Link).setEmoji("<:VC_FrogJuice:1331620486517358613>").setURL("https://discord.com/channels/1329080093599076474/1442569101225496819"),);

  if (!options.skipDiscordSends && channel) {
    try {
      await channel.send({
        content: `<@&1442568949605597264>
      <a:VC_Winner:1482535294757507255> Ciao a tutti! Annunciamo i vincitori di questa settimana per attività.

<a:VC_Arrow:1482706699365257397> Con un totale di **${messageWinnerTotal} messaggi**, ${messageWinnerMention} ottieni il primo posto per **__chat testuale__**.
<a:VC_Arrow:1482706699365257397> Con un totale di **${voiceWinnerTotal} exp**, ${voiceWinnerMention} ottieni il primo posto per **__chat vocale__**.
_ _`,
        embeds: [embed],
        components: [button],
      });
    } catch (error) {
      global.logger.error("[WEEKLY ACTIVITY] Failed to send winners message:", error);
    }
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
  const nextWeekKey = options.nextWeekKey != null ? options.nextWeekKey : getNextWeekKey(now);

  await Promise.all([
    ActivityUserProfile.updateMany(
      { guildId },
      {
        $set: {
          "profile.totals.messagesWeekly": 0,
          "profile.totals.messagesWeeklyKey": nextWeekKey,
          "profile.totals.voiceWeeklySeconds": 0,
          "profile.totals.voiceWeeklyKey": nextWeekKey,
          "profile.totals.exp.weeklyExp": 0,
          "profile.totals.exp.weeklyKey": nextWeekKey,
        },
      },
    ),
  ]);
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
    "0 21 * * *",
    async () => {
      try {
        await trySendEventEndAnnouncementToNews(client);
      } catch (error) {
        global.logger.error(
          "[WEEKLY ACTIVITY] Event end announcement failed:",
          error,
        );
      }
    },
    { timezone: TIME_ZONE },
  );

  const runRecoveryIfNeeded = async () => {
    const now = new Date();
    const channel = client.channels.cache.get(TARGET_CHANNEL_ID) || (await getClientChannelCached(client, TARGET_CHANNEL_ID, { ttlMs: 60_000 }));
    const guildId = channel?.guild?.id;
    if (!guildId) return;
    const currentWeekKey = getWeekKey(now);
    const alreadyReset =
      await ActivityUserProfile.exists({ guildId, "profile.totals.messagesWeeklyKey": currentWeekKey }).catch(() => false);
    if (alreadyReset) return;
    const previousWeekKey = getLastCompletedWeekKey(now);
    if (previousWeekKey === currentWeekKey) return;
    try {
      global.logger.info("[WEEKLY ACTIVITY] Recovery: running missed weekly winners (bot was likely offline Sunday 21:00).");
      await publishWeeklyActivityWinners(client, { weekKey: previousWeekKey });
      await resetWeeklyActivityCounters(client, { nextWeekKey: currentWeekKey });
    } catch (error) {
      global.logger.error("[WEEKLY ACTIVITY] Recovery run failed:", error);
    }
  };
  setImmediate(() => {
    runRecoveryIfNeeded().catch((err) => global.logger?.error?.("[WEEKLY ACTIVITY] Recovery on start failed:", err));
  });
}

async function getEventDiagnostics(guild) {
  if (!guild?.id) return null;
  const settings = await getGuildExpSettings(guild.id).catch(() => null);
  const eventWeek = settings ? getEventWeekNumber(settings) : 0;
  const weekForDailyKeys = eventWeek >= 1 ? Math.min(4, eventWeek) : 0;
  const eligible = await getEligibleChannelSets(guild);
  let dateKeys = [];
  let activityDailyCount = 0;
  if (weekForDailyKeys >= 1 && weekForDailyKeys <= 4 && settings?.eventStartedAt) {
    dateKeys = getEventWeekDateKeys(settings, weekForDailyKeys);
    if (dateKeys.length) {
      activityDailyCount = await ActivityUserProfile.countDocuments({
        guildId: guild.id,
        $or: dateKeys.map((k) => ({ [`profile.totals.daily.${String(k)}`]: { $exists: true } })),
      }).catch(() => 0);
    }
  }
  return {
    eventActive: Boolean(settings?.eventExpiresAt && new Date(settings.eventExpiresAt).getTime() > Date.now()),
    eventStartedAt: settings?.eventStartedAt || null,
    eventExpiresAt: settings?.eventExpiresAt || null,
    eventWeek,
    dateKeys,
    activityDailyCount,
    eligibleTextChannels: eligible.text.size,
    eligibleVoiceChannels: eligible.voice.size,
  };
}

module.exports = { startWeeklyActivityWinnersLoop, publishWeeklyActivityWinners, resetWeeklyActivityCounters, getLastCompletedWeekKey, getEventWeekDateKeys, loadActivityRowsFromDateKeys, getEventDiagnostics, getEventWeekTopThreeTextAndVoice, getEventWeekTopNTextAndVoice, loadActivityRowsFromHourKeys, sendEventWeekAnnouncementToNews, deduplicateTopTwoLists, filterEventTopForWeek, performEndOfEventCleanup, trySendEventEndAnnouncementToNews };