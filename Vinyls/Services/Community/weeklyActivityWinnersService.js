const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const cron = require("node-cron");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached");
const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { VOICE_EXP_PER_MINUTE, MESSAGE_EXP } = require("./expService");
const { addGaleoni } = require("./gringottService");
const { resolveHogwartsEventConfig, isEventWindowOpen, resolveHubStartMs } = require("../../Utils/Web/hogwartsSortingConfig");
const { HOUSES } = require("../../Utils/Web/hogwartsSortingBank");
const { housePointPeriodKey, periodEndingOnDate, resolvePeriodBounds } = require("../../Utils/Web/hogwartsHousePointPeriods");
const IDs = require("../../Utils/Config/ids");
const { voteCountMonthKeyRome } = require("../../Utils/romeVoteMonthKey");
const { isChannelInTicketCategory } = require("../../Utils/Ticket/ticketCategoryUtils");
const { siteTicketsPageDiscordRef } = require("../../../shared/web/siteTicketsPageRef");
const { getClientChannelCached, getClientGuildCached, getGuildChannelCached, getGuildMemberCached, getGuildRoleCached, getUserCached } = require("../../Utils/Interaction/interactionEntityCache");
const { guildIconUrl } = require("../../Utils/Discord/guildDiscordIdentity");
const TIME_ZONE = "Europe/Rome";
const TARGET_CHANNEL_ID = IDs.channels.topWeeklyUser;
const INFO_CHANNEL_ID = IDs.channels.info;
const TROPHY_LABELS = ["<:VC_Podio1:1482694399283433582>", "<:VC_Podio2:1482694424411635712>", "<:VC_Podio3:1482694450806259744>"];
const MESSAGE_WINNER_ROLE_ID = IDs.roles.TopWeeklyText;
const VOICE_WINNER_ROLE_ID = IDs.roles.TopWeeklyVoc;
const MINIGAME_WINNER_ROLE_ID = IDs.roles.MVP;
const ROYALE_MINIGAME_ROLE_ID = IDs.roles.Royale;
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
const MONTHLY_TOP_NEW_REWARDS_FIRST_RANKED = Object.freeze({ year: 2026, month: 6 });
const REQUIRED_MEMBER_ROLE_ID = String(IDs.roles.Member || "");
const WEEKLY_WINNERS_EXCLUDED_ROLE_IDS = new Set( [IDs.roles.Staff, IDs.roles.HighStaff, IDs.roles.Helper, IDs.roles.Mod, IDs.roles.SeniorModerator, IDs.roles.Director, IDs.roles.Admin, IDs.roles.Manager, IDs.roles.Founder].filter(Boolean).map((id) => String(id)));
const HOGWARTS_EVENT_TOP_EXCLUDED_ROLE_IDS = new Set();
const WEEKLY_WINNERS_PUBLISH_INTRO_MARK = "Annunciamo i vincitori di questa settimana";
const HOGWARTS_BIWEEKLY_PUBLISH_DOC = "hogwarts_biweekly_top_publish";
const HOGWARTS_BIWEEKLY_PUBLISH_OWNER_ID = "__event__";
const HOGWARTS_BIWEEKLY_MS = 14 * 24 * 60 * 60 * 1000;
const HOGWARTS_BIWEEKLY_HOUSE_POINTS_BY_RANK = [300, 200, 100];
const HOGWARTS_BIWEEKLY_GALEONI_BY_RANK = [150, 100, 50];
const HOGWARTS_SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const HOGWARTS_HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOGWARTS_HOUSE_POINTS_OWNER_ID = "__event__";
const BACKFILL_HOUR_SUFFIX = "T12";
const TEMP_SUPPRESS_MINIGAME_WEEK_KEYS = new Set(
  ["2026-W19"]
    .map((k) => String(k || "").trim())
    .filter(Boolean),
);

function shouldSkipBackfillRow(hourKey, hourSet) {
  if (!hourKey || typeof hourKey !== "string") return false;
  if (!hourKey.endsWith(BACKFILL_HOUR_SUFFIX)) return false;
  const dateKey = hourKey.slice(0, -BACKFILL_HOUR_SUFFIX.length);
  return [...hourSet].some((k) => k.startsWith(`${dateKey}T`) && k !== hourKey);
}

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

function getLastSunday12BoundaryMsAtOrBefore(date = new Date()) {
  const nowMs = date instanceof Date ? date.getTime() : Number(date);
  if (!Number.isFinite(nowMs)) return Date.now();
  const p = getRomeDateTimeParts(new Date(nowMs));
  if (p.weekday === 0) {
    const thisSunday12 = createUtcFromRomeLocal(p.year, p.month, p.day, 12, 0, 0).getTime();
    if (nowMs < thisSunday12) {
      return createUtcFromRomeLocal(p.year, p.month, p.day - 7, 12, 0, 0).getTime();
    }
    return thisSunday12;
  }
  return createUtcFromRomeLocal(p.year, p.month, p.day - p.weekday, 12, 0, 0).getTime();
}

function romeDateKeyFromMs(ms) {
  const p = getRomeDateTimeParts(new Date(ms));
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function buildBiweekPeriodKey(endMs) {
  const end = Number(endMs);
  if (!Number.isFinite(end)) return "";
  return `${romeDateKeyFromMs(end - HOGWARTS_BIWEEKLY_MS)}_${romeDateKeyFromMs(end)}`;
}

function resolveHogwartsBiweeklyWindow(now = new Date()) {
  const boundaryMs = getLastSunday12BoundaryMsAtOrBefore(now);
  const dateKey = romeDateKeyFromMs(boundaryMs);
  const schoolPeriod = periodEndingOnDate(dateKey);
  if (schoolPeriod) {
    const bounds = resolvePeriodBounds(schoolPeriod.key);
    if (bounds && Number.isFinite(bounds.startMs)) {
      return {
        periodKey: schoolPeriod.key,
        periodStartMs: bounds.startMs,
        periodEndMs: boundaryMs,
        schoolPeriod,
        hourWindowDays: Math.max(1, Math.ceil((boundaryMs - bounds.startMs) / (24 * 60 * 60 * 1000))),
      };
    }
  }
  return {
    periodKey: buildBiweekPeriodKey(boundaryMs),
    periodStartMs: boundaryMs - HOGWARTS_BIWEEKLY_MS,
    periodEndMs: boundaryMs,
    schoolPeriod: null,
    hourWindowDays: 14,
  };
}

function buildLastNDaysHourKeys(endMs, days) {
  const n = Math.max(1, Math.min(21, Math.floor(Number(days) || 14)));
  const keys = [];
  for (let h = 0; h < 24 * n; h += 1) {
    const d = new Date(endMs - h * 60 * 60 * 1000);
    const parts = getTimeParts(d);
    keys.push(`${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}`);
  }
  return keys;
}

function buildLast14DaysHourKeys(endMs) {
  return buildLastNDaysHourKeys(endMs, 14);
}

function getIsoWeekKeysInBiweeklyWindow(endMs, startMs = null) {
  const end = Number(endMs);
  if (!Number.isFinite(end)) return [];
  const start = Number(startMs);
  const spanMs = Number.isFinite(start) && start < end ? end - start : HOGWARTS_BIWEEKLY_MS;
  const keys = new Set();
  for (let h = 0; h < Math.ceil(spanMs / (60 * 60 * 1000)); h += 12) {
    const parts = getTimeParts(new Date(end - h * 60 * 60 * 1000));
    keys.add(getWeekKey(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0))));
  }
  return [...keys].filter(Boolean);
}

function isHogwartsWeeklyTopReplaced(client) {
  const cfg = resolveHogwartsEventConfig(client);
  if (!cfg?.enabled) return false;
  const gate = isEventWindowOpen(cfg, Date.now());
  return Boolean(gate?.open);
}

function shouldPublishHogwartsBiweeklyToday(now = new Date(), eventStartMs) {
  const endMs = getLastSunday12BoundaryMsAtOrBefore(now);
    if (periodEndingOnDate(romeDateKeyFromMs(endMs))) return true;
  const start = Number(eventStartMs);
  if (!Number.isFinite(start)) return false;
  const anchorMs = getLastSunday12BoundaryMsAtOrBefore(new Date(start));
  const daysSince = Math.floor((endMs - anchorMs) / (24 * 60 * 60 * 1000));
  if (daysSince < 14) return false;
  return daysSince % 14 === 0;
}

function normalizeHogwartsHouseId(value) {
  const h = String(value || "").trim().toLowerCase();
  return HOUSES.includes(h) ? h : "";
}

async function loadSortedHouseByUserId(guildId, eventKey) {
  const rows = await SiteDocument.find({
    docType: HOGWARTS_SORTING_DOC,
    guildId: String(guildId || "").trim(),
    dedupeKey: String(eventKey || "").trim(),
    status: { $in: HOUSES },
  })
    .select("userId status")
    .lean()
    .catch(() => []);
  const map = new Map();
  for (const row of rows) {
    const uid = String(row?.userId || "").trim();
    const house = normalizeHogwartsHouseId(row?.status);
    if (!uid || !house || map.has(uid)) continue;
    map.set(uid, house);
  }
  return map;
}

