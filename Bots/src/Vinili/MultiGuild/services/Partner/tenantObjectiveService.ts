const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../../Schemas/Community/communitySchemas") as typeof import("../../../Schemas/Community/communitySchemas");
const { OBJECTIVE_DEFS } = require("../../utils/Partner/tenantObjectiveDefs") as typeof import("../../utils/Partner/tenantObjectiveDefs");
const { OBJECTIVE_COPY } = require("../../utils/Partner/tenantProfileConstants") as typeof import("../../utils/Partner/tenantProfileConstants");
const { t, resolveTenantLanguage } = require("../../utils/Partner/tenantPartnershipI18n/index") as typeof import("../../utils/Partner/tenantPartnershipI18n/index");
const {
  getUserPartnershipScores,
  fetchLeaderboardRows,
  findRankEntry,
  aggregateGlobalPartnersScores,
} = require("./tenantLeaderboardService") as typeof import("./tenantLeaderboardService");
const { getPartnerLeaderboardWeekBoundsUtc } = require("../../../Services/Staff/weeklyStaffResocontoService") as typeof import("../../../Services/Staff/weeklyStaffResocontoService");
const { getRomeDayKey } = require("./tenantPartnershipJoinStatsService") as typeof import("./tenantPartnershipJoinStatsService");
const { sendUserDirectMessage } = require("../../../../shared/discord/dmPrivacyNotice") as typeof import("../../../../shared/discord/dmPrivacyNotice");
const IDs = require("../../../Utils/Config/ids") as typeof import("../../../Utils/Config/ids");
const {
  getPartnershipConfigSync,
  getAllPartnershipConfigCacheRows,
  isPartnershipSetupComplete,
} = require("../../../MultiGuild/core/tenantPartnershipSettings") as typeof import("../../../MultiGuild/core/tenantPartnershipSettings");
const { getTenantProfilePrefs } = require("./tenantProfilePreferencesService") as typeof import("./tenantProfilePreferencesService");
const { userQualifiesForTenantMissions } = require("../../../Utils/Partner/partnershipConfigResolver") as typeof import("../../../Utils/Partner/partnershipConfigResolver");
const {
  getTenantPartnershipStorageGuildId,
  loadCanonicalTenantPartnershipRows,
  readGuildFlags,
  splitStatsForPersist,
} = require("./tenantPartnershipProgressStore") as typeof import("./tenantPartnershipProgressStore");

const EMPTY_STATS = Object.freeze({
  topDailyPeriods: [],
  topWeeklyPeriods: [],
  topGlobalPeriods: [],
  bugReports: 0,
  bestGlobalRank: null,
  flags: {
    setupDone: false,
    descSet: false,
    thankYouSet: false,
    privacySet: false,
  },
});

function normalizeStats(raw?) {
  const src = raw && typeof raw === "object" ? raw : {};
  const flagsSrc = src.flags && typeof src.flags === "object" ? src.flags : {};
  const best = Number(src.bestGlobalRank);
  return {
    topDailyPeriods: Array.isArray(src.topDailyPeriods)
      ? src.topDailyPeriods.map((v?) => String(v || "").trim()).filter(Boolean)
      : [],
    topWeeklyPeriods: Array.isArray(src.topWeeklyPeriods)
      ? src.topWeeklyPeriods.map((v?) => String(v || "").trim()).filter(Boolean)
      : [],
    topGlobalPeriods: Array.isArray(src.topGlobalPeriods)
      ? src.topGlobalPeriods.map((v?) => String(v || "").trim()).filter(Boolean)
      : [],
    bugReports: Math.max(0, Math.floor(Number(src.bugReports) || 0)),
    bestGlobalRank: Number.isFinite(best) && best > 0 ? best : null,
    flags: {
      setupDone: flagsSrc.setupDone === true,
      descSet: flagsSrc.descSet === true,
      thankYouSet: flagsSrc.thankYouSet === true,
      privacySet: flagsSrc.privacySet === true,
    },
  };
}

function mergeCompletedLists(...lists) {
  const set = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const id of list) {
      const value = String(id || "").trim();
      if (value) set.add(value);
    }
  }
  return set;
}

