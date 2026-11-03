/** EXP: statistiche e posizioni dell'utente, riallineamento dei livelli. */
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { isValidGuildUserId } = require("../../../shared/db/validateWriteIds") as typeof import("../../../shared/db/validateWriteIds");
const { getIsoWeekKey, getLevelInfo, repairExpTotals } = require("./expLevels") as typeof import("./expLevels");
const { syncLevelRolesForMember } = require("./expRoles") as typeof import("./expRoles");

function ensureWeeklyExp(expObj?, now?) {
  if (!expObj || typeof expObj !== "object") return;
  const weekKey = getIsoWeekKey(now);
  if (expObj.weeklyKey !== weekKey) {
    expObj.weeklyKey = weekKey;
    expObj.weeklyExp = 0;
  }
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

export = { ensureWeeklyExp, getUserExpStats, getUserRanks, retroSyncGuildLevels };