function filterDocsToSortedUsers(docs, sortedHouseByUserId) {
  const list = Array.isArray(docs) ? docs : [];
  if (!sortedHouseByUserId?.size) return [];
  return list.filter((doc) => sortedHouseByUserId.has(String(doc?.userId || "").trim()));
}

function pickTopThreeDistinctHouses(ranking, sortedHouseByUserId, limit = 3, excludedUserIds = null) {
  const cap = Math.max(1, Math.min(25, Number(limit) || 3));
  const excluded =
    excludedUserIds instanceof Set
      ? excludedUserIds
      : new Set((Array.isArray(excludedUserIds) ? excludedUserIds : []).map((id) => String(id)).filter(Boolean));
  const out = [];
  const usedHouses = new Set();
  const list = Array.isArray(ranking) ? ranking : [];
  for (const row of list) {
    if (out.length >= cap) break;
    const userId = String(row?.userId || "").trim();
    if (!userId || excluded.has(userId)) continue;
    const houseId = sortedHouseByUserId.get(userId);
    if (!houseId || usedHouses.has(houseId)) continue;
    usedHouses.add(houseId);
    out.push({ ...row, houseId });
  }
  return out;
}

const HOGWARTS_BIWEEKLY_TOP_CATEGORY_ORDER = ["messages", "voice", "minigame"];

function resolveHogwartsBiweeklyUserKeeps(takeByCategory) {
  const kept = { messages: new Set(), voice: new Set(), minigame: new Set() };
  const uidSet = new Set();
  for (const cat of HOGWARTS_BIWEEKLY_TOP_CATEGORY_ORDER) {
    for (const row of takeByCategory[cat] || []) {
      const uid = String(row?.userId || "").trim();
      if (uid) uidSet.add(uid);
    }
  }
  for (const uid of uidSet) {
    let bestCat = null;
    let bestRank = Infinity;
    let bestPri = Infinity;
    for (const cat of HOGWARTS_BIWEEKLY_TOP_CATEGORY_ORDER) {
      const take = takeByCategory[cat] || [];
      const rank = take.findIndex((r) => String(r?.userId || "").trim() === uid) + 1;
      if (rank <= 0) continue;
      const pri = HOGWARTS_BIWEEKLY_TOP_CATEGORY_ORDER.indexOf(cat);
      if (rank < bestRank || (rank === bestRank && pri < bestPri)) {
        bestRank = rank;
        bestPri = pri;
        bestCat = cat;
      }
    }
    if (bestCat) kept[bestCat].add(uid);
  }
  return kept;
}

function excludedUsersForHogwartsBiweeklyCategory(kept, categoryId) {
  const out = new Set();
  for (const cat of HOGWARTS_BIWEEKLY_TOP_CATEGORY_ORDER) {
    if (cat === categoryId) continue;
    for (const uid of kept[cat] || []) out.add(uid);
  }
  return out;
}

function buildHogwartsBiweeklyTopsDeduped(poolMessages, poolVoice, poolMinigame, sortedHouseByUserId, limit = 3) {
  const cap = Math.max(1, Math.min(3, Number(limit) || 3));
  const takeByCategory = {
    messages: pickTopThreeDistinctHouses(poolMessages, sortedHouseByUserId, cap),
    voice: pickTopThreeDistinctHouses(poolVoice, sortedHouseByUserId, cap),
    minigame: pickTopThreeDistinctHouses(poolMinigame, sortedHouseByUserId, cap),
  };
  const kept = resolveHogwartsBiweeklyUserKeeps(takeByCategory);
  return {
    messages: pickTopThreeDistinctHouses(poolMessages, sortedHouseByUserId, cap, excludedUsersForHogwartsBiweeklyCategory(kept, "messages")),
    voice: pickTopThreeDistinctHouses(poolVoice, sortedHouseByUserId, cap, excludedUsersForHogwartsBiweeklyCategory(kept, "voice")),
    minigame: pickTopThreeDistinctHouses(poolMinigame, sortedHouseByUserId, cap, excludedUsersForHogwartsBiweeklyCategory(kept, "minigame")),
  };
}

function effectiveMinigameBiweeklyScore(doc, weekKeys) {
  const keys = Array.isArray(weekKeys) ? weekKeys : [];
  let sum = 0;
  for (const k of keys) {
    sum += effectiveMinigameWeeklyScoreForRankWeek(doc, k);
  }
  return Math.max(0, Math.floor(sum));
}

async function hasGringottRewardKey(guildId, userId, rewardKey) {
  const key = String(rewardKey || "").trim();
  if (!key) return false;
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) })
    .select("profile.events.hogwarts.gringott.rewardKeys")
    .lean()
    .catch(() => null);
  const keys = doc?.profile?.events?.hogwarts?.gringott?.rewardKeys;
  return Array.isArray(keys) && keys.includes(key);
}

