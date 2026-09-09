const config = require("../config.json");
const { connectMongo, isMongoReady } = require("../Utils/Database/mongoConnect");
const cron = require("node-cron");
const { runCronDetached } = require("../../shared/scheduling/cronDetached");
const { restorePendingVoteReminders, restorePendingDiscadiaReminders, restorePendingReminders, startBumpDueReminderSweepLoop, startDiscadiaVoteReminderLoop, } = require("../Services/Bump/bumpService");
const { shouldRunDiscadiaVoteMonthRepairOnStartup, repairDiscadiaVoteMonthRowsForMainGuild, startDiscadiaVoteMonthRolloverCron } = require("../Services/Bump/discadiaVoteMonthRepairOnStartupService");
const { processAllRecentAutomationMessages } = require("../Utils/Message/officialMessageAutomationHandlers");
const { recoverMissedTopggVotesOnStartup } = require("../Services/Bump/topggVoteRecoveryOnStartupService");
const { processPendingCountingMessages, restoreWelcomeSessionsFromDb } = require("../Utils/Message/officialMessageCommunityHandlers");
const { rehydrateCountingChannelBans } = require("../Utils/Community/countingChannelBanService");
const {
  hydrateCountingRestoreTokens,
  startCountingRestoreMaintenance,
} = require("../Utils/Community/countingRestoreService");
const { bootstrapSupporter, recoverSupporterStatusAnnouncesOnStartup } = require("./presenceUpdate");
const { restoreTtsConnections } = require("../Services/TTS/ttsService");
const { runDueOneTimeReminders, } = require("../Services/Reminders/oneTimeReminderService");
const { bootstrapMinigameScheduler } = require("../Services/Minigames/minigameService");
const { startBurrobirraEffectLoop } = require("../Services/Minigames/burrobirraEffectService");
const { startHouseBurrobirraEffectLoop } = require("../Services/Minigames/hogwartsHouseBurrobirraEffectService");
const { isHogwartsRuntimeDisabled } = require("../Utils/Web/hogwartsRuntimeKillSwitch");
const { startVerificationTenureLoop, backfillVerificationTenure, startVoteRoleCleanupLoop, runAllGuilds: renumberAllCategories, startCategoryNumberingLoop, startSponsorKickLoop, startSponsorGuildNicknameSweepLoop, } = require("../Services/Community/communityOpsService");
const { startBirthdayLoop } = require("../Services/Community/birthdayService");
const { startDailyMemberStatsLoop } = require("../Services/Community/dailyMemberStatsService");
const { startDailyEngagementStatsLoop } = require("../Services/Community/dailyEngagementStatsService");
const { startDailyChannelMessageStatsLoop } = require("../Services/Community/dailyChannelMessageStatsService");
const { startReactPressEventLoop } = require("../Services/Community/hogwartsReactPressService");
const { startGaleoniEconomyChannelUnlockLoop } = require("../Services/Community/galeoniEconomyChannelUnlockService");
const { purgeDisabledTrisSessions } = require("../Utils/Economy/trisGuiRuntime");
const { startPremiLaReactEndLoop } = require("../Services/Community/hogwartsReactPressEndService");
const { startHogwartsSpellListHuntLoop } = require("../Services/Community/hogwartsSpellListHuntService");
const { startHogwartsSpellListHuntEndLoop } = require("../Services/Community/hogwartsSpellListHuntEndService");
const { startPotionReminderLoop } = require("../Services/Community/hogwartsPotionReminderService");
const { startHogwartsEventEndLoop } = require("../Services/Community/hogwartsEventEndService");
const { startConsumableBoostExpiryLoop } = require("../Services/Community/hogwartsConsumableBoostsService");
const { migrateLegacyDailyStatsCollections } = require("../Services/Community/dailyStatsStore");
const { restoreTempBans } = require("../Services/Moderation/joinRaidService");
const { sweepExpiredCommunicationTimeoutMirrors, reconcileIncompleteActiveMuteMirrors } = require("../Services/Moderation/mutedMirrorRoleService");
const { sweepStalePreMemberRoles, startPreMemberRoleSweepLoop } = require("../Utils/Community/preMemberRoleService");
const { sendBannedUnbanLinkDms, shouldRunBannedUnbanDmOnStartup } = require("../Services/Moderation/bannedUnbanDmService");
const { rehydrateAntiNukePanicForGuild } = require("../Services/Moderation/antiNukeService");
const { isViniliFullFeatureGuild } = require("../MultiGuild/core/guildFeatureScope");
const { syncLiveVoiceSessionsFromGateway, startLiveVoiceExpLoop, } = require("../Services/Community/activityService");
const { syncPmVoiceAfkWatchFromGateway, startPmVoiceAfkWatchLoop, } = require("../Services/Staff/pmVoiceAfkWatchService");
const { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop, } = require("../Services/Community/customRoleExpiryService");
const { startDailyPartnerAuditLoop, } = require("../Services/Partner/partnerAuditService");
const { syncPartnerDescription } = require("../Services/Partner/partnerDescriptionSyncService");
const { syncAllTenantPartnerDescriptions } = require("../Services/Partner/tenantPartnerDescriptionService");
const { startStaffChatThreadsLoop } = require("../Services/Staff/staffChatThreadsService");
const { startStaffCmdsThreadsLoop } = require("../Services/Staff/staffCmdsThreadsService");
const { startResocontoStaffChannelAccessLoop } = require("../Services/Staff/resocontoStaffChannelAccessService");
const { startPublicVoiceHubSetup } = require("../Services/Voice/publicVoiceHubService");
const { startTicketAutoClosePromptLoop, startTranscriptCleanupLoop, } = require("../Services/Ticket/ticketMaintenanceService");
const { startAutoBackupLoop } = require("../Services/Backup/autoBackupService");
const { startModCaseLifecycleLoop } = require("../Services/Moderation/modCaseLifecycleService");
const { startWeeklyStaffResocontoLoop } = require("../Services/Staff/weeklyStaffResocontoService");
const { startWeeklyActivityWinnersLoop } = require("../Services/Community/weeklyActivityWinnersService");
const { startTwitchLiveAlertLoop } = require("../Services/Community/twitchLiveAlertService");
const { startKickLiveAlertLoop } = require("../Services/Community/kickLiveAlertService");
const { startKickSubscriberSyncLoop } = require("../Services/Community/kickSubscriberSyncService");
const { startHogwartsHouseCupLoop } = require("../Services/Community/hogwartsHouseCupPublishService");
const { syncHogwartsShopLogsOnStartup } = require("../Services/Community/hogwartsShopLogService");
const { syncShopBoostMinigameUsageBackfillOnStartup } = require("../Services/Community/hogwartsShopBoostsService");
const { syncHogwartsMinigameHousePointsBackfillOnStartup } = require("../Services/Community/hogwartsMinigameHousePointsBackfillService");
const { syncHouseSortingAnnouncesOnStartup } = require("../Services/Community/hogwartsSortingLogService");
const { syncSortingRolesOnStartup } = require("../Services/Community/hogwartsSortingRoleService");
const { startContestPrizeMaintenanceCron } = require("../Services/Community/contestPrizeMaintenanceService");
const { startStaffWarnResetLoop } = require("../Services/Staff/staffWarnService");
const { runStaffWarnChannelMigrationOnStartup } = require("../Services/Staff/staffWarnChannelMigrationService");
const { runStaffNegativesWarnConversionMigrationOnStartup } = require("../Services/Staff/staffNegativesWarnConversionMigrationService");
const { startStaffAutoValutazioniLoop, syncAllStaffAutoValutazioni, restoreActiveSerataFilmSessions, cleanupMalformedAutoValutazioni } = require("../Services/Staff/staffAutoValutazioniService");
const { reconcileResocontoReviewerRewardAutoValutazioni } = require("../Services/Staff/resocontoReviewerRewardService");
const { purgeDuplicateCompitoSettimanaleValutazioni } = require("../Services/Staff/compitoSettimanaleDuplicatePurgeService");
const { runScheduledEnds, syncActiveGiveawayButtons, scheduleActiveGiveawayEnds } = require("../Services/Giveaway/giveawayService");
const { retroSyncGuildLevels } = require("../Services/Community/expService");
const { runFullCleanupUsersNotInServer } = require("../Services/Community/cleanupUsersNotInServerService");
const { startStaffGracePurgeLoop } = require("../Services/Community/userLeaveBackupService");
const { startUserFullStatePersistenceLoop } = require("../Services/Community/userFullStatePersistenceService");
const { startDbMaintenanceLoop } = require("../Services/Community/dbMaintenanceService");
const { startVoteQueueLoop } = require("../Services/Web/discadiaVoteQueueService");
const { startWebhookServer, shouldStartBotHttpServer } = require("../Services/Web/webhookService");
const { checkAndInstallPackages } = require("../Utils/Moderation/checkPackages");
const { startAutoPollLoop } = require("../Services/Community/autoPollService");
const { startMovieNightAnnouncementLoop, recoverMovieNightAnnouncementsOnStartup, ensureMovieNightStaffCommunicationOnStartup } = require("../Services/Community/movieNightAnnouncementService");
const { startGlobalExpEventAnnouncementLoop } = require("../Services/Community/globalExpEventAnnouncementService");
const { printRecoveryHealthOnce } = require("../../shared/recovery/recoveryHealth");
const IDs = require("../Utils/Config/ids");
const guildMemberUpdateExtras = require("./guildMemberUpdate");
const guildMemberAddExtras = require("./guildMemberAdd");
const { recoverDonationPackageAnnouncesOnStartup } = require("../Utils/Community/donationPackageSupportersAnnounce");
const { recoverManualSocialRoleAnnouncesOnStartup } = require("../Utils/Community/manualSocialRoleAnnounceAndPicPerms");
const { reconcilePatronRolesOnStartup, recoverPatronAnnouncesOnStartup } = require("../Utils/Community/patronRoleService");
const { revokeAllPremiumBySource } = require("../MultiGuild/core/tenantPremium");
const { startPremiumExpiryReminderLoop } = require("../MultiGuild/services/premiumExpiryReminderService");
const { recoverLevelMilestoneSupportersAnnouncesOnStartup } = require("../Utils/Community/levelMilestoneSupportersAnnounceEmbeds");
const startupPanelsTrigger = require("../Triggers/embeds");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const { syncAllMembersClanTags } = require("../Services/Community/clanTagRoleService");
const { syncZodiacRolesFromStoredBirthdays } = require("../Utils/Community/zodiacRoles");
const { syncAgeBracketRolesFromStoredBirthdays } = require("../Utils/Community/ageBracketRoles");
const { postTopggStatsDigestIfConfigured } = require("../Services/Web/topggDigestService");
const {
  restorePauseMessageStatusSync,
  startPauseMessageStatusMaintenance,
  rewriteStaleCancelledPauseMessages,
} = require("../Utils/Pause/pauseHandlersUtils");
const { formatDurationMs, runPhasedStartupTasks, } = require("../Utils/Startup/readyStartupRuntime");
const { logBotReady } = require("../../shared/discord/readyLog");
const { sweepExpiredPartnerManagerTimedPerks } = require("../Utils/Staff/partnerManagerTimedPerks");
const {
  shouldRunStartupWork,
  markStartupThrottle,
  isStartupThrottleDue,
  isFullStartupSyncEnabled,
  envFlagEnabled,
} = require("../../shared/runtime/startupThrottleCache");
const STARTUP_THROTTLE_NS = "vinyls";
const STARTUP_PANELS_TTL_MS = Math.max(
  0,
  Number(process.env.STARTUP_PANELS_TTL_MS) || 6 * 60 * 60 * 1000,
);
const STARTUP_MEDIUM_TTL_MS = Math.max(
  0,
  Number(process.env.STARTUP_MEDIUM_TTL_MS) || 60 * 60 * 1000,
);
const STARTUP_PANELS_RETRY_MS = 15000;
const LOOP_STAGGER_MS = Math.max(0, Number(process.env.LOOP_STAGGER_MS) || 250);
const ENGAGEMENT_INTERVAL_MS = Number(process.env.ENGAGEMENT_INTERVAL_MS) || 60 * 1000;
const JOIN_RAID_RESTORE_INTERVAL_MS = Number(process.env.JOIN_RAID_RESTORE_INTERVAL_MS) || 10 * 60 * 1000;
const CLEANUP_USERS_NOT_IN_SERVER_DELAY_MS = Number(process.env.CLEANUP_USERS_NOT_IN_SERVER_DELAY_MS) || 3 * 60 * 1000;
const CLEANUP_USERS_NOT_IN_SERVER_INTERVAL_MS = (() => { const v = process.env.CLEANUP_USERS_NOT_IN_SERVER_INTERVAL_MS; if (v === undefined || v === "") return 24 * 60 * 60 * 1000; const n = Number(v); return Number.isFinite(n) ? n : 24 * 60 * 60 * 1000;})();

