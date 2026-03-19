/**
 * Recupera dal canale quote/skullboard i post di oggi e riallinea:
 * - QuoteCount (post totali quote)
 * - SkullboardPost (mappatura messaggio originale -> post in skullboard)
 *
 * Uso:
 *   node scripts/rebuild-today-quotes-skullboard.js
 *   node scripts/rebuild-today-quotes-skullboard.js --channel=1468540884537573479 --guild=1329080093599076474
 *   node scripts/rebuild-today-quotes-skullboard.js --dry-run
 *   node scripts/rebuild-today-quotes-skullboard.js --atlas
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");
const IDs = require("../Vinyls/Utils/Config/ids");
const QuoteCount = require("../Vinyls/Schemas/Quote/quoteCountSchema");
const { SkullboardPost } = require("../Vinyls/Schemas/Community/communitySchemas");

const TZ = "Europe/Rome";
const DEFAULT_GUILD_ID = IDs.guilds?.main || "1329080093599076474";
const DEFAULT_CHANNEL_ID = "1468540884537573479";

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

function flattenEmbedText(embed) {
  if (!embed) return "";
  const parts = [];
  const push = (v) => {
    if (typeof v === "string" && v.trim()) parts.push(v);
  };
  push(embed.title);
  push(embed.description);
  push(embed.footer?.text);
  if (Array.isArray(embed.fields)) {
    for (const f of embed.fields) {
      push(f?.name);
      push(f?.value);
    }
  }
  const data = embed.data || embed._data;
  if (data) {
    push(data.title);
    push(data.description);
    push(data.footer?.text);
    if (Array.isArray(data.fields)) {
      for (const f of data.fields) {
        push(f?.name);
        push(f?.value);
      }
    }
  }
  return parts.join("\n");
}

function extractQuoteTotalFromMessage(message) {
  const text = `${message.content || ""}\n${flattenEmbedText(message.embeds?.[0])}`;
  const m = text.match(/post\s+totali\s*:\s*(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractSkullSourceMessageId(message) {
  // field "Messaggio" contiene [Cliccami](https://discord.com/channels/guild/ch/msgId)
  const embed = message.embeds?.[0];
  const fields = Array.isArray(embed?.fields) ? embed.fields : (Array.isArray(embed?.data?.fields) ? embed.data.fields : []);
  const msgField = fields.find((f) => /messaggio/i.test(String(f?.name || "")));
  const raw = String(msgField?.value || "");
  const m = raw.match(/discord\.com\/channels\/\d+\/\d+\/(\d{16,22})/i);
  return m ? String(m[1]) : null;
}

function isLikelyQuotePost(message) {
  const embed = message.embeds?.[0];
  const title = String(embed?.title || embed?.data?.title || "").toLowerCase();
  const footer = String(embed?.footer?.text || embed?.data?.footer?.text || "").toLowerCase();
  return title.includes("nuova quotazione") || footer.includes("post totali");
}

function isLikelySkullPost(message) {
  const embed = message.embeds?.[0];
  const text = flattenEmbedText(embed).toLowerCase();
  return text.includes("skullboard") && text.includes("messaggio");
}

async function scanToday(channel) {
  const dayStartMs = getRomeDayStartUtcMs(new Date());
  let scannedMessages = 0;
  let quotePostsDetected = 0;
  let skullPostsDetected = 0;
  let maxQuoteTotal = 0;
  const skullMappings = [];

  let before;
  let stop = false;
  while (!stop) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || batch.size === 0) break;
    const list = Array.from(batch.values());
    scannedMessages += list.length;

    for (const message of list) {
      if (Number(message.createdTimestamp || 0) < dayStartMs) {
        stop = true;
        break;
      }
      if (!message.embeds?.length) continue;

      if (isLikelyQuotePost(message)) {
        const total = extractQuoteTotalFromMessage(message);
        if (Number.isFinite(total)) {
          quotePostsDetected += 1;
          maxQuoteTotal = Math.max(maxQuoteTotal, Number(total));
        }
      }

      if (isLikelySkullPost(message)) {
        const sourceMessageId = extractSkullSourceMessageId(message);
        if (sourceMessageId) {
          skullPostsDetected += 1;
          skullMappings.push({
            sourceMessageId: String(sourceMessageId),
            postMessageId: String(message.id),
          });
        }
      }
    }

    before = list[list.length - 1]?.id;
    if (!before || list.length < 100) break;
  }

  return { scannedMessages, quotePostsDetected, skullPostsDetected, maxQuoteTotal, skullMappings };
}

async function applyRecovery(guildId, scan, { dryRun }) {
  let quoteCountUpdated = false;
  let skullUpserts = 0;

  const existing = await QuoteCount.findOne({ guildId: String(guildId) }).lean().catch(() => null);
  const existingCount = Number(existing?.count || 0);
  const targetCount = Math.max(existingCount, Number(scan.maxQuoteTotal || 0));

  if (!dryRun && targetCount > existingCount) {
    await QuoteCount.updateOne(
      { guildId: String(guildId) },
      { $set: { count: targetCount } },
      { upsert: true },
    ).catch(() => null);
    quoteCountUpdated = true;
  }

  if (!dryRun && scan.skullMappings.length > 0) {
    const ops = scan.skullMappings.map((x) => ({
      updateOne: {
        filter: { guildId: String(guildId), messageId: String(x.sourceMessageId) },
        update: { $set: { guildId: String(guildId), messageId: String(x.sourceMessageId), postMessageId: String(x.postMessageId) } },
        upsert: true,
      },
    }));
    const res = await SkullboardPost.bulkWrite(ops, { ordered: false }).catch(() => null);
    skullUpserts = Number(res?.upsertedCount || 0) + Number(res?.modifiedCount || 0);
  }

  return {
    existingQuoteCount: existingCount,
    targetQuoteCount: targetCount,
    quoteCountUpdated,
    skullUpserts,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const guildId = getArg("guild", String(DEFAULT_GUILD_ID));
  const channelId = getArg("channel", String(DEFAULT_CHANNEL_ID));

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

  const scan = await scanToday(channel);
  const apply = await applyRecovery(guild.id, scan, { dryRun });

  console.log(
    JSON.stringify(
      {
        dryRun,
        guildId: String(guild.id),
        channelId: String(channel.id),
        scannedMessages: scan.scannedMessages,
        quotePostsDetected: scan.quotePostsDetected,
        skullPostsDetected: scan.skullPostsDetected,
        maxQuoteTotalDetected: scan.maxQuoteTotal,
        skullMappingsDetected: scan.skullMappings.length,
        ...apply,
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