async function awardHogwartsBiweeklyHousePoints(guildId, houseId, eventKey, points, gameKey, userId = "") {
  const gid = String(guildId || "").trim();
  const hid = normalizeHogwartsHouseId(houseId);
  const pts = Math.max(0, Math.floor(Number(points) || 0));
  const ek = String(eventKey || "").trim();
  const gk = String(gameKey || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !hid || pts <= 0 || !ek || !gk) return false;
  const now = new Date();
  const periodKey = String(housePointPeriodKey(now.getTime())?.key || "").trim();
  const inc = {
    [`rawWebhook.byGame.${gk}`]: pts,
    "rawWebhook.total": pts,
    [`rawWebhook.totals.${hid}`]: pts,
  };
  if (periodKey) inc[`rawWebhook.byPeriod.${periodKey}.${hid}`] = pts;
  const { appendMemberHousePointsInc } = require("./hogwartsMemberHousePointsService");
  const memberSet = {};
  if (uid) appendMemberHousePointsInc(inc, memberSet, { userId: uid, houseId: hid, periodKey, points: pts });
  await SiteDocument.findOneAndUpdate(
    {
      docType: HOGWARTS_HOUSE_POINTS_DOC,
      guildId: gid,
      userId: HOGWARTS_HOUSE_POINTS_OWNER_ID,
      dedupeKey: ek,
    },
    {
      $setOnInsert: {
        docType: HOGWARTS_HOUSE_POINTS_DOC,
        guildId: gid,
        userId: HOGWARTS_HOUSE_POINTS_OWNER_ID,
        dedupeKey: ek,
        createdBy: "hogwarts_biweekly_top",
        status: "active",
      },
      $set: {
        planKey: "hogwarts_house_points",
        "rawWebhook.eventKey": ek,
        "rawWebhook.updatedAt": now,
        ...memberSet,
      },
      $inc: inc,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return true;
}

async function awardHogwartsBiweeklyCategoryWinners(client, guild, category, topRows, periodKey, eventKey) {
  const gid = String(guild?.id || "").trim();
  const ek = String(eventKey || "").trim();
  const cat = String(category || "").trim();
  if (!gid || !ek || !cat) return [];
  const awarded = [];
  for (let i = 0; i < topRows.length; i += 1) {
    const row = topRows[i];
    const userId = String(row?.userId || "").trim();
    const houseId = normalizeHogwartsHouseId(row?.houseId);
    const rank = i + 1;
    const housePoints = HOGWARTS_BIWEEKLY_HOUSE_POINTS_BY_RANK[i] || 0;
    const galeoni = HOGWARTS_BIWEEKLY_GALEONI_BY_RANK[i] || 0;
    if (!userId || !houseId) continue;
    const rewardKey = `hogwarts_biweekly_${ek}_${periodKey}_${cat}_r${rank}`;
    if (await hasGringottRewardKey(gid, userId, rewardKey)) {
      awarded.push({ userId, rank, skipped: true });
      continue;
    }
    if (housePoints > 0) {
      await awardHogwartsBiweeklyHousePoints(gid, houseId, ek, housePoints, rewardKey, userId);
    }
    if (galeoni > 0) {
      await addGaleoni({
        guildId: gid,
        userId,
        amount: galeoni,
        reason: `Top bisettimanale Hogwarts — ${cat} (${rank}°)`,
        source: "hogwarts_biweekly_top",
        eventKey: ek,
        rewardKey,
      });
    }
    awarded.push({ userId, rank, houseId, housePoints, galeoni });
  }
  return awarded;
}

async function findBiweeklyPublishMarker(guildId, periodKey) {
  return SiteDocument.findOne({
    docType: HOGWARTS_BIWEEKLY_PUBLISH_DOC,
    guildId: String(guildId || "").trim(),
    userId: HOGWARTS_BIWEEKLY_PUBLISH_OWNER_ID,
    dedupeKey: String(periodKey || "").trim(),
  })
    .lean()
    .catch(() => null);
}

async function markBiweeklyPublishComplete(guildId, periodKey, eventKey, stats = {}) {
  await SiteDocument.updateOne(
    {
      docType: HOGWARTS_BIWEEKLY_PUBLISH_DOC,
      guildId: String(guildId || "").trim(),
      userId: HOGWARTS_BIWEEKLY_PUBLISH_OWNER_ID,
      dedupeKey: String(periodKey || "").trim(),
    },
    {
      $set: {
        status: "completed",
        planKey: "hogwarts_biweekly_top",
        "rawWebhook.eventKey": String(eventKey || "").trim(),
        "rawWebhook.stats": stats,
        decidedAt: new Date(),
      },
    },
  ).catch(() => null);
}

async function collectHogwartsBiweeklyActivityRows(guild, anchorDate = new Date(), eventKey) {
  const now = anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime()) ? anchorDate : new Date();
  const window = resolveHogwartsBiweeklyWindow(now);
  const periodEndMs = window.periodEndMs;
  const periodStartMs = window.periodStartMs;
  const periodKey = window.periodKey;
  const ek = String(eventKey || "").trim();
  const sortedHouseByUserId = await loadSortedHouseByUserId(guild.id, ek);
  if (!sortedHouseByUserId.size) {
    return { ok: false, code: "no_sorted", periodStartMs, periodEndMs, periodKey, users: [] };
  }
  const rowsSource = await loadBiweeklyRowsFromHourlyWindow(guild, now, window);
  let messageDocs = filterDocsToSortedUsers(
    rowsSource.filter((row) => Number(row?.messageCount || 0) > 0).sort((a, b) => Number(b.messageCount || 0) - Number(a.messageCount || 0)),
    sortedHouseByUserId,
  );
  let voiceDocs = filterDocsToSortedUsers(
    rowsSource.filter((row) => Number(row?.voiceExp || 0) > 0).sort((a, b) => Number(b.voiceExp || 0) - Number(a.voiceExp || 0)),
    sortedHouseByUserId,
  );
  const minigameWeekKeys = getIsoWeekKeysInBiweeklyWindow(periodEndMs, periodStartMs);
  let minigameDocsRaw = [];
  if (minigameWeekKeys.length) {
    minigameDocsRaw = await ActivityUserProfile.find({
      guildId: guild.id,
      $or: minigameWeekKeys.flatMap((k) => [
        { "profile.totals.exp.minigame.weeklyKey": k, "profile.totals.exp.minigame.weeklyExp": { $gt: 0 } },
        { "profile.totals.exp.minigame.prevWeekKey": k, "profile.totals.exp.minigame.prevWeekExp": { $gt: 0 } },
      ]),
    })
      .select("userId profile.totals.exp.minigame")
      .limit(1200)
      .lean()
      .catch(() => []);
  }
  const minigameDocs = filterDocsToSortedUsers(
    minigameDocsRaw.filter((d) => effectiveMinigameBiweeklyScore(d, minigameWeekKeys) > 0),
    sortedHouseByUserId,
  );
  const mgScore = (doc) => effectiveMinigameBiweeklyScore(doc, minigameWeekKeys);
  const messageByUser = new Map(messageDocs.map((d) => [String(d.userId), Math.max(0, Math.floor(Number(d.messageCount) || 0))]));
  const voiceByUser = new Map(voiceDocs.map((d) => [String(d.userId), Math.max(0, Math.floor(Number(d.voiceExp) || 0))]));
  const minigameByUser = new Map(minigameDocs.map((d) => [String(d.userId), mgScore(d)]));
  const userIds = new Set([...messageByUser.keys(), ...voiceByUser.keys(), ...minigameByUser.keys()]);
  const users = [];
  for (const userId of userIds) {
    const houseId = sortedHouseByUserId.get(String(userId));
    if (!houseId) continue;
    users.push({
      userId: String(userId),
      houseId,
      messages: messageByUser.get(String(userId)) || 0,
      voiceExp: voiceByUser.get(String(userId)) || 0,
      voiceMinutes: Math.max(0, Math.floor((voiceByUser.get(String(userId)) || 0) / Math.max(1, VOICE_EXP_PER_MINUTE))),
      minigame: minigameByUser.get(String(userId)) || 0,
    });
  }
  return {
    ok: true,
    periodStartMs,
    periodEndMs,
    periodKey,
    eventKey: ek,
    sortedHouseByUserId,
    users,
    minigameWeekKeys,
    schoolPeriod: window.schoolPeriod,
  };
}

function wasStaffDuringWeeklyActivityWindow(staff, weekPeriodStartMs, weekPeriodEndMs, trackedStaffRoleIds, staffRolesHistoryRetention) {
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
  const fromStaff = Array.isArray(staff?.rolesHistory) ? staff.rolesHistory : [];
  const fromRetention = Array.isArray(staffRolesHistoryRetention) ? staffRolesHistoryRetention : [];
  const history = [...fromStaff, ...fromRetention].sort((a, b) => new Date(a?.date || 0).getTime() - new Date(b?.date || 0).getTime());
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

function getMinigameRankWeekKeyForPublish(now = new Date()) {
  const boundaryEnd = getLastSunday21BoundaryMsAtOrBefore(now);
  const anchor = new Date(boundaryEnd - 2 * 60 * 60 * 1000);
  return getWeekKey(anchor);
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

function buildHourKeysBetweenMs(startMs, endMs) {
  const from = Number(startMs);
  const to = Number(endMs);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];
  const keys = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 72) {
    const parts = getTimeParts(new Date(cursor));
    keys.push(`${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}`);
    cursor += 60 * 60 * 1000;
    guard += 1;
  }
  const endParts = getTimeParts(new Date(to));
  keys.push(`${endParts.year}-${pad2(endParts.month)}-${pad2(endParts.day)}T${pad2(endParts.hour)}`);
  return [...new Set(keys)];
}

function hourKeyToBoundsMs(hourKey) {
  const m = String(hourKey || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/);
  if (!m) return { startMs: 0, endMs: 0 };
  const start = createUtcFromRomeLocal(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), 0, 0);
  const startMs = start.getTime();
  return { startMs, endMs: startMs + 60 * 60 * 1000 };
}

