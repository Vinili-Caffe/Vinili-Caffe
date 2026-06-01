/*!
 * Copyright (c) 2024–2026 Vinili & Caffè. Tutti i diritti riservati.
 * Uso, copia, modifica e distribuzione vietati senza autorizzazione scritta.
 * SPDX-License-Identifier: LicenseRef-Proprietary-ViniliCaffe — vedi LICENSE.
 */
const discord = require("discord.js");
const { Client, IntentsBitField } = discord;
const GatewayIntentBits = discord.GatewayIntentBits || IntentsBitField?.Flags || {};
const Partials = discord.Partials || {};
const path = require("path");
const { EventEmitter } = require("events");
const APP_ROOT = __dirname;
const {acquireSingleInstanceLock,installHandlers,listFoldersIfExists,loadEnvFiles,}= require("../shared/runtime/fsRuntime");
const { initializeCommandCollections } = require("../shared/runtime/clientRuntime");

loadEnvFiles(APP_ROOT);
global.logger = require("./Utils/Moderation/logger");
if (process.env.RUN_UNDER_LOADER !== "1") {
  acquireSingleInstanceLock("vinili-caffe-test-bot");
}

const installProcessHandlers = require("./Handlers/processHandler");
const { buildInitialClientPresenceOptions, installBotPresenceHooks, patchClientPresenceGuard } = require("../shared/discord/botPresenceActivity");
installProcessHandlers();

const intentList = [...new Set(Object.values(GatewayIntentBits).filter((x) => typeof x === "number" && x > 0))];
if (intentList.length === 0) intentList.push(1);
const partialList = [...new Set(Object.values(Partials).filter((x) => typeof x === "number"))];
const coffeeConfig = require("./config.json");
const client = new Client({
  intents: intentList,
  partials: partialList,
  presence: buildInitialClientPresenceOptions(coffeeConfig),
  rest: { timeout: 30_000, offset: 50, retries: 3 },
});

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
  client.config = coffeeConfig;
  patchClientPresenceGuard(client);
} catch (err) {
  global.logger.error(
    " config.json mancante o non valido:",
    err && err.message ? err.message : err,
  );
  process.exit(1);
}

const { getToken, getMongoUrl, ensureToken } = require("../shared/config/env");
client.config.token = getToken(client.config, "DISCORD_TOKEN_TEST");
client.config.mongoURL = getMongoUrl(client.config);
ensureToken(client.config.token, "Bot Test (DISCORD_TOKEN_TEST)");
applyListenerCeiling(client, client.config);
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
      .catch((err) => {
        global.logger.error(" prefixCommands:", err);
      });
  }

  if (typeof client.handleEvents === "function") {
    client.handleEvents(path.join(APP_ROOT, "Events"));
  }

  if (typeof client.handleCommands === "function") {
    await client
      .handleCommands(commandFolders, commandsDir)
      .catch((err) => {
        global.logger.error(" handleCommands:", err);
      });
  }

  if (typeof client.loadButtonHandlers === "function") {
    await client.loadButtonHandlers(path.join(APP_ROOT, "Buttons")).catch((err) => {
      global.logger.error(" loadButtonHandlers:", err);
    });
  }

  if (typeof client.handleTriggers === "function") {
    await client.handleTriggers(APP_ROOT).catch((err) => {
      global.logger.error(" handleTriggers:", err);
    });
  }

  if (typeof client.logBootTables === "function") {
    client.logBootTables();
  }

  client.login(client.config.token).catch((err) => {
    global.logger.error("Login fallito:", err);
    process.exit(1);
  });
})();