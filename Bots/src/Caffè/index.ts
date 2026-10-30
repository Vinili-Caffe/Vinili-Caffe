/*!
 * Copyright (c) 2024–2026 Vinili & Caffè. Tutti i diritti riservati.
 * Uso, copia, modifica e distribuzione vietati senza autorizzazione scritta.
 * SPDX-License-Identifier: LicenseRef-Proprietary-ViniliCaffe — vedi LICENSE.
 */
const discord = require("discord.js") as typeof import("discord.js");
const { Client, IntentsBitField } = discord;
const GatewayIntentBits = discord.GatewayIntentBits || IntentsBitField?.Flags || {};
const Partials = discord.Partials || {};
const path = require("path") as typeof import("path");
const { EventEmitter } = require("events") as typeof import("events");
const APP_ROOT = __dirname;
const {acquireSingleInstanceLock,installHandlers,listFoldersIfExists,loadEnvFiles,}= require("../shared/runtime/fsRuntime") as typeof import("../shared/runtime/fsRuntime");
const { initializeCommandCollections } = require("../shared/runtime/clientRuntime") as typeof import("../shared/runtime/clientRuntime");

loadEnvFiles(APP_ROOT);
try {
  require("../shared/scheduling/nodeCronMissFilter").installNodeCronMissFilter();
} catch (_) {}
try {
  const {
    installEmbedFooterPatch,
    installOutgoingMessageEmbedPatch,
    setEmbedBrandDefaultColor,
  } = require("../Vinili/Utils/Embeds/defaultFooter") as typeof import("../Vinili/Utils/Embeds/defaultFooter");
  // Caffè keeps the shared copyright footer, but uses coffee brown — not tenant purple.
  setEmbedBrandDefaultColor("#6f4e37");
  installEmbedFooterPatch();
  installOutgoingMessageEmbedPatch(discord);
} catch (_) {}
global.logger = require("./Utils/Moderation/logger");
if (process.env.RUN_UNDER_LOADER !== "1") {
  acquireSingleInstanceLock("vinili-caffe-test-bot");
}

const installProcessHandlers = require("./Handlers/processHandler") as typeof import("./Handlers/processHandler");
const { buildInitialClientPresenceOptions, installBotPresenceHooks, patchClientPresenceGuard } = require("../shared/discord/botPresenceActivity") as typeof import("../shared/discord/botPresenceActivity");
const { installGatewayShardListenerCeiling } = require("../shared/discord/gatewayListenerCeiling") as typeof import("../shared/discord/gatewayListenerCeiling");
const {
  buildDiscordClientMemoryOptions,
  resolveGatewayIntents,
  resolveGatewayPartials,
} = require("../shared/discord/clientMemoryOptions") as typeof import("../shared/discord/clientMemoryOptions");
installProcessHandlers();

/* perfP0: Coffee non usa supporter vanity → niente GuildPresences */
const intentList = resolveGatewayIntents(discord, { includePresences: false });
const partialList = resolveGatewayPartials(discord);
const coffeeConfig = require("./config.json") as typeof import("./config.json");
const client = new Client({
  intents: intentList,
  partials: partialList,
  ...buildDiscordClientMemoryOptions(discord),
  presence: buildInitialClientPresenceOptions(coffeeConfig),
  rest: { timeout: 30_000, offset: 50, retries: 3 },
});

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
  client.config = coffeeConfig;
  patchClientPresenceGuard(client);
} catch (err) {
  global.logger.error(
    " config.json mancante o non valido:",
    err && err.message ? err.message : err,
  );
  process.exit(1);
}

const { getToken, getMongoUrl, ensureToken, assertBotTokenIdentity } = require("../shared/config/env") as typeof import("../shared/config/env");
const { connectMongo, isMongoReady } = require("../Vinili/Utils/Database/mongoConnect") as typeof import("../Vinili/Utils/Database/mongoConnect");
client.config.token = getToken(client.config, "DISCORD_TOKEN_TEST");
client.config.mongoURL = getMongoUrl(client.config);
ensureToken(client.config.token, "Bot Test (DISCORD_TOKEN_TEST)");
assertBotTokenIdentity(client.config.token, {
  botLabel: "Caffè (test)",
  expectedClientId: process.env.DISCORD_CLIENT_ID_TEST,
  forbiddenClientId: process.env.DISCORD_CLIENT_ID_OFFICIAL,
});
applyListenerCeiling(client, client.config);
installGatewayShardListenerCeiling(client);
installBotPresenceHooks(client);

client.logs = require("./Utils/Moderation/logs");
initializeCommandCollections(client);

installHandlers(APP_ROOT, client);

const prefixFolders = listFoldersIfExists(path.join(APP_ROOT, "Prefix"));
const commandsDir = path.join(APP_ROOT, "Commands");
const commandFolders = listFoldersIfExists(commandsDir);

(async () => {
  if (typeof client.prefixCommands === "function") {
    await client
      .prefixCommands(prefixFolders, path.join(APP_ROOT, "Prefix"))
      .catch((err?) => {
        global.logger.error(" prefixCommands:", err);
      });
  }

  if (typeof client.handleEvents === "function") {
    client.handleEvents(path.join(APP_ROOT, "Events"));
  }

  if (typeof client.handleCommands === "function") {
    await client
      .handleCommands(commandFolders, commandsDir)
      .catch((err?) => {
        global.logger.error(" handleCommands:", err);
      });
  }

  if (typeof client.loadButtonHandlers === "function") {
    await client.loadButtonHandlers(path.join(APP_ROOT, "Buttons")).catch((err?) => {
      global.logger.error(" loadButtonHandlers:", err);
    });
  }

  if (typeof client.handleTriggers === "function") {
    await client.handleTriggers(APP_ROOT).catch((err?) => {
      global.logger.error(" handleTriggers:", err);
    });
  }

  if (typeof client.logBootTables === "function") {
    client.logBootTables();
  }

  const mongoConnected = await connectMongo(client);
  if (!mongoConnected || !isMongoReady()) {
    global.logger.error("[DATABASE] Startup aborted: MongoDB is required before login.");
    process.exit(1);
  }

  global.__coffeeDiscordClient = client;

  const loginWithRetry = async () => {
    const maxAttempts = 10;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await client.login(client.config.token);
        return;
      } catch (err) {
        const status = Number(err?.status || err?.httpStatus || err?.code || 0);
        const retryable = status === 503 || status === 502 || status === 500 || status === 429;
        global.logger.error(`Login fallito (tentativo ${attempt}/${maxAttempts}):`, err);
        if (!retryable || attempt >= maxAttempts) {
          process.exit(1);
          return;
        }
        const waitMs = Math.min(45_000, 1500 * attempt * attempt);
        global.logger.warn?.(`[LOGIN] Discord API ${status || "error"} — retry tra ${Math.round(waitMs / 1000)}s`);
        await new Promise((r?) => setTimeout(r, waitMs));
      }
    }
  };
  void loginWithRetry();
})();