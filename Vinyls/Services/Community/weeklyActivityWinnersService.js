const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const cron = require("node-cron");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { VOICE_EXP_PER_MINUTE } = require("./expService");
const IDs = require("../../Utils/Config/ids");
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
const REQUIRED_MEMBER_ROLE_ID = String(IDs.roles.Member || "");
const WEEKLY_WINNERS_EXCLUDED_ROLE_IDS = new Set(
  [
    IDs.roles.Staff,
    IDs.roles.HighStaff,
    IDs.roles.Helper,
    IDs.roles.Mod,
    IDs.roles.Admin,
    IDs.roles.Founder,
  ]
    .filter(Boolean)
    .map((id) => String(id)),
);

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
    if (REQUIRED_MEMBER_ROLE_ID && !member.roles.cache.has(REQUIRED_MEMBER_ROLE_ID)) continue;
    const hasExcludedRole = Array.from(WEEKLY_WINNERS_EXCLUDED_ROLE_IDS).some((roleId) => member.roles.cache.has(roleId));
    if (hasExcludedRole) continue;
    const value = Math.max(0, Math.floor(Number(valueGetter(doc) || 0)));
    if (value <= 0) continue;
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
  await member.roles.add(roleId).catch(() => {});
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

function buildEmptyLine(kind) {
  return `<:VC_InactiveStatus:1482526984234860574> - Nessun dato disponibile per ${kind}.`;
}

function formatRankLine(index, userMention, value, unit) {
  const medal = TROPHY_LABELS[index] || "[#]";
  return `${medal} ${userMention} <a:VC_Arrow:1482706699365257397> **${value}** *${unit}*`;
}

async function publishWeeklyActivityWinners(client, options = {}) {
  const mode = String(options.mode || "weekly").trim().toLowerCase() === "daily" ? "daily" : "weekly";
  const skipNormalWeekly = Boolean(options.skipNormalWeekly);
  const mainGuildId = String(IDs.guilds?.main || "");
  let guild =
    mainGuildId &&
    (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null)));
  if (!guild) {
    const channelIdToUse = options.targetChannelId || TARGET_CHANNEL_ID;
    const channel =
      client.channels.cache.get(channelIdToUse) || (await getClientChannelCached(client, channelIdToUse, { ttlMs: 60_000 }));
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
      client.channels.cache.get(channelIdToUse) || (await getClientChannelCached(client, channelIdToUse, { ttlMs: 60_000 }));
    if (!channel?.guild) {
      global.logger?.error?.("[WEEKLY ACTIVITY] Publish skipped: canale top weekly non trovato.", channelIdToUse);
      return;
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
  let messageRows = [buildEmptyLine("messaggi")];
  let voiceRows = [buildEmptyLine("exp vocale")];
  let awarded = { messageWinner: null, voiceWinner: null };
  if (!skipNormalWeekly) {
    const rowsSource =
      mode === "daily"
        ? await loadDailyRowsFromHourlyWindow(guild, now)
        : await loadWeeklyRowsFromHourlyWindow(guild, now);
    const messageDocs = rowsSource.filter((row) => Number(row?.messageCount || 0) > 0).sort((a, b) => Number(b.messageCount || 0) - Number(a.messageCount || 0)).slice(0, 200);
    const voiceDocs = rowsSource.filter((row) => Number(row?.voiceExp || 0) > 0).sort((a, b) => Number(b.voiceExp || 0) - Number(a.voiceExp || 0)).slice(0, 200);
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
  if (skipNormalWeekly) return;
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      [
        `<:VC_Leaderboard:1482534806314287387> // I vantaggi che avete sbloccato sono in "badge" nel canale <#${INFO_CHANNEL_ID}>`,
        "",
        `<a:VC_HeartsPink:1468685897389052008> • **Classifica testuale:**`,
        ...messageRows,
        "",
        `<a:VC_HeartsBlue:1468686100045369404> • **Classifica vocale:**`,
        ...voiceRows,
      ].join("\n"),
    )
    .setThumbnail(guildIconUrl(guild, { size: 256 }) || null);
  const messageWinnerTotal = Number(awarded?.messageWinner?.value || 0);
  const voiceWinnerTotal = Number(awarded?.voiceWinner?.value || 0);
  const messageWinnerMention = awarded?.messageWinner?.userId ? `<@${awarded.messageWinner.userId}>` : "Nessun vincitore";
  const voiceWinnerMention = awarded?.voiceWinner?.userId ? `<@${awarded.voiceWinner.userId}>` : "Nessun vincitore";
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
  if (!options.skipDiscordSends && channel) {
    const isDaily = mode === "daily";
    const introLine = isDaily
      ? "<a:VC_Winner:1482535294757507255> Ciao a tutti! Ecco la Top 3 utenti più attivi di oggi."
      : "<a:VC_Winner:1482535294757507255> Ciao a tutti! Annunciamo i vincitori di questa settimana per attività.";
    try {
      await channel.send({
        content: `<@&1442568949605597264>
${introLine}

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
  /* Deve coincidere con getWeekKey/getIsoWeekKey usati da activityService e expService su “ora”:
     getNextWeekKey (lunedì) sulla domenica sera metteva una chiave avanti di una settimana ISO,
     quindi mismatch → contatori settimanali sempre azzerati e sito a 0. */
  const nextWeekKey = options.nextWeekKey != null ? options.nextWeekKey : getWeekKey(now);
  await ActivityUserProfile.updateMany(
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
  );
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
  const wasWeeklyPostAlreadyPublishedAfterBoundary = async (channel, boundaryMs) => {
    if (!channel?.messages?.fetch || !client?.user?.id || !Number.isFinite(boundaryMs)) return false;
    const fetched = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!fetched?.size) return false;
    for (const msg of fetched.values()) {
      if (Number(msg?.createdTimestamp || 0) < boundaryMs) continue;
      if (String(msg?.author?.id || "") !== String(client.user.id)) continue;
      const content = String(msg?.content || "");
      if (!content.includes("Annunciamo i vincitori di questa settimana")) continue;
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
  setTimeout(() => {
    runRecoveryIfNeeded().catch((err) => global.logger?.error?.("[WEEKLY ACTIVITY] Recovery on start failed:", err));
  }, 15_000);
}

module.exports = {
  startWeeklyActivityWinnersLoop,
  publishWeeklyActivityWinners,
  resetWeeklyActivityCounters,
  getLastCompletedWeekKey,
  getDateKeysForWeekKey,
  getWeekKey,
};