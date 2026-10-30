const mongoose = require("mongoose") as typeof import("mongoose");
const {
  loadDotEnv,
  loadVinylsConfig,
  resolveMongoUrl,
  resolveDiscordToken,
  installConsoleLogger,
  installWorkerEmbedPatches,
} = require("./workerAppBootstrap") as typeof import("./workerAppBootstrap");
const { createSiteApiRestClient } = require("./siteApiRestClient") as typeof import("./siteApiRestClient");
const { startVoteQueueLoop } = require("./discadiaVoteQueueService") as typeof import("./discadiaVoteQueueService");

loadDotEnv();
process.env.VOTE_QUEUE_WORKER = "1";
installConsoleLogger();
installWorkerEmbedPatches();

async function main(shared?: { client?: any } | null) {
  const mongo = resolveMongoUrl();
  if (!mongo) {
    console.error("[VOTE-DRAIN] Missing MONGO_URL / MONGODB_URI");
    process.exit(1);
  }
  const token = resolveDiscordToken();
  if (!token) {
    console.error("[VOTE-DRAIN] Missing DISCORD_TOKEN");
    process.exit(1);
  }

  const config = loadVinylsConfig();
  if (mongoose.connection.readyState === 0) await mongoose.connect(mongo, {
    maxPoolSize: 4,
    serverSelectionTimeoutMS: 12_000,
  });
  console.log("[VOTE-DRAIN] Mongo connected");

  const client = shared?.client || (await createSiteApiRestClient(config, token));
  global.botClient = client;
  startVoteQueueLoop(client, 15_000);
  console.log(
    `[VOTE-DRAIN] online as ${client.user?.tag || client.user?.username || "bot"}`,
  );
}

/* Avvio da solo oppure dentro un processo condiviso (backgroundWorkersApp / voteIntakeApp) che passa il client. */
if (require.main === module) {
  main().catch((err?) => {
    console.error("[VOTE-DRAIN] fatal:", err);
    process.exit(1);
  });
}

export = { startVoteDrainWorker: main };
