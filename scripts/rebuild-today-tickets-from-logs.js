/**
 * Ricostruisce i ticket chiusi oggi dal canale log ticket.
 *
 * Canale default: 1442569290682208296
 * Aggiorna i documenti Ticket esistenti (non crea ticket "nuovi" senza channelId).
 *
 * Uso:
 *   node scripts/rebuild-today-tickets-from-logs.js
 *   node scripts/rebuild-today-tickets-from-logs.js --channel=1442569290682208296 --guild=1329080093599076474
 *   node scripts/rebuild-today-tickets-from-logs.js --dry-run
 *   node scripts/rebuild-today-tickets-from-logs.js --atlas
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");
const IDs = require("../Vinyls/Utils/Config/ids");
const Ticket = require("../Vinyls/Schemas/Ticket/ticketSchema");

const TZ = "Europe/Rome";
const DEFAULT_GUILD_ID = IDs.guilds?.main || "1329080093599076474";
const DEFAULT_CHANNEL_ID = IDs.channels?.ticketLogs || "1442569290682208296";

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

function fieldNameNorm(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/<a?:[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getEmbedFields(embed) {
  if (Array.isArray(embed?.fields)) return embed.fields;
  if (Array.isArray(embed?.data?.fields)) return embed.data.fields;
  return [];
}

function getFieldValue(embed, includesText) {
  const wanted = String(includesText || "").toLowerCase();
  const fields = getEmbedFields(embed);
  const hit = fields.find((f) => fieldNameNorm(f?.name).includes(wanted));
  return hit?.value != null ? String(hit.value) : "";
}

function parseUserMentionId(text) {
  const m = String(text || "").match(/<@!?(\d{16,22})>/);
  return m ? String(m[1]) : null;
}

function parseTicketNumber(text) {
  const m = String(text || "").match(/(\d{1,8})/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseTranscriptTicketDocId(message) {
  const rows = Array.isArray(message?.components) ? message.components : [];
  for (const row of rows) {
    const comps = Array.isArray(row?.components) ? row.components : [];
    for (const c of comps) {
      const id = String(c?.customId || "");
      const m = id.match(/^ticket_transcript:([a-f0-9]{24})$/i);
      if (m) return String(m[1]);
    }
  }
  return null;
}

function isTicketClosedLog(message) {
  const embed = message.embeds?.[0];
  if (!embed) return false;
  const title = String(embed.title || embed.data?.title || "").toLowerCase();
  if (title.includes("ticket chiuso")) return true;
  return flattenEmbedText(embed).toLowerCase().includes("ticket chiuso");
}

function parseClosedTicketLogMessage(message, guildId) {
  const embed = message.embeds?.[0];
  if (!embed) return null;

  const ticketNumber = parseTicketNumber(getFieldValue(embed, "id ticket"));
  const userId = parseUserMentionId(getFieldValue(embed, "aperto da"));
  const closedBy = parseUserMentionId(getFieldValue(embed, "chiuso da"));
  const reason = getFieldValue(embed, "motivazione").trim() || null;
  const transcriptTicketDocId = parseTranscriptTicketDocId(message);
  const closedAt = new Date(Number(message.createdTimestamp || Date.now()));

  if (!ticketNumber && !transcriptTicketDocId) return null;
  return {
    guildId: String(guildId),
    ticketNumber: ticketNumber != null ? Number(ticketNumber) : null,
    userId: userId ? String(userId) : null,
    closedBy: closedBy ? String(closedBy) : null,
    closeReason: reason,
    closedAt,
    closeLogChannelId: String(message.channelId),
    closeLogMessageId: String(message.id),
    transcriptTicketDocId: transcriptTicketDocId || null,
  };
}

async function scanToday(channel, guildId) {
  const startMs = getRomeDayStartUtcMs(new Date());
  let scannedMessages = 0;
  let ticketClosedLogsDetected = 0;
  const rows = [];

  let before;
  let stop = false;
  while (!stop) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || batch.size === 0) break;
    const msgs = Array.from(batch.values());
    scannedMessages += msgs.length;

    for (const msg of msgs) {
      if (Number(msg.createdTimestamp || 0) < startMs) {
        stop = true;
        break;
      }
      if (!isTicketClosedLog(msg)) continue;
      ticketClosedLogsDetected += 1;
      const parsed = parseClosedTicketLogMessage(msg, guildId);
      if (parsed) rows.push(parsed);
    }

    before = msgs[msgs.length - 1]?.id;
    if (!before || msgs.length < 100) break;
  }

  const byKey = new Map();
  for (const row of rows) {
    const key = row.transcriptTicketDocId
      ? `doc:${row.transcriptTicketDocId}`
      : `num:${row.guildId}:${row.ticketNumber}`;
    byKey.set(key, row);
  }

  return {
    scannedMessages,
    ticketClosedLogsDetected,
    parsedRows: rows.length,
    uniqueRows: Array.from(byKey.values()),
  };
}

async function applyUpdates(guildId, rows, dryRun) {
  if (!rows.length) return { matchedDocs: 0, updatedDocs: 0, notFound: 0 };

  let matchedDocs = 0;
  let updatedDocs = 0;
  let notFound = 0;

  for (const row of rows) {
    const filter = row.transcriptTicketDocId
      ? { _id: row.transcriptTicketDocId, guildId: String(guildId) }
      : { guildId: String(guildId), ticketNumber: Number(row.ticketNumber) };

    const doc = await Ticket.findOne(filter, { _id: 1, open: 1 }).lean().catch(() => null);
    if (!doc?._id) {
      notFound += 1;
      continue;
    }
    matchedDocs += 1;

    if (dryRun) continue;

    const setPayload = {
      guildId: String(guildId),
      open: false,
      closedAt: row.closedAt,
      closeLogChannelId: row.closeLogChannelId,
      closeLogMessageId: row.closeLogMessageId,
    };
    if (row.userId) setPayload.userId = row.userId;
    if (row.closedBy) setPayload.closedBy = row.closedBy;
    if (row.closeReason) setPayload.closeReason = row.closeReason.slice(0, 1000);

    const res = await Ticket.updateOne({ _id: doc._id }, { $set: setPayload }).catch(() => null);
    if (Number(res?.modifiedCount || 0) > 0) updatedDocs += 1;
  }

  return { matchedDocs, updatedDocs, notFound };
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
  if (!channel?.isTextBased?.() || !channel.messages?.fetch) throw new Error(`Canale log ticket non accessibile: ${channelId}`);

  const scan = await scanToday(channel, guild.id);
  const apply = await applyUpdates(guild.id, scan.uniqueRows, dryRun);

  console.log(
    JSON.stringify(
      {
        dryRun,
        guildId: String(guild.id),
        channelId: String(channel.id),
        scannedMessages: scan.scannedMessages,
        ticketClosedLogsDetected: scan.ticketClosedLogsDetected,
        parsedRows: scan.parsedRows,
        uniqueRows: scan.uniqueRows.length,
        matchedDocs: apply.matchedDocs,
        updatedDocs: apply.updatedDocs,
        notFound: apply.notFound,
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