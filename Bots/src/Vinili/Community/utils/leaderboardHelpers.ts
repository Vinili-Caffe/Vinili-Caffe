const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { MESSAGE_EXP, VOICE_EXP_PER_MINUTE, getLevelInfo } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
const { isChannelInTicketCategory } = require("../../../MultiGuild/tickets/discord/ticketCategoryUtils") as typeof import("../../../MultiGuild/tickets/discord/ticketCategoryUtils");
const { memberHasStaffRole } = require("./staffListUtils") as typeof import("./staffListUtils");
const { guildIconUrl } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const { loadHourlyRows } = require("../services/activityRows") as typeof import("../services/activityRows");
const TOP_LIMIT = 10;
const TIME_ZONE = "Europe/Rome";
const LEADERBOARD_CACHE_TTL_MS = 30 * 1000;
const leaderboardCache = new Map();

function rankLabel(index?) {
  if (index === 0) return E.VC_Podio1;
  if (index === 1) return E.VC_Podio2;
  if (index === 2) return E.VC_Podio3;
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

function getRomeMonthKeyPrefix(date = new Date()) {
  const { year, month } = getRomeDayParts(date);
  return { year, month, prefix: `${year}-${pad2(month)}-` };
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
    /* compact: ActivityGuildHourly; dual/legacy: anche profile.totals.hourly via loadHourlyRows */
    const hourlyRows = await loadHourlyRows(guild.id, hourKeys).catch(() => []);

    const perUser = new Map();
    for (const row of hourlyRows) {
      const userId = String(row?.userId || "");
      if (!userId) continue;
      const textCount = Math.max(0, Number(row?.textCount || 0));
      const voiceSeconds = Math.max(0, Number(row?.voiceSeconds || 0));
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
    /* site-api spesso ha channels.cache vuoto: senza fallback il mensile tornava sempre []. */
    const eligibleChannels = await getEligibleChannelIdSet(guild);
    const filterByChannel = eligibleChannels.size > 0;
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
            if (filterByChannel && !eligibleChannels.has(String(channelId))) continue;
            textCount += Math.max(0, Number(value || 0));
          }
          for (const [channelId, value] of extractChannelEntries(dayRow?.voiceChannels)) {
            if (filterByChannel && !eligibleChannels.has(String(channelId))) continue;
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
      const eu: any = expByUser.get(row.userId);
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

async function computeWeeklyExpFromProfileDoc(doc?, now = new Date(), guildId = null) {
  const userId = String(doc?.userId || "");
  if (!userId) return 0;
  const gid = String(guildId || doc?.guildId || "").trim();
  const weeklyStartMs = findLastSunday21RomeMs(now);
  const hourKeyList = buildHourKeysBetweenRome(weeklyStartMs, now.getTime());
  if (!hourKeyList.length) return 0;

  let textCount = 0;
  let voiceSeconds = 0;

  if (gid) {
    const rows = await loadHourlyRows(gid, hourKeyList, userId).catch(() => []);
    for (const row of rows) {
      textCount += Math.max(0, Number(row?.textCount || 0));
      voiceSeconds += Math.max(0, Number(row?.voiceSeconds || 0));
    }
  }

  if (textCount <= 0 && voiceSeconds <= 0) {
    const hourKeys = new Set(hourKeyList.map(String));
    const hourly = toObjectMap(doc?.profile?.totals?.hourly || {});
    for (const [hourKey, row] of Object.entries(hourly)) {
      if (!hourKeys.has(String(hourKey))) continue;
      textCount += Math.max(0, Number(row?.textCount || 0));
      voiceSeconds += Math.max(0, Number(row?.voiceSeconds || 0));
    }
  }

  if (textCount <= 0 && voiceSeconds <= 0) return 0;
  const baseExpFromText = textCount * MESSAGE_EXP;
  const baseExpFromVoice = Math.floor((voiceSeconds * VOICE_EXP_PER_MINUTE) / 60);
  return Math.max(0, Math.floor(baseExpFromText + baseExpFromVoice));
}

/* Helper classifiche (ex +classifica). Nessun comando Discord. */
export = {
  TOP_LIMIT,
  rankLabel,
  formatUserLabel,
  fetchMembers,
  computeLeaderboardRows,
  computeWeeklyExpFromProfileDoc,
  getRomeDayKey,
};