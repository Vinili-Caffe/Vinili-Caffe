/**
 * Ricostruisce gli event reward assegnati oggi leggendo il canale log:
 * 1477994178230095903
 *
 * Aggiorna:
 * - ActivityEventReward (guildId, userId, rewardType, tier)
 *
 * Uso:
 *   node scripts/rebuild-today-event-rewards.js
 *   node scripts/rebuild-today-event-rewards.js --channel=1477994178230095903 --guild=1329080093599076474
 *   node scripts/rebuild-today-event-rewards.js --dry-run
 *   node scripts/rebuild-today-event-rewards.js --atlas
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
  const out = [];
  const push = (v) => {
    if (typeof v === "string" && v.trim()) out.push(v);
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
  return out.join("\n");
}

function normalizeLabel(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTier(text) {
  const m = String(text || "").match(/tier\s+(\d{1,2})/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseUserId(text) {
  const m = String(text || "").match(/<@!?(\d{16,22})>/);
  return m ? String(m[1]) : null;
}

function getFieldValueByName(embed, nameIncludes) {
  const fields = Array.isArray(embed?.fields) ? embed.fields : (Array.isArray(embed?.data?.fields) ? embed.data.fields : []);
  const hit = fields.find((f) => String(f?.name || "").toLowerCase().includes(String(nameIncludes || "").toLowerCase()));
  return hit?.value != null ? String(hit.value) : "";
}

function mapLabelToRewardType(label) {
  const n = normalizeLabel(label);
  if (n.includes("supporter")) return "supporter";
  if (n.includes("verificato") || n.includes("verificata")) return "verificato";
  if (n.includes("guilded")) return "guilded";
  if (n.includes("inviti")) return "invite";
  if (n.includes("discadia") || n.includes("voto")) return "voter";
  if (n.includes("disboard") || n.includes("recensione")) return "recensione";
  return null;
}

function extractRewardType(detail, label) {
  const fromDetail = String(detail || "").match(/evento\s+reward:\s*([a-z_]+)/i);
  if (fromDetail?.[1]) return String(fromDetail[1]).toLowerCase();
  return mapLabelToRewardType(label);
}

function isRewardAssignedMessage(message) {
  const embed = message.embeds?.[0];
  if (!embed) return false;
  const title = String(embed.title || embed.data?.title || "").toLowerCase();
  if (title.includes("premio evento assegnato")) return true;
  const text = flattenEmbedText(embed).toLowerCase();
  return text.includes("premio evento assegnato");
}

function parseEventRewardFromMessage(message, guildId) {
  const embed = message.embeds?.[0];
  if (!embed) return null;
  const text = flattenEmbedText(embed);
  const desc = String(embed.description || embed.data?.description || "");
  const tipo = getFieldValueByName(embed, "tipo");
  const dettaglio = getFieldValueByName(embed, "dettaglio");

  const userId = parseUserId(desc) || parseUserId(text);
  const rewardType = extractRewardType(dettaglio, tipo);
  const tier = parseTier(dettaglio);
  if (!isValidGuildUserId(String(guildId), String(userId || ""))) return null;
  if (!rewardType) return null;

  return {
    guildId: String(guildId),
    userId: String(userId),
    rewardType: String(rewardType),
    tier: tier != null ? Number(tier) : null,
  };
}

async function scanToday(channel, guildId) {
  const dayStartMs = getRomeDayStartUtcMs(new Date());
  let scannedMessages = 0;
  let rewardMessagesDetected = 0;
  const rows = [];

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
      if (!isRewardAssignedMessage(message)) continue;
      rewardMessagesDetected += 1;
      const parsed = parseEventRewardFromMessage(message, guildId);
      if (parsed) rows.push(parsed);
    }

    before = list[list.length - 1]?.id;
    if (!before || list.length < 100) break;
  }

  const unique = new Map();
  for (const row of rows) {
    const key = `${row.guildId}:${row.userId}:${row.rewardType}:${row.tier == null ? "null" : String(row.tier)}`;
    unique.set(key, row);
  }

  return {
    scannedMessages,
    rewardMessagesDetected,
    parsedRows: rows.length,
    uniqueRows: Array.from(unique.values()),
  };
}

async function applyRewards(uniqueRows, dryRun) {
  if (!uniqueRows.length) return { upserts: 0 };
  if (dryRun) return { upserts: uniqueRows.length };
  const ops = uniqueRows.map((row) => ({
    updateOne: {
      filter: {
        guildId: row.guildId,
        userId: row.userId,
        rewardType: row.rewardType,
        tier: row.tier == null ? null : Number(row.tier),
      },
      update: {
        $setOnInsert: {
          guildId: row.guildId,
          userId: row.userId,
          rewardType: row.rewardType,
          tier: row.tier == null ? null : Number(row.tier),
        },
      },
      upsert: true,
    },
  }));
  const res = await ActivityEventReward.bulkWrite(ops, { ordered: false }).catch(() => null);
  return { upserts: Number(res?.upsertedCount || 0) };
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

  const scan = await scanToday(channel, guild.id);
  const apply = await applyRewards(scan.uniqueRows, dryRun);

  console.log(
    JSON.stringify(
      {
        dryRun,
        guildId: String(guild.id),
        channelId: String(channel.id),
        scannedMessages: scan.scannedMessages,
        rewardMessagesDetected: scan.rewardMessagesDetected,
        parsedRows: scan.parsedRows,
        uniqueRows: scan.uniqueRows.length,
        upserts: apply.upserts,
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