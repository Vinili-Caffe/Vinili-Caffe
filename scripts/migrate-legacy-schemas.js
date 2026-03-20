const { connectDb, migrateAll, verifyAll } = require("./legacy-schema-migration-common");

const apply = process.argv.includes("--apply");

async function run() {
  const db = await connectDb();
  try {
    console.log(`[migrate] mode=${apply ? "apply" : "dry-run"}`);
    const migration = await migrateAll(db, apply);
    console.log("[migrate] migration report:");
    console.log(JSON.stringify(migration, null, 2));
    const verification = await verifyAll(db);
    console.log("[migrate] verification report:");
    console.log(JSON.stringify(verification, null, 2));
    if (verification.totalMismatches > 0) process.exitCode = 2;
  } finally {
    await require("mongoose").disconnect();
  }
}

run().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});