function applyContextGuildFlags(stats?, rawStats?, contextGuildId?, legacyObjectiveStats?) {
  const ctxFlags = readGuildFlags(rawStats, contextGuildId);
  const flatCanon = rawStats?.flags && typeof rawStats.flags === "object" ? rawStats.flags : {};
  const legacyNorm = legacyObjectiveStats ? normalizeStats(legacyObjectiveStats) : null;
  const legacyFlat: any = legacyNorm?.flags || {};
  return {
    ...stats,
    flags: {
      ...stats.flags,
      setupDone:
        ctxFlags.setupDone === true ||
        flatCanon.setupDone === true ||
        legacyFlat.setupDone === true,
      descSet:
        ctxFlags.descSet === true || flatCanon.descSet === true || legacyFlat.descSet === true,
      thankYouSet:
        ctxFlags.thankYouSet === true ||
        flatCanon.thankYouSet === true ||
        legacyFlat.thankYouSet === true,
    },
  };
}

function mergeObjectiveStats(canonicalStats?, legacyStats?, rawCanonicalStats?, contextGuildId?) {
  const base = normalizeStats(canonicalStats);
  const legacy = legacyStats ? normalizeStats(legacyStats) : null;
  if (!legacy) {
    return applyContextGuildFlags(base, rawCanonicalStats, contextGuildId, null);
  }

  const merged = {
    topDailyPeriods: [...new Set([...base.topDailyPeriods, ...legacy.topDailyPeriods])],
    topWeeklyPeriods: [...new Set([...base.topWeeklyPeriods, ...legacy.topWeeklyPeriods])],
    topGlobalPeriods: [...new Set([...base.topGlobalPeriods, ...legacy.topGlobalPeriods])],
    bugReports: Math.max(base.bugReports, legacy.bugReports),
    bestGlobalRank: base.bestGlobalRank,
    flags: {
      privacySet: base.flags.privacySet || legacy.flags.privacySet,
      setupDone: false,
      descSet: false,
      thankYouSet: false,
    },
  };
  if (legacy.bestGlobalRank && (!merged.bestGlobalRank || legacy.bestGlobalRank < merged.bestGlobalRank)) {
    merged.bestGlobalRank = legacy.bestGlobalRank;
  }
  return applyContextGuildFlags(merged, rawCanonicalStats, contextGuildId, legacy);
}

async function loadObjectiveState(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) {
    return { completed: new Set(), stats: { ...EMPTY_STATS, flags: { ...EMPTY_STATS.flags } } };
  }
  const { canonical, legacy, contextGuildId } = await loadCanonicalTenantPartnershipRows(
    gid,
    uid,
    "profile.tenantPartnership.objectivesCompleted profile.tenantPartnership.objectiveStats",
  );
  const canonicalTp = canonical?.profile?.tenantPartnership || {};
  const legacyTp = legacy?.profile?.tenantPartnership || {};
  const completed = mergeCompletedLists(canonicalTp.objectivesCompleted, legacyTp.objectivesCompleted);
  const stats = mergeObjectiveStats(
    canonicalTp.objectiveStats,
    legacyTp.objectiveStats,
    canonicalTp.objectiveStats,
    contextGuildId,
  );
  return { completed, stats };
}

function appearancesKey(scope?) {
  if (scope === "daily") return "topDailyPeriods";
  if (scope === "weekly") return "topWeeklyPeriods";
  return "topGlobalPeriods";
}

function getObjectiveProgressValue(def?, scores?, stats?) {
  switch (def.kind) {
    case "flag":
      return stats.flags?.[def.flag] ? 1 : 0;
    case "count":
      return Math.max(0, Number(scores?.total) || 0);
    case "counter":
      return Math.max(0, Number(stats?.[def.counter]) || 0);
    case "appearances": {
      const key = appearancesKey(def.scope);
      return Array.isArray(stats?.[key]) ? stats[key].length : 0;
    }
    case "rank":
      return stats.bestGlobalRank != null ? stats.bestGlobalRank : 0;
    default:
      return 0;
  }
}

