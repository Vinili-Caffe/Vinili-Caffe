/**
 * Recovery completa mod cases:
 * 1) Restore in DB locale (mongorestore) solo mod_cases + mod_configs dal dump deploy/backups/mongo-*
 * 2) Recupero casi mancanti 77-80 dagli embed del canale e upsert in mod_case_users
 * 3) Ricostruzione compact: mod_cases -> mod_case_users (merge con i 77-80 già registrati)
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

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function resolveRestoreDir(backupDir, dbName) {
  // mongorestore accetta diversi layout. Cerchiamo automaticamente il punto
  // in cui sono presenti mod_cases.bson e mod_configs.bson.
  // Possibili layout:
  // - <root>/<db>/mod_cases.bson
  // - <root>/mod_cases.bson  (se <root> è direttamente il db directory)
  // Inoltre gestiamo dump con livello extra annidato.
  const wanted = ["mod_cases.bson", "mod_configs.bson"];
  const candidateRoots = new Set();
  candidateRoots.add(backupDir);

  function addDirChildren(p, depth) {
    if (!dirExists(p) || depth <= 0) return;
    const entries = fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory());
    for (const e of entries) {
      const child = path.join(p, e.name);
      candidateRoots.add(child);
      addDirChildren(child, depth - 1);
    }
  }

  // Cerchiamo fino a profondità 3 per evitare mismatch tipo mongo-*/db/...
  addDirChildren(backupDir, 3);

  const candidates = Array.from(candidateRoots.values());
  for (const root of candidates) {
    const okUnderDb =
      fileExists(path.join(root, dbName, wanted[0])) &&
      fileExists(path.join(root, dbName, wanted[1]));
    if (okUnderDb) return root;

    const okDirect =
      fileExists(path.join(root, wanted[0])) && fileExists(path.join(root, wanted[1]));
    if (okDirect) return root;
  }

  // fallback: se esiste <backupDir>/test/mod_cases.bson, prova a usare quel livello
  const fallbackDb = "test";
  const okFallbackUnderDb =
    fileExists(path.join(backupDir, fallbackDb, wanted[0])) && fileExists(path.join(backupDir, fallbackDb, wanted[1]));
  if (okFallbackUnderDb) return backupDir;

  const okFallbackDirect = fileExists(path.join(backupDir, wanted[0])) && fileExists(path.join(backupDir, wanted[1]));
  if (okFallbackDirect) return backupDir;

  return backupDir;
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

function resolveBsonFiles(backupDir, dbName) {
  const wanted = ["mod_cases.bson", "mod_configs.bson"];
  const roots = new Set([backupDir]);

  function walkDirs(base, depth) {
    if (!dirExists(base) || depth <= 0) return;
    const dirs = fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory());
    for (const d of dirs) {
      const next = path.join(base, d.name);
      roots.add(next);
      walkDirs(next, depth - 1);
    }
  }

  walkDirs(backupDir, 3);

  const candidates = Array.from(roots.values());
  for (const root of candidates) {
    const underDbCases = path.join(root, dbName, "mod_cases.bson");
    const underDbConfig = path.join(root, dbName, "mod_configs.bson");
    if (fileExists(underDbCases) && fileExists(underDbConfig)) {
      return { modCasesBson: underDbCases, modConfigsBson: underDbConfig };
    }
    const directCases = path.join(root, "mod_cases.bson");
    const directConfig = path.join(root, "mod_configs.bson");
    if (fileExists(directCases) && fileExists(directConfig)) {
      return { modCasesBson: directCases, modConfigsBson: directConfig };
    }
  }
  throw new Error(`BSON non trovati nel backup: servono mod_cases.bson + mod_configs.bson in ${backupDir}`);
}

