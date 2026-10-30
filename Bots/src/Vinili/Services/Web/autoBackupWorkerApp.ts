const mongoose = require("mongoose") as typeof import("mongoose");
const {
  loadDotEnv,
  loadVinylsConfig,
  resolveMongoUrl,
  resolveDiscordToken,
  installConsoleLogger,
} = require("./workerAppBootstrap") as typeof import("./workerAppBootstrap");
const { createSiteApiRestClient } = require("./siteApiRestClient") as typeof import("./siteApiRestClient");
const { startAutoBackupLoop, listAutoBackupGuildIds } = require("../Backup/autoBackupService") as typeof import("../Backup/autoBackupService");

loadDotEnv();
process.env.AUTO_BACKUP_WORKER = "1";
installConsoleLogger();

async function main() {
  const token = resolveDiscordToken();
  if (!token) {
    console.error("[AUTO-BACKUP] Missing DISCORD_TOKEN");
    process.exit(1);
  }

  const mongo = resolveMongoUrl();
  if (mongo) {
    await mongoose
      .connect(mongo, {
        maxPoolSize: 2,
        serverSelectionTimeoutMS: 12_000,
      })
      .catch((err?) => {
        console.warn("[AUTO-BACKUP] Mongo optional connect failed:", err?.message || err);
      });
  }

  const config = loadVinylsConfig();
  const client = await createSiteApiRestClient(config, token, {
    warmAllGuilds: false,
  });
  global.botClient = client;

  const targetIds = listAutoBackupGuildIds(client);
  for (const gid of targetIds) {
    await client.guilds.fetch(gid).catch((err?) => {
      console.warn(`[AUTO-BACKUP] fetch guild ${gid} failed:`, err?.message || err);
    });
  }

  startAutoBackupLoop(client);
  console.log(
    `[AUTO-BACKUP] online as ${client.user?.tag || client.user?.username || "bot"} protected=${targetIds.length} cached=${client.guilds.cache.size}`,
  );
}

main().catch((err?) => {
  console.error("[AUTO-BACKUP] fatal:", err);
  process.exit(1);
});
