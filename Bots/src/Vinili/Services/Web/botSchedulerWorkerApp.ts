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
const {
  runScheduledEnds,
  scheduleActiveGiveawayEnds,
  syncActiveGiveawayButtons,
} = require("../Giveaway/giveawayService") as typeof import("../Giveaway/giveawayService");
const { startModCaseLifecycleLoop } = require("../Moderation/modCaseLifecycleService") as typeof import("../Moderation/modCaseLifecycleService");
const { startCustomRoleExpiryLoop } = require("../Community/customRoleExpiryService") as typeof import("../Community/customRoleExpiryService");
const { runDueChannelReminders } = require("../Reminders/channelReminderService") as typeof import("../Reminders/channelReminderService");
const { startTenantOfflineRecoveryLoop } = require("../../MultiGuild/services/Partner/tenantOfflineRecoveryService") as typeof import("../../MultiGuild/services/Partner/tenantOfflineRecoveryService");
const { isMultiGuildLayerEnabled } = require("../../MultiGuild/core/env") as typeof import("../../MultiGuild/core/env");
const { tickStaffCompitiDeadlines, tickStaffCompitiAssignments } = require("../../Web/siteStaffCompitiApi") as typeof import("../../Web/siteStaffCompitiApi");

loadDotEnv();
process.env.BOT_SCHEDULER_WORKER = "1";
installConsoleLogger();
installWorkerEmbedPatches();

async function main(shared?: { client?: any } | null) {
  const mongo = resolveMongoUrl();
  if (!mongo) {
    console.error("[BOT-SCHEDULER] Missing MONGO_URL / MONGODB_URI");
    process.exit(1);
  }
  const token = resolveDiscordToken();
  if (!token) {
    console.error("[BOT-SCHEDULER] Missing DISCORD_TOKEN");
    process.exit(1);
  }

  const config = loadVinylsConfig();
  if (mongoose.connection.readyState === 0) await mongoose.connect(mongo, {
    maxPoolSize: 6,
    serverSelectionTimeoutMS: 12_000,
  });
  console.log("[BOT-SCHEDULER] Mongo connected");

  const client = shared?.client || (await createSiteApiRestClient(config, token));
  global.botClient = client;

  startModCaseLifecycleLoop(client);
  startCustomRoleExpiryLoop(client);

  const giveawayTick = () =>
    runScheduledEnds(client).catch((e?) => {
      const isMongoNetwork =
        e?.name === "MongoNetworkTimeoutError" || e?.name === "MongoServerSelectionError";
      global.logger?.warn?.(
        "[BOT-SCHEDULER][GIVEAWAY]",
        isMongoNetwork ? "MongoDB timeout, retry next run." : e?.message || e,
      );
    });

  scheduleActiveGiveawayEnds(client).catch((e?) =>
    global.logger?.warn?.("[BOT-SCHEDULER][GIVEAWAY] schedule", e?.message || e),
  );
  syncActiveGiveawayButtons(client).catch((e?) =>
    global.logger?.warn?.("[BOT-SCHEDULER][GIVEAWAY] sync buttons", e?.message || e),
  );
  giveawayTick();
  const giveawayTimer = setInterval(giveawayTick, 60 * 1000);
  giveawayTimer.unref?.();

  let reminderBusy = false;
  const reminderTick = async () => {
    if (reminderBusy) return;
    reminderBusy = true;
    try {
      await runDueChannelReminders(client);
    } catch (err) {
      global.logger?.error?.("[BOT-SCHEDULER][REMINDER]", err?.message || err);
    } finally {
      reminderBusy = false;
    }
  };
  reminderTick();
  const reminderTimer = setInterval(reminderTick, 30 * 1000);
  reminderTimer.unref?.();

  let compitiBusy = false;
  const compitiTick = async () => {
    if (compitiBusy) return;
    compitiBusy = true;
    try {
      await tickStaffCompitiDeadlines(client);
      await tickStaffCompitiAssignments(client);
    } catch (err) {
      global.logger?.error?.("[BOT-SCHEDULER][COMPITI]", err?.message || err);
    } finally {
      compitiBusy = false;
    }
  };
  compitiTick();
  const compitiTimer = setInterval(compitiTick, 60 * 1000);
  compitiTimer.unref?.();

  if (isMultiGuildLayerEnabled()) {
    startTenantOfflineRecoveryLoop(client, {
      intervalMs: 15 * 60 * 1000,
      minIntervalMs: 5 * 60 * 1000,
      startupDelayMs: 12_000,
    });
  }

  console.log(
    `[BOT-SCHEDULER] online as ${client.user?.tag || client.user?.username || "bot"}`,
  );
}

/* Avvio da solo oppure dentro un processo condiviso (backgroundWorkersApp / voteIntakeApp) che passa il client. */
if (require.main === module) {
  main().catch((err?) => {
    console.error("[BOT-SCHEDULER] fatal:", err);
    process.exit(1);
  });
}

export = { startBotSchedulerWorker: main };