function shouldRunVerificationTenureBackfill(client) {
  const envValue = String(process.env.VERIFICATION_TENURE_BACKFILL_ON_STARTUP || "").trim().toLowerCase();
  if (envValue) return ["1", "true", "yes", "on"].includes(envValue);
  return Boolean(client?.config?.verificationTenureBackfillOnStartup);
}

function shouldRunTopggStatsDigestOnStartup(client) {
  const envValue = String(process.env.TOPGG_STATS_DIGEST_ON_STARTUP || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(envValue)) return true;
  if (["0", "false", "no", "off"].includes(envValue)) return false;
  return Boolean(client?.config?.topgg?.statsDigestOnStartup);
}

const LOG_STARTUP = String(process.env.LOG_STARTUP || "0") === "1";

function logError(client, ...args) {
  if (client?.logs?.error) {
    client.logs.error(...args);
    return;
  }
  global.logger?.error?.(...args);
}

function logAlways(client, ...args) {
  if (client?.logs?.logging) {
    client.logs.logging(...args);
    return;
  }
  if (client?.logs?.success) {
    client.logs.success(...args);
    return;
  }
  if (client?.logs?.error) {
    client.logs.error(...args);
    return;
  }
  if (global.logger?.info) {
    global.logger.info(...args);
    return;
  }
  console.log(...args);
}

function logInfo(client, ...args) {
  if (!LOG_STARTUP) return;
  if (client?.logs?.success) {
    client.logs.success(...args);
    return;
  }
  global.logger?.info?.(...args);
}

function logLaunch(client, ...args) {
  if (!LOG_STARTUP) return;
  if (client?.logs?.logging) {
    client.logs.logging(...args);
    return;
  }
  global.logger?.info?.(...args);
}

function resolveMaxListeners(client) {
  const raw = Number(client?.config?.eventListeners ?? config?.eventListeners ?? 50);
  if (!Number.isFinite(raw) || raw <= 0) return 50;
  return Math.max(10, Math.floor(raw));
}

function createStartupHooks(client) {
  return {
    onStart: (label) => {
      logInfo(client, `[STARTUP] ${label} started.`);
    },
    onSuccess: (label, startedAt) => {
      logInfo(
        client,
        `[STARTUP] ${label} completed in ${formatDurationMs(Date.now() - startedAt)}.`,
      );
    },
    onError: (label, startedAt, reason) => {
      logError(
        client,
        `[STARTUP] ${label} failed after ${formatDurationMs(Date.now() - startedAt)}:`,
        reason,
      );
    },
  };
}

function shouldRunMediumStartup(key, ttlMs = STARTUP_MEDIUM_TTL_MS) {
  return shouldRunStartupWork(STARTUP_THROTTLE_NS, key, { ttlMs }).run;
}

function markMediumStartup(key) {
  markStartupThrottle(STARTUP_THROTTLE_NS, key);
}

