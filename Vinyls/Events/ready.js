const config = require("../config.json");
const { connectMongo } = require("../Utils/Database/mongoConnect");
const cron = require("node-cron");
const { runCronDetached } = require("../../shared/scheduling/cronDetached");
const { scheduleStaffListRefresh } = require("../Utils/Community/staffListUtils");
const { restorePendingVoteReminders, restorePendingDiscadiaReminders, restorePendingReminders, startBumpDueReminderSweepLoop, startDiscadiaVoteReminderLoop, } = require("../Services/Bump/bumpService");
const { shouldRunDiscadiaVoteMonthRepairOnStartup, repairDiscadiaVoteMonthRowsForMainGuild, startDiscadiaVoteMonthRolloverCron } = require("../Services/Bump/discadiaVoteMonthRepairOnStartupService");
const { processAllRecentAutomationMessages } = require("../Utils/Message/officialMessageAutomationHandlers");
const { processPendingCountingMessages } = require("../Utils/Message/officialMessageCommunityHandlers");
const { rehydrateCountingChannelBans } = require("../Utils/Community/countingChannelBanService");
const { bootstrapSupporter } = require("./presenceUpdate");
const { restoreTtsConnections } = require("../Services/TTS/ttsService");
const { runDueOneTimeReminders, } = require("../Services/Reminders/oneTimeReminderService");
const { bootstrapMinigameScheduler } = require("../Services/Minigames/minigameService");
const { startVerificationTenureLoop, backfillVerificationTenure, startVoteRoleCleanupLoop, runAllGuilds: renumberAllCategories, startCategoryNumberingLoop, startSponsorKickLoop, startSponsorGuildNicknameSweepLoop, } = require("../Services/Community/communityOpsService");
const { startBirthdayLoop } = require("../Services/Community/birthdayService");
const { startDailyMemberStatsLoop } = require("../Services/Community/dailyMemberStatsService");
const { startDailyEngagementStatsLoop } = require("../Services/Community/dailyEngagementStatsService");
const { startDailyChannelMessageStatsLoop } = require("../Services/Community/dailyChannelMessageStatsService");
const { startReactPressEventLoop } = require("../Services/Community/hogwartsReactPressService");
const { startPremiLaReactEndLoop } = require("../Services/Community/hogwartsReactPressEndService");
const { startHogwartsSpellListHuntLoop } = require("../Services/Community/hogwartsSpellListHuntService");
const { startHogwartsSpellListHuntEndLoop } = require("../Services/Community/hogwartsSpellListHuntEndService");
const { startPotionReminderLoop } = require("../Services/Community/hogwartsPotionReminderService");
const { startHogwartsEventEndLoop } = require("../Services/Community/hogwartsEventEndService");
const { migrateLegacyDailyStatsCollections } = require("../Services/Community/dailyStatsStore");
const { restoreTempBans } = require("../Services/Moderation/joinRaidService");
const { sweepExpiredCommunicationTimeoutMirrors } = require("../Services/Moderation/mutedMirrorRoleService");
const { sendBannedUnbanLinkDms, shouldRunBannedUnbanDmOnStartup } = require("../Services/Moderation/bannedUnbanDmService");
const { rehydrateAntiNukePanicForGuild } = require("../Services/Moderation/antiNukeService");
const { syncLiveVoiceSessionsFromGateway, startLiveVoiceExpLoop, } = require("../Services/Community/activityService");
const { syncPmVoiceAfkWatchFromGateway, startPmVoiceAfkWatchLoop, } = require("../Services/Staff/pmVoiceAfkWatchService");
const { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop, } = require("../Services/Community/customRoleExpiryService");
const { startDailyPartnerAuditLoop, } = require("../Services/Partner/partnerAuditService");
const { startPartnershipChannelCleanupLoop } = require("../Services/Partner/partnershipChannelCleanupService");
const { startPartnerPmDailyThreadLoop } = require("../Services/Partner/partnerPmDailyThreadService");
const { startTicketAutoClosePromptLoop, startTranscriptCleanupLoop, } = require("../Services/Ticket/ticketMaintenanceService");
const { startAutoBackupLoop } = require("../Services/Backup/autoBackupService");
const { startModCaseLifecycleLoop } = require("../Services/Moderation/modCaseLifecycleService");
const { startWeeklyStaffResocontoLoop } = require("../Services/Staff/weeklyStaffResocontoService");
const { startWeeklyActivityWinnersLoop } = require("../Services/Community/weeklyActivityWinnersService");
const { startHogwartsHouseCupLoop } = require("../Services/Community/hogwartsHouseCupPublishService");
const { syncHogwartsShopLogsOnStartup } = require("../Services/Community/hogwartsShopLogService");
const { syncHouseSortingAnnouncesOnStartup } = require("../Services/Community/hogwartsSortingLogService");
const { startContestPrizeMaintenanceCron } = require("../Services/Community/contestPrizeMaintenanceService");
const { startStaffWarnResetLoop } = require("../Services/Staff/staffWarnService");
const { startStaffAutoValutazioniLoop, syncAllStaffAutoValutazioni, restoreActiveSerataFilmSessions, cleanupMalformedAutoValutazioni } = require("../Services/Staff/staffAutoValutazioniService");
const { runScheduledEnds, syncActiveGiveawayButtons } = require("../Services/Giveaway/giveawayService");
const { retroSyncGuildLevels } = require("../Services/Community/expService");
const { runFullCleanupUsersNotInServer } = require("../Services/Community/cleanupUsersNotInServerService");
const { runCustomPerksRulesMigration } = require("../Services/Community/customPerksRulesMigrationService");
const { startStaffGracePurgeLoop } = require("../Services/Community/userLeaveBackupService");
const { startDbMaintenanceLoop } = require("../Services/Community/dbMaintenanceService");
const { startVoteQueueLoop } = require("../Services/Web/discadiaVoteQueueService");
const { startWebhookServer, shouldStartBotHttpServer } = require("../Services/Web/webhookService");
const { checkAndInstallPackages } = require("../Utils/Moderation/checkPackages");
const { startAutoPollLoop } = require("../Services/Community/autoPollService");
const { startMovieNightAnnouncementLoop } = require("../Services/Community/movieNightAnnouncementService");
const { printRecoveryHealthOnce } = require("../../shared/recovery/recoveryHealth");
const IDs = require("../Utils/Config/ids");
const guildMemberUpdateExtras = require("./guildMemberUpdate");
const startupPanelsTrigger = require("../Triggers/embeds");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const { syncAllMembersClanTags } = require("../Services/Community/clanTagRoleService");
const { syncZodiacRolesFromStoredBirthdays } = require("../Utils/Community/zodiacRoles");
const { syncAgeBracketRolesFromStoredBirthdays } = require("../Utils/Community/ageBracketRoles");
const { postTopggStatsDigestIfConfigured } = require("../Services/Web/topggDigestService");
const { restorePauseMessageStatusSync } = require("../Utils/Pause/pauseHandlersUtils");
const { formatDurationMs, runPhasedStartupTasks, } = require("../Utils/Startup/readyStartupRuntime");
const { logBotReady } = require("../../shared/discord/readyLog");
const { sweepExpiredPartnerManagerTimedPerks } = require("../Utils/Staff/partnerManagerTimedPerks");
const STARTUP_PANELS_RETRY_MS = 15000;
const ENGAGEMENT_INTERVAL_MS = Number(process.env.ENGAGEMENT_INTERVAL_MS) || 60 * 1000;
const JOIN_RAID_RESTORE_INTERVAL_MS = Number(process.env.JOIN_RAID_RESTORE_INTERVAL_MS) || 10 * 60 * 1000;
const CLEANUP_USERS_NOT_IN_SERVER_DELAY_MS = Number(process.env.CLEANUP_USERS_NOT_IN_SERVER_DELAY_MS) || 90 * 1000;
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

