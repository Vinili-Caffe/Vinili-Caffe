const { ActivityUserProfile, GlobalSettings, LEVEL_HISTORY_MAX_ENTRIES, ACTIVITY_MAIN_GUILD_ID } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../../Utils/DB/validateWriteIds");
const { isMongoReady } = require("../../Utils/Database/mongoConnect") as typeof import("../../Utils/Database/mongoConnect");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const botConfig = require("../../config.json") as typeof import("../../config.json");
const { getGuildChannelCached, getGuildMemberCached, getGuildRoleCached, getClientGuildCached, getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { sendLevelMilestoneSupportersAnnouncement } = require("../../Utils/Community/levelMilestoneSupportersAnnounceEmbeds") as typeof import("../../Utils/Community/levelMilestoneSupportersAnnounceEmbeds");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter") as typeof import("../../Utils/Embeds/defaultFooter");
const VINILI_EMBED_COLOR_INT = 0x826bc2;
const { memberDisplayName, resolveEmbedUserAvatarUrl } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { parseScheduleMs, parseScheduleEndMs } = require("../../Utils/Eventi/eventDates") as typeof import("../../Utils/Eventi/eventDates");
const EXP_EXCLUDED_CATEGORY_IDS = new Set([].filter(Boolean).map((id?) => String(id)),);
const TIME_ZONE = "Europe/Rome";
const MESSAGE_EXP = 2;
const VOICE_EXP_PER_MINUTE = 5;
const DEFAULT_MULTIPLIER = 1;
const MAX_COMBINED_MULTIPLIER = 8;
const MULTIPLIER_CACHE_TTL_MS = 60 * 1000;
const settingsCache = new Map();
const LEVEL_UP_CHANNEL_ID = IDs.channels.commands;
const PERKS_CHANNEL_ID = IDs.channels.supporters;
const PERK_ROLE_ID = IDs.roles.PicPerms;
const LEVEL_ROLE_MAP = new Map([[10, IDs.roles.Level10], [20, IDs.roles.Level20], [30, IDs.roles.Level30], [50, IDs.roles.Level50], [70, IDs.roles.Level70], [100, IDs.roles.Level100], [125, IDs.roles.Level120], [150, IDs.roles.Level150], [200, IDs.roles.Level200],]);
const ROLE_MULTIPLIER_DEFS = [
  ["ServerBooster", 2],
  ["MVP", 2],
  ["DoubleBooster", 3],
  ["Donator", 4],
  ["VIP", 5],
  ["VIPplus", 6],
  ["Level100", 1.15],
  ["Level120", 1.2],
  ["Level150", 1.25],
  ["Level200", 1.3],
  ["Level250", 1.35],
  ["Level300", 1.4],
  ["Level350", 1.45],
  ["Level400", 1.5],
  ["Level450", 1.55],
  ["Level500", 1.6],
  ["Level550", 1.65],
  ["Level600", 1.7],
  ["Level650", 1.75],
  ["Level700", 1.8],
  ["Level750", 1.85],
  ["Level800", 1.9],
  ["Level850", 1.95],
  ["Level900", 2],
  ["Level950", 2.05],
  ["Level1000", 2.1],
];

function isDiscordSnowflake(value?) {
  return /^\d{16,20}$/.test(String(value || "").trim());
}

function buildRoleMultipliersFromIds() {
  const out = new Map();
  for (const [roleKey, mult] of ROLE_MULTIPLIER_DEFS) {
    const id = String(IDs.roles?.[roleKey] || "").trim();
    if (!isDiscordSnowflake(id)) continue;
    out.set(id, mult);
  }
  return out;
}

const ROLE_MULTIPLIERS = buildRoleMultipliersFromIds();

function normalizeExpGuildId(guildOrId?) {
  if (guildOrId && typeof guildOrId === "object" && guildOrId.id) return String(guildOrId.id).trim();
  return String(guildOrId || "").trim();
}

function isLevelExpGuild(guildOrId?) {
  const gid = normalizeExpGuildId(guildOrId);
  const mainId = String(ACTIVITY_MAIN_GUILD_ID || IDs.guilds?.main || "").trim();
  return Boolean(gid && mainId && gid === mainId);
}

function formatMemberMention(member?) {
  const id = String(member?.id || member?.user?.id || "").trim();
  if (/^\d{16,22}$/.test(id)) return `<@${id}>`;
  if (typeof member?.toString === "function") {
    const asText = String(member.toString());
    if (asText && asText !== "[object Object]") return asText;
  }
  return "Utente";
}

function pad2(value?) {
  return String(value).padStart(2, "0");
}

function getTimeParts(date?) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", });
  const parts = formatter.formatToParts(date);
  const map: Record<string, any> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: map.weekday,
  };
}

function getIsoWeekKey(date?) {
  const { year, month, day } = getTimeParts(date);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayNr = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 4));
  const weekNr = 1 + Math.round(((utcDate as any) - (firstThursday as any)) / (7 * 24 * 60 * 60 * 1000));
  return `${utcDate.getUTCFullYear()}-W${pad2(weekNr)}`;
}

function getCurrentWeekKey() {
  return getIsoWeekKey(new Date());
}

function roundToNearest50(value?) {
  return Math.round(value / 50) * 50;
}

function getLevelStep(level?) {
  const safeLevel = Math.max(1, Math.floor(Number(level || 1)));
  if (safeLevel <= 10) {
    return 120 + (safeLevel - 1) * 25;
  }
  if (safeLevel <= 30) {
    return 380 + (safeLevel - 10) * 55;
  }
  if (safeLevel <= 60) {
    return 1600 + (safeLevel - 30) * 120;
  }
  return 5200 + (safeLevel - 60) * 210;
}

function getLevelInfo(totalExp?) {
  const exp = Math.max(0, Math.floor(Number(totalExp || 0)));
  let level = 0;
  let currentLevelExp = 0;
  let nextThreshold = 100;
  while (exp >= nextThreshold) {
    level += 1;
    currentLevelExp = nextThreshold;
    const step = getLevelStep(level);
    nextThreshold = roundToNearest50(nextThreshold + Math.max(110, step));
  }
  const remainingToNext = Math.max(0, nextThreshold - exp);
  const span = Math.max(1, nextThreshold - currentLevelExp);
  const progressPercent = Math.max(0, Math.min(100, Math.round(((exp - currentLevelExp) / span) * 100)),);
  return {
    level,
    currentLevelExp,
    nextLevelExp: nextThreshold,
    remainingToNext,
    progressPercent,
  };
}

function getTotalExpForLevel(level?) {
  const targetLevel = Math.max(0, Math.floor(Number(level || 0)));
  if (targetLevel <= 0) return 0;
  let threshold = 100;
  for (let l = 1; l < targetLevel; l += 1) {
    threshold = roundToNearest50(threshold + Math.max(110, getLevelStep(l)));
  }
  return threshold;
}

function repairExpTotals(exp: Record<string, any> = {}) {
  let totalExp = Math.max(0, Math.floor(Number(exp?.totalExp || 0)));
  const storedLevel = Math.max(0, Math.floor(Number(exp?.level || 0)));
  const minExpForStoredLevel = getTotalExpForLevel(storedLevel);
  if (storedLevel > 0 && totalExp < minExpForStoredLevel) {
    totalExp = minExpForStoredLevel;
  }
  const levelFromExp = getLevelInfo(totalExp).level;
  const level = Math.max(storedLevel, levelFromExp);
  return { totalExp, level, levelFromExp };
}

function resolveLevelUpAnnounceLevel(prevLevel?, candidateLevel?, snapshot?) {
  const prev = Math.max(0, Math.floor(Number(prevLevel || 0)));
  const candidate = Math.max(0, Math.floor(Number(candidateLevel || 0)));
  if (!snapshot || candidate < 1) return null;
  const authoritative = Math.max(0, Math.floor(Number(snapshot.level || 0)));
  const totalExp = Math.max(0, Math.floor(Number(snapshot.totalExp || 0)));
  if (candidate <= prev) return null;
  if (authoritative <= prev) return null;
  if (totalExp >= getTotalExpForLevel(2) && candidate < 2) return null;
  if (authoritative > candidate + 1) return null;
  return Math.min(candidate, authoritative);
}