function buildDeferredStartupTasks(client, primaryScheduler, engagementTick) {
  const fullSync = isFullStartupSyncEnabled();
  const mainGuildId = IDs.guilds.main || null;
  const resolveMainGuild = async () => {
    if (!mainGuildId) return client.guilds.cache.first() || null;
    return client.guilds.cache.get(mainGuildId) || (await client.guilds.fetch(mainGuildId).catch(() => null));
  };
  return [
    {
      label: "expired mute role restore sweep",
      weight: 5,
      enabled: primaryScheduler,
      run: () =>
        sweepExpiredCommunicationTimeoutMirrors(client, {
          limit: 100,
          includeRecentUnmuteRecovery: true,
        }),
    },
    {
      label: "incomplete active mute mirror reconcile",
      weight: 5,
      enabled: primaryScheduler,
      run: () =>
        reconcileIncompleteActiveMuteMirrors(client, {
          limit: 80,
                              scanTimedOutMembers: true,
        }),
    },
    {
      label: "stale Unverified (preMember) role sweep",
      weight: 6,
      enabled: primaryScheduler,
      run: () =>
        sweepStalePreMemberRoles(client, {
                    fetchMembers: fullSync,
          limit: fullSync ? 500 : 200,
        }),
    },
    {
      label: "run due one-time reminders",
      weight: 8,
      enabled: String(process.env.BOT_SCHEDULER_EXTERNAL || "").trim() !== "1",
      run: () => runDueOneTimeReminders(client),
    },
    {
      label: "restore core startup state",
      weight: 10,
      enabled: true,
      run: () => restoreCoreStartupState(client),
    },
    {
      label: "reconcile orphan ticket channels",
      weight: 11,
      enabled: primaryScheduler && (fullSync || shouldRunMediumStartup("orphan-tickets", STARTUP_MEDIUM_TTL_MS)),
      run: async () => {
        const { reconcileOrphanTicketsOnStartup } = require("../Services/Ticket/ticketOrphanReconcileService");
        await reconcileOrphanTicketsOnStartup(client);
        markMediumStartup("orphan-tickets");
      },
    },
    {
      label: "startup sync queue",
      weight: 12,
      enabled: true,
      run: () => queueStartupSync(client),
    },
    {
      label: "sync partner description cache",
      weight: 16,
      enabled: primaryScheduler && (fullSync || shouldRunMediumStartup("partner-desc")),
      run: async () => {
        await syncPartnerDescription(client);
        markMediumStartup("partner-desc");
      },
    },
    {
      label: "sync tenant partner description cache",
      weight: 16,
      enabled: primaryScheduler && (fullSync || shouldRunMediumStartup("tenant-partner-desc")),
      run: async () => {
        await syncAllTenantPartnerDescriptions(client);
        markMediumStartup("tenant-partner-desc");
      },
    },
    {
      label: "restore bump reminders",
      weight: 15,
      enabled: primaryScheduler,
      run: () => restoreBumpReminders(client),
    },
    {
      label: "process recent automation messages (vote, bump)",
      weight: 18,
      enabled: primaryScheduler && fullSync,
      run: () => processAllRecentAutomationMessages(client),
    },
    {
      label: "recover missed Top.gg votes (API backfill)",
      weight: 18.5,
      enabled: primaryScheduler && fullSync,
      run: () => recoverMissedTopggVotesOnStartup(client),
    },
    {
      label: "sync staff pause message status (accepted)",
      weight: 19,
      enabled: false,
      run: () => restorePauseMessageStatusSync(client),
    },
    {
      label: "rewrite stale cancelled pause messages (legacy ANNULLATA)",
      weight: 19.5,
            enabled:
        primaryScheduler &&
        (fullSync || shouldRunMediumStartup("cancelled-pause-msg-rewrite", 30 * 24 * 60 * 60 * 1000)),
      run: async () => {
        const result = await rewriteStaleCancelledPauseMessages(client);
        markMediumStartup("cancelled-pause-msg-rewrite");
        if (result?.rewritten > 0) {
          global.logger?.info?.(
            `[PAUSE] cancelled message rewrite: examined=${result.examined} rewritten=${result.rewritten}`,
          );
        }
      },
    },
    {
      label: "engagement tick",
      weight: 20,
      enabled: primaryScheduler,
      run: () => engagementTick(),
    },
    {
      label: "discadia vote month recovery (solo se mezzanotte 1° non ha rollover)",
      weight: 25,
      enabled: primaryScheduler && shouldRunDiscadiaVoteMonthRepairOnStartup(client),
      run: () => repairDiscadiaVoteMonthRowsForMainGuild(client, "startup"),
    },
    {
      label: "sync Discord AutoMod rules (Vinili)",
      weight: 28,
      enabled: primaryScheduler && (fullSync || shouldRunMediumStartup("discord-automod", STARTUP_MEDIUM_TTL_MS)),
      run: async () => {
        global.__vinylsDiscordClient = client;
        const {
          syncDiscordAutomodRulesForClient,
          shouldSyncOnStartup,
        } = require("../Services/Moderation/discordAutomodRulesService");
        if (!shouldSyncOnStartup()) return;
        const result = await syncDiscordAutomodRulesForClient(client);
        markMediumStartup("discord-automod");
        const rows = Array.isArray(result?.results) ? result.results : [];
        for (const row of rows) {
          if (row?.skipped) continue;
          if (!row?.ok) {
            global.logger?.warn?.(
              "[discordAutomod] startup sync:",
              row?.guildId || "?",
              row?.reason || "failed",
            );
            continue;
          }
          const failedN = Array.isArray(row.failed) ? row.failed.length : 0;
          const changed = (row.created || 0) + (row.updated || 0) + (row.removed || 0);
          if (!changed && !failedN) continue;
          global.logger?.info?.(
            `[discordAutomod] guild ${row.guildId || "?"}: ${row.satisfied ?? row.managed ?? "?"}/${row.total ?? "?"} regole ok (${row.managed ?? "?"} [VC]), +${row.created || 0} ~${row.updated || 0} -${row.removed || 0}${failedN ? ` errori=${failedN}` : ""}`,
          );
          if (!row.ok) {
            global.logger?.warn?.(
              "[discordAutomod] sync incompleta:",
              row.reason || "unknown",
            );
          }
        }
      },
    },
    {
      label: "reconcile double booster roles from stored boost slots",
      weight: 35,
      enabled: primaryScheduler && fullSync,
      run: () =>
        guildMemberUpdateExtras.reconcileDoubleBoosterRolesOnStartup(client, {
          maxUsers: 400,
        }),
    },
    {
      label: "correct misleading single boost embeds (double booster)",
      weight: 38,
      enabled: false,
      run: () => guildMemberUpdateExtras.correctMisleadingSingleBoostEmbedsOnStartup(client),
    },
    {
      label: "optional Top.gg stats digest",
      weight: 40,
      enabled: primaryScheduler && shouldRunTopggStatsDigestOnStartup(client),
      run: () => postTopggStatsDigestIfConfigured(client),
    },
    {
      label: "recover missed boost embeds (audit vs ultimo embed bot)",
      weight: 42,
      enabled: false,
      run: () =>
        guildMemberUpdateExtras.recoverRecentBoostEmbedsOnStartup(client, {
          limit: 5,
          lookbackMs: 24 * 60 * 60 * 1000,
        }),
    },
    {
      label: "recover missed join welcome announcements",
      weight: 43,
      enabled: primaryScheduler && fullSync,
      run: () =>
        guildMemberAddExtras.recoverJoinAnnouncementsOnStartup(client, {
          limit: 25,
          lookbackMs: 24 * 60 * 60 * 1000,
        }),
    },
    {
      label: "recover missed donation package supporter announces",
      weight: 44,
            enabled: primaryScheduler,
      run: () =>
        recoverDonationPackageAnnouncesOnStartup(client, {
          limit: fullSync ? 20 : 12,
                    lookbackMs: 24 * 60 * 60 * 1000,
        }),
    },
    {
      label: "recover missed social role supporter announces",
      weight: 45,
      enabled: primaryScheduler && fullSync,
      run: () =>
        recoverManualSocialRoleAnnouncesOnStartup(client, {
          limit: 20,
          lookbackMs: 24 * 60 * 60 * 1000,
        }),
    },
    {
      label: "revoke Discord Store Premium (migrated to credits)",
      weight: 45.1,
      enabled: primaryScheduler && (fullSync || shouldRunMediumStartup("revoke-discord-store-premium", STARTUP_MEDIUM_TTL_MS)),
      run: async () => {
        await revokeAllPremiumBySource("discord_store", {
          updatedBy: "migration:credits",
          note: "Revoked Discord Store Premium",
        });
        markMediumStartup("revoke-discord-store-premium");
      },
    },
    {
      label: "reconcile patron roles from social prerequisites",
      weight: 45.2,
      enabled: primaryScheduler && fullSync,
      run: () => reconcilePatronRolesOnStartup(client, { limit: 300 }),
    },
    {
      label: "recover missed patron role announces",
      weight: 45.4,
      enabled: primaryScheduler && fullSync,
      run: () =>
        recoverPatronAnnouncesOnStartup(client, {
          limit: 15,
          lookbackMs: 24 * 60 * 60 * 1000,
        }),
    },
    {
      label: "recover missed level milestone supporter announces",
      weight: 46,
      enabled: primaryScheduler && fullSync,
      run: () =>
        recoverLevelMilestoneSupportersAnnouncesOnStartup(client, {
          limit: 25,
          lookbackMs: 24 * 60 * 60 * 1000,
        }),
    },
    {
      label: "recover missed supporter status embeds",
      weight: 47,
      enabled: primaryScheduler && fullSync,
      run: () =>
        recoverSupporterStatusAnnouncesOnStartup(client, {
          limit: 15,
        }),
    },
    {
      label: "ensure Serata Film staff news communication",
      weight: 47,
      enabled: primaryScheduler && (fullSync || shouldRunMediumStartup("movie-night-staff", STARTUP_PANELS_TTL_MS)),
      run: async () => {
        await ensureMovieNightStaffCommunicationOnStartup(client);
        markMediumStartup("movie-night-staff");
      },
    },
    {
      label: "recover missed Serata Film cron announcements",
      weight: 48,
      enabled: primaryScheduler && fullSync,
      run: () => recoverMovieNightAnnouncementsOnStartup(client),
    },
    {
      label: "restore active Serata Film staff tracking",
      weight: 49,
      enabled: primaryScheduler,
      run: () => restoreActiveSerataFilmSessions(client),
    },
    {
      label: "backfill boost announce slot counts from supporters history",
      weight: 50,
      enabled: primaryScheduler && fullSync,
      run: () => guildMemberUpdateExtras.backfillAnnouncedBoostSlotsFromSupportersHistory(client),
    },
    {
      label: "recover unannounced boosters (member + native scan)",
      weight: 50.5,
      enabled: primaryScheduler && fullSync,
      run: () =>
        guildMemberUpdateExtras.recoverUnannouncedBoostersOnStartup(client, {
          lookbackMs: 48 * 60 * 60 * 1000,
          maxRecover: 25,
        }),
    },
    {
      label: "recover missing second boost embeds (native vs supporters)",
      weight: 51,
      enabled: primaryScheduler && fullSync,
      run: () =>
        guildMemberUpdateExtras.recoverMissingSecondBoostEmbedsOnStartup(client, {
          lookbackMs: 7 * 24 * 60 * 60 * 1000,
          maxRecover: 10,
        }),
    },
    {
      label: "recover last 2 native boost system messages (multi-channel scan)",
      weight: 51,
      enabled: false,
      run: () =>
        guildMemberUpdateExtras.recoverLastGlobalNativeBoostEmbedsOnStartup(client, {
          messageLimit: 5,
          lookbackMs: 24 * 60 * 60 * 1000,
        }),
    },
    {
      label: "custom role expiry sweep",
      weight: 52,
      enabled: primaryScheduler,
      run: () => runExpiredCustomRolesSweep(client),
    },
    {
      label: "DM banned users unban link (run once)",
      weight: 55,
      enabled: primaryScheduler && shouldRunBannedUnbanDmOnStartup(client),
      run: async () => {
        const result = await sendBannedUnbanLinkDms(client, { dryRun: false, once: true });
        if (result?.skipped) {
          global.logger?.info?.(`[dm-banned-unban] skipped: ${result.reason || "unknown"}`);
        } else {
          global.logger?.info?.(
            `[dm-banned-unban] completed: sent=${result.sent} failed=${result.failed} target=${result.target}`,
          );
        }
      },
    },
    {
      label: "staff warn channel migration",
      weight: 74,
      enabled: primaryScheduler && fullSync,
      run: () => runStaffWarnChannelMigrationOnStartup(client),
    },
    {
      label: "staff negatives→warn conversion migration",
      weight: 75,
      enabled: primaryScheduler && (fullSync || shouldRunMediumStartup("staff-neg-warn-migration", STARTUP_MEDIUM_TTL_MS)),
      run: async () => {
        await runStaffNegativesWarnConversionMigrationOnStartup(client);
        markMediumStartup("staff-neg-warn-migration");
      },
    },
    {
      label: "ensure MongoDB indexes (weekly / full sync)",
      weight: 76,
            enabled:
        primaryScheduler &&
        fullSync &&
        isStartupThrottleDue(STARTUP_THROTTLE_NS, "mongo-indexes", 7 * 24 * 60 * 60 * 1000).due,
      run: async () => {
        const { ensureMongoIndexes } = require("../Utils/Database/mongoConnect");
        await ensureMongoIndexes({ reason: "full_startup_sync" });
        markMediumStartup("mongo-indexes");
      },
    },
            {
      label: "custom private category empty cleanup",
      weight: 54,
      enabled: primaryScheduler && fullSync,
      run: async () => {
        const guildId = String(IDs?.guilds?.main || "").trim();
        if (!guildId) return;
        const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
        if (!guild) return;
        const {
          tryDeleteEmptyCustomPrivateCategory,
          listCustomPrivateCategories,
          syncCustomPrivateCategoryLayout,
        } = require("../Utils/Community/customPrivateCategoryUtils");
        for (const cat of listCustomPrivateCategories(guild)) {
          await syncCustomPrivateCategoryLayout(guild, cat).catch(() => null);
        }
        const deleted = await tryDeleteEmptyCustomPrivateCategory(guild).catch(() => false);
        if (deleted) global.logger?.info?.("[CUSTOM PRIVATE CATEGORY] Startup removed empty private category");
      },
    },
    {
      label: "startup sync zodiac roles from birthday profiles",
      weight: 78,
      enabled: primaryScheduler && fullSync,
      run: () => syncZodiacRolesFromStoredBirthdays(client),
    },
    {
      label: "startup sync age bracket roles from birthday profiles",
      weight: 78,
      enabled: primaryScheduler && fullSync,
      run: () => syncAgeBracketRolesFromStoredBirthdays(client),
    },
    {
      label: "startup sync staff auto valutazioni",
      weight: 80,
      enabled: primaryScheduler && fullSync,
      run: async () => {
        await cleanupMalformedAutoValutazioni();
        await syncAllStaffAutoValutazioni(client);
      },
    },
    {
      label: "reconcile resoconto reviewer compito settimanale",
      weight: 81,
      enabled: primaryScheduler && fullSync,
      run: () => reconcileResocontoReviewerRewardAutoValutazioni(client),
    },
    {
      label: "purge duplicate compito settimanale valutazioni",
      weight: 82,
      enabled: false,
      run: () => purgeDuplicateCompitoSettimanaleValutazioni(client, { dryRun: true }),
    },
    {
      label: "verification tenure backfill",
      weight: 85,
      enabled: primaryScheduler && fullSync && shouldRunVerificationTenureBackfill(client),
      run: () => backfillVerificationTenure(client),
    },
    {
      label: "hogwarts shop purchase log backfill",
      weight: 86,
      enabled: false,
      run: () => syncHogwartsShopLogsOnStartup(client),
    },
    {
      label: "hogwarts shop boost minigame usage backfill",
      weight: 86,
      enabled: false,
      run: () => syncShopBoostMinigameUsageBackfillOnStartup(client),
    },
    {
      label: "hogwarts minigame house points backfill",
      weight: 86,
      enabled: false,
      run: () => syncHogwartsMinigameHousePointsBackfillOnStartup(client),
    },
    {
      label: "hogwarts house sorting announce backfill",
      weight: 87,
      enabled: false,
      run: () => syncHouseSortingAnnouncesOnStartup(client),
    },
    {
      label: "hogwarts sorting role repair",
      weight: 87,
      enabled: false,
      run: () => syncSortingRolesOnStartup(client),
    },
    {
      label: "hogwarts basilisk curse state hydrate",
      weight: 87,
      enabled: false,
      run: async () => {
        const { hydrateBasiliskScopeState } = require("../Services/Community/hogwartsBasiliskService");
        await hydrateBasiliskScopeState(client);
      },
    },
    {
      label: "renumber categories",
      weight: 88,
      enabled: primaryScheduler && fullSync,
      run: () => renumberAllCategories(client),
    },
    {
      label: "retro sync guild levels",
      weight: 90,
      enabled: primaryScheduler && fullSync,
      run: async () => {
        const mainGuild = await resolveMainGuild();
        if (!mainGuild) return;
        return retroSyncGuildLevels(mainGuild, { syncRoles: false });
      },
    },
    {
      label: "startup sync clan tag roles",
      weight: 92,
      enabled: primaryScheduler && fullSync,
      run: () => syncAllMembersClanTags(client),
    },
  ];
}