function isObjectiveDone(def?, scores?, stats?, completed?) {
  if (completed.has(def.id)) return true;
  switch (def.kind) {
    case "flag":
      return Boolean(stats.flags?.[def.flag]);
    case "count":
      return getObjectiveProgressValue(def, scores, stats) >= def.target;
    case "counter":
      return getObjectiveProgressValue(def, scores, stats) >= def.target;
    case "appearances":
      return getObjectiveProgressValue(def, scores, stats) >= def.target;
    case "rank":
      return stats.bestGlobalRank != null && stats.bestGlobalRank <= def.maxRank;
    default:
      return false;
  }
}

function buildObjectiveProgress(def?, scores?, stats?, completed?) {
  const done = isObjectiveDone(def, scores, stats, completed);
  let current = 0;
  let target = 1;
  if (def.kind === "count" || def.kind === "counter" || def.kind === "appearances") {
    current = getObjectiveProgressValue(def, scores, stats);
    target = Math.max(1, Number(def.target) || 1);
  } else if (def.kind === "rank") {
    current = stats.bestGlobalRank != null ? stats.bestGlobalRank : 0;
    target = def.maxRank;
    return { current, target, done };
  } else {
    current = done ? 1 : 0;
    target = 1;
  }
  return { current: Math.min(current, target), target, done };
}

function objectiveMeta(def?, lang?) {
  const copy = OBJECTIVE_COPY[lang] || OBJECTIVE_COPY.it || OBJECTIVE_COPY.en;
  const meta = copy[def.id] || {};
  return {
    id: def.id,
    emoji: def.emoji || meta.emoji || "🎯",
    title: meta.title || def.id,
    desc: meta.desc || "",
  };
}

function getWeeklyPeriodKey(date = new Date()) {
  const bounds = getPartnerLeaderboardWeekBoundsUtc(date);
  return bounds.weekStart.toISOString().slice(0, 10);
}

async function refreshLeaderboardObjectiveStats(guildId?, userId?, stats?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return stats;

  const next = normalizeStats(stats);
  const dayKey = getRomeDayKey(new Date());
  const weekKey = getWeeklyPeriodKey(new Date());

  const dailyRows = await fetchLeaderboardRows("partners", "daily", gid);
  const dailyEntry = findRankEntry(dailyRows, (row?) => String(row.userId) === uid);
  if (dailyEntry && !next.topDailyPeriods.includes(dayKey)) {
    next.topDailyPeriods.push(dayKey);
  }

  const weeklyRows = await fetchLeaderboardRows("partners", "weekly", gid);
  const weeklyEntry = findRankEntry(weeklyRows, (row?) => String(row.userId) === uid);
  if (weeklyEntry && !next.topWeeklyPeriods.includes(weekKey)) {
    next.topWeeklyPeriods.push(weekKey);
  }

  const globalRows = await aggregateGlobalPartnersScores("total");
  const globalEntry = findRankEntry(globalRows, (row?) => String(row.userId) === uid);
  if (globalEntry) {
    if (!next.topGlobalPeriods.includes(dayKey)) {
      next.topGlobalPeriods.push(dayKey);
    }
    if (!next.bestGlobalRank || globalEntry.rank < next.bestGlobalRank) {
      next.bestGlobalRank = globalEntry.rank;
    }
  }

  return next;
}

async function persistObjectiveStats(guildId?, userId?, stats?) {
  const contextGuildId = String(guildId || "").trim();
  const storageGid = getTenantPartnershipStorageGuildId(contextGuildId);
  const uid = String(userId || "").trim();
  if (!storageGid || !uid) return;
  const normalized = normalizeStats(stats);
  const { objectiveStats, guildFlagsPath, guildFlagsRow } = splitStatsForPersist(contextGuildId, normalized);
  await ActivityUserProfile.updateOne(
    { guildId: storageGid, userId: uid },
    {
      $set: {
        "profile.tenantPartnership.objectiveStats.topDailyPeriods": objectiveStats.topDailyPeriods,
        "profile.tenantPartnership.objectiveStats.topWeeklyPeriods": objectiveStats.topWeeklyPeriods,
        "profile.tenantPartnership.objectiveStats.topGlobalPeriods": objectiveStats.topGlobalPeriods,
        "profile.tenantPartnership.objectiveStats.bugReports": objectiveStats.bugReports,
        "profile.tenantPartnership.objectiveStats.bestGlobalRank": objectiveStats.bestGlobalRank,
        "profile.tenantPartnership.objectiveStats.flags": objectiveStats.flags,
        [guildFlagsPath]: guildFlagsRow,
      },
      $setOnInsert: { guildId: storageGid, userId: uid },
    },
    { upsert: true },
  ).catch(() => null);
}

