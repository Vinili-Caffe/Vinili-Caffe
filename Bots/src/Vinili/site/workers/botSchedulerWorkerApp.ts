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
const {
  runScheduledEnds,
  scheduleActiveGiveawayEnds,
  syncActiveGiveawayButtons,
} = require("../../Giveaway/services/giveawayService") as typeof import("../../Giveaway/services/giveawayService");
const { startModCaseLifecycleLoop } = require("../../Moderation/services/modCaseLifecycleService") as typeof import("../../Moderation/services/modCaseLifecycleService");
const { startCustomRoleExpiryLoop } = require("../../Community/services/customRoleExpiryService") as typeof import("../../Community/services/customRoleExpiryService");
const { runDueChannelReminders } = require("../../Community/services/channelReminderService") as typeof import("../../Community/services/channelReminderService");
const { startTenantOfflineRecoveryLoop } = require("../../Partner/services/tenantOfflineRecoveryService") as typeof import("../../Partner/services/tenantOfflineRecoveryService");
const { isMultiGuildLayerEnabled } = require("../../../MultiGuild/core/env") as typeof import("../../../MultiGuild/core/env");
const { tickStaffCompitiDeadlines, tickStaffCompitiAssignments } = require("../staff/siteStaffCompitiApi") as typeof import("../staff/siteStaffCompitiApi");
const { startPremiumExpiryReminderLoop } = require("../../../MultiGuild/services/premiumExpiryReminderService") as typeof import("../../../MultiGuild/services/premiumExpiryReminderService");
const {
  startTicketAutoClosePromptLoop,
  startTranscriptCleanupLoop,
} = require("../../../MultiGuild/tickets/transcript/ticketMaintenanceService") as typeof import("../../../MultiGuild/tickets/transcript/ticketMaintenanceService");
const { startWebTicketSlaNotifLoop } = require("../tickets/ticketNotify") as typeof import("../tickets/ticketNotify");
const { startDbMaintenanceLoop } = require("../../Community/services/dbMaintenanceService") as typeof import("../../Community/services/dbMaintenanceService");
const { startStaffGracePurgeLoop } = require("../../Community/services/userLeaveBackupService") as typeof import("../../Community/services/userLeaveBackupService");
const { sweepExpiredPartnerManagerTimedPerks } = require("../../Staff/utils/partnerManagerTimedPerks") as typeof import("../../Staff/utils/partnerManagerTimedPerks");
const { restoreTempBans } = require("../../Moderation/services/joinRaidService") as typeof import("../../Moderation/services/joinRaidService");
const { startBumpDueReminderSweepLoop } = require("../../Community/services/bumpService") as typeof import("../../Community/services/bumpService");
const { ensureMongoIndexes } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");

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
  const client = shared?.client || (await createSiteApiRestClient(config, token));
  global.botClient = client;

  startModCaseLifecycleLoop(client);
  startCustomRoleExpiryLoop(client);

  try {
    const { startHourlyReminderLoop } = require("../../Community/services/chatReminderService") as typeof import("../../Community/services/chatReminderService");
    startHourlyReminderLoop(client);
  } catch (err) {
    global.logger?.error?.("[BOT-SCHEDULER][CHAT REMINDER]", err?.message || err);
  }

  try {
    const { scheduleMonthlyGif } = require("../../core/events/ready/monthlyGifAndPackages") as typeof import("../../core/events/ready/monthlyGifAndPackages");
    scheduleMonthlyGif(client);
  } catch (err) {
    global.logger?.error?.("[BOT-SCHEDULER][MONTHLY GIF]", err?.message || err);
  }

  if (String(process.env.BOT_SCHEDULER_EXTERNAL || "").trim() === "1") {
    const pexDelay = setTimeout(() => {
      const { importOldPexDepex } = require("../staff/pexDepexImport") as typeof import("../staff/pexDepexImport");
      importOldPexDepex(client).catch((err) => global.logger?.error?.("[BOT-SCHEDULER][PEX IMPORT]", err));
    }, 2 * 60_000);
    pexDelay.unref?.();
  }

  try {
    if (String(process.env.MINIGAMES_WORKER || "").trim() === "1") {
      /* Thin module: niente minigameService/canvas (ABI Node diverso su bot-workers). */
      const { startMinigameSlotRequestLoop } = require("../../Minigames/services/minigameSlotRequestWorker") as typeof import("../../Minigames/services/minigameSlotRequestWorker");
      startMinigameSlotRequestLoop(client);
    }
  } catch (err) {
    global.logger?.error?.("[BOT-SCHEDULER][MINIGAMES SLOT]", err?.message || err);
    console.error("[BOT-SCHEDULER][MINIGAMES SLOT]", err?.message || err);
  }

  try {
    const { startOfficialAutomationBoostDrainLoop } = require("../../Community/services/officialMessageAutomationQueue") as typeof import("../../Community/services/officialMessageAutomationQueue");
    startOfficialAutomationBoostDrainLoop(client);
  } catch (err) {
    global.logger?.error?.("[BOT-SCHEDULER][BOOST DRAIN]", err?.message || err);
  }

  try {
    const { startActivityMessageWriteDrainLoop } = require("../../Community/services/activityService") as typeof import("../../Community/services/activityService");
    startActivityMessageWriteDrainLoop(client);
  } catch (err) {
    global.logger?.error?.("[BOT-SCHEDULER][ACTIVITY WRITE]", err?.message || err);
  }

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

  try {
    startBumpDueReminderSweepLoop(client);
  } catch (err) {
    global.logger?.error?.("[BOT-SCHEDULER][BUMP REMINDER SWEEP]", err?.message || err);
  }

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
    startPremiumExpiryReminderLoop(client);
    startTicketAutoClosePromptLoop(client);
    try {
      const { startScheduledMessagesLoop } = require("../../../MultiGuild/site/dashboard/dashboardCommunityApi") as typeof import("../../../MultiGuild/site/dashboard/dashboardCommunityApi");
      startScheduledMessagesLoop(client);
    } catch (err) {
      global.logger?.warn?.("[COMMUNITY MSG] loop start:", err?.message || err);
    }
    startTranscriptCleanupLoop();
  }

  startWebTicketSlaNotifLoop(client);
  startDbMaintenanceLoop(client);
  startStaffGracePurgeLoop(client);

  const partnerPerksTick = () => sweepExpiredPartnerManagerTimedPerks(client).catch(() => {});
  partnerPerksTick();
  const partnerPerksTimer = setInterval(partnerPerksTick, 5 * 60 * 1000);
  partnerPerksTimer.unref?.();

  const JOIN_RAID_RESTORE_INTERVAL_MS = Number(process.env.JOIN_RAID_RESTORE_INTERVAL_MS) || 10 * 60 * 1000;
  const joinRaidTick = async () => {
    const guilds = [...(client.guilds?.cache?.values?.() || [])];
    for (const guild of guilds) {
      await restoreTempBans(guild).catch(() => {});
    }
  };
  joinRaidTick().catch(() => {});
  const joinRaidTimer = setInterval(() => {
    joinRaidTick().catch(() => {});
  }, JOIN_RAID_RESTORE_INTERVAL_MS);
  joinRaidTimer.unref?.();

  ensureMongoIndexes({ reason: "bot_scheduler_worker" }).catch((err?) => {
    console.warn("[BOT-SCHEDULER] ensureMongoIndexes:", err?.message || err);
  });

  if (String(process.env.BOT_SCHEDULER_EXTERNAL || "").trim() === "1") {
    const { migrateLegacyDailyStatsCollections } = require("../../Community/services/dailyStatsStore") as typeof import("../../Community/services/dailyStatsStore");
    migrateLegacyDailyStatsCollections()
      .then((result?) => {
        if (!result?.skipped) global.logger?.info?.("[BOT-SCHEDULER][DAILY STATS MIGRATION] completed.");
      })
      .catch((err?) => global.logger?.warn?.("[BOT-SCHEDULER][DAILY STATS MIGRATION]", err?.message || err));

    const { runStartupPanels } = require("../../core/events/ready/startupPanels") as typeof import("../../core/events/ready/startupPanels");
    const { runBotSchedulerWorkerDeferredStartup } = require("../../core/events/ready/deferredStartupTasks") as typeof import("../../core/events/ready/deferredStartupTasks");
    const workerStartupDelayMs = Math.max(0, Number(process.env.BOT_SCHEDULER_STARTUP_DEFER_MS) || 20_000);
    setTimeout(() => {
      void runStartupPanels(client, "bot-scheduler-worker").catch((err?) =>
        global.logger?.warn?.("[BOT-SCHEDULER][STARTUP PANELS]", err?.message || err),
      );
      void runBotSchedulerWorkerDeferredStartup(client).catch((err?) =>
        global.logger?.warn?.("[BOT-SCHEDULER][DEFERRED STARTUP]", err?.message || err),
      );
    }, workerStartupDelayMs).unref?.();
  }

  if (String(process.env.PRESENCE_SUPPORTER_SWEEP_ON_GATEWAY || "1").trim() === "0") {
    const { startPresenceSupporterSweepLoop } = require("../../Community/events/presenceSupporterBootstrap") as typeof import("../../Community/events/presenceSupporterBootstrap");
    startPresenceSupporterSweepLoop(client);
  }

  /* cleanup users-not-in-server resta su bots-vinyls (serve member list gateway; REST worker non ce l'ha) */

  if (require.main === module) {
    console.log(
      `[BOT-SCHEDULER] ready as ${client.user?.tag || client.user?.username || "bot"}`,
    );
  }
}

/* Avvio da solo oppure dentro un processo condiviso (backgroundWorkersApp / voteIntakeApp) che passa il client. */
if (require.main === module) {
  main().catch((err?) => {
    console.error("[BOT-SCHEDULER] fatal:", err);
    process.exit(1);
  });
}

export = { startBotSchedulerWorker: main };
