/**
 * Ricostruisce l'attivita' testuale di OGGI leggendo i messaggi Discord
 * e riscrivendo i dati compact:
 * - activitydailycompact (dateKey di oggi)
 * - activityhourlycompact (tutte le ore di oggi)
 * - ActivityUser.messages (daily/weekly/total) per gli utenti coinvolti
 *
 * Uso:
 *   node scripts/rebuild-today-text-activity.js
 *   node scripts/rebuild-today-text-activity.js --guild=1329080093599076474
 *   node scripts/rebuild-today-text-activity.js --dry-run
 *   node scripts/rebuild-today-text-activity.js --atlas
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const {
  ActivityDailyCompact,
  ActivityHourlyCompact,
  ActivityUser,
} = require("../Vinyls/Schemas/Community/communitySchemas");

const TZ = "Europe/Rome";
const DEFAULT_GUILD_ID = "1329080093599076474";

function pad2(n) {
  return String(Number(n)).padStart(2, "0");
}

function romeParts(date = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type) => p.find((x) => x.type === type)?.value || "";
  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    hour: Number(pick("hour")),
    minute: Number(pick("minute")),
    second: Number(pick("second")),
  };
}

function dayKeyFromParts(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function hourKeyFromParts(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}`;
}

function getRomeDayStartUtcMs(now = new Date()) {
  const parts = romeParts(now);
  // offset stimato tra UTC e Roma in questo istante (gestisce DST)
  const approxLocalAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offsetMs = now.getTime() - approxLocalAsUtc;
  return Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0) + offsetMs;
}

function getRomeWeekKey(date = new Date()) {
  const parts = romeParts(date);
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dayNr = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 4));
  const weekNr = 1 + Math.round((utcDate - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${utcDate.getUTCFullYear()}-W${pad2(weekNr)}`;
}

function getWeekDateKeysUntilToday() {
  const now = new Date();
  const partsNow = romeParts(now);
  // Calcolo giorno settimana ISO (lun=0..dom=6)
  const utcNow = new Date(Date.UTC(partsNow.year, partsNow.month - 1, partsNow.day));
  const mondayOffset = (utcNow.getUTCDay() + 6) % 7;
  const keys = [];
  for (let i = mondayOffset; i >= 0; i -= 1) {
    const d = new Date(utcNow.getTime() - i * 24 * 60 * 60 * 1000);
    keys.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`);
  }
  return keys;
}

function resolveMongoUrl() {
  if (process.argv.includes("--atlas")) {
    return process.env.MONGO_URL || process.env.MONGODB_URI;
  }
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI
  );
}

function isSupportedTextChannel(ch) {
  if (!ch?.isTextBased?.() || !ch?.messages?.fetch) return false;
  const allowed = new Set([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
  ]);
  return allowed.has(ch.type);
}

function ensureDailyUser(users, userId) {
  if (!users[userId]) {
    users[userId] = { textCount: 0, voiceSeconds: 0, textChannels: {}, voiceChannels: {} };
  }
  return users[userId];
}

function ensureHourlyMap(hours, hourKey) {
  if (!hours[hourKey]) hours[hourKey] = {};
  return hours[hourKey];
}

async function scanGuildMessagesToday(guild) {
  const todayStartMs = getRomeDayStartUtcMs(new Date());
  const dailyUsers = {};
  const hourlyUsers = {};
  let scannedMessages = 0;
  let countedMessages = 0;

  const channels = Array.from(guild.channels.cache.values()).filter(isSupportedTextChannel);

  for (const channel of channels) {
    let before;
    let stop = false;
    while (!stop) {
      const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
      if (!batch || batch.size === 0) break;
      const list = Array.from(batch.values());
      scannedMessages += list.length;
      for (const msg of list) {
        if (!msg?.author || msg.author.bot) continue;
        const ts = Number(msg.createdTimestamp || 0);
        if (ts < todayStartMs) {
          stop = true;
          break;
        }

        const userId = String(msg.author.id);
        const channelId = String(msg.channelId);
        const parts = romeParts(new Date(ts));
        const hourKey = hourKeyFromParts(parts);

        const d = ensureDailyUser(dailyUsers, userId);
        d.textCount += 1;
        d.textChannels[channelId] = Number(d.textChannels[channelId] || 0) + 1;

        const hourBucket = ensureHourlyMap(hourlyUsers, hourKey);
        const h = ensureDailyUser(hourBucket, userId);
        h.textCount += 1;
        h.textChannels[channelId] = Number(h.textChannels[channelId] || 0) + 1;

        countedMessages += 1;
      }
      before = list[list.length - 1]?.id;
      if (!before) break;
      if (list.length < 100) break;
    }
  }

  return { dailyUsers, hourlyUsers, scannedMessages, countedMessages };
}

async function upsertCompactToday(guildId, dateKey, dailyUsers, hourlyUsers, { dryRun }) {
  if (dryRun) return;

  await ActivityDailyCompact.updateOne(
    { guildId: String(guildId), dateKey: String(dateKey) },
    { $set: { guildId: String(guildId), dateKey: String(dateKey), users: dailyUsers } },
    { upsert: true },
  ).catch(() => null);

  await ActivityHourlyCompact.deleteMany({ guildId: String(guildId), hourKey: new RegExp(`^${dateKey}T`) }).catch(() => null);

  const ops = Object.entries(hourlyUsers).map(([hourKey, users]) => ({
    updateOne: {
      filter: { guildId: String(guildId), hourKey: String(hourKey) },
      update: { $set: { guildId: String(guildId), hourKey: String(hourKey), users } },
      upsert: true,
    },
  }));
  if (ops.length) {
    await ActivityHourlyCompact.bulkWrite(ops, { ordered: false }).catch(() => null);
  }
}

async function rebuildActivityUserCounters(guildId, dateKey, dailyUsers, { dryRun }) {
  const weekKey = getRomeWeekKey(new Date());
  const weekDateKeys = getWeekDateKeysUntilToday();

  // weekly from compact daily docs
  const weekDocs = await ActivityDailyCompact.find({
    guildId: String(guildId),
    dateKey: { $in: weekDateKeys },
  })
    .select("users")
    .lean()
    .catch(() => []);

  const weeklyByUser = new Map();
  for (const doc of weekDocs) {
    const users = doc?.users && typeof doc.users === "object" ? doc.users : {};
    for (const [uid, payload] of Object.entries(users)) {
      const add = Number(payload?.textCount || 0);
      if (!add) continue;
      weeklyByUser.set(String(uid), Number(weeklyByUser.get(String(uid)) || 0) + add);
    }
  }

  const allUserIds = Array.from(new Set([
    ...Object.keys(dailyUsers || {}),
    ...Array.from(weeklyByUser.keys()),
  ]));
  if (!allUserIds.length) return;

  const existing = await ActivityUser.find({
    guildId: String(guildId),
    userId: { $in: allUserIds },
  })
    .lean()
    .catch(() => []);
  const byUser = new Map(existing.map((d) => [String(d.userId), d]));

  if (dryRun) return;

  const ops = [];
  for (const uid of allUserIds) {
    const old = byUser.get(uid) || {};
    const oldMessages = old.messages || {};
    const oldTotal = Number(oldMessages.total || 0);
    const oldDaily = Number(oldMessages.daily || 0);
    const oldDailyKey = String(oldMessages.dailyKey || "");

    const newDaily = Number(dailyUsers?.[uid]?.textCount || 0);
    const newWeekly = Number(weeklyByUser.get(uid) || 0);
    const newTotal = oldDailyKey === dateKey
      ? Math.max(0, oldTotal - oldDaily + newDaily)
      : Math.max(0, oldTotal + newDaily);

    ops.push({
      updateOne: {
        filter: { guildId: String(guildId), userId: String(uid) },
        update: {
          $setOnInsert: { guildId: String(guildId), userId: String(uid) },
          $set: {
            "messages.dailyKey": dateKey,
            "messages.daily": newDaily,
            "messages.weeklyKey": weekKey,
            "messages.weekly": newWeekly,
            "messages.total": newTotal,
          },
        },
        upsert: true,
      },
    });
  }
  if (ops.length) {
    await ActivityUser.bulkWrite(ops, { ordered: false }).catch(() => null);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const guildArg = process.argv.find((a) => String(a).startsWith("--guild="));
  const guildId = guildArg ? String(guildArg.split("=").slice(1).join("=")).trim() : DEFAULT_GUILD_ID;

  const mongoUrl = resolveMongoUrl();
  const token = process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN;
  if (!mongoUrl) throw new Error("MONGO_URL/MONGO_URL_LOCAL mancante");
  if (!token) throw new Error("DISCORD_TOKEN_OFFICIAL/DISCORD_TOKEN mancante");

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });
  await client.login(token);

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new Error(`Guild non trovata: ${guildId}`);
  await guild.channels.fetch().catch(() => null);

  const dayKey = dayKeyFromParts(romeParts(new Date()));
  const scan = await scanGuildMessagesToday(guild);

  await upsertCompactToday(guild.id, dayKey, scan.dailyUsers, scan.hourlyUsers, { dryRun });
  await rebuildActivityUserCounters(guild.id, dayKey, scan.dailyUsers, { dryRun });

  const usersCount = Object.keys(scan.dailyUsers).length;
  const hoursCount = Object.keys(scan.hourlyUsers).length;

  console.log(
    JSON.stringify(
      {
        dryRun,
        guildId: guild.id,
        dayKey,
        channelsScanned: Array.from(guild.channels.cache.values()).filter(isSupportedTextChannel).length,
        scannedMessages: scan.scannedMessages,
        countedMessages: scan.countedMessages,
        usersCount,
        hoursCount,
      },
      null,
      2,
    ),
  );

  await client.destroy();
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});