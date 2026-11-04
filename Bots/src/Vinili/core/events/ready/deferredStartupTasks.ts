const { shouldRunDiscadiaVoteMonthRepairOnStartup, repairDiscadiaVoteMonthRowsForMainGuild, } = require("../../../Community/services/discadiaVoteMonthRepairOnStartupService") as typeof import("../../../Community/services/discadiaVoteMonthRepairOnStartupService");
const { processAllRecentAutomationMessages } = require("../../../Community/services/officialMessageAutomationHandlers") as typeof import("../../../Community/services/officialMessageAutomationHandlers");
const { recoverMissedTopggVotesOnStartup } = require("../../../Community/services/topggVoteRecoveryOnStartupService") as typeof import("../../../Community/services/topggVoteRecoveryOnStartupService");
const { recoverSupporterStatusAnnouncesOnStartup } = require("../../../Community/events/presenceUpdate") as typeof import("../../../Community/events/presenceUpdate");
const { runDueChannelReminders, } = require("../../../Community/services/channelReminderService") as typeof import("../../../Community/services/channelReminderService");
const { backfillVerificationTenure, runAllGuilds: renumberAllCategories } = require("../../../Community/services/communityOpsService") as typeof import("../../../Community/services/communityOpsService");
const { sweepExpiredCommunicationTimeoutMirrors, reconcileIncompleteActiveMuteMirrors } = require("../../../Moderation/services/mutedMirrorRoleService") as typeof import("../../../Moderation/services/mutedMirrorRoleService");
const { sweepStalePreMemberRoles } = require("../../../Community/utils/preMemberRoleService") as typeof import("../../../Community/utils/preMemberRoleService");
const { sendBannedUnbanLinkDms, shouldRunBannedUnbanDmOnStartup } = require("../../../Moderation/services/bannedUnbanDmService") as typeof import("../../../Moderation/services/bannedUnbanDmService");
const { runExpiredCustomRolesSweep, } = require("../../../Community/services/customRoleExpiryService") as typeof import("../../../Community/services/customRoleExpiryService");
const { syncPartnerDescription } = require("../../../Partner/services/partnerDescriptionSyncService") as typeof import("../../../Partner/services/partnerDescriptionSyncService");
const { syncAllTenantPartnerDescriptions } = require("../../../Partner/services/tenantPartnerDescriptionService") as typeof import("../../../Partner/services/tenantPartnerDescriptionService");
const { syncAllStaffAutoValutazioni, restoreActiveSerataFilmSessions, cleanupMalformedAutoValutazioni } = require("../../../Staff/services/staffAutoValutazioniService") as typeof import("../../../Staff/services/staffAutoValutazioniService");
const { reconcileResocontoReviewerRewardAutoValutazioni } = require("../../../Staff/services/resocontoReviewerRewardService") as typeof import("../../../Staff/services/resocontoReviewerRewardService");
const { retroSyncGuildLevels, healLevelRolesForGuildOnStartup } = require("../../../Level/services/expService") as typeof import("../../../Level/services/expService");
const { ensureMovieNightStaffCommunicationOnStartup, recoverMovieNightAnnouncementsOnStartup } = require("../../../Community/services/movieNightAnnouncementService") as typeof import("../../../Community/services/movieNightAnnouncementService");
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const guildMemberUpdateExtras = require("../../../Community/services/boostAnnounceRecoveryService") as typeof import("../../../Community/services/boostAnnounceRecoveryService");
const guildMemberAddExtras = require("../../../Community/events/guildMemberAdd") as typeof import("../../../Community/events/guildMemberAdd");
const { recoverDonationPackageAnnouncesOnStartup } = require("../../../Community/utils/donationPackageSupportersAnnounce") as typeof import("../../../Community/utils/donationPackageSupportersAnnounce");
const { recoverManualSocialRoleAnnouncesOnStartup } = require("../../../Community/utils/manualSocialRoleAnnounceAndPicPerms") as typeof import("../../../Community/utils/manualSocialRoleAnnounceAndPicPerms");
const { reconcilePatronRolesOnStartup, recoverPatronAnnouncesOnStartup } = require("../../../Community/utils/patronRoleService") as typeof import("../../../Community/utils/patronRoleService");
const { revokeAllPremiumBySource } = require("../../../../MultiGuild/core/tenantPremium") as typeof import("../../../../MultiGuild/core/tenantPremium");
const { recoverLevelMilestoneSupportersAnnouncesOnStartup } = require("../../../Community/utils/levelMilestoneSupportersAnnounceEmbeds") as typeof import("../../../Community/utils/levelMilestoneSupportersAnnounceEmbeds");
const { syncAllMembersClanTags } = require("../../../Community/services/clanTagRoleService") as typeof import("../../../Community/services/clanTagRoleService");
const { syncZodiacRolesFromStoredBirthdays } = require("../../../Community/utils/zodiacRoles") as typeof import("../../../Community/utils/zodiacRoles");
const { syncAgeBracketRolesFromStoredBirthdays } = require("../../../Community/utils/ageBracketRoles") as typeof import("../../../Community/utils/ageBracketRoles");
const { postTopggStatsDigestIfConfigured } = require("../../../site/http/topggDigestService") as typeof import("../../../site/http/topggDigestService");
const { runPhasedStartupTasks, } = require("../../../../shared/runtime/readyStartupRuntime") as typeof import("../../../../shared/runtime/readyStartupRuntime");
const {
  STARTUP_THROTTLE_NS,
  STARTUP_MEDIUM_TTL_MS,
  STARTUP_PANELS_TTL_MS,
  shouldRunVerificationTenureBackfill,
  shouldRunTopggStatsDigestOnStartup,
  createStartupHooks,
  shouldRunMediumStartup,
  markMediumStartup,
  isStartupThrottleDue,
  isFullStartupSyncEnabled,
  formatDurationMs,
} = require("./startupHelpers") as typeof import("./startupHelpers");
const {
  restoreBumpReminders,
  restoreCoreStartupState,
  queueStartupSync,
} = require("./startupRestore") as typeof import("./startupRestore");
const { envFlagOn } = require("../../../../shared/runtime/externalWorkerGate") as typeof import("../../../../shared/runtime/externalWorkerGate");

