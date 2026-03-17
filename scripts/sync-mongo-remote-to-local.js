/**
 * Sincronizza il database MongoDB remoto (MONGO_URL) verso quello locale (MONGO_URL_LOCAL).
 * Copia tutte le collection: i dati sul DB locale vengono sostituiti con quelli remoti.
 *
 * Uso:
 *   MONGO_URL="mongodb+srv://..." MONGO_URL_LOCAL="mongodb://127.0.0.1:27017/local" node scripts/sync-mongo-remote-to-local.js
 *
 * Da .env: MONGO_URL = remoto (sorgente), MONGO_URL_LOCAL = locale (destinazione).
 */

const path = require("path");
const mongoose = require("mongoose");

const ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

function getSourceUrl() {
  return process.env.MONGO_URL || process.env.MONGODB_URI || null;
}

function getDestUrl() {
  return process.env.MONGO_URL_LOCAL || process.env.MONGODB_URI_LOCAL || null;
}

async function run() {
  const sourceUrl = getSourceUrl();
  const destUrl = getDestUrl();

  if (!sourceUrl) {
    console.error("Manca l’URL del DB remoto. Imposta MONGO_URL o MONGODB_URI nel .env.");
    process.exit(1);
  }
  if (!destUrl) {
    console.error("Manca l’URL del DB locale. Imposta MONGO_URL_LOCAL o MONGODB_URI_LOCAL nel .env.");
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