async function markObjectiveCompleted(guildId?, userId?, objectiveId?) {
  const storageGid = getTenantPartnershipStorageGuildId(guildId);
  const uid = String(userId || "").trim();
  const id = String(objectiveId || "").trim();
  if (!storageGid || !uid || !id) return false;
  const result = await ActivityUserProfile.updateOne(
    {
      guildId: storageGid,
      userId: uid,
      "profile.tenantPartnership.objectivesCompleted": { $ne: id },
    },
    {
      $addToSet: { "profile.tenantPartnership.objectivesCompleted": id },
      $setOnInsert: { guildId: storageGid, userId: uid },
    },
    { upsert: true },
  ).catch(() => null);
  return Boolean(result?.modifiedCount || result?.upsertedCount);
}

async function sendObjectiveUnlockDm(client?, guildId?, userId?, meta?, lang?) {
  if (!client || !userId) return false;
  const user = client.users?.cache?.get(userId) || (await client.users.fetch(userId).catch(() => null));
  if (!user) return false;
  const embed = new EmbedBuilder()
    .setColor("#2f3136")
    .setDescription(`${meta.emoji} ${t(lang, "objectiveUnlockedDm", { title: meta.title })}`);
  return sendUserDirectMessage(
    user,
    { embeds: [embed] },
    {
      client,
      guildId,
      commandsChannelId: IDs.channels?.commands,
    },
  );
}

async function syncObjectiveFlagsFromTenantState(client?, guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!client || !gid || !uid) return false;
  if (!(await userQualifiesForTenantMissions(client, uid))) return false;

      const configs = [];
  const primary = getPartnershipConfigSync(gid);
  if (primary) configs.push(primary);
  try {
    for (const cfg of getAllPartnershipConfigCacheRows()) {
      if (cfg) configs.push(cfg);
    }
  } catch (_) {}

  const prefs = await getTenantProfilePrefs(gid, uid);
  const state = await loadObjectiveState(gid, uid);
  const stats = normalizeStats(state.stats);
  let changed = false;

  for (const config of configs) {
    if (isPartnershipSetupComplete(config) && !stats.flags.setupDone) {
      stats.flags.setupDone = true;
      changed = true;
    }
    if (config?.partnerDesc?.configured && !stats.flags.descSet) {
      stats.flags.descSet = true;
      changed = true;
    }
        if (config?.thankYouEmbed?.enabled === true && !stats.flags.thankYouSet) {
      stats.flags.thankYouSet = true;
      changed = true;
    }
  }
  if (prefs.ephemeralCommands === true && !stats.flags.privacySet) {
    stats.flags.privacySet = true;
    changed = true;
  }

  if (!changed) return false;
  await persistObjectiveStats(gid, uid, stats);
  return true;
}

async function evaluateTenantObjectives(client?, guildId?, userId?, options: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return [];
  if (!(await userQualifiesForTenantMissions(client, uid))) return [];

  const lang = await resolveTenantLanguage(gid, uid, {
    client,
    discordLocale: options.discordLocale,
    userId: uid,
  });

  const [scores, state] = await Promise.all([
    getUserPartnershipScores(uid),
    loadObjectiveState(gid, uid),
  ]);

  let stats = state.stats;
  if (options.refreshLeaderboard !== false) {
    stats = await refreshLeaderboardObjectiveStats(gid, uid, stats);
    await persistObjectiveStats(gid, uid, stats);
  }

  const completed = new Set(state.completed);
  const newlyUnlocked = [];

  for (const def of OBJECTIVE_DEFS) {
    if (completed.has(def.id)) continue;
    if (!isObjectiveDone(def, scores, stats, completed)) continue;

    const added = await markObjectiveCompleted(gid, uid, def.id);
    if (!added) {
      completed.add(def.id);
      continue;
    }

    completed.add(def.id);
    const meta = objectiveMeta(def, lang);
    newlyUnlocked.push(meta);
    if (!options.silent) {
      void sendObjectiveUnlockDm(client, gid, uid, meta, lang).catch(() => null);
    }
  }

  return newlyUnlocked;
}

