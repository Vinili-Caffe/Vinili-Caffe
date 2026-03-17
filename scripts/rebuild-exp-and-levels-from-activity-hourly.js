/**
 * Dopo un backfill di ActivityHourly: calcola EXP (messaggi + voce) per ogni utente
 * e aggiorna ExpUser.totalExp + level. Così l'EXP "assegnata" torna coerente con i dati activity.
 *
 * Uso: node scripts/rebuild-exp-and-levels-from-activity-hourly.js [--fix] [--since=YYYY-MM-DDTHH:mm]
 * Default since: 2026-03-13T16:30 (venerdì 13 marzo 2026, 16:30 Rome).
 * Senza --fix: solo dry-run (conta EXP, non scrive).
 */
const path = require("path");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");

const ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

const VINYLS = path.join(ROOT, "Vinyls");
let IDs = { guilds: { main: "" } };
try {
  IDs = require(path.join(VINYLS, "Utils", "Config", "ids"));
} catch (_) {}
const { ActivityHourly } = require(path.join(VINYLS, "Schemas", "Community", "communitySchemas"));
const { ExpUser } = require(path.join(VINYLS, "Schemas", "Community", "communitySchemas"));
const { MESSAGE_EXP, VOICE_EXP_PER_MINUTE, retroSyncGuildLevels } = require(path.join(VINYLS, "Services", "Community", "expService"));

const TIME_ZONE = "Europe/Rome";

function pad2(v) {
  return String(v).padStart(2, "0");
}

function getHourKey(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}T${map.hour}`;
}

function parseSince(val) {
  const s = String(val || "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):?(\d{0,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const h = Number(m[4]) || 0;
  const min = Number(m[5]) || 0;
  if (!Number.isFinite(y) || !Number.isFinite(d)) return null;
  const romeOffset = mo >= 2 && mo <= 9 ? 2 : 1;
  return new Date(Date.UTC(y, mo, d, h - romeOffset, min, 0));
}

function parseArgs(argv) {
  const out = { dryRun: true, since: new Date(Date.UTC(2026, 2, 13, 14, 30, 0)) };
  for (const a of argv) {
    const s = String(a || "").trim();
    if (s === "--fix") out.dryRun = false;
    if (s.startsWith("--since=")) {
      const parsed = parseSince(s.slice(7));
      if (parsed) out.since = parsed;
    }
  }
  return out;
}

function getMongoUrl() {
  return process.env.MONGO_URL_LOCAL || process.env.MONGODB_URI_LOCAL || process.env.MONGO_URL || process.env.MONGODB_URI || null;
}

function getDiscordToken() {
  return process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN || process.env.TOKEN || "";
}

async function main() {
  const { dryRun, since } = parseArgs(process.argv.slice(2));
  const guildId = String(IDs.guilds?.main || "").trim();
  const mongoUrl = getMongoUrl();
  const token = getDiscordToken();

  if (!guildId) throw new Error("IDs.guilds.main non impostato.");
  if (!mongoUrl) throw new Error("MongoDB: imposta MONGO_URL o MONGO_URL_LOCAL.");
  if (!token) throw new Error("Discord: imposta DISCORD_TOKEN_OFFICIAL o TOKEN.");

  const sinceHourKey = getHourKey(since);
  console.log("[rebuild-exp] since=" + since.toISOString() + " -> hourKey >= " + sinceHourKey + " dryRun=" + dryRun);

  mongoose.set("strictQuery", false);
  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 20000, connectTimeoutMS: 20000 });
  console.log("[rebuild-exp] MongoDB connesso.");

  const cursor = ActivityHourly.find({ guildId, hourKey: { $gte: sinceHourKey } })
    .select("hourKey userId textCount voiceSeconds")
    .lean()
    .cursor();

  const perUser = new Map();
  let rowsRead = 0;
  for await (const row of cursor) {
    rowsRead += 1;
    const userId = String(row?.userId || "").trim();
    if (!userId) continue;
    const text = Math.max(0, Number(row?.textCount || 0));
    const voiceSeconds = Math.max(0, Number(row?.voiceSeconds || 0));
    const exp = text * MESSAGE_EXP + Math.floor((voiceSeconds / 60) * VOICE_EXP_PER_MINUTE);
    if (exp <= 0) continue;
    perUser.set(userId, (perUser.get(userId) || 0) + exp);
  }

  console.log("[rebuild-exp] Righe ActivityHourly lette: " + rowsRead + ", utenti con EXP > 0: " + perUser.size);
  if (perUser.size === 0) {
    await mongoose.disconnect().catch(() => {});
    return;
  }

  const totalExpToAdd = [...perUser.values()].reduce((a, b) => a + b, 0);
  console.log("[rebuild-exp] EXP totale da assegnare: " + totalExpToAdd);

  if (dryRun) {
    console.log("[rebuild-exp] Dry-run: nessuna scrittura. Esegui con --fix per applicare.");
    await mongoose.disconnect().catch(() => {});
    return;
  }

  const BATCH = 500;
  const incOps = [];
  for (const [userId, exp] of perUser) {
    incOps.push({
      updateOne: {
        filter: { guildId, userId },
        update: { $inc: { totalExp: exp, activityExpTotal: exp }, $setOnInsert: { guildId, userId } },
        upsert: true,
      },
    });
  }
  for (let i = 0; i < incOps.length; i += BATCH) {
    await ExpUser.bulkWrite(incOps.slice(i, i + BATCH), { ordered: false });
  }
  console.log("[rebuild-exp] ExpUser aggiornati (totalExp incrementato). Livelli e ruoli li allinea retroSyncGuildLevels.");

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  await new Promise((resolve, reject) => {
    client.once("ready", resolve);
    client.once("error", reject);
    setTimeout(() => reject(new Error("Login timeout")), 25000);
  });
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (guild) {
    const result = await retroSyncGuildLevels(guild, { syncRoles: true });
    console.log("[rebuild-exp] retroSyncGuildLevels: scanned=" + result.scanned + " changed=" + result.changed + " roleSynced=" + result.roleSynced);
  } else {
    console.log("[rebuild-exp] Guild non trovata, ruoli non sincronizzati. Riavvia il bot per allineare i ruoli livello.");
  }
  client.destroy();
  await mongoose.disconnect().catch(() => {});
  console.log("[rebuild-exp] Fatto.");
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});