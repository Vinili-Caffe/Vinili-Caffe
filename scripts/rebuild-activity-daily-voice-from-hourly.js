/**
 * Ricostruisce/integra ActivityDaily (solo VOCE) partendo da ActivityHourly.voiceSeconds.
 *
 * Serve perché le classifiche evento "Top vocale" leggono ActivityDaily.voiceChannels (non ActivityHourly).
 * Questo script prende la somma per (dateKey,userId) e la mette in un singolo canale voce "bucket"
 * scelto automaticamente tra i canali eleggibili (Connect+Speak visibili ai member).
 *
 * È idempotente: per ogni (dateKey,userId) aggiorna solo la DIFFERENZA tra
 *   sumHourlyVoiceSeconds(dateKey,userId) e ActivityDaily.voiceChannels[bucketChannelId].
 *
 * Uso:
 * - Dry-run: node scripts/rebuild-activity-daily-voice-from-hourly.js --since=2026-03-13 --until=2026-03-17
 * - Applica:  node scripts/rebuild-activity-daily-voice-from-hourly.js --since=2026-03-13 --until=2026-03-17 --fix
 */
const path = require("path");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");

const ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

const VINYLS = path.join(ROOT, "Vinyls");
let IDs = { guilds: { main: "" }, channels: {} };
try {
  IDs = require(path.join(VINYLS, "Utils", "Config", "ids"));
} catch (_) {}

const { ActivityHourly, ActivityDaily } = require(path.join(VINYLS, "Schemas", "Community", "communitySchemas"));

const TIME_ZONE = "Europe/Rome";

function parseArgs(argv) {
  const out = { dryRun: true, since: "2026-03-13", until: "2026-03-17" };
  for (const a of argv) {
    const s = String(a || "").trim();
    if (s === "--fix") out.dryRun = false;
    else if (s.startsWith("--since=")) out.since = s.slice(8).trim() || out.since;
    else if (s.startsWith("--until=")) out.until = s.slice(8).trim() || out.until;
  }
  return out;
}

function getMongoUrl() {
  return process.env.MONGO_URL_LOCAL || process.env.MONGODB_URI_LOCAL || process.env.MONGO_URL || process.env.MONGODB_URI || null;
}

function getDiscordToken() {
  return process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN || process.env.TOKEN || "";
}

function validDay(s) {
  return /^(\d{4})-(\d{2})-(\d{2})$/.test(String(s || "").trim());
}

function toDateKeyFromHourKey(hourKey) {
  const hk = String(hourKey || "");
  const i = hk.indexOf("T");
  return i > 0 ? hk.slice(0, i) : hk;
}

function extractMapEntries(raw) {
  if (!raw) return [];
  if (raw instanceof Map) return Array.from(raw.entries());
  if (typeof raw === "object") return Object.entries(raw);
  return [];
}

async function pickBucketVoiceChannelId(guild) {
  const candidate = String(IDs.channels?.vocaleLounge1 || IDs.channels?.vocaleTrio1 || "").trim();
  if (candidate) {
    const ch = guild.channels.cache.get(candidate) || (await guild.channels.fetch(candidate).catch(() => null));
    const perms = ch?.permissionsFor?.(guild.roles.everyone);
    if (ch && perms?.has("ViewChannel") && perms.has("Connect") && perms.has("Speak")) return String(ch.id);
  }
  for (const ch of guild.channels.cache.values()) {
    const perms = ch?.permissionsFor?.(guild.roles.everyone);
    if (!perms?.has("ViewChannel")) continue;
    if (perms.has("Connect") && perms.has("Speak")) return String(ch.id);
  }
  return null;
}

