const { connectDb, verifyAll, cleanupLegacyCollections } = require("./legacy-schema-migration-common");

const confirm = process.argv.includes("--confirm");

async function run() {
  if (!confirm) {
    console.error("Uso: node scripts/cleanup-migrated-legacy-schemas.js --confirm");
    process.exit(1);
  }
  const db = await connectDb();
  try {
    const verification = await verifyAll(db);
    console.log("[cleanup] verification report:");
    console.log(JSON.stringify(verification, null, 2));
    if (verification.totalMismatches > 0) {
      console.error("[cleanup] abort: mismatches rilevati, niente cancellazione.");
      process.exit(2);
      return;
    }
    const deleted = await cleanupLegacyCollections(db);
    console.log("[cleanup] deleted:");
    console.log(JSON.stringify(deleted, null, 2));
  } finally {
    await require("mongoose").disconnect();
  }
}

run().catch((err) => {
  console.error("[cleanup] failed:", err);
  process.exit(1);
});