
const cron = require("node-cron") as typeof import("node-cron");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached") as typeof import("../../../shared/scheduling/cronDetached");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getClientGuildCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { TIME_ZONE, createUtcFromRomeLocal, getLastSunday21BoundaryMsAtOrBefore, buildLast7DaysHourKeys } = require("./winnersTime") as typeof import("./winnersTime");
const { ROYALE_MINIGAME_ROLE_ID, syncRoyaleMinigameTotalRole } = require("./winnersRoles") as typeof import("./winnersRoles");
const { cleanupExpiredMonthlyVoterRewards, reconcileDuplicateActiveMonthlyRewardRoles, cleanupExpiredMonthlyTopRewards } = require("./winnersMonthlyRewards") as typeof import("./winnersMonthlyRewards");
const { publishWeeklyActivityWinners, resetWeeklyActivityCounters } = require("./winnersWeekly") as typeof import("./winnersWeekly");
const { publishMonthlyActivityWinners } = require("./winnersMonthly") as typeof import("./winnersMonthly");


const INFO_CHANNEL_ID = IDs.channels.info;
let royaleMinigameSyncTimer = null;
function scheduleRoyaleMinigameRoleSync(client?, delayMs = 45_000) {
  if (!client || !ROYALE_MINIGAME_ROLE_ID) return;
  if (royaleMinigameSyncTimer) clearTimeout(royaleMinigameSyncTimer);
  royaleMinigameSyncTimer = setTimeout(() => {
    royaleMinigameSyncTimer = null;
    syncRoyaleMinigameTotalRole(client).catch((err?) => {
      global.logger?.warn?.("[ROYALE MINIGAME] sync failed:", err?.message || err);
    });
  }, Math.max(5_000, Number(delayMs) || 45_000));
}

let weeklyActivityWinnersLoopStarted = false;
function startWeeklyActivityWinnersLoop(client?) {
  if (weeklyActivityWinnersLoopStarted) return;
  weeklyActivityWinnersLoopStarted = true;
  cron.schedule(
    "0 21 * * 0",
    runCronDetached("[WEEKLY ACTIVITY]", async () => {
      await publishWeeklyActivityWinners(client);
      const { runCustomVocWeeklyEnforcement } = require("./customVocWeeklyActivityService") as typeof import("./customVocWeeklyActivityService");
      await runCustomVocWeeklyEnforcement(client, { mode: "weekly" });
      await resetWeeklyActivityCounters(client);
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

export = { startWeeklyActivityWinnersLoop, buildLast7DaysHourKeys, createUtcFromRomeLocal, getLastSunday21BoundaryMsAtOrBefore, scheduleRoyaleMinigameRoleSync };