function buildDeferredStartupTasks(client, primaryScheduler, engagementTick) {
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
      run: () => sweepExpiredCommunicationTimeoutMirrors(client, { limit: 100 }),
    },
    {
      label: "run due one-time reminders",
      weight: 8,
      enabled: true,
      run: () => runDueOneTimeReminders(client),
    },
    {
      label: "restore core startup state",
      weight: 10,
      enabled: true,
      run: () => restoreCoreStartupState(client),
    },
    {
      label: "startup sync queue",
      weight: 12,
      enabled: true,
      run: () => queueStartupSync(client),
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
      enabled: primaryScheduler,
      run: () => processAllRecentAutomationMessages(client),
    },
    {
      label: "engagement tick",
      weight: 20,
      enabled: primaryScheduler,
      run: () => engagementTick(),
    },
    {
      label: "discadia vote month DB repair (solo 1° mese Roma, stale month key)",
      weight: 25,
      enabled: primaryScheduler && shouldRunDiscadiaVoteMonthRepairOnStartup(client),
      run: () => repairDiscadiaVoteMonthRowsForMainGuild(client),
    },
    {
      label: "sync Discord AutoMod rules (Vinili)",
      weight: 28,
      enabled: primaryScheduler,
      run: async () => {
        global.__vinylsDiscordClient = client;
        const {
          syncDiscordAutomodRulesForClient,
          shouldSyncOnStartup,
        } = require("../Services/Moderation/discordAutomodRulesService");
        if (!shouldSyncOnStartup()) return;
        const result = await syncDiscordAutomodRulesForClient(client);
        const rows = Array.isArray(result?.results) ? result.results : [];
        for (const row of rows) {
          if (!row?.ok) {
            global.logger?.warn?.(
              "[discordAutomod] startup sync:",
              row?.guildId || "?",
              row?.reason || "failed",
            );
            continue;
          }
          const failedN = Array.isArray(row.failed) ? row.failed.length : 0;
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
      enabled: primaryScheduler,
      run: () =>
        guildMemberUpdateExtras.reconcileDoubleBoosterRolesOnStartup(client, {
          maxUsers: 400,
        }),
    },
    {
      label: "correct misleading single boost embeds (double booster)",
      weight: 38,
      enabled: primaryScheduler,
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
      enabled: primaryScheduler,
      run: () =>
        guildMemberUpdateExtras.recoverRecentBoostEmbedsOnStartup(client, {
          limit: 3,
          lookbackMs: 30 * 60 * 1000,
        }),
    },
    {
      label: "restore active Serata Film staff tracking",
      weight: 45,
      enabled: primaryScheduler,
      run: () => restoreActiveSerataFilmSessions(client),
    },
    {
      label: "backfill boost announce slot counts from supporters history",
      weight: 48,
      enabled: primaryScheduler,
      run: () => guildMemberUpdateExtras.backfillAnnouncedBoostSlotsFromSupportersHistory(client),
    },
    {
      label: "recover last 2 native boost system messages (multi-channel scan)",
      weight: 50,
      enabled: primaryScheduler,
      run: () =>
        guildMemberUpdateExtras.recoverLastGlobalNativeBoostEmbedsOnStartup(client, {
          messageLimit: 1,
          lookbackMs: 15 * 60 * 1000,
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
      label: "custom perks rules migration",
      weight: 75,
      enabled: primaryScheduler,
      run: () => runCustomPerksRulesMigration(client),
    },
    {
      label: "startup sync zodiac roles from birthday profiles",
      weight: 78,
      enabled: primaryScheduler,
      run: () => syncZodiacRolesFromStoredBirthdays(client),
    },
    {
      label: "startup sync age bracket roles from birthday profiles",
      weight: 78,
      enabled: primaryScheduler,
      run: () => syncAgeBracketRolesFromStoredBirthdays(client),
    },
    {
      label: "startup sync staff auto valutazioni",
      weight: 80,
      enabled: primaryScheduler,
      run: async () => {
        await cleanupMalformedAutoValutazioni();
        await syncAllStaffAutoValutazioni(client);
      },
    },
    {
      label: "verification tenure backfill",
      weight: 85,
      enabled: primaryScheduler && shouldRunVerificationTenureBackfill(client),
      run: () => backfillVerificationTenure(client),
    },
    {
      label: "hogwarts shop purchase log backfill",
      weight: 86,
      enabled: primaryScheduler,
      run: () => syncHogwartsShopLogsOnStartup(client),
    },
    {
      label: "hogwarts house sorting announce backfill",
      weight: 87,
      enabled: primaryScheduler,
      run: () => syncHouseSortingAnnouncesOnStartup(client),
    },
    {
      label: "renumber categories",
      weight: 88,
      enabled: primaryScheduler,
      run: () => renumberAllCategories(client),
    },
    {
      label: "retro sync guild levels",
      weight: 90,
      enabled: primaryScheduler,
      run: async () => {
        const mainGuild = await resolveMainGuild();
        if (!mainGuild) return;
        return retroSyncGuildLevels(mainGuild, { syncRoles: false });
      },
    },
    {
      label: "startup sync clan tag roles",
      weight: 92,
      enabled: primaryScheduler,
      run: () => syncAllMembersClanTags(client),
    },
  ];
}

const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const getChannelSafe = async (client, channelId) => { if (!channelId) return null; return client.channels.cache.get(channelId) || (await getClientChannelCached(client, channelId)); };

const PENDING_COMMANDS_LOOKBACK_MS = 5 * 60 * 1000;
const PENDING_COMMANDS_FETCH_LIMIT = 25;

async function processPendingPrefixCommands(client) {
  const envValue = String(process.env.PROCESS_PENDING_COMMANDS_ON_STARTUP || "").trim().toLowerCase();
  const enabled = envValue
    ? ["1", "true", "yes", "on"].includes(envValue)
    : client?.config?.processPendingCommands === true;
  if (!enabled) return;
  const { handleOfficialPrefixMessage } = require("../Utils/Prefix/officialPrefixDispatcher");
  const { getCachedOrFetchMember } = require("../Utils/Message/officialMessageAutomationHandlers");
  const { PermissionFlagsBits, ChannelType } = require("discord.js");
  const prefix = String(client?.config?.prefix || "+").trim();
  const cutoff = Date.now() - PENDING_COMMANDS_LOOKBACK_MS;
  const hasAnyStaffBypassPermission = (permissions) => permissions && typeof permissions.has === "function" && [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers].some((p) => permissions.has(p));
  const noopWrongPrefixHint = () => Promise.resolve(false);
  const isScannableChannel = (ch) =>
    ch?.messages?.fetch &&
    (ch?.isTextBased?.() || ch?.type === ChannelType.GuildVoice || ch?.type === ChannelType.GuildStageVoice);

  const collected = [];
  for (const guild of client.guilds.cache.values()) {
    const me = guild.members.me;
    for (const channel of guild.channels.cache.values()) {
      if (!isScannableChannel(channel)) continue;
      const perms = me ? channel.permissionsFor(me) : null;
      if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.ReadMessageHistory)) continue;
      try {
        const messages = await channel.messages.fetch({ limit: PENDING_COMMANDS_FETCH_LIMIT }).catch(() => null);
        if (!messages) continue;
        for (const msg of messages.values()) {
          if (msg.author?.bot || !msg.content?.trim().startsWith(prefix)) continue;
          if (msg.createdTimestamp < cutoff) continue;
          collected.push({ message: msg, ts: msg.createdTimestamp });
        }
      } catch (err) {
        global.logger?.warn?.("[READY] pending commands fetch failed:", channel?.id, err?.message || err);
      }
    }
  }
  collected.sort((a, b) => a.ts - b.ts);
  for (const { message } of collected) {
    try {
      try {
        const loadingEmojiId = IDs.emojis?.loadingAnimatedId;
        const fallbackEmojiId = IDs.emojis?.loadingFallbackId;
        const emoji = loadingEmojiId ? message.client?.emojis?.cache?.get(loadingEmojiId) : null;
        if (emoji) await message.react(emoji).catch(() => { });
        else if (fallbackEmojiId) await message.react(fallbackEmojiId).catch(() => { });
        else await message.react("\u23F3").catch(() => { });
      } catch (_) { }
      await handleOfficialPrefixMessage({ message, resolvedClient: client, defaultPrefix: prefix, overrideCommand: null, maybeSendWrongPrefixHint: noopWrongPrefixHint, getCachedOrFetchMember, hasAnyStaffBypassPermission });
    } catch (err) {
      global.logger?.warn?.("[READY] pending command execution failed:", message?.id, err?.message || err);
    }
  }
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
      [...client.guilds.cache.values()].map((guild) => restoreTempBans(guild, { force: true })),
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

  client._startupPanelsRefreshRunning = true;
  try {
    client._panelUpsertMessageCache = new Map();
    if (typeof startupPanelsTrigger?.execute === "function") {
      await startupPanelsTrigger.execute(client);
    }
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
  const summary = await runPhasedStartupTasks(startupTasks, hooks);
  logInfo(
    client,
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
    ["[VOTE ROLE] Failed to start cleanup loop", () => startVoteRoleCleanupLoop(client)],
    ["[VERIFY TENURE] Failed to start loop", () => startVerificationTenureLoop(client)],
    ["[CATEGORY NUMBERING] Failed to start loop", () => startCategoryNumberingLoop(client)],
    ["[SPONSOR 24H KICK] Failed to start loop", () => startSponsorKickLoop(client)],
    ["[SPONSOR NICK SWEEP] Failed to start loop", () => startSponsorGuildNicknameSweepLoop(client)],
    ["[BIRTHDAY] Failed to start loop", () => startBirthdayLoop(client)],
    ["[DAILY MEMBER STATS] Failed to start loop", () => startDailyMemberStatsLoop(client)],
    ["[DAILY ENGAGEMENT STATS] Failed to start loop", () => startDailyEngagementStatsLoop(client)],
    ["[DAILY CHANNEL MESSAGE STATS] Failed to start loop", () => startDailyChannelMessageStatsLoop(client)],
    ["[PREMI LA REACT] Failed to start loop", () => startReactPressEventLoop(client)],
    ["[PREMI LA REACT END] Failed to start leaderboard loop", () => startPremiLaReactEndLoop(client)],
    ["[HOGWARTS SPELL LIST HUNT] Failed to start loop", () => startHogwartsSpellListHuntLoop(client)],
    ["[HOGWARTS SPELL LIST HUNT END] Failed to start leaderboard loop", () => startHogwartsSpellListHuntEndLoop(client)],
    ["[HOGWARTS POTIONS] Failed to start reminder loop", () => startPotionReminderLoop(client)],
    ["[HOGWARTS EVENT END] Failed to start completion loop", () => startHogwartsEventEndLoop(client)],
    ["[CUSTOM ROLE EXPIRY] Failed to start cleanup loop", () => startCustomRoleExpiryLoop(client)],
    ["[MOD CASE LIFECYCLE] Failed to start loop", () => startModCaseLifecycleLoop(client)],
    ["[TICKET AUTO CLOSE PROMPT] Failed to start loop", () => startTicketAutoClosePromptLoop(client)],
    ["[TRANSCRIPT CLEANUP] Failed to start loop", () => startTranscriptCleanupLoop()],
    ["[WEEKLY ACTIVITY WINNERS] Failed to start loop", () => startWeeklyActivityWinnersLoop(client)],
    ["[HOGWARTS HOUSE CUP] Failed to start loop", () => startHogwartsHouseCupLoop(client)],
    ["[CONTEST PRIZE] Failed to start cron", () => startContestPrizeMaintenanceCron(client)],
    ["[WEEKLY STAFF RESOCONTO] Failed to start loop", () => startWeeklyStaffResocontoLoop(client)],
    ["[STAFF WARN RESET 6M] Failed to start loop", () => startStaffWarnResetLoop(client)],
    ["[STAFF AUTO VALUTAZIONI] Failed to start loop", () => startStaffAutoValutazioniLoop(client)],
    ["[PM AFK WATCH] Failed to start loop", () => startPmVoiceAfkWatchLoop(client)],
    ["[REPOST ROULETTE] Failed to start cron", () => {
      const { startRepostRouletteCron } = require("../Services/Community/repostRouletteService");
      startRepostRouletteCron(client);
    }],
    ["[MOVIE NIGHT ANNOUNCE] Failed to start loop", () => startMovieNightAnnouncementLoop(client)],
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
      const tick = () =>
        runScheduledEnds(client).catch((e) => {
          const isMongoNetwork = e?.name === "MongoNetworkTimeoutError" || e?.name === "MongoServerSelectionError";
          global.logger?.warn?.("[GIVEAWAY] runScheduledEnds", isMongoNetwork ? "MongoDB timeout, will retry next run." : (e?.message || e));
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
      tick();
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


  for (const [label, starter] of loopStarters) {
    startLoopSafely(label, starter);
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

    const mongoConnected = await connectMongo(client);
    if (!mongoConnected) {
      logError(client, "[DATABASE] Startup aborted: MongoDB is required for ready services.");
      const t = setTimeout(() => process.exit(1), 5000);
      t.unref?.();
      return;
    }
    const primaryScheduler = isPrimaryScheduler(client);
    if (primaryScheduler) {
      void sweepExpiredCommunicationTimeoutMirrors(client, { limit: 100 }).catch((err) => {
        global.logger?.warn?.("[mutedMirrorRole] early startup sweep:", err?.message || err);
      });
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
    try {
      scheduleStaffListRefresh(client, IDs.guilds.main, 2000, { force: false });
    } catch (err) {
      global.logger?.error?.("[STAFF LIST] startup refresh schedule failed:", err?.message || err);
    }
    if (primaryScheduler) {
      try {
        startDailyPartnerAuditLoop(client);
      } catch (err) {
        global.logger?.error?.("[DAILY PARTNER AUDIT ERROR]", err);
      }
      try {
        startPartnershipChannelCleanupLoop(client);
      } catch (err) {
        global.logger?.error?.("[PARTNERSHIP CHANNEL CLEANUP ERROR]", err);
      }
      try {
        startPartnerPmDailyThreadLoop(client);
      } catch (err) {
        global.logger?.error?.("[PARTNER PM THREAD INIT ERROR]", err);
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
      const engagementTick = async () => { if (engagementTickRunning) return; engagementTickRunning = true; try { await runDueOneTimeReminders(client); } catch (err) { global.logger?.error?.(err); } finally { engagementTickRunning = false; } };
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
    const countingCatchUpRetry = setTimeout(() => {
      void processPendingCountingMessages(client).catch((err) =>
        global.logger?.warn?.("[READY] counting catch-up retry:", err?.message || err),
      );
    }, STARTUP_PANELS_RETRY_MS);
    countingCatchUpRetry.unref?.();

    if (primaryScheduler) {
      void restorePauseMessageStatusSync(client).catch((err) => {
        global.logger?.warn?.("[PAUSE] restore pause message status sync failed:", err);
      });
    }
    if (primaryScheduler) {
      void runStartupPanels(client, "ready").catch(() => { });
      const retryPanels = setTimeout(() => {
        void runStartupPanels(client, "ready-retry").catch(() => { });
      }, STARTUP_PANELS_RETRY_MS);
      retryPanels.unref?.();
    }

    const cleanupDisabled = String(process.env.CLEANUP_USERS_NOT_IN_SERVER_ON_STARTUP || "1").trim().toLowerCase() === "0";
    if (!cleanupDisabled) {
      const t = setTimeout(() => {
        runFullCleanupUsersNotInServer(client).catch((err) => {
          global.logger?.warn?.("[CLEANUP USERS NOT IN SERVER] Startup cleanup failed:", err);
        });
      }, CLEANUP_USERS_NOT_IN_SERVER_DELAY_MS);
      if (t?.unref) t.unref();
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