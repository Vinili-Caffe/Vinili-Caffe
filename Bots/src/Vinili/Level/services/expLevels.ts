/** EXP: livelli (EXP per livello, info, correzioni dei totali). */
const { ACTIVITY_MAIN_GUILD_ID } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

const TIME_ZONE = "Europe/Rome";

function isDiscordSnowflake(value?) {
  return /^\d{16,20}$/.test(String(value || "").trim());
}

function normalizeExpGuildId(guildOrId?) {
  if (guildOrId && typeof guildOrId === "object" && guildOrId.id) return String(guildOrId.id).trim();
  return String(guildOrId || "").trim();
}

function isLevelExpGuild(guildOrId?) {
  const gid = normalizeExpGuildId(guildOrId);
  if (!gid) return false;
  /* modulo "livelli" acceso dalla dashboard → EXP su quel server (opt-in) */
  try {
    const { isModuleOn } = require("../../../MultiGuild/core/moduleSwitches") as typeof import("../../../MultiGuild/core/moduleSwitches");
    return isModuleOn(gid, "livelli");
  } catch {
    const mainId = String(ACTIVITY_MAIN_GUILD_ID || IDs.guilds?.main || "").trim();
    return Boolean(mainId && gid === mainId);
  }
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

function resolveLevelCurve() {
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    return LVL.getLevelCurveSync(String(IDs.guilds?.main || ""));
  } catch {
    return null;
  }
}

function roundToNearest(value?, roundTo = 50) {
  const step = Math.max(1, Math.floor(Number(roundTo) || 50));
  return Math.round(Number(value || 0) / step) * step;
}

function roundToNearest50(value?) {
  const curve = resolveLevelCurve();
  return roundToNearest(value, curve?.roundTo ?? 50);
}

function getLevelStep(level?) {
  const safeLevel = Math.max(1, Math.floor(Number(level || 1)));
  const curve = resolveLevelCurve();
  const segments = Array.isArray(curve?.segments) ? curve.segments : null;
  if (segments?.length) {
    for (const seg of segments) {
      if (safeLevel <= Number(seg.upTo)) {
        const from = Math.max(0, Math.floor(Number(seg.from) || 0));
        return Math.max(0, Math.floor(Number(seg.base) || 0) + (safeLevel - from) * Math.floor(Number(seg.perLevel) || 0));
      }
    }
    const last = segments[segments.length - 1];
    const from = Math.max(0, Math.floor(Number(last.from) || 0));
    return Math.max(0, Math.floor(Number(last.base) || 0) + (safeLevel - from) * Math.floor(Number(last.perLevel) || 0));
  }
  if (safeLevel <= 10) return 120 + (safeLevel - 1) * 25;
  if (safeLevel <= 30) return 380 + (safeLevel - 10) * 55;
  if (safeLevel <= 60) return 1600 + (safeLevel - 30) * 120;
  return 5200 + (safeLevel - 60) * 210;
}

function getLevelInfo(totalExp?) {
  const curve = resolveLevelCurve();
  const firstThreshold = Math.max(1, Math.floor(Number(curve?.firstThreshold) || 100));
  const minStepAdd = Math.max(0, Math.floor(Number(curve?.minStepAdd) || 110));
  const roundTo = Math.max(1, Math.floor(Number(curve?.roundTo) || 50));
  const exp = Math.max(0, Math.floor(Number(totalExp || 0)));
  let level = 0;
  let currentLevelExp = 0;
  let nextThreshold = firstThreshold;
  while (exp >= nextThreshold) {
    level += 1;
    currentLevelExp = nextThreshold;
    const step = getLevelStep(level);
    nextThreshold = roundToNearest(nextThreshold + Math.max(minStepAdd, step), roundTo);
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
  const curve = resolveLevelCurve();
  const firstThreshold = Math.max(1, Math.floor(Number(curve?.firstThreshold) || 100));
  const minStepAdd = Math.max(0, Math.floor(Number(curve?.minStepAdd) || 110));
  const roundTo = Math.max(1, Math.floor(Number(curve?.roundTo) || 50));
  const targetLevel = Math.max(0, Math.floor(Number(level || 0)));
  if (targetLevel <= 0) return 0;
  let threshold = firstThreshold;
  for (let l = 1; l < targetLevel; l += 1) {
    threshold = roundToNearest(threshold + Math.max(minStepAdd, getLevelStep(l)), roundTo);
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

export = { TIME_ZONE, isDiscordSnowflake, isLevelExpGuild, formatMemberMention, getIsoWeekKey, getCurrentWeekKey, getLevelInfo, getTotalExpForLevel, repairExpTotals, resolveLevelUpAnnounceLevel };
