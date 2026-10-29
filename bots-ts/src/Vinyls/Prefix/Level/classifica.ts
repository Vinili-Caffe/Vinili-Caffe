const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { MESSAGE_EXP, VOICE_EXP_PER_MINUTE, getLevelInfo, getCurrentWeekKey, } = require("../../Services/Community/expService") as typeof import("../../Services/Community/expService");
const { isChannelInTicketCategory } = require("../../Utils/Ticket/ticketCategoryUtils") as typeof import("../../Utils/Ticket/ticketCategoryUtils");
const { memberHasStaffRole } = require("../../Utils/Community/staffListUtils") as typeof import("../../Utils/Community/staffListUtils");
const {
  isPartnerPmDailyCommandsThread,
  partnersChatPartnerCommandDeniedReplyContent,
  sendPartnersChatDeniedPrefixCleanup,
} = require("../../Utils/Partner/partnersChatChannelUtils") as typeof import("../../Utils/Partner/partnersChatChannelUtils");
const { guildIconUrl } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const TOP_LIMIT = 10;
const LEADERBOARD_CHANNEL_ID = IDs.channels.commands;
const CLASSIFICA_TOGGLE_PREFIX = "classifica_toggle:";
const CLASSIFICA_CLOSE_PREFIX = "classifica_close:";
const TIME_ZONE = "Europe/Rome";
const LEADERBOARD_CACHE_TTL_MS = 30 * 1000;
const leaderboardCache = new Map();

function rankLabel(index?) {
  if (index === 0) return "<:VC_Podio1:1482694399283433582>";
  if (index === 1) return "<:VC_Podio2:1482694424411635712>";
  if (index === 2) return "<:VC_Podio3:1482694450806259744>";
  return `${index + 1}°`;
}

