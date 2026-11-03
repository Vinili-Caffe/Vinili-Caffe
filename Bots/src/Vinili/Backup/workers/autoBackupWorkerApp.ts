const mongoose = require("mongoose") as typeof import("mongoose");
const {
  loadDotEnv,
  loadVinylsConfig,
  resolveMongoUrl,
  resolveDiscordToken,
  installConsoleLogger,
} = require("../../site/workers/workerAppBootstrap") as typeof import("../../site/workers/workerAppBootstrap");
const { createSiteApiRestClient } = require("../../site/http/siteApiRestClient") as typeof import("../../site/http/siteApiRestClient");
const { startAutoBackupLoop, runAutoBackupTick, listAutoBackupGuildIds } = require("../services/autoBackupService") as typeof import("../services/autoBackupService");

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

  /* AUTO_BACKUP_ONCE=1: pm2 lo avvia all'orario (cron_restart), fa il backup e si chiude invece di restare acceso tutto il giorno */
  if (String(process.env.AUTO_BACKUP_ONCE || "").trim() === "1") {
    console.log(`[AUTO-BACKUP] giro unico: protected=${targetIds.length}`);
    await runAutoBackupTick(client);
    console.log("[AUTO-BACKUP] fatto, chiudo");
    await mongoose.disconnect().catch(() => null);
    process.exit(0);
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
