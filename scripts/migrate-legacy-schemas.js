/**
 * Migra le collezioni legacy (staff event, vote, bump, profili, ecc.) verso `staffs` e `activityuserprofiles`.
 *
 *   node scripts/migrate-legacy-schemas.js              # dry-run: solo report
 *   node scripts/migrate-legacy-schemas.js --apply      # scrive sul DB
 *
 * Il report `migrated` usa matchedCount+upsertedCount: al secondo `--apply`, se i dati erano già
 * importati, `modifiedCount` Mongo può essere 0 ma `migrated` riflette comunque i documenti matchati
 * (l’update è stato eseguito; valori identici = nessuna modifica effettiva).
 *
 * Connessione: MONGO_URL_LOCAL | MONGODB_URI_LOCAL | MONGO_URL | MONGODB_URI (come gli altri script).
 */
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