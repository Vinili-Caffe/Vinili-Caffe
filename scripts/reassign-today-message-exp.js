/**
 * Riassegna EXP messaggi di oggi a tutti gli utenti del server,
 * rileggendo i messaggi Discord e applicando la stessa logica EXP del bot.
 *
 * Uso:
 *   node scripts/reassign-today-message-exp.js
 *   node scripts/reassign-today-message-exp.js --guild=1329080093599076474
 *   node scripts/reassign-today-message-exp.js --dry-run
 *   node scripts/reassign-today-message-exp.js --atlas
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const IDs = require("../Vinyls/Utils/Config/ids");
const { MESSAGE_EXP, addExpWithLevel, shouldIgnoreExpForMember } = require("../Vinyls/Services/Community/expService");
const { isChannelInTicketCategory } = require("../Vinyls/Utils/Ticket/ticketCategoryUtils");

const TZ = "Europe/Rome";
const DEFAULT_GUILD_ID = IDs.guilds?.main || "1329080093599076474";

function getArg(name, fallback = "") {
  const hit = process.argv.find((a) => String(a).startsWith(`--${name}=`));
  if (!hit) return fallback;
  return String(hit.split("=").slice(1).join("=")).trim();
}

function resolveMongoUrl() {
  if (process.argv.includes("--atlas")) return process.env.MONGO_URL || process.env.MONGODB_URI;
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI
  );
}

function getRomeDayStartUtcMs(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const pick = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  const y = pick("year");
  const m = pick("month");
  const d = pick("day");
  const hh = pick("hour");
  const mm = pick("minute");
  const ss = pick("second");
  const approxLocalAsUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  const offsetMs = now.getTime() - approxLocalAsUtc;
  return Date.UTC(y, m - 1, d, 0, 0, 0) + offsetMs;
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

function isExcludedActivityChannel(channelLike) {
  const blocked = new Set([IDs.channels?.ticket, IDs.channels?.ticketLogs].filter(Boolean).map(String));
  const id = String(channelLike?.id || "");
  if (id && blocked.has(id)) return true;
  return isChannelInTicketCategory(channelLike);
}

async function scanTodayMessages(guild) {
  const startMs = getRomeDayStartUtcMs(new Date());
  await guild.channels.fetch().catch(() => null);
  await guild.channels.fetchActiveThreads?.().catch(() => null);

  const allChannels = Array.from(guild.channels.cache.values());
  const channels = allChannels
    .filter(isSupportedTextChannel)
    .filter((c) => !isExcludedActivityChannel(c));

  const countByUser = new Map();
  let scannedMessages = 0;
  let eligibleMessages = 0;

  const memberCache = new Map();
  const ignoreCache = new Map(); // userId:channelId -> bool

  async function getMember(userId) {
    const key = String(userId);
    if (memberCache.has(key)) return memberCache.get(key);
    const member = await guild.members.fetch(key).catch(() => null);
    memberCache.set(key, member);
    return member;
  }

  async function isIgnored(userId, channelId) {
    const key = `${String(userId)}:${String(channelId)}`;
    if (ignoreCache.has(key)) return ignoreCache.get(key);
    const member = await getMember(userId);
    const ignored = await shouldIgnoreExpForMember({
      guildId: String(guild.id),
      member,
      channelId: String(channelId),
    }).catch(() => true);
    ignoreCache.set(key, Boolean(ignored));
    return Boolean(ignored);
  }

  for (const channel of channels) {
    let before;
    let stop = false;
    while (!stop) {
      const batch = await channel.messages.fetch({
        limit: 100,
        ...(before ? { before } : {}),
      }).catch(() => null);
      if (!batch || batch.size === 0) break;
      const msgs = Array.from(batch.values());
      scannedMessages += msgs.length;

      for (const msg of msgs) {
        const ts = Number(msg.createdTimestamp || 0);
        if (ts < startMs) {
          stop = true;
          break;
        }
        if (!msg?.author || msg.author.bot) continue;
        const userId = String(msg.author.id);
        const channelId = String(msg.channelId);
        const ignored = await isIgnored(userId, channelId);
        if (ignored) continue;
        eligibleMessages += 1;
        countByUser.set(userId, Number(countByUser.get(userId) || 0) + 1);
      }

      before = msgs[msgs.length - 1]?.id;
      if (!before || msgs.length < 100) break;
    }
  }

  return {
    totalChannelsInCache: allChannels.length,
    scannedChannels: channels.length,
    scannedMessages,
    eligibleMessages,
    countByUser,
  };
}

async function applyExp(guild, countByUser, dryRun) {
  let usersProcessed = 0;
  let usersAwarded = 0;
  let totalBaseExp = 0;

  for (const [userId, msgCountRaw] of countByUser.entries()) {
    usersProcessed += 1;
    const msgCount = Math.max(0, Number(msgCountRaw || 0));
    if (msgCount <= 0) continue;
    const baseExp = msgCount * Number(MESSAGE_EXP || 0);
    if (baseExp <= 0) continue;
    totalBaseExp += baseExp;
    usersAwarded += 1;
    if (!dryRun) {
      await addExpWithLevel(
        guild,
        String(userId),
        baseExp,
        true,
        true,
        { source: "activity" },
      ).catch(() => null);
    }
  }

  return { usersProcessed, usersAwarded, totalBaseExp };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const guildId = getArg("guild", String(DEFAULT_GUILD_ID));
  const mongoUrl = resolveMongoUrl();
  const token = process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN;
  if (!mongoUrl) throw new Error("Mongo URL mancante");
  if (!token) throw new Error("Discord token mancante");

  await mongoose.connect(mongoUrl, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers],
  });
  await client.login(token);

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new Error(`Guild non trovata: ${guildId}`);

  const scan = await scanTodayMessages(guild);
  const apply = await applyExp(guild, scan.countByUser, dryRun);

  console.log(
    JSON.stringify(
      {
        dryRun,
        guildId: String(guild.id),
        totalChannelsInCache: scan.totalChannelsInCache,
        scannedChannels: scan.scannedChannels,
        scannedMessages: scan.scannedMessages,
        eligibleMessages: scan.eligibleMessages,
        uniqueUsersDetected: scan.countByUser.size,
        usersProcessed: apply.usersProcessed,
        usersAwarded: apply.usersAwarded,
        baseExpAssigned: apply.totalBaseExp,
        messageExpUnit: Number(MESSAGE_EXP || 0),
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