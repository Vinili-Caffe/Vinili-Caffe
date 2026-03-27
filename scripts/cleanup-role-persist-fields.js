const path = require("path");
const mongoose = require("mongoose");
const { loadEnvFiles } = require("../shared/runtime/fsRuntime");

const APP_ROOT = path.resolve(__dirname, "..", "Vinyls");
loadEnvFiles(APP_ROOT);

const { ActivityUserProfile } = require("../Vinyls/Schemas/Community/communitySchemas");

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
  const dryRun = process.argv.includes("--dry-run");
  const mongoUrl = getMongoUrl();
  if (!mongoUrl) {
    console.error("Mongo URL non trovata. Imposta MONGO_URL/MONGO_URL_LOCAL (o MONGODB_URI).");
    process.exitCode = 1;
    return;
  }

  const filter = { "profile.rolePersist": { $exists: true } };

  try {
    mongoose.set("strictQuery", false);
    await mongoose.connect(mongoUrl, MONGO_CONNECT_OPTIONS);

    const totalMatched = await ActivityUserProfile.countDocuments(filter);
    console.log(`[cleanup-role-persist-fields] Documenti con profile.rolePersist: ${totalMatched}`);

    if (dryRun) {
      console.log("[cleanup-role-persist-fields] Dry-run attivo: nessuna modifica eseguita.");
      return;
    }

    const res = await ActivityUserProfile.updateMany(
      filter,
      {
        $unset: {
          "profile.rolePersist": 1,
        },
      },
    );

    const remaining = await ActivityUserProfile.countDocuments(filter);
    console.log(`[cleanup-role-persist-fields] Matched: ${Number(res?.matchedCount || 0)}`);
    console.log(`[cleanup-role-persist-fields] Modified: ${Number(res?.modifiedCount || 0)}`);
    console.log(`[cleanup-role-persist-fields] Residui dopo cleanup: ${remaining}`);
  } catch (err) {
    console.error("[cleanup-role-persist-fields] Errore:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => null);
  }
}

main();