async function fetchUserExpSnapshot(guildId?, userId?) {
  if (!isValidGuildUserId(guildId, userId)) return null;
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) })
    .select("profile.totals.exp.totalExp profile.totals.exp.level")
    .lean()
    .catch(() => null);
  const exp = doc?.profile?.totals?.exp;
  if (!exp) return { totalExp: 0, level: 0, levelFromExp: 0, exists: false };
  const repaired = repairExpTotals(exp);
  return { ...repaired, exists: true };
}

function buildRoleMultipliersMerged(doc?) {
  const dbObj =
    doc?.expRoleMultipliers && typeof doc.expRoleMultipliers === "object" && !Array.isArray(doc.expRoleMultipliers)
      ? doc.expRoleMultipliers
      : {};
  const merged = new Map();
  for (const [roleId, value] of ROLE_MULTIPLIERS.entries()) {
    const id = String(roleId || "").trim();
    if (!isDiscordSnowflake(id)) continue;
    if (Object.prototype.hasOwnProperty.call(dbObj, id)) {
      const n = Number(dbObj[id]);
      merged.set(id, Number.isFinite(n) && n > 0 ? n : Number(value));
    } else {
      merged.set(id, Number(value));
    }
  }
  for (const [k, v] of Object.entries(dbObj)) {
    const id = String(k).trim();
    if (!/^\d{16,20}$/.test(id) || merged.has(id)) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    merged.set(id, n);
  }
  return merged;
}

function parseExpEventStartMs(value?) {
  return parseScheduleMs(value, "12:00:00");
}

function parseExpEventEndMs(value?) {
  const explicit = parseScheduleMs(value, "12:00:00");
  if (explicit != null && /T\d{2}:\d{2}/.test(String(value || ""))) return explicit;
  return parseScheduleEndMs(value, { endHour: 12 }) ?? parseScheduleMs(value, "23:59:59.999");
}

function getScheduledExpEvent(nowMs = Date.now()) {
  const events = Array.isArray(botConfig?.globalExpEvents) ? botConfig.globalExpEvents : [];
  let best = null;
  for (const event of events) {
    if (!event || event.enabled === false) continue;
    const multiplier = Number(event.multiplier || 1);
    if (!Number.isFinite(multiplier) || multiplier <= 1) continue;
    const startMs = parseExpEventStartMs(event.startDate);
    const endMs = parseExpEventEndMs(event.endDate);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    if (nowMs < startMs || nowMs > endMs) continue;
    if (!best || multiplier > best.multiplier) {
      best = { multiplier, expiresAt: new Date(endMs), key: String(event.key || "").trim() || null };
    }
  }
  return best;
}

function normalizeSettingsDoc(doc?) {
  const now = Date.now();
  const expiresAtValue = doc?.expEventMultiplierExpiresAt ? new Date(doc.expEventMultiplierExpiresAt).getTime() : null;
  const tempBoostActive = Number.isFinite(expiresAtValue) && expiresAtValue > now;
  const baseMultiplier = Number(doc?.expMultiplier || DEFAULT_MULTIPLIER);
  const tempEventMultiplier = tempBoostActive ? Number(doc?.expEventMultiplier || 1) : 1;
  const scheduledEvent = getScheduledExpEvent(now);
  const scheduledEventMultiplier = Number(scheduledEvent?.multiplier || 1);
  const eventMultiplier = Math.max(tempEventMultiplier, scheduledEventMultiplier);
  const eventExpiresAt = scheduledEventMultiplier >= tempEventMultiplier
    ? scheduledEvent?.expiresAt || null
    : new Date(expiresAtValue);
  return {
    baseMultiplier:
      Number.isFinite(baseMultiplier) && baseMultiplier > 0
        ? baseMultiplier
        : DEFAULT_MULTIPLIER,
    eventMultiplier:
      Number.isFinite(eventMultiplier) && eventMultiplier > 0
        ? eventMultiplier
        : 1,
    eventExpiresAt: eventMultiplier > 1 ? eventExpiresAt : null,
    lockedChannelIds: Array.isArray(doc?.expLockedChannelIds)
      ? doc.expLockedChannelIds.filter(Boolean)
      : [],
    ignoredRoleIds: Array.isArray(doc?.expIgnoredRoleIds)
      ? doc.expIgnoredRoleIds.filter(Boolean)
      : [],
    roleMultipliersMerged: buildRoleMultipliersMerged(doc),
  };
}

function ensureWeeklyExp(expObj?, now?) {
  if (!expObj || typeof expObj !== "object") return;
  const weekKey = getIsoWeekKey(now);
  if (expObj.weeklyKey !== weekKey) {
    expObj.weeklyKey = weekKey;
    expObj.weeklyExp = 0;
  }
}

function invalidateSettingsCache(guildId?) {
  if (guildId) settingsCache.delete(guildId);
}

