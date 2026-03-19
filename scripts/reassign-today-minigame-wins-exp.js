/**
 * Riassegna EXP ai vincitori minigame leggendo i messaggi di oggi nel canale indicato.
 * Usa la stessa logica exp globale del bot (addExpWithLevel), quindi level-up/ruoli sono gestiti automaticamente.
 *
 * ATTENZIONE: lo script NON è idempotente. Se lo rilanci senza controllo, può riassegnare EXP.
 *
 * Uso:
 *   node scripts/reassign-today-minigame-wins-exp.js --dry-run
 *   node scripts/reassign-today-minigame-wins-exp.js --atlas
 *   node scripts/reassign-today-minigame-wins-exp.js --channel=1442569130573303898
 *   node scripts/reassign-today-minigame-wins-exp.js --guild=1329080093599076474
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");
const IDs = require("../Vinyls/Utils/Config/ids");
const { addExpWithLevel } = require("../Vinyls/Services/Community/expService");
const { isValidGuildUserId } = require("../Vinyls/Utils/DB/validateWriteIds");

const TZ = "Europe/Rome";
const DEFAULT_GUILD_ID = IDs.guilds?.main || "1329080093599076474";
const DEFAULT_CHANNEL_ID = "1442569130573303898";

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
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const pick = (type) => Number(p.find((x) => x.type === type)?.value || 0);
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

function parseWinnerFromText(text) {
  const s = String(text || "");
  const m = s.match(/<@!?(\d{15,21})>/);
  return m ? String(m[1]) : null;
}

function parseExpFromText(text) {
  const s = String(text || "");
  const m = s.match(/guadagnat[oa]\s+\*{0,2}(\d+)\s*exp/i) || s.match(/\*{0,2}(\d+)\s*exp\*{0,2}/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

function parseWinEntry(msg) {
  const embed = msg?.embeds?.[0];
  if (!embed) return null;
  const title = String(embed.title || "");
  if (!/un\s+utente\s+ha\s+vinto/i.test(title)) return null;
  const description = String(embed.description || "");
  const winnerId = parseWinnerFromText(description) || parseWinnerFromText(msg.content);
  const exp = parseExpFromText(description);
  if (!winnerId || !Number.isFinite(exp) || exp <= 0) return null;
  return {
    userId: winnerId,
    exp,
    messageId: String(msg.id || ""),
    ts: Number(msg.createdTimestamp || 0),
  };
}

async function scanTodayWins(channel, startMs) {
  const entries = [];
  const seenMessageIds = new Set();
  let scannedMessages = 0;
  let matchedWinMessages = 0;
  let before;
  let stop = false;

  while (!stop) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || batch.size === 0) break;
    const list = Array.from(batch.values());
    scannedMessages += list.length;

    for (const msg of list) {
      const ts = Number(msg.createdTimestamp || 0);
      if (ts < startMs) {
        stop = true;
        break;
      }
      const entry = parseWinEntry(msg);
      if (!entry) continue;
      if (seenMessageIds.has(entry.messageId)) continue;
      seenMessageIds.add(entry.messageId);
      entries.push(entry);
      matchedWinMessages += 1;
    }

    before = list[list.length - 1]?.id;
    if (!before || list.length < 100) break;
  }

  return { entries, scannedMessages, matchedWinMessages };
}

async function applyExpFromEntries(guild, entries, dryRun) {
  let processed = 0;
  let awarded = 0;
  let skippedInvalid = 0;
  let totalExpAssigned = 0;
  const byUser = new Map();

  for (const row of entries) {
    processed += 1;
    const userId = String(row.userId || "");
    const exp = Math.max(0, Math.floor(Number(row.exp || 0)));
    if (!isValidGuildUserId(String(guild.id), userId) || exp <= 0) {
      skippedInvalid += 1;
      continue;
    }
    byUser.set(userId, Number(byUser.get(userId) || 0) + exp);
    awarded += 1;
  }

  if (!dryRun) {
    for (const [userId, exp] of byUser.entries()) {
      totalExpAssigned += exp;
      await addExpWithLevel(guild, userId, exp, false, true, { source: "minigame-reassign" }).catch(() => null);
    }
  } else {
    for (const exp of byUser.values()) totalExpAssigned += exp;
  }

  return {
    processedWinEntries: processed,
    uniqueWinners: byUser.size,
    awardedWinEntries: awarded,
    skippedInvalid,
    totalExpAssigned,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const guildId = getArg("guild", String(DEFAULT_GUILD_ID));
  const channelId = getArg("channel", DEFAULT_CHANNEL_ID);

  const mongoUrl = resolveMongoUrl();
  const token = process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN;
  if (!mongoUrl) throw new Error("Mongo URL mancante");
  if (!token) throw new Error("Discord token mancante");

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers] });
  await client.login(token);

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new Error(`Guild non trovata: ${guildId}`);
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.() || !channel.messages?.fetch) throw new Error(`Canale non accessibile: ${channelId}`);

  const startMs = getRomeDayStartUtcMs(new Date());
  const scan = await scanTodayWins(channel, startMs);
  const apply = await applyExpFromEntries(guild, scan.entries, dryRun);

  console.log(
    JSON.stringify(
      {
        dryRun,
        guildId: String(guild.id),
        channelId: String(channelId),
        scanStartAt: new Date(startMs).toISOString(),
        scannedMessages: scan.scannedMessages,
        matchedWinMessages: scan.matchedWinMessages,
        ...apply,
      },
      null,
      2,
    ),
  );

  await client.destroy();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});