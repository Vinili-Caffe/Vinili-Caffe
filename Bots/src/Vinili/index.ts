/*!
 * Copyright (c) 2024–2026 Vinili & Caffè. Tutti i diritti riservati.
 * Uso, copia, modifica e distribuzione vietati senza autorizzazione scritta.
 * SPDX-License-Identifier: LicenseRef-Proprietary-ViniliCaffe — vedi LICENSE.
 */
const discord = require("discord.js") as typeof import("discord.js");
const { Client, IntentsBitField } = discord;
const GatewayIntentBits = discord.GatewayIntentBits || IntentsBitField?.Flags || {};
const Partials = discord.Partials || {};
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { EventEmitter } = require("events") as typeof import("events");
const APP_ROOT = __dirname;
const { acquireSingleInstanceLock, listFoldersIfExists, loadEnvFiles, } = require("../shared/runtime/fsRuntime") as typeof import("../shared/runtime/fsRuntime");
const { initializeCommandCollections } = require("../shared/runtime/clientRuntime") as typeof import("../shared/runtime/clientRuntime");
const { connectMongo, isMongoReady } = require("../shared/db/mongoConnect") as typeof import("../shared/db/mongoConnect");

loadEnvFiles(APP_ROOT);
try {
  require("../shared/scheduling/nodeCronMissFilter").installNodeCronMissFilter();
} catch (_) {}
{
  const { createConsoleLogs } = require("../shared/logging/consoleLogs") as typeof import("../shared/logging/consoleLogs");
  const { createBotLogger } = require("../shared/logging/createBotLogger") as typeof import("../shared/logging/createBotLogger");
  const vinylsLogConfig = require("./config.json") as typeof import("./config.json");
  const baseLogs = createConsoleLogs({ withBuffers: true });
  global.logger = Object.assign(
    createBotLogger({
      baseLogs,
      resolveLogLevel: () => {
        const fromEnv = String(process.env.LOG_LEVEL || process.env.VC_LOG_LEVEL || "")
          .trim()
          .toLowerCase();
        if (fromEnv) return fromEnv;
        return String(vinylsLogConfig.logLevel || "info");
      },
    }),
    { logs: baseLogs },
  );
}
try {
  const { setMusicBotHooks } = require("../shared/music/musicBotHooks") as typeof import("../shared/music/musicBotHooks");
  setMusicBotHooks({
    profile: "vinyls",
    nowPlayingTitle: "In riproduzione",
    enableVoiceCapture: true,
  });
} catch (_) {}
if (process.env.RUN_UNDER_LOADER !== "1") {
  acquireSingleInstanceLock("vinili-caffe-official-bot");
}

const { installEmbedFooterPatch, installOutgoingMessageEmbedPatch, applyDefaultFooterToEmbeds } = require("../shared/embeds/defaultFooter") as typeof import("../shared/embeds/defaultFooter");
const { setDefaultFooterApplier, installOutgoingEditBrandingPatch } = require("../shared/discord/replyRuntime") as typeof import("../shared/discord/replyRuntime");
const { buildInitialClientPresenceOptions, installBotPresenceHooks, patchClientPresenceGuard } = require("../shared/discord/botPresenceActivity") as typeof import("../shared/discord/botPresenceActivity");
const { installGatewayShardListenerCeiling } = require("../shared/discord/gatewayListenerCeiling") as typeof import("../shared/discord/gatewayListenerCeiling");
const {
  buildDiscordClientMemoryOptions,
  resolveGatewayIntents,
  resolveGatewayPartials,
} = require("../shared/discord/clientMemoryOptions") as typeof import("../shared/discord/clientMemoryOptions");

const pcommandFolders = listFoldersIfExists(path.join(APP_ROOT, "Prefix"));
const commandFolders = listFoldersIfExists(path.join(APP_ROOT, "Commands"));

let client;

function resolveEventListenersCeiling(configLike?) {
  const raw = Number(configLike?.eventListeners ?? 50);
  if (!Number.isFinite(raw) || raw <= 0) return 50;
  return Math.max(10, Math.floor(raw));
}

function applyListenerCeiling(clientRef?, configLike?) {
  if (!clientRef) return;
  const maxListeners = resolveEventListenersCeiling(configLike);
  try {
    clientRef.setMaxListeners(maxListeners);
  } catch (_) {}
  try {
    if (Number(EventEmitter.defaultMaxListeners || 0) < maxListeners) {
      EventEmitter.defaultMaxListeners = maxListeners;
    }
  } catch (_) {}
}

