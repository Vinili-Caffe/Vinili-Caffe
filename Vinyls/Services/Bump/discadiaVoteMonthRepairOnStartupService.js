const cron = require("node-cron");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached");
const mongoose = require("mongoose");
const IDs = require("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { voteCountMonthKeyRome, isFirstCalendarDayRome } = require("../../Utils/romeVoteMonthKey");

const VOTE_LEAF = "profile.totals.exp.bumpVoteRewards.discadia_vote";

function shouldRunDiscadiaVoteMonthRepairOnStartup(client) {
  const envValue = String(process.env.DISCADIA_VOTE_MONTH_REPAIR_ON_STARTUP || "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(envValue)) return false;
  if (client?.config?.discadiaVoteMonthRepairOnStartup === false) return false;
  if (["always", "force", "every"].includes(envValue)) return true;
  return isFirstCalendarDayRome(new Date());
}

function shouldRunDiscadiaVoteMonthRolloverCron(client) {
  const envValue = String(process.env.DISCADIA_VOTE_MONTH_ROLLOVER_CRON || "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(envValue)) return false;
  if (["1", "true", "yes", "on"].includes(envValue)) return true;
  if (client?.config?.discadiaVoteMonthRolloverCron === false) return false;
  return true;
}

/**
 * @param {"startup"|"cron"} mode — cron include anche profili con ultimo voto salvato ma contatori a 0.
 */
async function repairDiscadiaVoteMonthRowsForMainGuild(client, mode = "startup") {
  const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
  if (!guildId) return { matched: 0, modified: 0 };
  const currentKey = voteCountMonthKeyRome(new Date());
  const kPath = `${VOTE_LEAF}.voteCountMonthKey`;
  const staleKey = {
    $or: [{ [kPath]: { $exists: false } }, { [kPath]: "" }, { [kPath]: { $ne: currentKey } }],
  };
  const hasCounters = {
    $or: [
      { [`${VOTE_LEAF}.voteCountTopgg`]: { $gt: 0 } },
      { [`${VOTE_LEAF}.voteCountDiscadia`]: { $gt: 0 } },
      { [`${VOTE_LEAF}.voteCount`]: { $gt: 0 } },
    ],
  };
  const hasVoteActivity = {
    $or: [
      ...hasCounters.$or,
      { [`${VOTE_LEAF}.lastVoteAt`]: { $exists: true, $ne: null } },
      { [`${VOTE_LEAF}.lastVoteAtTopgg`]: { $exists: true, $ne: null } },
      { [`${VOTE_LEAF}.lastVoteAtDiscadia`]: { $exists: true, $ne: null } },
    ],
  };
  const filter =
    mode === "cron"
      ? { guildId, $and: [staleKey, hasVoteActivity] }
      : { guildId, $and: [staleKey, hasCounters] };
  const res = await ActivityUserProfile.updateMany(filter, {
    $set: {
      [`${VOTE_LEAF}.voteCountMonthKey`]: currentKey,
      [`${VOTE_LEAF}.voteCountTopgg`]: 0,
      [`${VOTE_LEAF}.voteCountDiscadia`]: 0,
    },
    $unset: { [`${VOTE_LEAF}.voteCount`]: "" },
  }).catch(() => ({ matchedCount: 0, modifiedCount: 0 }));
  const matched = Number(res?.matchedCount ?? 0);
  const modified = Number(res?.modifiedCount ?? 0);
  const tag = mode === "cron" ? "[DISCADIA_VOTE_MONTH_CRON]" : "[DISCADIA_VOTE_MONTH_REPAIR]";
  global.logger?.info?.(`${tag} guild=${guildId} romeMonth=${currentKey} mode=${mode} matched=${matched} modified=${modified}`);
  return { matched, modified };
}

function startDiscadiaVoteMonthRolloverCron(client) {
  if (!client || client._discadiaVoteMonthRolloverCron) return;
  if (!shouldRunDiscadiaVoteMonthRolloverCron(client)) return;
  client._discadiaVoteMonthRolloverCron = cron.schedule(
    "0 0 1 * *",
    runCronDetached("[DISCADIA_VOTE_MONTH_CRON]", async () => {
      if (mongoose.connection?.readyState !== 1) return;
      await repairDiscadiaVoteMonthRowsForMainGuild(client, "cron");
    }),
    { timezone: "Europe/Rome", noOverlap: true },
  );
}

module.exports = {
  shouldRunDiscadiaVoteMonthRepairOnStartup,
  shouldRunDiscadiaVoteMonthRolloverCron,
  repairDiscadiaVoteMonthRowsForMainGuild,
  startDiscadiaVoteMonthRolloverCron,
};