function runNodeScript(scriptRelPath, args) {
  const scriptPath = path.resolve(__dirname, scriptRelPath);
  // Usa il runtime Node corrente: evita problemi con NODE_BINARY in .env (es: "node 24.7.0")
  const nodeBin = process.execPath || "node";
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
  const skipRestore = process.argv.includes("--skip-restore");
  const remainingFromChannelOnly = process.argv.includes("--remaining-from-channel-only");
  const useAtlas = process.argv.includes("--atlas");
  const useLocal = process.argv.includes("--local");
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

  // Modalità dedicata: importa i case mancanti dal canale e ricompatta senza fare restore backup.
  if (remainingFromChannelOnly) {
    const registerArgs = [];
    const migrateArgs = ["--write", `--guild=${MAIN_GUILD_ID}`];
    if (useAtlas) {
      registerArgs.push("--atlas");
      migrateArgs.push("--atlas");
    } else {
      // default esplicito: locale, come comportamento storico
      registerArgs.push("--local");
    }
    if (useLocal) registerArgs.push("--local");
    console.log("[remaining-from-channel-only] target:", useAtlas ? "atlas" : "local");
    if (!dryRun) {
      runNodeScript("register-modcases-from-embeds-to-compact.js", registerArgs);
      runNodeScript("migrate-mod-case-to-compact.js", migrateArgs);
    } else {
      console.log("[DRY-RUN] remaining-from-channel-only: skip register+migrate");
    }
    const countsOnly = {};
    for (const id of WANTED_CASES) {
      countsOnly[id] = await db.collection("mod_case_users").countDocuments({ "cases.caseId": id }).catch(() => 0);
    }
    console.log(
      JSON.stringify(
        {
          dryRun,
          remainingFromChannelOnly: true,
          countsWanted_77_80: countsOnly,
        },
        null,
        2,
      ),
    );
    await mongoose.disconnect().catch(() => null);
    return;
  }

  // Restore legacy only: mod_cases + mod_configs (FILE-BASED, no restore dir intera)
  const dbName = mongoose.connection.name;
  const { modCasesBson, modConfigsBson } = resolveBsonFiles(backupDir, dbName);

  if (!skipRestore) {
    const argsCases = [
      `--uri=${mongoLocalUrl}`,
      `--db=${dbName}`,
      "--collection=mod_cases",
      "--drop",
      modCasesBson,
    ];
    const argsConfig = [
      `--uri=${mongoLocalUrl}`,
      `--db=${dbName}`,
      "--collection=mod_configs",
      "--drop",
      modConfigsBson,
    ];
    console.log("[RESTORE] mongorestore mod_cases args:", argsCases.join(" "));
    console.log("[RESTORE] mongorestore mod_configs args:", argsConfig.join(" "));
    console.log("[RESTORE] backupDir:", backupDir);
    console.log("[RESTORE] bson files:", { modCasesBson, modConfigsBson });
    if (!dryRun) {
      const resCases = spawnSync("mongorestore", argsCases, { stdio: "inherit" });
      if (resCases.status !== 0) throw new Error("mongorestore mod_cases fallito");
      const resConfig = spawnSync("mongorestore", argsConfig, { stdio: "inherit" });
      if (resConfig.status !== 0) throw new Error("mongorestore mod_configs fallito");
    }
  } else {
    console.log("[RESTORE] skipRestore=true, salto mongorestore");
  }

  if (!dryRun) {
    await dropCollection(db, "mod_case_users");
  }

  // Recupero 77-80 dagli embed e upsert nel compact (PRIMA della compattazione completa da backup)
  if (!dryRun) {
    // Lo script di import legge sempre dal canale, non serve passare parametri
    runNodeScript("register-modcases-from-embeds-to-compact.js", ["--local"]);
  } else {
    console.log("[DRY-RUN] skip register-modcases-from-embeds-to-compact.js");
  }

  // Ricostruzione compact: usa legacy mod_cases -> mod_case_users (merge, senza sovrascrivere i case già presenti)
  if (!dryRun) {
    runNodeScript("migrate-mod-case-to-compact.js", ["--write", `--guild=${MAIN_GUILD_ID}`]);
  } else {
    console.log("[DRY-RUN] skip migrate-mod-case-to-compact.js");
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