try {
  installEmbedFooterPatch();
  installOutgoingMessageEmbedPatch(discord);
  installOutgoingEditBrandingPatch(discord);
  setDefaultFooterApplier((payload?, source?) =>
    applyDefaultFooterToEmbeds(payload, source?.guild || source?.channel?.guild || null),
  );
  const vinylsConfig = require("./config.json") as typeof import("./config.json");
  try {
    require("./Config/emergencyRoleIdRemap").applyEmergencyRoleRemapToConfig(vinylsConfig);
  } catch (_) {}
  /* perfP0: intents curati (niente Object.values di tutto il gateway) */
  const baseIntents = resolveGatewayIntents(discord, { includePresences: true });
  const basePartials = resolveGatewayPartials(discord);

  client = new Client({
    intents: baseIntents,
    partials: basePartials,
    ...buildDiscordClientMemoryOptions(discord),
    presence: buildInitialClientPresenceOptions(vinylsConfig),
    rest: {
      timeout: 30_000,
      offset: 50,
      retries: 3,
    },
  });
  client.config = vinylsConfig;
  patchClientPresenceGuard(client);
} catch (error) {
  global.logger.error("[ERROR] Error while creating the client.", error);
  process.exit(1);
}

client.logs = global.logger.logs;

const { assertBotTokenIdentity } = require("../shared/config/env") as typeof import("../shared/config/env");
const envToken = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL;
/* mongoSingleSource1 */
const envMongoUrl = require("../shared/db/mongoConnect").buildMongoUrl(client);
client.config.token = envToken || client.config.token;
client.config.mongoURL = envMongoUrl || client.config.mongoURL;
applyListenerCeiling(client, client.config);
installGatewayShardListenerCeiling(client);
installBotPresenceHooks(client);

if (!client.config.token) {
  global.logger.error(
    "[LOGIN] Missing bot token. Set DISCORD_TOKEN (or DISCORD_TOKEN_OFFICIAL) in .env.",
  );
  process.exit(1);
}
assertBotTokenIdentity(client.config.token, {
  botLabel: "Vinili (official)",
  expectedClientId: process.env.DISCORD_CLIENT_ID_OFFICIAL,
  forbiddenClientId: process.env.DISCORD_CLIENT_ID_TEST,
});

global.botClient = client;

