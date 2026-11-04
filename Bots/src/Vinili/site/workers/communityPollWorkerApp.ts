/**
 * Worker esterno: poll HTTP / sweep pesanti fuori da bots-vinyls.
 * Twitch + Game news + userFullState + movie night.
 * Live voice EXP resta su bots-vinyls (gateway + cache canali).
 */
const mongoose = require("mongoose") as typeof import("mongoose");
const {
  loadDotEnv,
  loadVinylsConfig,
  resolveMongoUrl,
  resolveDiscordToken,
  installConsoleLogger,
  installWorkerEmbedPatches,
} = require("./workerAppBootstrap") as typeof import("./workerAppBootstrap");
const { createSiteApiRestClient } = require("../http/siteApiRestClient") as typeof import("../http/siteApiRestClient");
const { startTwitchLiveAlertLoop } = require("../../Community/services/twitchLiveAlertService") as typeof import("../../Community/services/twitchLiveAlertService");
const { startGameNewsAlertLoop } = require("../../Community/services/gameNewsAlertService") as typeof import("../../Community/services/gameNewsAlertService");
const { startUserFullStatePersistenceLoop } = require("../../Community/services/userFullStatePersistenceService") as typeof import("../../Community/services/userFullStatePersistenceService");
const { startMovieNightAnnouncementLoop } = require("../../Community/services/movieNightAnnouncementService") as typeof import("../../Community/services/movieNightAnnouncementService");
const { startDailyPartnerAuditLoop } = require("../../Partner/services/partnerAuditService") as typeof import("../../Partner/services/partnerAuditService");
const { startDailyMemberStatsLoop } = require("../../Community/services/dailyMemberStatsService") as typeof import("../../Community/services/dailyMemberStatsService");
const { startDailyEngagementStatsLoop } = require("../../Community/services/dailyEngagementStatsService") as typeof import("../../Community/services/dailyEngagementStatsService");
const { startDailyChannelMessageStatsLoop } = require("../../Community/services/dailyChannelMessageStatsService") as typeof import("../../Community/services/dailyChannelMessageStatsService");
const { startWeeklyActivityWinnersLoop } = require("../../Community/services/weeklyActivityWinnersService") as typeof import("../../Community/services/weeklyActivityWinnersService");
const { startBirthdayLoop } = require("../../Community/services/birthdayService") as typeof import("../../Community/services/birthdayService");
const { startGlobalExpEventAnnouncementLoop } = require("../../Community/services/globalExpEventAnnouncementService") as typeof import("../../Community/services/globalExpEventAnnouncementService");
const { startVerificationTenureLoop } = require("../../Community/services/communityOpsTenure") as typeof import("../../Community/services/communityOpsTenure");
const { startStreamerStageGuardLoop } = require("../../Community/services/streamerStageGuardService") as typeof import("../../Community/services/streamerStageGuardService");
const { startStafferDellaSettimanaLoop } = require("../../Staff/services/stafferDellaSettimanaService") as typeof import("../../Staff/services/stafferDellaSettimanaService");
const { startWeeklyStaffResocontoLoop } = require("../../Staff/services/weeklyStaffResocontoService") as typeof import("../../Staff/services/weeklyStaffResocontoService");
const { startTestGuildMirrorSyncLoop } = require("../../Partner/services/testGuildMirrorSyncService") as typeof import("../../Partner/services/testGuildMirrorSyncService");
const { startDiscadiaVoteMonthRolloverCron } = require("../../Community/services/discadiaVoteMonthRepairOnStartupService") as typeof import("../../Community/services/discadiaVoteMonthRepairOnStartupService");

loadDotEnv();
process.env.COMMUNITY_POLL_WORKER = "1";
installConsoleLogger();
installWorkerEmbedPatches();

async function main(shared?: { client?: any } | null) {
  const mongo = resolveMongoUrl();
  if (!mongo) {
    console.error("[COMMUNITY-POLL] Missing MONGO_URL / MONGODB_URI");
    process.exit(1);
  }
  const token = resolveDiscordToken();
  if (!token) {
    console.error("[COMMUNITY-POLL] Missing DISCORD_TOKEN");
    process.exit(1);
  }

  const config = loadVinylsConfig();
  if (mongoose.connection.readyState === 0) await mongoose.connect(mongo, {
    maxPoolSize: 4,
    serverSelectionTimeoutMS: 12_000,
  });
  console.log("[COMMUNITY-POLL] Mongo connected");

  const client = shared?.client || await createSiteApiRestClient(config, token, {
    restTimeoutMs: 12_000,
    meAttempts: 5,
  });
  global.botClient = client;

  /* Avvio immediato (niente delay 90s — siamo già un processo dedicato) */
  startTwitchLiveAlertLoop(client);
  startGameNewsAlertLoop(client);
  startUserFullStatePersistenceLoop(client);
  startMovieNightAnnouncementLoop(client);
  startDailyPartnerAuditLoop(client);
  startDailyMemberStatsLoop(client);
  startDailyEngagementStatsLoop(client);
  startDailyChannelMessageStatsLoop(client);
  startWeeklyActivityWinnersLoop(client);
  startBirthdayLoop(client);
  startGlobalExpEventAnnouncementLoop(client);
  startVerificationTenureLoop(client);
  startStreamerStageGuardLoop(client);
  startStafferDellaSettimanaLoop(client);
  startWeeklyStaffResocontoLoop(client);
  startTestGuildMirrorSyncLoop(client);
  try {
    startDiscadiaVoteMonthRolloverCron(client);
  } catch (err) {
    console.error("[COMMUNITY-POLL] discadia month cron:", err?.message || err);
  }

  if (String(process.env.PRESENCE_SUPPORTER_SWEEP_ON_GATEWAY || "1").trim() === "0") {
    const { startPresenceSupporterSweepLoop } = require("../../Community/events/presenceSupporterBootstrap") as typeof import("../../Community/events/presenceSupporterBootstrap");
    startPresenceSupporterSweepLoop(client);
  }

  console.log(
    `[COMMUNITY-POLL] online as ${client.user?.tag || client.user?.username || "bot"} (twitch/gamenews/fullState/movieNight/partnerAudit/stats/cron)`,
  );
}

/* Avvio da solo oppure dentro un processo condiviso (backgroundWorkersApp / voteIntakeApp) che passa il client. */
if (require.main === module) {
  main().catch((err?) => {
    console.error("[COMMUNITY-POLL] fatal:", err);
    process.exit(1);
  });
}

export = { startCommunityPollWorker: main };
