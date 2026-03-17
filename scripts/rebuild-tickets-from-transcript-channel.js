/**
 * Rebuild/repair Ticket documents leggendo il canale transcript/log.
 *
 * Fonte: embed "Ticket Chiuso" + bottoni (customId) inviati da ticketCloseRuntime / ticket.js
 * Canale default: 1442569290682208296
 *
 * Uso:
 *   node scripts/rebuild-tickets-from-transcript-channel.js                 (dry-run)
 *   node scripts/rebuild-tickets-from-transcript-channel.js --fix
 *   node scripts/rebuild-tickets-from-transcript-channel.js --fix --since=2026-03-13T16:30
 *   node scripts/rebuild-tickets-from-transcript-channel.js --fix --channel=1442569290682208296
 */
const path = require("path");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");

const ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

const IDs = require(path.join(ROOT, "Vinyls", "Utils", "Config", "ids"));
const Ticket = require(path.join(ROOT, "Vinyls", "Schemas", "Ticket", "ticketSchema"));

function getMongoUrl() {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    null
  );
}

function getDiscordToken() {
  return process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN || process.env.TOKEN || "";
}

function getRomeOffsetHours(monthZeroBased) {
  return monthZeroBased >= 2 && monthZeroBased <= 9 ? 2 : 1;
}