const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const getChannelSafe = async (client, channelId) => { if (!channelId) return null; return client.channels.cache.get(channelId) || (await getClientChannelCached(client, channelId)); };

const PENDING_COMMANDS_LOOKBACK_MS = 10 * 60 * 1000;
const PENDING_COMMANDS_FETCH_LIMIT = 40;
const PENDING_ORPHAN_LOOKBACK_MS = 10 * 60 * 1000;
const PENDING_REPLY_WINDOW_MS = 2 * 60 * 1000;
const PENDING_SCAN_CONCURRENCY = 4;
const PENDING_EXEC_GAP_MS = 250;

function pendingPriorityChannelIds() {
  return [
    IDs.channels?.ship,
    IDs.channels?.commands,
    IDs.channels?.staffCmds,
    IDs.channels?.counting,
    IDs.channels?.media,
    IDs.channels?.economy,
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
}

async function mapWithConcurrency(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length || 1));
  let idx = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (idx < list.length) {
      const current = idx;
      idx += 1;
      await worker(list[current], current);
    }
  });
  await Promise.all(runners);
}

function resolvePendingPrefixCommandToken(client, message, prefix) {
  const content = String(message?.content || "").trim();
  const safePrefix = String(prefix || "+");
  if (!content.startsWith(safePrefix)) return null;
  const args = content.slice(safePrefix.length).trim().split(/\s+/).filter(Boolean);
  const raw = String(args[0] || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  return (
    client?.pcommands?.get?.(raw) ||
    client?.pcommands?.get?.(client?.aliases?.get?.(raw)) ||
    null
  );
}

async function botAlreadyRepliedToPrefixMessage(message, client) {
  const botId = String(client?.user?.id || "");
  if (!botId || !message?.id || !message?.channel?.messages?.fetch) return false;
  const cmdTs = Number(message.createdTimestamp || 0);
  const authorId = String(message.author?.id || "");
  try {
    const newer = await message.channel.messages.fetch({ after: message.id, limit: 25 });
    for (const reply of newer.values()) {
      if (String(reply.author?.id || "") !== botId) continue;
            if (String(reply.reference?.messageId || "") === String(message.id)) return true;
                        if (reply.reference?.messageId) continue;
      const replyTs = Number(reply.createdTimestamp || 0);
      if (!cmdTs || !replyTs || replyTs - cmdTs < 0 || replyTs - cmdTs > PENDING_REPLY_WINDOW_MS) continue;
      if (!authorId) continue;
      const mentionsAuthor =
        Boolean(reply.mentions?.users?.has?.(authorId)) ||
        String(reply.content || "").includes(`<@${authorId}>`) ||
        String(reply.content || "").includes(`<@!${authorId}>`);
      if (!mentionsAuthor) continue;
      if (reply.embeds?.length || String(reply.content || "").trim()) return true;
    }
  } catch {
      }
  return false;
}

function isPrefixLoadingReaction(reaction) {
  if (!reaction) return false;
  const loadingId = String(IDs.emojis?.loadingAnimatedId || "");
  const fallbackId = String(IDs.emojis?.loadingFallbackId || "");
  const emojiId = String(reaction.emoji?.id || "");
  if (loadingId && emojiId === loadingId) return true;
  if (fallbackId && emojiId === fallbackId) return true;
  const name = String(reaction.emoji?.name || "");
  return name === "\u23F3" || name === "⏳" || name === "VC_Loading";
}

function messageHasBotLoadingReaction(message, client) {
  const botId = String(client?.user?.id || "");
  if (!message?.reactions?.cache?.size) return false;
  for (const reaction of message.reactions.cache.values()) {
    if (!isPrefixLoadingReaction(reaction)) continue;
        if (reaction.me === true) return true;
    if (botId && reaction.users?.cache?.has(botId)) return true;
  }
  return false;
}

async function messageHasBotLoadingReactionAsync(message, client) {
  if (messageHasBotLoadingReaction(message, client)) return true;
  const botId = String(client?.user?.id || "");
  if (!botId || !message?.reactions?.cache?.size) return false;
  for (const reaction of message.reactions.cache.values()) {
    if (!isPrefixLoadingReaction(reaction)) continue;
    try {
      const users = await reaction.users.fetch();
      if (users?.has?.(botId)) return true;
    } catch {
    }
  }
  return false;
}

function isPendingDeepScanGuild(guildId) {
  const id = String(guildId || "").trim();
  if (!id) return false;
  const main = String(IDs.guilds?.main || "").trim();
  const test = String(IDs.guilds?.test || "").trim();
  return id === main || (test && id === test);
}

async function collectPendingPrefixScanChannels(guild, { deep = false } = {}) {
  const { ChannelType } = require("discord.js");
  const byId = new Map();
  const isScannableChannel = (ch) =>
    ch?.messages?.fetch &&
    (ch?.isTextBased?.() || ch?.type === ChannelType.GuildVoice || ch?.type === ChannelType.GuildStageVoice) &&
    !(ch?.isThread?.() && ch.archived);

  const priorityIds = pendingPriorityChannelIds();

    if (deep) {
    await guild.channels.fetch().catch(() => null);
  } else {
    for (const id of priorityIds) {
      if (guild.channels.cache.has(id)) continue;
      await guild.channels.fetch(id).catch(() => null);
    }
  }

  for (const channel of guild.channels.cache.values()) {
    if (isScannableChannel(channel)) byId.set(channel.id, channel);
  }
  if (deep && typeof guild.channels.fetchActiveThreads === "function") {
    try {
      const active = await guild.channels.fetchActiveThreads();
      const threads = active?.threads;
      const list = threads ? (typeof threads.values === "function" ? [...threads.values()] : [...threads]) : [];
      for (const thread of list) {
        if (isScannableChannel(thread)) byId.set(thread.id, thread);
      }
    } catch {
          }
  }

  const priority = new Set(priorityIds);
  let all = [...byId.values()];
  if (!deep) {
    all = all.filter((ch) => priority.has(String(ch.id)) || ch.messages?.cache?.size > 0);
    if (!all.length) all = [...byId.values()].slice(0, 8);
  }
  all.sort((a, b) => {
    const ap = priority.has(String(a.id)) ? 0 : 1;
    const bp = priority.has(String(b.id)) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return String(a.id).localeCompare(String(b.id));
  });
  return all;
}

async function processPendingPrefixCommands(client) {
  const envValue = String(process.env.PROCESS_PENDING_COMMANDS_ON_STARTUP || "").trim().toLowerCase();
  const enabled = envValue
    ? ["1", "true", "yes", "on"].includes(envValue)
    : client?.config?.processPendingCommands === true;
  if (!enabled) return;
  if (client.__prefixCommandsReady === false || !client?.pcommands?.size) {
    global.logger?.warn?.("[READY] pending prefix skip: pcommands non pronti");
    return;
  }
  const { handleOfficialPrefixMessage, ensurePrefixQueueLoaded } = require("../Utils/Prefix/officialPrefixDispatcher");
    try {
    ensurePrefixQueueLoaded(client);
  } catch (err) {
    global.logger?.warn?.("[READY] prefix queue restore:", err?.message || err);
  }
  const { getCachedOrFetchMember } = require("../Utils/Message/officialMessageAutomationHandlers");
  const { resolveCommandPrefixForGuildFresh } = require("../MultiGuild/core/tenantGuildSettings");
  const { PermissionFlagsBits } = require("discord.js");
  const fallbackPrefix = String(client?.config?.prefix || "+").trim();
  const hasAnyStaffBypassPermission = (permissions) => permissions && typeof permissions.has === "function" && [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers].some((p) => permissions.has(p));
  const noopWrongPrefixHint = () => Promise.resolve(false);

  const collected = [];
  const seenIds = new Set();
  const scanStartedAt = Date.now();
  global.logger?.info?.("[READY] Avvio scan prefix in sospeso…");

  const scanChannel = async (channel, guildPrefix, me) => {
    const perms = me ? channel.permissionsFor(me) : null;
    if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.ReadMessageHistory)) return;
    try {
      const messages = await channel.messages.fetch({ limit: PENDING_COMMANDS_FETCH_LIMIT }).catch(() => null);
      if (!messages) return;
      const now = Date.now();
      const cutoffLoading = now - PENDING_COMMANDS_LOOKBACK_MS;
      const cutoffOrphan = now - PENDING_ORPHAN_LOOKBACK_MS;
      for (const msg of messages.values()) {
        if (msg.author?.bot || !msg.content?.trim().startsWith(guildPrefix)) continue;
        const msgId = String(msg.id || "");
        if (!msgId || seenIds.has(msgId)) continue;

                const hasLoading = messageHasBotLoadingReaction(msg, client);
        if (hasLoading) {
          if (msg.createdTimestamp < cutoffLoading) continue;
          seenIds.add(msgId);
          collected.push({ message: msg, ts: msg.createdTimestamp, reason: "loading", prefix: guildPrefix });
          continue;
        }

        if (msg.createdTimestamp < cutoffOrphan) continue;
        const command = resolvePendingPrefixCommandToken(client, msg, guildPrefix);
        if (!command) continue;
        seenIds.add(msgId);
        collected.push({ message: msg, ts: msg.createdTimestamp, reason: "orphan", prefix: guildPrefix });
      }
    } catch (err) {
      global.logger?.warn?.("[READY] pending commands fetch failed:", channel?.id, err?.message || err);
    }
  };

  const executeCollected = async (rows, label) => {
    rows.sort((a, b) => a.ts - b.ts);
    if (!rows.length) {
      global.logger?.info?.(`[READY] ${label}: nessun prefix da recuperare.`);
      return;
    }
    const loadingN = rows.filter((row) => row.reason === "loading").length;
    global.logger?.info?.(
      `[READY] ${label}: recupero ${rows.length} prefix (loading=${loadingN}, orphan=${rows.length - loadingN}).`,
    );
    for (const { message, prefix: msgPrefix } of rows) {
      try {
        if (await botAlreadyRepliedToPrefixMessage(message, client)) continue;
        try {
          const loadingEmojiId = IDs.emojis?.loadingAnimatedId;
          const fallbackEmojiId = IDs.emojis?.loadingFallbackId;
          const emoji = loadingEmojiId ? message.client?.emojis?.cache?.get(loadingEmojiId) : null;
          if (emoji) await message.react(emoji).catch(() => { });
          else if (fallbackEmojiId) await message.react(fallbackEmojiId).catch(() => { });
          else await message.react("\u23F3").catch(() => { });
        } catch (_) { }
        message.__fromPendingPrefixRecovery = true;
        await handleOfficialPrefixMessage({
          message,
          resolvedClient: client,
          defaultPrefix: msgPrefix || fallbackPrefix,
          overrideCommand: null,
          maybeSendWrongPrefixHint: noopWrongPrefixHint,
          getCachedOrFetchMember,
          hasAnyStaffBypassPermission,
        });
        if (PENDING_EXEC_GAP_MS > 0) {
          await new Promise((resolve) => setTimeout(resolve, PENDING_EXEC_GAP_MS));
        }
      } catch (err) {
        global.logger?.warn?.("[READY] pending command execution failed:", message?.id, err?.message || err);
      }
    }
  };

  client.__pendingPrefixRecoveryActive = true;
  try {
    const priorityIds = new Set(pendingPriorityChannelIds());
    const guilds = [...client.guilds.cache.values()].filter((g) => isPendingDeepScanGuild(g.id));
        if (!guilds.length) {
      global.logger?.warn?.("[READY] pending prefix: nessun guild main/test da scansionare");
    }

    for (const guild of guilds) {
      const me = guild.members.me;
      let guildPrefix = fallbackPrefix;
      try {
        guildPrefix = String(await resolveCommandPrefixForGuildFresh(guild.id, client) || fallbackPrefix).trim() || fallbackPrefix;
      } catch {
        guildPrefix = fallbackPrefix;
      }

      const channels = await collectPendingPrefixScanChannels(guild, { deep: true });
      const priorityChannels = channels.filter((ch) => priorityIds.has(String(ch.id)));
      const restChannels = channels.filter((ch) => !priorityIds.has(String(ch.id)));

            const phase1 = [];
      const prevCollected = collected.length;
      await mapWithConcurrency(priorityChannels, PENDING_SCAN_CONCURRENCY, (channel) => scanChannel(channel, guildPrefix, me));
      phase1.push(...collected.slice(prevCollected));
      await executeCollected(phase1, `priority ${guild.name || guild.id}`);

            const phase2Start = collected.length;
      await mapWithConcurrency(restChannels, Math.min(2, PENDING_SCAN_CONCURRENCY), (channel) => scanChannel(channel, guildPrefix, me));
      await executeCollected(collected.slice(phase2Start), `rest ${guild.name || guild.id}`);
    }
  } finally {
    client.__pendingPrefixRecoveryActive = false;
  }

  global.logger?.info?.(
    `[READY] Scan prefix in sospeso completato (total=${collected.length}, scanMs=${Date.now() - scanStartedAt}).`,
  );
}

