const config = require("../config.json");
const mongoose = require("mongoose");
const cron = require("node-cron");
const { startStaffListPeriodicRefreshLoop } = require("../Utils/Community/staffListUtils");
const { restorePendingVoteReminders, restorePendingDiscadiaReminders, restorePendingReminders, startBumpDueReminderSweepLoop, startDiscadiaVoteReminderLoop, } = require("../Services/Bump/bumpService");
const { processAllRecentAutomationMessages } = require("../Utils/Message/officialMessageAutomationHandlers");
const { processPendingCountingMessages } = require("../Utils/Message/officialMessageCommunityHandlers");
const { bootstrapSupporter } = require("./presenceUpdate");
const { restoreTtsConnections } = require("../Services/TTS/ttsService");
const { runDueOneTimeReminders, } = require("../Services/Reminders/oneTimeReminderService");
const { startMinigameLoop, restoreActiveGames, } = require("../Services/Minigames/minigameService");
const { startWeeklyDmReminderLoop, } = require("../Services/Community/weeklyDmReminderService");
const { startVerificationTenureLoop, backfillVerificationTenure, startVoteRoleCleanupLoop, runAllGuilds: renumberAllCategories, startCategoryNumberingLoop, startSponsorKickLoop, } = require("../Services/Community/communityOpsService");
const { startBirthdayLoop } = require("../Services/Community/birthdayService");
const { restoreTempBans } = require("../Services/Moderation/joinRaidService");
const { syncLiveVoiceSessionsFromGateway, startLiveVoiceExpLoop, } = require("../Services/Community/activityService");
const { runExpiredCustomRolesSweep, startCustomRoleExpiryLoop, } = require("../Services/Community/customRoleExpiryService");
const { startDailyPartnerAuditLoop, } = require("../Services/Partner/partnerAuditService");
const { startPartnershipChannelCleanupLoop } = require("../Services/Partner/partnershipChannelCleanupService");
const { startPartnerPmDailyThreadLoop } = require("../Services/Partner/partnerPmDailyThreadService");
const { startTicketAutoClosePromptLoop, startTranscriptCleanupLoop, } = require("../Services/Ticket/ticketMaintenanceService");
const { startAutoBackupLoop } = require("../Services/Backup/autoBackupService");
const { startModCaseLifecycleLoop } = require("../Services/Moderation/modCaseLifecycleService");
const { startWeeklyStaffResocontoLoop } = require("../Services/Staff/weeklyStaffResocontoService");
const { startWeeklyActivityWinnersLoop } = require("../Services/Community/weeklyActivityWinnersService");
const { startWeeklyContestCron } = require("../Services/Community/weeklyContestService");
const { startStaffWarnResetLoop } = require("../Services/Staff/staffWarnService");
const { runScheduledEnds } = require("../Services/Giveaway/giveawayService");
const { retroSyncGuildLevels } = require("../Services/Community/expService");
const { runFullCleanupUsersNotInServer } = require("../Services/Community/cleanupUsersNotInServerService");
const { startStaffGracePurgeLoop } = require("../Services/Community/userLeaveBackupService");
const { startDbMaintenanceLoop } = require("../Services/Community/dbMaintenanceService");
const { startVoteQueueLoop } = require("../Services/Web/discadiaVoteQueueService");
const { startWebhookServer, shouldStartDiscadiaVoteHttpWebhook } = require("../Services/Web/webhookService");
const { checkAndInstallPackages } = require("../Utils/Moderation/checkPackages");
const { startAutoPollLoop } = require("../Services/Community/autoPollService");
const IDs = require("../Utils/Config/ids");
const startupPanelsTrigger = require("../Triggers/embeds");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const { syncAllMembersClanTags } = require("../Services/Community/clanTagRoleService");
const { restorePauseMessageStatusSync } = require("../Utils/Pause/pauseHandlersUtils");
const { formatDurationMs, runTaskGroup, runTaskSequence, } = require("../Utils/Startup/readyStartupRuntime");
const { logBotReady } = require("../../shared/discord/readyLog");

