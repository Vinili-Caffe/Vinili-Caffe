/**
 * Processo dedicato Markov (keeper HTTP + backfill storico + auto-send) per Vinili.
 *
 * PM2: vinyls-markov → MARKOV_WORKER=1, LOADER_BOTS=vinyls
 * Sul gateway `bots-vinyls` imposta MARKOV_EXTERNAL=1 così ready non avvia keeper/backfill/auto-send;
 * messageCreate resta sul bot per ingest live (+ counter auto-send / reply).
 */
const mongoose = require("mongoose") as typeof import("mongoose");
const {
  loadDotEnv,
  loadVinylsConfig,
  resolveMongoUrl,
  resolveDiscordToken,
  installConsoleLogger,
} = require("./workerAppBootstrap") as typeof import("./workerAppBootstrap");
const { createSiteApiRestClient } = require("../http/siteApiRestClient") as typeof import("../http/siteApiRestClient");
const { startMarkovKeeperHttpServer } = require("../../Community/services/markovKeeperHttpService") as typeof import("../../Community/services/markovKeeperHttpService");
const { startMarkovBackfill } = require("../../Community/services/markovMessageCollectorService") as typeof import("../../Community/services/markovMessageCollectorService");
const { startMarkovAutoSendWorkerLoop } = require("../../Community/services/markovAutoSendService") as typeof import("../../Community/services/markovAutoSendService");

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

  const mongo = resolveMongoUrl();
  if (mongo && mongoose.connection.readyState === 0) {
    await mongoose.connect(mongo, {
      maxPoolSize: 4,
      serverSelectionTimeoutMS: 12_000,
    });
    console.log("[MARKOV-WORKER] Mongo connected");
  }

  const client = await createSiteApiRestClient(config, token, {
    restTimeoutMs: 12_000,
    meAttempts: 5,
  });
  global.botClient = client;

  startMarkovKeeperHttpServer(client);
  startMarkovBackfill(client);
  startMarkovAutoSendWorkerLoop(client);

  console.log(
    `[MARKOV-WORKER] online as ${client.user?.tag || client.user?.username || "bot"} (keeper HTTP + corpus backfill + auto-send)`,
  );
}

if (require.main === module) {
  main().catch((err?) => {
    console.error("[MARKOV-WORKER] fatal:", err);
    process.exit(1);
  });
}

export = { startVinylsMarkovWorker: main };
