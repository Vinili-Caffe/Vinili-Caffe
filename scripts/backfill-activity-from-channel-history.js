/**
 * Backfill ActivityHourly, ActivityDaily e ActivityUser leggendo la cronologia
 * messaggi di tutti i canali testuali della main guild da una data/ora in poi.
 * Stessi filtri del bot: canali ticket/ticketLogs/categoria ticket esclusi, bot esclusi.
 * Uso: node scripts/backfill-activity-from-channel-history.js [--fix] [--since=YYYY-MM-DDTHH:mm]
 * Default since: 2026-03-13T16:30 (venerdì 13 marzo 2026, 16:30 Rome).
 * Senza --fix fa solo dry-run (conta e logga, non scrive su DB).
 */
const path = require("path");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");

const ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

const VINYLS = path.join(ROOT, "Vinyls");
let IDs = { guilds: { main: "" }, channels: { ticket: null, ticketLogs: null } };
try {
  IDs = require(path.join(VINYLS, "Utils", "Config", "ids"));
} catch (_) {}
const { isChannelInTicketCategory } = require(path.join(VINYLS, "Utils", "Ticket", "ticketCategoryUtils"));
const { ActivityUser, ActivityDaily, ActivityHourly } = require(path.join(VINYLS, "Schemas", "Community", "communitySchemas"));

const TIME_ZONE = "Europe/Rome";

function pad2(v) {
  return String(v).padStart(2, "0");
}

function getTimeParts(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day), weekday: map.weekday };
}