async function getGuildExpSettings(guildId?) {
  if (!guildId) {
    return {
      baseMultiplier: DEFAULT_MULTIPLIER,
      eventMultiplier: 1,
      effectiveMultiplier: DEFAULT_MULTIPLIER,
      eventExpiresAt: null,
      lockedChannelIds: [],
      ignoredRoleIds: [],
      roleMultipliersMerged: buildRoleMultipliersMerged(null),
    };
  }
  const cached = settingsCache.get(guildId);
  const now = Date.now();
  if (cached && now - cached.at < MULTIPLIER_CACHE_TTL_MS) {
    return cached.value;
  }
  const targetGuildId = IDs.guilds.main;
  let doc = null;
  try {
    doc = await GlobalSettings.findOneAndUpdate(
      { guildId: targetGuildId },
      {
        $setOnInsert: {
          expMultiplier: DEFAULT_MULTIPLIER,
          expEventMultiplier: 1,
          expEventMultiplierExpiresAt: null,
          expLockedChannelIds: [],
          expIgnoredRoleIds: [],
          expRoleMultipliers: {},
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    global.logger?.warn?.("[expService] update:", err?.message || err);
  }

  if (
    doc?.expEventMultiplierExpiresAt &&
    new Date(doc.expEventMultiplierExpiresAt).getTime() <= now
  ) {
    try {
      doc = await GlobalSettings.findOneAndUpdate(
        { guildId: targetGuildId },
        {
          $set: {
            expEventMultiplier: 1,
            expEventMultiplierExpiresAt: null,
          },
          $unset: {
            expEventRoleOverrides: 1,
            expEventExtraMultiplierRoleIds: 1,
            expEventStartedAt: 1,
            expEventEndAnnouncementSentForExpiresAt: 1,
          },
        },
        { new: true },
      );
    } catch (err) {
      global.logger?.warn?.("[expService] multiplier reset:", err?.message || err);
    }
  }

  const normalized = normalizeSettingsDoc(doc);
  const value = { ...normalized, effectiveMultiplier: normalized.baseMultiplier * normalized.eventMultiplier, };
  settingsCache.set(guildId, { value, at: now });
  return value;
}

async function recordLevelHistory(guildId?, userId?, actorId = null, action = "update", beforeExp = 0, afterExp = 0, note = null) {
  if (typeof guildId === "object" && guildId !== null) {
    const o = guildId;
    return recordLevelHistory(o.guildId, o.userId, o.actorId ?? null, o.action ?? "update", o.beforeExp ?? 0, o.afterExp ?? 0, o.note ?? null);
  }
  if (!isValidGuildUserId(guildId, userId)) return null;
  const beforeLevel = getLevelInfo(beforeExp).level;
  const afterLevel = getLevelInfo(afterExp).level;
  const entry: Record<string, any> = {
    action: String(action || "update"),
    beforeExp: Number(beforeExp || 0),
    afterExp: Number(afterExp || 0),
    beforeLevel,
    afterLevel,
    deltaExp: Number(afterExp || 0) - Number(beforeExp || 0),
    createdAt: new Date(),
  };
  if (actorId) entry.actorId = String(actorId);
  if (note) entry.note = String(note).slice(0, 500);
  const cap = Math.max(50, Math.min(500, Number(process.env.LEVEL_HISTORY_MAX_ENTRIES) || LEVEL_HISTORY_MAX_ENTRIES));
  await ActivityUserProfile.findOneAndUpdate(
    { guildId: String(guildId), userId: String(userId) },
    { $push: { "profile.totals.exp.levelHistory": { $each: [entry], $position: 0, $slice: -cap } } },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return null;
}

async function addExp(guildId?, userId?, amount?, applyMultiplier = false, weeklyAmountOverride = null, options: Record<string, any> = {}) {
  if (!isMongoReady()) return null;
  if (!isLevelExpGuild(guildId)) return null;
  if (!isValidGuildUserId(guildId, userId) || !Number.isFinite(amount)) return null;
  const now = new Date();
  const weekKey = getIsoWeekKey(now);
  const multiplier = applyMultiplier ? await getGlobalMultiplier(guildId) : 1;
  let effective = Math.max(0, Math.floor(Number(amount))) * multiplier;
  const gid = String(guildId);
  const uid = String(userId);
  const weeklyEffective =
    weeklyAmountOverride !== null
      ? Math.max(0, Math.floor(Number(weeklyAmountOverride)))
      : effective;
  if (effective === 0 && weeklyEffective === 0) return null;
  const beforeRow = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("profile.totals.exp.totalExp profile.totals.exp.level")
    .lean()
    .catch(() => null);
  let beforeExp = Math.max(0, Math.floor(Number(beforeRow?.profile?.totals?.exp?.totalExp || 0)));
  const storedLevel = Math.max(0, Math.floor(Number(beforeRow?.profile?.totals?.exp?.level || 0)));
  const minExpForStoredLevel = getTotalExpForLevel(storedLevel);
  if (storedLevel > 0 && beforeExp < minExpForStoredLevel) {
    beforeExp = minExpForStoredLevel;
    await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      { $max: { "profile.totals.exp.totalExp": beforeExp }, $set: { "profile.totals.exp.level": storedLevel } },
    ).catch(() => null);
  }
  const prevLevel = Math.max(storedLevel, getLevelInfo(beforeExp).level);
  const eff = Math.floor(effective);
  const wk = Math.floor(weeklyEffective);
  const activityDelta = Math.max(0, Math.floor(Number(options?.activityAmount || 0)));
  let doc = null;
  try {
    doc = await ActivityUserProfile.findOneAndUpdate(
      { guildId: gid, userId: uid },
      [
        {
          $set: {
            guildId: { $ifNull: ["$guildId", gid] },
            userId: { $ifNull: ["$userId", uid] },
            "profile.totals.exp.totalExp": {
              $add: [{ $max: [{ $ifNull: ["$profile.totals.exp.totalExp", 0] }, beforeExp] }, eff],
            },
            "profile.totals.exp.activityExpTotal": {
              $add: [{ $ifNull: ["$profile.totals.exp.activityExpTotal", 0] }, activityDelta],
            },
            "profile.totals.exp.weeklyKey": weekKey,
            "profile.totals.exp.weeklyExp": {
              $cond: [
                { $eq: [{ $ifNull: ["$profile.totals.exp.weeklyKey", ""] }, weekKey] },
                { $add: [{ $ifNull: ["$profile.totals.exp.weeklyExp", 0] }, wk] },
                wk,
              ],
            },
            "profile.totals.exp.sourceUpdatedAt": now,
          },
        },
      ],
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    if (
      err?.name === "MongoNotConnectedError" ||
      /Client must be connected before running operations/i.test(String(err?.message || err || ""))
    ) {
      return null;
    }
    global.logger?.warn?.("[expService] addExp atomic failed, fallback:", err?.message || err);
    let fallback = await ActivityUserProfile.findOne({ guildId: gid, userId: uid });
    if (!fallback) fallback = new ActivityUserProfile({ guildId: gid, userId: uid });
    if (!fallback.profile) fallback.profile = {} as any;
    if (!fallback.profile.totals) fallback.profile.totals = {} as any;
    if (!fallback.profile.totals.exp) fallback.profile.totals.exp = {} as any;
    ensureWeeklyExp(fallback.profile.totals.exp, now);
    fallback.profile.totals.exp.totalExp = Number(fallback.profile.totals.exp.totalExp || 0) + eff;
    if (activityDelta > 0) {
      fallback.profile.totals.exp.activityExpTotal =
        Number(fallback.profile.totals.exp.activityExpTotal || 0) + activityDelta;
    }
    fallback.profile.totals.exp.weeklyExp = Number(fallback.profile.totals.exp.weeklyExp || 0) + wk;
    const li = getLevelInfo(fallback.profile.totals.exp.totalExp);
    const fallbackStoredLevel = Math.max(0, Math.floor(Number(fallback.profile.totals.exp.level || 0)));
    const fallbackLevel = Math.max(fallbackStoredLevel, li.level);
    fallback.profile.totals.exp.level = fallbackLevel;
    li.level = fallbackLevel;
    await fallback.save();
    doc = fallback;
  }
  if (!doc) return null;
  const afterExp = Math.max(0, Math.floor(Number(doc.profile?.totals?.exp?.totalExp || 0)));
  const levelInfo = getLevelInfo(afterExp);
  const persistedLevel = Math.max(storedLevel, levelInfo.level);
  if (persistedLevel !== Number(doc.profile?.totals?.exp?.level || 0)) {
    if (!doc.profile) doc.profile = {};
    if (!doc.profile.totals) doc.profile.totals = {};
    if (!doc.profile.totals.exp) doc.profile.totals.exp = {};
    doc.profile.totals.exp.level = persistedLevel;
    levelInfo.level = persistedLevel;
    await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      { $set: { "profile.totals.exp.level": persistedLevel } },
    ).catch(() => null);
  } else if (persistedLevel > levelInfo.level) {
    levelInfo.level = persistedLevel;
  }
  recordLevelHistory(guildId, userId, null, "update", beforeExp, afterExp, null).catch(() => null);
  return {
    doc,
    prevLevel,
    levelInfo,
    beforeExp,
    afterExp,
  };
}

function getRoleMultiplier(member?, settings = null) {
  if (!member?.roles?.cache) return 1;
  const veteranoRoleId = String(IDs.roles?.Veterano || "").trim();
  let multi = 1;
  let hasSpecificRoleMulti = false;
  let veteranoMulti = 1;
  const map = settings?.roleMultipliersMerged instanceof Map ? settings.roleMultipliersMerged : buildRoleMultipliersMerged(null);
  for (const [roleId, value] of map.entries()) {
    if (!member.roles.cache.has(roleId)) continue;
    const parsed = Math.max(1, Number(value) || 1);
    if (veteranoRoleId && String(roleId) === veteranoRoleId) {
      veteranoMulti = Math.max(veteranoMulti, parsed);
      continue;
    }
    hasSpecificRoleMulti = true;
    multi = Math.max(multi, parsed);
  }
  if (!hasSpecificRoleMulti && veteranoRoleId && member.roles.cache.has(veteranoRoleId)) {
    multi = Math.max(multi, veteranoMulti);
  }
  return multi;
}

function combineWeeklyExpMultiplier(globalExpMultiplier?, roleMultiplier?) {
  const globalMulti = Number(globalExpMultiplier);
  const roleMulti = Number(roleMultiplier);
  const safeGlobal = Number.isFinite(globalMulti) && globalMulti > 0 ? globalMulti : 1;
  const safeRole = Number.isFinite(roleMulti) && roleMulti > 0 ? roleMulti : 1;
  const roleBonus = Math.max(0, safeRole - 1);
  return Math.min(MAX_COMBINED_MULTIPLIER, Math.max(1, safeGlobal + roleBonus));
}

async function getResolvedWeeklyExpMultiplier(guild?, userId?, guildSettings = null, memberHint = null) {
  if (!userId) return 1;
  const settings =
    guildSettings && typeof guildSettings === "object"
      ? guildSettings
      : guild
        ? await getGuildExpSettings(guild.id).catch(() => null)
        : null;
  const globalMulti =
    settings && Number(settings.effectiveMultiplier) > 0
      ? Number(settings.effectiveMultiplier)
      : guild
        ? Number(await getGlobalMultiplier(guild.id).catch(() => 1)) || 1
        : 1;
  if (!guild) return combineWeeklyExpMultiplier(globalMulti, 1);
    let member =
    memberHint ||
    guild.members?.cache?.get?.(String(userId)) ||
    null;
  if (!member && guild.members?.fetch) {
    member = await guild.members.fetch({ user: String(userId), force: false }).catch(() => null);
  }
  if (!member) return combineWeeklyExpMultiplier(globalMulti, 1);
  return combineWeeklyExpMultiplier(globalMulti, getRoleMultiplier(member, settings));
}

async function buildLevelUpEmbed(member?, level?) {
  const avatarUrl = await resolveEmbedUserAvatarUrl(member, { size: 256 });
  const name = memberDisplayName(member);
  return {
    embeds: [
      {
        color: VINILI_EMBED_COLOR_INT,
        title: `${name} leveled up!`,
        thumbnail: { url: avatarUrl },
        author: { name, icon_url: avatarUrl },
        description: [
          `<a:VC_PandaClap:1331620157398712330> **Complimenti ${formatMemberMention(member)}!**`,
          `<:VC_LevelUp2:1482527047871107143> Hai appena __raggiunto__ il **livello** \`${level}\``,
          `<a:VC_HelloKittyGift:1329447876857958471> __Continua__ ad essere **attivo** in __chat__ e in __vocale__ per avanzare di _livello_!`,
        ].join("\n"),
      },
    ],
  };
}

async function sendLevelUpMessage(guild?, member?, level?) {
  if (!guild || !member) return;
  const channel = await getLevelUpChannel(guild);
  if (!channel) return;
  const payload = await buildLevelUpEmbed(member, level);
  await sendLevelUpPayload(channel, member, payload);
}

async function sendLevelUpAnnouncement(guild?, member?, level?) {
  if (!guild || !member || !Number.isFinite(level) || level < 1) return;
  if (!isLevelExpGuild(guild.id)) return;
  if (LEVEL_ROLE_MAP.has(level)) {
    const roleId = LEVEL_ROLE_MAP.get(level);
    await sendPerksLevelMessage(guild, member, level);
    await sendLevelMilestoneSupportersAnnouncement(guild, member, level, roleId).catch(() => null);
  } else {
    await sendLevelUpMessage(guild, member, level);
  }
}

async function buildPerksLevelEmbed(member?, level?, roleId?) {
  const avatarUrl = await resolveEmbedUserAvatarUrl(member, { size: 256 });
  const name = memberDisplayName(member);
  return {
    embeds: [
      {
        color: VINILI_EMBED_COLOR_INT,
        title: `${name} leveled up!`,
        thumbnail: { url: avatarUrl },
        author: { name, icon_url: avatarUrl },
        description: [
          `<a:VC_PandaClap:1331620157398712330> **Complimenti ${formatMemberMention(member)}!**`,
          `<:VC_LevelUp2:1482527047871107143> Hai appena __raggiunto__ il <@&${roleId}>`,
          `<a:VC_HelloKittyGift:1329447876857958471> __Controlla__ <#${PERKS_CHANNEL_ID}> per sapere i nuovi **vantaggi** che hai _sbloccato_!`,
        ].join("\n"),
      },
    ],
  };
}

async function sendPerksLevelMessage(guild?, member?, level?) {
  const roleId = LEVEL_ROLE_MAP.get(level);
  if (!guild || !member || !roleId) return;
  const channel = await getLevelUpChannel(guild);
  if (!channel) return;
  const payload = await buildPerksLevelEmbed(member, level, roleId);
  await sendLevelUpPayload(channel, member, payload);
}

async function getLevelUpChannel(guild?) {
  if (!guild || !LEVEL_UP_CHANNEL_ID) return null;
  const client = guild.client;
  return guild.channels.cache.get(LEVEL_UP_CHANNEL_ID) || (await getGuildChannelCached(guild, LEVEL_UP_CHANNEL_ID)) || (client ? (await getClientChannelCached(client, LEVEL_UP_CHANNEL_ID)) : null);
}

const EVENT_LEVEL_UP_DEBOUNCE_MS = 1800;
const eventLevelUpPending = new Map();
let eventLevelUpFlushRegistered = false;

async function flushPendingEventLevelUpMessages() {
  const rows = Array.from(eventLevelUpPending.values());
  eventLevelUpPending.clear();
  for (const row of rows) {
    try {
      if (row?.timeoutId) clearTimeout(row.timeoutId);
    } catch (_) {}
  }
  for (const row of rows) {
    const guildId = String(row?.guildId || "");
    const userId = String(row?.userId || row?.key?.split?.(":")?.[1] || "");
    const client = row?.client;
    if (!guildId || !userId || !client) continue;
    try {
      const g = client.guilds.cache.get(guildId) || (await getClientGuildCached(client, guildId));
      if (!g) continue;
      const mem = await getGuildMemberCached(g, userId);
      if (!mem) continue;
      const snapshot = await fetchUserExpSnapshot(guildId, userId).catch(() => null);
      const announceLevel = resolveLevelUpAnnounceLevel(
        Number(row.prevLevel) || 0,
        Number(row.level) || 0,
        snapshot,
      );
      if (!announceLevel) continue;
      await sendLevelUpAnnouncement(g, mem, announceLevel);
    } catch (err) {
      global.logger?.error?.("[expService] shutdown level-up flush error:", err?.message || err);
    }
  }
}

function ensureEventLevelUpShutdownFlush() {
  if (eventLevelUpFlushRegistered) return;
  eventLevelUpFlushRegistered = true;
  try {
    const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");
    armShutdownCheckpoint();
    registerShutdownFlush("vinyls_event_levelup_pending", () => flushPendingEventLevelUpMessages());
  } catch (_) {}
}

function scheduleEventLevelUpMessage(clientOrGuild?, guildId?, userId?, level?, prevLevel = 0) {
  if (!guildId || !userId || !Number.isFinite(level) || level < 1) return;
  const client = clientOrGuild?.client ?? clientOrGuild;
  if (!client) return;
  ensureEventLevelUpShutdownFlush();
  const key = `${String(guildId)}:${String(userId)}`;
  const safePrev = Math.max(0, Math.floor(Number(prevLevel || 0)));
  const existing = eventLevelUpPending.get(key);
  if (existing) {
    clearTimeout(existing.timeoutId);
    level = Math.max(Number(level), Number(existing.level) || 0);
    prevLevel = Math.min(safePrev, Math.max(0, Math.floor(Number(existing.prevLevel || 0))));
  } else {
    prevLevel = safePrev;
  }
  const flushLevel = Math.floor(Number(level));
  const flushPrevLevel = Math.max(0, Math.floor(Number(prevLevel || 0)));
  const timeoutId = setTimeout(async () => {
    eventLevelUpPending.delete(key);
    try {
      const g = client.guilds.cache.get(guildId) || (await getClientGuildCached(client, guildId));
      if (!g) return;
      const mem = await getGuildMemberCached(g, userId);
      if (!mem) return;
      const snapshot = await fetchUserExpSnapshot(guildId, userId).catch(() => null);
      const announceLevel = resolveLevelUpAnnounceLevel(flushPrevLevel, flushLevel, snapshot);
      if (!announceLevel) return;
      await sendLevelUpAnnouncement(g, mem, announceLevel);
    } catch (err) {
      global.logger?.error?.("[expService] scheduleEventLevelUpMessage flush error:", err);
    }
  }, EVENT_LEVEL_UP_DEBOUNCE_MS);
  timeoutId.unref?.();
  eventLevelUpPending.set(key, {
    timeoutId,
    level: flushLevel,
    prevLevel: flushPrevLevel,
    guildId: String(guildId),
    userId: String(userId),
    client,
  });
}

async function sendLevelUpPayload(channel?, member?, payload?) {
  if (!channel || !member || !payload) return;
  const { applyPronounGenderToPayload } = require("../../Utils/Community/pronounGenderUtils") as typeof import("../../Utils/Community/pronounGenderUtils");
  const outgoing = applyDefaultFooterToEmbeds(
    applyPronounGenderToPayload(
      {
        content: `<a:VC_LevelUp:1482527020641419415> ${formatMemberMention(member)} sei salito/a di livello!`,
        ...payload,
      },
      member,
    ),
    channel.guild,
  );
  await channel.send(outgoing).catch(() => { });
}

async function incrementMinigameWinCounters(guildId?, userId?, effectiveExp?, newStreak?, bestStreak?) {
  if (!isLevelExpGuild(guildId)) return null;
  if (!isValidGuildUserId(guildId, userId)) return null;
  const gid = String(guildId);
  const uid = String(userId);
  const eff = Math.max(0, Math.floor(Number(effectiveExp)));
  if (!Number.isFinite(eff)) return null;
  const weekKey = getIsoWeekKey(new Date());
  const ns = Math.max(0, Math.floor(Number(newStreak)));
  const bs = Math.max(0, Math.floor(Number(bestStreak)));
  try {
    const doc = await ActivityUserProfile.findOneAndUpdate(
      { guildId: gid, userId: uid },
      [
        {
          $set: {
            guildId: { $ifNull: ["$guildId", gid] },
            userId: { $ifNull: ["$userId", uid] },
            "profile.totals.exp.minigame.totalExp": {
              $add: [{ $ifNull: ["$profile.totals.exp.minigame.totalExp", 0] }, eff],
            },
            "profile.totals.exp.minigame.weeklyKey": weekKey,
            "profile.totals.exp.minigame.weeklyExp": {
              $cond: [
                { $eq: [{ $ifNull: ["$profile.totals.exp.minigame.weeklyKey", ""] }, weekKey] },
                { $add: [{ $ifNull: ["$profile.totals.exp.minigame.weeklyExp", 0] }, eff] },
                eff,
              ],
            },
            "profile.totals.exp.minigame.currentStreak": ns,
            "profile.totals.exp.minigame.bestStreak": bs,
          },
        },
      ],
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return doc;
  } catch (err) {
    global.logger?.warn?.("[expService] incrementMinigameWinCounters failed:", err?.message || err);
    return null;
  }
}

async function fetchGuildMember(guild?, userId?) {
  if (!guild || !userId) return null;
  return getGuildMemberCached(guild, userId);
}

function sleepMs(ms?) {
  return new Promise((resolve?) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function memberHasRoleId(member?, roleId?) {
  const rid = String(roleId || "");
  if (!member || !rid) return false;
  try {
    if (member.roles?.cache?.has(rid)) return true;
  } catch (_) {}
  try {
    const ids = member.roles?.cache?.map?.((r?) => String(r.id)) || [];
    return ids.includes(rid);
  } catch (_) {
    return false;
  }
}

async function addLevelRoleIfPossible(member?, roleId?) {
  if (!member || !roleId) return false;
  const rid = String(roleId);
  const me = member.guild.members.me;
  if (!me?.permissions?.has?.("ManageRoles")) return false;
  const role = member.guild.roles.cache.get(rid) || (await getGuildRoleCached(member.guild, rid));
  if (!role || role.managed) return false;
  if (role.position >= me.roles.highest.position) return false;
  if (memberHasRoleId(member, rid)) return true;

  let afterAdd = null;
  try {
    afterAdd = await member.roles.add(role, "EXP: level milestone");
  } catch (err) {
    if (isMemberGoneError(err)) return false;
    return false;
  }
  if (memberHasRoleId(afterAdd || member, rid)) return true;

  /* levelRoleAssign2: Discord a volte conferma l'add prima che fetch/cache vedano il ruolo */
  await sleepMs(450);
  let fresh = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  if (memberHasRoleId(fresh, rid)) return true;
  if (!fresh) return true;

  try {
    afterAdd = await fresh.roles.add(role, "EXP: level milestone retry");
  } catch (err) {
    if (isMemberGoneError(err)) return false;
    /* prima add senza throw → non trattare come fail permanente */
    return true;
  }
  if (memberHasRoleId(afterAdd || fresh, rid)) return true;
  await sleepMs(600);
  const again = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  if (memberHasRoleId(again, rid)) return true;
  /* API ha accettato almeno un add: evita falso "not present after add+retry" */
  return true;
}

/** levelRoleHeal1: se livello già raggiunto ma ruolo mancante (reboot/API miss), riassegna */
async function healMissingLevelRoles(member?, level?) {
  if (!member?.guild || !Number.isFinite(Number(level))) return 0;
  const safeLevel = Math.max(0, Math.floor(Number(level || 0)));
  if (safeLevel < 10) return 0;
  const reachedPerkLevels = Array.from(LEVEL_ROLE_MAP.keys())
    .filter((perkLevel?) => perkLevel <= safeLevel)
    .sort((a?, b?) => a - b);
  let mem = member;
  let healed = 0;
  for (const perkLevel of reachedPerkLevels) {
    const roleId = LEVEL_ROLE_MAP.get(perkLevel);
    if (!roleId) continue;
    if (mem.roles?.cache?.has(roleId)) continue;
    const ok = await addLevelRoleIfPossible(mem, roleId);
    if (ok) healed += 1;
    mem = (await getGuildMemberCached(mem.guild, mem.id, { preferFresh: true })) || mem;
    /* pace Discord tra milestone consecutive (L10→L20…) */
    await sleepMs(350);
  }
  return healed;
}

/** levelRoleBootHeal1: sample utenti livello≥10 al boot (non solo chi fa EXP) */
async function healLevelRolesForGuildOnStartup(guild?, { limit = 120 } = {}) {
  if (!guild?.id || !isLevelExpGuild(guild.id)) return { scanned: 0, healed: 0 };
  const safeLimit = Math.max(20, Math.min(400, Math.floor(Number(limit) || 120)));
  const rows = await ActivityUserProfile.find({
    guildId: String(guild.id),
    "profile.totals.exp.level": { $gte: 10 },
  })
    .select("userId profile.totals.exp.level")
    .sort({ "profile.totals.exp.level": -1, updatedAt: -1 })
    .limit(safeLimit)
    .lean()
    .catch(() => []);
  let scanned = 0;
  let healed = 0;
  for (const row of rows || []) {
    const userId = String(row?.userId || "").trim();
    if (!userId) continue;
    scanned += 1;
    const level = Math.max(0, Math.floor(Number(row?.profile?.totals?.exp?.level || 0)));
    const member = await getGuildMemberCached(guild, userId).catch(() => null);
    if (!member) continue;
    healed += await healMissingLevelRoles(member, level).catch(() => 0);
    if (level >= 10) await addPerkRoleIfPossible(member).catch(() => null);
  }
  return { scanned, healed };
}

function isMemberGoneError(err?) {
  const code = err?.code ?? err?.rawError?.code;
  const msg = String(err?.message ?? err?.rawError?.message ?? "").toLowerCase();
  return code === 10007 || code === 10013 || msg.includes("unknown member") || msg.includes("unknown user") || msg.includes("not found");
}

async function addPerkRoleIfPossible(member?) {
  if (!member?.guild || !PERK_ROLE_ID) return;
  const rid = String(PERK_ROLE_ID);
  const me = member.guild.members.me;
  if (!me?.permissions?.has?.("ManageRoles")) return;
  const role = member.guild.roles.cache.get(rid) || (await getGuildRoleCached(member.guild, rid));
  if (!role || role.managed) return;
  if (role.position >= me.roles.highest.position) return;
  if (memberHasRoleId(member, rid)) return;
  try {
    const after = await member.roles.add(role, "EXP: perk role");
    if (memberHasRoleId(after || member, rid)) return;
  } catch (err) {
    if (isMemberGoneError(err)) return;
    return;
  }
  await sleepMs(450);
  let fresh = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  if (memberHasRoleId(fresh, rid) || !fresh) return;
  try {
    await fresh.roles.add(role, "EXP: perk role retry");
  } catch (_) {}
}

async function removeLevelRoleIfPossible(member?, roleId?) {
  if (!member || !roleId) return false;
  const me = member.guild.members.me;
  if (!me?.permissions.has("ManageRoles")) return false;
  const role = member.guild.roles.cache.get(roleId) || (await getGuildRoleCached(member.guild, roleId));
  if (!role) return false;
  if (role.position >= me.roles.highest.position) return false;
  if (!member.roles.cache.has(roleId)) return true;
  let err = null;
  await member.roles.remove(role).catch((e?) => { err = e; });
  if (err && isMemberGoneError(err)) return false;
  const fresh = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  return !fresh?.roles?.cache?.has(roleId);
}

async function removePerkRoleIfPossible(member?) {
  if (!member?.guild || !PERK_ROLE_ID) return;
  const me = member.guild.members.me;
  if (!me?.permissions.has("ManageRoles")) return;
  const role = member.guild.roles.cache.get(PERK_ROLE_ID) || (await getGuildRoleCached(member.guild, PERK_ROLE_ID));
  if (!role || role.position >= me.roles.highest.position) return;
  if (!member.roles.cache.has(PERK_ROLE_ID)) return;
  await member.roles.remove(role).catch(() => {});
}

async function syncLevelRolesForMember(guild?, userId?, level?) {
  if (!guild || !userId) return [];
  const safeLevel = Math.max(0, Math.floor(Number(level || 0)));
  const member = await getGuildMemberCached(guild, userId);
  if (!member) return [];
  const awarded = [];
  const aboveLevels = Array.from(LEVEL_ROLE_MAP.keys())
    .filter((perkLevel?) => perkLevel > safeLevel)
    .sort((a?, b?) => b - a);
  for (const perkLevel of aboveLevels) {
    const roleId = LEVEL_ROLE_MAP.get(perkLevel);
    if (roleId) await removeLevelRoleIfPossible(member, roleId);
  }
  const reachedPerkLevels = Array.from(LEVEL_ROLE_MAP.keys())
    .filter((perkLevel?) => perkLevel <= safeLevel)
    .sort((a?, b?) => a - b);
  let mem = await getGuildMemberCached(guild, userId, { preferFresh: true }) || member;
  for (const perkLevel of reachedPerkLevels) {
    const roleId = LEVEL_ROLE_MAP.get(perkLevel);
    if (!roleId) continue;
    const alreadyHad = Boolean(mem?.roles?.cache?.has(roleId));
    const ok = await addLevelRoleIfPossible(mem, roleId);
            if (ok && !alreadyHad) awarded.push(roleId);
    mem = (await getGuildMemberCached(guild, userId, { preferFresh: true })) || mem;
  }
  const freshMember = await getGuildMemberCached(guild, userId, { preferFresh: true });
  if (!freshMember) return awarded;
  if (safeLevel >= 10) await addPerkRoleIfPossible(freshMember);
  else {
    const { tryRevokePicPermsIfIneligible } = require("../../Utils/Community/manualSocialRoleAnnounceAndPicPerms") as typeof import("../../Utils/Community/manualSocialRoleAnnounceAndPicPerms");
    await tryRevokePicPermsIfIneligible(freshMember);
  }
  return awarded;
}

async function addExpWithLevel(guild?, userId?, amount?, applyMultiplier = false, includeWeekly = true, options: Record<string, any> = {}) {
  if (!guild || !userId) return null;
  if (!isLevelExpGuild(guild.id)) return null;
  const member = await fetchGuildMember(guild, userId);
  if (member?.user?.bot) return null;
  let effectiveAmount = amount;
  if (applyMultiplier) {
    const settings = await getGuildExpSettings(guild.id);
    const globalMulti = settings.effectiveMultiplier;
    const roleMulti = getRoleMultiplier(member || null, settings);
    const combined = combineWeeklyExpMultiplier(globalMulti, roleMulti);
    effectiveAmount = Number(amount || 0) * combined;
  }
  let weeklyAmount = null;
  if (!includeWeekly) {
    weeklyAmount = 0;
  } else if (applyMultiplier) {
    weeklyAmount = Number(amount || 0);
  }
  const isActivitySource = options?.source === "activity";
  const activityBase = isActivitySource ? Number(amount || 0) : 0;
  const activityAmount = applyMultiplier ? activityBase * (options?.activityMultiplierOverride || 1) : activityBase;
  const result = await addExp(
    guild.id,
    userId,
    effectiveAmount,
    false,
    weeklyAmount,
    { activityAmount, client: guild.client, guild },
  );
  if (!result || !result.levelInfo) return result;
  if (result.levelInfo.level > (result.prevLevel ?? 0)) {
    if (member) {
      const level = result.levelInfo.level;
      const reachedPerkLevels = Array.from(LEVEL_ROLE_MAP.keys()).filter((perkLevel?) => perkLevel > (result.prevLevel ?? 0) && perkLevel <= level,).sort((a?, b?) => a - b);
      for (const perkLevel of reachedPerkLevels) {
        const roleId = LEVEL_ROLE_MAP.get(perkLevel);
        if (!roleId) continue;
        await addLevelRoleIfPossible(member, roleId);
      }
      const inlineSnapshot = repairExpTotals({
        totalExp: result.afterExp,
        level: result.levelInfo.level,
      });
      const announceLevel = resolveLevelUpAnnounceLevel(
        result.prevLevel ?? 0,
        level,
        inlineSnapshot,
      );
      if (announceLevel) {
        scheduleEventLevelUpMessage(guild, guild.id, userId, announceLevel, result.prevLevel ?? 0);
      }
      if (result.levelInfo.level >= 10) {
        await healMissingLevelRoles(member, result.levelInfo.level);
        await addPerkRoleIfPossible(member);
      }
    }
  } else if (result.levelInfo.level >= 10 && member) {
    /* levelRoleHeal1: self-heal milestone (es. Level10) anche senza level-up */
    await healMissingLevelRoles(member, result.levelInfo.level);
    await addPerkRoleIfPossible(member);
  }
  return result;
}

async function getGlobalMultiplier(guildId?) {
  const settings = await getGuildExpSettings(guildId);
  return settings.effectiveMultiplier;
}

async function setGlobalMultiplier(guildId?, multiplier?) {
  if (!guildId) return DEFAULT_MULTIPLIER;
  let value = Number(multiplier);
  if (!Number.isFinite(value) || value <= 0) value = DEFAULT_MULTIPLIER;
  const doc = await GlobalSettings.findOneAndUpdate({ guildId }, { $set: { expMultiplier: value } }, { upsert: true, new: true, setDefaultsOnInsert: true },);
  invalidateSettingsCache(guildId);
  const settings = normalizeSettingsDoc(doc);
  return settings.baseMultiplier;
}

async function setTemporaryEventMultiplier(guildId?, multiplier?, durationMs?) {
  if (!guildId) return null;
  let value = Number(multiplier);
  if (!Number.isFinite(value) || value <= 0) value = 1;
  const safeDurationMs = Math.max(60 * 1000, Number(durationMs || 60 * 1000));
  const expiresAt = new Date(Date.now() + safeDurationMs);
  await GlobalSettings.findOneAndUpdate(
    { guildId: IDs.guilds.main },
    {
      $set: {
        expEventMultiplier: value,
        expEventMultiplierExpiresAt: expiresAt,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  invalidateSettingsCache(guildId);
  return { multiplier: value, expiresAt };
}

async function setLevelChannelLocked(guildId?, channelId?, locked = true) {
  if (!guildId || !channelId) return [];
  const current = await getGuildExpSettings(guildId);
  const set = new Set(current.lockedChannelIds);
  if (locked) set.add(channelId);
  else set.delete(channelId);
  const next = Array.from(set);
  await GlobalSettings.findOneAndUpdate(
    { guildId: IDs.guilds.main },
    { $set: { expLockedChannelIds: next } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  invalidateSettingsCache(guildId);
  return next;
}

async function setRoleIgnored(guildId?, roleId?, ignored = true) {
  if (!guildId || !roleId) return [];
  const current = await getGuildExpSettings(guildId);
  const set = new Set(current.ignoredRoleIds);
  if (ignored) set.add(roleId);
  else set.delete(roleId);
  const next = Array.from(set);
  await GlobalSettings.findOneAndUpdate(
    { guildId: IDs.guilds.main },
    { $set: { expIgnoredRoleIds: next } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  invalidateSettingsCache(guildId);
  return next;
}

async function setRoleExpMultiplier(guildId?, roleId?, multiplier?) {
  const rid = String(roleId || "").trim();
  if (!guildId || !/^\d{16,20}$/.test(rid)) return null;
  const targetGuildId = IDs.guilds.main;
  const n = Number(multiplier);
  const remove = multiplier === null || multiplier === undefined || !Number.isFinite(n) || n <= 0;
  try {
    if (remove) {
      await GlobalSettings.findOneAndUpdate(
        { guildId: targetGuildId },
        { $unset: { [`expRoleMultipliers.${rid}`]: "" } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } else {
      await GlobalSettings.findOneAndUpdate(
        { guildId: targetGuildId },
        { $set: { [`expRoleMultipliers.${rid}`]: n } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }
  } catch (err) {
    global.logger?.warn?.("[expService] setRoleExpMultiplier:", err?.message || err);
    return null;
  }
  invalidateSettingsCache(guildId);
  return getGuildExpSettings(guildId);
}

async function resolveMemberVisibilityRoleForExp(guild?) {
  if (!guild) return null;
  const configuredId = String(IDs.roles?.Member || "").trim();
  if (configuredId) {
    const role = guild.roles?.cache?.get(configuredId) || (await getGuildRoleCached(guild, configuredId));
    if (role) return role;
  }
  return guild.roles?.everyone || null;
}

async function isChannelEligibleForMemberExp(guild?, channelId?) {
  const id = String(channelId || "").trim();
  if (!guild || !id) return true;
  const role = await resolveMemberVisibilityRoleForExp(guild);
  if (!role) return true;

  const channel = guild.channels?.cache?.get(id) || (await getGuildChannelCached(guild, id));
  if (!channel) return false;

  const perms = channel.permissionsFor(role);
  if (!perms?.has("ViewChannel")) return false;

  if (perms.has("SendMessages")) return true;
  if (perms.has("Connect")) return true;
  return false;
}

async function shouldIgnoreExpForMember({ guildId, member, channelId = null, skipIgnoredRoleIds = false }) {
  const settings = await getGuildExpSettings(guildId);
  const chId = channelId != null ? String(channelId) : "";
  if (chId) {
    const locked = new Set(
      (settings.lockedChannelIds || []).map((id?) => String(id)),
    );
    if (locked.has(chId)) return true;
  }
  if (channelId && EXP_EXCLUDED_CATEGORY_IDS.size > 0) {
    const guild = member?.guild || null;
    const channel = guild?.channels?.cache?.get(channelId) || (await guild?.channels?.fetch?.(channelId).catch(() => null));
    const parentId = String(channel?.parentId || "");
    if (parentId && EXP_EXCLUDED_CATEGORY_IDS.has(parentId)) return true;
  }
  if (chId) {
    const guild = member?.guild || null;
    const allowed = await isChannelEligibleForMemberExp(guild, chId);
    if (!allowed) return true;
  }
  if (!skipIgnoredRoleIds && member?.roles?.cache && settings.ignoredRoleIds.length > 0) {
    for (const roleId of settings.ignoredRoleIds) {
      if (member.roles.cache.has(roleId)) return true;
    }
  }
  return false;
}

function normalizeHistoryEntry(e?) {
  return {
    actorId: e?.actorId ?? null,
    action: e?.action ?? "update",
    beforeExp: Number(e?.beforeExp ?? 0),
    afterExp: Number(e?.afterExp ?? 0),
    beforeLevel: Number(e?.beforeLevel ?? 0),
    afterLevel: Number(e?.afterLevel ?? 0),
    deltaExp: Number(e?.deltaExp ?? 0),
    note: e?.note ?? null,
    createdAt: e?.createdAt ?? new Date(),
  };
}

async function getRecentLevelHistory(guildId?, userId?, limit = 10) {
  if (!guildId || !userId) return [];
  const safeLimit = Math.max(1, Math.min(30, Number(limit || 10)));
  const doc = await ActivityUserProfile.findOne({ guildId, userId }).select("profile.totals.exp.levelHistory").lean().catch(() => null);
  const entries = (doc?.profile?.totals?.exp?.levelHistory || []).slice(0, safeLimit);
  return entries.map(normalizeHistoryEntry);
}

async function getLevelHistoryPage(guildId?, userId?, page = 1, pageSize = 10) {
  if (!guildId || !userId)
    return { rows: [], page: 1, totalPages: 1, totalCount: 0, pageSize: 10 };
  const safePageSize = Math.max(1, Math.min(20, Number(pageSize || 10)));
  const safePage = Math.max(1, Number(page || 1));
  const doc = await ActivityUserProfile.findOne({ guildId, userId }).select("profile.totals.exp.levelHistory").lean().catch(() => null);
  const rawEntries = doc?.profile?.totals?.exp?.levelHistory || [];
  const totalCount = rawEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const effectivePage = Math.min(safePage, totalPages);
  const skip = (effectivePage - 1) * safePageSize;
  const rows = rawEntries.slice(skip, skip + safePageSize).map(normalizeHistoryEntry);
  return {
    rows,
    page: effectivePage,
    totalPages,
    totalCount,
    pageSize: safePageSize,
  };
}

async function getUserExpStats(guildId?, userId?) {
  if (!isValidGuildUserId(guildId, userId)) {
    return {
      totalExp: 0,
      weeklyExp: 0,
      level: 0,
      currentLevelExp: 0,
      nextLevelExp: getLevelInfo(0).nextLevelExp,
      remainingToNext: getLevelInfo(0).remainingToNext,
      progressPercent: 0,
    };
  }
  const now = new Date();
  let doc = await ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) }).catch(() => null);
  if (!doc) {
    return {
      totalExp: 0,
      weeklyExp: 0,
      level: 0,
      currentLevelExp: 0,
      nextLevelExp: getLevelInfo(0).nextLevelExp,
      remainingToNext: getLevelInfo(0).remainingToNext,
      progressPercent: 0,
    };
  }
  if (!doc.profile) doc.profile = {};
  if (!doc.profile.totals) doc.profile.totals = {};
  if (!doc.profile.totals.exp) doc.profile.totals.exp = {};
  ensureWeeklyExp(doc.profile.totals.exp, now);
  const repaired = repairExpTotals(doc.profile.totals.exp);
  const levelInfo = getLevelInfo(repaired.totalExp);
  const resolvedLevel = repaired.level;
  const needsSave =
    Number(doc.profile.totals.exp.totalExp || 0) !== repaired.totalExp ||
    Number(doc.profile.totals.exp.level || 0) !== resolvedLevel;
  if (needsSave) {
    doc.profile.totals.exp.totalExp = repaired.totalExp;
    doc.profile.totals.exp.level = resolvedLevel;
    await doc.save().catch(() => null);
  }
  return {
    totalExp: Number(repaired.totalExp || 0),
    weeklyExp: Number(doc.profile.totals.exp.weeklyExp || 0),
    level: Number(resolvedLevel || 0),
    currentLevelExp: levelInfo.currentLevelExp,
    nextLevelExp: levelInfo.nextLevelExp,
    remainingToNext: levelInfo.remainingToNext,
    progressPercent: levelInfo.progressPercent,
  };
}

async function getUserRanks(guildId?, userId?) {
  const stats = await getUserExpStats(guildId, userId);
  const currentWeekKey = getIsoWeekKey(new Date());
  const [weeklyHigher, totalHigher] = await Promise.all([
    ActivityUserProfile.countDocuments({
      guildId,
      "profile.totals.exp.weeklyKey": currentWeekKey,
      "profile.totals.exp.weeklyExp": { $gt: stats.weeklyExp },
    }),
    ActivityUserProfile.countDocuments({
      guildId,
      "profile.totals.exp.totalExp": { $gt: stats.totalExp },
    }),
  ]);
  return {
    stats,
    weeklyRank: weeklyHigher + 1,
    allTimeRank: totalHigher + 1,
  };
}

async function retroSyncGuildLevels(guild?, { syncRoles = true } = {}) {
  if (!guild?.id) {
    return {
      scanned: 0,
      changed: 0,
      raised: 0,
      lowered: 0,
      roleSynced: 0,
    };
  }

  const guildId = guild.id;
  const changedUsers = [];
  const batchOps = [];
  let scanned = 0;
  let changed = 0;
  let raised = 0;
  let lowered = 0;

  const cursor = ActivityUserProfile.find({ guildId }).select("userId profile.totals.exp.totalExp profile.totals.exp.level").lean().cursor();

  for await (const doc of cursor) {
    scanned += 1;
    const totalExp = Math.max(0, Math.floor(Number(doc?.profile?.totals?.exp?.totalExp || 0)));
    const oldLevel = Math.max(0, Math.floor(Number(doc?.profile?.totals?.exp?.level || 0)));
    const newLevel = getLevelInfo(totalExp).level;
    if (newLevel === oldLevel) continue;

    changed += 1;
    if (newLevel > oldLevel) raised += 1;
    if (newLevel < oldLevel) lowered += 1;
    changedUsers.push({ userId: String(doc.userId), newLevel });

    batchOps.push({
      updateOne: {
        filter: { guildId, userId: String(doc.userId) },
        update: { $set: { "profile.totals.exp.level": newLevel } },
      },
    });

    if (batchOps.length >= 500) {
      await ActivityUserProfile.bulkWrite(batchOps, { ordered: false }).catch(() => null);
      batchOps.length = 0;
    }
  }

  if (batchOps.length > 0) {
    await ActivityUserProfile.bulkWrite(batchOps, { ordered: false }).catch(() => null);
  }

  let roleSynced = 0;
  if (syncRoles && changedUsers.length > 0) {
    for (const row of changedUsers) {
      await syncLevelRolesForMember(guild, row.userId, row.newLevel).catch(
        () => { },
      );
      roleSynced += 1;
    }
  }

  return { scanned, changed, raised, lowered, roleSynced };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_LOOKBACK_DAYS = [1, 7, 14, 21, 30];

async function getTopExpGainsInPeriod(guildId?, lookbackDays?, limit = 100) {
  const safeGuildId = String(guildId || "").trim();
  if (!safeGuildId) return [];
  const safeLookback = Number(lookbackDays);
  if (!Number.isFinite(safeLookback) || safeLookback < 1) return [];
  const since = new Date(Date.now() - safeLookback * DAY_MS);
  const safeLimit = Math.max(1, Math.min(500, Number(limit || 100)));
  const agg = await ActivityUserProfile.aggregate([
    { $match: { guildId: safeGuildId } },
    { $unwind: "$profile.totals.exp.levelHistory" },
    { $match: { "profile.totals.exp.levelHistory.createdAt": { $gte: since }, "profile.totals.exp.levelHistory.deltaExp": { $gt: 0 } } },
    { $group: { _id: "$userId", expGain: { $sum: "$profile.totals.exp.levelHistory.deltaExp" } } },
    { $sort: { expGain: -1 } },
    { $limit: safeLimit },
  ]).catch(() => []);
  return agg.map((x?) => ({ userId: String(x._id || ""), expGain: Math.max(0, Math.floor(Number(x.expGain || 0))) }));
}

async function getTopLevelGainsInPeriod(guildId?, lookbackDays?, limit = 100) {
  const safeGuildId = String(guildId || "").trim();
  if (!safeGuildId) return [];
  const safeLookback = Number(lookbackDays);
  if (!Number.isFinite(safeLookback) || safeLookback < 1) return [];
  const since = new Date(Date.now() - safeLookback * DAY_MS);
  const safeLimit = Math.max(1, Math.min(500, Number(limit || 100)));
  const agg = await ActivityUserProfile.aggregate([
    { $match: { guildId: safeGuildId } },
    { $unwind: "$profile.totals.exp.levelHistory" },
    { $match: { "profile.totals.exp.levelHistory.createdAt": { $gte: since } } },
    { $addFields: { levelGain: { $subtract: ["$profile.totals.exp.levelHistory.afterLevel", "$profile.totals.exp.levelHistory.beforeLevel"] } } },
    { $match: { levelGain: { $gt: 0 } } },
    { $group: { _id: "$userId", levelGain: { $sum: "$levelGain" } } },
    { $sort: { levelGain: -1 } },
    { $limit: safeLimit },
  ]).catch(() => []);
  return agg.map((x?) => ({ userId: String(x._id || ""), levelGain: Math.max(0, Math.floor(Number(x.levelGain || 0))) }));
}

function getRomeOffsetMsForExp(utcDate?) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const zoneName = formatter.formatToParts(utcDate).find((part?) => part.type === "timeZoneName")?.value;
  const match = String(zoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocalForExp(year?, month?, day?, hour?, minute?, second?) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffsetMs = getRomeOffsetMsForExp(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMsForExp(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
  return new Date(utcMs);
}

function getRomeDayUtcBoundsFromContestDayKey(dayKey?) {
  const m = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const start = createUtcFromRomeLocalForExp(y, mo, d, 0, 0, 0);
  const end = createUtcFromRomeLocalForExp(y, mo, d + 1, 0, 0, 0);
  return { start, end };
}

function getRomeActivityWindowUntil21UtcBounds(dayKey?) {
  const m = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const start = createUtcFromRomeLocalForExp(y, mo, d, 0, 0, 0);
  const end = createUtcFromRomeLocalForExp(y, mo, d, 21, 0, 0);
  return { start, end };
}

function levelHistoryEntryTimeMs(entry?) {
  const raw = entry?.createdAt;
  if (raw == null) return NaN;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(t) ? t : NaN;
}

async function sumExpDeltaFromLevelHistoryForRomeDay(guildId?, dayKey?, userIds?, options: Record<string, any> = {}) {
  const safeGuildId = String(guildId || "").trim();
  const bounds = options?.until21
    ? getRomeActivityWindowUntil21UtcBounds(dayKey)
    : getRomeDayUtcBoundsFromContestDayKey(dayKey);
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((id?) => String(id || "").trim()).filter(Boolean))];
  const out = new Map();
  for (const id of ids) out.set(id, 0);
  if (!safeGuildId || !bounds || !ids.length) return out;
  const startMs = bounds.start.getTime();
  const endMs = bounds.end.getTime();
  const docs = await ActivityUserProfile.find({ guildId: safeGuildId, userId: { $in: ids } })
    .select("userId profile.totals.exp.levelHistory")
    .lean()
    .catch(() => []);
  for (const doc of docs || []) {
    const uid = String(doc?.userId || "");
    if (!uid) continue;
    const hist = doc?.profile?.totals?.exp?.levelHistory;
    if (!Array.isArray(hist) || !hist.length) continue;
    let sum = 0;
    for (const e of hist) {
      const t = levelHistoryEntryTimeMs(e);
      if (!Number.isFinite(t) || t < startMs || t >= endMs) continue;
      sum += Math.floor(Number(e?.deltaExp || 0));
    }
    out.set(uid, sum);
  }
  return out;
}

export = { MESSAGE_EXP, VOICE_EXP_PER_MINUTE, isLevelExpGuild, ACTIVITY_MAIN_GUILD_ID, addExp, addExpWithLevel, getUserExpStats, getUserRanks, getLevelInfo, getTotalExpForLevel, getGlobalMultiplier, setGlobalMultiplier, setTemporaryEventMultiplier, getGuildExpSettings, invalidateSettingsCache, setLevelChannelLocked, setRoleIgnored, setRoleExpMultiplier, shouldIgnoreExpForMember, recordLevelHistory, getRecentLevelHistory, getLevelHistoryPage, syncLevelRolesForMember, retroSyncGuildLevels, healMissingLevelRoles, healLevelRolesForGuildOnStartup, getRoleMultiplier, combineWeeklyExpMultiplier, getResolvedWeeklyExpMultiplier, getCurrentWeekKey, getIsoWeekKey, incrementMinigameWinCounters, ROLE_MULTIPLIERS, scheduleEventLevelUpMessage, sendLevelUpMessage, sendLevelUpAnnouncement, getTopExpGainsInPeriod, getTopLevelGainsInPeriod, PERIOD_LOOKBACK_DAYS, sumExpDeltaFromLevelHistoryForRomeDay };