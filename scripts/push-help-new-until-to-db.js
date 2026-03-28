const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { loadEnvFiles } = require("../shared/runtime/fsRuntime");

const APP_ROOT = path.resolve(__dirname, "..", "Vinyls");
loadEnvFiles(APP_ROOT);

const MONGO_CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
  socketTimeoutMS: 20000,
  maxPoolSize: 25,
  minPoolSize: 1,
  maxIdleTimeMS: 60_000,
};

function getMongoUrl() {
  const config = require("../Vinyls/config.json");
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    config.mongoURL ||
    null
  );
}

async function main() {
  const regenerate = process.argv.includes("--regenerate");
  const dryRun = process.argv.includes("--dry-run");

  let data;
  if (regenerate) {
    const { buildSortedHelpNewUntilPayload } = require("./sync-help-new-until.js");
    data = await buildSortedHelpNewUntilPayload();
  } else {
    const jsonPath = path.join(APP_ROOT, "Utils", "Config", "helpNewUntil.json");
    if (!fs.existsSync(jsonPath)) {
      console.error(
        "File assente. Esegui prima: node scripts/sync-help-new-until.js oppure usa --regenerate",
      );
      process.exitCode = 1;
      return;
    }
    data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  }

  const keys = Object.keys(data || {});
  console.log(`[push-help-new-until] Chiavi da salvare: ${keys.length}`);
  if (dryRun) {
    console.log("[push-help-new-until] Dry-run: nessuna scrittura sul DB.");
    return;
  }

  const mongoUrl = getMongoUrl();
  if (!mongoUrl) {
    console.error(
      "[push-help-new-until] Mongo URL non trovata. Imposta MONGO_URL / MONGO_URL_LOCAL (o MONGODB_URI).",
    );
    process.exitCode = 1;
    return;
  }

  try {
    mongoose.set("strictQuery", false);
    await mongoose.connect(mongoUrl, MONGO_CONNECT_OPTIONS);
    const { setBotState } = require("../Vinyls/Utils/BotState/botStateStore");
    await setBotState("helpNewUntil", data);
    console.log(
      "[push-help-new-until] OK: salvato in BotState (chiave helpNewUntil nel documento compatto o legacy).",
    );
  } catch (err) {
    console.error("[push-help-new-until] Errore:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => null);
  }
}

main();