function escapeInlineMarkdown(value?) {
  return String(value || "")
    .replace(/([\\`*_~|>])/g, "\\$1")
    .replace(/\s+/g, " ")
    .trim();
}

function formatUserLabel(member?, userId?) {
  if (member) {
    const username = escapeInlineMarkdown(member.user?.username || member.user?.tag || member.displayName || "utente",);
    return `${member} (${username})`;
  }
  return `<@${userId}>`;
}

async function fetchMembers(guild?, userIds?) {
  const unique = Array.from(new Set(userIds));
  const out = new Map();
  if (!guild || unique.length === 0) return out;
  const missingIds = [];
  for (const id of unique) {
    const cached = guild.members.cache.get(id);
    if (cached) out.set(id, cached);
    else missingIds.push(id);
  }
  const fetchedMembers = await Promise.all(missingIds.map((id?) => getGuildMemberCached(guild, id)));
  for (let index = 0; index < missingIds.length; index += 1) {
    const member = fetchedMembers[index];
    if (member) out.set(missingIds[index], member);
  }
  return out;
}

function pad2(value?) {
  return String(value).padStart(2, "0");
}

function getRomeDayParts(date?) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, any> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour || 0),
    weekday: weekdayMap[String(map.weekday || "Sun")] ?? 0,
  };
}

function getRomeDayKey(date?) {
  const { year, month, day } = getRomeDayParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

const ROME_MONTH_NAMES_IT = [
  "",
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

function getRomeMonthKeyPrefix(date = new Date()) {
  const { year, month } = getRomeDayParts(date);
  return { year, month, prefix: `${year}-${pad2(month)}-` };
}

function getRomeMonthLabelIt(date = new Date()) {
  const { year, month } = getRomeDayParts(date);
  const name = ROME_MONTH_NAMES_IT[month] || `mese ${month}`;
  return `${name} ${year}`;
}

function getWeekKeyRome(date = new Date()) {
  const { year, month, day } = getRomeDayParts(date);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayNr = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 4));
  const weekNr = 1 + Math.round((utcDate - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${utcDate.getUTCFullYear()}-W${pad2(weekNr)}`;
}

function getNextWeekKeyRome(date = new Date()) {
  const next = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  return getWeekKeyRome(next);
}

function getActiveWeeklyKeyRome(date = new Date()) {
  const parts = getRomeDayParts(date);
  if (parts.weekday === 0 && parts.hour >= 21) {
    return getNextWeekKeyRome(date);
  }
  return getWeekKeyRome(date);
}

function floorToHourMs(ms?) {
  const n = Number(ms || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n / (60 * 60 * 1000)) * 60 * 60 * 1000;
}

function findLastSunday21RomeMs(now = new Date()) {
  let cursorMs = floorToHourMs(now.getTime());
  const maxHours = 24 * 8 + 2;
  for (let i = 0; i < maxHours; i += 1) {
    const parts = getRomeDayParts(new Date(cursorMs));
    if (parts.weekday === 0 && parts.hour === 21) return cursorMs;
    cursorMs -= 60 * 60 * 1000;
  }
  return floorToHourMs(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

function buildHourKeysBetweenRome(startMs?, endMs?) {
  const from = floorToHourMs(startMs);
  const to = floorToHourMs(endMs);
  if (!from || !to || to < from) return [];
  const keys = [];
  for (let ms = from; ms <= to; ms += 60 * 60 * 1000) {
    const parts = getRomeDayParts(new Date(ms));
    keys.push(`${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}`);
  }
  return keys;
}

async function resolveMemberRole(guild?) {
  if (!guild) return null;
  const configuredId = String(IDs.roles?.Member || "").trim();
  if (configuredId) {
    const role = guild.roles?.cache?.get(configuredId) || (await guild.roles?.fetch(configuredId).catch(() => null));
    if (role) return role;
  }
  return guild.roles?.everyone || null;
}

function extractChannelEntries(raw?) {
  if (!raw) return [];
  if (raw instanceof Map) return Array.from(raw.entries());
  if (typeof raw === "object") return Object.entries(raw);
  return [];
}

function toObjectMap(raw?) {
  if (!raw) return {};
  if (raw instanceof Map) return Object.fromEntries(raw.entries());
  if (typeof raw === "object") return raw;
  return {};
}

function extractProfileBucketRows(doc?, bucketField?) {
  const userId = String(doc?.userId || "");
  const bucket = toObjectMap(
    String(bucketField).includes(".")
      ? String(bucketField).split(".").reduce((acc?, key?) => (acc && typeof acc === "object" ? acc[key] : undefined), doc)
      : doc?.[bucketField],
  );
  if (!userId || !bucket || typeof bucket !== "object") return [];
  return Object.values(bucket).map((row?) => ({
    userId,
    textCount: Number(row?.textCount || 0),
    voiceSeconds: Number(row?.voiceSeconds || 0),
    textChannels: toObjectMap(row?.textChannels || {}),
    voiceChannels: toObjectMap(row?.voiceChannels || {}),
  }));
}

async function getEligibleChannelIdSet(guild?) {
  const role = await resolveMemberRole(guild);
  if (!role) return new Set();
  const excludedChannelIds = new Set(
    [IDs.channels?.ticket, IDs.channels?.ticketLogs]
      .filter(Boolean)
      .map((id?) => String(id)),
  );
  const excludedCategoryIds = new Set(
    [IDs.categories?.categoryPrivate]
      .filter(Boolean)
      .map((id?) => String(id)),
  );
  const set = new Set();
  for (const channel of guild.channels.cache.values()) {
    if (excludedChannelIds.has(String(channel?.id || ""))) continue;
    if (excludedCategoryIds.has(String(channel?.id || ""))) continue;
    if (excludedCategoryIds.has(String(channel?.parentId || ""))) continue;
    if (isChannelInTicketCategory(channel)) continue;
    const perms = channel?.permissionsFor?.(role);
    if (!perms?.has("ViewChannel")) continue;
    if (perms.has("SendMessages") || perms.has("Connect")) {
      set.add(String(channel.id));
    }
  }
  return set;
}

async function computeLeaderboardRows(guild?, mode = "alltime", maxCandidates = TOP_LIMIT * 5) {
  if (!guild?.id) return [];
  const weeklyStartMs = mode === "weekly" ? findLastSunday21RomeMs(new Date()) : 0;
  const romeNow = getRomeDayParts(new Date());
  const monthlySlice =
    mode === "monthly" ? `${romeNow.year}-${pad2(romeNow.month)}` : "";
  const key = `${guild.id}:${mode}:${
    mode === "weekly" ? weeklyStartMs : mode === "monthly" ? monthlySlice : ""
  }:n${maxCandidates}`;
  const cached = leaderboardCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;

  if (mode === "weekly") {
    const startMs = weeklyStartMs;
    const hourKeys = buildHourKeysBetweenRome(startMs, Date.now());
    const docs = [];
    const profileDocs = await ActivityUserProfile.find({ guildId: guild.id }).select("userId profile.totals.hourly").lean().catch(() => []);
    if (profileDocs.length) {
      const keySet = new Set(hourKeys.map(String));
      for (const doc of profileDocs) {
        const hourly = toObjectMap(doc?.profile?.totals?.hourly || {});
        const userId = String(doc?.userId || "");
        if (!userId) continue;
        for (const [hourKey, row] of Object.entries(hourly)) {
          if (!keySet.has(String(hourKey))) continue;
          docs.push({
            userId,
            textCount: Number(row?.textCount || 0),
            voiceSeconds: Number(row?.voiceSeconds || 0),
          });
        }
      }
    }

    const perUser = new Map();
    for (const doc of docs) {
      const userId = String(doc?.userId || "");
      if (!userId) continue;
      const textCount = Math.max(0, Number(doc?.textCount || 0));
      const voiceSeconds = Math.max(0, Number(doc?.voiceSeconds || 0));
      if (textCount <= 0 && voiceSeconds <= 0) continue;
      const current = perUser.get(userId) || { userId, textCount: 0, voiceSeconds: 0 };
      current.textCount += textCount;
      current.voiceSeconds += voiceSeconds;
      perUser.set(userId, current);
    }

    const rows = Array.from(perUser.values())
      .map((entry?) => {
        const baseExpFromText = entry.textCount * MESSAGE_EXP;
        const baseExpFromVoice = Math.floor((entry.voiceSeconds * VOICE_EXP_PER_MINUTE) / 60);
        const exp = Math.max(0, Math.floor(baseExpFromText + baseExpFromVoice));
        return {
          userId: entry.userId,
          exp,
          level: getLevelInfo(exp).level,
          textCount: entry.textCount,
          voiceSeconds: entry.voiceSeconds,
        };
      })
      .filter((entry?) => entry.userId && entry.exp > 0)
      .sort((a?, b?) => b.exp - a.exp)
      .slice(0, Math.max(TOP_LIMIT * 5, maxCandidates));

    leaderboardCache.set(key, {
      rows,
      expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS,
    });
    return rows;
  }

  if (mode === "monthly") {
    const eligibleChannels = await getEligibleChannelIdSet(guild);
    if (!eligibleChannels.size) {
      leaderboardCache.set(key, {
        rows: [],
        expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS,
      });
      return [];
    }
    const { prefix: monthDayKeyPrefix } = getRomeMonthKeyPrefix(new Date());
    const perUserMonthly = new Map();
    const profileDocsMonthly = await ActivityUserProfile.find({ guildId: guild.id })
      .select("userId profile.totals.daily")
      .lean()
      .catch(() => []);
    if (profileDocsMonthly.length) {
      for (const doc of profileDocsMonthly) {
        const userId = String(doc?.userId || "");
        if (!userId) continue;
        const daily = toObjectMap(doc?.profile?.totals?.daily || {});
        for (const [dayKey, dayRow] of Object.entries(daily)) {
          if (!String(dayKey).startsWith(monthDayKeyPrefix)) continue;
          if (!dayRow || typeof dayRow !== "object") continue;
          let textCount = 0;
          let voiceSeconds = 0;
          for (const [channelId, value] of extractChannelEntries(dayRow?.textChannels)) {
            if (!eligibleChannels.has(String(channelId))) continue;
            textCount += Math.max(0, Number(value || 0));
          }
          for (const [channelId, value] of extractChannelEntries(dayRow?.voiceChannels)) {
            if (!eligibleChannels.has(String(channelId))) continue;
            voiceSeconds += Math.max(0, Number(value || 0));
          }
          if (textCount <= 0 && voiceSeconds <= 0) continue;
          const current = perUserMonthly.get(userId) || { userId, textCount: 0, voiceSeconds: 0 };
          current.textCount += textCount;
          current.voiceSeconds += voiceSeconds;
          perUserMonthly.set(userId, current);
        }
      }
    }

    const rowsMonthly = Array.from(perUserMonthly.values())
      .map((entry?) => {
        const baseExpFromText = entry.textCount * MESSAGE_EXP;
        const baseExpFromVoice = Math.floor((entry.voiceSeconds * VOICE_EXP_PER_MINUTE) / 60);
        const exp = Math.max(0, Math.floor(baseExpFromText + baseExpFromVoice));
        return {
          userId: entry.userId,
          exp,
          level: getLevelInfo(exp).level,
          textCount: entry.textCount,
          voiceSeconds: entry.voiceSeconds,
        };
      })
      .filter((entry?) => entry.userId && entry.exp > 0)
      .sort((a?, b?) => b.exp - a.exp)
      .slice(0, Math.max(TOP_LIMIT * 5, maxCandidates));

    leaderboardCache.set(key, {
      rows: rowsMonthly,
      expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS,
    });
    return rowsMonthly;
  }

  const eligibleChannels = await getEligibleChannelIdSet(guild);
  if (!eligibleChannels.size) return [];

  const filter = { guildId: guild.id };
  const perUser = new Map();
  const profileDocs = await ActivityUserProfile.find(filter).select("userId profile.totals.daily").lean().catch(() => []);
  if (profileDocs.length) {
    for (const doc of profileDocs) {
      for (const row of extractProfileBucketRows(doc, "profile.totals.daily")) {
        const userId = String(row?.userId || "");
        if (!userId) continue;
        let textCount = 0;
        let voiceSeconds = 0;
        for (const [channelId, value] of extractChannelEntries(row?.textChannels)) {
          if (!eligibleChannels.has(String(channelId))) continue;
          textCount += Math.max(0, Number(value || 0));
        }
        for (const [channelId, value] of extractChannelEntries(row?.voiceChannels)) {
          if (!eligibleChannels.has(String(channelId))) continue;
          voiceSeconds += Math.max(0, Number(value || 0));
        }
        if (textCount <= 0 && voiceSeconds <= 0) continue;
        const current = perUser.get(userId) || { userId, textCount: 0, voiceSeconds: 0 };
        current.textCount += textCount;
        current.voiceSeconds += voiceSeconds;
        perUser.set(userId, current);
      }
    }
  }

  const rows = Array.from(perUser.values()).map((entry?) => { const baseExpFromText = entry.textCount * MESSAGE_EXP; const baseExpFromVoice = Math.floor((entry.voiceSeconds * VOICE_EXP_PER_MINUTE) / 60,); const exp = Math.max(0, Math.floor(baseExpFromText + baseExpFromVoice)); return { userId: entry.userId, exp, level: getLevelInfo(exp).level, }; }).filter((entry?) => entry.exp > 0).sort((a?, b?) => b.exp - a.exp).slice(0, Math.max(TOP_LIMIT * 5, maxCandidates)); if (mode === "alltime" && rows.length > 0) {
    const userIds = rows.map((r?) => r.userId);
    const profileExpUsers = await ActivityUserProfile.find({ guildId: guild.id, userId: { $in: userIds } }).select("userId profile.totals.exp.totalExp profile.totals.exp.level").lean().catch(() => []);
    const expUsers = profileExpUsers.map((d?) => ({ userId: d?.userId, totalExp: d?.profile?.totals?.exp?.totalExp, level: d?.profile?.totals?.exp?.level }));
    const expByUser = new Map(expUsers.map((d?) => [String(d.userId), { totalExp: Number(d.totalExp || 0), level: Number(d.level || 0) }]),);
    for (const row of rows) {
      const eu = expByUser.get(row.userId);
      if (eu != null) {
        row.level = eu.level > 0 ? eu.level : getLevelInfo(eu.totalExp).level;
      }
    }
  }

  leaderboardCache.set(key, {
    rows,
    expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS,
  });
  return rows;
}

async function computeDailyBucketTotalsByUser(guild?) {
  if (!guild?.id) return new Map();
  const eligibleChannels = await getEligibleChannelIdSet(guild);
  if (!eligibleChannels.size) return new Map();
  const perUser = new Map();
  const profileDocs = await ActivityUserProfile.find({ guildId: guild.id })
    .select("userId profile.totals.daily profile.totals.messagesTotal profile.totals.voiceTotalSeconds")
    .lean()
    .catch(() => []);
  for (const doc of profileDocs) {
    const userId = String(doc?.userId || "");
    if (!userId) continue;
    let textCount = 0;
    let voiceSeconds = 0;
    for (const row of extractProfileBucketRows(doc, "profile.totals.daily")) {
      let t = 0;
      let v = 0;
      for (const [channelId, value] of extractChannelEntries(row?.textChannels)) {
        if (!eligibleChannels.has(String(channelId))) continue;
        t += Math.max(0, Number(value || 0));
      }
      for (const [channelId, value] of extractChannelEntries(row?.voiceChannels)) {
        if (!eligibleChannels.has(String(channelId))) continue;
        v += Math.max(0, Number(value || 0));
      }
      textCount += t;
      voiceSeconds += v;
    }
    const msgProf = Math.max(0, Math.floor(Number(doc.profile?.totals?.messagesTotal || 0)));
    const vocProf = Math.max(0, Math.floor(Number(doc.profile?.totals?.voiceTotalSeconds || 0)));
    const mergedText = Math.max(textCount, msgProf);
    const mergedVoice = Math.max(voiceSeconds, vocProf);
    if (mergedText <= 0 && mergedVoice <= 0) continue;
    perUser.set(userId, { userId, textCount: mergedText, voiceSeconds: mergedVoice });
  }
  return perUser;
}

function sortDailyActivityTotals(perUser?, board?) {
  const arr = Array.from(perUser.values());
  if (board === "messages") {
    return arr.filter((e?: any) => e.textCount > 0).sort((a?: any, b?: any) => b.textCount - a.textCount);
  }
  if (board === "voice") {
    return arr.filter((e?: any) => e.voiceSeconds > 0).sort((a?: any, b?: any) => b.voiceSeconds - a.voiceSeconds);
  }
  return [];
}

function sumRomeDayEligibleActivityFromDailyDoc(doc?, dateKey?, eligibleChannels?) {
  const dk = String(dateKey || "").trim();
  if (!dk || !doc?.profile?.totals?.daily || typeof doc.profile.totals.daily !== "object") {
    return { text: 0, voiceSeconds: 0 };
  }
  const dayRow = doc.profile.totals.daily[dk];
  if (!dayRow || typeof dayRow !== "object") {
    return { text: 0, voiceSeconds: 0 };
  }
  const elig = eligibleChannels instanceof Set && eligibleChannels.size > 0 ? eligibleChannels : null;
  if (elig) {
    let text = 0;
    let voiceSeconds = 0;
    for (const [channelId, value] of extractChannelEntries(dayRow.textChannels)) {
      if (!elig.has(String(channelId))) continue;
      text += Math.max(0, Number(value || 0));
    }
    for (const [channelId, value] of extractChannelEntries(dayRow.voiceChannels)) {
      if (!elig.has(String(channelId))) continue;
      voiceSeconds += Math.max(0, Number(value || 0));
    }
    return { text, voiceSeconds };
  }
  return {
    text: Math.max(0, Math.floor(Number(dayRow.textCount || 0))),
    voiceSeconds: Math.max(0, Math.floor(Number(dayRow.voiceSeconds || 0))),
  };
}

async function computeExpUserLeaderboardRows(guild?, mode?, maxCandidates?) {
  if (!guild?.id) return [];
  const weekKey = getCurrentWeekKey();
  const key = `${guild.id}:expuser:${mode}:${weekKey}:n${maxCandidates}`;
  const cached = leaderboardCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  const cap = Math.max(TOP_LIMIT * 5, maxCandidates);
  let rows = [];
  if (mode === "weekly") {
    const profileDocs = await ActivityUserProfile.find({
      guildId: guild.id,
      "profile.totals.exp.weeklyKey": weekKey,
      "profile.totals.exp.weeklyExp": { $gt: 0 },
    })
      .select("userId profile.totals.exp")
      .sort({ "profile.totals.exp.weeklyExp": -1 })
      .limit(cap)
      .lean()
      .catch(() => []);
    const docs = profileDocs.map((d?) => ({
      userId: d?.userId,
      weeklyExp: d?.profile?.totals?.exp?.weeklyExp,
      level: d?.profile?.totals?.exp?.level,
      totalExp: d?.profile?.totals?.exp?.totalExp,
    }));
    rows = docs.map((d?) => ({
      userId: String(d.userId || ""),
      exp: Math.max(0, Math.floor(Number(d.weeklyExp || 0))),
      level: Number(d.level || 0) || getLevelInfo(Math.max(0, Number(d.totalExp || 0))).level,
    }));
  } else {
    const profileDocs = await ActivityUserProfile.find({ guildId: guild.id, "profile.totals.exp.totalExp": { $gt: 0 } })
      .select("userId profile.totals.exp")
      .sort({ "profile.totals.exp.totalExp": -1 })
      .limit(cap)
      .lean()
      .catch(() => []);
    const docs = profileDocs.map((d?) => ({ userId: d?.userId, totalExp: d?.profile?.totals?.exp?.totalExp, level: d?.profile?.totals?.exp?.level }));
    rows = docs.map((d?) => ({
      userId: String(d.userId || ""),
      exp: Math.max(0, Math.floor(Number(d.totalExp || 0))),
      level: Number(d.level || 0) || getLevelInfo(Math.max(0, Number(d.totalExp || 0))).level,
    }));
  }
  leaderboardCache.set(key, {
    rows,
    expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS,
  });
  return rows;
}

async function buildWeeklyEmbed(guild?, excludeStaffFromShort = false, useExpUserBoard = false) {
  const maxCand = excludeStaffFromShort ? TOP_LIMIT * 40 : TOP_LIMIT * 5;
  const candidateRows = await computeLeaderboardRows(guild, "weekly", maxCand);
  const members = await fetchMembers(guild, candidateRows.map((r?) => r.userId),);
  let rows = candidateRows;
  if (excludeStaffFromShort) {
    rows = rows.filter((row?) => !memberHasStaffRole(members.get(row.userId)));
  }
  rows = rows.slice(0, TOP_LIMIT);
  const lines = [];
  rows.forEach((row?, index?) => {
    const member = members.get(row.userId);
    const label = formatUserLabel(member, row.userId);
    const exp = Number(row.exp || 0);
    lines.push(`${rankLabel(index)} ${label}`);
    lines.push(
      `<:VC_Reply:1482532158080942191> __${exp}__ EXP <:VC_EXP:1482534670896730143>`,
    );
  });

  if (lines.length === 0) {
    lines.push("Nessun dato disponibile per questa settimana.");
  }

  const gIcon = guildIconUrl(guild, { size: 128 });
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: guild.name,
      iconURL: gIcon || undefined,
    })
    .setTitle("Classifica settimanale [Weekly]")
    .setThumbnail(gIcon || null)
    .setDescription(
      [
        useExpUserBoard
          ? "<a:VC_Sparkles:1468546911936974889> I 10 utenti con più exp guadagnati in settimana [Weekly]"
          : null,
        excludeStaffFromShort ? "" : null,
      ]
        .filter((line?) => line != null && line !== "")
        .join("\n") +
        "\n\n" +
        lines.join("\n"),
    );
}

async function buildMonthlyEmbed(guild?, excludeStaffFromShort = false, useExpUserBoard = false) {
  const maxCand = excludeStaffFromShort ? TOP_LIMIT * 40 : TOP_LIMIT * 5;
  const candidateRows = await computeLeaderboardRows(guild, "monthly", maxCand);
  const members = await fetchMembers(guild, candidateRows.map((r?) => r.userId),);
  let rows = candidateRows;
  if (excludeStaffFromShort) {
    rows = rows.filter((row?) => !memberHasStaffRole(members.get(row.userId)));
  }
  rows = rows.slice(0, TOP_LIMIT);
  const lines = [];
  rows.forEach((row?, index?) => {
    const member = members.get(row.userId);
    const label = formatUserLabel(member, row.userId);
    const exp = Number(row.exp || 0);
    lines.push(`${rankLabel(index)} ${label}`);
    lines.push(
      `<:VC_Reply:1482532158080942191> __${exp}__ EXP <:VC_EXP:1482534670896730143>`,
    );
  });

  if (lines.length === 0) {
    lines.push("Nessun dato disponibile per questo mese.");
  }

  const monthLabelIt = getRomeMonthLabelIt(new Date());
  const gIconMo = guildIconUrl(guild, { size: 128 });
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: guild.name,
      iconURL: gIconMo || undefined,
    })
    .setTitle(`Classifica mensile [Monthly] — ${monthLabelIt}`)
    .setThumbnail(gIconMo || null)
    .setDescription(
      [
        useExpUserBoard
          ? "<a:VC_Sparkles:1468546911936974889> I 10 utenti con più EXP nel mese corrente"
          : null,
        excludeStaffFromShort ? "" : null,
      ]
        .filter((line?) => line != null && line !== "")
        .join("\n") +
        "\n\n" +
        lines.join("\n"),
    );
}

async function buildAllTimeEmbed(guild?, excludeStaffFromShort = false, useExpUserBoard = false) {
  const maxCand = excludeStaffFromShort ? TOP_LIMIT * 40 : TOP_LIMIT * 5;
  const candidateRows = await computeExpUserLeaderboardRows(guild, "alltime", maxCand);
  const members = await fetchMembers(guild, candidateRows.map((r?) => r.userId),);
  let rows = candidateRows.filter((row?) => members.has(row.userId));
  rows = rows.slice(0, TOP_LIMIT);
  const lines = [];
  rows.forEach((row?, index?) => {
    const member = members.get(row.userId);
    const label = formatUserLabel(member, row.userId);
    const exp = Number(row.exp || 0);
    const level = Number(row.level || 0) || getLevelInfo(Math.max(0, exp)).level;
    lines.push(`${rankLabel(index)} ${label}`);
    lines.push(
      `<:VC_Reply:1482532158080942191> Exp: <:VC_EXP:1482534670896730143> __${exp}__ <a:VC_Arrow:1482706699365257397> Livello: ${level}`,
    );
  });

  if (lines.length === 0) {
    lines.push("Nessun dato disponibile.");
  }

  const gIconAll = guildIconUrl(guild, { size: 128 });
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: guild.name,
      iconURL: gIconAll || undefined,
    })
    .setTitle("Classifica generale [AllTime]")
    .setThumbnail(gIconAll || null)
    .setDescription(
      [
        useExpUserBoard
          ? "<a:VC_Sparkles:1468546911936974889> I 10 utenti con più exp guadagnati [AllTime]"
          : null,
        excludeStaffFromShort ? "" : null,
      ]
        .filter((line?) => line != null && line !== "")
        .join("\n") +
        "\n\n" +
        lines.join("\n"),
    );
}