function getDayKey(date) {
  const { year, month, day } = getTimeParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function getHourKey(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}T${map.hour}`;
}

function isExcludedActivityChannel(channelLike) {
  const channelId = String(channelLike?.id || channelLike?.channelId || "");
  if (channelId && (channelId === String(IDs.channels?.ticket || "") || channelId === String(IDs.channels?.ticketLogs || ""))) return true;
  return isChannelInTicketCategory(channelLike);
}

function getMongoUrl() {
  return process.env.MONGO_URL_LOCAL || process.env.MONGODB_URI_LOCAL || process.env.MONGO_URL || process.env.MONGODB_URI || null;
}

function getDiscordToken() {
  return process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN || process.env.TOKEN || "";
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAllMessagesFromChannel(channel, afterDate, onBatch) {
  let beforeId = null;
  let total = 0;
  const LIMIT = 100;
  const DELAY_MS = 1100;

  while (true) {
    const options = { limit: LIMIT };
    if (beforeId) options.before = beforeId;

    const messages = await channel.messages.fetch(options).catch(() => null);
    if (!messages || messages.size === 0) break;

    const toProcess = [];
    let oldestTs = Infinity;

    for (const [, msg] of messages) {
      const createdAt = msg.createdAt ? new Date(msg.createdAt) : null;
      if (!createdAt || createdAt.getTime() < afterDate.getTime()) continue;
      toProcess.push(msg);
      const t = createdAt.getTime();
      if (t < oldestTs) oldestTs = t;
    }

    if (toProcess.length) await onBatch(toProcess);

    total += toProcess.length;
    const oldestMsg = messages.last();
    if (!oldestMsg) break;
    const oldestCreated = oldestMsg.createdAt ? new Date(oldestMsg.createdAt) : null;
    if (oldestCreated && oldestCreated.getTime() < afterDate.getTime()) break;
    beforeId = oldestMsg.id;
    await sleep(DELAY_MS);
  }

  return total;
}

async function main() {
  const { dryRun, since } = parseArgs(process.argv.slice(2));
  const guildId = String(IDs.guilds?.main || "").trim();
  const mongoUrl = getMongoUrl();
  const token = getDiscordToken();

  if (!guildId) throw new Error("IDs.guilds.main non impostato.");
  if (!mongoUrl) throw new Error("MongoDB: imposta MONGO_URL o MONGODB_URI.");
  if (!token) throw new Error("Discord: imposta DISCORD_TOKEN_OFFICIAL o TOKEN.");

  console.log("[backfill] since=" + since.toISOString() + " (Rome ~ " + getDayKey(since) + " " + getHourKey(since) + ") dryRun=" + dryRun);

  mongoose.set("strictQuery", false);
  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 20000, connectTimeoutMS: 20000 });
  console.log("[backfill] MongoDB connesso.");

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  await new Promise((resolve, reject) => {
    client.once("ready", resolve);
    client.once("error", reject);
    setTimeout(() => reject(new Error("Login timeout")), 25000);
  });
  console.log("[backfill] Discord connesso.");

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new Error("Guild main non trovata.");

  const channels = await guild.channels.fetch().catch(() => null);
  if (!channels) throw new Error("Impossibile fetchare i canali.");

  const textChannels = [];
  for (const [, ch] of channels) {
    if (!ch?.isTextBased?.()) continue;
    if (ch.type === ChannelType.GuildForum) continue;
    if (isExcludedActivityChannel(ch)) continue;
    textChannels.push(ch);
  }

  console.log("[backfill] Canali testuali da scandire (esclusi ticket/log): " + textChannels.length);

  const hourly = new Map();
  const daily = new Map();
  const userTotals = new Map();

  function addMessage(msg, channelId) {
    const authorId = msg.author?.id;
    if (!authorId || msg.author?.bot) return;
    const createdAt = msg.createdAt ? new Date(msg.createdAt) : null;
    if (!createdAt || createdAt.getTime() < since.getTime()) return;

    const hourKey = getHourKey(createdAt);
    const dateKey = getDayKey(createdAt);
    const cid = String(channelId || "");

    if (!hourly.has(hourKey)) hourly.set(hourKey, new Map());
    const hUsers = hourly.get(hourKey);
    if (!hUsers.has(authorId)) hUsers.set(authorId, { count: 0, channels: new Map() });
    const hu = hUsers.get(authorId);
    hu.count += 1;
    hu.channels.set(cid, (hu.channels.get(cid) || 0) + 1);

    if (!daily.has(dateKey)) daily.set(dateKey, new Map());
    const dUsers = daily.get(dateKey);
    if (!dUsers.has(authorId)) dUsers.set(authorId, { count: 0, channels: new Map() });
    const du = dUsers.get(authorId);
    du.count += 1;
    du.channels.set(cid, (du.channels.get(cid) || 0) + 1);

    userTotals.set(authorId, (userTotals.get(authorId) || 0) + 1);
  }

  let totalMessages = 0;
  for (let i = 0; i < textChannels.length; i++) {
    const ch = textChannels[i];
    const count = await fetchAllMessagesFromChannel(ch, since, (batch) => {
      for (const msg of batch) addMessage(msg, ch.id);
    });
    totalMessages += count;
    console.log("[backfill] " + (i + 1) + "/" + textChannels.length + " #" + (ch.name || ch.id) + " messaggi in range: " + count);
  }

  console.log("[backfill] Totale messaggi in range: " + totalMessages + " utenti: " + userTotals.size);

  if (dryRun) {
    console.log("[backfill] Dry-run: nessuna scrittura. Esegui con --fix per applicare.");
    client.destroy();
    await mongoose.disconnect().catch(() => {});
    return;
  }

  const safeGuildId = String(guildId);

  const hourlyOps = [];
  for (const [hourKey, users] of hourly) {
    for (const [userId, data] of users) {
      const textChannelsObj = {};
      for (const [cid, n] of data.channels) textChannelsObj[cid] = n;
      hourlyOps.push({
        updateOne: {
          filter: { guildId: safeGuildId, hourKey, userId },
          update: {
            $setOnInsert: { guildId: safeGuildId, hourKey, userId, voiceSeconds: 0, voiceChannels: {} },
            $set: { textCount: data.count, textChannels: textChannelsObj },
          },
          upsert: true,
        },
      });
    }
  }

  const dailyOps = [];
  for (const [dateKey, users] of daily) {
    for (const [userId, data] of users) {
      const textChannelsObj = {};
      for (const [cid, n] of data.channels) textChannelsObj[cid] = n;
      dailyOps.push({
        updateOne: {
          filter: { guildId: safeGuildId, dateKey, userId },
          update: {
            $setOnInsert: { guildId: safeGuildId, dateKey, userId, voiceSeconds: 0, voiceChannels: {} },
            $set: { textCount: data.count, textChannels: textChannelsObj },
          },
          upsert: true,
        },
      });
    }
  }

  const BATCH = 500;
  for (let i = 0; i < hourlyOps.length; i += BATCH) {
    await ActivityHourly.bulkWrite(hourlyOps.slice(i, i + BATCH), { ordered: false });
  }
  for (let i = 0; i < dailyOps.length; i += BATCH) {
    await ActivityDaily.bulkWrite(dailyOps.slice(i, i + BATCH), { ordered: false });
  }

  const userOps = [];
  for (const [userId, total] of userTotals) {
    userOps.push({
      updateOne: {
        filter: { guildId: safeGuildId, userId },
        update: { $inc: { "messages.total": total }, $setOnInsert: { guildId: safeGuildId, userId } },
        upsert: true,
      },
    });
  }
  for (let i = 0; i < userOps.length; i += BATCH) {
    await ActivityUser.bulkWrite(userOps.slice(i, i + BATCH), { ordered: false });
  }

  console.log("[backfill] Scritti ActivityHourly: " + hourlyOps.length + ", ActivityDaily: " + dailyOps.length + ", ActivityUser: " + userOps.length);
  console.log("[backfill] Per assegnare EXP e aggiornare livelli: node scripts/rebuild-exp-and-levels-from-activity-hourly.js --fix [--since=YYYY-MM-DDTHH:mm]");
  console.log("[backfill] Per EXP evento: node scripts/rebuildActivityExpForEvent.js");
  client.destroy();
  await mongoose.disconnect().catch(() => {});
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});