function parseSinceRome(val) {
  const s = String(val || "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):?(\d{0,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const h = Number(m[4]) || 0;
  const min = Number(m[5]) || 0;
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const off = getRomeOffsetHours(mo);
  return new Date(Date.UTC(y, mo, d, h - off, min, 0));
}

function parseArgs(argv) {
  const out = {
    dryRun: true,
    guildId: String(IDs.guilds?.main || "").trim(),
    channelId: "1442569290682208296",
    since: null,
    limit: 20000,
  };
  for (const raw of argv) {
    const a = String(raw || "").trim();
    if (!a) continue;
    if (a === "--fix") out.dryRun = false;
    if (a === "--dry-run") out.dryRun = true;
    if (a.startsWith("--channel=")) out.channelId = String(a.split("=").slice(1).join("=").trim());
    if (a.startsWith("--guild=")) out.guildId = String(a.split("=").slice(1).join("=").trim());
    if (a.startsWith("--since=")) {
      const parsed = parseSinceRome(a.split("=").slice(1).join("=").trim());
      if (parsed) out.since = parsed;
    }
    if (a.startsWith("--limit=")) out.limit = Math.max(1, Math.min(200000, Number(a.split("=").slice(1).join("=").trim()) || 20000));
  }
  return out;
}

function iterComponentCustomIds(components) {
  const rows = Array.isArray(components) ? components : [];
  const out = [];
  for (const row of rows) {
    const comps = Array.isArray(row?.components) ? row.components : [];
    for (const c of comps) {
      const id = c?.customId ?? c?.custom_id ?? c?.data?.custom_id ?? null;
      if (id) out.push(String(id));
    }
  }
  return out;
}

function extractTicketIdFromComponents(components) {
  const ids = iterComponentCustomIds(components);
  for (const id of ids) {
    const m = id.match(/^ticket_transcript:([a-fA-F0-9]{24})$/);
    if (m) return m[1];
  }
  for (const id of ids) {
    const m = id.match(/^ticket_rate:([a-fA-F0-9]{24}):\d$/);
    if (m) return m[1];
  }
  return null;
}

function getEmbedField(embed, nameIncludes) {
  const fields = Array.isArray(embed?.fields) ? embed.fields : [];
  const needle = String(nameIncludes || "").toLowerCase();
  return fields.find((f) => String(f?.name || "").toLowerCase().includes(needle)) || null;
}

function parseMentionId(value) {
  const s = String(value || "");
  const m = s.match(/<@(\d{17,20})>/);
  return m ? m[1] : null;
}

function parseTicketNumber(value) {
  const s = String(value || "").trim();
  const n = Number(s.replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDiscordTimestamp(value) {
  const s = String(value || "");
  const m = s.match(/<t:(\d{9,12}):[a-zA-Z]>/);
  if (!m) return null;
  const unix = Number(m[1]);
  if (!Number.isFinite(unix) || unix <= 0) return null;
  return new Date(unix * 1000);
}

function isTicketClosedEmbed(embed) {
  const title = String(embed?.title || "");
  if (!title) return false;
  return title.toLowerCase().includes("ticket chiuso");
}

function extractTicketDataFromEmbed(embed) {
  const idTicket = parseTicketNumber(getEmbedField(embed, "id ticket")?.value);
  const userId = parseMentionId(getEmbedField(embed, "aperto da")?.value);
  const closedBy = parseMentionId(getEmbedField(embed, "chiuso da")?.value);
  const claimedBy = parseMentionId(getEmbedField(embed, "claimato da")?.value);
  const createdAt = parseDiscordTimestamp(getEmbedField(embed, "ora apertura")?.value);
  const closedAt = parseDiscordTimestamp(getEmbedField(embed, "ora chiusura")?.value);
  const closeReasonRaw = String(getEmbedField(embed, "motivazione")?.value || "").trim();
  const closeReason = closeReasonRaw && closeReasonRaw !== "Nessuna motivazione specificata" ? closeReasonRaw : null;
  return { ticketNumber: idTicket, userId, closedBy, claimedBy, createdAt, closedAt, closeReason };
}

async function fetchMessages(channel, since, limit) {
  const out = [];
  let before = null;
  while (out.length < limit) {
    const batch = await channel.messages.fetch({ limit: 100, before: before ?? undefined }).catch(() => null);
    if (!batch || batch.size === 0) break;
    for (const [, m] of batch) {
      if (since && m.createdAt && m.createdAt.getTime() < since.getTime()) return out;
      out.push(m);
      if (out.length >= limit) break;
    }
    const last = batch.last();
    if (!last) break;
    before = last.id;
  }
  return out;
}

async function main() {
  const { dryRun, guildId, channelId, since, limit } = parseArgs(process.argv.slice(2));
  const mongoUrl = getMongoUrl();
  const token = getDiscordToken();
  if (!guildId) throw new Error("IDs.guilds.main non impostato (o pass --guild=).");
  if (!mongoUrl) throw new Error("MongoDB: imposta MONGO_URL/MONGODB_URI (o *_LOCAL).");
  if (!token) throw new Error("Discord: imposta DISCORD_TOKEN_OFFICIAL (o TOKEN).");
  if (!channelId) throw new Error("Missing --channel=<id>.");

  console.log(`[tickets] guildId=${guildId} channelId=${channelId} dryRun=${dryRun} since=${since ? since.toISOString() : "ALL"} limit=${limit}`);

  mongoose.set("strictQuery", false);
  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 20000, connectTimeoutMS: 20000 });

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  await new Promise((resolve, reject) => {
    client.once("ready", resolve);
    client.once("error", reject);
    setTimeout(() => reject(new Error("Login timeout")), 25000);
  });

  try {
    const channel = await client.channels.fetch(String(channelId)).catch(() => null);
    if (!channel?.isTextBased?.()) throw new Error("Canale transcript non trovato o non testuale.");

    const messages = await fetchMessages(channel, since, limit);
    console.log(`[tickets] messages fetched: ${messages.length}`);

    const ops = [];
    let parsed = 0;
    let skipped = 0;

    for (const msg of messages) {
      const embeds = Array.isArray(msg.embeds) ? msg.embeds : [];
      if (!embeds.length) continue;
      const ticketId = extractTicketIdFromComponents(msg.components);
      if (!ticketId) continue;

      const embed = embeds.find((e) => isTicketClosedEmbed(e)) || null;
      if (!embed) continue;

      const data = extractTicketDataFromEmbed(embed);
      if (!data.userId && !data.ticketNumber) {
        skipped++;
        continue;
      }
      parsed++;

      const update = {
        $set: {
          guildId: String(guildId),
          open: false,
          closeLogChannelId: String(channelId),
          closeLogMessageId: String(msg.id),
        },
      };
      if (data.ticketNumber != null) update.$set.ticketNumber = data.ticketNumber;
      if (data.userId) update.$set.userId = String(data.userId);
      if (data.closedBy) update.$set.closedBy = String(data.closedBy);
      if (data.claimedBy) update.$set.claimedBy = String(data.claimedBy);
      if (data.createdAt) update.$set.createdAt = data.createdAt;
      if (data.closedAt) update.$set.closedAt = data.closedAt;
      if (data.closeReason != null) update.$set.closeReason = data.closeReason;

      ops.push({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(ticketId) },
          update,
          upsert: false,
        },
      });
    }

    console.log(`[tickets] parsed=${parsed} skipped=${skipped} ops=${ops.length}`);
    if (dryRun) return;

    const BATCH = 1000;
    for (let i = 0; i < ops.length; i += BATCH) {
      await Ticket.bulkWrite(ops.slice(i, i + BATCH), { ordered: false });
    }
    console.log("[tickets] bulkWrite done.");
  } finally {
    client.destroy();
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});