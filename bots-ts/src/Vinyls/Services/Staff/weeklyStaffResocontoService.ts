const cron = require("node-cron") as typeof import("node-cron");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { aggregateSanctionsByModInWeek } = require("../../Utils/Moderation/modCaseStore") as typeof import("../../Utils/Moderation/modCaseStore");
const { RESOCONTO_APPLY_PREFIX, RESOCONTO_REJECT_PREFIX } = require("../../Events/interaction/resocontoHandlers") as typeof import("../../Events/interaction/resocontoHandlers");
const { getUserOverviewStats } = require("../Community/activityService") as typeof import("../Community/activityService");
const { getClientGuildCached, getClientChannelCached, getGuildMemberCached, } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { fetchGuildMembersRespectingGatewayRateLimit } = require("../../Utils/Discord/gatewayMemberFetch") as typeof import("../../Utils/Discord/gatewayMemberFetch");
const { addAllRoleMembersToThread, addUserIdsToThread } = require("../../Utils/Discord/threadRoleMembers") as typeof import("../../Utils/Discord/threadRoleMembers");
const { getResocontoReviewerUserIdsForSegment, getResocontoReviewerRoleIds } = require("../../Utils/Staff/resocontoAccess") as typeof import("../../Utils/Staff/resocontoAccess");
const { getDevIds } = require("../../Utils/Moderation/commandPermissions") as typeof import("../../Utils/Moderation/commandPermissions");
const { STAFF_NEW_EMOJI } = require("../../Utils/Community/staffListUtils") as typeof import("../../Utils/Community/staffListUtils");
const { applyPronounGenderToTextForMember } = require("../../Utils/Community/pronounGenderUtils") as typeof import("../../Utils/Community/pronounGenderUtils");
const { getStaffRoleEmojiByRoleId } = require("../../Utils/Community/staffRoleEmoji") as typeof import("../../Utils/Community/staffRoleEmoji");
const { ensureStaff, getOrCreateStaffDoc } = require("../../Utils/Staff/staffDocUtils") as typeof import("../../Utils/Staff/staffDocUtils");
const { ensureStaffProfileDoc, getStaffDoc, valutazionePositiveAddCore, valutazioneNegativeAddCore, } = require("../../Utils/Staff/valutazionePanelActions") as typeof import("../../Utils/Staff/valutazionePanelActions");
const { hasActiveAcceptedStaffPause, getTodayUtc, normalizePauseRoleChoice, roleChoiceAppliesTo, PAUSE_ROLE_PM } = require("../../Utils/Pause/pauseHandlersUtils") as typeof import("../../Utils/Pause/pauseHandlersUtils");
const TIME_ZONE = "Europe/Rome";
const RESOCONTO_CLOSE_HOUR_ROME = 20;
const RESOCONTO_CRON_EXPRESSION = "0 15 * * 0";
const RESOCONTO_SUNDAY_SEGMENTS = ["pm", "helper", "mod", "senior_moderator", "director"];
const STAFF_RESOCONTO_SEGMENTS = ["helper", "mod", "senior_moderator", "director"];
const RESOCONTO_CRON_SEGMENTS = RESOCONTO_SUNDAY_SEGMENTS.map((segment?) => ({
  segment,
  expression: RESOCONTO_CRON_EXPRESSION,
}));
const STAFF_ACTIVITY_LIMITS = {
  [String(IDs.roles.Helper)]: { messages: 400, hours: 4 },
  [String(IDs.roles.Mod)]: { messages: 500, hours: 5 },
  [String(IDs.roles.SeniorModerator)]: { messages: 600, hours: 6 },
  [String(IDs.roles.Director)]: { messages: 550, hours: 5.5 },
  };
const STAFF_LIMITS_MSG_PER_HOUR_SWAP = 100;
const STAFF_LIMITS_POSITIVE_MULTIPLIER = 2;

function scaleStaffActivityLimits(limits?, multiplier = 1) {
  if (!limits) return null;
  const m = Math.max(0, Number(multiplier) || 0);
  return {
    messages: Math.max(0, Number(limits.messages || 0) * m),
    hours: Math.max(0, Number(limits.hours || 0) * m),
  };
}

function evaluateStaffWeeklyLimitsWithSwap(weeklyMessages?, weeklyVoiceHours?, limits?) {
  if (!limits) {
    return {
      reached: false,
      effectiveMessages: Math.max(0, Math.floor(toSafeNumber(weeklyMessages))),
      effectiveHours: Math.max(0, toSafeNumber(weeklyVoiceHours)),
      swapApplied: false,
      hoursToMessages: 0,
      messagesToHours: 0,
      remainingMessages: 0,
      remainingHours: 0,
    };
  }

  const reqMsg = Math.max(0, Number(limits.messages || 0));
  const reqHrs = Math.max(0, Number(limits.hours || 0));
  let msg = Math.max(0, Math.floor(toSafeNumber(weeklyMessages)));
  let hrs = Math.max(0, toSafeNumber(weeklyVoiceHours));
  let hoursToMessages = 0;
  let messagesToHours = 0;

  const msgGap = Math.max(0, reqMsg - msg);
  if (msgGap > 0) {
    const hrsSurplus = Math.max(0, hrs - reqHrs);
    const hrsToSwap = Math.min(hrsSurplus, msgGap / STAFF_LIMITS_MSG_PER_HOUR_SWAP);
    if (hrsToSwap > 0) {
      hoursToMessages = hrsToSwap;
      msg += hrsToSwap * STAFF_LIMITS_MSG_PER_HOUR_SWAP;
      hrs -= hrsToSwap;
    }
  }

  const hrsGap = Math.max(0, reqHrs - hrs);
  if (hrsGap > 0) {
    const msgSurplus = Math.max(0, msg - reqMsg);
    const msgToSwap = Math.min(msgSurplus, hrsGap * STAFF_LIMITS_MSG_PER_HOUR_SWAP);
    if (msgToSwap > 0) {
      messagesToHours = msgToSwap;
      hrs += msgToSwap / STAFF_LIMITS_MSG_PER_HOUR_SWAP;
      msg -= msgToSwap;
    }
  }

  const remainingMessages = Math.max(0, reqMsg - msg);
  const remainingHours = Math.max(0, reqHrs - hrs);
  return {
    reached: remainingMessages === 0 && remainingHours === 0,
    effectiveMessages: msg,
    effectiveHours: hrs,
    swapApplied: hoursToMessages > 0 || messagesToHours > 0,
    hoursToMessages,
    messagesToHours,
    remainingMessages,
    remainingHours,
  };
}

/** Stesso swap del base (100 msg = 1h, illimitato), ma sui limiti ×multiplier (doppio = ×2 msg e ×2 h). */
function evaluateStaffWeeklyLimitsAtMultiplier(weeklyMessages?, weeklyVoiceHours?, limits?, multiplier = 1) {
  return evaluateStaffWeeklyLimitsWithSwap(
    weeklyMessages,
    weeklyVoiceHours,
    scaleStaffActivityLimits(limits, multiplier),
  );
}

function formatStaffLimitsSwapLine(limitsEval?) {
  if (!limitsEval?.swapApplied) return null;
  const parts = [];
  if (limitsEval.hoursToMessages > 0) {
    const msgGain = Math.round(limitsEval.hoursToMessages * STAFF_LIMITS_MSG_PER_HOUR_SWAP);
    parts.push(`__${formatHoursFromSeconds(limitsEval.hoursToMessages * 3600)}__ → __${msgGain}__ messaggi`);
  }
  if (limitsEval.messagesToHours > 0) {
    const hrsGain = limitsEval.messagesToHours / STAFF_LIMITS_MSG_PER_HOUR_SWAP;
    parts.push(`__${limitsEval.messagesToHours}__ messaggi → __${formatHoursFromSeconds(hrsGain * 3600)}__`);
  }
  if (!parts.length) return null;
  return `<:VC_Dot:1443660294596329582> **Scambio limiti** (${STAFF_LIMITS_MSG_PER_HOUR_SWAP} msg = 1h): ${parts.join(" · ")}`;
}
const STAFF_SANCTION_LIMITS = {
  [String(IDs.roles.Helper)]: 1,
  [String(IDs.roles.Mod)]: 2,
  [String(IDs.roles.SeniorModerator)]: 2,
  [String(IDs.roles.Director)]: 1,
};
const SANCTION_ACTIONS = new Set(["WARN", "MUTE", "KICK", "BAN"]);
const STAFF_ROLE_PRIORITY = [
  String(IDs.roles.Manager),
  String(IDs.roles.Admin),
  String(IDs.roles.Director),
  String(IDs.roles.SeniorModerator),
  String(IDs.roles.Mod),
  String(IDs.roles.Helper),
];
const RESOCONTO_PM_EXCLUDED_USER_IDS = new Set(
  (Array.isArray(IDs.resocontoExcludePmUserIds) ? IDs.resocontoExcludePmUserIds : [])
    .map((id?) => String(id || "").trim())
    .filter((id?) => /^\d{17,20}$/.test(id)),
);
const RESOCONTO_ROLE_RANK = new Map(
  [
    IDs.roles.Member,
    IDs.roles.Helper,
    IDs.roles.Mod,
    IDs.roles.SeniorModerator,
    IDs.roles.Director,
    IDs.roles.Admin,
    IDs.roles.Manager,
    IDs.roles.Founder,
    IDs.roles.PartnerManager,
  ]
    .filter(Boolean)
    .map((roleId?, index?) => [String(roleId), index]),
);
const PM_WEEKLY_PARTNER_MIN_FOR_OK = 30;
const PM_WEEKLY_DEPEX_MAX_PARTNERS = 15;
const ROLE_UP = {
  [String(IDs.roles.Member || "")]: String(IDs.roles.Helper),
  [String(IDs.roles.Helper)]: String(IDs.roles.Mod),
  [String(IDs.roles.Mod)]: String(IDs.roles.SeniorModerator),
  [String(IDs.roles.SeniorModerator)]: String(IDs.roles.Director),
  [String(IDs.roles.Director)]: String(IDs.roles.Admin),
  [String(IDs.roles.Admin)]: String(IDs.roles.Manager),
};

let weeklyStaffResocontoTasks = [];
const resocontoMemberHydrationStateByGuild = new Map();
const RESOCONTO_MEMBER_HYDRATE_TTL_MS = 2 * 60 * 1000;
const RESOCONTO_MESSAGE_SCAN_PAGE = 100;
const RESOCONTO_MESSAGE_SCAN_MAX = 2500;
const RESOCONTO_MEMBER_FETCH_PAGE_LIMIT = 1000;
const RESOCONTO_MEMBER_FETCH_PAGE_DELAY_MS = 400;
const BOT_STATE_KEY_LAST_RESOCONTO = "lastResocontoRun";

async function writeLastResocontoRun() {
  await setBotState(BOT_STATE_KEY_LAST_RESOCONTO, { lastRunAt: Date.now() });
}

const BOT_STATE_KEY_STAFF_RESOCONTO_POSTED_PREFIX = "staffResocontoPosted";

function buildStaffResocontoPostedStateKey(guildId?, resocontoWeekKey?) {
  return `${BOT_STATE_KEY_STAFF_RESOCONTO_POSTED_PREFIX}:${String(guildId || "")}:${String(resocontoWeekKey || "")}`;
}

async function loadStaffResocontoPostedIds(guildId?, resocontoWeekKey?) {
  const key = buildStaffResocontoPostedStateKey(guildId, resocontoWeekKey);
  const cur = await getBotState(key, { userIds: [] });
  return new Set((Array.isArray(cur?.userIds) ? cur.userIds : [])
    .map((x?) => String(x || "").trim())
    .filter((id?) => /^\d{17,20}$/.test(id) || /^\d{16,20}:\d{17,20}$/.test(id)));
}

async function appendStaffResocontoPostedId(guildId?, resocontoWeekKey?, userId?) {
  const uid = String(userId || "").trim();
  if (!/^\d{17,20}$/.test(uid)) return;
  const key = buildStaffResocontoPostedStateKey(guildId, resocontoWeekKey);
  const cur = await getBotState(key, { userIds: [] });
  const arr = Array.isArray(cur?.userIds) ? cur.userIds.map((x?) => String(x || "").trim()).filter(Boolean) : [];
  if (arr.includes(uid)) return;
  arr.push(uid);
  await setBotState(key, { userIds: arr });
}

async function appendStaffResocontoPostedRoleId(guildId?, resocontoWeekKey?, userId?, roleId?) {
  const uid = String(userId || "").trim();
  const rid = String(roleId || "").trim();
  if (!/^\d{17,20}$/.test(uid) || !rid) return;
  const key = buildStaffResocontoPostedStateKey(guildId, resocontoWeekKey);
  const cur = await getBotState(key, { userIds: [] });
  const arr = Array.isArray(cur?.userIds) ? cur.userIds.map((x?) => String(x || "").trim()).filter(Boolean) : [];
  const roleKey = `${rid}:${uid}`;
  if (!arr.includes(roleKey)) arr.push(roleKey);
  await setBotState(key, { userIds: arr });
}

function toSafeNumber(value?) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function formatHoursFromSeconds(seconds?) {
  const safeSeconds = Math.max(0, Math.floor(toSafeNumber(seconds)));
  const hours = safeSeconds / 3600;
  return `${hours.toFixed(2)}h`;
}

function collectVoiceChannelIdsUnderCategory(guild?, categoryId?) {
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

const RESOCONTO_PUBLIC_VOICE_NAME_RE = /\b(Lounge|Duo|Trio|Quad|Penta|Hexa|Setta|Octa|Squad)\b/i;

function isResocontoPublicVoiceName(name?) {
  return RESOCONTO_PUBLIC_VOICE_NAME_RE.test(String(name || ""));
}

function isResocontoStanzeChannel(channel?) {
  const stanzeCat = String(IDs.categories?.categoryStanze || "").trim();
  if (!stanzeCat || !channel) return false;
  if (String(channel.parentId || "") === stanzeCat) return true;
  const lobbyId = String(IDs.channels?.stanzaLobbyVoice || "").trim();
  if (lobbyId && String(channel.id || "") === lobbyId) return true;
  return false;
}

function collectResocontoVoiceExcludeIds(guild?) {
  const out = new Set();
  const excludeParents = new Set(
    [
      IDs.categories?.categoryPrivate,
      IDs.categories?.categoryStaff,
      IDs.categories?.categoryBench,
      IDs.categories?.categoryLogs,
      IDs.categories?.categorySystem,
      IDs.categories?.categoryReport,
      IDs.categories?.categoryPartner,
      IDs.categories?.categorySponsor,
      IDs.categories?.categoryMidHigh,
    ]
      .map((id?) => String(id || "").trim())
      .filter(Boolean),
  );
  if (!guild?.channels?.cache) return out;
  for (const ch of guild.channels.cache.values()) {
    if (!ch?.isVoiceBased?.()) continue;
    const id = String(ch.id || "").trim();
    if (!id) continue;
    if (isResocontoStanzeChannel(ch) || isResocontoPublicVoiceName(ch.name)) continue;
    const parent = String(ch.parentId || "");
    if (parent && excludeParents.has(parent)) {
      out.add(id);
      continue;
    }
    const keyHit = Object.entries(IDs.channels || {}).some(([key, value]) => {
      if (!/^vocprivata/i.test(String(key || ""))) return false;
      return String(value || "").trim() === id;
    });
    if (keyHit) out.add(id);
  }
  return out;
}

function buildResocontoOverviewOptions(guild?, now = new Date()) {
  const scope = buildResocontoActivityScope(guild);
  const { windowStart, windowEndExclusive } = getCurrentResocontoPexWeekWindowUtc(now);
  const rangeEnd = new Date(Math.min(Date.now(), windowEndExclusive.getTime()));
  return {
    ...scope,
    rangeStart: windowStart,
    rangeEnd,
  };
}

function buildResocontoActivityScope(guild?) {
  const includeTextChannelIds = new Set();
      const includeVoiceChannelIds = null;
  const addText = (id?) => {
    const value = String(id || "").trim();
    if (value) includeTextChannelIds.add(value);
  };

  addText(IDs.channels?.chat);
  addText(IDs.channels?.media);
  addText(IDs.channels?.commands);
  addText(IDs.channels?.selfieVerificati);
  addText(IDs.channels?.noMic);

  const publicsCategoryId = String(IDs.categories?.categoryPublics || "").trim();
  const stanzeCategoryId = String(IDs.categories?.categoryStanze || "").trim();
  const countableParents = new Set(
    [publicsCategoryId, stanzeCategoryId].filter(Boolean),
  );

  for (const ch of guild?.channels?.cache?.values?.() || []) {
    const parentId = String(ch?.parentId || "");
    const channelId = String(ch?.id || "").trim();
    if (!channelId) continue;
    const underCountableParent = countableParents.has(parentId);
    const publicVoiceName = isResocontoPublicVoiceName(ch?.name);
    const isStanze = isResocontoStanzeChannel(ch);
    if (ch?.isVoiceBased?.() && (underCountableParent || publicVoiceName || isStanze)) {
            addText(channelId);
    }
  }

    for (const id of Array.isArray(IDs.publicVoiceHubChannelIds) ? IDs.publicVoiceHubChannelIds : []) {
    addText(id);
  }
  for (const [key, value] of Object.entries(IDs.channels || {})) {
    if (!/^(vocale(Duo|Trio|Quad|Penta|Hexa|Setta|Octa|Lounge|Squad)|vocaleduo|trio\d)/i.test(String(key || ""))) continue;
    addText(value);
  }
  addText(IDs.channels?.stanzaLobbyVoice);

  return { includeTextChannelIds, includeVoiceChannelIds };
}

function wait(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function maxMemberSnowflakeInChunk(chunk?) {
  if (!chunk?.size) return null;
  let max = null;
  for (const id of chunk.keys()) {
    const s = String(id);
    if (!max || BigInt(s) > BigInt(max)) max = s;
  }
  return max;
}

function isGuildMemberCacheLikelyComplete(guild?) {
  const memberCount = Number(guild?.memberCount ?? 0) || 0;
  const cacheSize = Number(guild?.members?.cache?.size ?? 0) || 0;
  return memberCount > 0 && cacheSize >= memberCount;
}

async function fetchGuildMembersByPagesForResoconto(guild?, segment?) {
  if (!guild?.members?.fetch) return 0;
  const guildId = String(guild.id || "");
  const memberCount = Number(guild.memberCount ?? 0) || 0;
  const maxPages = Math.min(50, Math.max(1, Math.ceil((memberCount || 25000) / RESOCONTO_MEMBER_FETCH_PAGE_LIMIT) + 2));
  let after = null;
  let totalFetched = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const chunk = await guild.members
      .fetch({ limit: RESOCONTO_MEMBER_FETCH_PAGE_LIMIT, after: after ?? undefined, force: true })
      .catch((err?) => {
        global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] paged member fetch failed:", {
          guildId,
          segment: segment || null,
          page,
          after: after ?? null,
          err: err?.message || String(err),
          code: err?.code,
        });
        return null;
      });
    if (!chunk?.size) break;

    totalFetched += chunk.size;
    if (chunk.size < RESOCONTO_MEMBER_FETCH_PAGE_LIMIT) break;

    const nextAfter = maxMemberSnowflakeInChunk(chunk);
    if (!nextAfter || String(nextAfter) === String(after ?? "")) {
      global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] paged member fetch cursor stopped:", {
        guildId,
        segment: segment || null,
        page,
        after: after ?? null,
        nextAfter,
      });
      break;
    }
    after = nextAfter;
    await wait(RESOCONTO_MEMBER_FETCH_PAGE_DELAY_MS);
  }

  return totalFetched;
}