function isPrimaryScheduler(client) {
  return !client.shard || client.shard.ids?.[0] === 0;
}

const INVITE_CACHE_CONCURRENCY = 6;

async function primeInviteCache(client) {
  client.inviteCache = new Map();
  const guilds = [...client.guilds.cache.values()];
  for (let i = 0; i < guilds.length; i += INVITE_CACHE_CONCURRENCY) {
    const batch = guilds.slice(i, i + INVITE_CACHE_CONCURRENCY);
    const results = await Promise.all(batch.map(async (guild) => { const invites = await guild.invites.fetch().catch(() => null); if (!invites) return { guildId: guild.id, inviteMap: null }; const inviteMap = new Map(); for (const invite of invites.values()) { inviteMap.set(invite.code, { uses: invite.uses || 0, inviterId: invite.inviter?.id || null, }); } return { guildId: guild.id, inviteMap }; }),);
    for (const { guildId, inviteMap } of results) {
      if (inviteMap) client.inviteCache.set(guildId, inviteMap);
    }
  }
}

async function restoreBumpReminders(client) {
  const [reminders, discadia, voteReminders] = await Promise.allSettled([restorePendingReminders(client), restorePendingDiscadiaReminders(client), restorePendingVoteReminders(client),]);

  if (reminders.status === "rejected")
    global.logger?.error?.("[DISBOARD REMINDER ERROR]", reminders.reason);
  if (discadia.status === "rejected")
    global.logger?.error?.("[DISCADIA REMINDER ERROR]", discadia.reason);
  if (voteReminders.status === "rejected")
    global.logger?.error?.("[DISCADIA VOTE REMINDER ERROR]", voteReminders.reason);

  startBumpDueReminderSweepLoop(client);
  startDiscadiaVoteReminderLoop(client);
}

