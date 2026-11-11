const { bootstrapMinigameScheduler } = require("../../../Minigames/services/minigameSchedulerService") as typeof import("../../../Minigames/services/minigameSchedulerService");
const { startLiveVoiceExpLoop, } = require("../../../Community/services/activityService") as typeof import("../../../Community/services/activityService");
const { runScheduledEnds, syncActiveGiveawayButtons, scheduleActiveGiveawayEnds } = require("../../../Giveaway/services/giveawayService") as typeof import("../../../Giveaway/services/giveawayService");
const { sweepExpiredPartnerManagerTimedPerks } = require("../../../Staff/utils/partnerManagerTimedPerks") as typeof import("../../../Staff/utils/partnerManagerTimedPerks");
const { restoreTempBans } = require("../../../Moderation/services/joinRaidService") as typeof import("../../../Moderation/services/joinRaidService");
const { envFlagOn } = require("../../../../shared/runtime/externalWorkerGate") as typeof import("../../../../shared/runtime/externalWorkerGate");
const {
  LOOP_STAGGER_MS,
  ENGAGEMENT_INTERVAL_MS,
  JOIN_RAID_RESTORE_INTERVAL_MS,
} = require("./startupHelpers") as typeof import("./startupHelpers");

function skipExternalWorkerLoop(kind?) {
  const key = String(kind || "").trim().toUpperCase();
  if (!key) return false;
  return envFlagOn(`${key}_EXTERNAL`) && !envFlagOn(`${key}_WORKER`);
}