function getRomeDateParts(date?) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", });
  const parts = formatter.formatToParts(date);
  const out: Record<string, any> = {};
  for (const part of parts) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
  };
}

function getRomeOffsetMs(utcDate?) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "shortOffset", hour: "2-digit", });
  const timeZoneName = formatter.formatToParts(utcDate).find((part?) => part.type === "timeZoneName")?.value;

  const match = String(timeZoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i,);
  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(year?, month?, day?, hour?, minute?, second?) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) {
    utcMs = baseUtcMs - secondOffsetMs;
  }
  return new Date(utcMs);
}

function parseRomeWallClock(referenceDate?) {
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
  const o: Record<string, any> = {};
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

function addDaysToRomeYmd(year?, month?, day?, deltaDays?) {
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
  const r = parseRomeWallClock(now);
  const daysFromMonday = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[r.weekday] ?? 0;
  const monParts = addDaysToRomeYmd(r.year, r.month, r.day, -daysFromMonday);
  const weekStart = createUtcFromRomeLocal(monParts.year, monParts.month, monParts.day, 0, 0, 0);
  const nextMonParts = addDaysToRomeYmd(monParts.year, monParts.month, monParts.day, 7);
  const weekEndExclusive = createUtcFromRomeLocal(
    nextMonParts.year,
    nextMonParts.month,
    nextMonParts.day,
    0,
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

function getCurrentResocontoPexWeekWindowUtc(referenceNow = new Date()) {
  const r = parseRomeWallClock(referenceNow);
  const wdMap = { Sun: 6, Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5 };
  const daysFromMonday = wdMap[r.weekday] ?? 0;
  const monParts = addDaysToRomeYmd(r.year, r.month, r.day, -daysFromMonday);
  const sunParts = addDaysToRomeYmd(monParts.year, monParts.month, monParts.day, 6);
  return {
    windowStart: createUtcFromRomeLocal(monParts.year, monParts.month, monParts.day, 0, 0, 0),
    windowEndExclusive: createUtcFromRomeLocal(
      sunParts.year,
      sunParts.month,
      sunParts.day,
      RESOCONTO_CLOSE_HOUR_ROME,
      0,
      0,
    ),
  };
}

function getPmResocontoWindow(now = new Date()) {
    const { windowStart, windowEndExclusive } = getCurrentResocontoPexWeekWindowUtc(now);
  const endCap = new Date(windowEndExclusive.getTime() - 2 * 60 * 1000);
  if (now.getTime() >= windowEndExclusive.getTime()) {
    return { weekStart: windowStart, weekEnd: endCap };
  }
  const weekEnd = now.getTime() < endCap.getTime() ? now : endCap;
  return { weekStart: windowStart, weekEnd };
}

function getStaffResocontoEvaluationWindow(now = new Date()) {
  const { weekStart, weekEnd } = getPmResocontoWindow(now);
  const r = parseRomeWallClock(now);
  if (r.weekday !== "Sun") return { weekStart, weekEnd };
  const currentMinutes = Number(r.hour || 0) * 60 + Number(r.minute || 0);
  const closeMinutes = RESOCONTO_CLOSE_HOUR_ROME * 60 + 1;
  if (currentMinutes < closeMinutes) return { weekStart, weekEnd };
  const romeToday = getRomeDateParts(now);
  const thisSundayCloseStart = createUtcFromRomeLocal(
    romeToday.year,
    romeToday.month,
    romeToday.day,
    RESOCONTO_CLOSE_HOUR_ROME,
    1,
    0,
  );
  return {
    weekStart: new Date(thisSundayCloseStart.getTime() - 7 * 24 * 60 * 60 * 1000),
    weekEnd: new Date(thisSundayCloseStart.getTime() - 2 * 60 * 1000),
  };
}

function getWeekStartDate(now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() - 7);
  return date;
}

const COSTANZA_BARS = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588";

function dayKeyToWeekdayLabel(dayKey?) {
  if (!dayKey || typeof dayKey !== "string") return "?";
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return "?";
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const formatter = new Intl.DateTimeFormat("it-IT", { timeZone: TIME_ZONE, weekday: "short" });
  return formatter.format(date).replace(".", "").slice(0, 3);
}

function buildCostanzaLines(overview?) {
  const chart = Array.isArray(overview?.chart) ? overview.chart : [];
  if (!chart.length) return [];
  const points = chart.slice(-7);
  const maxText = Math.max(1, ...points.map((p?) => Math.max(0, Number(p?.text ?? 0))));
  const bars = points.map((p?) => {
    const text = Math.max(0, Number(p?.text ?? 0));
    const level = maxText > 0 ? Math.min(7, Math.floor((7 * text) / maxText)) : 0;
    return COSTANZA_BARS[level];
  });
  const activeDays = points.filter((p?) => (Number(p?.text ?? 0) > 0) || (Number(p?.voiceSeconds ?? 0) >= 600)).length;
    const dayLines = points.map((p?, idx?) => {
    const label = dayKeyToWeekdayLabel(p?.dayKey);
    const bar = bars[idx] || COSTANZA_BARS[0];
    return `${label} ${bar}`;
  });
  return [
    `<:VC_Clock:1473359204189474886> **Costanza:** __${activeDays}/${points.length}__ giorni attivi`,
    "```",
    ...dayLines,
    "```",
    "messaggi per giorno",
  ];
}

function parseItalianDate(value?) {
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

function pauseRoleAppliesToSection(pauseRole?, sectionRole?) {
  const section = String(sectionRole || "").trim();
  if (!section) return true;
  const raw = String(pauseRole || "").trim();
  if (!raw) return true;
    if (roleChoiceAppliesTo(section, raw)) return true;
  const normalized = normalizePauseRoleChoice(raw);
  if (normalized && roleChoiceAppliesTo(section, normalized)) return true;
    if (String(section).toLowerCase() === "staff") {
    const low = raw.toLowerCase();
    if (low === "staff" || low.includes("helper") || low.includes("mod") || low.includes("director") || low.includes("admin") || low.includes("manager") || low.includes("founder") || low.includes("high")) {
      return true;
    }
        if (!normalizePauseRoleChoice(raw) && !/partner\s*manager|\bpm\b/i.test(raw)) {
      return true;
    }
  }
  if (String(section).toLowerCase() === "partnermanager") {
    return Boolean(normalizePauseRoleChoice(raw) === PAUSE_ROLE_PM || /partner\s*manager|\bpm\b/i.test(raw));
  }
  return false;
}

function getStaffPauseLine(staffDoc?, sectionRole = null, member = null) {
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
      const line = `<a:VC_Calendar:1482706208149475358> **Rientrato/a** il ${p.dataRitorno}`;
      return member ? applyPronounGenderToTextForMember(line, member) : line;
    }
  }
  return null;
}

function wasInPauseDuringWeek(staffDoc?, weekStart?, weekEnd?, sectionRole = null) {
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

function hadPauseAtLeastOneDayDuringWeek(staffDoc?, weekStart?, weekEnd?, sectionRole = null) {
  const pauses = Array.isArray(staffDoc?.pauses) ? staffDoc.pauses : [];
  const ws = weekStart.getTime();
  const we = weekEnd.getTime();
  if (!Number.isFinite(ws) || !Number.isFinite(we) || we < ws) return false;

  const acceptedPauses = [];
  for (const p of pauses) {
    if (!p || p.status !== "accepted") continue;
    if (!pauseRoleAppliesToSection(p.ruolo || p.ruoloRichiesto, sectionRole)) continue;
    const start = parseItalianDate(p.dataRichiesta);
    const end = parseItalianDate(p.dataRitorno);
    if (!start || !end) continue;
    acceptedPauses.push({ start: start.getTime(), end: end.getTime() });
  }
  if (!acceptedPauses.length) return false;

  let cursorParts = getRomeDateParts(weekStart);
  const endParts = getRomeDateParts(weekEnd);
  for (let guard = 0; guard < 14; guard += 1) {
    const dayStart = createUtcFromRomeLocal(cursorParts.year, cursorParts.month, cursorParts.day, 0, 0, 0);
    const dayEnd = createUtcFromRomeLocal(cursorParts.year, cursorParts.month, cursorParts.day, 23, 59, 59);
    const ds = dayStart.getTime();
    const de = dayEnd.getTime();
    if (ds > we) break;
    if (de >= ws) {
      for (const pause of acceptedPauses) {
        if (pause.start <= de && pause.end >= ds) return true;
      }
    }
    if (cursorParts.year === endParts.year && cursorParts.month === endParts.month && cursorParts.day === endParts.day) break;
    cursorParts = addDaysToRomeYmd(cursorParts.year, cursorParts.month, cursorParts.day, 1);
  }
  return false;
}

function didPauseEndDuringWeek(staffDoc?, weekStart?, weekEnd?, sectionRole = null) {
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

function wasPartnerManagerInPauseForResocontoWeek(staffDoc?, weekStart?, weekEnd?, member?) {
  if (wasInPauseDuringWeek(staffDoc, weekStart, weekEnd, "PartnerManager")) return true;
  const pmId = String(IDs.roles?.PartnerManager || "");
  if (pmId && member?.roles?.cache?.has(pmId) && wasInPauseDuringWeek(staffDoc, weekStart, weekEnd, "Staff")) return true;
  return false;
}

function getPmResocontoPauseDisplayLine(staffDoc?, member?) {
  const pmLine = getStaffPauseLine(staffDoc, "PartnerManager", member);
  if (pmLine) return pmLine;
  const pmId = String(IDs.roles?.PartnerManager || "");
  if (pmId && member?.roles?.cache?.has(pmId)) return getStaffPauseLine(staffDoc, "Staff", member);
  return null;
}

function isPmResocontoExcludedUserId(userId?) {
  return RESOCONTO_PM_EXCLUDED_USER_IDS.has(String(userId || "").trim());
}

function resolveStaffRole(member?) {
  if (!member?.roles?.cache) return null;
  for (const roleId of STAFF_ROLE_PRIORITY) {
    if (member.roles.cache.has(roleId)) return roleId;
  }
  return null;
}

function collectMemberIdsMatchingResocontoStaffSegment(guild?, wantStaffRoleId?) {
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

function collectResocontoDiscordMemberIdsForSegment(guild?, segment?) {
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
  if (
    segment === "helper" ||
    segment === "mod" ||
    segment === "senior_moderator" ||
    segment === "director"
  ) {
    const want =
      segment === "helper"
        ? String(IDs.roles.Helper || "").trim()
        : segment === "mod"
          ? String(IDs.roles.Mod || "").trim()
          : segment === "senior_moderator"
            ? String(IDs.roles.SeniorModerator || "").trim()
            : String(IDs.roles.Director || "").trim();
    return collectMemberIdsMatchingResocontoStaffSegment(guild, want);
  }
  return [];
}

function collectAllResocontoRelevantMemberIdsFromGuild(guild?) {
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

function getResocontoMemberRank(member?) {
  const staffRoleId = resolveStaffRole(member);
  if (staffRoleId) {
    const idx = STAFF_ROLE_PRIORITY.indexOf(String(staffRoleId));
    return idx >= 0 ? idx : 50;
  }
  if (member.roles.cache.has(String(IDs.roles.PartnerManager)))
    return STAFF_ROLE_PRIORITY.length;
  return 999;
}

function compareResocontoMembers(a?, b?) {
  const ra = getResocontoMemberRank(a);
  const rb = getResocontoMemberRank(b);
  if (ra !== rb) return ra - rb;
  const na = String(a.user?.username || a.id).toLowerCase();
  const nb = String(b.user?.username || b.id).toLowerCase();
  return na.localeCompare(nb);
}

function computeActivityGrade(roleId?, weeklyMessages?, weeklyVoiceHours?) {
  const limits = STAFF_ACTIVITY_LIMITS[String(roleId)];
  if (!limits) return "Nessun limite";

  const rawMsg = Math.max(0, Math.floor(toSafeNumber(weeklyMessages)));
  const rawHours = Math.max(0, toSafeNumber(weeklyVoiceHours));
  const limMsg = Number(limits.messages || 0);
  const limHours = Number(limits.hours || 0);

  const reaches = (targetMsg?, targetHrs?) =>
    evaluateStaffWeeklyLimitsWithSwap(rawMsg, rawHours, {
      messages: targetMsg,
      hours: targetHrs,
    }).reached;

  if (evaluateStaffWeeklyLimitsAtMultiplier(rawMsg, rawHours, limits, 3).reached) return "Eccellente";
  if (reaches(limMsg * 2 + 300, limHours * 2 + 2)) return "Ottimo";
  if (evaluateStaffWeeklyLimitsAtMultiplier(rawMsg, rawHours, limits, 2).reached) return "Buono";
  if (reaches(limMsg + 150, limHours + 1.5)) return "Discreto";
  if (reaches(limMsg, limHours)) return "Sufficiente";

  const baseEval = evaluateStaffWeeklyLimitsWithSwap(rawMsg, rawHours, limits);
  const msgDelta = Math.max(0, Number(baseEval.remainingMessages || 0));
  const hoursDelta = Math.max(0, Number(baseEval.remainingHours || 0));
  if (msgDelta <= STAFF_LIMITS_MSG_PER_HOUR_SWAP && hoursDelta <= 1) return "Insufficiente";
  return "Non classificato";
}

function computeBehaviorGrade(positiveCount?, negativeCount?) {
  const positive = Math.max(0, Math.floor(toSafeNumber(positiveCount)));
  const negative = Math.max(0, Math.floor(toSafeNumber(negativeCount)));

  if (positive === 0 && negative === 0) return "Sufficiente";
  if (positive >= 3 && negative === 0) return "Ottimo";
  if (positive === 0 && negative > 0) return "Non classificato";
  if (negative > positive) return "Insufficiente";
  if (positive > negative) return "Discreto";
  return "Sufficiente";
}

function overviewLooksLikeEmptyFallback(overview?) {
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

function isStaffRolesHistoryPexRow(row?) {
  const kind = String(row?.kind || "").trim().toLowerCase();
  if (kind === "pex") return true;
  if (kind === "depex") return false;
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

function wasPexedInWeek(staffDoc?, weekStart?) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const weekStartMs = Number(weekStart.getTime());
  return history.some((row?) => {
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    if (when.getTime() < weekStartMs) return false;
    return isStaffRolesHistoryPexRow(row);
  });
}

function wasPexedInResocontoSkipWindow(staffDoc?, windowStart?, windowEndExclusive?) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const t0 = windowStart.getTime();
  const t1 = windowEndExclusive.getTime();
  return history.some((row?) => {
    if (!isStaffRolesHistoryPexRow(row)) return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    const ms = when.getTime();
    return ms >= t0 && ms < t1;
  });
}

function wasPmPromotedInResocontoSkipWindow(staffDoc?, windowStart?, windowEndExclusive?) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const pmRoleId = String(IDs.roles.PartnerManager || "");
  if (!pmRoleId) return false;
  const t0 = windowStart.getTime();
  const t1 = windowEndExclusive.getTime();
  return history.some((row?) => {
    if (String(row?.newRole || "") !== pmRoleId) return false;
    if (!isStaffRolesHistoryPexRow(row)) return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    const ms = when.getTime();
    return ms >= t0 && ms < t1;
  });
}

function shouldSkipResocontoForPexInCalendarWeek(staffDoc?, windowStart?, windowEndExclusive?) {
  if (!staffDoc) return false;
  return wasPexedInResocontoSkipWindow(staffDoc, windowStart, windowEndExclusive);
}

function hadStaffRoleResocontoPostedThisCycle(staffResocontoPostedIds?, staffRoleId?, userId?) {
  const uid = String(userId || "").trim();
  const rid = String(staffRoleId || "").trim();
  if (!uid || !rid || !staffResocontoPostedIds) return false;
  return staffResocontoPostedIds.has(`${rid}:${uid}`);
}

function wasPexedOnResocontoDay(staffDoc?, referenceNow = new Date()) {
  if (!staffDoc) return false;
  const r = parseRomeWallClock(referenceNow);
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  return history.some((row?) => {
    if (!isStaffRolesHistoryPexRow(row)) return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    const parts = getRomeDateParts(when);
    return parts.year === r.year && parts.month === r.month && parts.day === r.day;
  });
}

function shouldSkipLimitAutovalutazioniForStaffMember({
  graceNewStaffRole = false,
  wasPexedResocontoDay = false,
} = {}) {
  /* resoNewStaffGrace2: auto-val limiti solo skip per Member→staff (nuovo), non helper→mod */
  return Boolean(graceNewStaffRole || wasPexedResocontoDay);
}

function shouldSkipSanctionAutovalutazioniForStaffMember({
  graceNewStaffRole = false,
  wasPexedResocontoDay = false,
} = {}) {
  /* resoNewStaffGrace2: niente auto-val sanzioni ai nuovi in staff (Member→staff) */
  return Boolean(graceNewStaffRole || wasPexedResocontoDay);
}

function computeStaffAction(activityGrade?, behaviorGrade?, pexedInWeek?, positiveCount?, negativeCount?) {
  if (pexedInWeek) return "Nulla";

  const pos = Math.max(0, Math.floor(toSafeNumber(positiveCount)));
  const neg = Math.max(0, Math.floor(toSafeNumber(negativeCount)));
  const noValutazioni = pos === 0 && neg === 0;

    if (
    (activityGrade === "Ottimo" || activityGrade === "Eccellente") &&
    behaviorGrade === "Ottimo"
  ) {
    return "Valutazione Positiva";
  }
  if (
    activityGrade === "Non classificato" &&
    (behaviorGrade === "Non classificato" || noValutazioni)
  ) {
    return "Nulla";
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

const BOT_VALUTAZIONE_SUFFIX = " (già registrata)";

function formatValutazioneLabel(type?, alreadyByBot?, purpose?) {
  const base = type === "positive" ? "Valutazione Positiva" : "Valutazione Negativa";
  const purposeText = purpose ? ` — ${purpose}` : "";
  const botNote = alreadyByBot ? BOT_VALUTAZIONE_SUFFIX : "";
  return `${base}${purposeText}${botNote}`;
}

function pushPendingManualAction(pendingManualActions?, actionKey?, reason?) {
  const key = String(actionKey || "").trim();
  const text = String(reason || "").trim();
  if (!key || !text) return;
  const duplicate = pendingManualActions.some(
    (row?) => row.actionKey === key && row.reason.toLowerCase() === text.toLowerCase(),
  );
  if (duplicate) return;
  pendingManualActions.push({ actionKey: key, reason: text });
}

function hasStaffAutoValutazioneForCycle(staffDoc?, resocontoWeekKey?, staffRoleId?, kind?) {
  const rid = String(staffRoleId || "").trim();
  const wk = String(resocontoWeekKey || "").trim();
  if (!rid || !wk) return false;
  const key =
    kind === "sanzioni"
      ? `weekly_sanzioni:${wk}:${rid}`
      : `weekly_limits:${wk}:${rid}`;
  return Boolean(findAutoValutazioneEntry(staffDoc, key));
}

function staffHasPositiveValutazioneNeedle(staffDoc?, needles?) {
  const list = Array.isArray(staffDoc?.positiveReasons) ? staffDoc.positiveReasons : [];
  const normalizedNeedles = (Array.isArray(needles) ? needles : [])
    .map((needle?) => String(needle || "").toLowerCase())
    .filter(Boolean);
  if (!normalizedNeedles.length) return false;
  return list.some((entry?) => {
    const normalized = String(entry || "").toLowerCase();
    return normalizedNeedles.some((needle?) => normalized.includes(needle));
  });
}

function staffHasNegativeValutazioneNeedle(staffDoc?, needles?) {
  const list = Array.isArray(staffDoc?.negativeReasons) ? staffDoc.negativeReasons : [];
  const normalizedNeedles = (Array.isArray(needles) ? needles : [])
    .map((needle?) => String(needle || "").toLowerCase())
    .filter(Boolean);
  if (!normalizedNeedles.length) return false;
  return list.some((entry?) => {
    const normalized = String(entry || "").toLowerCase();
    return normalizedNeedles.some((needle?) => normalized.includes(needle));
  });
}

function hasStaffLimitsValutazioneForCycle(staffDoc?, resocontoWeekKey?, staffRoleId?) {
      return hasStaffAutoValutazioneForCycle(staffDoc, resocontoWeekKey, staffRoleId, "limits");
}

function hasStaffSanctionsValutazioneForCycle(staffDoc?, resocontoWeekKey?, staffRoleId?) {
  return hasStaffAutoValutazioneForCycle(staffDoc, resocontoWeekKey, staffRoleId, "sanzioni");
}

function shouldSkipManualResocontoVp(staffDoc?, resocontoWeekKey?, staffRoleId?, reason?) {
  const reasonNorm = String(reason || "").toLowerCase();
  const since = getResocontoCycleMessagesSince();
  if (reasonNorm.includes("limiti settimanali")) {
    if (/completati|rispettati/.test(reasonNorm) && !/doppio|triplo|×\s*2|x2/.test(reasonNorm)) {
      /* Mai VP automatica/manuale solo per 1×. */
      return true;
    }
    if (hasStaffLimitsValutazioneForCycle(staffDoc, resocontoWeekKey, staffRoleId)) return true;
    return Boolean(
      findLogForReasonNeedlesSince(
        staffDoc,
        ["limiti settimanali superati almeno del doppio"],
        "positive",
        since,
      ),
    );
  }
  if (reasonNorm.includes("compito sanzioni")) {
    if (hasStaffSanctionsValutazioneForCycle(staffDoc, resocontoWeekKey, staffRoleId)) return true;
    return Boolean(
      findLogForReasonNeedlesSince(staffDoc, ["compito sanzioni completato"], "positive", since),
    );
  }
  if (reasonNorm.includes("griglia")) {
    if (
      staffHasPositiveValutazioneNeedle(staffDoc, [
        "griglia attività/condotta",
        "valutazione positiva da griglia",
      ])
    ) {
      return true;
    }
    return Boolean(
      findLogForReasonNeedlesSince(
        staffDoc,
        ["griglia attività/condotta", "valutazione positiva da griglia"],
        "positive",
        since,
      ),
    );
  }
  return false;
}

function shouldSkipManualResocontoVn(staffDoc?, resocontoWeekKey?, staffRoleId?, reason?) {
  const reasonNorm = String(reason || "").toLowerCase();
  const since = getResocontoCycleMessagesSince();
  if (reasonNorm.includes("limiti settimanali")) {
    if (hasStaffLimitsValutazioneForCycle(staffDoc, resocontoWeekKey, staffRoleId)) return true;
    return Boolean(
      findLogForReasonNeedlesSince(
        staffDoc,
        ["limiti settimanali non raggiunti", "limiti settimanali non rispettati"],
        "negative",
        since,
      ),
    );
  }
  if (reasonNorm.includes("griglia")) {
    if (
      staffHasNegativeValutazioneNeedle(staffDoc, [
        "griglia attività/condotta",
        "valutazione negativa da griglia",
      ])
    ) {
      return true;
    }
    return Boolean(
      findLogForReasonNeedlesSince(
        staffDoc,
        ["griglia attività/condotta", "valutazione negativa da griglia"],
        "negative",
        since,
      ),
    );
  }
  return false;
}

function normalizePendingManualActions(pendingManualActions?) {
  const rows = Array.isArray(pendingManualActions) ? pendingManualActions : [];
  const seen = new Set();
  const normalized = [];
  for (const row of rows) {
    const actionKey = String(row?.actionKey || "").trim();
    const reason = String(row?.reason || "").trim();
    if (!actionKey || !reason) continue;
        const dedupe = `${actionKey}::${reason.toLowerCase()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    normalized.push({ actionKey, reason });
  }
  return normalized;
}

function resolveResocontoWeekKey(now = new Date()) {
  const pexSkipWindow = getCurrentResocontoPexWeekWindowUtc(now);
  const closingPartsForResocontoKey = getRomeDateParts(pexSkipWindow.windowEndExclusive);
  return `${closingPartsForResocontoKey.year}-${String(closingPartsForResocontoKey.month).padStart(2, "0")}-${String(closingPartsForResocontoKey.day).padStart(2, "0")}`;
}

function getResocontoWeekRangeFromWeekKey(weekKey?) {
  const raw = String(weekKey || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const sundayStart = createUtcFromRomeLocal(y, mo, d, 0, 0, 0);
  const weekStart = new Date(sundayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const weekEnd = createUtcFromRomeLocal(y, mo, d, RESOCONTO_CLOSE_HOUR_ROME, 0, 0);
  return { weekStart, weekEnd };
}

function serializeCostanzaChart(overview?) {
  const chart = Array.isArray(overview?.chart) ? overview.chart : [];
  return chart
    .slice(-7)
    .map((p?) => ({
      dayKey: String(p?.dayKey || "").trim(),
      text: Math.max(0, Math.floor(Number(p?.text) || 0)),
      voiceSeconds: Math.max(0, Math.floor(Number(p?.voiceSeconds) || 0)),
    }))
    .filter((p?) => p.dayKey)
    .sort((a?, b?) => String(a.dayKey).localeCompare(String(b.dayKey)));
}

function buildStaffResocontoAzioneDisplay({
  staffDoc,
  staffRoleId,
  resocontoWeekKey,
  graceNewStaffRole,
  overviewUnavailable,
  inPauseDuringWeek,
  currentlyInPause,
  endedPauseDuringWeek,
  activityGrade,
  behaviorGrade,
  reachedWeeklyLimits,
  reachedDoubleWeeklyLimits,
  canEvaluateWeeklyLimits,
  metWeeklySanctionLimit,
  pexedInWeek = false,
  member = null,
}) {
  if (graceNewStaffRole) {
    return { display: "Nulla — nuovo in staff", actionKey: "nl", isNulla: true, pendingManualActions: [] };
  }
  if (currentlyInPause) {
    return { display: "Nulla — in pausa", actionKey: "nl", isNulla: true, pendingManualActions: [] };
  }
    if (endedPauseDuringWeek) {
    return { display: "Nulla — rientrato da pausa", actionKey: "nl", isNulla: true, pendingManualActions: [] };
  }
  if (inPauseDuringWeek) {
    return { display: "Nulla — pausa nella settimana", actionKey: "nl", isNulla: true, pendingManualActions: [] };
  }
  if (overviewUnavailable) {
    return { display: "Nulla — stats non disponibili", actionKey: "nl", isNulla: true, pendingManualActions: [] };
  }

  const parts = [];
  const pendingManualActions = [];
  let actionKey = "nl";

  const pushPart = (label?) => {
    if (!label || parts.includes(label)) return;
    parts.push(label);
  };

  if (canEvaluateWeeklyLimits) {
    const limitsByBot = hasStaffLimitsValutazioneForCycle(staffDoc, resocontoWeekKey, staffRoleId);
    if (reachedDoubleWeeklyLimits) {
      pushPart(formatValutazioneLabel("positive", limitsByBot, "limiti settimanali superati almeno del doppio"));
      if (!limitsByBot) {
        pushPendingManualAction(
          pendingManualActions,
          "vp",
          "Limiti settimanali superati almeno del doppio.",
        );
      }
    } else if (reachedWeeklyLimits) {
      /* Solo 1×: limiti ok, ma VP solo dal doppio (o da altri compiti). */
      pushPart("Limiti settimanali rispettati (nessuna VP: serve almeno il doppio)");
    } else if (!inPauseDuringWeek) {
      pushPart(formatValutazioneLabel("negative", limitsByBot, "limiti settimanali non raggiunti"));
      if (!limitsByBot) {
        pushPendingManualAction(
          pendingManualActions,
          "vn",
          "Limiti settimanali non raggiunti.",
        );
      }
    }
  }

  if (metWeeklySanctionLimit) {
    const sanctionsByBot = hasStaffSanctionsValutazioneForCycle(staffDoc, resocontoWeekKey, staffRoleId);
        if (!parts.some((part?) => /compito sanzioni/i.test(part))) {
      pushPart(formatValutazioneLabel("positive", sanctionsByBot, "compito sanzioni completato"));
    }
    if (!sanctionsByBot) {
      pushPendingManualAction(
        pendingManualActions,
        "vp",
        "Compito sanzioni completato.",
      );
    }
  }

  const gradeAction = computeStaffAction(
    activityGrade,
    behaviorGrade,
    pexedInWeek,
    staffDoc?.positiveCount,
    staffDoc?.negativeCount,
  );

  if (gradeAction === "Pex" || gradeAction === "Depex") {
      } else if (gradeAction === "Valutazione Positiva") {
    if (!parts.some((part?) => part.startsWith("Valutazione Positiva"))) {
      pushPart(formatValutazioneLabel("positive", false, "griglia attività/condotta"));
      pushPendingManualAction(
        pendingManualActions,
        "vp",
        "Valutazione positiva da griglia attività/condotta.",
      );
    }
  } else if (gradeAction === "Valutazione Negativa") {
    if (!parts.some((part?) => part.startsWith("Valutazione Negativa"))) {
      pushPart(formatValutazioneLabel("negative", false, "griglia attività/condotta"));
      pushPendingManualAction(
        pendingManualActions,
        "vn",
        "Valutazione negativa da griglia attività/condotta.",
      );
    }
  }

  const resolvedPendingManualActions = normalizePendingManualActions(pendingManualActions).filter(
    (row?) => row.actionKey !== "px" && row.actionKey !== "dp",
  );
  if (resolvedPendingManualActions.length === 1) {
    actionKey = resolvedPendingManualActions[0].actionKey;
  } else if (resolvedPendingManualActions.length > 1) {
    actionKey = "batch";
  }

  if (!parts.length) {
    if (endedPauseDuringWeek) {
      return { display: "Nulla — rientrato da pausa", actionKey: "nl", isNulla: true, pendingManualActions: [] };
    }
    if (inPauseDuringWeek) {
      return { display: "Nulla — pausa nella settimana", actionKey: "nl", isNulla: true, pendingManualActions: [] };
    }
    return { display: "Nulla", actionKey: "nl", isNulla: true, pendingManualActions: [] };
  }

  return {
    display: parts.join(" + "),
    actionKey,
    isNulla: false,
    pendingManualActions: resolvedPendingManualActions,
  };
}

function wasPmPexedInWeek(staffDoc?, weekStart?) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const weekStartMs = Number(weekStart.getTime());
  const pmRoleId = String(IDs.roles.PartnerManager || "");
  if (!pmRoleId) return false;
  return history.some((row?) => {
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    if (when.getTime() < weekStartMs) return false;
    return String(row?.newRole || "") === pmRoleId;
  });
}

function wasPromotedToRoleInLastDays(staffDoc?, roleId?, days?, now = new Date()) {
  const targetRoleId = String(roleId || "");
  if (!targetRoleId) return false;
  const safeDays = Math.max(1, Math.floor(toSafeNumber(days)));
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const thresholdMs = now.getTime() - safeDays * 24 * 60 * 60 * 1000;
  return history.some((row?) => {
    if (String(row?.newRole || "") !== targetRoleId) return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    return when.getTime() >= thresholdMs;
  });
}

function wasPromotedToRoleInWindow(staffDoc?, roleId?, windowStart?, windowEndExclusive?) {
  const targetRoleId = String(roleId || "");
  if (!targetRoleId || !windowStart || !windowEndExclusive) return false;
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const t0 = windowStart.getTime();
  const t1 = windowEndExclusive.getTime();
  return history.some((row?) => {
    if (String(row?.newRole || "") !== targetRoleId) return false;
    if (!isStaffRolesHistoryPexRow(row)) return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    const ms = when.getTime();
    return ms >= t0 && ms < t1;
  });
}

function wasFirstStaffPromotionFromMemberInWindow(staffDoc?, roleId?, windowStart?, windowEndExclusive?) {
  const memberRoleId = String(IDs.roles.Member || "").trim();
  if (!windowStart || !windowEndExclusive) return false;
  const staffLadderRoleIds = new Set(STAFF_ROLE_PRIORITY.map((id?) => String(id)).filter(Boolean));
  const pmRoleId = String(IDs.roles.PartnerManager || "").trim();
  const t0 = windowStart.getTime();
  const t1 = windowEndExclusive.getTime();

  /* resoNewStaffGrace2: grace SOLO ingresso vero in staff
     - Member → qualsiasi ruolo staff/PM
     - PM → ladder staff (Helper+)
     NON helper→mod / pex interni ladder (quelli restano soggetti ad auto-val limiti). */
  const rowIsNewStaffEntry = (row?) => {
    if (!row) return false;
    const kind = String(row?.kind || "").trim().toLowerCase();
    if (kind === "depex") return false;
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    const ms = when.getTime();
    if (ms < t0 || ms >= t1) return false;
    const newRole = String(row?.newRole || "").trim();
    const oldRole = String(row?.oldRole || "").trim();
    if (!newRole) return false;

    const newIsLadder = staffLadderRoleIds.has(newRole);
    const newIsPm = Boolean(pmRoleId && newRole === pmRoleId);
    if (!newIsLadder && !newIsPm) return false;

    /* helper→mod ecc.: old già in ladder → mai grace */
    if (oldRole && staffLadderRoleIds.has(oldRole)) return false;

    const looksLikePex =
      kind === "pex" ||
      isStaffRolesHistoryPexRow(row) ||
      (memberRoleId && oldRole === memberRoleId) ||
      (pmRoleId && oldRole === pmRoleId && newIsLadder);

    if (!looksLikePex) return false;

    if (memberRoleId && oldRole === memberRoleId) return true;
    if (pmRoleId && oldRole === pmRoleId && newIsLadder) return true;
    return false;
  };

  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  if (history.some(rowIsNewStaffEntry)) return true;
  const track = Array.isArray(staffDoc?.trackHistory) ? staffDoc.trackHistory : [];
  return track.some(rowIsNewStaffEntry);
}

function computePmAction(weeklyPartners?, pmPexedInWeek?) {
  if (pmPexedInWeek) return "Nulla";
  const partners = Math.max(0, Math.floor(toSafeNumber(weeklyPartners)));
    if (partners < PM_WEEKLY_PARTNER_MIN_FOR_OK) return "Richiamo";
  return "Nulla";
}

function resocontoAutoActor(guild?) {
  return { user: guild?.client?.user || { username: "Automazione Resoconti" }, member: null };
}

const autoValutazioneInFlight = new Map();

function autoValutazioneLockKey(guildId?, userId?, key?) {
  return `${String(guildId || "")}:${String(userId || "")}:${String(key || "")}`;
}

async function withAutoValutazioneLock(lockKey?, fn?) {
  while (autoValutazioneInFlight.has(lockKey)) {
    await autoValutazioneInFlight.get(lockKey);
  }
  let release = () => {};
  const gate = new Promise((resolve?) => {
    release = resolve;
  });
  autoValutazioneInFlight.set(lockKey, gate);
  try {
    return await fn();
  } finally {
    autoValutazioneInFlight.delete(lockKey);
    release();
  }
}

function findAutoValutazioneEntry(staff?, keyStr?) {
  if (!Array.isArray(staff?.autoValutazioni)) return null;
  return staff.autoValutazioni.find((entry?) => String(entry?.key || "") === keyStr) || null;
}

function parseResocontoReviewerTaskKey(keyStr?) {
  const m = /^resoconto_reviewer_task:([^:]+):([^:]+):(\d{17,20})$/.exec(String(keyStr || ""));
  if (!m) return null;
  return { weekKey: m[1], segment: m[2], userId: m[3] };
}

function hasResocontoReviewerTaskAutoEntry(staff, { weekKey, segment, userId, type, reason }) {
  const autoEntries = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  const reasonStr = String(reason || "");
  const seg = String(segment || "");
  const uid = String(userId || "");
  const wk = String(weekKey || "");
  return autoEntries.some((entry?) => {
    if (String(entry?.type || "") !== String(type || "")) return false;
    const parsed = parseResocontoReviewerTaskKey(String(entry?.key || ""));
    if (!parsed) return false;
    return (
      parsed.segment === seg &&
      parsed.userId === uid &&
      parsed.weekKey === wk &&
      String(entry?.reason || "") === reasonStr
    );
  });
}

function findUnlinkedPositiveLogForReasonSince(staff?, reason?, sinceDate?) {
  const reasonStr = String(reason || "");
  const sinceMs = sinceDate instanceof Date ? sinceDate.getTime() : 0;
  const reasons = Array.isArray(staff?.positiveReasons) ? staff.positiveReasons : [];
  const logs = Array.isArray(staff?.positiveValutazioni) ? staff.positiveValutazioni : [];
  const autoEntries = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  const linkedMessageIds = new Set(
    autoEntries
      .filter((entry?) => String(entry?.reason || "") === reasonStr && String(entry?.messageId || ""))
      .map((entry?) => String(entry.messageId)),
  );
  for (let idx = reasons.length - 1; idx >= 0; idx -= 1) {
    if (String(reasons[idx] || "") !== reasonStr) continue;
    const log = logs[idx];
    if (!log?.messageId || !log?.channelId) continue;
    if (linkedMessageIds.has(String(log.messageId))) continue;
    const logMs = log.createdAt ? new Date(log.createdAt).getTime() : 0;
    if (sinceMs > 0 && logMs > 0 && logMs < sinceMs) continue;
    return log;
  }
  return null;
}

async function classifyResocontoReviewerAutoEntry(guild?, entry?, expectedReason = "") {
  if (!entry) return "stale";
  if (entry.spentByTrade) return "spent";

  const parsed = parseResocontoReviewerTaskKey(String(entry?.key || ""));
  const currentWeekKey = getResocontoCycleWeekKey();
  if (parsed?.weekKey && parsed.weekKey !== currentWeekKey) return "stale";

    if (parsed?.weekKey && parsed.weekKey === currentWeekKey) {
    const channelId = String(entry.channelId || "");
    const messageId = String(entry.messageId || "");
    if (!channelId || !messageId || !guild) return "spent";

    const channel =
      guild.channels?.cache?.get(channelId) ||
      (await getClientChannelCached(guild.client, channelId).catch(() => null));
    if (!channel?.messages?.fetch) return "spent";

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return "spent";

    const expected = String(expectedReason || entry?.reason || "").trim();
    if (!expected) return "active";
    const embedDesc = String(message.embeds?.[0]?.description || "");
    const embedTitle = String(message.embeds?.[0]?.title || "");
    const blob = `${embedTitle}\n${embedDesc}\n${String(message.content || "")}`;
    return blob.includes(expected) ? "active" : "spent";
  }

  return "stale";
}

function buildResocontoCompitoClaimId(weekKey?, segment?, userId?) {
  return `${String(weekKey || "").trim()}:${String(segment || "").trim()}:${String(userId || "").trim()}`;
}

function staffHasResocontoCompitoClaim(staff?, weekKey?, segment?, userId?) {
  const id = buildResocontoCompitoClaimId(weekKey, segment, userId);
  if (!id || id.startsWith("::") || id.endsWith(":")) return false;
  const rows = Array.isArray(staff?.resocontoCompitoClaims) ? staff.resocontoCompitoClaims : [];
  if (rows.some((row?) => {
    if (row == null) return false;
    if (typeof row === "string") return row === id;
    return String(row.id || row.key || "") === id;
  })) {
    return true;
  }
    const wk = String(weekKey || "");
  const uid = String(userId || "");
  if (!wk || !uid) return false;
  return (Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : []).some((entry?) => {
    const parsed = parseResocontoReviewerTaskKey(String(entry?.key || ""));
    return Boolean(parsed && parsed.weekKey === wk && parsed.userId === uid);
  });
}

function rememberResocontoCompitoClaim(staff?, weekKey?, segment?, userId?) {
  if (!staff || typeof staff !== "object") return false;
  const id = buildResocontoCompitoClaimId(weekKey, segment, userId);
  if (!id || id.includes("::") || id.startsWith(":") || id.endsWith(":")) return false;
  if (staffHasResocontoCompitoClaim(staff, weekKey, segment, userId)) return false;
  if (!Array.isArray(staff.resocontoCompitoClaims)) staff.resocontoCompitoClaims = [];
  staff.resocontoCompitoClaims.push({
    id,
    weekKey: String(weekKey || ""),
    segment: String(segment || ""),
    userId: String(userId || ""),
    at: new Date(),
  });
    if (staff.resocontoCompitoClaims.length > 40) {
    staff.resocontoCompitoClaims = staff.resocontoCompitoClaims.slice(-40);
  }
  return true;
}

async function resocontoReviewerAutoEntryIsCurrentCycle(guild?, entry?, expectedReason = "") {
  return (await classifyResocontoReviewerAutoEntry(guild, entry, expectedReason)) === "active";
}

async function persistSpentResocontoReviewerClaim(profileDoc?, staff?, entry?) {
  if (!profileDoc || !staff || !entry || entry.spentByTrade) return false;
  entry.spentByTrade = true;
  entry.spentAt = new Date();
  entry.spentReason = entry.spentReason || "claim_preserved_after_message_change";
  entry.updatedAt = new Date();
  const parsed = parseResocontoReviewerTaskKey(String(entry.key || ""));
  if (parsed) rememberResocontoCompitoClaim(staff, parsed.weekKey, parsed.segment, parsed.userId);
  profileDoc.markModified("staff");
  await profileDoc.save();
  return true;
}

function findUnlinkedPositiveLogForReason(staff?, reason?) {
  const reasonStr = String(reason || "");
  const reasons = Array.isArray(staff?.positiveReasons) ? staff.positiveReasons : [];
  const logs = Array.isArray(staff?.positiveValutazioni) ? staff.positiveValutazioni : [];
  const autoEntries = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  const linkedMessageIds = new Set(
    autoEntries
      .filter((entry?) => String(entry?.reason || "") === reasonStr && String(entry?.messageId || ""))
      .map((entry?) => String(entry.messageId)),
  );
  for (let idx = reasons.length - 1; idx >= 0; idx -= 1) {
    if (String(reasons[idx] || "") !== reasonStr) continue;
    const log = logs[idx];
    if (!log?.messageId || !log?.channelId) continue;
    if (linkedMessageIds.has(String(log.messageId))) continue;
    return log;
  }
  return null;
}

function findUnlinkedPositiveLogForReasonNeedles(staff?, needles?) {
  return findLogForReasonNeedlesSince(staff, needles, "positive", null, { unlinkedOnly: true });
}

function findUnlinkedLogForReasonNeedlesSince(staff?, needles?, type = "positive", sinceDate = null) {
  return findLogForReasonNeedlesSince(staff, needles, type, sinceDate, { unlinkedOnly: true });
}

function findLogForReasonNeedlesSince(
  staff?,
  needles?,
  type = "positive",
  sinceDate = null,
  { unlinkedOnly = false } = {},
) {
  const normalizedNeedles = (Array.isArray(needles) ? needles : [])
    .map((needle?) => String(needle || "").toLowerCase())
    .filter(Boolean);
  if (!normalizedNeedles.length) return null;
  const reasons =
    type === "negative"
      ? Array.isArray(staff?.negativeReasons)
        ? staff.negativeReasons
        : []
      : Array.isArray(staff?.positiveReasons)
        ? staff.positiveReasons
        : [];
  const logs =
    type === "negative"
      ? Array.isArray(staff?.negativeValutazioni)
        ? staff.negativeValutazioni
        : []
      : Array.isArray(staff?.positiveValutazioni)
        ? staff.positiveValutazioni
        : [];
  const autoEntries = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  const linkedMessageIds = new Set(
    autoEntries
      .filter((entry?) => String(entry?.messageId || ""))
      .map((entry?) => String(entry.messageId)),
  );
  const sinceMs = sinceDate ? new Date(sinceDate).getTime() : 0;
  for (let idx = reasons.length - 1; idx >= 0; idx -= 1) {
    const normalized = String(reasons[idx] || "").toLowerCase();
    if (!normalizedNeedles.some((needle?) => normalized.includes(needle))) continue;
    const log = logs[idx];
    if (!log?.messageId || !log?.channelId) continue;
    if (unlinkedOnly && linkedMessageIds.has(String(log.messageId))) continue;
    if (sinceMs) {
      const createdMs = log?.createdAt ? new Date(log.createdAt).getTime() : 0;
      if (!createdMs || createdMs < sinceMs) continue;
    }
    return { log, reason: String(reasons[idx] || "") };
  }
  return null;
}

async function weeklyScopedAutoEntryIsCurrentCycle(guild?, entry?) {
  if (!entry || !guild) return false;
  const channelId = String(entry.channelId || "");
  const messageId = String(entry.messageId || "");
  if (!channelId || !messageId) return false;
  const channel =
    guild.channels?.cache?.get(channelId) ||
    (await getClientChannelCached(guild.client, channelId).catch(() => null));
  if (!channel?.messages?.fetch) return false;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return false;
  const since = getResocontoCycleMessagesSince();
  const sinceMs = since?.getTime?.() || 0;
  if (sinceMs && Number(message.createdTimestamp || 0) < sinceMs) return false;
  return true;
}

async function relinkScopedAutoValutazione(profileDoc?, staff?, keyStr?, reason?, type?, log?) {
  if (!profileDoc || !staff || !log) return null;
  if (!Array.isArray(staff.autoValutazioni)) staff.autoValutazioni = [];
  if (findAutoValutazioneEntry(staff, keyStr)) {
    return { ok: true, skipped: "exists", relinked: true };
  }
  staff.autoValutazioni.push({
    key: String(keyStr),
    type: String(type || "positive"),
    reason: String(reason || ""),
    channelId: String(log.channelId || ""),
    messageId: String(log.messageId || ""),
    createdAt: log.createdAt || new Date(),
    updatedAt: new Date(),
  });
  profileDoc.markModified("staff");
  await profileDoc.save();
  return { ok: true, skipped: "relinked", relinked: true };
}

async function relinkResocontoReviewerAutoValutazione(profileDoc?, staff?, keyStr?, reason?, type?) {
  if (type !== "positive" || !profileDoc || !staff) return null;
  const log = findUnlinkedPositiveLogForReasonSince(
    staff,
    reason,
    getResocontoCycleMessagesSince(),
  );
  if (!log) return null;
  return relinkScopedAutoValutazione(profileDoc, staff, keyStr, reason, type, log);
}

async function ensureWeeklyLimitAutoValutazione({ guild, member, key, type, reason, force = false, equivalentReasonNeedles = null }) {
  if (!guild || !member?.user || !key || !type) return { ok: false };
  const keyStr = String(key || "");
  const lockKey = autoValutazioneLockKey(guild.id, member.id, keyStr);
  return withAutoValutazioneLock(lockKey, async () => {
  const { resolveStaffValutazioniChannel } = require("../../Utils/Staff/staffChannelUtils") as typeof import("../../Utils/Staff/staffChannelUtils");
  const channel = await resolveStaffValutazioniChannel(guild, guild.client);
  
  let profileDoc = await ensureStaffProfileDoc(
    await getStaffDoc(guild.id, member.id),
    guild.id,
    member.id,
  );
  let staff = ensureStaff(profileDoc);
  if (!staff) return { ok: false, skipped: "no_staff_doc" };
  if (!Array.isArray(staff.autoValutazioni)) staff.autoValutazioni = [];
  const weeklyLimitReasons = Array.isArray(equivalentReasonNeedles)
    ? equivalentReasonNeedles
    : type === "negative"
      ? ["limiti settimanali non raggiunti", "limiti settimanali non rispettati"]
      : ["limiti settimanali completati", "limiti settimanali rispettati", "limiti settimanali superati almeno del doppio"];
  const isWeeklyLimitsKey = keyStr.startsWith("weekly_limits:");
  const isWeeklySanzioniKey = keyStr.startsWith("weekly_sanzioni:");
  const isResocontoReviewerKey = keyStr.startsWith("resoconto_reviewer_task:");
  const isWeeklyScopedKey = isWeeklyLimitsKey || isWeeklySanzioniKey || isResocontoReviewerKey;

  if (isResocontoReviewerKey && !force) {
    const parsedClaim = parseResocontoReviewerTaskKey(keyStr);
    if (
      parsedClaim &&
      staffHasResocontoCompitoClaim(staff, parsedClaim.weekKey, parsedClaim.segment, parsedClaim.userId)
    ) {
      return { ok: true, skipped: "compito_claim" };
    }
  }

  if ((isWeeklyLimitsKey || isWeeklySanzioniKey) && !force) {
            const existingWeekly = findAutoValutazioneEntry(staff, keyStr);
    if (existingWeekly) {
      if (existingWeekly.spentByTrade) {
        return { ok: true, skipped: "spent_by_trade" };
      }
      return { ok: true, skipped: "exists" };
    }
    const since = getResocontoCycleMessagesSince();
    const linked = findLogForReasonNeedlesSince(staff, weeklyLimitReasons, type, since, {
      unlinkedOnly: true,
    });
    if (linked?.log) {
      const logReason = String(linked.log?.reason || linked.reason || "").toLowerCase();
      const reasonMatchesLog = weeklyLimitReasons.some((needle?) => logReason.includes(needle));
      if (reasonMatchesLog) {
        const relinked = await relinkScopedAutoValutazione(
          profileDoc,
          staff,
          keyStr,
          linked.reason || String(reason || ""),
          type,
          linked.log,
        );
        if (relinked) return relinked;
      }
    }
  }

  if (!isWeeklyScopedKey) {
    const reasonList = type === "negative" ? staff.negativeReasons : staff.positiveReasons;
    const alreadyHasEquivalentWeeklyLimitValutazione =
      weeklyLimitReasons.length > 0 &&
      Array.isArray(reasonList) &&
      reasonList.some((entry?) => {
        const normalized = String(entry || "").toLowerCase();
        return weeklyLimitReasons.some((needle?) => normalized.includes(needle));
      });
    if (alreadyHasEquivalentWeeklyLimitValutazione) {
      return { ok: true, skipped: "equivalent_exists" };
    }
  }
  let existing = findAutoValutazioneEntry(staff, keyStr);
  if (existing?.spentByTrade && !force) {
    if (isResocontoReviewerKey) {
      const parsed = parseResocontoReviewerTaskKey(keyStr);
      if (parsed && rememberResocontoCompitoClaim(staff, parsed.weekKey, parsed.segment, parsed.userId)) {
        profileDoc.markModified("staff");
        await profileDoc.save();
      }
    }
    return { ok: true, skipped: "spent_by_trade" };
  }
  if (existing && !force && isResocontoReviewerKey) {
    const claim = await classifyResocontoReviewerAutoEntry(
      guild,
      existing,
      String(reason || ""),
    );
    if (claim === "active" || claim === "spent") {
      const parsed = parseResocontoReviewerTaskKey(keyStr);
      if (claim === "spent") {
        existing.spentByTrade = true;
        existing.spentAt = existing.spentAt || new Date();
        existing.spentReason = existing.spentReason || "claim_preserved_after_message_change";
        existing.updatedAt = new Date();
      }
      if (parsed) rememberResocontoCompitoClaim(staff, parsed.weekKey, parsed.segment, parsed.userId);
      profileDoc.markModified("staff");
      await profileDoc.save();
      return { ok: true, skipped: claim === "spent" ? "spent_by_trade" : "exists" };
    }
        staff.autoValutazioni = staff.autoValutazioni.filter(
      (entry?) => String(entry?.key || "") !== keyStr,
    );
    profileDoc.markModified("staff");
    await profileDoc.save();
    existing = null;
  }
  if (existing && !force) return { ok: true, skipped: "exists" };
  if (keyStr.startsWith("resoconto_reviewer_task:")) {
    const parsed = parseResocontoReviewerTaskKey(keyStr);
    if (parsed && hasResocontoReviewerTaskAutoEntry(staff, { ...parsed, type, reason }) && !force) {
      const existingReviewer = findAutoValutazioneEntry(staff, keyStr);
      if (existingReviewer?.spentByTrade) {
        if (rememberResocontoCompitoClaim(staff, parsed.weekKey, parsed.segment, parsed.userId)) {
          profileDoc.markModified("staff");
          await profileDoc.save();
        }
        return { ok: true, skipped: "spent_by_trade" };
      }
      const claim = await classifyResocontoReviewerAutoEntry(
        guild,
        existingReviewer,
        String(reason || ""),
      );
      if (claim === "active" || claim === "spent") {
        if (claim === "spent" && existingReviewer) {
          existingReviewer.spentByTrade = true;
          existingReviewer.spentAt = existingReviewer.spentAt || new Date();
          existingReviewer.updatedAt = new Date();
        }
        rememberResocontoCompitoClaim(staff, parsed.weekKey, parsed.segment, parsed.userId);
        profileDoc.markModified("staff");
        await profileDoc.save();
        return { ok: true, skipped: claim === "spent" ? "spent_by_trade" : "exists" };
      }
      staff.autoValutazioni = staff.autoValutazioni.filter(
        (entry?) => String(entry?.key || "") !== keyStr,
      );
      profileDoc.markModified("staff");
      await profileDoc.save();
    }
  }
  if (existing && force) {
    staff.autoValutazioni = staff.autoValutazioni.filter((entry?) => String(entry?.key || "") !== keyStr);
    profileDoc.markModified("staff");
  }

  profileDoc = await ensureStaffProfileDoc(
    await getStaffDoc(guild.id, member.id),
    guild.id,
    member.id,
  );
  staff = ensureStaff(profileDoc);
  if (!staff) return { ok: false, skipped: "no_staff_doc" };
  existing = findAutoValutazioneEntry(staff, keyStr);
  if (existing?.spentByTrade && !force) return { ok: true, skipped: "spent_by_trade" };
  if (existing && !force) return { ok: true, skipped: "exists" };

  const actor = resocontoAutoActor(guild);
  const result = type === "negative"
    ? await valutazioneNegativeAddCore(guild, profileDoc, member.user, reason, actor, channel)
    : await valutazionePositiveAddCore(profileDoc, member.user, reason, actor, channel);

  if (!result?.ok && !result?.message) {
    return { ok: false, skipped: "valutazione_post_failed" };
  }

  profileDoc = await getOrCreateStaffDoc(guild.id, member.id);
  if (!profileDoc) return { ok: false, skipped: "no_profile" };
  const freshStaff = ensureStaff(profileDoc);
  if (!Array.isArray(freshStaff.autoValutazioni)) freshStaff.autoValutazioni = [];
  if (findAutoValutazioneEntry(freshStaff, keyStr) && !force) {
    return { ok: true, skipped: "exists" };
  }
  freshStaff.autoValutazioni = freshStaff.autoValutazioni.filter(
    (entry?) => String(entry?.key || "") !== keyStr,
  );
  freshStaff.autoValutazioni.push({
    key: keyStr,
    type: String(type),
    reason: String(reason || ""),
    channelId: channel?.id ? String(channel.id) : null,
    messageId: result?.message?.id ? String(result.message.id) : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  if (isResocontoReviewerKey) {
    const parsed = parseResocontoReviewerTaskKey(keyStr);
    if (parsed) {
      rememberResocontoCompitoClaim(freshStaff, parsed.weekKey, parsed.segment, parsed.userId);
    }
  }
  profileDoc.markModified("staff");
  await profileDoc.save();
  return { ok: true, created: true, reviewerId: String(member.id || "") };
  });
}

async function hydrateStaffPausesFromWorkflowIfMissing(guildId?, userId?, staffDoc?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid || !staffDoc || typeof staffDoc !== "object") return false;
  if (!Array.isArray(staffDoc.pauses)) staffDoc.pauses = [];
  let SiteDocument;
  try {
    ({ SiteDocument } = require("../../Schemas/Community/communitySchemas"));
  } catch {
    return false;
  }
  const docs = await SiteDocument.find({
    guildId: gid,
    docType: "staff_workflow",
    workflowQueue: "pause",
    userId: uid,
    status: { $in: ["accepted", "cancelled"] },
  })
    .select({ status: 1, workflowPauseId: 1, workflowFields: 1, body: 1, reason: 1, content: 1, createdAt: 1 })
    .lean()
    .catch(() => []);
  if (!docs?.length) return false;
  let added = 0;
  for (const wf of docs) {
    const pauseId = String(wf.workflowPauseId || "").trim();
    if (!pauseId) continue;
    if (staffDoc.pauses.some((p?) => String(p?._id || "") === pauseId)) continue;
    const fields = wf.workflowFields || {};
    const from = fields.dataRichiesta || fields.start;
    const to = fields.dataRitorno || fields.end;
    if (!from || !to) continue;
    staffDoc.pauses.push({
      _id: pauseId,
      dataRichiesta: String(from),
      dataRitorno: String(to),
      motivazione: String(wf.body || wf.reason || wf.content || "").slice(0, 500),
      giorniUsati: Number(fields.giorniScalati) || 0,
      giorniAggiuntivi: 0,
      ruoloRichiesto: String(fields.ruoloRichiesto || fields.ruoloTrack || "Staff"),
      ruolo: String(fields.ruoloLabel || fields.ruoloTrack || "Staff"),
      status: String(wf.status || "accepted"),
      cancelledAt: String(wf.status) === "cancelled" ? new Date() : null,
      createdAt: wf.createdAt || new Date(),
    });
    added += 1;
  }
  return added > 0;
}

async function applyWeeklyStaffAutoValutazioniForMember({
  guild,
  member,
  staffDoc,
  staffRoleId,
  overview,
  resocontoWeekKey,
  sanctionCountByModId,
  graceNewStaffRole,
  weekStart,
  weekEnd,
  force = false,
  skipLimitAutovalutazione = false,
  skipSanctionAutovalutazione = false,
}) {
  const userId = String(member?.id || "");
  const limits = STAFF_ACTIVITY_LIMITS[String(staffRoleId)];
  const overviewUnavailable = overviewLooksLikeEmptyFallback(overview);
  const canEvaluateWeeklyLimits =
    Boolean(limits) && !graceNewStaffRole && !overviewUnavailable;

  const d7 = overview?.windows?.d7;
  const weeklyMessages = Math.max(0, Math.floor(toSafeNumber(d7?.text ?? 0)));
  const weeklyVoiceSeconds = Math.max(0, Math.floor(toSafeNumber(d7?.voiceSeconds ?? 0)));
  const weeklyVoiceHours = weeklyVoiceSeconds / 3600;
  const limitsEvaluation = limits
    ? evaluateStaffWeeklyLimitsWithSwap(weeklyMessages, weeklyVoiceHours, limits)
    : null;
  const doubleLimitsEvaluation = limits
    ? evaluateStaffWeeklyLimitsAtMultiplier(
        weeklyMessages,
        weeklyVoiceHours,
        limits,
        STAFF_LIMITS_POSITIVE_MULTIPLIER,
      )
    : null;
  const tripleLimitsEvaluation = limits
    ? evaluateStaffWeeklyLimitsAtMultiplier(weeklyMessages, weeklyVoiceHours, limits, 3)
    : null;
  const reachedWeeklyLimits = Boolean(canEvaluateWeeklyLimits && limitsEvaluation?.reached);
  const reachedDoubleWeeklyLimits = Boolean(
    canEvaluateWeeklyLimits && doubleLimitsEvaluation?.reached,
  );
  const reachedTripleWeeklyLimits = Boolean(
    canEvaluateWeeklyLimits && tripleLimitsEvaluation?.reached,
  );
    await hydrateStaffPausesFromWorkflowIfMissing(guild?.id, userId, staffDoc).catch(() => null);
  const inPauseAtLeastOneDay = hadPauseAtLeastOneDayDuringWeek(
    staffDoc,
    weekStart,
    weekEnd,
    "Staff",
  );

  let limitsResult: Record<string, any> = { ok: true, skipped: skipLimitAutovalutazione ? "skip_context" : "ineligible" };
  if (canEvaluateWeeklyLimits && !skipLimitAutovalutazione) {
            const shouldApplyPositive =
      reachedDoubleWeeklyLimits && !inPauseAtLeastOneDay && !graceNewStaffRole;
    const shouldApplyNegative =
      !reachedWeeklyLimits && !inPauseAtLeastOneDay && !graceNewStaffRole;
    limitsResult = {
      ok: true,
      skipped: inPauseAtLeastOneDay ? "pause_week" : "ineligible",
    };
    if (shouldApplyPositive) {
      limitsResult = await ensureWeeklyLimitAutoValutazione({
        guild,
        member,
        key: `weekly_limits:${resocontoWeekKey}:${staffRoleId}`,
        type: "positive",
        reason: "Limiti settimanali superati almeno del doppio.",
        equivalentReasonNeedles: [
          "limiti settimanali superati almeno del doppio",
        ],
        force,
      }).catch((err?) => {
        global.logger?.warn?.(
          "[WEEKLY STAFF RESOCONTO] weekly limit valutazione failed:",
          userId,
          err?.message || err,
        );
        return { ok: false };
      });
    } else if (shouldApplyNegative) {
      limitsResult = await ensureWeeklyLimitAutoValutazione({
        guild,
        member,
        key: `weekly_limits:${resocontoWeekKey}:${staffRoleId}`,
        type: "negative",
        reason: "Limiti settimanali non raggiunti.",
        force,
      }).catch((err?) => {
        global.logger?.warn?.(
          "[WEEKLY STAFF RESOCONTO] weekly limit valutazione failed:",
          userId,
          err?.message || err,
        );
        return { ok: false };
      });
    } else if (!reachedWeeklyLimits && graceNewStaffRole) {
      limitsResult = { ok: true, skipped: "grace_new_role" };
    } else if (reachedWeeklyLimits && !reachedDoubleWeeklyLimits) {
      limitsResult = { ok: true, skipped: "below_double_limits" };
    }
  }

  let sanctionsResult = null;
  const sanctionLimit = STAFF_SANCTION_LIMITS[String(staffRoleId)];
  const weeklySanctions = sanctionCountByModId?.get?.(userId) || 0;
  const metWeeklySanctionLimit =
    sanctionLimit != null && weeklySanctions >= sanctionLimit;
  if (metWeeklySanctionLimit && !skipSanctionAutovalutazione && !graceNewStaffRole) {
    sanctionsResult = await ensureWeeklyLimitAutoValutazione({
      guild,
      member,
      key: `weekly_sanzioni:${resocontoWeekKey}:${staffRoleId}`,
      type: "positive",
      reason: "Compito sanzioni completato.",
      equivalentReasonNeedles: ["compito sanzioni completato"],
      force,
    }).catch((err?) => {
      global.logger?.warn?.(
        "[WEEKLY STAFF RESOCONTO] weekly sanctions valutazione failed:",
        userId,
        err?.message || err,
      );
      return { ok: false };
    });
  } else if (graceNewStaffRole && metWeeklySanctionLimit) {
    sanctionsResult = { ok: true, skipped: "grace_new_role" };
  }

  if (reachedTripleWeeklyLimits && !inPauseAtLeastOneDay && guild?.id && userId) {
    try {
      const { tryAutoSubmitCompito } = require("../../Utils/Web/siteStaffCompitiAutoComplete") as typeof import("../../Utils/Web/siteStaffCompitiAutoComplete");
      await tryAutoSubmitCompito(global.botClient || guild?.client, {
        guildId: guild.id,
        userId,
        taskId: "limits_triple",
        evidence: `Limiti ×3 raggiunti (${weeklyMessages} msg / ${weeklyVoiceHours.toFixed(1)}h) · ${resocontoWeekKey}`,
      });
    } catch (err) {
      global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] compiti limits_triple:", err?.message || err);
    }
  }

  return {
    limits: Boolean(limitsResult?.created),
    sanctions: Boolean(sanctionsResult?.created),
    skippedLimits: limitsResult?.skipped || null,
    skippedSanctions: sanctionsResult?.skipped || null,
  };
}

function staffActionToKey(action?) {
  if (action === "Pex") return "px";
  if (action === "Depex") return "dp";
  if (action === "Valutazione Positiva") return "vp";
  if (action === "Valutazione Negativa") return "vn";
  return "nl";
}

function pmActionToKey(action?) {
  if (action === "Depex") return "dp";
  if (action === "Richiamo") return "rc";
  return "nl";
}

function buildResocontoButtons(kind?, userId?, actionKey?, roleId = null) {
  const {
    isDiscordWorkflowUiEnabled,
    buildInboxManageLinkRow,
  } = require("../../Utils/Web/discordWorkflowUiGate") as typeof import("../../Utils/Web/discordWorkflowUiGate");
  if (!isDiscordWorkflowUiEnabled()) {
    return buildInboxManageLinkRow("resoconti");
  }
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

function formatThreadDateTime(value?) {
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

function getLatestAcceptedPause(staffDoc?) {
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

function getPexHistoryRows(staffDoc?) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  return history
    .filter((row?) => isStaffRolesHistoryPexRow(row))
    .map((row?) => {
      const when = row?.date ? new Date(row.date) : null;
      if (!when || Number.isNaN(when.getTime())) return null;
      return {
        oldRole: String(row?.oldRole || ""),
        newRole: String(row?.newRole || ""),
        when,
      };
    })
    .filter(Boolean)
    .sort((a?, b?) => b.when.getTime() - a.when.getTime());
}

function roleLabelById(guild?, roleId?) {
  const id = String(roleId || "");
  if (!id) return "Sconosciuto";
  return guild?.roles?.cache?.get(id)?.name || `<@&${id}>`;
}

async function sendResocontoThreadSummary(thread?, guild?, staffDoc?) {
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

async function filterResocontoReviewersNotInPause(guildId?, reviewerUserIds?) {
  const gid = String(guildId || "").trim();
  const ids = [...new Set(
    (Array.isArray(reviewerUserIds) ? reviewerUserIds : [])
      .map((id?) => String(id || "").trim())
      .filter((id?) => /^\d{16,22}$/.test(id)),
  )];
  if (!gid || !ids.length) return [];

  const docs = await ActivityUserProfile.find(
    { guildId: gid, userId: { $in: ids } },
    { userId: 1, "staff.pauses": 1 },
  )
    .lean()
    .catch(() => []);

  const pausesByUserId = new Map();
  for (const doc of docs || []) {
    pausesByUserId.set(String(doc?.userId || ""), doc?.staff?.pauses);
  }

  const today = getTodayUtc();
  return ids.filter((uid?) => !hasActiveAcceptedStaffPause(pausesByUserId.get(uid), today));
}

async function createResocontoThread(message?, userId?, userLabel = null, staffDoc = null, segment = null, staffRoleId = null) {
  try {
    const { isDiscordWorkflowUiEnabled } = require("../../Utils/Web/discordWorkflowUiGate") as typeof import("../../Utils/Web/discordWorkflowUiGate");
    if (!isDiscordWorkflowUiEnabled()) return;
  } catch (_) {}
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
  const reviewerUserIds = getResocontoReviewerUserIdsForSegment(segment, staffRoleId);
  if (guild && reviewerUserIds.length) {
    const activeReviewers = await filterResocontoReviewersNotInPause(guild.id, reviewerUserIds);
    if (activeReviewers.length) {
      await addUserIdsToThread(thread, activeReviewers, { logTag: "[WEEKLY STAFF RESOCONTO thread]" });
    }
  }
  for (const roleId of getResocontoReviewerRoleIds()) {
    await addAllRoleMembersToThread(thread, roleId, {
      logTag: "[WEEKLY STAFF RESOCONTO thread]",
    }).catch(() => null);
  }

  await sendResocontoThreadSummary(thread, message?.guild, staffDoc);
}

function countPmWeeklyPartners(staffDoc?, weekStart?, weekEnd?) {
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

async function getWeeklySanctionCountByMod(guildId?, weekStart?, weekEnd?) {
  return aggregateSanctionsByModInWeek(guildId, weekStart, weekEnd, SANCTION_ACTIONS);
}

async function resolveChannel(client?, channelId?) {
  if (!channelId) return null;
  return client.channels.cache.get(channelId) ||
    (await getClientChannelCached(client, String(channelId))) ||
    (await client.channels.fetch(String(channelId)).catch(() => null));
}

async function scanResocontoMessagesSince(channel?, sinceMs?, predicate?) {
  if (!channel?.messages?.fetch || typeof predicate !== "function") return false;
  let before = null;
  let scanned = 0;
  while (scanned < RESOCONTO_MESSAGE_SCAN_MAX) {
    const batch = await channel.messages
      .fetch({
        limit: RESOCONTO_MESSAGE_SCAN_PAGE,
        ...(before ? { before } : {}),
      })
      .catch(() => null);
    if (!batch?.size) break;
    for (const message of batch.values()) {
      scanned += 1;
      const ts = Number(message.createdTimestamp || 0);
      if (sinceMs && ts && ts < sinceMs) continue;
      if (predicate(message, String(message.content || ""))) return true;
    }
    const oldest = batch.last();
    if (sinceMs && oldest && Number(oldest.createdTimestamp || 0) < sinceMs) break;
    before = oldest?.id || null;
    if (!before || batch.size < RESOCONTO_MESSAGE_SCAN_PAGE) break;
  }
  return false;
}

function messageLooksLikeStaffResocontoForUser(content?, userId?, roleId = "") {
  const text = String(content || "");
  if (!text.includes("**Staffer:**")) return false;
  const uid = String(userId || "").trim();
  if (!text.includes(`<@${uid}>`) && !text.includes(`<@!${uid}>`)) return false;
  const rid = String(roleId || "").trim();
  if (rid && text.includes(`<@&${rid}>`)) return true;
  return STAFF_ROLE_PRIORITY.some((id?) => id && text.includes(`<@&${String(id)}>`));
}

async function recentStaffResocontoMessageExists(channel?, userId?, roleId?, sinceDate?) {
  const uid = String(userId || "").trim();
  const sinceMs = sinceDate instanceof Date ? sinceDate.getTime() : 0;
  if (!uid) return false;
  return scanResocontoMessagesSince(
    channel,
    sinceMs,
    (_message?, content?) => messageLooksLikeStaffResocontoForUser(content, uid, roleId),
  );
}

async function recentPmResocontoMessageExists(channel?, userId?, sinceDate?) {
  const uid = String(userId || "").trim();
  const sinceMs = sinceDate instanceof Date ? sinceDate.getTime() : 0;
  if (!uid) return false;
  return scanResocontoMessagesSince(channel, sinceMs, (_message?, content?) => {
    const text = String(content || "");
    if (!text.includes("**Partner Manager:**")) return false;
    return text.includes(`<@${uid}>`) || text.includes(`<@!${uid}>`);
  });
}

async function sendResocontoMessageWithRetry(channel?, payload?, context: Record<string, any> = {}) {
  if (!channel?.send) return null;
  const first = await channel.send(payload).catch((err?) => {
    global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] send failed:", {
      userId: context.userId || null,
      segment: context.segment || null,
      err: err?.message || String(err),
      code: err?.code,
    });
    return null;
  });
  if (first) return first;
  await new Promise((resolve?) => setTimeout(resolve, 1500));
  return channel.send(payload).catch((err?) => {
    global.logger?.error?.("[WEEKLY STAFF RESOCONTO] send retry failed:", {
      userId: context.userId || null,
      segment: context.segment || null,
      err: err?.message || String(err),
      code: err?.code,
    });
    return null;
  });
}

async function hydrateGuildMembersForResoconto(guild?, segment?) {
  if (!guild?.members?.fetch) return false;
  const jobsDebug = String(process.env.DEBUG_JOBS || "").trim() === "1";
  const guildId = String(guild.id || "");
  const now = Date.now();
  const state = resocontoMemberHydrationStateByGuild.get(guildId);
  if (
    state?.lastOkAt &&
    now - Number(state.lastOkAt || 0) < RESOCONTO_MEMBER_HYDRATE_TTL_MS &&
    isGuildMemberCacheLikelyComplete(guild)
  ) {
    return true;
  }
  if (state?.promise) {
    return state.promise;
  }

  const promise = (async () => {
    let ok = false;
    await fetchGuildMembersRespectingGatewayRateLimit(guild, {
      maxAttempts: 12,
      onRateLimit: (waitMs?, attempt?, maxAttempts?) => {
        if (!jobsDebug) return;
        global.logger?.info?.(`[WEEKLY STAFF RESOCONTO] Member fetch rate-limited (${segment || "unknown"}), retry ${attempt}/${maxAttempts} in ~${Math.round(waitMs / 1000)}s.`);
      },
    })
      .then(() => {
        ok = true;
      })
      .catch((err?) => {
        global.logger?.warn?.(
          `[WEEKLY STAFF RESOCONTO] Member fetch failed (${segment || "unknown"}), trying paged fetch:`,
          err?.message || err,
        );
      });

    if (!isGuildMemberCacheLikelyComplete(guild)) {
      const fetched = await fetchGuildMembersByPagesForResoconto(guild, segment);
      ok = ok || fetched > 0;
    }

    if (ok || isGuildMemberCacheLikelyComplete(guild)) {
      resocontoMemberHydrationStateByGuild.set(guildId, { lastOkAt: Date.now(), promise: null });
      return true;
    }

    resocontoMemberHydrationStateByGuild.set(guildId, { lastOkAt: 0, promise: null });
    return false;
  })()
    .catch((err?) => {
      global.logger?.warn?.(`[WEEKLY STAFF RESOCONTO] Member hydration failed (${segment || "unknown"}):`, err?.message || err);
      resocontoMemberHydrationStateByGuild.set(guildId, { lastOkAt: 0, promise: null });
      return false;
    });

  resocontoMemberHydrationStateByGuild.set(guildId, { lastOkAt: Number(state?.lastOkAt || 0), promise });
  return promise;
}

async function runWeeklyStaffResocontoSegment(client?, segment?, opts: Record<string, any> = {}) {
  const allowed = new Set(["pm", "helper", "mod", "senior_moderator", "director"]);
  if (!allowed.has(segment)) return { sent: 0, eligible: 0, segment };
  const jobsDebug = String(process.env.DEBUG_JOBS || "").trim() === "1";
  const targetUserId = String(opts.userId || opts.targetUserId || "").trim();
  const forceTarget = Boolean(opts.force && /^\d{16,20}$/.test(targetUserId));
  const ignorePostedState = Boolean(opts.ignorePostedState);

  const {
    isDiscordWorkflowChannelPostsEnabled,
    isDiscordStaffChannelPostsEnabled,
    newSiteWorkflowMessageId,
  } = require("../../Utils/Web/discordWorkflowUiGate") as typeof import("../../Utils/Web/discordWorkflowUiGate");
  const discordPostsEnabled =
    isDiscordStaffChannelPostsEnabled() && isDiscordWorkflowChannelPostsEnabled();

  const guildId = String(IDs.guilds?.main || "");
  const channelId = String(IDs.channels?.resocontiStaff || "");
  if (!guildId) return { sent: 0, eligible: 0, segment };

  const guild = await getClientGuildCached(client, guildId);
  if (!guild) return { sent: 0, eligible: 0, segment };
  await hydrateGuildMembersForResoconto(guild, segment);

  const resocontoExcludeVoiceChannels = collectResocontoVoiceExcludeIds(guild);
  const resocontoOverviewVoiceExclude =
    resocontoExcludeVoiceChannels.size > 0 ? resocontoExcludeVoiceChannels : null;
  const now = new Date();
  const resocontoScope = buildResocontoOverviewOptions(guild, now);

  const channel =
    discordPostsEnabled && channelId ? await resolveChannel(client, channelId) : null;
  const useDiscordPosts = Boolean(discordPostsEnabled && channel?.isTextBased?.());

  const { weekStart, weekEnd } = getPmResocontoWindow(now);
  const pexSkipWindow = getCurrentResocontoPexWeekWindowUtc(now);
  const nowRomeParts = getRomeDateParts(now);
  const resocontoMessageSince = createUtcFromRomeLocal(nowRomeParts.year, nowRomeParts.month, nowRomeParts.day, 0, 0, 0);
  const closingPartsForResocontoKey = getRomeDateParts(pexSkipWindow.windowEndExclusive);
  const resocontoWeekKey = `${closingPartsForResocontoKey.year}-${String(closingPartsForResocontoKey.month).padStart(2, "0")}-${String(closingPartsForResocontoKey.day).padStart(2, "0")}`;
  const staffResocontoPostedIds = await loadStaffResocontoPostedIds(guildId, resocontoWeekKey);
  const staffDocs = await ActivityUserProfile.find({ guildId, staff: { $exists: true } }, { userId: 1, staff: 1 }).lean().catch(() => []);

  async function hasSiteResocontoThisWeek(userId?, kind?) {
    try {
      const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
      const doc = await SiteDocument.findOne({
        docType: SITE_DOCUMENT_TYPE.STAFF_WORKFLOW,
        guildId,
        workflowQueue: "resoconti",
        userId: String(userId),
        workflowKind: String(kind),
        workflowWeekKey: resocontoWeekKey,
      })
        .select({ _id: 1 })
        .lean()
        .catch(() => null);
      return Boolean(doc);
    } catch {
      return false;
    }
  }

  const wantStaffForSegment =
    segment === "helper" ||
    segment === "mod" ||
    segment === "senior_moderator" ||
    segment === "director"
      ? String(
          segment === "helper"
            ? IDs.roles.Helper
            : segment === "mod"
              ? IDs.roles.Mod
              : segment === "senior_moderator"
                ? IDs.roles.SeniorModerator
                : IDs.roles.Director,
        )
      : null;

  const idsFromStaffDocs = (Array.isArray(staffDocs) ? staffDocs : [])
    .map((row?) => String(row?.userId || ""))
    .filter(Boolean);
  const idsFromGuildRoles = collectResocontoDiscordMemberIdsForSegment(guild, segment);
  const knownStaffUserIds = forceTarget
    ? [targetUserId]
    : Array.from(new Set([...idsFromStaffDocs, ...idsFromGuildRoles]));
  if (!knownStaffUserIds.length) return { sent: 0, eligible: 0, segment };

  const fetchedMembers = await Promise.all(knownStaffUserIds.map((userId?) => getGuildMemberCached(guild, userId)),);

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

  const staffMap = new Map((Array.isArray(staffDocs) ? staffDocs : []).map((row?) => [String(row.userId), row.staff || {}]));

  const staffUserIds = candidateMembers.filter((m?) => resolveStaffRole(m)).map((m?) => String(m.id));
  const overviewResults = await Promise.all(
    staffUserIds.map((uid?) =>
      getUserOverviewStats(
        guildId,
        uid,
        7,
        resocontoOverviewVoiceExclude,
        resocontoScope,
      ).catch((err?) => {
        global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] overview stats failed:", uid, err?.message || err);
        return { __error: true };
      })),
  );
  const overviewMap = new Map(staffUserIds.map((id?, i?) => [id, overviewResults[i] || null]),);
  const sanctionCountByModId = await getWeeklySanctionCountByMod(guildId, weekStart, weekEnd);
  let sentCount = 0;
  let eligibleCount = 0;
  let completedCount = 0;
  const skippedCounts = {
    alreadyPosted: 0,
    pexWindow: 0,
    sendFailed: 0,
  };

  for (const member of candidateMembers) {
    const userId = String(member.id);
    let staffDoc = staffMap.get(userId) || null;
    const staffRoleId = resolveStaffRole(member);
    const graceNewStaffRole =
      Boolean(staffRoleId) &&
      wasFirstStaffPromotionFromMemberInWindow(staffDoc, staffRoleId, pexSkipWindow.windowStart, pexSkipWindow.windowEndExclusive);
    const pmPexedInCurrentWeek = wasPromotedToRoleInWindow(
      staffDoc,
      IDs.roles.PartnerManager,
      pexSkipWindow.windowStart,
      pexSkipWindow.windowEndExclusive,
    );
    const skipForStaffPexInWindow = shouldSkipResocontoForPexInCalendarWeek(
      staffDoc,
      pexSkipWindow.windowStart,
      pexSkipWindow.windowEndExclusive,
    );
    const wasPexedResocontoDay = wasPexedOnResocontoDay(staffDoc, now);

    const matchStaffSegment =
      wantStaffForSegment && staffRoleId && String(staffRoleId) === wantStaffForSegment;
    if (matchStaffSegment) eligibleCount += 1;

    const alreadyHadStaffResocontoThisCycle =
      !forceTarget &&
      !ignorePostedState &&
      staffRoleId &&
      (
        hadStaffRoleResocontoPostedThisCycle(staffResocontoPostedIds, staffRoleId, userId) ||
        (useDiscordPosts
          ? await recentStaffResocontoMessageExists(channel, userId, staffRoleId, resocontoMessageSince)
          : await hasSiteResocontoThisWeek(userId, "s"))
      );
    const shouldSkipStaffResoconto =
      matchStaffSegment &&
      (wasPexedResocontoDay || alreadyHadStaffResocontoThisCycle);
    const skipLimitAutovalutazione = shouldSkipLimitAutovalutazioniForStaffMember({
      graceNewStaffRole,
      wasPexedResocontoDay,
    });
    const skipSanctionAutovalutazione = shouldSkipSanctionAutovalutazioniForStaffMember({
      graceNewStaffRole,
      wasPexedResocontoDay,
    });
    if (matchStaffSegment && alreadyHadStaffResocontoThisCycle) completedCount += 1;
    if (matchStaffSegment && alreadyHadStaffResocontoThisCycle) skippedCounts.alreadyPosted += 1;
    if (matchStaffSegment && wasPexedResocontoDay) skippedCounts.pexWindow += 1;
    if (matchStaffSegment && skipForStaffPexInWindow && jobsDebug) {
      global.logger?.info?.(`[WEEKLY STAFF RESOCONTO] Staff pex in calendar week: ${userId} segment=${segment}`);
    }

    if (matchStaffSegment && !shouldSkipStaffResoconto) {
      const overview = overviewMap.get(userId);
      const overviewUnavailable = overviewLooksLikeEmptyFallback(overview);
      if (overviewUnavailable) {
        if (jobsDebug) {
          global.logger?.info?.(`[WEEKLY STAFF RESOCONTO] Staff overview unavailable: ${userId} (${member.user?.tag || member.user?.username || "unknown"}) segment=${segment}`);
        }
      }
      const d7 = overview?.windows?.d7;
      const weeklyMessages = Math.max(0, Math.floor(toSafeNumber(d7?.text ?? 0)),);
      const weeklyVoiceSeconds = Math.max(0, Math.floor(toSafeNumber(d7?.voiceSeconds ?? 0)),);
      const weeklyVoiceHours = weeklyVoiceSeconds / 3600;
      const limits = STAFF_ACTIVITY_LIMITS[String(staffRoleId)];
      const canEvaluateWeeklyLimits =
        Boolean(limits) &&
        !graceNewStaffRole &&
        !overviewUnavailable;
      const limitsEvaluation = limits
        ? evaluateStaffWeeklyLimitsWithSwap(weeklyMessages, weeklyVoiceHours, limits)
        : null;
      const doubleLimitsEvaluation = limits
        ? evaluateStaffWeeklyLimitsAtMultiplier(
            weeklyMessages,
            weeklyVoiceHours,
            limits,
            STAFF_LIMITS_POSITIVE_MULTIPLIER,
          )
        : null;
      const reachedWeeklyLimits = Boolean(canEvaluateWeeklyLimits && limitsEvaluation?.reached);
      const reachedDoubleWeeklyLimits = Boolean(
        canEvaluateWeeklyLimits && doubleLimitsEvaluation?.reached,
      );
      const endedPauseDuringWeek = didPauseEndDuringWeek(staffDoc, weekStart, weekEnd, "Staff");
      const inPauseDuringWeek = hadPauseAtLeastOneDayDuringWeek(staffDoc, weekStart, weekEnd, "Staff");
      const currentlyInPause = Boolean(
        getStaffPauseLine(staffDoc, "Staff")?.includes("**In pausa**"),
      );
      const sanctionLimit = STAFF_SANCTION_LIMITS[String(staffRoleId)];
      const weeklySanctions = sanctionLimit != null ? sanctionCountByModId.get(userId) || 0 : 0;
      const metWeeklySanctionLimit =
        sanctionLimit != null &&
        weeklySanctions >= sanctionLimit;

      if (!skipLimitAutovalutazione || !skipSanctionAutovalutazione) {
        await applyWeeklyStaffAutoValutazioniForMember({
          guild,
          member,
          staffDoc,
          staffRoleId,
          overview,
          resocontoWeekKey,
          sanctionCountByModId,
          graceNewStaffRole,
          weekStart,
          weekEnd,
          skipLimitAutovalutazione,
          skipSanctionAutovalutazione,
        });
        const refreshedProfile = await getStaffDoc(guild.id, userId);
        if (refreshedProfile) {
          staffDoc = ensureStaff(refreshedProfile);
        }
      }

                        const activityGrade = overviewUnavailable
        ? "Non disponibile"
        : computeActivityGrade(staffRoleId, weeklyMessages, weeklyVoiceHours);
      const behaviorGrade = computeBehaviorGrade(staffDoc?.positiveCount, staffDoc?.negativeCount);
      const pexedInWeek = wasPexedInWeek(staffDoc, weekStart);

      const { display: action, actionKey, isNulla } = buildStaffResocontoAzioneDisplay({
        staffDoc,
        staffRoleId,
        resocontoWeekKey,
        graceNewStaffRole,
        overviewUnavailable,
        inPauseDuringWeek,
        currentlyInPause,
        endedPauseDuringWeek,
        activityGrade,
        behaviorGrade,
        reachedWeeklyLimits,
        reachedDoubleWeeklyLimits,
        canEvaluateWeeklyLimits,
        metWeeklySanctionLimit,
        pexedInWeek,
        member,
      });
      const staffNewBadge = isNulla && graceNewStaffRole ? ` ${STAFF_NEW_EMOJI}` : "";

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
      const swapLine = formatStaffLimitsSwapLine(limitsEvaluation);
      if (swapLine) contentLines.push(swapLine);
      if (overviewUnavailable) {
        contentLines.push("<a:VC_Exclamation:1482534702077444217> **Stats attività non disponibili:** controllare manualmente.");
      }
      contentLines.push(`<:VC_BanHammer:1482534474502897795> **Azione:** __${action}__`);
      const pauseLine = getStaffPauseLine(staffDoc, "Staff", member);
      if (pauseLine) contentLines.push(pauseLine);

      const staffComponents = [
        buildResocontoButtons(
          "s",
          userId,
          actionKey,
          staffRoleId,
        ),
      ];

      const contentBody = contentLines.join("\n");
      let staffMsg = null;
      if (useDiscordPosts) {
        staffMsg = await sendResocontoMessageWithRetry(
          channel,
          {
            content: contentBody,
            ...(staffComponents.length ? { components: staffComponents } : {}),
          },
          { userId, segment },
        );
      } else {
        const siteMessageId = newSiteWorkflowMessageId();
        try {
          const { persistResocontoWorkflowFromPayload } = require("../../Utils/Web/siteStaffWorkflowStore") as typeof import("../../Utils/Web/siteStaffWorkflowStore");
          await persistResocontoWorkflowFromPayload(guild, {
            messageId: siteMessageId,
            channelId: "site",
            userId,
            kind: "s",
            roleId: staffRoleId,
            actionKey,
            content: contentBody,
            status: "pending",
            createdAt: new Date(),
            weekKey: resocontoWeekKey,
            workflowFields: {
              costanzaChart: serializeCostanzaChart(overview),
              activityGrade,
              behaviorGrade,
              azioneDisplay: action,
              weeklyMessages,
              weeklyVoiceSeconds,
              isNewStaff: Boolean(graceNewStaffRole),
              inPause: Boolean(currentlyInPause || inPauseDuringWeek),
              pauseEnded: Boolean(endedPauseDuringWeek),
              activityLimits: limits
                ? { messages: Number(limits.messages || 0), hours: Number(limits.hours || 0) }
                : null,
              sanctionLimit: sanctionLimit != null ? Number(sanctionLimit) : null,
              weeklySanctions: Number(weeklySanctions) || 0,
            },
          });
          staffMsg = { id: siteMessageId };
        } catch (err) {
          global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] site persist failed:", err?.message || err);
          staffMsg = null;
        }
      }
      if (staffMsg) {
        sentCount += 1;
        completedCount += 1;
        try {
          if (useDiscordPosts) {
            const { persistResocontoWorkflowFromMessage } = require("../../Utils/Web/siteStaffWorkflowStore") as typeof import("../../Utils/Web/siteStaffWorkflowStore");
            await persistResocontoWorkflowFromMessage(
              guild,
              staffMsg,
              {
                kind: "s",
                userId,
                roleId: staffRoleId,
                actionKey,
                workflowFields: {
                  costanzaChart: serializeCostanzaChart(overview),
                  activityGrade,
                  behaviorGrade,
                  azioneDisplay: action,
                  weeklyMessages,
                  weeklyVoiceSeconds,
                  isNewStaff: Boolean(graceNewStaffRole),
                  inPause: Boolean(currentlyInPause || inPauseDuringWeek),
                  pauseEnded: Boolean(endedPauseDuringWeek),
                  activityLimits: limits
                    ? { messages: Number(limits.messages || 0), hours: Number(limits.hours || 0) }
                    : null,
                  sanctionLimit: sanctionLimit != null ? Number(sanctionLimit) : null,
                  weeklySanctions: Number(weeklySanctions) || 0,
                },
              },
              "pending",
            );
          }
        } catch (_) {}
        try {
          const { notifyInboxStaffNewItem } = require("../../Utils/Web/siteStaffWorkflowNotifications") as typeof import("../../Utils/Web/siteStaffWorkflowNotifications");
          const subjectName = String(member?.displayName || member?.user?.username || userId).trim();
          void notifyInboxStaffNewItem({
            guild,
            queue: "resoconti",
            subjectUserId: String(userId),
            subjectName,
            kind: "s",
            roleId: staffRoleId,
            title: "Nuovo resoconto staff",
            body: `Resoconto di ${subjectName} in attesa di revisione.`,
            messageId: String(staffMsg?.id || ""),
            dedupeKey: `inbox:resoconti:new:${staffMsg?.id || userId}`,
          }).catch(() => 0);
        } catch (_) {}
        if (useDiscordPosts) {
          await createResocontoThread(staffMsg, userId, member.user?.username, staffDoc, segment, staffRoleId);
        }
        await appendStaffResocontoPostedId(guildId, resocontoWeekKey, userId);
        await appendStaffResocontoPostedRoleId(guildId, resocontoWeekKey, userId, staffRoleId);
        staffResocontoPostedIds.add(userId);
        staffResocontoPostedIds.add(`${staffRoleId}:${userId}`);
      } else {
        skippedCounts.sendFailed += 1;
      }
    } else if (matchStaffSegment) {
      const reason = alreadyHadStaffResocontoThisCycle
        ? "already_posted_this_cycle"
        : wasPexedResocontoDay
          ? "staff_pex_resoconto_day"
          : "unknown";
      if (jobsDebug) {
        global.logger?.info?.(`[WEEKLY STAFF RESOCONTO] Staff skipped: ${userId} (${member.user?.tag || member.user?.username || "unknown"}) segment=${segment} reason=${reason}`);
      }
    }

    if (matchStaffSegment && (!skipLimitAutovalutazione || !skipSanctionAutovalutazione)) {
      await applyWeeklyStaffAutoValutazioniForMember({
        guild,
        member,
        staffDoc,
        staffRoleId,
        overview: overviewMap.get(userId),
        resocontoWeekKey,
        sanctionCountByModId,
        graceNewStaffRole,
        weekStart,
        weekEnd,
        skipLimitAutovalutazione,
        skipSanctionAutovalutazione,
      });
    }

    const matchPmSegment =
      segment === "pm" &&
      member.roles.cache.has(String(IDs.roles.PartnerManager));
    const alreadyHadPmResocontoThisCycle =
      matchPmSegment &&
      !forceTarget &&
      !ignorePostedState &&
      (useDiscordPosts
        ? await recentPmResocontoMessageExists(channel, userId, resocontoMessageSince)
        : await hasSiteResocontoThisWeek(userId, "p"));
    const pmWindow = matchPmSegment ? getPmResocontoWindow(new Date()) : null;
    const pmPromotedInResocontoWindow = pmWindow
      ? wasPmPromotedInResocontoSkipWindow(staffDoc, pmWindow.weekStart, pmWindow.weekEnd)
      : false;
    const shouldSkipPmResoconto =
      matchPmSegment &&
      !forceTarget &&
      isPmResocontoExcludedUserId(userId);

    if (
      matchPmSegment &&
      !alreadyHadPmResocontoThisCycle &&
      !shouldSkipPmResoconto &&
      !isPmResocontoExcludedUserId(userId)
    ) {
      const weeklyPartners = countPmWeeklyPartners(staffDoc, pmWindow.weekStart, pmWindow.weekEnd,);
      const pmPexedInWeek = wasPmPexedInWeek(staffDoc, pmWindow.weekStart);
      const pmInPauseDuringWeek = wasPartnerManagerInPauseForResocontoWeek(staffDoc, pmWindow.weekStart, pmWindow.weekEnd, member);
      const pmCurrentlyInPause = Boolean(
        getPmResocontoPauseDisplayLine(staffDoc, member)?.includes("**In pausa**"),
      );
      const basePmAction = pmInPauseDuringWeek ? "Nulla" : computePmAction(weeklyPartners, pmPexedInWeek);
      let action;
      if (pmPexedInCurrentWeek) {
        action = "Nulla — promosso PM nella settimana";
      } else if (pmPromotedInResocontoWindow) {
        action = "Nulla — nuovo Partner Manager";
      } else if (pmCurrentlyInPause || pmInPauseDuringWeek) {
        action = "Nulla — in pausa";
      } else {
        action = basePmAction;
      }
      const pmPauseLine = getPmResocontoPauseDisplayLine(staffDoc, member);
      const pmNewBadge =
        (pmPexedInCurrentWeek || pmPromotedInResocontoWindow) &&
        String(action).startsWith("Nulla")
          ? ` ${STAFF_NEW_EMOJI}`
          : "";
      const pmContentLines = [
        `<:VC_PartnerManager:1494286911286808576> **Partner Manager:** __<@${userId}>__${pmNewBadge}`,
        `<:partneredserverowner:1443651871125409812> **Partner:** __${weeklyPartners}__`,
        `<:VC_BanHammer:1482534474502897795> **Azione:** __${action}__`,
      ];
      if (pmPauseLine) pmContentLines.push(pmPauseLine);

      const pmComponents = [buildResocontoButtons("p", userId, pmActionToKey(basePmAction))];
      const pmContentBody = pmContentLines.join("\n");
      let pmMsg = null;
      if (useDiscordPosts) {
        pmMsg = await sendResocontoMessageWithRetry(
          channel,
          {
            content: pmContentBody,
            ...(pmComponents.length ? { components: pmComponents } : {}),
          },
          { userId, segment },
        );
      } else {
        const siteMessageId = newSiteWorkflowMessageId();
        try {
          const { persistResocontoWorkflowFromPayload } = require("../../Utils/Web/siteStaffWorkflowStore") as typeof import("../../Utils/Web/siteStaffWorkflowStore");
          await persistResocontoWorkflowFromPayload(guild, {
            messageId: siteMessageId,
            channelId: "site",
            userId,
            kind: "p",
            roleId: null,
            actionKey: pmActionToKey(basePmAction),
            content: pmContentBody,
            status: "pending",
            createdAt: new Date(),
            weekKey: resocontoWeekKey,
            workflowFields: {
              weeklyPartners,
              azioneDisplay: String(action || ""),
              isNewStaff: Boolean(pmPexedInCurrentWeek || pmPromotedInResocontoWindow),
              inPause: Boolean(pmCurrentlyInPause || pmInPauseDuringWeek),
            },
          });
          pmMsg = { id: siteMessageId };
        } catch (err) {
          global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] site PM persist failed:", err?.message || err);
          pmMsg = null;
        }
      }
      if (pmMsg) {
        sentCount += 1;
        try {
          if (useDiscordPosts) {
            const { persistResocontoWorkflowFromMessage } = require("../../Utils/Web/siteStaffWorkflowStore") as typeof import("../../Utils/Web/siteStaffWorkflowStore");
            await persistResocontoWorkflowFromMessage(
              guild,
              pmMsg,
              {
                kind: "p",
                userId,
                roleId: null,
                actionKey: pmActionToKey(basePmAction),
                workflowFields: {
                  weeklyPartners,
                  azioneDisplay: String(action || ""),
                  isNewStaff: Boolean(pmPexedInCurrentWeek || pmPromotedInResocontoWindow),
                  inPause: Boolean(pmCurrentlyInPause || pmInPauseDuringWeek),
                },
              },
              "pending",
            );
          }
        } catch (_) {}
        try {
          const { notifyInboxStaffNewItem } = require("../../Utils/Web/siteStaffWorkflowNotifications") as typeof import("../../Utils/Web/siteStaffWorkflowNotifications");
          const subjectName = String(member?.displayName || member?.user?.username || userId).trim();
          void notifyInboxStaffNewItem({
            guild,
            queue: "resoconti",
            subjectUserId: String(userId),
            subjectName,
            kind: "p",
            title: "Nuovo resoconto PM",
            body: `Resoconto Partner Manager di ${subjectName} in attesa di revisione.`,
            messageId: String(pmMsg?.id || ""),
            dedupeKey: `inbox:resoconti:new:${pmMsg?.id || userId}`,
          }).catch(() => 0);
        } catch (_) {}
        if (useDiscordPosts) {
          await createResocontoThread(pmMsg, userId, member.user?.username, staffDoc, "pm");
        }
      }
    } else if (matchPmSegment) {
      const reason = alreadyHadPmResocontoThisCycle
        ? "already_posted_this_cycle"
        : shouldSkipPmResoconto
        ? "pex_window"
        : isPmResocontoExcludedUserId(userId)
        ? "excluded_config"
        : "unknown";
      if (jobsDebug) {
        global.logger?.info?.(`[WEEKLY STAFF RESOCONTO] PM skipped: ${userId} (${member.user?.tag || member.user?.username || "unknown"}) reason=${reason}`);
      }
    }
  }
  if (segment === "director") {
    await writeLastResocontoRun();
  }
  return { sent: sentCount, eligible: eligibleCount, completed: completedCount, skipped: skippedCounts, segment };
}

function getStaffResocontoChainSegments(segment?) {
    const seg = String(segment || "");
  return STAFF_RESOCONTO_SEGMENTS.includes(seg) ? [seg] : [];
}

async function runWeeklyStaffResocontoChain(client?, segment?, opts: Record<string, any> = {}) {
  return runWeeklyStaffResocontoSegment(client, segment, opts);
}

async function runWeeklyStaffResoconti(client?, opts: Record<string, any> = {}) {
  const seg = opts.segment;
  if (seg && seg !== "all") {
    await runWeeklyStaffResocontoSegment(client, seg, opts);
    return;
  }
  for (const s of RESOCONTO_SUNDAY_SEGMENTS) {
    await runWeeklyStaffResocontoSegment(client, s, opts);
  }
}

async function runPreResocontoReminders(client?) {
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return;
  const guild = await getClientGuildCached(client, guildId);
  if (!guild) return;

  const resocontoExcludeVoiceChannels = collectResocontoVoiceExcludeIds(guild);
  const resocontoOverviewVoiceExclude =
    resocontoExcludeVoiceChannels.size > 0 ? resocontoExcludeVoiceChannels : null;
  const resocontoScope = buildResocontoOverviewOptions(guild);

  const staffDocs = await ActivityUserProfile.find({ guildId, staff: { $exists: true } }, { userId: 1, staff: 1 }).lean().catch(() => []);
  const idsFromStaffDocs = (staffDocs || [])
    .map((r?) => String(r?.userId || ""))
    .filter((id?) => /^\d{16,20}$/.test(id));
  const idsFromGuild = collectAllResocontoRelevantMemberIdsFromGuild(guild).filter((id?) => /^\d{16,20}$/.test(id));
  const staffUserIds = Array.from(new Set([...idsFromStaffDocs, ...idsFromGuild]));
  if (!staffUserIds.length) return;

  const fetchedMembers = await Promise.all(staffUserIds.map((id?) => getGuildMemberCached(guild, id)));
  const hasStaffRole = (m?) => Boolean(resolveStaffRole(m));
  const hasPmRole = (m?) => m.roles.cache.has(String(IDs.roles.PartnerManager));
  const reminderMembers = fetchedMembers.filter(
    (m?) => m && !m.user?.bot && (hasStaffRole(m) || hasPmRole(m)),
  );
  if (!reminderMembers.length) return;

  reminderMembers.sort(compareResocontoMembers);

  const staffMap = new Map((staffDocs || []).map((r?) => [String(r.userId), r.staff || {}]));
  const staffOnlyIds = reminderMembers.filter(hasStaffRole).map((m?) => m.id);
  const overviewResults = await Promise.all(
    staffOnlyIds.map((uid?) =>
      getUserOverviewStats(
        guildId,
        uid,
        7,
        resocontoOverviewVoiceExclude,
        resocontoScope,
      )),
  );
  const overviewByUserId = new Map(staffOnlyIds.map((id?, i?) => [String(id), overviewResults[i] || null]));
  const resocontoTime =
    "**domenica alle 15:00:** Partner Manager, Helper, Mod, Senior Moderator e Director (tutti insieme)";
  const reminderWindow = getPmResocontoWindow(new Date());
  const skipDmUserIds = new Set(getDevIds(client).map((id?) => String(id)).filter((id?) => /^\d{16,20}$/.test(id)));

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
        const limitsEval = evaluateStaffWeeklyLimitsWithSwap(msg, hours, limits);
        const needMsg = limitsEval.remainingMessages;
        const needHours = limitsEval.remainingHours;
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

function getStaffRoleIdForResocontoSegment(segment?) {
  if (segment === "helper") return String(IDs.roles.Helper || "").trim();
  if (segment === "mod") return String(IDs.roles.Mod || "").trim();
  if (segment === "senior_moderator") return String(IDs.roles.SeniorModerator || "").trim();
  if (segment === "director") return String(IDs.roles.Director || "").trim();
  return "";
}

function getPassedStaffResocontoSegments(now = new Date()) {
  const r = parseRomeWallClock(now);
  if (r.weekday !== "Sun") return [];
  const currentMinutes = Number(r.hour || 0) * 60 + Number(r.minute || 0);
  if (currentMinutes < 15 * 60) return [];
  return [...STAFF_RESOCONTO_SEGMENTS];
}

async function runWeeklyLimitAutoValutazioniCatchupSegment(client?, segment?, now = new Date(), opts: Record<string, any> = {}) {
  const staffRoleId = getStaffRoleIdForResocontoSegment(segment);
  const limits = STAFF_ACTIVITY_LIMITS[String(staffRoleId)];
  if (!staffRoleId || !limits) return;

  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return;
  const guild = await getClientGuildCached(client, guildId);
  if (!guild) return;
  await hydrateGuildMembersForResoconto(guild, `catchup_${segment}`);

  const resocontoExcludeVoiceChannels = collectResocontoVoiceExcludeIds(guild);
  const resocontoOverviewVoiceExclude =
    resocontoExcludeVoiceChannels.size > 0 ? resocontoExcludeVoiceChannels : null;
  const resocontoScope = buildResocontoOverviewOptions(guild, now);
  const { weekStart, weekEnd } = getStaffResocontoEvaluationWindow(now);
  const pexSkipWindow = getCurrentResocontoPexWeekWindowUtc(now);
  const closingPartsForResocontoKey = getRomeDateParts(pexSkipWindow.windowEndExclusive);
  const resocontoWeekKey = `${closingPartsForResocontoKey.year}-${String(closingPartsForResocontoKey.month).padStart(2, "0")}-${String(closingPartsForResocontoKey.day).padStart(2, "0")}`;

  const staffDocs = await ActivityUserProfile.find({ guildId, staff: { $exists: true } }, { userId: 1, staff: 1 }).lean().catch(() => []);
  const staffMap = new Map((Array.isArray(staffDocs) ? staffDocs : []).map((row?) => [String(row.userId), row.staff || {}]));
  const idsFromGuildRoles = collectMemberIdsMatchingResocontoStaffSegment(guild, staffRoleId);
  const idsFromStaffDocs = (Array.isArray(staffDocs) ? staffDocs : [])
    .map((row?) => String(row?.userId || ""))
    .filter(Boolean);
  const userIds = Array.from(new Set([...idsFromGuildRoles, ...idsFromStaffDocs]));
  if (!userIds.length) return;

  const fetchedMembers = await Promise.all(userIds.map((userId?) => getGuildMemberCached(guild, userId)));
  const members = fetchedMembers.filter((member?) =>
    member &&
    !member.user?.bot &&
    String(resolveStaffRole(member) || "") === String(staffRoleId),
  );
  if (!members.length) return;
  let eligibleCount = 0;
  let appliedCount = 0;
  let existingCount = 0;
  let skippedCount = 0;
  const forceAutoValutazioni = Boolean(opts.force || opts.forceAutoValutazioni);
  const sanctionCountByModId = await getWeeklySanctionCountByMod(guildId, weekStart, weekEnd);

  const overviewResults = await Promise.all(
    members.map((member?) =>
      getUserOverviewStats(
        guildId,
        member.id,
        7,
        resocontoOverviewVoiceExclude,
        resocontoScope,
      ).catch((err?) => {
        global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] catchup overview stats failed:", member.id, err?.message || err);
        return { __error: true };
      })),
  );

  for (let i = 0; i < members.length; i += 1) {
    const member = members[i];
    const userId = String(member.id);
    const staffDoc = staffMap.get(userId) || null;
    const graceNewStaffRole = wasFirstStaffPromotionFromMemberInWindow(
      staffDoc,
      staffRoleId,
      pexSkipWindow.windowStart,
      pexSkipWindow.windowEndExclusive,
    );
    const wasPexedResocontoDay = wasPexedOnResocontoDay(staffDoc, now);
    const skipLimitAutovalutazione = shouldSkipLimitAutovalutazioniForStaffMember({
      graceNewStaffRole,
      wasPexedResocontoDay,
    });
    const skipSanctionAutovalutazione = shouldSkipSanctionAutovalutazioniForStaffMember({
      graceNewStaffRole,
      wasPexedResocontoDay,
    });
    const limitsKey = `weekly_limits:${resocontoWeekKey}:${staffRoleId}`;
    const sanctionsKey = `weekly_sanzioni:${resocontoWeekKey}:${staffRoleId}`;
    const limitsEntry = findAutoValutazioneEntry(staffDoc, limitsKey);
    const sanctionsEntry = findAutoValutazioneEntry(staffDoc, sanctionsKey);
        const hasLimitsValutazione = Boolean(limitsEntry) && !limitsEntry.spentByTrade;
    const hasSanctionsValutazione = Boolean(sanctionsEntry) && !sanctionsEntry.spentByTrade;
    const sanctionLimit = STAFF_SANCTION_LIMITS[String(staffRoleId)];
    const weeklySanctions = sanctionCountByModId?.get?.(userId) || 0;
    const metWeeklySanctionLimit =
      sanctionLimit != null && weeklySanctions >= sanctionLimit;
    if (skipLimitAutovalutazione) {
      skippedCount += 1;
      if (opts.verbose) {
        console.log(JSON.stringify({ userId, skipped: true, reason: "staff_pex_resoconto_day" }));
      }
      continue;
    }
    if (hasLimitsValutazione && (!metWeeklySanctionLimit || hasSanctionsValutazione)) {
      skippedCount += 1;
      if (opts.verbose) {
        console.log(JSON.stringify({ userId, skipped: true, reason: "already_complete" }));
      }
      continue;
    }
    eligibleCount += 1;

    const result: any = await applyWeeklyStaffAutoValutazioniForMember({
      guild,
      member,
      staffDoc,
      staffRoleId,
      overview: overviewResults[i],
      resocontoWeekKey,
      sanctionCountByModId,
      graceNewStaffRole,
      weekStart,
      weekEnd,
      force: forceAutoValutazioni,
      skipLimitAutovalutazione,
      skipSanctionAutovalutazione,
    }).catch((err?) => {
      global.logger?.warn?.(
        "[WEEKLY STAFF RESOCONTO] same-day catchup valutazione failed:",
        userId,
        err?.message || err,
      );
      return { limits: false, sanctions: false };
    });
    const createdCount = Number(result?.limits) + Number(result?.sanctions);
    if (createdCount > 0) {
      appliedCount += createdCount;
    } else if (
      result?.skippedLimits === "exists" ||
      result?.skippedLimits === "equivalent_exists" ||
      result?.skippedSanctions === "exists" ||
      result?.skippedSanctions === "equivalent_exists"
    ) {
      existingCount += 1;
    } else if (result?.skippedLimits === "skip_context" && result?.skippedSanctions == null) {
      skippedCount += 1;
    } else if (result?.skippedLimits === "pause_week" && !result?.sanctions) {
      skippedCount += 1;
    } else if (overviewLooksLikeEmptyFallback(overviewResults[i]) && !result?.sanctions) {
      skippedCount += 1;
    } else if (!result?.limits && !result?.sanctions) {
      skippedCount += 1;
    }
    if (opts.verbose) {
      const weeklySanctions = sanctionCountByModId?.get?.(userId) || 0;
      console.log(JSON.stringify({
        userId,
        weeklySanctions,
        limits: Boolean(result?.limits),
        sanctions: Boolean(result?.sanctions),
        skippedLimits: result?.skippedLimits || null,
        skippedSanctions: result?.skippedSanctions || null,
      }));
    }
  }
  return {
    segment,
    eligible: eligibleCount,
    applied: appliedCount,
    existing: existingCount,
    skipped: skippedCount,
  };
}

async function runSameDayWeeklyLimitAutoValutazioniRecovery(client?) {
  const now = new Date();
  const r = parseRomeWallClock(now);
  if (r.weekday !== "Sun") return;
  const currentMinutes = Number(r.hour || 0) * 60 + Number(r.minute || 0);
    if (currentMinutes < 15 * 60) return;
  for (const segment of STAFF_RESOCONTO_SEGMENTS) {
    await runWeeklyLimitAutoValutazioniCatchupSegment(client, segment, now)
      .catch((err?) => {
        global.logger?.error?.(`[WEEKLY STAFF RESOCONTO] Same-day recovery failed (${segment}):`, err);
        return null;
      });
  }
}

async function runSameDayStaffResocontoRecovery(client?) {
  const now = new Date();
  const segments = getPassedStaffResocontoSegments(now);
  if (!segments.length) return;
  const guildId = String(IDs.guilds?.main || "");
  const pexSkipWindow = getCurrentResocontoPexWeekWindowUtc(now);
  const closingPartsForResocontoKey = getRomeDateParts(pexSkipWindow.windowEndExclusive);
  const resocontoWeekKey = `${closingPartsForResocontoKey.year}-${String(closingPartsForResocontoKey.month).padStart(2, "0")}-${String(closingPartsForResocontoKey.day).padStart(2, "0")}`;
  const recoveryKey = `staffResocontoSameDayRecovery:${guildId}:${resocontoWeekKey}`;
  const recoveryState = await getBotState(recoveryKey, { done: false });
  if (recoveryState?.done) return;
  for (const segment of segments) {
    await runWeeklyStaffResocontoSegment(client, segment, { recovery: true })
      .catch((err?) => {
        global.logger?.error?.(`[WEEKLY STAFF RESOCONTO] Same-day staff recovery failed (${segment}):`, err);
        return null;
      });
  }
  await setBotState(recoveryKey, { done: true, at: Date.now() });
}

function hasPassedPmResocontoTime(now = new Date()) {
  const r = parseRomeWallClock(now);
  if (r.weekday !== "Sun") return false;
  const currentMinutes = Number(r.hour || 0) * 60 + Number(r.minute || 0);
  return currentMinutes >= 15 * 60;
}

async function runSameDayPmResocontoRecovery(client?) {
  const now = new Date();
  if (!hasPassedPmResocontoTime(now)) return;
  const guildId = String(IDs.guilds?.main || "");
  const pexSkipWindow = getCurrentResocontoPexWeekWindowUtc(now);
  const closingPartsForResocontoKey = getRomeDateParts(pexSkipWindow.windowEndExclusive);
  const resocontoWeekKey = `${closingPartsForResocontoKey.year}-${String(closingPartsForResocontoKey.month).padStart(2, "0")}-${String(closingPartsForResocontoKey.day).padStart(2, "0")}`;
  const recoveryKey = `pmResocontoSameDayRecovery:${guildId}:${resocontoWeekKey}`;
  const recoveryState = await getBotState(recoveryKey, { done: false });
  if (recoveryState?.done) return;
  await runWeeklyStaffResocontoSegment(client, "pm", { recovery: true });
  await setBotState(recoveryKey, { done: true, at: Date.now() });
}

function startWeeklyStaffResocontoLoop(client?) {
  if (weeklyStaffResocontoTasks.length) return weeklyStaffResocontoTasks[0];

  const task = cron.schedule(
    RESOCONTO_CRON_EXPRESSION,
    () => {
      void runWeeklyStaffResoconti(client).catch((err?) => {
        global.logger?.error?.("[WEEKLY STAFF RESOCONTO] Execution failed (sunday 15:00 batch)", err);
      });
    },
    { timezone: TIME_ZONE, noOverlap: true },
  );
  weeklyStaffResocontoTasks.push(task);

  const preResocontoTask: any = cron.schedule(
    "0 18 * * 5",
    () => {
      void runPreResocontoReminders(client).catch((err?) => {
        global.logger?.error?.("[WEEKLY STAFF RESOCONTO] Pre-reminder failed", err);
      });
    },
    { timezone: TIME_ZONE, noOverlap: true },
  );
  if (typeof preResocontoTask?.ref === "function") preResocontoTask.ref();

  setTimeout(() => {
    runSameDayPmResocontoRecovery(client).catch((err?) => {
      global.logger?.error?.("[WEEKLY STAFF RESOCONTO] Same-day PM recovery failed:", err);
    });
  }, 45_000).unref?.();

  setTimeout(() => {
    runSameDayStaffResocontoRecovery(client).catch((err?) => {
      global.logger?.error?.("[WEEKLY STAFF RESOCONTO] Same-day staff recovery failed:", err);
    });
  }, 55_000).unref?.();

  setTimeout(() => {
    runSameDayWeeklyLimitAutoValutazioniRecovery(client).catch((err?) => {
      global.logger?.error?.("[WEEKLY STAFF RESOCONTO] Same-day recovery failed:", err);
    });
  }, 75_000).unref?.();

  const { startResocontoReviewerRewardRecoveryLoop } = require("./resocontoReviewerRewardService") as typeof import("./resocontoReviewerRewardService");
  startResocontoReviewerRewardRecoveryLoop(client);

  return weeklyStaffResocontoTasks[0];
}

function getResocontoCycleWeekKey(now = new Date()) {
            const r = parseRomeWallClock(now);
  if (r.weekday === "Sun") {
    return `${r.year}-${String(r.month).padStart(2, "0")}-${String(r.day).padStart(2, "0")}`;
  }
  const closingSunday = getResocontoClosingSundayUtc(now);
  const closingParts = getRomeDateParts(closingSunday);
  return `${closingParts.year}-${String(closingParts.month).padStart(2, "0")}-${String(closingParts.day).padStart(2, "0")}`;
}

function getResocontoCycleMessagesSince(now = new Date()) {
  const r = parseRomeWallClock(now);
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const w = wdMap[r.weekday];

    if (w === 0) {
    return createUtcFromRomeLocal(r.year, r.month, r.day, 0, 0, 0);
  }

  const closingSunday = getResocontoClosingSundayUtc(now);
  const sunParts = getRomeDateParts(closingSunday);
  return createUtcFromRomeLocal(sunParts.year, sunParts.month, sunParts.day, 0, 0, 0);
}

async function buildStaffResocontoApplyPlanForMember(guild?, userId?, staffRoleId?) {
  const member = await getGuildMemberCached(guild, userId).catch(() => null);
  if (!member || !staffRoleId) {
    return { display: "Nulla", actionKey: "nl", isNulla: true, pendingManualActions: [] };
  }

  const now = new Date();
  const { weekStart, weekEnd } = getPmResocontoWindow(now);
  const pexSkipWindow = getCurrentResocontoPexWeekWindowUtc(now);
  const resocontoWeekKey = resolveResocontoWeekKey(now);

  const profileDoc = await ensureStaffProfileDoc(await getStaffDoc(guild.id, userId), guild.id, userId);
  const staffDoc = ensureStaff(profileDoc);
  const graceNewStaffRole = wasFirstStaffPromotionFromMemberInWindow(
    staffDoc,
    staffRoleId,
    pexSkipWindow.windowStart,
    pexSkipWindow.windowEndExclusive,
  );

  const resocontoScope = buildResocontoOverviewOptions(guild, now);
  const resocontoVoiceExclude = collectResocontoVoiceExcludeIds(guild);
  const overview = await getUserOverviewStats(
    guild.id,
    userId,
    7,
    resocontoVoiceExclude.size > 0 ? resocontoVoiceExclude : null,
    resocontoScope,
  ).catch(() => null);
  const overviewUnavailable = overviewLooksLikeEmptyFallback(overview);
  const d7 = overview?.windows?.d7;
  const weeklyMessages = Math.max(0, Math.floor(toSafeNumber(d7?.text ?? 0)));
  const weeklyVoiceSeconds = Math.max(0, Math.floor(toSafeNumber(d7?.voiceSeconds ?? 0)));
  const weeklyVoiceHours = weeklyVoiceSeconds / 3600;
  const limits = STAFF_ACTIVITY_LIMITS[String(staffRoleId)];
  const canEvaluateWeeklyLimits =
    Boolean(limits) && !graceNewStaffRole && !overviewUnavailable;
  const limitsEvaluation = limits
    ? evaluateStaffWeeklyLimitsWithSwap(weeklyMessages, weeklyVoiceHours, limits)
    : null;
  const doubleLimitsEvaluation = limits
    ? evaluateStaffWeeklyLimitsAtMultiplier(
        weeklyMessages,
        weeklyVoiceHours,
        limits,
        STAFF_LIMITS_POSITIVE_MULTIPLIER,
      )
    : null;
  const reachedWeeklyLimits = Boolean(canEvaluateWeeklyLimits && limitsEvaluation?.reached);
  const reachedDoubleWeeklyLimits = Boolean(
    canEvaluateWeeklyLimits && doubleLimitsEvaluation?.reached,
  );
  const activityGrade = overviewUnavailable
    ? "Non disponibile"
    : computeActivityGrade(staffRoleId, weeklyMessages, weeklyVoiceHours);
  const behaviorGrade = computeBehaviorGrade(staffDoc?.positiveCount, staffDoc?.negativeCount);
  const endedPauseDuringWeek = didPauseEndDuringWeek(staffDoc, weekStart, weekEnd, "Staff");
  const inPauseDuringWeek = hadPauseAtLeastOneDayDuringWeek(staffDoc, weekStart, weekEnd, "Staff");
  const currentlyInPause = Boolean(getStaffPauseLine(staffDoc, "Staff")?.includes("**In pausa**"));
  const sanctionLimit = STAFF_SANCTION_LIMITS[String(staffRoleId)];
  const sanctionCountByModId = await getWeeklySanctionCountByMod(guild.id, weekStart, weekEnd);
  const weeklySanctions = sanctionLimit != null ? sanctionCountByModId.get(String(userId)) || 0 : 0;
  const metWeeklySanctionLimit = sanctionLimit != null && weeklySanctions >= sanctionLimit;

  const pexedInWeek = wasPexedInWeek(staffDoc, weekStart);
  return buildStaffResocontoAzioneDisplay({
    staffDoc,
    staffRoleId,
    resocontoWeekKey,
    graceNewStaffRole,
    overviewUnavailable,
    inPauseDuringWeek,
    currentlyInPause,
    endedPauseDuringWeek,
    activityGrade,
    behaviorGrade,
    reachedWeeklyLimits,
    reachedDoubleWeeklyLimits,
    canEvaluateWeeklyLimits,
    metWeeklySanctionLimit,
    pexedInWeek,
    member,
  });
}

export = {
  startWeeklyStaffResocontoLoop,
  runWeeklyStaffResoconti,
  runWeeklyStaffResocontoSegment,
  runWeeklyLimitAutoValutazioniCatchupSegment,
  getPartnerLeaderboardWeekBoundsUtc,
  getCurrentResocontoPexWeekWindowUtc,
  wasFirstStaffPromotionFromMemberInWindow,
  getStaffResocontoEvaluationWindow,
  buildResocontoActivityScope,
  getWeekStartDate,
  getWeeklySanctionCountByMod,
  resolveStaffRole,
  getResocontoCycleWeekKey,
  getResocontoCycleMessagesSince,
  classifyResocontoReviewerAutoEntry,
  staffHasResocontoCompitoClaim,
  rememberResocontoCompitoClaim,
  buildStaffResocontoApplyPlanForMember,
  shouldSkipManualResocontoVp,
  shouldSkipManualResocontoVn,
  resolveResocontoWeekKey,
  getResocontoWeekRangeFromWeekKey,
  serializeCostanzaChart,
  collectResocontoVoiceExcludeIds,
  buildResocontoOverviewOptions,
  ensureWeeklyLimitAutoValutazione,
  STAFF_ACTIVITY_LIMITS,
  STAFF_LIMITS_MSG_PER_HOUR_SWAP,
  STAFF_LIMITS_POSITIVE_MULTIPLIER,
  evaluateStaffWeeklyLimitsWithSwap,
  evaluateStaffWeeklyLimitsAtMultiplier,
  scaleStaffActivityLimits,
  STAFF_SANCTION_LIMITS,
};