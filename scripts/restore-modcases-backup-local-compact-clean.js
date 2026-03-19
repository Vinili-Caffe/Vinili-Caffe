/**
 * Recovery completa mod cases:
 * 1) Restore in DB locale (mongorestore) solo mod_cases + mod_configs dal dump deploy/backups/mongo-*
 * 2) Ricostruzione compact: mod_cases -> mod_case_users
 * 3) Recupero casi mancanti 77-80 dagli embed del canale e upsert in mod_case_users
 * 4) Pulizia: drop collezioni legacy mod_cases (e mod_case_user se esiste)
 *
 * Uso:
 *   node scripts/restore-modcases-backup-local-compact-clean.js
 *   node scripts/restore-modcases-backup-local-compact-clean.js --backup="deploy/backups/mongo-YYYYMMDD-HHMMSS"
 *   node scripts/restore-modcases-backup-local-compact-clean.js --dry-run
 */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");

const MAIN_GUILD_ID = String(process.env.MAIN_GUILD_ID || "1329080093599076474");
const CHANNEL_ID = "1442569294796820541";
const WANTED_CASES = [77, 78, 79, 80];

function pickLatestBackupDir() {
  const backupsRoot = path.resolve(__dirname, "../deploy/backups");
  if (!fs.existsSync(backupsRoot)) throw new Error(`Manca cartella backups: ${backupsRoot}`);
  const entries = fs
    .readdirSync(backupsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("mongo-"))
    .map((e) => e.name);

  if (entries.length === 0) throw new Error(`Nessuna cartella mongo-* in ${backupsRoot}`);

  // mongo-YYYYMMDD-HHMMSS
  const score = (name) => {
    const m = String(name).match(/mongo-(\d{8})-(\d{6})/);
    if (!m) return 0;
    const date = m[1];
    const time = m[2];
    return Number(date.slice(0, 4) + date.slice(4, 6) + date.slice(6, 8) + time);
  };

  const best = entries.sort((a, b) => score(b) - score(a))[0];
  return path.join(backupsRoot, best);
}

function mustGetMongoLocalUrl() {
  const url = process.env.MONGO_URL_LOCAL || process.env.MONGODB_URI_LOCAL;
  if (!url) throw new Error("Manca MONGO_URL_LOCAL (o MONGODB_URI_LOCAL) in .env");
  return url;
}

function ensureMongoRestoreInstalled() {
  const res = spawnSync("mongorestore", ["--version"], { stdio: "pipe" });
  if (res.error) {
    throw new Error("mongorestore non trovato nel PATH. Installa MongoDB Database Tools o aggiungi mongorestore al PATH.");
  }
}

function runNodeScript(scriptRelPath, args) {
  const scriptPath = path.resolve(__dirname, scriptRelPath);
  const nodeBin = process.env.NODE_BINARY || "node";
  const res = spawnSync(nodeBin, [scriptPath, ...args], {
    stdio: "inherit",
  });
  if (res.status !== 0) throw new Error(`Errore eseguendo ${scriptRelPath}`);
}

function dropCollection(db, collectionName) {
  return db
    .dropCollection(collectionName)
    .catch(() => null);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const backupArg = process.argv.find((a) => String(a).startsWith("--backup="));
  const backupDir = backupArg ? String(backupArg.split("=").slice(1).join("=")) : pickLatestBackupDir();

  const mongoLocalUrl = mustGetMongoLocalUrl();
  ensureMongoRestoreInstalled();

  if (dryRun) {
    console.log("[DRY-RUN] backupDir:", backupDir);
    console.log("[DRY-RUN] mongoLocalUrl source:", mongoLocalUrl.includes("@") ? "with-auth" : "no-auth");
  }

  await mongoose.connect(mongoLocalUrl, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    maxPoolSize: 5,
    minPoolSize: 1,
  });

  const db = mongoose.connection.db;
  console.log("[DB] connected:", mongoose.connection.name);

  // Restore legacy only: mod_cases + mod_configs
  // Namespace target: <db>.mod_cases, <db>.mod_configs
  const dbName = mongoose.connection.name;
  const nsIncludeCases = `${dbName}.mod_cases`;
  const nsIncludeConfig = `${dbName}.mod_configs`;

  const mongorestoreArgs = [
    `--uri=${mongoLocalUrl}`,
    `--dir=${backupDir}`,
    "--drop",
    `--nsInclude=${nsIncludeCases}`,
    `--nsInclude=${nsIncludeConfig}`,
  ];

  console.log("[RESTORE] mongorestore args:", mongorestoreArgs.join(" "));
  if (!dryRun) {
    const res = spawnSync("mongorestore", mongorestoreArgs, { stdio: "inherit" });
    if (res.status !== 0) throw new Error("mongorestore fallito");
  }

  if (!dryRun) {
    await dropCollection(db, "mod_case_users");
  }

  // Ricostruzione compact: usa legacy mod_cases -> mod_case_users
  if (!dryRun) {
    runNodeScript("migrate-mod-case-to-compact.js", ["--write", `--guild=${MAIN_GUILD_ID}`]);
  } else {
    console.log("[DRY-RUN] skip migrate-mod-case-to-compact.js");
  }

  // Recupero 77-80 dagli embed e upsert nel compact
  if (!dryRun) {
    // Lo script di import legge sempre dal canale, non serve passare parametri
    runNodeScript("register-modcases-from-embeds-to-compact.js", ["--local"]);
  } else {
    console.log("[DRY-RUN] skip register-modcases-from-embeds-to-compact.js");
  }

  if (!dryRun) {
    // Drop legacy: lascia solo compact
    await dropCollection(db, "mod_cases");
    await dropCollection(db, "mod_case_user");
  }

  // Verifica rapida wanted 77-80
  const counts = {};
  for (const id of WANTED_CASES) {
    counts[id] = await db.collection("mod_case_users").countDocuments({ "cases.caseId": id }).catch(() => 0);
  }

  // Aggiorna anche caseCounter se serve (massimo importato su mod_case_users)
  const maxCaseIdRow = await db
    .collection("mod_case_users")
    .aggregate([{ $unwind: "$cases" }, { $group: { _id: null, maxCaseId: { $max: "$cases.caseId" } } }])
    .toArray()
    .catch(() => []);
  const maxCaseId = maxCaseIdRow?.[0]?.maxCaseId ? Number(maxCaseIdRow[0].maxCaseId) : null;
  if (!dryRun && maxCaseId) {
    await db
      .collection("mod_configs")
      .updateOne({ guildId: MAIN_GUILD_ID }, { $max: { caseCounter: maxCaseId } }, { upsert: true })
      .catch(() => null);
  }

  console.log(JSON.stringify({ dryRun, backupDir, countsWanted_77_80: counts, maxCaseId }, null, 2));

  await mongoose.disconnect().catch(() => null);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
