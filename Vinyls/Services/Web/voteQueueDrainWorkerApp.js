const mongoose = require("mongoose");
const {
  loadDotEnv,
  loadVinylsConfig,
  resolveMongoUrl,
  resolveDiscordToken,
  installConsoleLogger,
  installWorkerEmbedPatches,
} = require("./workerAppBootstrap");
const { createSiteApiRestClient } = require("./siteApiRestClient");
const { startVoteQueueLoop } = require("./discadiaVoteQueueService");

loadDotEnv();
process.env.VOTE_QUEUE_WORKER = "1";
installConsoleLogger();
installWorkerEmbedPatches();

async function main() {
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
  await mongoose.connect(mongo, {
    maxPoolSize: 4,
    serverSelectionTimeoutMS: 12_000,
  });
  console.log("[VOTE-DRAIN] Mongo connected");

  const client = await createSiteApiRestClient(config, token);
  global.botClient = client;
  startVoteQueueLoop(client, 15_000);
  console.log(
    `[VOTE-DRAIN] online as ${client.user?.tag || client.user?.username || "bot"}`,
  );
}

main().catch((err) => {
  console.error("[VOTE-DRAIN] fatal:", err);
  process.exit(1);
});
