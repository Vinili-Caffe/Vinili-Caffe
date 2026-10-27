/*!
 * Copyright (c) 2024–2026 Vinili & Caffè. Tutti i diritti riservati.
 * Uso, copia, modifica e distribuzione vietati senza autorizzazione scritta.
 * SPDX-License-Identifier: LicenseRef-Proprietary-ViniliCaffe — vedi LICENSE.
 */
const discord = require("discord.js");
const { Client, IntentsBitField } = discord;
const GatewayIntentBits = discord.GatewayIntentBits || IntentsBitField?.Flags || {};
const Partials = discord.Partials || {};
const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const APP_ROOT = __dirname;
const { acquireSingleInstanceLock, installHandlers, listFoldersIfExists, loadEnvFiles, } = require("../shared/runtime/fsRuntime");
const { initializeCommandCollections } = require("../shared/runtime/clientRuntime");
const { connectMongo, isMongoReady } = require("./Utils/Database/mongoConnect");

loadEnvFiles(APP_ROOT);
try {
  require("../shared/scheduling/nodeCronMissFilter").installNodeCronMissFilter();
} catch (_) {}
global.logger = require("./Utils/Moderation/logger");
try {
  const { setMusicBotHooks } = require("../shared/music/musicBotHooks");
  setMusicBotHooks({
    profile: "vinyls",
    nowPlayingTitle: "In riproduzione",
    enableVoiceCapture: true,
  });
} catch (_) {}
if (process.env.RUN_UNDER_LOADER !== "1") {
  acquireSingleInstanceLock("vinili-caffe-official-bot");
}

const { installEmbedFooterPatch, installOutgoingMessageEmbedPatch, applyDefaultFooterToEmbeds } = require("./Utils/Embeds/defaultFooter");
const { setDefaultFooterApplier, installOutgoingEditBrandingPatch } = require("../shared/discord/replyRuntime");
const { buildInitialClientPresenceOptions, installBotPresenceHooks, patchClientPresenceGuard } = require("../shared/discord/botPresenceActivity");
const { installGatewayShardListenerCeiling } = require("../shared/discord/gatewayListenerCeiling");
const {
  buildDiscordClientMemoryOptions,
  resolveGatewayIntents,
  resolveGatewayPartials,
} = require("../shared/discord/clientMemoryOptions");

const pcommandFolders = listFoldersIfExists(path.join(APP_ROOT, "Prefix"));
const commandFolders = listFoldersIfExists(path.join(APP_ROOT, "Commands"));

let client;

function resolveEventListenersCeiling(configLike) {
  const raw = Number(configLike?.eventListeners ?? 50);
  if (!Number.isFinite(raw) || raw <= 0) return 50;
  return Math.max(10, Math.floor(raw));
}

function applyListenerCeiling(clientRef, configLike) {
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
  setDefaultFooterApplier((payload, source) =>
    applyDefaultFooterToEmbeds(payload, source?.guild || source?.channel?.guild || null),
  );
  const vinylsConfig = require("./config.json");
  try {
    require("./Utils/Config/emergencyRoleIdRemap").applyEmergencyRoleRemapToConfig(vinylsConfig);
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

client.logs = require("./Utils/Moderation/logs");

const { assertBotTokenIdentity } = require("../shared/config/env");
const envToken = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL;
/* mongoSingleSource1 */
const envMongoUrl = require("./Utils/Database/mongoConnect").buildMongoUrl(client);
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

client.reloadScope = async (scope) => {
  const clearCacheByDir = (dirName) => { const abs = path.join(APP_ROOT, dirName); if (!fs.existsSync(abs)) return; for (const key of Object.keys(require.cache)) { if (!key.startsWith(abs)) continue; delete require.cache[key]; } };

  const reloadCommands = async () => { clearCacheByDir("Commands"); const folders = listFoldersIfExists(path.join(APP_ROOT, "Commands")); await client.handleCommands(folders, path.join(APP_ROOT, "Commands")); };

  const reloadPrefix = async () => { clearCacheByDir("Prefix"); const folders = listFoldersIfExists(path.join(APP_ROOT, "Prefix")); await client.prefixCommands(folders, path.join(APP_ROOT, "Prefix")); };

  const reloadEvents = () => { clearCacheByDir("Events"); client.handleEvents(path.join(APP_ROOT, "Events")); };

  const reloadTriggers = () => { clearCacheByDir("Triggers"); client.handleTriggers(APP_ROOT); };

  if (scope === "commands") return reloadCommands();
  if (scope === "prefix") return reloadPrefix();
  if (scope === "events") return reloadEvents();

  const reloadButtons = async () => { clearCacheByDir("Buttons"); await client.loadButtonHandlers(path.join(APP_ROOT, "Buttons")); };

  if (scope === "triggers") return reloadTriggers();
  if (scope === "buttons") return reloadButtons();
  if (scope === "services") return clearCacheByDir("Services");
  if (scope === "utils") return clearCacheByDir("Utils");
  if (scope === "schemas") return clearCacheByDir("Schemas");

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
    global.logger?.info?.(`[BOOT] mongo_connect_ms=${Date.now() - mongoStartedAt}`);

    const handlersStartedAt = Date.now();
    installHandlers(APP_ROOT, client);
    client.handleEvents(path.join(APP_ROOT, "Events"));
    client.handleTriggers(APP_ROOT);
    global.logger?.info?.(`[BOOT] handlers_events_ms=${Date.now() - handlersStartedAt}`);

    try {
      require("./MultiGuild").attachToClient(client);
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
    global.logger?.info?.(`[BOOT] prefix_commands_ms=${Date.now() - commandsStartedAt}`);

    const slashButtonsStartedAt = Date.now();
    await Promise.all([
      client.handleCommands(commandFolders, path.join(APP_ROOT, "Commands")).then(() => {
        client.__slashCommandsReady = true;
      }),
      client.loadButtonHandlers(path.join(APP_ROOT, "Buttons")),
    ]);
    client.__bootCommandsReady = true;
    global.logger?.info?.(`[BOOT] commands_buttons_ms=${Date.now() - slashButtonsStartedAt}`);

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
          global.logger?.info?.(`[BOOT] login_resolve_ms=${Date.now() - loginStartedAt}`);
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
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
      if (!loggedIn) process.exit(1);
    }
    global.logger?.info?.(`[BOOT] pre_ready_ms=${Date.now() - bootStartedAt}`);
  } catch (err) {
    if (global.logger && typeof global.logger.error === "function") {
      global.logger.error("[STARTUP]", err);
    }
  }
})();