const STARTUP_PANELS_RETRY_MS = 15000;
const ENGAGEMENT_INTERVAL_MS = Number(process.env.ENGAGEMENT_INTERVAL_MS) || 60 * 1000;
const JOIN_RAID_RESTORE_INTERVAL_MS = Number(process.env.JOIN_RAID_RESTORE_INTERVAL_MS) || 10 * 60 * 1000;
const CLEANUP_USERS_NOT_IN_SERVER_DELAY_MS = Number(process.env.CLEANUP_USERS_NOT_IN_SERVER_DELAY_MS) || 90 * 1000;
const CLEANUP_USERS_NOT_IN_SERVER_INTERVAL_MS = (() => {
  const v = process.env.CLEANUP_USERS_NOT_IN_SERVER_INTERVAL_MS;
  if (v === undefined || v === "") return 24 * 60 * 60 * 1000;
  const n = Number(v);
  return Number.isFinite(n) ? n : 24 * 60 * 60 * 1000;
})();

function shouldRunVerificationTenureBackfill(client) {
  const envValue = String(process.env.VERIFICATION_TENURE_BACKFILL_ON_STARTUP || "").trim().toLowerCase();
  if (envValue) return ["1", "true", "yes", "on"].includes(envValue);
  return Boolean(client?.config?.verificationTenureBackfillOnStartup);
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

function buildPrimaryHeavyTasks(client, mainGuild, engagementTick) {
  return [
    {
      label: "heavy task: retro sync guild levels",
      run: () =>
        mainGuild
          ? retroSyncGuildLevels(mainGuild, { syncRoles: false })
          : Promise.resolve(),
    },
    {
      label: "heavy task: engagement tick",
      run: () => engagementTick(),
    },
    {
      label: "heavy task: verification tenure backfill",
      run: () =>
        shouldRunVerificationTenureBackfill(client)
          ? backfillVerificationTenure(client)
          : Promise.resolve(),
    },
    {
      label: "heavy task: renumber categories",
      run: () => renumberAllCategories(client),
    },
    {
      label: "heavy task: custom role expiry sweep",
      run: () => runExpiredCustomRolesSweep(client),
    },
  ];
}

function buildDeferredStartupTasks(client, primaryScheduler, engagementTick) {
  return [
    {
      label: "restore bump reminders",
      enabled: primaryScheduler,
      run: () => restoreBumpReminders(client),
    },
    {
      label: "process recent automation messages (vote, bump)",
      enabled: primaryScheduler,
      run: () => processAllRecentAutomationMessages(client),
    },
    {
      label: "run due one-time reminders",
      enabled: true,
      run: () => runDueOneTimeReminders(client),
    },
    {
      label: "restore core startup state",
      enabled: true,
      run: () => restoreCoreStartupState(client),
    },
    {
      label: "primary heavy tasks",
      enabled: primaryScheduler,
      run: () => runPrimaryHeavyTasks(client, engagementTick),
    },
    {
      label: "startup sync clan tag roles",
      enabled: primaryScheduler,
      run: () => syncAllMembersClanTags(client),
    },
    {
      label: "startup sync queue",
      enabled: true,
      run: () => queueStartupSync(client),
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
      await handleOfficialPrefixMessage({
        message,
        resolvedClient: client,
        defaultPrefix: prefix,
        overrideCommand: null,
        maybeSendWrongPrefixHint: noopWrongPrefixHint,
        getCachedOrFetchMember,
        hasAnyStaffBypassPermission,
      });
    } catch (err) {
      global.logger?.warn?.("[READY] pending command execution failed:", message?.id, err?.message || err);
    }
  }
}

function buildMongoUrl(client) {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    client.config.mongoURL
  );
}

function getMongoUrlSource() {
  if (process.env.MONGO_URL_LOCAL) return "MONGO_URL_LOCAL (env)";
  if (process.env.MONGODB_URI_LOCAL) return "MONGODB_URI_LOCAL (env)";
  if (process.env.MONGO_URL) return "MONGO_URL (env)";
  if (process.env.MONGODB_URI) return "MONGODB_URI (env)";
  return "client.config.mongoURL";
}