client.reloadScope = async (scope?) => {
  const clearCacheByDir = (dirName?) => { const abs = path.join(APP_ROOT, dirName); if (!fs.existsSync(abs)) return; for (const key of Object.keys(require.cache)) { if (!key.startsWith(abs)) continue; delete require.cache[key]; } };

  const reloadCommands = async () => {
    clearCacheByDir("Commands");
    clearCacheByDir(path.join("..", "MultiGuild", "discord", "slash"));
    clearCacheByDir(path.join("Partner", "discord", "slash"));
    clearCacheByDir(path.join("Giveaway", "discord", "slash"));
    clearCacheByDir(path.join("Staff", "discord", "slash"));
    const folders = listFoldersIfExists(path.join(APP_ROOT, "Commands"));
    await client.handleCommands(folders, path.join(APP_ROOT, "Commands"));
  };

  const reloadPrefix = async () => {
    clearCacheByDir("Prefix");
    clearCacheByDir(path.join("Community", "discord", "prefix"));
    clearCacheByDir(path.join("Partner", "discord", "prefix"));
    clearCacheByDir(path.join("Stats", "discord", "prefix"));
    clearCacheByDir(path.join("Minigames", "discord", "prefix"));
    clearCacheByDir(path.join("Backup", "discord", "prefix"));
    clearCacheByDir(path.join("Level", "discord", "prefix"));
    clearCacheByDir(path.join("Security", "discord", "prefix"));
    clearCacheByDir(path.join("..", "shared", "tts", "discord"));
    clearCacheByDir(path.join("..", "shared", "music", "discord"));
    clearCacheByDir(path.join("Moderation", "discord", "prefix"));
    clearCacheByDir(path.join("..", "MultiGuild", "discord", "prefix"));
    const folders = listFoldersIfExists(path.join(APP_ROOT, "Prefix"));
    await client.prefixCommands(folders, path.join(APP_ROOT, "Prefix"));
  };

  const reloadEvents = () => {
    for (const mod of [
      "core",
      "Community",
      "Moderation",
      "Security",
      "Staff",
      "Stats",
      "Partner",
    ]) {
      clearCacheByDir(path.join(mod, "events"));
    }
    clearCacheByDir(path.join("Community", "services"));
    clearCacheByDir(path.join("..", "MultiGuild", "events"));
    client.handleEvents(APP_ROOT);
  };

  const reloadTriggers = () => {
    clearCacheByDir("Triggers");
    clearCacheByDir(path.join("Community", "discord", "panels"));
    client.handleTriggers(APP_ROOT);
  };

  if (scope === "commands") return reloadCommands();
  if (scope === "prefix") return reloadPrefix();
  if (scope === "events") return reloadEvents();

  const reloadButtons = async () => {
    clearCacheByDir(path.join("..", "MultiGuild", "discord", "buttons"));
    clearCacheByDir(path.join("Partner", "discord", "buttons"));
    clearCacheByDir(path.join("Stats", "discord", "buttons"));
    clearCacheByDir(path.join("Giveaway", "discord", "buttons"));
    clearCacheByDir(path.join("Minigames", "discord", "buttons"));
    clearCacheByDir(path.join("Backup", "discord", "buttons"));
    clearCacheByDir(path.join("Level", "discord", "buttons"));
    clearCacheByDir(path.join("Security", "discord", "buttons"));
    clearCacheByDir(path.join("Community", "discord", "buttons"));
    clearCacheByDir(path.join("..", "shared", "music", "discord", "buttons"));
    clearCacheByDir(path.join("Moderation", "discord", "buttons"));
    await client.loadButtonHandlers();
  };

  if (scope === "triggers") return reloadTriggers();
  if (scope === "buttons") return reloadButtons();
  if (scope === "services") {
    clearCacheByDir("Services");
    clearCacheByDir(path.join("..", "shared", "tts", "services"));
    clearCacheByDir(path.join("..", "shared", "music", "services"));
    clearCacheByDir(path.join("..", "shared", "music", "discord"));
    clearCacheByDir(path.join("Moderation", "services"));
    clearCacheByDir(path.join("Moderation", "utils"));
    clearCacheByDir(path.join("Stats", "runtime"));
    clearCacheByDir(path.join("Giveaway", "services"));
    clearCacheByDir(path.join("Minigames", "services"));
    clearCacheByDir(path.join("Staff", "services"));
    clearCacheByDir(path.join("Backup", "services"));
    clearCacheByDir(path.join("Backup", "workers"));
    clearCacheByDir(path.join("Level", "services"));
    clearCacheByDir(path.join("Security", "services"));
    clearCacheByDir(path.join("Community", "services"));
    clearCacheByDir(path.join("..", "MultiGuild", "tickets", "data"));
    clearCacheByDir(path.join("..", "MultiGuild", "tickets", "transcript"));
    return;
  }
  if (scope === "utils") {
    clearCacheByDir("Utils");
    clearCacheByDir(path.join("Minigames", "utils"));
    clearCacheByDir(path.join("Staff", "utils"));
    clearCacheByDir(path.join("Backup", "utils"));
    clearCacheByDir(path.join("Level", "utils"));
    clearCacheByDir(path.join("Security", "utils"));
    clearCacheByDir(path.join("Community", "utils"));
    return;
  }
  if (scope === "schemas") {
    clearCacheByDir("Schemas");
    clearCacheByDir(path.join("Giveaway", "schemas"));
    clearCacheByDir(path.join("Minigames", "data"));
    clearCacheByDir(path.join("..", "MultiGuild", "tickets", "data"));
    return;
  }

  if (scope === "handlers") {
    await reloadCommands();
    await reloadPrefix();
    reloadEvents();
    reloadTriggers();
    await reloadButtons();
    return;
  }

  if (scope === "all") {
    clearCacheByDir("Services");
    clearCacheByDir(path.join("..", "shared", "tts", "services"));
    clearCacheByDir(path.join("..", "shared", "music", "services"));
    clearCacheByDir(path.join("..", "shared", "music", "discord"));
    clearCacheByDir(path.join("Moderation", "services"));
    clearCacheByDir(path.join("Moderation", "utils"));
    clearCacheByDir(path.join("Stats", "runtime"));
    clearCacheByDir(path.join("Giveaway", "services"));
    clearCacheByDir(path.join("Giveaway", "schemas"));
    clearCacheByDir(path.join("Minigames", "services"));
    clearCacheByDir(path.join("Minigames", "utils"));
    clearCacheByDir(path.join("Minigames", "data"));
    clearCacheByDir(path.join("Staff", "services"));
    clearCacheByDir(path.join("Staff", "utils"));
    clearCacheByDir(path.join("Backup", "services"));
    clearCacheByDir(path.join("Backup", "utils"));
    clearCacheByDir(path.join("Backup", "workers"));
    clearCacheByDir(path.join("Level", "services"));
    clearCacheByDir(path.join("Level", "utils"));
    clearCacheByDir(path.join("Security", "services"));
    clearCacheByDir(path.join("Security", "utils"));
    clearCacheByDir(path.join("Community", "services"));
    clearCacheByDir(path.join("Community", "utils"));
    clearCacheByDir(path.join("..", "MultiGuild", "tickets", "data"));
    clearCacheByDir(path.join("..", "MultiGuild", "tickets", "transcript"));
    clearCacheByDir("Utils");
    clearCacheByDir("Schemas");
    await reloadCommands();
    await reloadPrefix();
    reloadEvents();
    reloadTriggers();
    await reloadButtons();
  }
};