function buildDeferredStartupTasks(client?, primaryScheduler?, engagementTick?, runContext = "gateway") {
  const isWorkerCtx = runContext === "worker";
  const botSchedulerSplit = envFlagOn("BOT_SCHEDULER_EXTERNAL");
  /** Gateway-only tasks stay on bots-vinyls; offloaded tasks run on bot-scheduler when BOT_SCHEDULER_EXTERNAL=1. */
  const startupEnabled = (base?, offload = false) => {
    if (!base) return false;
    if (isWorkerCtx) return Boolean(offload && botSchedulerSplit);
    if (offload && botSchedulerSplit) return false;
    return true;
  };
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
      enabled: startupEnabled(primaryScheduler, true),
      run: () =>
        sweepExpiredCommunicationTimeoutMirrors(client, {
          limit: 100,
          includeRecentUnmuteRecovery: true,
        }),
    },
    {
      label: "incomplete active mute mirror reconcile",
      weight: 5,
      enabled: startupEnabled(primaryScheduler, true),
      run: () =>
        reconcileIncompleteActiveMuteMirrors(client, {
          limit: 80,
                              scanTimedOutMembers: true,
        }),
    },
    {
      label: "stale Unverified (preMember) role sweep",
      weight: 6,
      enabled: startupEnabled(primaryScheduler, true),
      run: () =>
        sweepStalePreMemberRoles(client, {
                    fetchMembers: fullSync,
          limit: fullSync ? 500 : 200,
        }),
    },
    {
      label: "run due channel reminders",
      weight: 8,
      enabled: startupEnabled(primaryScheduler, true),
      run: async () => {
        await runDueChannelReminders(client);
      },
    },
    {
      label: "restore core startup state",
      weight: 10,
      enabled: startupEnabled(true),
      run: () => restoreCoreStartupState(client),
    },
    /* orphan ticket reconcile → archivio/codice-morto (main Discord tickets site-only) */
    {
      label: "startup sync queue",
      weight: 12,
      enabled: startupEnabled(true),
      run: () => queueStartupSync(client),
    },
    {
      label: "sync partner description cache",
      weight: 16,
      enabled: startupEnabled(primaryScheduler && (fullSync || shouldRunMediumStartup("partner-desc")), true),
      run: async () => {
        await syncPartnerDescription(client);
        markMediumStartup("partner-desc");
      },
    },
    {
      label: "sync tenant partner description cache",
      weight: 16,
      enabled: startupEnabled(primaryScheduler && (fullSync || shouldRunMediumStartup("tenant-partner-desc")), true),
      run: async () => {
        await syncAllTenantPartnerDescriptions(client);
        markMediumStartup("tenant-partner-desc");
      },
    },
    {
      label: "restore bump reminders",
      weight: 15,
      enabled: startupEnabled(primaryScheduler, true),
      run: () => restoreBumpReminders(client),
    },
    {
      label: "process recent automation messages (vote, bump)",
      weight: 18,
      /* rebootDurability1: anche fast path (TTL) — altrimenti miss durante downtime */
      enabled: startupEnabled(primaryScheduler && (fullSync || shouldRunMediumStartup("automation-recheck", STARTUP_MEDIUM_TTL_MS)), true),
      run: async () => {
        await processAllRecentAutomationMessages(client);
        markMediumStartup("automation-recheck");
      },
    },
    {
      label: "recover missed Top.gg votes (API backfill)",
      weight: 18.5,
      enabled: startupEnabled(primaryScheduler && (fullSync || shouldRunMediumStartup("topgg-vote-recover", STARTUP_MEDIUM_TTL_MS)), true),
      run: async () => {
        await recoverMissedTopggVotesOnStartup(client);
        markMediumStartup("topgg-vote-recover");
      },
    },
    {
      label: "engagement tick",
      weight: 20,
      enabled: startupEnabled(primaryScheduler),
      run: () => engagementTick(),
    },
    {
      label: "discadia vote month recovery (solo se mezzanotte 1° non ha rollover)",
      weight: 25,
      enabled: startupEnabled(primaryScheduler && shouldRunDiscadiaVoteMonthRepairOnStartup(client), true),
      run: () => repairDiscadiaVoteMonthRowsForMainGuild(client, "startup"),
    },
    {
      label: "sync Discord AutoMod rules (Vinili)",
      weight: 28,
      enabled: startupEnabled(primaryScheduler && (fullSync || shouldRunMediumStartup("discord-automod", STARTUP_MEDIUM_TTL_MS)), true),
      run: async () => {
        global.__vinylsDiscordClient = client;
        const {
          syncDiscordAutomodRulesForClient,
          shouldSyncOnStartup,
        } = require("../../../Moderation/services/discordAutomodRulesService") as typeof import("../../../Moderation/services/discordAutomodRulesService");
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
      enabled: startupEnabled(primaryScheduler && fullSync, true),
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
      enabled: startupEnabled(primaryScheduler && shouldRunTopggStatsDigestOnStartup(client), true),
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
      /* missedJoinCatchup1: sempre al boot (anche fast path) — offload su bot-scheduler */
      enabled: startupEnabled(primaryScheduler, true),
      run: () =>
        guildMemberAddExtras.recoverJoinAnnouncementsOnStartup(client, {
          limit: fullSync ? 40 : 30,
          lookbackMs: 48 * 60 * 60 * 1000,
        }),
    },
    {
      label: "recover missed donation package supporter announces",
      weight: 44,
      /* boostDedup3: solo fullSync — restart medi ri-mandavano announce già postati */
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: async () => {
        await recoverDonationPackageAnnouncesOnStartup(client, {
          limit: 20,
          lookbackMs: 24 * 60 * 60 * 1000,
        });
        markMediumStartup("donation-announce");
      },
    },
    {
      label: "recover missed social role supporter announces",
      weight: 45,
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: async () => {
        await recoverManualSocialRoleAnnouncesOnStartup(client, {
          limit: 20,
          lookbackMs: 24 * 60 * 60 * 1000,
        });
        markMediumStartup("social-role-announce");
      },
    },
    {
      label: "revoke Discord Store Premium (migrated to credits)",
      weight: 45.1,
      enabled: startupEnabled(primaryScheduler && (fullSync || shouldRunMediumStartup("revoke-discord-store-premium", STARTUP_MEDIUM_TTL_MS)), true),
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
      enabled: startupEnabled(primaryScheduler && (fullSync || shouldRunMediumStartup("patron-reconcile", STARTUP_MEDIUM_TTL_MS)), true),
      run: async () => {
        await reconcilePatronRolesOnStartup(client, { limit: fullSync ? 300 : 120 });
        markMediumStartup("patron-reconcile");
      },
    },
    {
      label: "recover missed patron role announces",
      weight: 45.4,
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: async () => {
        await recoverPatronAnnouncesOnStartup(client, {
          limit: 15,
          lookbackMs: 24 * 60 * 60 * 1000,
        });
        markMediumStartup("patron-announce");
      },
    },
    {
      label: "recover missed level milestone supporter announces",
      weight: 46,
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: async () => {
        await recoverLevelMilestoneSupportersAnnouncesOnStartup(client, {
          limit: 25,
          lookbackMs: 24 * 60 * 60 * 1000,
        });
        markMediumStartup("level-milestone-announce");
      },
    },
    {
      label: "recover missed supporter status embeds",
      weight: 47,
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: async () => {
        await recoverSupporterStatusAnnouncesOnStartup(client, {
          limit: 15,
        });
        markMediumStartup("supporter-status-announce");
      },
    },
    {
      label: "ensure Serata Film staff news communication",
      weight: 47,
      enabled: startupEnabled(primaryScheduler && (fullSync || shouldRunMediumStartup("movie-night-staff", STARTUP_PANELS_TTL_MS)), true),
      run: async () => {
        await ensureMovieNightStaffCommunicationOnStartup(client);
        markMediumStartup("movie-night-staff");
      },
    },
    {
      label: "recover missed Serata Film cron announcements",
      weight: 48,
      enabled: startupEnabled(primaryScheduler && (fullSync || shouldRunMediumStartup("movie-night-announce", STARTUP_MEDIUM_TTL_MS)), true),
      run: async () => {
        await recoverMovieNightAnnouncementsOnStartup(client);
        markMediumStartup("movie-night-announce");
      },
    },
    {
      label: "restore active Serata Film staff tracking",
      weight: 49,
      enabled: startupEnabled(primaryScheduler, true),
      run: () => restoreActiveSerataFilmSessions(client),
    },
    {
      label: "backfill boost announce slot counts from supporters history",
      weight: 50,
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: () => guildMemberUpdateExtras.backfillAnnouncedBoostSlotsFromSupportersHistory(client),
    },
    {
      label: "recover unannounced boosters (member + native scan)",
      weight: 50.5,
      /* boostDedup3: SOLO fullSync — restart/pm2 ri-mandava boost dopo ~3min */
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: async () => {
        await guildMemberUpdateExtras.recoverUnannouncedBoostersOnStartup(client, {
          lookbackMs: 48 * 60 * 60 * 1000,
          maxRecover: 25,
        });
        markMediumStartup("boost-unannounced");
      },
    },
    {
      label: "recover missing second boost embeds (native vs supporters)",
      weight: 51,
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: async () => {
        await guildMemberUpdateExtras.recoverMissingSecondBoostEmbedsOnStartup(client, {
          lookbackMs: 7 * 24 * 60 * 60 * 1000,
          maxRecover: 10,
        });
        markMediumStartup("boost-second");
      },
    },
    {
      label: "recover last 2 native boost system messages (multi-channel scan)",
      weight: 51,
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: async () => {
        await guildMemberUpdateExtras.recoverLastGlobalNativeBoostEmbedsOnStartup(client, {
          messageLimit: 5,
          lookbackMs: 24 * 60 * 60 * 1000,
        });
        markMediumStartup("boost-last-native");
      },
    },
    {
      label: "custom role expiry sweep",
      weight: 52,
      enabled: startupEnabled(primaryScheduler, true),
      run: () => runExpiredCustomRolesSweep(client),
    },
    {
      label: "DM banned users unban link (run once)",
      weight: 55,
      enabled: startupEnabled(primaryScheduler && shouldRunBannedUnbanDmOnStartup(client), true),
      run: async () => {
        const result: any = await sendBannedUnbanLinkDms(client, { dryRun: false, once: true });
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
      /* perfP2: indici anche senza FULL_STARTUP_SYNC (claim atomico settimanale) */
      label: "ensure MongoDB indexes (weekly / full sync)",
      weight: 76,
      enabled: startupEnabled(
        primaryScheduler &&
          (fullSync || isStartupThrottleDue(STARTUP_THROTTLE_NS, "mongo-indexes", 7 * 24 * 60 * 60 * 1000).due),
        true,
      ),
      run: async () => {
        const { tryClaimStartupWork } = require("../../../../shared/runtime/startupThrottleCache") as typeof import("../../../../shared/runtime/startupThrottleCache");
        const claim = tryClaimStartupWork(STARTUP_THROTTLE_NS, "mongo-indexes", 7 * 24 * 60 * 60 * 1000);
        if (!fullSync && !claim.claimed) return;
        const { ensureMongoIndexes } = require("../../../../shared/db/mongoConnect") as typeof import("../../../../shared/db/mongoConnect");
        await ensureMongoIndexes({ reason: fullSync ? "full_startup_sync" : "weekly_throttle" });
        if (fullSync) markMediumStartup("mongo-indexes");
      },
    },
            {
      label: "custom private category empty cleanup",
      weight: 54,
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: async () => {
        const guildId = String(IDs?.guilds?.main || "").trim();
        if (!guildId) return;
        const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
        if (!guild) return;
        const {
          tryDeleteEmptyCustomPrivateCategory,
          listCustomPrivateCategories,
          syncCustomPrivateCategoryLayout,
        } = require("../../../Community/utils/customPrivateCategoryUtils") as typeof import("../../../Community/utils/customPrivateCategoryUtils");
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
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: () => syncZodiacRolesFromStoredBirthdays(client),
    },
    {
      label: "startup sync age bracket roles from birthday profiles",
      weight: 78,
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: () => syncAgeBracketRolesFromStoredBirthdays(client),
    },
    {
      label: "startup sync staff auto valutazioni",
      weight: 80,
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: async () => {
        await cleanupMalformedAutoValutazioni();
        await syncAllStaffAutoValutazioni(client);
      },
    },
    {
      label: "reconcile resoconto reviewer compito settimanale",
      weight: 81,
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: () => (reconcileResocontoReviewerRewardAutoValutazioni as any)(client),
    },
    {
      label: "verification tenure backfill",
      weight: 85,
      enabled: startupEnabled(primaryScheduler && fullSync && shouldRunVerificationTenureBackfill(client), true),
      run: () => backfillVerificationTenure(client),
    },
    {
      label: "renumber categories",
      weight: 88,
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: () => renumberAllCategories(client),
    },
    {
      label: "retro sync guild levels",
      weight: 90,
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: async () => {
        const mainGuild = await resolveMainGuild();
        if (!mainGuild) return;
        return retroSyncGuildLevels(mainGuild, { syncRoles: false });
      },
    },
    {
      label: "heal missing level milestone roles",
      weight: 91,
      /* levelRoleBootHeal1 / rebootDurability1: anche fast path — Level10+ senza ruolo; offload su bot-scheduler */
      enabled: startupEnabled(primaryScheduler && (fullSync || shouldRunMediumStartup("level-role-heal", STARTUP_MEDIUM_TTL_MS)), true),
      run: async () => {
        const mainGuild = await resolveMainGuild();
        if (!mainGuild) return;
        const out = await healLevelRolesForGuildOnStartup(mainGuild, {
          limit: fullSync ? 200 : 100,
        });
        markMediumStartup("level-role-heal");
      },
    },
    {
      label: "startup sync clan tag roles",
      weight: 92,
      enabled: startupEnabled(primaryScheduler && fullSync, true),
      run: () => syncAllMembersClanTags(client),
    },
  ];
}

async function runDeferredStartup(client?, primaryScheduler?, engagementTick?) {
  const startupTasks = buildDeferredStartupTasks(client, primaryScheduler, engagementTick);
  const hooks = createStartupHooks(client);
  const startedAt = Date.now();
  const summary = await runPhasedStartupTasks(startupTasks, hooks, { mediumConcurrency: 4 });
  global.logger?.info?.(
    `[STARTUP] ready: fast=${summary.fastResults.length} medium=${summary.mediumResults.length} heavy=${summary.heavyCount} in ${formatDurationMs(Date.now() - startedAt)}${isFullStartupSyncEnabled() ? " (full sync)" : ""}.`,
  );
}

async function runBotSchedulerWorkerDeferredStartup(client?) {
  if (!envFlagOn("BOT_SCHEDULER_WORKER") || !envFlagOn("BOT_SCHEDULER_EXTERNAL")) return;
  const noopTick = async () => {};
  const startupTasks = buildDeferredStartupTasks(client, true, noopTick, "worker");
  const hooks = createStartupHooks(client);
  const startedAt = Date.now();
  const summary = await runPhasedStartupTasks(startupTasks, hooks, { mediumConcurrency: 4 });
  global.logger?.info?.(
    `[BOT-SCHEDULER][STARTUP] deferred: fast=${summary.fastResults.length} medium=${summary.mediumResults.length} heavy=${summary.heavyCount} in ${formatDurationMs(Date.now() - startedAt)}.`,
  );
}

export = {
  buildDeferredStartupTasks,
  runDeferredStartup,
  runBotSchedulerWorkerDeferredStartup,
};