/** Ritorna URL con host sostituito da 127.0.0.1 solo per mongodb:// (non srv). Null se già 127.0.0.1 o srv. */
function mongoUrlWith127(url) {
  if (!url || typeof url !== "string" || url.startsWith("mongodb+srv://")) return null;
  try {
    const parsed = new URL(url.replace(/^mongodb:/, "https:"));
    const host = (parsed.hostname || "").toLowerCase();
    if (host === "127.0.0.1") return null;
    parsed.hostname = "127.0.0.1";
    return parsed.toString().replace(/^https:/, "mongodb:");
  } catch {
    return null;
  }
}

const MONGO_CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
  socketTimeoutMS: 20000,
  maxPoolSize: 25,
  minPoolSize: 2,
  maxIdleTimeMS: 60_000,
};

const MONGO_RETRY_ATTEMPTS = 4;
const MONGO_RETRY_DELAY_MS = 3000;

function maskMongoUrlForLog(url) {
  if (!url || typeof url !== "string") return "***";
  try {
    const u = url.replace(/^mongodb(\+srv)?:/, "https:");
    const parsed = new URL(u);
    const host = (parsed.hostname || "").toLowerCase();
    const path = (parsed.pathname || "/").replace(/^\//, "") || "(default)";
    const protocol = url.startsWith("mongodb+srv") ? "mongodb+srv" : "mongodb";
    return `${protocol}://***@${host}${parsed.port && parsed.port !== "443" && parsed.port !== "80" ? ":" + parsed.port : ""}/${path}`;
  } catch {
    return "***";
  }
}

async function connectMongo(client) {
  const mongoUrl = buildMongoUrl(client);
  if (!mongoUrl) {
    logError(
      client,
      "[DATABASE] No MongoDB URL. Set MONGO_URL or MONGO_URL_LOCAL (or MONGODB_URI) in .env.",
    );
    return false;
  }

  logAlways(client, "[DATABASE] Connecting to: " + maskMongoUrlForLog(mongoUrl) + " (source: " + getMongoUrlSource() + ")");

  mongoose.set("strictQuery", false);
  mongoose.set("bufferCommands", false);

  if (mongoose.connection.readyState === 1) {
    logInfo(client, "[DATABASE] Already connected to MongoDB.");
    return true;
  }

  const fallbackUrl = mongoUrlWith127(mongoUrl);
  const urlsToTry = [mongoUrl];
  if (fallbackUrl && fallbackUrl !== mongoUrl) urlsToTry.push(fallbackUrl);

  for (let attempt = 1; attempt <= MONGO_RETRY_ATTEMPTS; attempt++) {
    for (const url of urlsToTry) {
      try {
        await mongoose.connect(url, MONGO_CONNECT_OPTIONS);
        logInfo(client, "[DATABASE] Connected to MongoDB successfully.");
        return true;
      } catch (err) {
        const isLast = attempt === MONGO_RETRY_ATTEMPTS && url === urlsToTry[urlsToTry.length - 1];
        if (isLast) {
          logError(
            client,
            `[DATABASE] Error connecting to the database (continuo comunque il bootstrap): ${err}`,
          );
          return false;
        }
        if (attempt === 1 && url === mongoUrl) {
          logInfo(client, `[DATABASE] First connection failed, retrying up to ${MONGO_RETRY_ATTEMPTS - 1} times (${err?.message || err}).`);
        }
      }
    }
    if (attempt < MONGO_RETRY_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, MONGO_RETRY_DELAY_MS));
    }
  }

  logError(
    client,
    "[DATABASE] All connection attempts failed (continuo comunque il bootstrap).",
  );
  return false;
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
  const [bootstrap, inviteCache, liveVoiceSync, joinRaidRestore] = await Promise.allSettled([
    bootstrapSupporter(client),
    primeInviteCache(client),
    syncLiveVoiceSessionsFromGateway(client),
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
  if (joinRaidRestore.status === "rejected")
    global.logger?.error?.("[JOIN RAID RESTORE ERROR]", joinRaidRestore.reason);

  await restoreTtsConnections(client);
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

async function runPrimaryHeavyTasks(client, engagementTick) {
  const mainGuildId = IDs.guilds.main || null;
  const mainGuild = mainGuildId ? client.guilds.cache.get(mainGuildId) || (await client.guilds.fetch(mainGuildId).catch(() => null)) : client.guilds.cache.first() || null;

  const heavyTasks = buildPrimaryHeavyTasks(client, mainGuild, engagementTick);
  const hooks = createStartupHooks(client);

  const startedAt = Date.now();
  const results = await runTaskGroup(heavyTasks, hooks);
  const failed = results.filter((result) => result.status === "rejected").length;
  logInfo(
    client,
    `[STARTUP] primary heavy tasks finished in ${formatDurationMs(Date.now() - startedAt)}. failed=${failed}/${heavyTasks.length}.`,
  );
}

async function runDeferredStartup(client, primaryScheduler, engagementTick) {
  const startupTasks = buildDeferredStartupTasks(client, primaryScheduler, engagementTick,);
  await runTaskSequence(startupTasks, createStartupHooks(client));
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
    ["[MINIGAMES] Failed to start loop", () => restoreActiveGames(client).then(() => startMinigameLoop(client), () => startMinigameLoop(client))],
    ["[VOTE ROLE] Failed to start cleanup loop", () => startVoteRoleCleanupLoop(client)],
    ["[WEEKLY DM REMINDER] Failed to start loop", () => startWeeklyDmReminderLoop(client)],
    ["[VERIFY TENURE] Failed to start loop", () => startVerificationTenureLoop(client)],
    ["[CATEGORY NUMBERING] Failed to start loop", () => startCategoryNumberingLoop(client)],
    ["[SPONSOR 24H KICK] Failed to start loop", () => startSponsorKickLoop(client)],
    ["[BIRTHDAY] Failed to start loop", () => startBirthdayLoop(client)],
    ["[CUSTOM ROLE EXPIRY] Failed to start cleanup loop", () => startCustomRoleExpiryLoop(client)],
    ["[MOD CASE LIFECYCLE] Failed to start loop", () => startModCaseLifecycleLoop(client)],
    ["[TICKET AUTO CLOSE PROMPT] Failed to start loop", () => startTicketAutoClosePromptLoop(client)],
    ["[TRANSCRIPT CLEANUP] Failed to start loop", () => startTranscriptCleanupLoop()],
    ["[WEEKLY ACTIVITY WINNERS] Failed to start loop", () => startWeeklyActivityWinnersLoop(client)],
    ["[WEEKLY CONTEST SFONDI] Failed to start cron", () => startWeeklyContestCron(client)],
    ["[WEEKLY STAFF RESOCONTO] Failed to start loop", () => startWeeklyStaffResocontoLoop(client)],
    ["[STAFF WARN RESET 6M] Failed to start loop", () => startStaffWarnResetLoop(client)],
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
      tick();
      const timer = setInterval(tick, 60 * 1000);
      if (typeof timer.unref === "function") timer.unref();
      client._giveawayScheduledEndInterval = timer;
    }],
    ["[DISCADIA VOTE QUEUE] Failed to start loop", () => startVoteQueueLoop(client)],
    [
      "[DISCADIA HTTP VOTE WEBHOOK] Failed to start",
      () => {
        if (!shouldStartDiscadiaVoteHttpWebhook(client)) return;
        startWebhookServer(client).catch((err) => global.logger?.error?.("[DISCADIA HTTP VOTE WEBHOOK]", err));
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
      async () => {
        const channelId = IDs.channels.chat;
        const channel = await getChannelSafe(client, channelId);
        if (!channel?.isTextBased?.()) return;

        await channel
          .send({
            content: "@everyone",
            allowedMentions: { parse: ["everyone"] },
            files: [
              {
                attachment:
                  "https://media.tenor.com/crZirRXKLuQAAAAC/manhdz2k9.gif",
                name: "monthly.gif",
              },
            ],
          })
          .catch((err) => {
            global.logger?.error?.(
              "[MONTHLY GIF] Invio fallito:",
              err?.message || err,
            );
          });
      },
      { timezone: "Europe/Rome" },
    );
  } catch (err) {
    global.logger?.error?.("[MONTHLY GIF] Failed to schedule", err);
  }
}