initializeCommandCollections(client, { includeSnipes: true });

(async () => {
  const bootStartedAt = Date.now();
  try {
            const mongoStartedAt = Date.now();
    const mongoConnected = await connectMongo(client);
    if (!mongoConnected || !isMongoReady()) {
      global.logger.error("[DATABASE] Startup aborted: MongoDB is required before login.");
      process.exit(1);
    }
    const mongoMs = Date.now() - mongoStartedAt;

    const handlersStartedAt = Date.now();
    {
      const { installProcessHandlers } = require("../shared/handlers/processHandlers") as typeof import("../shared/handlers/processHandlers");
      const logs = global.logger.logs;
      installProcessHandlers({
        flag: "__viniliProcessHandlersInstalled",
        logError: (message?) => logs.error(`[ERROR] ${message}`),
        logWarn: (message?) => logs.warn(String(message)),
        logInfo: (message?) => logs.success(String(message)),
        onBeforeFlush: async () => {
          try {
            require("./Community/services/activityService").suspendAllLiveVoiceExp();
          } catch {}
          try {
            require("./Staff/services/staffAutoValutazioniService").suspendStaffAutoValutazioni();
          } catch {}
        },
        onAfterFlush: async (signal?) => {
          try {
            const { closeMongoGraceful } = require("../shared/db/mongoConnect") as typeof import("../shared/db/mongoConnect");
            await closeMongoGraceful(signal);
          } catch (err) {
            logs.error(`[ERROR] Mongo close failed: ${err?.stack || err}`);
          }
        },
        exitDelayMs: 150,
      });

      const { installBootTables } = require("../shared/runtime/createBootTablesInstaller") as typeof import("../shared/runtime/createBootTablesInstaller");
      installBootTables(
        client,
        [
          "Community",
          "Moderation",
          "Security",
          "Staff",
          "Partner",
          path.join(APP_ROOT, "..", "MultiGuild"),
          "Minigames",
          "Level",
          "Giveaway",
          "Stats",
          "Backup",
          "Config",
          "core",
          "site",
        ],
        APP_ROOT,
      );

      const { createButtonHandlersLoader } = require("../shared/runtime/createButtonHandlersLoader") as typeof import("../shared/runtime/createButtonHandlersLoader");
      const REMOVED_BUTTON_HANDLER_NAMES = new Set([
        "balGui",
        "incomeClaimGui",
        "blackjackGui",
        "coinflipGui",
        "duelGui",
        "robGui",
        "rouletteGui",
        "rpsGui",
        "scratchGui",
        "shopGui",
        "slotsGui",
        "trisGui",
        "classificaToggle",
        "myquoteDelete",
        "myrepostDelete",
        "myclipDelete",
        "myquotePagination",
        "myrepostPagination",
        "myclipPagination",
        "colorsCommand",
        "candidature",
        "ticket",
        "websiteUnbanSite",
        "websiteUnmuteSite",
        "resoconto",
        "profile",
      ]);
      createButtonHandlersLoader({
        removedHandlerNames: REMOVED_BUTTON_HANDLER_NAMES,
        resolveDirs: () => [
          path.join(APP_ROOT, "Partner", "discord", "buttons"),
          path.join(APP_ROOT, "Stats", "discord", "buttons"),
          path.join(APP_ROOT, "Giveaway", "discord", "buttons"),
          path.join(APP_ROOT, "Minigames", "discord", "buttons"),
          path.join(APP_ROOT, "Backup", "discord", "buttons"),
          path.join(APP_ROOT, "Level", "discord", "buttons"),
          path.join(APP_ROOT, "Security", "discord", "buttons"),
          path.join(APP_ROOT, "Community", "discord", "buttons"),
          path.resolve(APP_ROOT, "..", "shared", "music", "discord", "buttons"),
          path.join(APP_ROOT, "Moderation", "discord", "buttons"),
          path.join(APP_ROOT, "..", "MultiGuild", "discord", "buttons"),
        ],
      })(client);

      require("./core/handlers/commandHandler")(client);
      require("./core/handlers/prefixHandler")(client);

      const { installEventLoader } = require("../shared/runtime/createEventLoader") as typeof import("../shared/runtime/createEventLoader");
      const { defaultModuleEventFolderLabel } = require("../shared/runtime/discoverModuleEventFiles") as typeof import("../shared/runtime/discoverModuleEventFiles");
      installEventLoader(client, {
        extraEventFiles: (_absBase?, botRoot?) => {
          const root = botRoot || APP_ROOT;
          return [path.join(root, "Community", "services", "guildMemberUpdateService.js")];
        },
        folderLabelForRel: defaultModuleEventFolderLabel,
      });

      const { installTriggersLoader } = require("../shared/runtime/createTriggersLoader") as typeof import("../shared/runtime/createTriggersLoader");
      installTriggersLoader(client, {
        extraFiles: (root?) => [
          path.join(root, "Community", "discord", "panels", "startupPanels.js"),
        ],
      });
    }
    client.handleEvents(APP_ROOT);
    client.handleTriggers(APP_ROOT);
    const handlersMs = Date.now() - handlersStartedAt;

    try {
      require("../MultiGuild/index").attachToClient(client);
    } catch (err) {
      global.logger?.warn?.("[MultiGuild] attach failed:", err?.message || err);
    }

            global.__vinylsDiscordClient = client;
    client.__prefixCommandsReady = false;
    client.__slashCommandsReady = false;
    client.__bootCommandsReady = false;

    const commandsStartedAt = Date.now();
    await client.prefixCommands(pcommandFolders, path.join(APP_ROOT, "Prefix"));
    client.__prefixCommandsReady = true;
    const prefixMs = Date.now() - commandsStartedAt;

    const slashButtonsStartedAt = Date.now();
    await Promise.all([
      client.handleCommands(commandFolders, path.join(APP_ROOT, "Commands")).then(() => {
        client.__slashCommandsReady = true;
      }),
      client.loadButtonHandlers(),
    ]);
    client.__bootCommandsReady = true;
    const cmdsMs = Date.now() - slashButtonsStartedAt;

    if (typeof client.logBootTables === "function") {
      client.logBootTables();
    }

    const loginStartedAt = Date.now();
    {
      const maxAttempts = 10;
      let loggedIn = false;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await client.login(client.config.token);
          loggedIn = true;
          break;
        } catch (error) {
          const status = Number(error?.status || error?.httpStatus || error?.code || 0);
          const retryable = status === 503 || status === 502 || status === 500 || status === 429;
          global.logger.error(
            `[LOGIN] Error while logging in (tentativo ${attempt}/${maxAttempts}).`,
            error,
          );
          if (!retryable || attempt >= maxAttempts) {
            process.exit(1);
          }
          const waitMs = Math.min(45_000, 1500 * attempt * attempt);
          global.logger?.warn?.(`[LOGIN] Discord API ${status || "error"} — retry tra ${Math.round(waitMs / 1000)}s`);
          await new Promise((r?) => setTimeout(r, waitMs));
        }
      }
      if (!loggedIn) process.exit(1);
    }
    global.logger?.info?.(
      `[BOOT] pre_ready ${Date.now() - bootStartedAt}ms (mongo=${mongoMs} handlers=${handlersMs} prefix=${prefixMs} cmds=${cmdsMs} login=${Date.now() - loginStartedAt})`,
    );
  } catch (err) {
    if (global.logger && typeof global.logger.error === "function") {
      global.logger.error("[STARTUP]", err);
    }
  }
})();