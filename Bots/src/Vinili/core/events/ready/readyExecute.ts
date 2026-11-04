const { isMongoReady } = require("../../../../shared/db/mongoConnect") as typeof import("../../../../shared/db/mongoConnect");
const { envFlagOn, shouldStartExternalWorkerLoop } = require("../../../../shared/runtime/externalWorkerGate") as typeof import("../../../../shared/runtime/externalWorkerGate");
const { restoreWelcomeSessionsFromDb } = require("../../../Community/services/officialMessageCommunityHandlers") as typeof import("../../../Community/services/officialMessageCommunityHandlers");
const { runDueChannelReminders, } = require("../../../Community/services/channelReminderService") as typeof import("../../../Community/services/channelReminderService");
const { migrateLegacyDailyStatsCollections } = require("../../../Community/services/dailyStatsStore") as typeof import("../../../Community/services/dailyStatsStore");
const { startDailyPartnerAuditLoop, } = require("../../../Partner/services/partnerAuditService") as typeof import("../../../Partner/services/partnerAuditService");
const { startStaffChatThreadsLoop } = require("../../../Staff/services/staffChatThreadsService") as typeof import("../../../Staff/services/staffChatThreadsService");
const { startStaffCmdsThreadsLoop } = require("../../../Staff/services/staffCmdsThreadsService") as typeof import("../../../Staff/services/staffCmdsThreadsService");
const { startPublicVoiceHubSetup } = require("../../../Community/services/publicVoiceHubService") as typeof import("../../../Community/services/publicVoiceHubService");
const { runFullCleanupUsersNotInServer } = require("../../../Community/services/cleanupUsersNotInServerService") as typeof import("../../../Community/services/cleanupUsersNotInServerService");
const { logBotReady } = require("../../../../shared/discord/readyLog") as typeof import("../../../../shared/discord/readyLog");
const {
  STARTUP_PANELS_RETRY_MS,
  CLEANUP_USERS_NOT_IN_SERVER_DELAY_MS,
  CLEANUP_USERS_NOT_IN_SERVER_INTERVAL_MS,
  logError,
  resolveMaxListeners,
  shouldRunMediumStartup,
  markMediumStartup,
  isFullStartupSyncEnabled,
  envFlagEnabled,
} = require("./startupHelpers") as typeof import("./startupHelpers");
const { isPrimaryScheduler } = require("./startupRestore") as typeof import("./startupRestore");
const { runDeferredStartup } = require("./deferredStartupTasks") as typeof import("./deferredStartupTasks");
const { processPendingPrefixCommands } = require("./pendingPrefixCommands") as typeof import("./pendingPrefixCommands");
const { runStartupPanels } = require("./startupPanels") as typeof import("./startupPanels");
const { startPrimaryLoops } = require("./primaryLoops") as typeof import("./primaryLoops");
const { scheduleMonthlyGif, maybeCheckPackagesOnReady } = require("./monthlyGifAndPackages") as typeof import("./monthlyGifAndPackages");

