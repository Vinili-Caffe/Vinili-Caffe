/**
 * Worker esterno: poll HTTP / sweep pesanti fuori da bots-vinyls.
 * Twitch + Game news + live voice EXP + userFullState + movie night + weekly DM.
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
const { createSiteApiRestClient } = require("./siteApiRestClient") as typeof import("./siteApiRestClient");
const { startTwitchLiveAlertLoop } = require("../Community/twitchLiveAlertService") as typeof import("../Community/twitchLiveAlertService");
const { startGameNewsAlertLoop } = require("../Community/gameNewsAlertService") as typeof import("../Community/gameNewsAlertService");
const { startLiveVoiceExpLoop } = require("../Community/activityService") as typeof import("../Community/activityService");
const { startUserFullStatePersistenceLoop } = require("../Community/userFullStatePersistenceService") as typeof import("../Community/userFullStatePersistenceService");
const { startMovieNightAnnouncementLoop } = require("../Community/movieNightAnnouncementService") as typeof import("../Community/movieNightAnnouncementService");
const { startWeeklyDmReminderLoop } = require("../Community/weeklyDmReminderService") as typeof import("../Community/weeklyDmReminderService");
const { startDailyPartnerAuditLoop } = require("../Partner/partnerAuditService") as typeof import("../Partner/partnerAuditService");

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
  startLiveVoiceExpLoop(client);
  startUserFullStatePersistenceLoop(client);
  startMovieNightAnnouncementLoop(client);
  startWeeklyDmReminderLoop(client);
  startDailyPartnerAuditLoop(client);

  console.log(
    `[COMMUNITY-POLL] online as ${client.user?.tag || client.user?.username || "bot"} (twitch/gamenews/voiceExp/fullState/movieNight/weeklyDm/partnerAudit)`,
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