function overlapRangeMs(rangeStart, rangeEnd, clipStart, clipEnd) {
  return Math.max(0, Math.min(rangeEnd, clipEnd) - Math.max(rangeStart, clipStart));
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
  const excludedCategoryIds = new Set(
    [IDs.categories?.categoryPrivate]
      .filter(Boolean)
      .map((id) => String(id)),
  );
  const text = new Set();
  const voice = new Set();
  for (const channel of guild.channels.cache.values()) {
    if (excludedChannelIds.has(String(channel?.id || ""))) continue;
    if (excludedCategoryIds.has(String(channel?.id || ""))) continue;
    if (excludedCategoryIds.has(String(channel?.parentId || ""))) continue;
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

async function loadBiweeklyRowsFromHourlyWindow(guild, anchorDate = new Date(), windowOrNull = null) {
  const eligible = await getEligibleChannelSets(guild);
  if (!eligible.text.size && !eligible.voice.size) return [];
  const window = windowOrNull && typeof windowOrNull === "object" ? windowOrNull : resolveHogwartsBiweeklyWindow(anchorDate);
  const endMs = Number(window.periodEndMs) || getLastSunday12BoundaryMsAtOrBefore(anchorDate);
  const days = Number(window.hourWindowDays) || 14;
  const hourKeys = buildLastNDaysHourKeys(endMs, days);
  return loadRowsFromHourlyWindowByHourKeys(guild, eligible, hourKeys, {
    startMs: Number(window.periodStartMs) || endMs - HOGWARTS_BIWEEKLY_MS,
    endMs,
  });
}

async function loadRowsFromHourlyWindowByHourKeys(guild, eligible, hourKeys, clipRange = null) {
  const keys = [...new Set((hourKeys || []).map((k) => String(k || "").trim()).filter(Boolean))];
  if (!keys.length) return [];
  const clipStart = Number(clipRange?.startMs);
  const clipEnd = Number(clipRange?.endMs);
  const hasClip = Number.isFinite(clipStart) && Number.isFinite(clipEnd) && clipEnd > clipStart;
  const wanted = new Set(keys);
  const projection = { _id: 0, userId: 1 };
  for (const k of keys) projection[`profile.totals.hourly.${k}`] = 1;
      const perUser = new Map();
  try {
    for (let i = 0; i < keys.length; i += 24) {
      const chunk = keys.slice(i, i + 24);
      const orHourly = chunk.map((k) => ({ [`profile.totals.hourly.${k}`]: { $exists: true } }));
      const cursor = ActivityUserProfile.find({ guildId: guild.id, $or: orHourly })
        .select(projection)
        .lean()
        .cursor({ batchSize: 250 });
      for await (const doc of cursor) {
        const userId = String(doc?.userId || "");
        const hourly = toObjectMap(doc?.profile?.totals?.hourly || {});
        if (!userId) continue;
        let messageCount = 0;
        let voiceSeconds = 0;
        for (const [hourKey, value] of Object.entries(hourly)) {
          if (!wanted.has(String(hourKey))) continue;
          if (shouldSkipBackfillRow(String(hourKey), wanted)) continue;
          let scale = 1;
          if (hasClip) {
            const bounds = hourKeyToBoundsMs(hourKey);
            const overlap = overlapRangeMs(bounds.startMs, bounds.endMs, clipStart, clipEnd);
            if (overlap <= 0) continue;
            scale = overlap / (60 * 60 * 1000);
          }
          const textChannels = toObjectMap(value?.textChannels || {});
          const voiceChannels = toObjectMap(value?.voiceChannels || {});
          for (const [channelId, raw] of extractMapEntries(textChannels)) {
            if (!eligible.text.has(String(channelId))) continue;
            messageCount += Math.max(0, Number(raw || 0)) * scale;
          }
          for (const [channelId, raw] of extractMapEntries(voiceChannels)) {
            if (!eligible.voice.has(String(channelId))) continue;
            voiceSeconds += Math.max(0, Number(raw || 0)) * scale;
          }
        }
        if (messageCount <= 0 && voiceSeconds <= 0) continue;
        const current = perUser.get(userId) || { userId, messageCount: 0, voiceSeconds: 0 };
        current.messageCount += messageCount;
        current.voiceSeconds += voiceSeconds;
        perUser.set(userId, current);
      }
    }
  } catch (eLoad) {
    global.logger?.error?.("[HOURLY WINDOW] loadRows failed:", eLoad?.message || eLoad);
    return [];
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

async function resolveMinigameTopForced(client, guild, docs, valueGetter, limit = 10, excludedRoleIdsFirst = WEEKLY_WINNERS_EXCLUDED_ROLE_IDS) {
  const cap = Math.max(1, Math.min(25, Number(limit) || 10));
  let rows = await resolveTopThreeUsers(client, guild, docs, valueGetter, cap, excludedRoleIdsFirst);
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

async function resolveRoyaleMinigameWinner(client, guild, docs, valueGetter) {
  const list = Array.isArray(docs) ? docs : [];
  for (const doc of list) {
    const userId = String(doc?.userId || "").trim();
    if (!userId) continue;
    const value = Math.max(0, Math.floor(Number(valueGetter(doc) || 0)));
    if (value <= 0) continue;
    const user = client.users.cache.get(userId) || (await client.users.fetch(userId).catch(() => null));
    if (!user || user.bot) continue;
    const member = guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
    if (!member) continue;
    if (REQUIRED_MEMBER_ROLE_ID && !member.roles.cache.has(REQUIRED_MEMBER_ROLE_ID)) continue;
    return { userId, value };
  }
  return null;
}

async function syncRoyaleMinigameTotalRole(client, options = {}) {
  const mainGuildId = String(IDs.guilds?.main || "").trim();
  if (!mainGuildId || !ROYALE_MINIGAME_ROLE_ID) return { ok: false, reason: "not_configured" };
  const guild =
    options.guild ||
    client.guilds.cache.get(mainGuildId) ||
    (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  const docs = await ActivityUserProfile.find({
    guildId: guild.id,
    "profile.totals.exp.minigame.totalExp": { $gt: 0 },
  })
    .select("userId profile.totals.exp.minigame.totalExp")
    .sort({ "profile.totals.exp.minigame.totalExp": -1 })
    .limit(200)
    .lean()
    .catch(() => []);
  const royaleWinner = await resolveRoyaleMinigameWinner(
    client,
    guild,
    docs,
    (doc) => Number(doc?.profile?.totals?.exp?.minigame?.totalExp || 0),
  );
  await removeRoleFromAllMembers(guild, ROYALE_MINIGAME_ROLE_ID, royaleWinner?.userId);
  if (royaleWinner?.userId) {
    await assignRoleToUser(guild, royaleWinner.userId, ROYALE_MINIGAME_ROLE_ID);
  }
  return {
    ok: true,
    userId: royaleWinner?.userId || null,
    totalExp: Number(royaleWinner?.value || 0),
  };
}

let royaleMinigameSyncTimer = null;
function scheduleRoyaleMinigameRoleSync(client, delayMs = 45_000) {
  if (!client || !ROYALE_MINIGAME_ROLE_ID) return;
  if (royaleMinigameSyncTimer) clearTimeout(royaleMinigameSyncTimer);
  royaleMinigameSyncTimer = setTimeout(() => {
    royaleMinigameSyncTimer = null;
    syncRoyaleMinigameTotalRole(client).catch((err) => {
      global.logger?.warn?.("[ROYALE MINIGAME] sync failed:", err?.message || err);
    });
  }, Math.max(5_000, Number(delayMs) || 45_000));
}

function buildEmptyLine(kind) {
  return `<:VC_InactiveStatus:1482526984234860574> - Nessun dato disponibile per ${kind}.`;
}

function formatRankLine(index, userMention, value, unit) {
  const medal = TROPHY_LABELS[index] || TROPHY_LABELS[2] || "<:VC_Podio3:1482694450806259744>";
  return `${medal} ${userMention} <a:VC_Arrow:1482706699365257397> **${value}** *${unit}*`;
}

function voiceExpToMinutes(voiceExp) {
  return Math.max(0, Math.floor(Number(voiceExp) || 0) / Math.max(1, VOICE_EXP_PER_MINUTE));
}

function formatVoiceHoursFromExp(voiceExp) {
  const mins = Math.max(0, Math.floor(voiceExpToMinutes(voiceExp)));
  if (mins <= 0) return "0h";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatVoiceRankLine(index, userMention, voiceExp) {
  const medal = TROPHY_LABELS[index] || TROPHY_LABELS[2] || "<:VC_Podio3:1482694450806259744>";
  return `${medal} ${userMention} <a:VC_Arrow:1482706699365257397> **${formatVoiceHoursFromExp(voiceExp)}**`;
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
  let voiceRows = [buildEmptyLine("ore in vocale")];
  let minigameRows = [];
  let awarded = { messageWinner: null, voiceWinner: null, minigameWinner: null };
  let minigameRankWeekKey = "";
  let suppressMinigameThisWeek = false;
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
          .select("userId staff.rolesHistory staffRolesHistoryRetention")
          .lean()
          .catch(() => []);
        for (const p of profs) {
          staffByUserId.set(String(p.userId), { staff: p.staff, staffRolesHistoryRetention: p.staffRolesHistoryRetention });
        }
      }
      const notStaffThatWeek = (uid) => {
        const row = staffByUserId.get(String(uid)) || {};
        return !wasStaffDuringWeeklyActivityWindow(
          row.staff,
          weekPeriodStartMs,
          weekPeriodEndMs,
          WEEKLY_WINNERS_EXCLUDED_ROLE_IDS,
          row.staffRolesHistoryRetention,
        );
      };
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
      ? displayTopVoice.map((item, index) => formatVoiceRankLine(index, `<@${item.userId}>`, item.value))
      : [buildEmptyLine("ore in vocale")];
    if (mode === "weekly") {
      const rankKeyForSuppress = String(options.weekKey || getMinigameRankWeekKeyForPublish(now) || "").trim();
      suppressMinigameThisWeek = TEMP_SUPPRESS_MINIGAME_WEEK_KEYS.has(rankKeyForSuppress);
      if (suppressMinigameThisWeek) {
        minigameRankWeekKey = rankKeyForSuppress;
        displayTopMinigame = [];
        minigameRows = [];
      } else {
        const weekPeriodEndMs = getLastSunday21BoundaryMsAtOrBefore(now);
        const weekPeriodStartMs = weekPeriodEndMs - 7 * 24 * 60 * 60 * 1000;
        const fetchMinigameDocsByRankKey = async (weekKey) => {
          const k = String(weekKey || "").trim();
          if (!k) return [];
          return ActivityUserProfile.find({
            guildId: guild.id,
            $or: [
              {
                "profile.totals.exp.minigame.weeklyKey": k,
                "profile.totals.exp.minigame.weeklyExp": { $gt: 0 },
              },
              {
                "profile.totals.exp.minigame.prevWeekKey": k,
                "profile.totals.exp.minigame.prevWeekExp": { $gt: 0 },
              },
            ],
          })
            .select("userId profile.totals.exp.minigame staff.rolesHistory staffRolesHistoryRetention")
            .limit(800)
            .lean()
            .catch(() => []);
        };
        minigameRankWeekKey = String(options.weekKey || getMinigameRankWeekKeyForPublish(now) || "").trim();
        let minigameDocsRaw = await fetchMinigameDocsByRankKey(minigameRankWeekKey);
        const hasPositiveMinigameScore = (docs, key) =>
          (Array.isArray(docs) ? docs : []).some((d) => effectiveMinigameWeeklyScoreForRankWeek(d, key) > 0);
        if (!hasPositiveMinigameScore(minigameDocsRaw, minigameRankWeekKey)) {
          const hint = await ActivityUserProfile.findOne({
            guildId: guild.id,
            "profile.totals.exp.minigame.prevWeekExp": { $gt: 0 },
          })
            .sort({ "profile.totals.exp.minigame.prevWeekExp": -1 })
            .select("profile.totals.exp.minigame.prevWeekKey")
            .lean()
            .catch(() => null);
          const alt = String(hint?.profile?.totals?.exp?.minigame?.prevWeekKey || "").trim();
          if (alt) {
            const altDocs = await fetchMinigameDocsByRankKey(alt);
            if (hasPositiveMinigameScore(altDocs, alt)) {
              minigameRankWeekKey = alt;
              minigameDocsRaw = altDocs;
            }
          }
        }
        minigameDocsRaw.sort(
          (a, b) => effectiveMinigameWeeklyScoreForRankWeek(b, minigameRankWeekKey) - effectiveMinigameWeeklyScoreForRankWeek(a, minigameRankWeekKey),
        );
        const minigameDocs = minigameDocsRaw
          .slice(0, 450)
          .filter(
            (d) =>
              !wasStaffDuringWeeklyActivityWindow(
                d?.staff,
                weekPeriodStartMs,
                weekPeriodEndMs,
                WEEKLY_WINNERS_EXCLUDED_ROLE_IDS,
                d?.staffRolesHistoryRetention,
              ),
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
    }
    if (options.skipWeeklyRoles) {
      const chosenUserIds = new Set();
      const messageWinner = pickFirstAvailable(displayTopMessages, chosenUserIds);
      if (messageWinner) chosenUserIds.add(messageWinner.userId);
      const voiceWinner = pickFirstAvailable(displayTopVoice, chosenUserIds);
      if (voiceWinner) chosenUserIds.add(voiceWinner.userId);
      const minigameWinner =
        mode === "weekly" && !suppressMinigameThisWeek && displayTopMinigame.length
          ? pickFirstAvailable(displayTopMinigame, chosenUserIds)
          : null;
      awarded = { messageWinner, voiceWinner, minigameWinner };
    } else {
      awarded = await updateWeeklyWinnerRoles(
        guild,
        displayTopMessages,
        displayTopVoice,
        mode === "weekly" ? (suppressMinigameThisWeek ? false : displayTopMinigame) : false,
      );
      if (mode === "weekly") {
        await syncRoyaleMinigameTotalRole(client, { guild }).catch(() => null);
      }
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
  if (mode === "weekly" && !suppressMinigameThisWeek && minigameRows.length) {
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
  const safeMinigameWinnerRoleMention =
    MINIGAME_WINNER_ROLE_ID && guild?.roles?.cache?.get(MINIGAME_WINNER_ROLE_ID)
      ? `<@&${MINIGAME_WINNER_ROLE_ID}>`
      : "il ruolo dei vincitori";
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
    mode === "weekly" && MINIGAME_WINNER_ROLE_ID && !suppressMinigameThisWeek
      ? `\n<:VC_Podio1:1482694399283433582> Con un totale di **${minigameWinnerTotal} pt**, ${minigameWinnerMention} ottieni il primo posto per **__minigames__** e il ruolo ${safeMinigameWinnerRoleMention}.`
      : "";
  const payload = {
    content: `<@&1442568949605597264>
${introLine}

<:VC_Podio1:1482694399283433582> Con un totale di **${messageWinnerTotal} messaggi**, ${messageWinnerMention} ottieni il primo posto per **__chat testuale__** e il ruolo <@&1544830834849087630>.
<:VC_Podio1:1482694399283433582> Con un totale di **${formatVoiceHoursFromExp(voiceWinnerTotal)}** in vocale, ${voiceWinnerMention} ottieni il primo posto per **__chat vocale__** e il ruolo <@&1544830836686200992>.${minigameAnnounceLine}
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
        suppressMinigameThisWeek,
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
    await revokeActiveMonthlyVoterRewardsExcept(guild, monthlyVotersTop).catch(() => null);
    await revokeActiveMonthlyTopRewardsExcept(guild, displayTopCombined, rankedYear, rankedMonth).catch(() => null);
    await assignMonthlyVoterRewards(guild, monthlyVotersTop).catch(() => null);
    await assignMonthlyTopRewards(guild, displayTopCombined, rankedYear, rankedMonth).catch(() => null);
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
  const monthlyRewardRows = buildMonthlyTopPrizeEmbedLines(displayTopCombined, rankedYear, rankedMonth);
  const embedDescLines = [
    `<:VC_Leaderboard:1482534806314287387> // **${monthNameLabel}** — I vantaggi che avete sbloccato sono sul [nostro sito](https://viniliecaffe.it/perks)`,
    "",
    `<a:VC_HeartsPink:1468685897389052008> • **Classifica mensile EXP totale:**`,
    ...combinedRows,
    "",
    `<a:VC_Winner:1482535294757507255> • **Premi Top Monthly:**`,
    ...monthlyRewardRows,
    "",
    `<:VC_Leaderboard:1482534806314287387> • **Top Voters:**`,
    ...voterRows,
  ];
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(embedDescLines.join("\n"))
    .setThumbnail(guildIconUrl(guild, { size: 256 }) || null);
  const monthlyAnnounce = buildMonthlyTopWinnerAnnounceLines(awarded, rankedYear, rankedMonth);
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
    const introLine = `<a:VC_Winner:1482535294757507255> Ciao a tutti! Annunciamo i vincitori del mese.`;
    const votersRoleTextByIndex = ["<@&1521787468201066666>", "<@&1544830866616754257>", "<@&1544830864565735515>"];
    const voter1 = monthlyVotersTop[0];
    const voter2 = monthlyVotersTop[1];
    const voter3 = monthlyVotersTop[2];
    const votersTextLine = monthlyVotersTop.length
      ? [
        "\n<:VC_Leaderboard:1482534806314287387> **Top Voters:**",
        voter1
          ? `${TROPHY_LABELS[0] || "<:VC_Podio1:1482694399283433582>"} <@${voter1.userId}> <a:VC_Arrow:1482706699365257397> **${voter1.value}** *voti* · ${votersRoleTextByIndex[0]} 30 giorni`
          : null,
        voter2
          ? `${TROPHY_LABELS[1] || "<:VC_Podio2:1482694424411635712>"} <@${voter2.userId}> <a:VC_Arrow:1482706699365257397> **${voter2.value}** *voti* · ${votersRoleTextByIndex[1]} 30 giorni`
          : null,
        voter3
          ? `${TROPHY_LABELS[2] || "<:VC_Podio3:1482694450806259744>"} <@${voter3.userId}> <a:VC_Arrow:1482706699365257397> **${voter3.value}** *voti* · ${votersRoleTextByIndex[2]} 30 giorni`
          : null,
      ].filter(Boolean).join("\n")
      : "";
    try {
      await channel.send({
        content: `<@&1442568949605597264>
${introLine}

<:VC_Podio1:1482694399283433582> Con un totale di **${monthlyAnnounce.winnerTotal} EXP**, ${monthlyAnnounce.winnerMention} ottiene il primo posto della **__classifica mensile__** e riceve il ruolo <@&1544830838443741194> e un **Nitro Boost** riscattabile tramite ${siteTicketsPageDiscordRef("HIGH STAFF")}.
${monthlyAnnounce.secondLine}
${monthlyAnnounce.thirdLine}
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
    $or: [
      {
        "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountMonthKey": monthKey,
        $or: [
          { "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountTopgg": { $gt: 0 } },
          { "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountDiscadia": { $gt: 0 } },
        ],
      },
      {
        "profile.totals.exp.bumpVoteRewards.discadia_vote.prevVoteCountMonthKey": monthKey,
        $or: [
          { "profile.totals.exp.bumpVoteRewards.discadia_vote.prevVoteCountTopgg": { $gt: 0 } },
          { "profile.totals.exp.bumpVoteRewards.discadia_vote.prevVoteCountDiscadia": { $gt: 0 } },
        ],
      },
    ],
  })
    .select("userId profile.totals.exp.bumpVoteRewards.discadia_vote")
    .lean()
    .catch(() => []);
  const sorted = docs
    .map((doc) => {
      const vote = doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote || {};
      const activeMatches = String(vote.voteCountMonthKey || "") === monthKey;
      const snapshotMatches = String(vote.prevVoteCountMonthKey || "") === monthKey;
      const total = activeMatches
        ? Math.max(0, Number(vote.voteCountTopgg || 0)) + Math.max(0, Number(vote.voteCountDiscadia || 0))
        : snapshotMatches
          ? Math.max(0, Number(vote.prevVoteCountTopgg || 0)) + Math.max(0, Number(vote.prevVoteCountDiscadia || 0))
          : 0;
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
  const { hasActiveHogwartsFinaleRewardOnRole } = require("./hogwartsEventEndService");
  const now = new Date();
  const nowMs = Date.now();
  const rows = await ActivityUserProfile.find({
    guildId: guild.id,
    [`${MONTHLY_VOTER_REWARD_PATH}.expiresAt`]: { $lte: now },
  })
    .select(`userId ${MONTHLY_VOTER_REWARD_PATH} ${MONTHLY_TOP_REWARD_PATH} profile.events.hogwarts.finaleRoleRewards`)
    .lean()
    .catch(() => []);
  for (const row of rows) {
    const userId = String(row?.userId || "");
    const reward = row?.profile?.totals?.exp?.monthlyVoteTopReward || null;
    const roleId = String(reward?.roleId || "");
    const hadRoleBefore = Boolean(reward?.hadRoleBefore);
    const keepByTopReward = hasActiveMonthlyTopRewardOnRole(row, roleId, nowMs);
    const keepByFinale = hasActiveHogwartsFinaleRewardOnRole(row, roleId, nowMs);
    if (userId && roleId && !hadRoleBefore && !keepByTopReward && !keepByFinale) {
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

function rankedMonthOrdinal(year, month) {
  return Number(year) * 12 + Number(month);
}

function usesNewMonthlyTopActivityRewards(rankedYear, rankedMonth) {
  const y = Number(rankedYear);
  const m = Number(rankedMonth);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return true;
  return rankedMonthOrdinal(y, m) >= rankedMonthOrdinal(
    MONTHLY_TOP_NEW_REWARDS_FIRST_RANKED.year,
    MONTHLY_TOP_NEW_REWARDS_FIRST_RANKED.month,
  );
}

function monthlyTopVipPlusMention() {
  const roleId = String(MONTHLY_TOP_REWARD_ROLE_RANK_2 || "");
  return roleId ? `<@&${roleId}>` : "**VIP+**";
}

function monthlyPrizeTicketRef() {
  return siteTicketsPageDiscordRef("HIGH STAFF");
}

function buildMonthlyTopPrizeEmbedLines(displayTopCombined, rankedYear, rankedMonth) {
  const t0 = TROPHY_LABELS[0] || "<:VC_Podio1:1482694399283433582>";
  const t1 = TROPHY_LABELS[1] || "<:VC_Podio2:1482694424411635712>";
  const t2 = TROPHY_LABELS[2] || "<:VC_Podio3:1482694450806259744>";
  const arrow = "<a:VC_Arrow:1482706699365257397>";
  const first = displayTopCombined[0];
  const second = displayTopCombined[1];
  const third = displayTopCombined[2];
  if (usesNewMonthlyTopActivityRewards(rankedYear, rankedMonth)) {
    const vipPlus = monthlyTopVipPlusMention();
    return [
      first?.userId
        ? `${t0} <@${first.userId}> ${arrow} <@&${MONTHLY_MEMBER_ROLE_ID}> + **Nitro Boost**`
        : `${t0} Nessun vincitore`,
      second?.userId
        ? `${t1} <@${second.userId}> ${arrow} **Decorazione a scelta (max 15,99€)**`
        : `${t1} Nessun vincitore`,
      third?.userId
        ? `${t2} <@${third.userId}> ${arrow} ${vipPlus} **per 30 giorni**`
        : `${t2} Nessun vincitore`,
    ];
  }
  return [
    first?.userId
      ? `${t0} <@${first.userId}> ${arrow} <@&${MONTHLY_MEMBER_ROLE_ID}> + **Nitro Boost**`
      : `${t0} Nessun vincitore`,
    second?.userId
      ? `${t1} <@${second.userId}> ${arrow} **VIP+ (30 giorni) + Decorazione a scelta (max 15,99€)**`
      : `${t1} Nessun vincitore`,
    third?.userId
      ? `${t2} <@${third.userId}> ${arrow} **VIP (30 giorni) + Nitro Basic**`
      : `${t2} Nessun vincitore`,
  ];
}

function buildMonthlyTopWinnerAnnounceLines(awarded, rankedYear, rankedMonth) {
  const ticketRef = monthlyPrizeTicketRef();
  const winnerTotal = Number(awarded?.topMonthlyWinner?.value || 0);
  const winnerMention = awarded?.topMonthlyWinner?.userId ? `<@${awarded.topMonthlyWinner.userId}>` : "Nessun vincitore";
  const secondTotal = Number(awarded?.monthlyTopSecond?.value || 0);
  const secondMention = awarded?.monthlyTopSecond?.userId ? `<@${awarded.monthlyTopSecond.userId}>` : null;
  const thirdTotal = Number(awarded?.monthlyTopThird?.value || 0);
  const thirdMention = awarded?.monthlyTopThird?.userId ? `<@${awarded.monthlyTopThird.userId}>` : null;
  let secondLine = "";
  let thirdLine = "";
  if (usesNewMonthlyTopActivityRewards(rankedYear, rankedMonth)) {
    const vipPlus = monthlyTopVipPlusMention();
    secondLine = secondMention
      ? `\n<:VC_Podio2:1482694424411635712> Con un totale di **${secondTotal} EXP**, ${secondMention} ottiene il secondo posto e riceve una **decorazione a scelta (max 15,99€)** riscattabile tramite ${ticketRef}.`
      : "";
    thirdLine = thirdMention
      ? `\n<:VC_Podio3:1482694450806259744> Con un totale di **${thirdTotal} EXP**, ${thirdMention} ottiene il terzo posto e riceve ${vipPlus} **per 30 giorni**.`
      : "";
  } else {
    secondLine = secondMention
      ? `\n<:VC_Podio2:1482694424411635712> Con un totale di **${secondTotal} EXP**, ${secondMention} ottiene il secondo posto e riceve **VIP+ per 30 giorni** e una **decorazione a scelta (max 15,99€)** riscattabile tramite ${ticketRef}.`
      : "";
    thirdLine = thirdMention
      ? `\n<:VC_Podio3:1482694450806259744> Con un totale di **${thirdTotal} EXP**, ${thirdMention} ottiene il terzo posto e riceve **VIP per 30 giorni** e un **Nitro Basic** riscattabile tramite ${ticketRef}.`
      : "";
  }
  return { winnerTotal, winnerMention, secondLine, thirdLine };
}

function monthlyTopRewardRoleByRank(rankIndex, rankedYear, rankedMonth) {
  if (usesNewMonthlyTopActivityRewards(rankedYear, rankedMonth)) {
    if (rankIndex === 2) return MONTHLY_TOP_REWARD_ROLE_RANK_2;
    return null;
  }
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

async function revokeMonthlyRewardHolder(guild, row, rewardPath, nowMs = Date.now()) {
  const { hasActiveHogwartsFinaleRewardOnRole } = require("./hogwartsEventEndService");
  const userId = String(row?.userId || "");
  const reward =
    rewardPath === MONTHLY_TOP_REWARD_PATH
      ? row?.profile?.totals?.exp?.monthlyTopReward
      : row?.profile?.totals?.exp?.monthlyVoteTopReward;
  const roleId = String(reward?.roleId || "");
  const hadRoleBefore = Boolean(reward?.hadRoleBefore);
  if (!userId || !roleId) return false;

  const keepByOtherReward =
    rewardPath === MONTHLY_TOP_REWARD_PATH
      ? hasActiveMonthlyVoterRewardOnRole(row, roleId, nowMs)
      : hasActiveMonthlyTopRewardOnRole(row, roleId, nowMs);
  if (keepByOtherReward || hasActiveHogwartsFinaleRewardOnRole(row, roleId, nowMs)) return false;

  if (!hadRoleBefore) {
    const member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
    if (member?.roles?.cache?.has(roleId)) {
      await member.roles.remove(roleId).catch(() => null);
    }
  }
  await ActivityUserProfile.updateOne(
    { guildId: guild.id, userId },
    { $unset: { [rewardPath]: "" } },
  ).catch(() => null);
  return true;
}

function collectMonthlyTopKeeperUserIds(ranking, rankedYear, rankedMonth) {
  const keep = new Set();
  const rankIndexes = usesNewMonthlyTopActivityRewards(rankedYear, rankedMonth) ? [2] : [1, 2];
  for (const i of rankIndexes) {
    const userId = String(ranking?.[i]?.userId || "").trim();
    if (userId) keep.add(userId);
  }
  return keep;
}

function collectMonthlyVoterKeeperUserIds(ranking) {
  const keep = new Set();
  for (let i = 0; i < Math.min(3, Array.isArray(ranking) ? ranking.length : 0); i += 1) {
    const userId = String(ranking?.[i]?.userId || "").trim();
    if (userId) keep.add(userId);
  }
  return keep;
}

async function revokeActiveMonthlyTopRewardsExcept(guild, ranking, rankedYear, rankedMonth) {
  const nowMs = Date.now();
  const keepUserIds = collectMonthlyTopKeeperUserIds(ranking, rankedYear, rankedMonth);
  const rows = await ActivityUserProfile.find({
    guildId: guild.id,
    [`${MONTHLY_TOP_REWARD_PATH}.expiresAt`]: { $gt: new Date() },
  })
    .select(`userId ${MONTHLY_TOP_REWARD_PATH} ${MONTHLY_VOTER_REWARD_PATH}`)
    .lean()
    .catch(() => []);
  for (const row of rows) {
    const userId = String(row?.userId || "");
    if (!userId || keepUserIds.has(userId)) continue;
    await revokeMonthlyRewardHolder(guild, row, MONTHLY_TOP_REWARD_PATH, nowMs);
  }
}

async function revokeActiveMonthlyVoterRewardsExcept(guild, ranking) {
  const nowMs = Date.now();
  const keepUserIds = collectMonthlyVoterKeeperUserIds(ranking);
  const rows = await ActivityUserProfile.find({
    guildId: guild.id,
    [`${MONTHLY_VOTER_REWARD_PATH}.expiresAt`]: { $gt: new Date() },
  })
    .select(`userId ${MONTHLY_TOP_REWARD_PATH} ${MONTHLY_VOTER_REWARD_PATH}`)
    .lean()
    .catch(() => []);
  for (const row of rows) {
    const userId = String(row?.userId || "");
    if (!userId || keepUserIds.has(userId)) continue;
    await revokeMonthlyRewardHolder(guild, row, MONTHLY_VOTER_REWARD_PATH, nowMs);
  }
}

async function reconcileDuplicateActiveMonthlyRewardRoles(guild) {
  const nowMs = Date.now();
  for (const rewardPath of [MONTHLY_TOP_REWARD_PATH, MONTHLY_VOTER_REWARD_PATH]) {
    const rows = await ActivityUserProfile.find({
      guildId: guild.id,
      [`${rewardPath}.expiresAt`]: { $gt: new Date() },
    })
      .select(`userId ${MONTHLY_TOP_REWARD_PATH} ${MONTHLY_VOTER_REWARD_PATH}`)
      .lean()
      .catch(() => []);
    const byRole = new Map();
    for (const row of rows) {
      const reward =
        rewardPath === MONTHLY_TOP_REWARD_PATH
          ? row?.profile?.totals?.exp?.monthlyTopReward
          : row?.profile?.totals?.exp?.monthlyVoteTopReward;
      const roleId = String(reward?.roleId || "");
      if (!roleId) continue;
      const awardedAt = Number(new Date(reward?.awardedAt || 0).getTime() || 0);
      if (!byRole.has(roleId)) byRole.set(roleId, []);
      byRole.get(roleId).push({ row, awardedAt });
    }
    for (const holders of byRole.values()) {
      if (holders.length <= 1) continue;
      holders.sort((a, b) => b.awardedAt - a.awardedAt);
      for (let i = 1; i < holders.length; i += 1) {
        await revokeMonthlyRewardHolder(guild, holders[i].row, rewardPath, nowMs);
      }
    }
  }
}

async function cleanupExpiredMonthlyTopRewards(guild) {
  const { hasActiveHogwartsFinaleRewardOnRole } = require("./hogwartsEventEndService");
  const now = new Date();
  const nowMs = Date.now();
  const rows = await ActivityUserProfile.find({
    guildId: guild.id,
    [`${MONTHLY_TOP_REWARD_PATH}.expiresAt`]: { $lte: now },
  })
    .select(`userId ${MONTHLY_TOP_REWARD_PATH} ${MONTHLY_VOTER_REWARD_PATH} profile.events.hogwarts.finaleRoleRewards`)
    .lean()
    .catch(() => []);
  for (const row of rows) {
    const userId = String(row?.userId || "");
    const reward = row?.profile?.totals?.exp?.monthlyTopReward || null;
    const roleId = String(reward?.roleId || "");
    const hadRoleBefore = Boolean(reward?.hadRoleBefore);
    const keepByVoterReward = hasActiveMonthlyVoterRewardOnRole(row, roleId, nowMs);
    const keepByFinale = hasActiveHogwartsFinaleRewardOnRole(row, roleId, nowMs);
    if (userId && roleId && !hadRoleBefore && !keepByVoterReward && !keepByFinale) {
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

async function assignMonthlyTopRewards(guild, ranking, rankedYear, rankedMonth) {
  const now = Date.now();
  const rankIndexes = usesNewMonthlyTopActivityRewards(rankedYear, rankedMonth) ? [2] : [1, 2];
  for (const i of rankIndexes) {
    const row = Array.isArray(ranking) ? ranking[i] : null;
    const userId = String(row?.userId || "");
    const roleId = String(monthlyTopRewardRoleByRank(i, rankedYear, rankedMonth) || "");
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

async function publishHogwartsBiweeklyActivityWinners(client, options = {}) {
  const eventCfg = resolveHogwartsEventConfig(client);
  if (!isHogwartsWeeklyTopReplaced(client)) {
    global.logger?.info?.("[HOGWARTS BIWEEKLY TOP] Publish skipped: evento non attivo.");
    return;
  }
  const mainGuildId = String(IDs.guilds?.main || "");
  let guild =
    mainGuildId &&
    (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null)));
  const channelIdToUse = options.targetChannelId || TARGET_CHANNEL_ID;
  let channel = null;
  if (!guild) {
    channel =
      client.channels.cache.get(channelIdToUse) || (await getClientChannelCached(client, channelIdToUse, { ttlMs: 60_000 }));
    if (!channel?.guild) {
      global.logger?.error?.("[HOGWARTS BIWEEKLY TOP] Publish skipped: guild not found.");
      return;
    }
    guild = channel.guild;
  }
  channel =
    client.channels.cache.get(channelIdToUse) || (await getClientChannelCached(client, channelIdToUse, { ttlMs: 60_000 }));
  if (!channel?.guild) {
    global.logger?.error?.("[HOGWARTS BIWEEKLY TOP] Publish skipped: canale non trovato.", channelIdToUse);
    return;
  }
  const now =
    options.anchorDate instanceof Date && !Number.isNaN(options.anchorDate.getTime()) ? options.anchorDate : new Date();
  if (!options.forcePublish && !shouldPublishHogwartsBiweeklyToday(now, resolveHubStartMs(eventCfg))) {
    global.logger?.info?.("[HOGWARTS BIWEEKLY TOP] Publish skipped: non è domenica di chiusura bisettimanale.");
    return;
  }
  const window = resolveHogwartsBiweeklyWindow(now);
  const periodEndMs = window.periodEndMs;
  const periodStartMs = window.periodStartMs;
  const periodKey = window.periodKey;
  const eventKey = String(eventCfg.eventKey || "").trim();
  if (!periodKey || !eventKey) return;
  const existing = await findBiweeklyPublishMarker(guild.id, periodKey);
  if (existing?.status === "completed" && !options.forcePublish) {
    return;
  }
  const sortedHouseByUserId = await loadSortedHouseByUserId(guild.id, eventKey);
  if (!sortedHouseByUserId.size) {
    global.logger?.warn?.("[HOGWARTS BIWEEKLY TOP] Publish skipped: nessuno smistato.");
    return;
  }
  const rowsSource = await loadBiweeklyRowsFromHourlyWindow(guild, now, window);
  let messageDocs = filterDocsToSortedUsers(
    rowsSource.filter((row) => Number(row?.messageCount || 0) > 0).sort((a, b) => Number(b.messageCount || 0) - Number(a.messageCount || 0)).slice(0, 300),
    sortedHouseByUserId,
  );
  let voiceDocs = filterDocsToSortedUsers(
    rowsSource.filter((row) => Number(row?.voiceExp || 0) > 0).sort((a, b) => Number(b.voiceExp || 0) - Number(a.voiceExp || 0)).slice(0, 300),
    sortedHouseByUserId,
  );
  const topMessagesPool = await resolveTopThreeUsers(client, guild, messageDocs, (doc) => Number(doc?.messageCount || 0), 40, HOGWARTS_EVENT_TOP_EXCLUDED_ROLE_IDS);
  const topVoicePool = await resolveTopThreeUsers(client, guild, voiceDocs, (doc) => Number(doc?.voiceExp || 0), 40, HOGWARTS_EVENT_TOP_EXCLUDED_ROLE_IDS);
  const minigameWeekKeys = getIsoWeekKeysInBiweeklyWindow(periodEndMs, periodStartMs);
  let minigameDocsRaw = [];
  if (minigameWeekKeys.length) {
    minigameDocsRaw = await ActivityUserProfile.find({
      guildId: guild.id,
      $or: minigameWeekKeys.flatMap((k) => [
        { "profile.totals.exp.minigame.weeklyKey": k, "profile.totals.exp.minigame.weeklyExp": { $gt: 0 } },
        { "profile.totals.exp.minigame.prevWeekKey": k, "profile.totals.exp.minigame.prevWeekExp": { $gt: 0 } },
      ]),
    })
      .select("userId profile.totals.exp.minigame")
      .limit(1200)
      .lean()
      .catch(() => []);
  }
  const minigameDocs = filterDocsToSortedUsers(
    minigameDocsRaw
      .filter((d) => effectiveMinigameBiweeklyScore(d, minigameWeekKeys) > 0)
      .sort((a, b) => effectiveMinigameBiweeklyScore(b, minigameWeekKeys) - effectiveMinigameBiweeklyScore(a, minigameWeekKeys))
      .slice(0, 450),
    sortedHouseByUserId,
  );
  const mgScore = (doc) => effectiveMinigameBiweeklyScore(doc, minigameWeekKeys);
  let topMinigamePool = await resolveTopThreeUsers(client, guild, minigameDocs, mgScore, 40, HOGWARTS_EVENT_TOP_EXCLUDED_ROLE_IDS);
  if (!topMinigamePool.length && minigameDocs.some((d) => mgScore(d) > 0)) {
    topMinigamePool = await resolveMinigameTopForced(client, guild, minigameDocs, mgScore, 40, HOGWARTS_EVENT_TOP_EXCLUDED_ROLE_IDS);
  }
  const dedupedTops = buildHogwartsBiweeklyTopsDeduped(topMessagesPool, topVoicePool, topMinigamePool, sortedHouseByUserId, 3);
  const displayTopMessages = dedupedTops.messages;
  const displayTopVoice = dedupedTops.voice;
  const displayTopMinigame = dedupedTops.minigame;
  const messageRows = displayTopMessages.length
    ? displayTopMessages.map((item, index) => formatRankLine(index, `<@${item.userId}>`, item.value, "messaggi"))
    : [buildEmptyLine("messaggi")];
  const voiceRows = displayTopVoice.length
    ? displayTopVoice.map((item, index) => formatVoiceRankLine(index, `<@${item.userId}>`, item.value))
    : [buildEmptyLine("ore in vocale")];
  const minigameRows = displayTopMinigame.length
    ? displayTopMinigame.map((item, index) => formatRankLine(index, `<@${item.userId}>`, item.value, "pt minigame"))
    : [buildEmptyLine("minigames")];
  const embedDescLines = [
    `<:VC_Leaderboard:1482534806314287387> // Tutti i vincitori hanno ricevuto galeoni e punti casa`,
    "",
    `<a:VC_HeartsPink:1468685897389052008> • **Classifica testuale:**`,
    ...messageRows,
    "",
    `<a:VC_HeartsBlue:1468686100045369404> • **Classifica vocale:**`,
    ...voiceRows,
    "",
    `<a:VC_Events:1482706144953897223> • **Classifica minigames:**`,
    ...minigameRows,
  ];
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(embedDescLines.join("\n"))
    .setThumbnail(guildIconUrl(guild, { size: 256 }) || null);
  const messageWinner = displayTopMessages[0] || null;
  const voiceWinner = displayTopVoice[0] || null;
  const minigameWinner = displayTopMinigame[0] || null;
  const messageWinnerTotal = Number(messageWinner?.value || 0);
  const voiceWinnerTotal = Number(voiceWinner?.value || 0);
  const minigameWinnerTotal = Number(minigameWinner?.value || 0);
  const messageWinnerMention = messageWinner?.userId ? `<@${messageWinner.userId}>` : "Nessun vincitore";
  const voiceWinnerMention = voiceWinner?.userId ? `<@${voiceWinner.userId}>` : "Nessun vincitore";
  const minigameWinnerMention = minigameWinner?.userId ? `<@${minigameWinner.userId}>` : "Nessun vincitore";
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
  const minigameAnnounceLine = `\n<:VC_Podio1:1482694399283433582> Con un totale di **${minigameWinnerTotal} pt**, ${minigameWinnerMention} ottiene il primo posto per **__minigames__**.`;
  const spanLabel = window.schoolPeriod && Number(window.hourWindowDays) <= 8 ? "questa **settimana**" : "queste **due settimane**";
  const payload = {
    content: `<@&1442568949605597264>
<a:VC_Winner:1482535294757507255> Ciao a tutti! Annunciamo i vincitori di ${spanLabel} per attività.

<:VC_Podio1:1482694399283433582> Con un totale di **${messageWinnerTotal} messaggi**, ${messageWinnerMention} ottiene il primo posto per **__chat testuale__**.
<:VC_Podio1:1482694399283433582> Con un totale di **${formatVoiceHoursFromExp(voiceWinnerTotal)}** in vocale, ${voiceWinnerMention} ottiene il primo posto per **__chat vocale__**.${minigameAnnounceLine}
_ _`,
    embeds: [embed],
    components: [button],
  };
  await SiteDocument.findOneAndUpdate(
    {
      docType: HOGWARTS_BIWEEKLY_PUBLISH_DOC,
      guildId: guild.id,
      userId: HOGWARTS_BIWEEKLY_PUBLISH_OWNER_ID,
      dedupeKey: periodKey,
    },
    {
      $setOnInsert: {
        docType: HOGWARTS_BIWEEKLY_PUBLISH_DOC,
        guildId: guild.id,
        userId: HOGWARTS_BIWEEKLY_PUBLISH_OWNER_ID,
        dedupeKey: periodKey,
        createdBy: "hogwarts_biweekly_top",
      },
      $set: {
        status: "running",
        planKey: "hogwarts_biweekly_top",
        "rawWebhook.periodStartMs": periodStartMs,
        "rawWebhook.periodEndMs": periodEndMs,
        "rawWebhook.eventKey": eventKey,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  if (!options.skipDiscordSends && channel) {
    try {
      await channel.send(payload);
    } catch (error) {
      global.logger.error("[HOGWARTS BIWEEKLY TOP] Failed to send winners message:", error);
    }
  }
  const awardStats = {
    messages: await awardHogwartsBiweeklyCategoryWinners(client, guild, "messages", displayTopMessages, periodKey, eventKey),
    voice: await awardHogwartsBiweeklyCategoryWinners(client, guild, "voice", displayTopVoice, periodKey, eventKey),
    minigames: await awardHogwartsBiweeklyCategoryWinners(client, guild, "minigames", displayTopMinigame, periodKey, eventKey),
  };
  await markBiweeklyPublishComplete(guild.id, periodKey, eventKey, {
    displayTopMessages,
    displayTopVoice,
    displayTopMinigame,
    awardStats,
  });
  if (typeof options.dryRunLogger === "function") {
    try {
      options.dryRunLogger({
        periodKey,
        periodStartMs,
        periodEndMs,
        displayTopMessages,
        displayTopVoice,
        displayTopMinigame,
        awardStats,
        payloadContent: payload.content,
      });
    } catch (e) {
      global.logger?.warn?.("[HOGWARTS BIWEEKLY TOP] dryRunLogger:", e?.message || e);
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

let weeklyActivityWinnersLoopStarted = false;
function startWeeklyActivityWinnersLoop(client) {
  if (weeklyActivityWinnersLoopStarted) return;
  weeklyActivityWinnersLoopStarted = true;
  cron.schedule(
    "0 21 * * 0",
    runCronDetached("[WEEKLY ACTIVITY]", async () => {
      if (!isHogwartsWeeklyTopReplaced(client)) {
        await publishWeeklyActivityWinners(client);
      }
      const { runCustomVocWeeklyEnforcement } = require("./customVocWeeklyActivityService");
      await runCustomVocWeeklyEnforcement(client, { mode: "weekly" });
      await resetWeeklyActivityCounters(client);
    }),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  cron.schedule(
    "0 12 * * 0",
    runCronDetached("[HOGWARTS BIWEEKLY TOP]", async () => {
      if (!isHogwartsWeeklyTopReplaced(client)) return;
      await publishHogwartsBiweeklyActivityWinners(client);
      const { publishHogwartsHouseActivityReport } = require("./hogwartsHouseActivityReportService");
      await publishHogwartsHouseActivityReport(client);
    }),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  cron.schedule(
    "0 10 1 * *",
    runCronDetached("[MONTHLY ACTIVITY]", async () => {
      await publishMonthlyActivityWinners(client);
    }),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  cron.schedule(
    "5 0 * * *",
    runCronDetached("[MONTHLY REWARDS]", async () => {
      const mainGuildId = String(IDs.guilds?.main || "");
      const guild =
        (mainGuildId && (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null)))) ||
        null;
      if (!guild) return;
      await cleanupExpiredMonthlyVoterRewards(guild);
      await cleanupExpiredMonthlyTopRewards(guild);
      await reconcileDuplicateActiveMonthlyRewardRoles(guild);
    }),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  setTimeout(async () => {
    try {
      const mainGuildId = String(IDs.guilds?.main || "");
      const guild =
        (mainGuildId && (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId, { ttlMs: 60_000 }).catch(() => null)))) ||
        null;
      if (!guild) return;
      await cleanupExpiredMonthlyVoterRewards(guild);
      await cleanupExpiredMonthlyTopRewards(guild);
      await reconcileDuplicateActiveMonthlyRewardRoles(guild);
      await syncRoyaleMinigameTotalRole(client, { guild });
    } catch (err) {
      global.logger?.error?.("[MONTHLY REWARDS] Startup expiry cleanup failed:", err);
    }
  }, 20_000);
}

module.exports = { startWeeklyActivityWinnersLoop, publishWeeklyActivityWinners, publishHogwartsBiweeklyActivityWinners, publishMonthlyActivityWinners, reconcileDuplicateActiveMonthlyRewardRoles, resetWeeklyActivityCounters, getLastCompletedWeekKey, getDateKeysForWeekKey, getWeekKey, isHogwartsWeeklyTopReplaced, shouldPublishHogwartsBiweeklyToday, collectHogwartsBiweeklyActivityRows, loadSortedHouseByUserId, loadRowsFromHourlyWindowByHourKeys, awardHogwartsBiweeklyHousePoints, buildHourKeysBetweenMs, buildLast7DaysHourKeys, createUtcFromRomeLocal, getLastSunday21BoundaryMsAtOrBefore, syncRoyaleMinigameTotalRole, scheduleRoyaleMinigameRoleSync };