function startPrimaryLoops(client?, engagementTick?) {
  if (client._primaryLoopsStarted) return;
  client._primaryLoopsStarted = true;

  const interval = setInterval(engagementTick, ENGAGEMENT_INTERVAL_MS);
  interval.unref?.();
  client._primaryEngagementInterval = interval;
  engagementTick().catch((err?) => global.logger?.warn?.("[STARTUP] First engagement tick failed:", err?.message || err));

  const startLoopSafely = (label?, starter?) => {
    try { starter(); } catch (err) { global.logger?.error?.(label, err); }
  };

  const loopStarters = [
    ["[LIVE VOICE EXP] Failed to start loop", () => startLiveVoiceExpLoop(client)],
    ["[MINIGAMES] Failed to start loop", () => {
      /* MINIGAMES_EXTERNAL=1 → slot timer su bot-workers; gateway resta restore/expire/spawn-consumer */
      void bootstrapMinigameScheduler(client).catch((err?) => global.logger?.error?.("[MINIGAMES] bootstrap failed:", err?.message || err));
    }],
    ["[EventPlugins] Failed to register starwars plugin", () => {
      // Pack stagionali: halloween/hogwarts solo in archivio (non caricati). Star Wars via archivio.
      const { registerStarWarsPlugin } = require("../../../../../archivio/starwars/src/Vinili/EventPlugins/starwars/register") as any;
      registerStarWarsPlugin(client);
    }],
    ["[DAILY MEMBER STATS] Failed to start loop", () => {
      if (skipExternalWorkerLoop("COMMUNITY_POLL")) return;
      const { startDailyMemberStatsLoop } = require("../../../Community/services/dailyMemberStatsService") as typeof import("../../../Community/services/dailyMemberStatsService");
      startDailyMemberStatsLoop(client);
    }],
    ["[DAILY ENGAGEMENT STATS] Failed to start loop", () => {
      if (skipExternalWorkerLoop("COMMUNITY_POLL")) return;
      const { startDailyEngagementStatsLoop } = require("../../../Community/services/dailyEngagementStatsService") as typeof import("../../../Community/services/dailyEngagementStatsService");
      startDailyEngagementStatsLoop(client);
    }],
    ["[DAILY CHANNEL MESSAGE STATS] Failed to start loop", () => {
      if (skipExternalWorkerLoop("COMMUNITY_POLL")) return;
      const { startDailyChannelMessageStatsLoop } = require("../../../Community/services/dailyChannelMessageStatsService") as typeof import("../../../Community/services/dailyChannelMessageStatsService");
      startDailyChannelMessageStatsLoop(client);
    }],
    ["[CUSTOM ROLE EXPIRY] Failed to start cleanup loop", () => {
      if (skipExternalWorkerLoop("BOT_SCHEDULER")) return;
      const { startCustomRoleExpiryLoop } = require("../../../Community/services/customRoleExpiryService") as typeof import("../../../Community/services/customRoleExpiryService");
      startCustomRoleExpiryLoop(client);
    }],
    ["[USER FULL STATE] Failed to start persistence loop", () => {
      if (skipExternalWorkerLoop("COMMUNITY_POLL")) return;
      const { startUserFullStatePersistenceLoop } = require("../../../Community/services/userFullStatePersistenceService") as typeof import("../../../Community/services/userFullStatePersistenceService");
      startUserFullStatePersistenceLoop(client);
    }],
    ["[MOD CASE LIFECYCLE] Failed to start loop", () => {
      if (skipExternalWorkerLoop("BOT_SCHEDULER")) return;
      const { startModCaseLifecycleLoop } = require("../../../Moderation/services/modCaseLifecycleService") as typeof import("../../../Moderation/services/modCaseLifecycleService");
      startModCaseLifecycleLoop(client);
    }],
    ["[TICKET AUTO CLOSE PROMPT] Failed to start loop", () => {
      if (skipExternalWorkerLoop("BOT_SCHEDULER")) return;
      const { startTicketAutoClosePromptLoop } = require("../../../../MultiGuild/tickets/transcript/ticketMaintenanceService") as typeof import("../../../../MultiGuild/tickets/transcript/ticketMaintenanceService");
      startTicketAutoClosePromptLoop(client);
    }],
    ["[WEB TICKET SLA] Failed to start loop", () => {
      if (skipExternalWorkerLoop("BOT_SCHEDULER")) return;
      const { startWebTicketSlaNotifLoop } = require("../../../site/tickets/siteWebTicketsApi") as typeof import("../../../site/tickets/siteWebTicketsApi");
      startWebTicketSlaNotifLoop(client);
    }],
    ["[COMMUNITY MSG] Failed to start loop", () => {
      if (skipExternalWorkerLoop("BOT_SCHEDULER")) return;
      const { startScheduledMessagesLoop } = require("../../../../MultiGuild/site/dashboard/dashboardCommunityApi") as typeof import("../../../../MultiGuild/site/dashboard/dashboardCommunityApi");
      startScheduledMessagesLoop(client);
    }],
    ["[BUMP VOTES] Failed to start loop", () => {
      if (skipExternalWorkerLoop("BOT_SCHEDULER")) return;
      const { startBumpVotesLoop } = require("../../../../MultiGuild/services/bumpVotesRuntime") as typeof import("../../../../MultiGuild/services/bumpVotesRuntime");
      startBumpVotesLoop(client);
    }],
    ["[ANNUNCI] Failed to seed main role drafts", async () => {
      const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
      const { ensureMainSeed } = require("../../../../MultiGuild/services/announcementsRuntime") as typeof import("../../../../MultiGuild/services/announcementsRuntime");
      await ensureMainSeed(IDs.guilds?.main);
    }],
    ["[COUNTERS] Failed to start loop", () => {
      if (skipExternalWorkerLoop("BOT_SCHEDULER")) return;
      const { startCountersLoop } = require("../../../../MultiGuild/site/dashboard/dashboardCommunityExtraApi") as typeof import("../../../../MultiGuild/site/dashboard/dashboardCommunityExtraApi");
      startCountersLoop(client);
    }],
    ["[TRANSCRIPT CLEANUP] Failed to start loop", () => {
      if (skipExternalWorkerLoop("BOT_SCHEDULER")) return;
      const { startTranscriptCleanupLoop } = require("../../../../MultiGuild/tickets/transcript/ticketMaintenanceService") as typeof import("../../../../MultiGuild/tickets/transcript/ticketMaintenanceService");
      startTranscriptCleanupLoop();
    }],
    ["[WEEKLY ACTIVITY WINNERS] Failed to start loop", () => {
      if (skipExternalWorkerLoop("COMMUNITY_POLL")) return;
      const { startWeeklyActivityWinnersLoop } = require("../../../Community/services/weeklyActivityWinnersService") as typeof import("../../../Community/services/weeklyActivityWinnersService");
      startWeeklyActivityWinnersLoop(client);
    }],
    ["[STAFFER SETTIMANA] Failed to start loop", () => {
      if (skipExternalWorkerLoop("COMMUNITY_POLL")) return;
      const { startStafferDellaSettimanaLoop } = require("../../../Staff/services/stafferDellaSettimanaService") as typeof import("../../../Staff/services/stafferDellaSettimanaService");
      startStafferDellaSettimanaLoop(client);
    }],
    ["[BIRTHDAY] Failed to start loop", () => {
      if (skipExternalWorkerLoop("COMMUNITY_POLL")) return;
      const { startBirthdayLoop } = require("../../../Community/services/birthdayService") as typeof import("../../../Community/services/birthdayService");
      startBirthdayLoop(client);
    }],
    ["[WEEKLY STAFF RESOCONTO] Failed to start loop", () => {
      if (skipExternalWorkerLoop("COMMUNITY_POLL")) return;
      const { startWeeklyStaffResocontoLoop } = require("../../../Staff/services/weeklyStaffResocontoService") as typeof import("../../../Staff/services/weeklyStaffResocontoService");
      startWeeklyStaffResocontoLoop(client);
    }],
    ["[PREMIUM EXPIRY REMINDER] Failed to start loop", () => {
      const { startPremiumExpiryReminderLoop } = require("../../../../MultiGuild/services/premiumExpiryReminderService") as typeof import("../../../../MultiGuild/services/premiumExpiryReminderService");
      startPremiumExpiryReminderLoop(client);
    }],
    ["[MOVIE NIGHT ANNOUNCE] Failed to start loop", () => {
      if (skipExternalWorkerLoop("COMMUNITY_POLL")) return;
      const { startMovieNightAnnouncementLoop } = require("../../../Community/services/movieNightAnnouncementService") as typeof import("../../../Community/services/movieNightAnnouncementService");
      startMovieNightAnnouncementLoop(client);
    }],
    ["[EXP EVENT ANNOUNCE] Failed to start loop", () => {
      if (skipExternalWorkerLoop("COMMUNITY_POLL")) return;
      const { startGlobalExpEventAnnouncementLoop } = require("../../../Community/services/globalExpEventAnnouncementService") as typeof import("../../../Community/services/globalExpEventAnnouncementService");
      startGlobalExpEventAnnouncementLoop(client);
    }],
    /* pexImport1: una volta sola (segnata in BotState), 2 minuti dopo l'avvio — offload su BOT_SCHEDULER */
    [
      "[PEX IMPORT] import cronologia pex/depex fallito",
      () => {
        if (skipExternalWorkerLoop("BOT_SCHEDULER")) return;
        const t = setTimeout(() => {
          const { importOldPexDepex } = require("../../../site/staff/pexDepexImport") as typeof import("../../../site/staff/pexDepexImport");
          importOldPexDepex(client).catch((err) => global.logger?.error?.("[PEX IMPORT]", err));
        }, 2 * 60_000);
        t.unref?.();
      },
    ],
    /* perfP1: se COMMUNITY_POLL_EXTERNAL=1 i start* no-op qui (gira community-poll) */
    ["[TWITCH LIVE] Failed to start loop", () => {
      if (skipExternalWorkerLoop("COMMUNITY_POLL")) return;
      const { startTwitchLiveAlertLoop } = require("../../../Community/services/twitchLiveAlertService") as typeof import("../../../Community/services/twitchLiveAlertService");
      startTwitchLiveAlertLoop(client);
    }],
    ["[GAME NEWS] Failed to start loop", () => {
      if (skipExternalWorkerLoop("COMMUNITY_POLL")) return;
      const { startGameNewsAlertLoop } = require("../../../Community/services/gameNewsAlertService") as typeof import("../../../Community/services/gameNewsAlertService");
      startGameNewsAlertLoop(client);
    }],
    ["[STREAMER STAGE] Failed to start guard", () => {
      if (skipExternalWorkerLoop("COMMUNITY_POLL")) return;
      const { startStreamerStageGuardLoop } = require("../../../Community/services/streamerStageGuardService") as typeof import("../../../Community/services/streamerStageGuardService");
      startStreamerStageGuardLoop(client);
    }],
    ["[DB MAINTENANCE] Failed to start loop", () => {
      if (skipExternalWorkerLoop("BOT_SCHEDULER")) return;
      const { startDbMaintenanceLoop } = require("../../../Community/services/dbMaintenanceService") as typeof import("../../../Community/services/dbMaintenanceService");
      startDbMaintenanceLoop(client);
    }],
    ["[STAFF GRACE PURGE] Failed to start loop", () => {
      if (skipExternalWorkerLoop("BOT_SCHEDULER")) return;
      const { startStaffGracePurgeLoop } = require("../../../Community/services/userLeaveBackupService") as typeof import("../../../Community/services/userLeaveBackupService");
      startStaffGracePurgeLoop(client);
    }],
    ["[JOIN RAID RESTORE] Failed to start loop", () => {
      if (skipExternalWorkerLoop("BOT_SCHEDULER")) return;
      const tick = async () => {
        const guilds = [...client.guilds.cache.values()];
        for (const guild of guilds) { await restoreTempBans(guild).catch(() => { }); }
      };
      tick().catch(() => { });
      const timer = setInterval(tick, JOIN_RAID_RESTORE_INTERVAL_MS);
      if (typeof timer.unref === "function") timer.unref();
      client._joinRaidRestoreInterval = timer;
    }],
    ["[GIVEAWAY] Failed to start scheduled end loop", () => {
      if (skipExternalWorkerLoop("BOT_SCHEDULER")) {
        return;
      }
      const tick = () =>
        runScheduledEnds(client).catch((e?) => {
          const isMongoNetwork = e?.name === "MongoNetworkTimeoutError" || e?.name === "MongoServerSelectionError";
          global.logger?.warn?.("[GIVEAWAY] runScheduledEnds", isMongoNetwork ? "MongoDB timeout, will retry next run." : (e?.message || e));
        });
      scheduleActiveGiveawayEnds(client)
        .then((result?) => {
          if (result?.scheduled || result?.endedDue) {
            global.logger?.info?.(
              `[GIVEAWAY] end timers: scheduled=${result.scheduled || 0} endedDue=${result.endedDue || 0}`,
            );
          }
        })
        .catch((e?) => {
          global.logger?.warn?.("[GIVEAWAY] scheduleActiveGiveawayEnds", e?.message || e);
        });
      syncActiveGiveawayButtons(client)
        .then((result?) => {
          if (!result?.scanned) return;
          global.logger?.info?.(`[GIVEAWAY] active button sync: scanned=${result.scanned} updated=${result.updated} failed=${result.failed}`);
        })
        .catch((e?) => {
          const isMongoNetwork = e?.name === "MongoNetworkTimeoutError" || e?.name === "MongoServerSelectionError";
          global.logger?.warn?.("[GIVEAWAY] syncActiveGiveawayButtons", isMongoNetwork ? "MongoDB timeout, will retry next run." : (e?.message || e));
        });
            const timer = setInterval(tick, 60 * 1000);
      if (typeof timer.unref === "function") timer.unref();
      client._giveawayScheduledEndInterval = timer;
    }],
    [
      "[PARTNER MANAGER TIMED PERKS] Failed to start loop",
      () => {
        if (skipExternalWorkerLoop("BOT_SCHEDULER")) return;
        const tick = () => sweepExpiredPartnerManagerTimedPerks(client).catch(() => { });
        tick();
        const timer = setInterval(tick, 5 * 60 * 1000);
        if (typeof timer.unref === "function") timer.unref();
        client._partnerManagerTimedPerksInterval = timer;
      },
    ],
    ["[DISCADIA VOTE QUEUE] Failed to start loop", () => {
      if (skipExternalWorkerLoop("VOTE_QUEUE")) return;
      const { startVoteQueueLoop } = require("../../../site/http/discadiaVoteQueueService") as typeof import("../../../site/http/discadiaVoteQueueService");
      startVoteQueueLoop(client);
    }],
    /* tenureVeteranoLoop1: sweep giornaliero NuovoUtente→Veterano→OG (era importato ma mai avviato) */
    ["[VERIFY TENURE] Failed to start loop", () => {
      if (skipExternalWorkerLoop("COMMUNITY_POLL")) return;
      const { startVerificationTenureLoop } = require("../../../Community/services/communityOpsService") as typeof import("../../../Community/services/communityOpsService");
      startVerificationTenureLoop(client);
    }],
    [
      "[BOT HTTP WEBHOOK] Failed to start",
      () => {
        const {
          startWebhookServer,
          startGatewayHealthOnlyHttp,
          shouldStartBotHttpServer,
        } = require("../../../site/http/webhookService") as typeof import("../../../site/http/webhookService");
        if (shouldStartBotHttpServer(client)) {
          startWebhookServer(client).catch((err?) => global.logger?.error?.("[BOT HTTP WEBHOOK]", err));
          return;
        }
        try {
          startGatewayHealthOnlyHttp(client);
        } catch (err) {
          global.logger?.error?.("[BOT HTTP HEALTH-ONLY]", err);
        }
      },
    ],
  ];

  for (let i = 0; i < loopStarters.length; i += 1) {
    const [label, starter] = loopStarters[i];
    const delayMs = LOOP_STAGGER_MS > 0 ? i * LOOP_STAGGER_MS : 0;
    if (delayMs <= 0) {
      startLoopSafely(label, starter);
      continue;
    }
    const timer = setTimeout(() => startLoopSafely(label, starter), delayMs);
    timer.unref?.();
  }
}

export = {
  startPrimaryLoops,
};
