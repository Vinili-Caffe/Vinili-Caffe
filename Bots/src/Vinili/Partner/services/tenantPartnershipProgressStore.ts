const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");

function getTenantPartnershipStorageGuildId(contextGuildId?) {
  const main = String(IDs?.guilds?.main || "").trim();
  const ctx = String(contextGuildId || "").trim();
  return main || ctx;
}

function isSameGuild(a?, b?) {
  return String(a || "").trim() === String(b || "").trim();
}

function readGuildFlags(rawStats?, contextGuildId?) {
  const stats = rawStats && typeof rawStats === "object" ? rawStats : {};
  const guildFlags = stats.guildFlags && typeof stats.guildFlags === "object" ? stats.guildFlags : {};
  const ctx = String(contextGuildId || "").trim();
  const row = guildFlags[ctx] && typeof guildFlags[ctx] === "object" ? guildFlags[ctx] : {};
  return {
    setupDone: row.setupDone === true,
    descSet: row.descSet === true,
    thankYouSet: row.thankYouSet === true,
  };
}

function splitStatsForPersist(contextGuildId?, stats?) {
  const ctx = String(contextGuildId || "").trim();
  const guildFlagsRow = {
    setupDone: stats.flags.setupDone === true,
    descSet: stats.flags.descSet === true,
    thankYouSet: stats.flags.thankYouSet === true,
  };
  const objectiveStats = {
    topDailyPeriods: stats.topDailyPeriods,
    topWeeklyPeriods: stats.topWeeklyPeriods,
    topGlobalPeriods: stats.topGlobalPeriods,
    bugReports: stats.bugReports,
    bestGlobalRank: stats.bestGlobalRank,
    flags: { privacySet: stats.flags.privacySet === true },
  };
  return {
    objectiveStats,
    guildFlagsPath: `profile.tenantPartnership.objectiveStats.guildFlags.${ctx}`,
    guildFlagsRow,
  };
}

async function loadCanonicalTenantPartnershipRows(contextGuildId?, userId?, select?) {
  const uid = String(userId || "").trim();
  const ctx = String(contextGuildId || "").trim();
  const storageGid = getTenantPartnershipStorageGuildId(ctx);
  if (!uid || !storageGid) {
    return { storageGid, contextGuildId: ctx, canonical: null, legacy: null };
  }

  const canonicalPromise = ActivityUserProfile.findOne({ guildId: storageGid, userId: uid })
    .select(select)
    .lean()
    .catch(() => null);

  if (isSameGuild(storageGid, ctx)) {
    const canonical = await canonicalPromise;
    return { storageGid, contextGuildId: ctx, canonical, legacy: null };
  }

  const [canonical, legacy] = await Promise.all([
    canonicalPromise,
    ActivityUserProfile.findOne({ guildId: ctx, userId: uid }).select(select).lean().catch(() => null),
  ]);
  return { storageGid, contextGuildId: ctx, canonical, legacy };
}

export = {
  getTenantPartnershipStorageGuildId,
  readGuildFlags,
  splitStatsForPersist,
  loadCanonicalTenantPartnershipRows,
};