async function restoreCoreStartupState(client) {
  const [bootstrap, inviteCache, liveVoiceSync, pmAfkWatchSync, joinRaidRestore] = await Promise.allSettled([
    bootstrapSupporter(client),
    primeInviteCache(client),
    syncLiveVoiceSessionsFromGateway(client),
    syncPmVoiceAfkWatchFromGateway(client),
    Promise.allSettled(
      [...client.guilds.cache.values()]
        .filter((guild) => isViniliFullFeatureGuild(guild.id))
        .map((guild) => restoreTempBans(guild, { force: true })),
    ),
  ]);

  if (bootstrap.status === "rejected")
    global.logger?.error?.("[PRESENCE BOOTSTRAP ERROR]", bootstrap.reason);
  if (inviteCache.status === "rejected")
    global.logger?.error?.("[INVITE CACHE] Failed to prime:", inviteCache.reason);
  if (liveVoiceSync.status === "rejected")
    global.logger?.error?.("[VOICE LIVE SYNC ERROR]", liveVoiceSync.reason);
  if (pmAfkWatchSync.status === "rejected")
    global.logger?.error?.("[PM AFK WATCH] Sync fallita:", pmAfkWatchSync.reason);
  if (joinRaidRestore.status === "rejected")
    global.logger?.error?.("[JOIN RAID RESTORE ERROR]", joinRaidRestore.reason);

  await restoreTtsConnections(client);
  for (const guild of client.guilds.cache.values()) {
    if (!isViniliFullFeatureGuild(guild.id)) continue;
    rehydrateAntiNukePanicForGuild(guild);
  }
  printRecoveryHealthOnce("VINYLS_RECOVERY_HEALTH");
  const { applyBotPresence, schedulePresenceStabilization, installBotPresenceKeeper } = require("../../shared/discord/botPresenceActivity");
  await applyBotPresence(client);
  installBotPresenceKeeper(client);
  schedulePresenceStabilization(client);
}

async function runStartupPanels(client, label = "immediate") {
  if (client._startupPanelsRefreshRunning) return;

  const decision = shouldRunStartupWork(STARTUP_THROTTLE_NS, "startup-panels", {
    ttlMs: STARTUP_PANELS_TTL_MS,
    forceEnv: "STARTUP_PANELS",
  });
  if (!decision.run) {
    global.logger?.info?.(
      `[STARTUP] Panels skipped (${decision.reason}; TTL ${Math.round(STARTUP_PANELS_TTL_MS / 3600000)}h). STARTUP_PANELS=1 o FULL_STARTUP_SYNC=1 per forzare.`,
    );
    return;
  }

  client._startupPanelsRefreshRunning = true;
  const panelsStartedAt = Date.now();
  try {
    client._panelUpsertMessageCache = new Map();
    if (typeof startupPanelsTrigger?.execute === "function") {
      await startupPanelsTrigger.execute(client);
    }
    markStartupThrottle(STARTUP_THROTTLE_NS, "startup-panels");
    global.logger?.info?.(
      `[STARTUP] Panels refresh (${label}, ${decision.reason}) in ${formatDurationMs(Date.now() - panelsStartedAt)}.`,
    );
  } catch (err) {
    global.logger?.error?.(
      `[CLIENT READY] Startup panels refresh failed (${label}):`,
      err,
    );
  } finally {
    client._panelUpsertMessageCache = new Map();
    client._startupPanelsRefreshRunning = false;
  }
}

async function runDeferredStartup(client, primaryScheduler, engagementTick) {
  const startupTasks = buildDeferredStartupTasks(client, primaryScheduler, engagementTick);
  const hooks = createStartupHooks(client);
  const startedAt = Date.now();
  const fullSync = isFullStartupSyncEnabled();
  if (!fullSync) {
    global.logger?.info?.("[STARTUP] Fast path: recovery/sync pesanti saltati (FULL_STARTUP_SYNC=1 per forzarli).");
  }
  const summary = await runPhasedStartupTasks(startupTasks, hooks, { mediumConcurrency: 4 });
  global.logger?.info?.(
    `[STARTUP] phased startup queued: fast=${summary.fastResults.length} medium=${summary.mediumResults.length} heavy=${summary.heavyCount} in ${formatDurationMs(Date.now() - startedAt)}.`,
  );
}