async function setTenantObjectiveFlag(client?, guildId?, userId?, flagName?, options: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const flag = String(flagName || "").trim();
  if (!gid || !uid || !flag) return [];
  if (!(await userQualifiesForTenantMissions(client, uid))) return [];
  const allowed = new Set(["setupDone", "descSet", "thankYouSet", "privacySet"]);
  if (!allowed.has(flag)) return [];

  const state = await loadObjectiveState(gid, uid);
  const stats = normalizeStats(state.stats);
  if (stats.flags[flag]) {
    return evaluateTenantObjectives(client, gid, uid, { ...options, refreshLeaderboard: false });
  }
  stats.flags[flag] = true;
  await persistObjectiveStats(gid, uid, stats);
  return evaluateTenantObjectives(client, gid, uid, { ...options, refreshLeaderboard: flag !== "setupDone" });
}

async function recordTenantBugReport(client?, guildId?, userId?, options: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return [];
  if (!(await userQualifiesForTenantMissions(client, uid))) return [];

  const state = await loadObjectiveState(gid, uid);
  const stats = normalizeStats(state.stats);
  stats.bugReports += 1;
  await persistObjectiveStats(gid, uid, stats);
  return evaluateTenantObjectives(client, gid, uid, { ...options, refreshLeaderboard: false });
}

function listObjectivesFromState(scores?, stats?, completed?, lang?) {
  const copy = OBJECTIVE_COPY[lang] || OBJECTIVE_COPY.it || OBJECTIVE_COPY.en;
  return OBJECTIVE_DEFS.map((def?) => {
    const progress = buildObjectiveProgress(def, scores, stats, completed);
    const meta = copy[def.id] || {};
    return {
      ...def,
      emoji: def.emoji || meta.emoji || "🎯",
      title: meta.title || def.id,
      desc: meta.desc || "",
      progress,
    };
  });
}

function listUnlockedBadgesFromObjectives(scores?, stats?, completed?, lang?) {
  const copy = OBJECTIVE_COPY[lang] || OBJECTIVE_COPY.it || OBJECTIVE_COPY.en;
  return OBJECTIVE_DEFS.filter((def?) => isObjectiveDone(def, scores, stats, completed)).map((def?) => {
    const meta = copy[def.id] || {};
    return {
      id: def.id,
      emoji: def.emoji || meta.emoji || "🎯",
      title: meta.title || def.id,
      desc: meta.desc || "",
    };
  });
}

function emptyObjectiveProgressState() {
  return { completed: new Set(), stats: normalizeStats(null) };
}

function listObjectivesForDisplay(scores?, objectiveState?, lang?, qualifiesForMissions?) {
  if (!qualifiesForMissions) {
    const empty = emptyObjectiveProgressState();
    const zeroScores = { total: 0, daily: 0, weekly: 0, points: 0, earned: 0, partnerships: 0 };
    return listObjectivesFromState(zeroScores, empty.stats, empty.completed, lang);
  }
  return listObjectivesFromState(scores, objectiveState.stats, objectiveState.completed, lang);
}

function listBadgesForDisplay(scores?, objectiveState?, lang?, qualifiesForMissions?) {
  if (!qualifiesForMissions) {
    const empty = emptyObjectiveProgressState();
    const zeroScores = { total: 0, daily: 0, weekly: 0, points: 0, earned: 0, partnerships: 0 };
    return listUnlockedBadgesFromObjectives(zeroScores, empty.stats, empty.completed, lang);
  }
  return listUnlockedBadgesFromObjectives(
    scores,
    objectiveState.stats,
    objectiveState.completed,
    lang,
  );
}

export = {
  loadObjectiveState,
  listObjectivesFromState,
  listUnlockedBadgesFromObjectives,
  listObjectivesForDisplay,
  listBadgesForDisplay,
  emptyObjectiveProgressState,
  syncObjectiveFlagsFromTenantState,
  evaluateTenantObjectives,
  setTenantObjectiveFlag,
  recordTenantBugReport,
  buildObjectiveProgress,
  isObjectiveDone,
};
