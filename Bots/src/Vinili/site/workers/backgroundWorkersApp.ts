/**
 * Un solo processo per i lavori di sfondo che prima erano quattro processi pm2 separati
 * (vote-drain, partnership-migration, bot-scheduler, community-poll). Ognuno caricava da sé Node,
 * mongoose, gli schemi e un client Discord: qui si condividono una connessione Mongo e un client.
 * I file dei singoli worker restano avviabili anche da soli (node <file>.js).
 */
const mongoose = require("mongoose") as typeof import("mongoose");
const {
  loadDotEnv,
  loadVinylsConfig,
  resolveMongoUrl,
  resolveDiscordToken,
  installConsoleLogger,
  installWorkerEmbedPatches,
} = require("./workerAppBootstrap") as typeof import("./workerAppBootstrap");
const { createSiteApiRestClient } = require("../http/siteApiRestClient") as typeof import("../http/siteApiRestClient");

loadDotEnv();
process.env.VOTE_QUEUE_WORKER = "1";
process.env.PARTNERSHIP_MIGRATION_WORKER = "1";
process.env.BOT_SCHEDULER_WORKER = "1";
process.env.COMMUNITY_POLL_WORKER = "1";
installConsoleLogger();
installWorkerEmbedPatches();

const WORKERS = [
  ["vote-drain", () => require("./voteQueueDrainWorkerApp").startVoteDrainWorker],
  ["partnership-migration", () => require("../../Partner/workers/partnershipMigrationWorkerApp").startPartnershipMigrationWorker],
  ["bot-scheduler", () => require("./botSchedulerWorkerApp").startBotSchedulerWorker],
  ["community-poll", () => require("./communityPollWorkerApp").startCommunityPollWorker],
] as const;

async function main() {
  const mongo = resolveMongoUrl();
  if (!mongo) {
    console.error("[BG-WORKERS] Missing MONGO_URL / MONGODB_URI");
    process.exit(1);
  }
  const token = resolveDiscordToken();
  if (!token) {
    console.error("[BG-WORKERS] Missing DISCORD_TOKEN");
    process.exit(1);
  }

  const config = loadVinylsConfig();
  await mongoose.connect(mongo, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 12_000,
  });
  console.log("[BG-WORKERS] Mongo connected");

  const client = await createSiteApiRestClient(config, token, {
    restTimeoutMs: 12_000,
    meAttempts: 5,
  });
  global.botClient = client;

  // uno che fallisce all'avvio non deve fermare gli altri
  for (const [name, load] of WORKERS) {
    try {
      await load()({ client });
    } catch (err) {
      console.error(`[BG-WORKERS] ${name} non avviato:`, err?.message || err);
    }
  }
  console.log(`[BG-WORKERS] online: ${WORKERS.map(([n]) => n).join(", ")}`);
}

main().catch((err?) => {
  console.error("[BG-WORKERS] fatal:", err);
  process.exit(1);
});