async function execute(client?) {
    if (client._readyBootstrapDone) {
      return;
    }
    client._readyBootstrapDone = true;
    global.__vinylsDiscordClient = client;

    const readyStartedAt = Date.now();
    const maxListeners = resolveMaxListeners(client);
    client.setMaxListeners(maxListeners);
    require("events").EventEmitter.defaultMaxListeners = maxListeners;
    try {
      require("../../../Community/utils/pronounGenderUtils").registerPronounGenderReplyHook();
    } catch (err) {
      global.logger?.warn?.("[PRONOUN-GENDER] hook init:", err?.message || err);
    }

    if (!isMongoReady()) {
      logError(client, "[DATABASE] Startup aborted: MongoDB is required for ready services.");
      const t = setTimeout(() => process.exit(1), 5000);
      t.unref?.();
      return;
    }
    try {
      await restoreWelcomeSessionsFromDb();
    } catch (err) {
      global.logger?.warn?.("[welcome-context] restore sessions:", err?.message || err);
    }
    void (async () => {
      try {
        const { restorePendingVoiceTranscriptions } = require("../../../Voice/services/voiceTranscriptionService") as typeof import("../../../Voice/services/voiceTranscriptionService");
        await restorePendingVoiceTranscriptions(client);
      } catch (err) {
        global.logger?.warn?.("[VOICE TRANSCRIBE] restore failed:", err?.message || err);
      }
    })();
    void (async () => {
      try {
        const { restoreStanzaRoomsFromSnapshot } = require("../../../Voice/services/stanzaVoiceRoomsService") as typeof import("../../../Voice/services/stanzaVoiceRoomsService");
        await restoreStanzaRoomsFromSnapshot(client);
        const { maybeMigrateStanzaCoffeeBotOverwritesOnReady } = require("../../../Voice/services/stanzaMigrateCoffeeOverwrites") as typeof import("../../../Voice/services/stanzaMigrateCoffeeOverwrites");
        await maybeMigrateStanzaCoffeeBotOverwritesOnReady(client);
      } catch (err) {
        global.logger?.warn?.("[stanza] snapshot restore failed:", err?.message || err);
      }
    })();
    const primaryScheduler = isPrimaryScheduler(client);
    if (primaryScheduler && shouldStartExternalWorkerLoop("BOT_SCHEDULER")) {
      try {
        const result = await migrateLegacyDailyStatsCollections();
        if (!result?.skipped) global.logger?.info?.("[DAILY STATS MIGRATION] completed into dailystats.");
      } catch (err) {
        global.logger?.warn?.("[DAILY STATS MIGRATION] failed:", err?.message || err);
      }
    }

    if (primaryScheduler && shouldStartExternalWorkerLoop("BOT_SCHEDULER")) {
      try {
        const { startBumpDueReminderSweepLoop } = require("../../../Community/services/bumpService") as typeof import("../../../Community/services/bumpService");
        startBumpDueReminderSweepLoop(client);
      } catch (err) {
        global.logger?.error?.("[BUMP DUE REMINDER SWEEP] early start failed:", err?.message || err);
      }
    }

    if (primaryScheduler) {
      try {
        startDailyPartnerAuditLoop(client);
      } catch (err) {
        global.logger?.error?.("[DAILY PARTNER AUDIT ERROR]", err);
      }
      if (shouldStartExternalWorkerLoop("PARTNERSHIP_MIGRATION")) {
        try {
          const {
            startPartnershipHistoryMigrationWorker,
          } = require("../../../Partner/services/tenantPartnershipHistoryMigrationService") as typeof import("../../../Partner/services/tenantPartnershipHistoryMigrationService");
          startPartnershipHistoryMigrationWorker(client);
        } catch (err) {
          global.logger?.error?.("[PARTNERSHIP HISTORY MIGRATION WORKER]", err);
        }
      }
      try {
        startStaffCmdsThreadsLoop(client);
      } catch (err) {
        global.logger?.error?.("[STAFF CMDS THREAD INIT ERROR]", err);
      }
      try {
        startStaffChatThreadsLoop(client);
      } catch (err) {
        global.logger?.error?.("[STAFF CHAT THREAD INIT ERROR]", err);
      }
      try {
        startPublicVoiceHubSetup(client);
      } catch (err) {
        global.logger?.error?.("[PUBLIC VOICE HUB INIT ERROR]", err);
      }
            try {
        const { sweepUntrustedBotsInGuild } = require("../../../Moderation/services/trustedBotGuardService") as typeof import("../../../Moderation/services/trustedBotGuardService");
        const mainGuildId = String(require("../../../Config/ids").guilds?.main || "").trim();
        if (mainGuildId) {
          setTimeout(() => {
            const guild = client.guilds.cache.get(mainGuildId);
            if (guild) {
              sweepUntrustedBotsInGuild(guild, client).catch((err?) =>
                global.logger?.warn?.("[trustedBotGuard] startup sweep failed:", err?.message || err),
              );
            }
          }, 20_000).unref?.();
        }
      } catch (err) {
        global.logger?.error?.("[TRUSTED BOT GUARD INIT ERROR]", err);
      }
    }

    if (primaryScheduler) {
      if (shouldStartExternalWorkerLoop("AUTO_BACKUP")) {
        try {
          const { startAutoBackupLoop } = require("../../../Backup/services/autoBackupService") as typeof import("../../../Backup/services/autoBackupService");
          startAutoBackupLoop(client);
        } catch (err) {
          global.logger?.error?.("[AUTO BACKUP] Failed to start loop", err);
        }
      }
      try {
        const { startTestGuildMirrorSyncLoop } = require("../../../Partner/services/testGuildMirrorSyncService") as typeof import("../../../Partner/services/testGuildMirrorSyncService");
        startTestGuildMirrorSyncLoop(client);
      } catch (err) {
        global.logger?.error?.("[TEST MIRROR] Failed to start loop", err);
      }
    }

    if (primaryScheduler) {
      let engagementTickRunning = false;
      const engagementTick = async () => {
        if (envFlagOn("BOT_SCHEDULER_EXTERNAL") && !envFlagOn("BOT_SCHEDULER_WORKER")) return;
        if (engagementTickRunning) return;
        engagementTickRunning = true;
        try {
          await runDueChannelReminders(client);
        } catch (err) {
          global.logger?.error?.(err);
        } finally {
          engagementTickRunning = false;
        }
      };
      client._engagementTick = engagementTick;

      if (!client._deferredStartupRunning) {
        client._deferredStartupRunning = true;
        void runDeferredStartup(client, primaryScheduler, engagementTick).finally(() => {
          client._deferredStartupRunning = false;
        });
      }

      startPrimaryLoops(client, engagementTick);
    }

    if (primaryScheduler) {
      scheduleMonthlyGif(client);
      if (shouldStartExternalWorkerLoop("COMMUNITY_POLL")) {
        try {
          const { startDiscadiaVoteMonthRolloverCron } = require("../../../Community/services/discadiaVoteMonthRepairOnStartupService") as typeof import("../../../Community/services/discadiaVoteMonthRepairOnStartupService");
          startDiscadiaVoteMonthRolloverCron(client);
        } catch (err) {
          logError(client, "[DISCADIA_VOTE_MONTH_CRON] schedule failed:", err);
        }
      }
    }
    maybeCheckPackagesOnReady(client);

    logBotReady(client, readyStartedAt);

    if (primaryScheduler) {
      setTimeout(() => {
        try {
          const { startHourlyReminderLoop } = require("../../../Community/services/chatReminderService") as typeof import("../../../Community/services/chatReminderService");
          startHourlyReminderLoop(client);
        } catch (err) {
          global.logger?.error?.("[CHAT REMINDER] Failed to start hourly loop:", err?.message || err);
        }
      }, 45_000).unref?.();
    }

    try {
      const { initLavalinkMusicIfEnabled } = require("../../../../shared/music/services/lavalinkMusicService") as typeof import("../../../../shared/music/services/lavalinkMusicService");
      initLavalinkMusicIfEnabled(client);
    } catch (err) {
      global.logger?.warn?.("[MUSIC] init:", err?.message || err);
    }

    void processPendingPrefixCommands(client).catch((err?) => global.logger?.warn?.("[READY] pending commands:", err?.message || err));
    if (primaryScheduler && shouldStartExternalWorkerLoop("BOT_SCHEDULER")) {
      void runStartupPanels(client, "ready").catch(() => { });
            if (envFlagEnabled("STARTUP_PANELS_RETRY")) {
        const retryPanels = setTimeout(() => {
          void runStartupPanels(client, "ready-retry").catch(() => { });
        }, STARTUP_PANELS_RETRY_MS);
        retryPanels.unref?.();
      }
    }

    /* Full scan needs gateway member list (REST worker lacks it). Leaves also prune via guildMemberRemove → runCleanupAfterMemberLeave. */
    const cleanupDisabled = String(process.env.CLEANUP_USERS_NOT_IN_SERVER_ON_STARTUP || "1").trim().toLowerCase() === "0";
    if (!cleanupDisabled && (isFullStartupSyncEnabled() || shouldRunMediumStartup("cleanup-users", CLEANUP_USERS_NOT_IN_SERVER_INTERVAL_MS || 24 * 60 * 60 * 1000))) {
      const t = setTimeout(() => {
        runFullCleanupUsersNotInServer(client)
          .then(() => markMediumStartup("cleanup-users"))
          .catch((err?) => {
            global.logger?.warn?.("[CLEANUP USERS NOT IN SERVER] Startup cleanup failed:", err);
          });
      }, CLEANUP_USERS_NOT_IN_SERVER_DELAY_MS);
      if (t?.unref) t.unref();
    }
    if (CLEANUP_USERS_NOT_IN_SERVER_INTERVAL_MS > 0) {
      const iv = setInterval(() => {
        runFullCleanupUsersNotInServer(client).catch((err?) => {
          global.logger?.warn?.("[CLEANUP USERS NOT IN SERVER] Periodic cleanup failed:", err);
        });
      }, CLEANUP_USERS_NOT_IN_SERVER_INTERVAL_MS);
      if (iv?.unref) iv.unref();
    }

    const { applyBotPresence, installBotPresenceKeeper } = require("../../../../shared/discord/botPresenceActivity") as typeof import("../../../../shared/discord/botPresenceActivity");
    await applyBotPresence(client);
    installBotPresenceKeeper(client);
  }

export = { execute };