function setClientPresence(client) {
  try {
    client.user?.setPresence?.({
      status: client.config?.status || "idle",
      activities: [
        {
          type: 4,
          name: "irrelevant",
          state: "☕📀 discord.gg/viniliecaffe",
        },
      ],
    });
  } catch (err) {
    logError(
      client,
      "[STATUS] Errore impostazione presence:",
      err?.message || err,
    );
  }
}

function maybeCheckPackagesOnReady(client) {
  if (typeof checkAndInstallPackages !== "function") return;
  if (String(process.env.CHECK_PACKAGES_ON_READY || "").trim() !== "1") return;
  Promise.resolve(checkAndInstallPackages(client)).catch((err) => {
    logError(client, "[PACKAGES] Check failed:", err?.stack || err?.message || err);
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

    const readyStartedAt = Date.now();
    const maxListeners = resolveMaxListeners(client);
    client.setMaxListeners(maxListeners);
    require("events").EventEmitter.defaultMaxListeners = maxListeners;

    await connectMongo(client);

    const primaryScheduler = isPrimaryScheduler(client);
    if (primaryScheduler) {
      try {
        startBumpDueReminderSweepLoop(client);
      } catch (err) {
        global.logger?.error?.("[BUMP DUE REMINDER SWEEP] early start failed:", err?.message || err);
      }
    }
    try {
      startStaffListPeriodicRefreshLoop(client);
    } catch (err) {
      global.logger?.error?.("[STAFF LIST] periodic loop start failed:", err?.message || err);
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
        global.logger?.error?.("[PARTNER PM DAILY THREAD ERROR]", err);
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

      startPrimaryLoops(client, engagementTick);
      client._engagementTick = engagementTick;
    }

    if (primaryScheduler) scheduleMonthlyGif(client);
    setClientPresence(client);
    maybeCheckPackagesOnReady(client);
    try {
      startAutoPollLoop(client);
    } catch (error) {
      logError(client, "[STATUS] Error while loading bot status (auto poll):", error?.stack || error?.message || error);
    }

    logBotReady(client, readyStartedAt);

    void processPendingPrefixCommands(client).catch((err) => global.logger?.warn?.("[READY] pending commands:", err?.message || err));
    void processPendingCountingMessages(client).catch((err) => global.logger?.warn?.("[READY] counting catch-up:", err?.message || err));

    if (!client._deferredStartupRunning) {
      client._deferredStartupRunning = true;
      const engagementTick = client._engagementTick || (async () => { });
      void runDeferredStartup(client, primaryScheduler, engagementTick).finally(() => {
        client._deferredStartupRunning = false;
      });
    }
    if (primaryScheduler) {
      void restorePauseMessageStatusSync(client).catch((err) => {
        global.logger?.warn?.("[PAUSE] restore pause message status sync failed:", err?.message || err);
      });
    }
    if (primaryScheduler) {
      void runStartupPanels(client, "ready").catch(() => {});
      const retryPanels = setTimeout(() => {
        void runStartupPanels(client, "ready-retry").catch(() => {});
      }, STARTUP_PANELS_RETRY_MS);
      retryPanels.unref?.();
    }

    const cleanupDisabled = String(process.env.CLEANUP_USERS_NOT_IN_SERVER_ON_STARTUP || "1").trim().toLowerCase() === "0";
    if (!cleanupDisabled) {
      const t = setTimeout(() => {
        runFullCleanupUsersNotInServer(client).catch((err) => {
          global.logger?.warn?.("[CLEANUP USERS NOT IN SERVER] Startup cleanup failed:", err?.message || err);
        });
      }, CLEANUP_USERS_NOT_IN_SERVER_DELAY_MS);
      if (t?.unref) t.unref();
    }
    if (CLEANUP_USERS_NOT_IN_SERVER_INTERVAL_MS > 0) {
      const iv = setInterval(() => {
        runFullCleanupUsersNotInServer(client).catch((err) => {
          global.logger?.warn?.("[CLEANUP USERS NOT IN SERVER] Periodic cleanup failed:", err?.message || err);
        });
      }, CLEANUP_USERS_NOT_IN_SERVER_INTERVAL_MS);
      if (iv?.unref) iv.unref();
    }

  },
};