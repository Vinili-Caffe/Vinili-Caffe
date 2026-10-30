const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

const ROOT = path.resolve(__dirname, "../../..");
const envPath = path.join(ROOT, ".env");
try {
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = val;
    }
  }
} catch (_) {}

process.env.PARTNERSHIP_MIGRATION_WORKER = "1";

const mongoose = require("mongoose") as typeof import("mongoose");
const { createSiteApiRestClient } = require("./siteApiRestClient") as typeof import("./siteApiRestClient");
const {
  startPartnershipHistoryMigrationWorker,
} = require("../Partner/tenantPartnershipHistoryMigrationService") as typeof import("../Partner/tenantPartnershipHistoryMigrationService");
const { refreshPartnershipConfigCache } = require("../../MultiGuild/core/tenantPartnershipSettings") as typeof import("../../MultiGuild/core/tenantPartnershipSettings");

function loadVinylsConfig() {
  const configPath = path.join(ROOT, "Vinili", "config.json");
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

async function main() {
  /* mongoSingleSource1 */
  const mongo = require("../../Utils/Database/mongoConnect").buildMongoUrl();
  if (!mongo) {
    console.error("[PARTNERSHIP-MIGRATION] Missing MONGO_URL / MONGODB_URI");
    process.exit(1);
  }

  const config = loadVinylsConfig();
  const token = String(process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL || "").trim();
  if (!token) {
    console.error("[PARTNERSHIP-MIGRATION] Missing DISCORD_TOKEN");
    process.exit(1);
  }

  global.logger = {
    info: (...a) => console.log(...a),
    warn: (...a) => console.warn(...a),
    error: (...a) => console.error(...a),
    debug: (...a) => console.log(...a),
  };

  await mongoose.connect(mongo, {
    maxPoolSize: 4,
    serverSelectionTimeoutMS: 12_000,
  });
  console.log("[PARTNERSHIP-MIGRATION] Mongo connected");

  await refreshPartnershipConfigCache().catch(() => null);

  const client = await createSiteApiRestClient(config, token);
  global.botClient = client;
  startPartnershipHistoryMigrationWorker(client);
  console.log(
    `[PARTNERSHIP-MIGRATION] worker online as ${client.user?.tag || client.user?.username || "bot"}`,
  );

  const keepAlive = setInterval(() => {}, 60_000);
  keepAlive.unref?.();
}

main().catch((err?) => {
  console.error("[PARTNERSHIP-MIGRATION] fatal:", err);
  process.exit(1);
});