function buildClassificaButtons(mode = "weekly", options: Record<string, any> = {}) {
  const active =
    mode === "alltime" ? "alltime" : mode === "monthly" ? "monthly" : "weekly";
  const ownerId = String(options.ownerId || "").trim();
  const sourceMessageId = String(options.sourceMessageId || "").trim();
  const hasMeta = /^\d{16,20}$/.test(ownerId) && /^\d{16,20}$/.test(sourceMessageId);
  const weeklyId = hasMeta
    ? `${CLASSIFICA_TOGGLE_PREFIX}weekly:${ownerId}:${sourceMessageId}`
    : `${CLASSIFICA_TOGGLE_PREFIX}weekly`;
  const monthlyId = hasMeta
    ? `${CLASSIFICA_TOGGLE_PREFIX}monthly:${ownerId}:${sourceMessageId}`
    : `${CLASSIFICA_TOGGLE_PREFIX}monthly`;
  const alltimeId = hasMeta
    ? `${CLASSIFICA_TOGGLE_PREFIX}alltime:${ownerId}:${sourceMessageId}`
    : `${CLASSIFICA_TOGGLE_PREFIX}alltime`;
  const closeId = hasMeta
    ? `${CLASSIFICA_CLOSE_PREFIX}${ownerId}:${sourceMessageId}`
    : `${CLASSIFICA_CLOSE_PREFIX}0:0`;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(weeklyId)
        .setStyle(active === "weekly" ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setEmoji("<a:vegaleftarrow:1462914743416131816>"),
      new ButtonBuilder()
        .setCustomId(monthlyId)
        .setStyle(active === "monthly" ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setLabel("Mese")
        .setEmoji("📅"),
      new ButtonBuilder()
        .setCustomId(alltimeId)
        .setStyle(active === "alltime" ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setEmoji("<a:vegarightarrow:1443673039156936837>"),
      new ButtonBuilder()
        .setCustomId(closeId)
        .setStyle(ButtonStyle.Danger)
        .setEmoji("<:cancel:1461730653677551691>"),
    ),
  ];
}

async function buildClassificaPayload(guild?, mode = "weekly", options: Record<string, any> = {}) {
  const safeMode =
    mode === "alltime" ? "alltime" : mode === "monthly" ? "monthly" : "weekly";
  const embed =
    safeMode === "weekly"
      ? await buildWeeklyEmbed(guild, false, false)
      : safeMode === "monthly"
        ? await buildMonthlyEmbed(guild, false, false)
        : await buildAllTimeEmbed(guild, false, false);
  return { embeds: [embed], components: buildClassificaButtons(safeMode, options) };
}

function computeWeeklyExpFromProfileDoc(doc?, now = new Date()) {
  const userId = String(doc?.userId || "");
  if (!userId) return 0;
  const weeklyStartMs = findLastSunday21RomeMs(now);
  const hourKeys = new Set(buildHourKeysBetweenRome(weeklyStartMs, now.getTime()));
  if (!hourKeys.size) return 0;
  const hourly = toObjectMap(doc?.profile?.totals?.hourly || {});
  let textCount = 0;
  let voiceSeconds = 0;
  for (const [hourKey, row] of Object.entries(hourly)) {
    if (!hourKeys.has(String(hourKey))) continue;
    textCount += Math.max(0, Number(row?.textCount || 0));
    voiceSeconds += Math.max(0, Number(row?.voiceSeconds || 0));
  }
  if (textCount <= 0 && voiceSeconds <= 0) return 0;
  const baseExpFromText = textCount * MESSAGE_EXP;
  const baseExpFromVoice = Math.floor((voiceSeconds * VOICE_EXP_PER_MINUTE) / 60);
  return Math.max(0, Math.floor(baseExpFromText + baseExpFromVoice));
}

export = {
  name: "classifica",
  aliases: ["c", "cs"],
  allowEmptyArgs: true,
  TOP_LIMIT,
  rankLabel,
  formatUserLabel,
  fetchMembers,

  async execute(message?) {
    await message.channel.sendTyping();
    const deniedPartnerZone = await partnersChatPartnerCommandDeniedReplyContent(message.channel);
    if (deniedPartnerZone) {
      await sendPartnersChatDeniedPrefixCleanup(message, deniedPartnerZone);
      return;
    }
    if (await isPartnerPmDailyCommandsThread(message.channel)) {
      const { buildPartnerLeaderboardPayload } = require("../../Utils/Partner/partnerLeaderboardRuntime") as typeof import("../../Utils/Partner/partnerLeaderboardRuntime");
      const partnerPayload = await buildPartnerLeaderboardPayload(message.client, message.guild, "settimanale", 1);
      await safeMessageReply(message, {
        ...partnerPayload,
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const mode = "weekly";
    const payload = await buildClassificaPayload(message.guild, mode, {
      ownerId: message.author?.id,
      sourceMessageId: message.id,
    });

    const shouldRedirect = message.channel.id !== LEADERBOARD_CHANNEL_ID;
    if (!shouldRedirect) {
      await safeMessageReply(message, {
        ...payload,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const leaderboardChannel = message.guild.channels.cache.get(LEADERBOARD_CHANNEL_ID) || (await getGuildChannelCached(message.guild, LEADERBOARD_CHANNEL_ID));

    if (!leaderboardChannel || !leaderboardChannel.isTextBased()) {
      await safeMessageReply(message, {
        content: `Non riesco a trovare il canale <#${LEADERBOARD_CHANNEL_ID}>.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const sent = await leaderboardChannel.send(payload).catch(() => null);
    if (!sent) {
      await safeMessageReply(message, {
        content: `Non sono riuscito a inviare la classifica in <#${LEADERBOARD_CHANNEL_ID}>.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const label = "Vai alla classifica";
    const redirectEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(`Per evitare di intasare la chat, la classifica` +
      ` (settimanale, mensile o generale) è stata generata nel canale <#${LEADERBOARD_CHANNEL_ID}>.\n` +
      `[Clicca qui per vederla](${sent.url}) o utilizza i pulsanti sotto il messaggio nel canale indicato.`);

    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(sent.url),);

    await safeMessageReply(message, {
      embeds: [redirectEmbed],
      components: [row],
      allowedMentions: { repliedUser: false },
    });
  },
  CLASSIFICA_TOGGLE_PREFIX,
  CLASSIFICA_CLOSE_PREFIX,
  buildClassificaPayload,
    computeLeaderboardRows,
  computeWeeklyExpFromProfileDoc,
  computeDailyBucketTotalsByUser,
  sortDailyActivityTotals,
  getRomeDayKey,
  getEligibleChannelIdSet,
  sumRomeDayEligibleActivityFromDailyDoc,
};