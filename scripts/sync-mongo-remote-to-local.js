/**
 * Sincronizza il database MongoDB remoto verso quello locale.
 * Copia tutte le collection: i dati sul DB locale vengono SOSTITUITI con quelli remoti.
 *
 * Uso (argomenti: prima sorgente remota, poi destinazione locale):
 *   node scripts/sync-mongo-remote-to-local.js "mongodb+srv://..." "mongodb://127.0.0.1:27017/local" --overwrite-local
 *
 * Oppure con variabili d'ambiente / .env:
 *   MONGO_URL = remoto, MONGO_URL_LOCAL = locale
 * Poi: node scripts/sync-mongo-remote-to-local.js --overwrite-local
 *
 * --overwrite-local OBBLIGATORIO quando la destinazione è locale (127.0.0.1/localhost).
 *   Accetta anche: -overwrite-local, SYNC_OVERWRITE_LOCAL=1 nel .env.
 *   Backup locale: mongodump --uri="<MONGO_URL_LOCAL>" --out=./backup-local
 */

const path = require("path");
const mongoose = require("mongoose");

const ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

const rawArgs = process.argv.slice(2).map((a) => String(a).trim());
const isOverwriteFlag = (a) => {
  const s = String(a).toLowerCase().replace(/^-+/, "");
  return s === "overwrite-local" || s === "overwritelocal";
};
const overwriteLocal =
  String(process.env.SYNC_OVERWRITE_LOCAL || "").trim() === "1" ||
  rawArgs.some(isOverwriteFlag);
const urlArgs = rawArgs.filter((a) => !isOverwriteFlag(a));
const argSource = urlArgs[0] || null;
const argDest = urlArgs[1] || null;

function getSourceUrl() {
  return argSource || process.env.MONGO_URL || process.env.MONGODB_URI || null;
}

function getDestUrl() {
  return argDest || process.env.MONGO_URL_LOCAL || process.env.MONGODB_URI_LOCAL || null;
}

/** Rimuove parametri URI con valore vuoto (es. retry=) che il driver MongoDB rifiuta. */
function normalizeMongoUrl(url) {
  if (!url || typeof url !== "string") return url;
  const i = url.indexOf("?");
  if (i === -1) return url;
  const base = url.slice(0, i);
  const search = url.slice(i + 1);
  const params = new URLSearchParams(search);
  const kept = [];
  for (const [k, v] of params.entries()) {
    if (v !== "" && v !== null && v !== undefined) kept.push(`${k}=${encodeURIComponent(v)}`);
  }
  return kept.length ? `${base}?${kept.join("&")}` : base;
}

async function run() {
  const sourceUrl = normalizeMongoUrl(getSourceUrl());
  const destUrl = normalizeMongoUrl(getDestUrl());

  if (!sourceUrl) {
    console.error("Manca l’URL del DB remoto. Passalo come 1° argomento oppure imposta MONGO_URL nel .env.");
    process.exit(1);
  }
  if (!destUrl) {
    console.error("Manca l’URL del DB locale. Passalo come 2° argomento oppure imposta MONGO_URL_LOCAL nel .env.");
    process.exit(1);
  }

  const norm = (u) => (u || "").replace(/\/\/[^@]+@/, "//***@").toLowerCase();
  if (norm(sourceUrl) === norm(destUrl)) {
    console.error("Sorgente e destinazione sono lo stesso DB. Usa MONGO_URL (remoto) e MONGO_URL_LOCAL (locale).");
    process.exit(1);
  }

  const isDestLocal = () => {
    try {
      const u = new URL(destUrl.replace(/^mongodb(\+srv)?:/, "https:"));
      const h = (u.hostname || "").toLowerCase();
      return h === "127.0.0.1" || h === "localhost" || h === "::1";
    } catch {
      return false;
    }
  };
  if (isDestLocal() && !overwriteLocal) {
    console.error("");
    console.error("*** DESTINAZIONE LOCALE: serve conferma ***");
    console.error("Stai per SOVRASCRIVERE il DB locale con il remoto. I dati attuali sul locale andranno persi.");
    console.error("");
    console.error("Per procedere: aggiungi --overwrite-local oppure nel .env: SYNC_OVERWRITE_LOCAL=1");
    console.error("Esempio: node scripts/sync-mongo-remote-to-local.js --overwrite-local");
    console.error("");
    console.error("Per fare prima un backup del locale:");
    console.error('  mongodump --uri="<MONGO_URL_LOCAL>" --out=./backup-local');
    console.error("");
    process.exit(1);
  }

  const mask = (url) => {
    try {
      const u = new URL(url.replace(/^mongodb(\+srv)?:/, "https:"));
      return `${u.protocol.replace("https", "mongodb")}//${u.hostname}/***`;
    } catch {
      return "***";
    }
  };
  console.log("Sorgente (remoto):", mask(sourceUrl));
  console.log("Destinazione (locale):", mask(destUrl));
  console.log("");

  let connSource = null;
  let connDest = null;

  try {
    connSource = await mongoose.createConnection(sourceUrl, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 15000,
    }).asPromise();
    console.log("Connesso al DB remoto.");

    connDest = await mongoose.createConnection(destUrl, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    }).asPromise();
    console.log("Connesso al DB locale.");
  } catch (err) {
    console.error("Errore di connessione:", err.message);
    process.exit(1);
  }

  try {
    const collections = await connSource.db.listCollections().toArray();
    const names = collections
      .map((c) => c.name)
      .filter((name) => !name.startsWith("system."));

    if (names.length === 0) {
      console.log("Nessuna collection da copiare.");
      return;
    }

    console.log(`Collection da sincronizzare: ${names.length}\n`);

    for (const name of names) {
      try {
        const docs = await connSource.db.collection(name).find({}).toArray();
        const count = docs.length;
        await connDest.db.collection(name).deleteMany({});
        if (docs.length > 0) {
          await connDest.db.collection(name).insertMany(docs);
        }
        console.log(`  ${name}: ${count} documenti`);
      } catch (err) {
        console.error(`  ${name}: ERRORE - ${err.message}`);
      }
    }

    console.log("\nSincronizzazione completata.");
  } finally {
    if (connSource) await connSource.close().catch(() => {});
    if (connDest) await connDest.close().catch(() => {});
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});