function startPrimaryLoops(client, engagementTick) {
  if (client._primaryLoopsStarted) return;
  client._primaryLoopsStarted = true;

  const interval = setInterval(engagementTick, ENGAGEMENT_INTERVAL_MS);
  interval.unref?.();
  client._primaryEngagementInterval = interval;
  engagementTick().catch((err) => global.logger?.warn?.("[STARTUP] First engagement tick failed:", err?.message || err));

  const startLoopSafely = (label, starter) => {
    try { starter(); } catch (err) { global.logger?.error?.(label, err); }
  };

  const loopStarters = [
    ["[LIVE VOICE EXP] Failed to start loop", () => startLiveVoiceExpLoop(client)],
    ["[MINIGAMES] Failed to start loop", () => void bootstrapMinigameScheduler(client).catch((err) => global.logger?.error?.("[MINIGAMES] bootstrap failed:", err?.message || err))],
    ["[BURROBIRRA] Failed to start loop", () => {
      if (isHogwartsRuntimeDisabled(client)) return;
      startBurrobirraEffectLoop(client);
    }],
    ["[HOUSE BURROBIRRA] Failed to start loop", () => {
      if (isHogwartsRuntimeDisabled(client)) return;
      startHouseBurrobirraEffectLoop(client);
    }],
    ["[VOTE ROLE] Failed to start cleanup loop", () => startVoteRoleCleanupLoop(client)],
    ["[VERIFY TENURE] Failed to start loop", () => startVerificationTenureLoop(client)],
    ["[PREMEMBER] Failed to start Unverified sweep loop", () => startPreMemberRoleSweepLoop(client)],
    ["[CATEGORY NUMBERING] Failed to start loop", () => startCategoryNumberingLoop(client)],
    ["[SPONSOR 24H KICK] Failed to start loop", () => startSponsorKickLoop(client)],
    ["[SPONSOR NICK SWEEP] Failed to start loop", () => startSponsorGuildNicknameSweepLoop(client)],
    ["[BIRTHDAY] Failed to start loop", () => startBirthdayLoop(client)],
    ["[DAILY MEMBER STATS] Failed to start loop", () => startDailyMemberStatsLoop(client)],
    ["[DAILY ENGAGEMENT STATS] Failed to start loop", () => startDailyEngagementStatsLoop(client)],
    ["[DAILY CHANNEL MESSAGE STATS] Failed to start loop", () => startDailyChannelMessageStatsLoop(client)],
    ["[PREMI LA REACT] Failed to start loop", () => {
      if (isHogwartsRuntimeDisabled(client)) return;
      startReactPressEventLoop(client);
    }],
    ["[GALEONI ECONOMY CHANNEL] Failed to start unlock loop", () => {
      if (isHogwartsRuntimeDisabled(client)) return;
      startGaleoniEconomyChannelUnlockLoop(client);
    }],
    ["[TRIS] Failed to purge disabled sessions", () => {
      void purgeDisabledTrisSessions(client).catch((err) =>
        global.logger?.warn?.("[TRIS] purge disabled sessions:", err?.message || err),
      );
    }],
    ["[PREMI LA REACT END] Failed to start leaderboard loop", () => {
      if (isHogwartsRuntimeDisabled(client)) return;
      startPremiLaReactEndLoop(client);
    }],
    ["[HOGWARTS FORBIDDEN CHANNELS] Failed to start loop", () => {
      if (isHogwartsRuntimeDisabled(client)) return;
      const booksCfg = client?.config?.hogwartsForbiddenBooks;
      const presenceCfg = client?.config?.presence?.forbiddenSectionEvent;
      const {
        startForbiddenSectionChannelDecorLoop,
      } = require("../Services/Community/hogwartsForbiddenSectionChannelService");
      if (booksCfg?.enabled === false || presenceCfg?.enabled === false) {
        return;
      }
      startForbiddenSectionChannelDecorLoop(client);
    }],
    ["[HOGWARTS SPELL LIST HUNT] Failed to start loop", () => {
      if (isHogwartsRuntimeDisabled(client)) return;
      startHogwartsSpellListHuntLoop(client);
    }],
    ["[HOGWARTS SPELL LIST HUNT END] Failed to start leaderboard loop", () => {
      if (isHogwartsRuntimeDisabled(client)) return;
      startHogwartsSpellListHuntEndLoop(client);
    }],
    ["[HOGWARTS POTIONS] Failed to start reminder loop", () => {
      if (isHogwartsRuntimeDisabled(client)) return;
      startPotionReminderLoop(client);
    }],
    ["[HOGWARTS EVENT END] Failed to start completion loop", () => {
      if (isHogwartsRuntimeDisabled(client)) return;
      startHogwartsEventEndLoop(client);
    }],
    ["[HOGWARTS CONSUMABLE BOOST EXPIRY] Failed to start loop", () => {
      if (isHogwartsRuntimeDisabled(client)) return;
      startConsumableBoostExpiryLoop(client);
    }],
    ["[CUSTOM ROLE EXPIRY] Failed to start cleanup loop", () => startCustomRoleExpiryLoop(client)],
    ["[USER FULL STATE] Failed to start persistence loop", () => startUserFullStatePersistenceLoop(client)],
    ["[MOD CASE LIFECYCLE] Failed to start loop", () => startModCaseLifecycleLoop(client)],
    ["[TICKET AUTO CLOSE PROMPT] Failed to start loop", () => startTicketAutoClosePromptLoop(client)],
    ["[WEB TICKET SLA] Failed to start loop", () => {
      const { startWebTicketSlaNotifLoop } = require("../Utils/Web/siteWebTicketsApi");
      startWebTicketSlaNotifLoop(client);
    }],
    ["[TRANSCRIPT CLEANUP] Failed to start loop", () => startTranscriptCleanupLoop()],
    ["[WEEKLY ACTIVITY WINNERS] Failed to start loop", () => startWeeklyActivityWinnersLoop(client)],
    ["[HOGWARTS HOUSE CUP] Failed to start loop", () => {
      if (isHogwartsRuntimeDisabled(client)) return;
      startHogwartsHouseCupLoop(client);
    }],
    ["[CONTEST PRIZE] Failed to start cron", () => startContestPrizeMaintenanceCron(client)],
    ["[WEEKLY STAFF RESOCONTO] Failed to start loop", () => startWeeklyStaffResocontoLoop(client)],
    ["[STAFF WARN RESET 6M] Failed to start loop", () => startStaffWarnResetLoop(client)],
    ["[STAFF AUTO VALUTAZIONI] Failed to start loop", () => startStaffAutoValutazioniLoop(client)],
    ["[PM AFK WATCH] Failed to start loop", () => startPmVoiceAfkWatchLoop(client)],
    ["[REPOST ROULETTE] Failed to start cron", () => {
      const { startRepostRouletteCron } = require("../Services/Community/repostRouletteService");
      startRepostRouletteCron(client);
    }],
    ["[PREMIUM EXPIRY REMINDER] Failed to start loop", () => startPremiumExpiryReminderLoop(client)],
    ["[MOVIE NIGHT ANNOUNCE] Failed to start loop", () => startMovieNightAnnouncementLoop(client)],
    ["[EXP EVENT ANNOUNCE] Failed to start loop", () => startGlobalExpEventAnnouncementLoop(client)],
    ["[TWITCH LIVE] Failed to start loop", () => startTwitchLiveAlertLoop(client)],
    ["[KICK LIVE] Failed to start loop", () => startKickLiveAlertLoop(client)],
    ["[KICK SUB] Failed to start sync loop", () => startKickSubscriberSyncLoop(client)],
    ["[DB MAINTENANCE] Failed to start loop", () => startDbMaintenanceLoop(client)],
    ["[STAFF GRACE PURGE] Failed to start loop", () => startStaffGracePurgeLoop(client)],
    ["[JOIN RAID RESTORE] Failed to start loop", () => {
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
      if (String(process.env.BOT_SCHEDULER_EXTERNAL || "").trim() === "1") {
        return;
      }
      const tick = () =>
        runScheduledEnds(client).catch((e) => {
          const isMongoNetwork = e?.name === "MongoNetworkTimeoutError" || e?.name === "MongoServerSelectionError";
          global.logger?.warn?.("[GIVEAWAY] runScheduledEnds", isMongoNetwork ? "MongoDB timeout, will retry next run." : (e?.message || e));
        });
      scheduleActiveGiveawayEnds(client)
        .then((result) => {
          if (result?.scheduled || result?.endedDue) {
            global.logger?.info?.(
              `[GIVEAWAY] end timers: scheduled=${result.scheduled || 0} endedDue=${result.endedDue || 0}`,
            );
          }
        })
        .catch((e) => {
          global.logger?.warn?.("[GIVEAWAY] scheduleActiveGiveawayEnds", e?.message || e);
        });
      syncActiveGiveawayButtons(client)
        .then((result) => {
          if (!result?.scanned) return;
          global.logger?.info?.(`[GIVEAWAY] active button sync: scanned=${result.scanned} updated=${result.updated} failed=${result.failed}`);
        })
        .catch((e) => {
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
        const tick = () => sweepExpiredPartnerManagerTimedPerks(client).catch(() => { });
        tick();
        const timer = setInterval(tick, 5 * 60 * 1000);
        if (typeof timer.unref === "function") timer.unref();
        client._partnerManagerTimedPerksInterval = timer;
      },
    ],
    ["[DISCADIA VOTE QUEUE] Failed to start loop", () => startVoteQueueLoop(client)],
    [
      "[BOT HTTP WEBHOOK] Failed to start",
      () => {
        if (!shouldStartBotHttpServer(client)) return;
        startWebhookServer(client).catch((err) => global.logger?.error?.("[BOT HTTP WEBHOOK]", err));
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

async function queueStartupSync(client) {
  try {
    const mainGuildId = IDs.guilds.main || client.guilds.cache.first()?.id;
    if (!mainGuildId) return;

    queueIdsCatalogSync(client, mainGuildId, "startup", { delayMs: 5000 });

  } catch (err) {
    global.logger?.error?.("[IDS AUTO SYNC] Startup queue failed", err);
  }
}

function scheduleMonthlyGif(client) {
  try {
    if (client._monthlyGifTask) return;
    client._monthlyGifTask = cron.schedule(
      "0 0 1 * *",
      runCronDetached("[MONTHLY GIF]", async () => {
        const channelId = IDs.channels.chat;
        const channel = await getChannelSafe(client, channelId);
        if (!channel?.isTextBased?.()) return;

        await channel.send({
          content: "@everyone",
          allowedMentions: { parse: ["everyone"] },
          files: [
            {
              attachment: "https://media.tenor.com/crZirRXKLuQAAAAC/manhdz2k9.gif",
              name: "monthly.gif",
            },
          ],
        });
      }),
      { timezone: "Europe/Rome", noOverlap: true },
    );
  } catch (err) {
    global.logger?.error?.("[MONTHLY GIF] Failed to schedule", err);
  }
}

function maybeCheckPackagesOnReady(client) {
  if (typeof checkAndInstallPackages !== "function") return;
  if (String(process.env.CHECK_PACKAGES_ON_READY || "").trim() !== "1") return;
  Promise.resolve(checkAndInstallPackages(client)).catch((err) => {
    logError(client, "[PACKAGES] Check failed:", err?.message || err);
  });
}

module.exports = {
  name: "clientReady",
  once: true,
  async execute(client) {
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
      require("../Utils/Community/pronounGenderUtils").registerPronounGenderReplyHook();
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
    const primaryScheduler = isPrimaryScheduler(client);
    if (primaryScheduler) {
      try {
        const result = await migrateLegacyDailyStatsCollections();
        if (!result?.skipped) global.logger?.info?.("[DAILY STATS MIGRATION] completed into dailystats.");
      } catch (err) {
        global.logger?.warn?.("[DAILY STATS MIGRATION] failed:", err?.message || err);
      }
    }

    if (primaryScheduler) {
      try {
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
      try {
        const {
          startPartnershipHistoryMigrationWorker,
        } = require("../Services/Partner/tenantPartnershipHistoryMigrationService");
        startPartnershipHistoryMigrationWorker(client);
      } catch (err) {
        global.logger?.error?.("[PARTNERSHIP HISTORY MIGRATION WORKER]", err);
      }
      try {
        startStaffCmdsThreadsLoop(client);
      } catch (err) {
        global.logger?.error?.("[STAFF CMDS THREAD INIT ERROR]", err);
      }
      try {
        startResocontoStaffChannelAccessLoop(client);
      } catch (err) {
        global.logger?.error?.("[RESOCONTO STAFF CHANNEL INIT ERROR]", err);
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
        const { sweepUntrustedBotsInGuild } = require("../Services/Moderation/trustedBotGuardService");
        const mainGuildId = String(require("../Utils/Config/ids").guilds?.main || "").trim();
        if (mainGuildId) {
          setTimeout(() => {
            const guild = client.guilds.cache.get(mainGuildId);
            if (guild) {
              sweepUntrustedBotsInGuild(guild, client).catch((err) =>
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
      try {
        startAutoBackupLoop(client);
      } catch (err) {
        global.logger?.error?.("[AUTO BACKUP] Failed to start loop", err);
      }
    }

    if (primaryScheduler) {
      let engagementTickRunning = false;
      const engagementTick = async () => {
        if (String(process.env.BOT_SCHEDULER_EXTERNAL || "").trim() === "1") return;
        if (engagementTickRunning) return;
        engagementTickRunning = true;
        try {
          await runDueOneTimeReminders(client);
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
      try {
        startDiscadiaVoteMonthRolloverCron(client);
      } catch (err) {
        logError(client, "[DISCADIA_VOTE_MONTH_CRON] schedule failed:", err);
      }
    }
    maybeCheckPackagesOnReady(client);
    try {
      startAutoPollLoop(client);
    } catch (error) {
      logError(client, "[STATUS] Error while loading bot status (auto poll):", error);
    }

    logBotReady(client, readyStartedAt);

    try {
      const { initLavalinkMusicIfEnabled } = require("../Services/Music/lavalinkMusicService");
      initLavalinkMusicIfEnabled(client);
    } catch (err) {
      global.logger?.warn?.("[MUSIC] init:", err?.message || err);
    }

    void processPendingPrefixCommands(client).catch((err) => global.logger?.warn?.("[READY] pending commands:", err?.message || err));
    void processPendingCountingMessages(client).catch((err) => global.logger?.warn?.("[READY] counting catch-up:", err?.message || err));
    void rehydrateCountingChannelBans(client).catch((err) =>
      global.logger?.warn?.("[READY] counting channel bans rehydrate:", err?.message || err),
    );
    void hydrateCountingRestoreTokens(client).catch((err) =>
      global.logger?.warn?.("[READY] counting restore tokens hydrate:", err?.message || err),
    );
    startCountingRestoreMaintenance(client);
    const countingCatchUpRetry = setTimeout(() => {
      void processPendingCountingMessages(client).catch((err) =>
        global.logger?.warn?.("[READY] counting catch-up retry:", err?.message || err),
      );
    }, STARTUP_PANELS_RETRY_MS);
    countingCatchUpRetry.unref?.();

    if (primaryScheduler) {
            startPauseMessageStatusMaintenance(client);
            try {
        const { isDiscordPanelEnabled } = require("../Utils/Config/discordPanelsConfig");
        if (isDiscordPanelEnabled("staffList")) {
          const { startStaffListPeriodicRefreshLoop } = require("../Utils/Community/staffListUtils");
          startStaffListPeriodicRefreshLoop(client);
        }
      } catch (err) {
        global.logger?.warn?.("[STAFF LIST] startup bootstrap failed:", err?.message || err);
      }
      void runStartupPanels(client, "ready").catch(() => { });
            if (envFlagEnabled("STARTUP_PANELS_RETRY")) {
        const retryPanels = setTimeout(() => {
          void runStartupPanels(client, "ready-retry").catch(() => { });
        }, STARTUP_PANELS_RETRY_MS);
        retryPanels.unref?.();
      }
    }

    const cleanupDisabled = String(process.env.CLEANUP_USERS_NOT_IN_SERVER_ON_STARTUP || "1").trim().toLowerCase() === "0";
    if (!cleanupDisabled && (isFullStartupSyncEnabled() || shouldRunMediumStartup("cleanup-users", CLEANUP_USERS_NOT_IN_SERVER_INTERVAL_MS || 24 * 60 * 60 * 1000))) {
      const t = setTimeout(() => {
        runFullCleanupUsersNotInServer(client)
          .then(() => markMediumStartup("cleanup-users"))
          .catch((err) => {
            global.logger?.warn?.("[CLEANUP USERS NOT IN SERVER] Startup cleanup failed:", err);
          });
      }, CLEANUP_USERS_NOT_IN_SERVER_DELAY_MS);
      if (t?.unref) t.unref();
    } else if (!cleanupDisabled) {
      global.logger?.info?.("[STARTUP] Cleanup utenti non in server saltato (throttle); FULL_STARTUP_SYNC=1 per forzare.");
    }
    if (CLEANUP_USERS_NOT_IN_SERVER_INTERVAL_MS > 0) {
      const iv = setInterval(() => {
        runFullCleanupUsersNotInServer(client).catch((err) => {
          global.logger?.warn?.("[CLEANUP USERS NOT IN SERVER] Periodic cleanup failed:", err);
        });
      }, CLEANUP_USERS_NOT_IN_SERVER_INTERVAL_MS);
      if (iv?.unref) iv.unref();
    }

    setTimeout(() => {
      const { sweepAccessGuild } = require("../Services/Staff/staffAccessMirrorService");
      sweepAccessGuild(client).catch((err) => {
        global.logger?.warn?.("[STAFF ACCESS MIRROR] startup sweep failed:", err);
      });
    }, 30_000).unref?.();

    const { applyBotPresence, installBotPresenceKeeper } = require("../../shared/discord/botPresenceActivity");
    await applyBotPresence(client);
    installBotPresenceKeeper(client);
  },
};