/**
 * Ricostruisce ActivityEventReward dai log premio evento di oggi.
 *
 * Sorgente canale log:
 *   1477994178230095903
 *
 * Uso:
 *   node scripts/rebuild-today-activityeventrewards-from-log.js
 *   node scripts/rebuild-today-activityeventrewards-from-log.js --dry-run
 *   node scripts/rebuild-today-activityeventrewards-from-log.js --atlas
 *   node scripts/rebuild-today-activityeventrewards-from-log.js --guild=1329080093599076474
 *   node scripts/rebuild-today-activityeventrewards-from-log.js --channel=1477994178230095903
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");
const IDs = require("../Vinyls/Utils/Config/ids");
const { ActivityEventReward } = require("../Vinyls/Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../Vinyls/Utils/DB/validateWriteIds");

const TZ = "Europe/Rome";
const DEFAULT_GUILD_ID = IDs.guilds?.main || "1329080093599076474";
const DEFAULT_CHANNEL_ID = "1477994178230095903";

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

function parseUserIdFromText(text) {
  const s = String(text || "");
  const m = s.match(/<@!?(\d{15,21})>/);
  return m ? String(m[1]) : null;
}

function normalizeRewardTypeFromLabel(label) {
  const t = String(label || "").trim().toLowerCase();
  if (!t) return null;
  if (t.includes("voto discadia")) return "voter";
  if (t.includes("recensione")) return "recensione";
  if (t.includes("supporter")) return "supporter";
  if (t.includes("verificato")) return "verificato";
  if (t.includes("guilded")) return "guilded";
  if (t.includes("inviti")) return "invite";
  return null;
}

function parseRewardTypeAndTier(typeLabel, detail) {
  const detailText = String(detail || "");
  const matchDetail = detailText.match(/evento\s*reward:\s*([a-z_]+)(?:\s+tier\s+(\d+))?/i);
  if (matchDetail) {
    const rewardType = String(matchDetail[1] || "").toLowerCase();
    const tier = matchDetail[2] ? Number(matchDetail[2]) : null;
    return { rewardType, tier: Number.isFinite(tier) ? tier : null };
  }
  const fromLabel = normalizeRewardTypeFromLabel(typeLabel);
  return { rewardType: fromLabel, tier: null };
}

function parseEntryFromMessage(message) {
  const embed = message?.embeds?.[0];
  if (!embed) return null;
  const title = String(embed.title || "");
  if (!/premio\s+evento\s+assegnato/i.test(title)) return null;

  const description = String(embed.description || "");
  const userId = parseUserIdFromText(description) || parseUserIdFromText(message?.content);
  if (!userId) return null;

  const fields = Array.isArray(embed.fields) ? embed.fields : [];
  const typeField = fields.find((f) => /tipo/i.test(String(f?.name || "")));
  const detailField = fields.find((f) => /dettaglio/i.test(String(f?.name || "")));
  const typeLabel = String(typeField?.value || "");
  const detail = String(detailField?.value || "");
  const parsedReward = parseRewardTypeAndTier(typeLabel, detail);
  if (!parsedReward.rewardType) return null;

  const caseKey = `${userId}:${parsedReward.rewardType}:${parsedReward.tier == null ? "null" : String(parsedReward.tier)}`;
  return {
    guildId: String(message.guildId || ""),
    userId,
    rewardType: parsedReward.rewardType,
    tier: parsedReward.tier,
    messageId: String(message.id || ""),
    ts: Number(message.createdTimestamp || 0),
    caseKey,
  };
}

async function scanTodayEntries(channel, startMs) {
  const byKey = new Map();
  let scannedMessages = 0;
  let matchedLogs = 0;
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
      const entry = parseEntryFromMessage(msg);
      if (!entry) continue;
      matchedLogs += 1;
      const prev = byKey.get(entry.caseKey);
      if (!prev || entry.ts > prev.ts) byKey.set(entry.caseKey, entry);
    }

    before = list[list.length - 1]?.id;
    if (!before || list.length < 100) break;
  }

  return { byKey, scannedMessages, matchedLogs };
}

async function applyEntries(guildId, entries, dryRun) {
  let upserted = 0;
  let skippedInvalid = 0;
  const ops = [];

  for (const entry of entries) {
    if (!isValidGuildUserId(guildId, entry.userId)) {
      skippedInvalid += 1;
      continue;
    }
    upserted += 1;
    if (dryRun) continue;
    ops.push({
      updateOne: {
        filter: {
          guildId: String(guildId),
          userId: String(entry.userId),
          rewardType: String(entry.rewardType),
          tier: entry.tier == null ? null : Number(entry.tier),
        },
        update: {
          $setOnInsert: {
            guildId: String(guildId),
            userId: String(entry.userId),
            rewardType: String(entry.rewardType),
            tier: entry.tier == null ? null : Number(entry.tier),
          },
        },
        upsert: true,
      },
    });
  }

  if (!dryRun && ops.length) {
    await ActivityEventReward.bulkWrite(ops, { ordered: false }).catch(() => null);
  }
  return { upserted, skippedInvalid };
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
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
  await client.login(token);

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new Error(`Guild non trovata: ${guildId}`);
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.() || !channel.messages?.fetch) throw new Error(`Canale non accessibile: ${channelId}`);

  const startMs = getRomeDayStartUtcMs(new Date());
  const scan = await scanTodayEntries(channel, startMs);
  const entries = Array.from(scan.byKey.values());
  const applied = await applyEntries(String(guild.id), entries, dryRun);

  console.log(
    JSON.stringify(
      {
        dryRun,
        guildId: String(guild.id),
        channelId: String(channelId),
        scanStartAt: new Date(startMs).toISOString(),
        scannedMessages: scan.scannedMessages,
        matchedLogMessages: scan.matchedLogs,
        uniqueRewardsDetected: entries.length,
        upsertedRewards: applied.upserted,
        skippedInvalid: applied.skippedInvalid,
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