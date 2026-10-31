/** Classifiche utenti: moltiplicatori della settimana e classifiche calcolate. */
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { computeLeaderboardRows } = require("../Utils/Community/leaderboardHelpers") as typeof import("../Utils/Community/leaderboardHelpers");
const { cacheGet, cacheGetOrBuild } = require("./usersLbCache") as typeof import("./usersLbCache");
const { nInt } = require("./usersLbParams") as typeof import("./usersLbParams");

function pctBar(value?, pageMax?) {
  const v = Math.max(0, Number(value) || 0);
  const m = Math.max(1, Number(pageMax) || 1);
  return Math.max(0, Math.min(100, Math.round((v / m) * 100)));
}

function siteRomeDayOverridesFromDoc(doc?, board?, romeDateKey?) {
  if (!doc || (board !== "messages" && board !== "voice")) return {};
  const totals = doc?.profile?.totals || {};
  const dateKey = String(romeDateKey || "").trim();
  const dailyMap = totals?.daily && typeof totals.daily === "object" ? totals.daily : {};
  const hasDayRow = Object.prototype.hasOwnProperty.call(dailyMap, dateKey);
  const dayRow = hasDayRow ? dailyMap[dateKey] || {} : {};
  const dayText = nInt(dayRow?.textCount);
  const dayVoice = nInt(dayRow?.voiceSeconds);
  const fallbackMessagesDaily =
    String(totals?.messagesDailyKey || "").trim() === dateKey ? nInt(totals?.messagesDaily) : 0;
  const fallbackVoiceDaily =
    String(totals?.voiceDailyKey || "").trim() === dateKey ? nInt(totals?.voiceDailySeconds) : 0;
  let liveVoiceSeconds = 0;
  const startedAt = totals?.sessionStartedAt ? new Date(totals.sessionStartedAt).getTime() : NaN;
  if (Number.isFinite(startedAt)) {
    liveVoiceSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  }
  if (board === "messages") {
    return { messagesDaily: Math.max(hasDayRow ? dayText : 0, fallbackMessagesDaily) };
  }
  return {
    voiceDailySeconds: Math.max(hasDayRow ? dayVoice : 0, fallbackVoiceDaily) + liveVoiceSeconds,
  };
}

function sortHourlyBreakdownForBoard(breakdown?, board?) {
  const base = Array.isArray(breakdown) ? breakdown : [];
  if (board === "weekly") return base.slice();
  if (board === "messages") {
    return base.filter((r?) => nInt(r?.textCount) > 0).sort((a?, b?) => nInt(b.textCount) - nInt(a.textCount));
  }
  if (board === "voice") {
    return base.filter((r?) => nInt(r?.voiceSeconds) > 0).sort((a?, b?) => nInt(b.voiceSeconds) - nInt(a.voiceSeconds));
  }
  return base.slice();
}

function buildWeeklyMultiplierSources(member?, settings?, fallbackGlobalExpMultiplier?) {
  const sources = [];
  const globalBase = Number(settings?.baseMultiplier);
  const globalEvent = Number(settings?.eventMultiplier);
  const effectiveGlobal =
    Number.isFinite(globalBase) && globalBase > 0
      ? globalBase * (Number.isFinite(globalEvent) && globalEvent > 0 ? globalEvent : 1)
      : Number(fallbackGlobalExpMultiplier) > 0
        ? Number(fallbackGlobalExpMultiplier)
        : 1;
  const map = settings?.roleMultipliersMerged instanceof Map ? settings.roleMultipliersMerged : new Map();
  const veteranoRoleId = String(IDs.roles?.Veterano || "").trim();

  sources.push({
    key: "base",
    label: "Base",
    type: "base",
    multiplier: Number(Math.max(1, effectiveGlobal).toFixed(2)),
    contribution: Number(Math.max(1, effectiveGlobal).toFixed(2)),
    active: true,
  });

  const roleSources = [];
  let chosenRoleId = "";
  let chosenRoleMultiplier = 1;
  let chosenRoleSpecific = false;
  let veteranoMulti = 1;
  let veteranoPresent = false;

  if (member?.roles?.cache && map.size) {
    for (const [roleId, value] of map.entries()) {
      if (!member.roles.cache.has(roleId)) continue;
      const parsed = Math.max(1, Number(value) || 1);
      if (parsed <= 1) continue;
      const roleObj = member.roles.cache.get(roleId);
      const id = String(roleId || "");
      const isVeterano = Boolean(veteranoRoleId && id === veteranoRoleId);
      if (isVeterano) {
        veteranoPresent = true;
        veteranoMulti = Math.max(veteranoMulti, parsed);
      } else if (parsed > chosenRoleMultiplier || !chosenRoleSpecific) {
        chosenRoleId = id;
        chosenRoleMultiplier = parsed;
        chosenRoleSpecific = true;
      }
      roleSources.push({
        key: "role:" + id,
        label: String(roleObj?.name || "Ruolo bonus"),
        type: "role",
        multiplier: Number(parsed.toFixed(2)),
        contribution: Number((parsed - 1).toFixed(2)),
        color:
          String(roleObj?.hexColor || "").trim() && String(roleObj?.hexColor || "").trim() !== "#000000"
            ? String(roleObj.hexColor || "").trim()
            : "",
        roleId: id,
        position: Number(roleObj?.position || 0),
        isVeterano,
        active: false,
      });
    }
  }

  if (!chosenRoleSpecific && veteranoPresent && veteranoMulti > 1) {
    chosenRoleId = veteranoRoleId;
    chosenRoleMultiplier = veteranoMulti;
  }

  roleSources
    .sort((a?, b?) => {
      if (b.multiplier !== a.multiplier) return b.multiplier - a.multiplier;
      return Number(b.position || 0) - Number(a.position || 0);
    })
    .forEach((row?) => {
      const active = Boolean(chosenRoleId && String(row.roleId) === String(chosenRoleId));
      sources.push({
        key: row.key,
        label: row.label,
        type: row.type,
        multiplier: row.multiplier,
        contribution: row.contribution,
        color: row.color,
        active,
        ...(active && chosenRoleMultiplier > 1 ? { applied: true } : {}),
      });
    });

  return sources;
}

