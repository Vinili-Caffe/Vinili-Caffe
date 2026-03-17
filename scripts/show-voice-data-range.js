/**
 * Legge dal DB fino a quando ci sono dati vocali (ActivityHourly.voiceSeconds > 0)
 * per un utente o per tutti. Utile per sapere il range di hourKey da cui partire (es. per import).
 *
 * Uso: node scripts/show-voice-data-range.js [--userId=123456789]
 * Senza --userId: elenca per ogni utente la prima e l'ultima hourKey con voce + totale secondi.
 */
const path = require("path");
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
  let userId = null;
  for (const a of argv) {
    const s = String(a || "").trim();
    if (s.startsWith("--userId=")) userId = s.slice(9).trim() || null;
  }
  return { userId };
}

function getMongoUrl() {
  return process.env.MONGO_URL_LOCAL || process.env.MONGODB_URI_LOCAL || process.env.MONGO_URL || process.env.MONGODB_URI || null;
}

async function main() {
  const { userId } = parseArgs(process.argv.slice(2));
  const guildId = String(IDs.guilds?.main || "").trim();
  const mongoUrl = getMongoUrl();

  if (!guildId) throw new Error("IDs.guilds.main non impostato.");
  if (!mongoUrl) throw new Error("MongoDB: imposta MONGO_URL o MONGO_URL_LOCAL.");

  mongoose.set("strictQuery", false);
  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 20000, connectTimeoutMS: 20000 });

  const match = { guildId, voiceSeconds: { $gt: 0 } };
  if (userId) match.userId = String(userId);

  const agg = await ActivityHourly.aggregate([
    { $match: match },
    { $group: {
      _id: "$userId",
      minHourKey: { $min: "$hourKey" },
      maxHourKey: { $max: "$hourKey" },
      totalVoiceSeconds: { $sum: "$voiceSeconds" },
      slots: { $sum: 1 },
    } },
    { $sort: { _id: 1 } },
  ]).exec();

  if (!agg.length) {
    console.log("Nessun dato vocale in ActivityHourly" + (userId ? " per userId=" + userId : "") + ".");
    await mongoose.disconnect().catch(() => {});
    return;
  }

  const hours = (s) => (s / 3600).toFixed(2);
  for (const r of agg) {
    const u = r._id;
    console.log("userId=" + u + " | da " + r.minHourKey + " a " + r.maxHourKey + " | " + r.slots + " slot | " + hours(r.totalVoiceSeconds) + " h totali");
  }

  await mongoose.disconnect().catch(() => {});
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});