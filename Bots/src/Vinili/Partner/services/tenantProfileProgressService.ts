const { getUserPartnershipScores } = require("./tenantLeaderboardService") as typeof import("./tenantLeaderboardService");
const { getTenantProfilePrefs } = require("./tenantProfilePreferencesService") as typeof import("./tenantProfilePreferencesService");
const { resolveTenantLanguage } = require("../i18n/tenantPartnershipI18n/index") as typeof import("../i18n/tenantPartnershipI18n/index");
const { userQualifiesForTenantMissions } = require("../core/partnershipConfigResolver") as typeof import("../core/partnershipConfigResolver");
const {
  loadObjectiveState,
  listObjectivesForDisplay,
  listBadgesForDisplay,
  emptyObjectiveProgressState,
  syncObjectiveFlagsFromTenantState,
  evaluateTenantObjectives,
} = require("./tenantObjectiveService") as typeof import("./tenantObjectiveService");

function computeAwardsPercent(objectives?) {
  if (!objectives.length) return 0;
  const done = objectives.filter((row?) => row.progress?.done).length;
  return Math.round((done / objectives.length) * 100);
}

async function getTenantProfileSnapshot(guildId?, userId?, options: Record<string, any> = {}) {
  const langUserId = String(options.langUserId || userId || "").trim();
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const client = options.client || null;
  const qualifiesForMissions = client
    ? await userQualifiesForTenantMissions(client, uid)
    : false;

      const shouldEvaluate = options.evaluateObjectives !== false;
  if (client && gid && uid && qualifiesForMissions && shouldEvaluate) {
    await syncObjectiveFlagsFromTenantState(client, gid, uid).catch(() => null);
    await evaluateTenantObjectives(client, gid, uid, {
      client,
      discordLocale: options.discordLocale,
      userId: langUserId,
      refreshLeaderboard: options.refreshLeaderboard !== false,
      silent: true,
    }).catch(() => null);
  }

  const [scores, prefs, objectiveState] = await Promise.all([
    getUserPartnershipScores(userId),
    getTenantProfilePrefs(guildId, userId),
    qualifiesForMissions ? loadObjectiveState(guildId, userId) : Promise.resolve(emptyObjectiveProgressState()),
  ]);
  const lang = await resolveTenantLanguage(guildId, langUserId, { ...options, userId: langUserId });
  const objectives = listObjectivesForDisplay(scores, objectiveState, lang, qualifiesForMissions);
  const unlockedBadges = listBadgesForDisplay(scores, objectiveState, lang, qualifiesForMissions);
  const awardsPercent = computeAwardsPercent(objectives);
  return {
    scores,
    prefs,
    lang,
    objectives,
    unlockedBadges,
    awardsPercent,
    badgeMap: new Map(unlockedBadges.map((b?) => [b.id, b])),
    objectiveState,
    qualifiesForMissions,
  };
}

export = {
  getTenantProfileSnapshot,
};