async function getCachedWeeklyHourlySorted(guild?) {
  if (!guild) return [];
  const cacheKey = `v1:${guild.id}:weekly-hourly-sorted`;
  const cached = cacheGet(cacheKey);
  if (Array.isArray(cached)) return cached;
  return cacheGetOrBuild(cacheKey, async () => {
    const breakdown = await computeLeaderboardRows(guild, "weekly", 8000).catch(() => []);
    return sortHourlyBreakdownForBoard(breakdown, "weekly");
  });
}

function peekCachedWeeklyHourlySorted(guild?) {
  if (!guild) return [];
  const cached = cacheGet(`v1:${guild.id}:weekly-hourly-sorted`);
  return Array.isArray(cached) ? cached : [];
}

async function getCachedMonthlyExpSorted(guild?) {
  if (!guild) return [];
  const cacheKey = `v1:${guild.id}:monthly-exp-sorted`;
  const cached = cacheGet(cacheKey);
  if (Array.isArray(cached)) return cached;
  return cacheGetOrBuild(cacheKey, async () => {
    const breakdown = await computeLeaderboardRows(guild, "monthly", 8000).catch(() => []);
    return sortHourlyBreakdownForBoard(breakdown, "weekly");
  });
}

async function getCachedMonthlyActivitySorted(guild?, board?) {
  if (!guild) return [];
  const b = board === "voice" ? "voice" : "messages";
  const cacheKey = `v1:${guild.id}:monthly-activity-${b}`;
  const cached = cacheGet(cacheKey);
  if (Array.isArray(cached)) return cached;
  return cacheGetOrBuild(cacheKey, async () => {
    const breakdown = await computeLeaderboardRows(guild, "monthly", 8000).catch(() => []);
    return sortHourlyBreakdownForBoard(breakdown, b);
  });
}

async function getComputedSortedForBoard(guild?, rankBoard?, rankPeriod?) {
  if (!guild) return [];
  if (rankBoard === "level" && rankPeriod === "weekly") return getCachedWeeklyHourlySorted(guild);
  if (rankBoard === "level" && rankPeriod === "monthly") return getCachedMonthlyExpSorted(guild);
  if (rankBoard === "messages" && rankPeriod === "monthly") return getCachedMonthlyActivitySorted(guild, "messages");
  if (rankBoard === "voice" && rankPeriod === "monthly") return getCachedMonthlyActivitySorted(guild, "voice");
  return [];
}

function computedMetricFromAgg(rankBoard?, rankPeriod?, agg?) {
  if (rankBoard === "level") return nInt(agg?.exp);
  if (rankBoard === "messages") return nInt(agg?.textCount);
  if (rankBoard === "voice") return nInt(agg?.voiceSeconds);
  return 0;
}

function computedOverridesFromAgg(rankBoard?, rankPeriod?, agg?) {
  const v = computedMetricFromAgg(rankBoard, rankPeriod, agg);
  if (rankBoard === "level" && rankPeriod === "weekly") return { weeklyExp: v };
  if (rankBoard === "level" && rankPeriod === "monthly") return { monthlyExp: v };
  if (rankBoard === "messages" && rankPeriod === "monthly") return { messagesMonthly: v };
  if (rankBoard === "voice" && rankPeriod === "monthly") return { voiceMonthlySeconds: v };
  return {};
}

export = { pctBar, siteRomeDayOverridesFromDoc, buildWeeklyMultiplierSources, peekCachedWeeklyHourlySorted, getComputedSortedForBoard, computedMetricFromAgg, computedOverridesFromAgg };
