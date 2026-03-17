/**
 * Importa ore di vocale per utente in ActivityHourly (poi rebuild-exp-and-levels le converte in EXP).
 *
 * File dati: JSON con array di { "userId": "123...", "hours": 2.5 } oppure
 * { "userId": "123...", "hourKey": "2026-03-13T16", "hours": 2.5 } per assegnare a un'ora precisa.
 * Se manca hourKey, usa --hourKey passato da riga di comando.
 *
 * Uso: node scripts/import-voice-hours-to-activity-hourly.js <file.json> [--hourKey=YYYY-MM-DDTHH] [--fix]
 * Senza --fix: dry-run. Esempio: node scripts/import-voice-hours-to-activity-hourly.js scripts/data/voice-hours.json --hourKey=2026-03-13T12 --fix
 */
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

const ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

const VINYLS = path.join(ROOT, "Vinyls");
let IDs = { guilds: { main: "" } };
try {
  IDs = require(path.join(VINYLS, "Utils", "Config", "ids"));
} catch (_) {}
const { ActivityHourly } = require(path.join(VINYLS, "Schemas", "Community", "communitySchemas"));

function parseArgs(argv) {
  const out = { dryRun: true, dataPath: null, defaultHourKey: null };
  for (const a of argv) {
    const s = String(a || "").trim();
    if (s === "--fix") out.dryRun = false;
    else if (s.startsWith("--hourKey=")) out.defaultHourKey = s.slice(10).trim() || null;
    else if (!s.startsWith("--") && s.length) out.dataPath = s;
  }
  return out;
}

function getMongoUrl() {
  return process.env.MONGO_URL_LOCAL || process.env.MONGODB_URI_LOCAL || process.env.MONGO_URL || process.env.MONGODB_URI || null;
}

function loadData(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("Il JSON deve essere un array di { userId, hours } o { userId, hourKey, hours }");
  return data;
}

async function main() {
  const { dryRun, dataPath, defaultHourKey } = parseArgs(process.argv.slice(2));
  const guildId = String(IDs.guilds?.main || "").trim();
  const mongoUrl = getMongoUrl();

  if (!guildId) throw new Error("IDs.guilds.main non impostato.");
  if (!mongoUrl) throw new Error("MongoDB: imposta MONGO_URL o MONGO_URL_LOCAL.");
  if (!dataPath) throw new Error("Specifica il file JSON: node scripts/import-voice-hours-to-activity-hourly.js <file.json> [--hourKey=YYYY-MM-DDTHH] [--fix]");

  const data = loadData(path.isAbsolute(dataPath) ? dataPath : path.join(ROOT, dataPath));
  const entries = [];
  for (const row of data) {
    const userId = row?.userId != null ? String(row.userId).trim() : null;
    const hours = Number(row?.hours);
    const hourKey = row?.hourKey != null ? String(row.hourKey).trim() : defaultHourKey;
    if (!userId || !Number.isFinite(hours) || hours < 0) continue;
    if (!hourKey) {
      console.warn("[import-voice] Riga senza hourKey e senza --hourKey, saltata: userId=" + userId);
      continue;
    }
    const voiceSeconds = Math.round(hours * 3600);
    entries.push({ guildId, userId, hourKey, voiceSeconds });
  }

  if (!entries.length) {
    console.log("[import-voice] Nessuna riga valida nel file.");
    process.exit(0);
  }

  console.log("[import-voice] guildId=" + guildId + " dryRun=" + dryRun + " righe=" + entries.length);

  mongoose.set("strictQuery", false);
  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 20000, connectTimeoutMS: 20000 });
  console.log("[import-voice] MongoDB connesso.");

  const ops = entries.map(({ guildId: gid, userId, hourKey, voiceSeconds }) => ({
    updateOne: {
      filter: { guildId: gid, hourKey, userId },
      update: {
        $set: { voiceSeconds },
        $setOnInsert: { textCount: 0 },
      },
      upsert: true,
    },
  }));

  if (dryRun) {
    console.log("[import-voice] Dry-run. Prime 3 righe:", entries.slice(0, 3));
    console.log("[import-voice] Esegui con --fix per applicare.");
  } else {
    const BATCH = 500;
    for (let i = 0; i < ops.length; i += BATCH) {
      await ActivityHourly.bulkWrite(ops.slice(i, i + BATCH), { ordered: false });
    }
    console.log("[import-voice] ActivityHourly aggiornati: " + ops.length + " upsert.");
  }

  await mongoose.disconnect().catch(() => {});
  console.log("[import-voice] Fatto.");
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});