function formatRomeDateKey(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

async function main() {
  const { dryRun, since, until } = parseArgs(process.argv.slice(2));
  const guildId = String(IDs.guilds?.main || "").trim();
  const mongoUrl = getMongoUrl();
  const token = getDiscordToken();

  if (!guildId) throw new Error("IDs.guilds.main non impostato.");
  if (!mongoUrl) throw new Error("MongoDB: imposta MONGO_URL o MONGO_URL_LOCAL.");
  if (!token) throw new Error("Discord: imposta DISCORD_TOKEN_OFFICIAL o TOKEN.");
  if (!validDay(since) || !validDay(until)) throw new Error("Formato date: usa --since=YYYY-MM-DD --until=YYYY-MM-DD");

  const startHourKey = `${since}T00`;
  const endHourKey = `${until}T23`;

  console.log("[daily-voice] guildId=" + guildId + " dryRun=" + dryRun + " hourKey=" + startHourKey + ".." + endHourKey);

  mongoose.set("strictQuery", false);
  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 20000, connectTimeoutMS: 20000 });
  console.log("[daily-voice] MongoDB connesso.");

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  await new Promise((resolve, reject) => {
    client.once("clientReady", resolve);
    client.once("error", reject);
    setTimeout(() => reject(new Error("Login timeout")), 25000);
  });
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new Error("Guild non trovata: " + guildId);
  await guild.channels.fetch().catch(() => null);

  const bucketChannelId = await pickBucketVoiceChannelId(guild);
  if (!bucketChannelId) throw new Error("Nessun canale voce eleggibile trovato per scrivere voiceChannels.");
  console.log("[daily-voice] bucketVoiceChannelId=" + bucketChannelId);

  const cursor = ActivityHourly.find({
    guildId,
    hourKey: { $gte: startHourKey, $lte: endHourKey },
    voiceSeconds: { $gt: 0 },
  }).select("hourKey userId voiceSeconds").lean().cursor();

  const sums = new Map(); // key = dateKey:userId -> seconds
  let rows = 0;
  for await (const row of cursor) {
    rows += 1;
    const userId = String(row?.userId || "").trim();
    if (!userId) continue;
    const sec = Math.max(0, Math.floor(Number(row?.voiceSeconds || 0)));
    if (sec <= 0) continue;
    const dateKey = toDateKeyFromHourKey(row?.hourKey);
    const key = `${dateKey}:${userId}`;
    sums.set(key, (sums.get(key) || 0) + sec);
  }
  console.log("[daily-voice] ActivityHourly rows=" + rows + " buckets=" + sums.size);
  if (!sums.size) {
    client.destroy();
    await mongoose.disconnect().catch(() => {});
    return;
  }

  // Precarico gli ActivityDaily esistenti per calcolare delta idempotente.
  const dateKeys = Array.from(new Set(Array.from(sums.keys()).map((k) => k.split(":")[0])));
  const userIds = Array.from(new Set(Array.from(sums.keys()).map((k) => k.split(":")[1])));
  const existing = await ActivityDaily.find({
    guildId,
    dateKey: { $in: dateKeys },
    userId: { $in: userIds },
  }).select("dateKey userId voiceSeconds voiceChannels").lean().catch(() => []);
  const existingMap = new Map();
  for (const d of existing) {
    const dk = String(d?.dateKey || "");
    const uid = String(d?.userId || "");
    if (!dk || !uid) continue;
    existingMap.set(`${dk}:${uid}`, d);
  }

  const ops = [];
  let deltas = 0;
  let deltaSeconds = 0;
  for (const [key, sumSeconds] of sums.entries()) {
    const [dateKey, userId] = key.split(":");
    const doc = existingMap.get(key) || null;
    let existingBucket = 0;
    if (doc?.voiceChannels) {
      for (const [chId, value] of extractMapEntries(doc.voiceChannels)) {
        if (String(chId) === bucketChannelId) existingBucket += Math.max(0, Number(value || 0));
      }
    }
    const delta = Math.max(0, Math.floor(Number(sumSeconds || 0)) - Math.floor(Number(existingBucket || 0)));
    if (delta <= 0) continue;
    deltas += 1;
    deltaSeconds += delta;
    ops.push({
      updateOne: {
        filter: { guildId, dateKey, userId },
        update: {
          $inc: { voiceSeconds: delta, [`voiceChannels.${bucketChannelId}`]: delta },
          $setOnInsert: { guildId, dateKey, userId, textCount: 0 },
        },
        upsert: true,
      },
    });
  }

  console.log("[daily-voice] deltas=" + deltas + " deltaSeconds=" + deltaSeconds + " (" + (deltaSeconds / 60).toFixed(1) + "m) from " + formatRomeDateKey(new Date()) );

  if (dryRun) {
    console.log("[daily-voice] Dry-run: nessuna scrittura. Esegui con --fix per applicare.");
    client.destroy();
    await mongoose.disconnect().catch(() => {});
    return;
  }

  const BATCH = 500;
  for (let i = 0; i < ops.length; i += BATCH) {
    await ActivityDaily.bulkWrite(ops.slice(i, i + BATCH), { ordered: false });
  }
  console.log("[daily-voice] ActivityDaily aggiornati: " + ops.length);

  client.destroy();
  await mongoose.disconnect().catch(() => {});
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});