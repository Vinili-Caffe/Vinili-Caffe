/**
 * Processo dedicato Markov (keeper HTTP + backfill storico + auto-send) per Vinili.
 *
 * PM2: vinyls-markov → MARKOV_WORKER=1, LOADER_BOTS=vinyls
 * Sul gateway `bots-vinyls` imposta MARKOV_EXTERNAL=1 così ready non avvia keeper/backfill/auto-send;
 * messageCreate resta sul bot per ingest live (+ counter auto-send / reply).
 */
const {
  loadDotEnv,
  loadVinylsConfig,
  resolveDiscordToken,
  installConsoleLogger,
} = require("./workerAppBootstrap") as typeof import("./workerAppBootstrap");
const { createSiteApiRestClient } = require("../http/siteApiRestClient") as typeof import("../http/siteApiRestClient");
const { startMarkovKeeperHttpServer } = require("../../Community/services/markovKeeperHttpService") as typeof import("../../Community/services/markovKeeperHttpService");
const { startMarkovBackfill } = require("../../Community/services/markovMessageCollectorService") as typeof import("../../Community/services/markovMessageCollectorService");
const { startMarkovAutoSendWorkerLoop } = require("../../Community/services/markovAutoSendService") as typeof import("../../Community/services/markovAutoSendService");
const { startExternalWorkerHeartbeat } = require("../../../shared/runtime/externalWorkerGate") as typeof import("../../../shared/runtime/externalWorkerGate");
const { connectMongo, isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");

loadDotEnv();
process.env.MARKOV_WORKER = "1";
installConsoleLogger();

async function main() {
  const config = loadVinylsConfig();
  const token = resolveDiscordToken();
  if (!token) {
    console.error("[MARKOV-WORKER] Missing DISCORD_TOKEN / DISCORD_TOKEN_OFFICIAL");
    process.exit(1);
  }

  await connectMongo();
  if (!isMongoReady()) {
    console.error("[MARKOV-WORKER] Mongo non pronto — auto-send BotState non funzionerà");
  }

  const client = await createSiteApiRestClient(config, token, {
    restTimeoutMs: 12_000,
    meAttempts: 5,
  });
  global.botClient = client;

  startMarkovKeeperHttpServer(client);
  startMarkovBackfill(client);
  startMarkovAutoSendWorkerLoop(client);
  startExternalWorkerHeartbeat("MARKOV");

  console.log(
    `[MARKOV-WORKER] ready as ${client.user?.tag || client.user?.username || "bot"}`,
  );
}

if (require.main === module) {
  main().catch((err?) => {
    console.error("[MARKOV-WORKER] fatal:", err);
    process.exit(1);
  });
}

export = { startVinylsMarkovWorker: main };
