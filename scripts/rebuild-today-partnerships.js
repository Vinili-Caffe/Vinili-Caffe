/**
 * Ricostruisce le partnership di oggi dal canale partnership e aggiorna:
 * - Staff.partnerCount
 * - Staff.partnerActions[]
 *
 * Canale default: 1442569193470824448
 *
 * Uso:
 *   node scripts/rebuild-today-partnerships.js
 *   node scripts/rebuild-today-partnerships.js --channel=1442569193470824448 --guild=1329080093599076474
 *   node scripts/rebuild-today-partnerships.js --dry-run
 *   node scripts/rebuild-today-partnerships.js --atlas
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");
const IDs = require("../Vinyls/Utils/Config/ids");
const Staff = require("../Vinyls/Schemas/Staff/staffSchema");
const { isValidGuildUserId } = require("../Vinyls/Utils/DB/validateWriteIds");

const TZ = "Europe/Rome";
const DEFAULT_GUILD_ID = IDs.guilds?.main || "1329080093599076474";
const DEFAULT_CHANNEL_ID = IDs.channels?.partnerships || "1442569193470824448";

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
  push(embed.author?.name);
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
    push(data.author?.name);
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

function isPartnershipDoneEmbedMessage(message) {
  const embed = message?.embeds?.[0];
  if (!embed) return false;
  const txt = flattenEmbedText(embed).toLowerCase();
  return txt.includes("partner effettuata");
}

function extractManagerId(text) {
  const m = String(text || "").match(/manager\s*:\s*<@!?(\d{16,22})>/i);
  return m ? String(m[1]) : null;
}

function extractInvite(text) {
  const m = String(text || "").match(/https?:\/\/(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]+/i);
  return m ? String(m[0]) : null;
}

function extractServerNameFromEmbed(message) {
  const embed = message?.embeds?.[0];
  const footer = String(embed?.footer?.text || embed?.data?.footer?.text || "").trim();
  return footer || "Sconosciuto";
}

async function scanToday(channel) {
  const dayStartMs = getRomeDayStartUtcMs(new Date());
  let scannedMessages = 0;
  let partnershipEmbedsDetected = 0;
  const list = [];

  let before;
  let stop = false;
  while (!stop) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || batch.size === 0) break;
    const msgs = Array.from(batch.values());
    scannedMessages += msgs.length;
    for (const m of msgs) {
      if (Number(m.createdTimestamp || 0) < dayStartMs) {
        stop = true;
        break;
      }
      list.push(m);
      if (isPartnershipDoneEmbedMessage(m)) partnershipEmbedsDetected += 1;
    }
    before = msgs[msgs.length - 1]?.id;
    if (!before || msgs.length < 100) break;
  }

  // dal più vecchio al più recente per ricostruire i blocchi.
  list.sort((a, b) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0));

  const reconstructed = [];
  for (let i = 0; i < list.length; i += 1) {
    const msg = list[i];
    if (!isPartnershipDoneEmbedMessage(msg)) continue;

    // Cerca manager/invite nei messaggi immediatamente precedenti
    const candidateMessageIds = [];
    const nearbyTexts = [];
    let managerId = null;
    let invite = null;

    for (let k = i - 1; k >= 0 && k >= i - 8; k -= 1) {
      const prev = list[k];
      if (isPartnershipDoneEmbedMessage(prev)) break;
      const text = String(prev.content || "").trim();
      if (!text) continue;
      nearbyTexts.push(text);
      candidateMessageIds.push(String(prev.id));
      if (!managerId) managerId = extractManagerId(text);
      if (!invite) invite = extractInvite(text);
    }

    if (!managerId) {
      // fallback sul testo completo del blocco + embed
      const joined = `${nearbyTexts.join("\n")}\n${flattenEmbedText(msg.embeds?.[0])}`;
      managerId = extractManagerId(joined);
      if (!invite) invite = extractInvite(joined);
    }
    if (!managerId) continue;

    reconstructed.push({
      managerId: String(managerId),
      partner: extractServerNameFromEmbed(msg),
      invite: invite || "",
      partnershipChannelId: String(msg.channelId),
      partnerMessageIds: Array.from(new Set([...candidateMessageIds, String(msg.id)])).slice(0, 25),
      date: new Date(Number(msg.createdTimestamp || Date.now())),
    });
  }

  // dedup basato sui message ids
  const unique = new Map();
  for (const row of reconstructed) {
    const key = `${row.managerId}:${row.partnershipChannelId}:${(row.partnerMessageIds || []).join(",")}`;
    unique.set(key, row);
  }

  return {
    scannedMessages,
    partnershipEmbedsDetected,
    parsedRows: reconstructed.length,
    rows: Array.from(unique.values()),
  };
}

async function applyRows(guildId, rows, dryRun) {
  let usersTouched = 0;
  let partnershipsAdded = 0;

  const byManager = new Map();
  for (const row of rows) {
    if (!isValidGuildUserId(String(guildId), String(row.managerId || ""))) continue;
    if (!byManager.has(row.managerId)) byManager.set(row.managerId, []);
    byManager.get(row.managerId).push(row);
  }

  for (const [managerId, managerRows] of byManager.entries()) {
    usersTouched += 1;
    const current = await Staff.findOne({ guildId: String(guildId), userId: String(managerId) }).catch(() => null);
    const base = current || new Staff({ guildId: String(guildId), userId: String(managerId), partnerCount: 0, partnerActions: [] });
    if (!Array.isArray(base.partnerActions)) base.partnerActions = [];
    if (!Number.isFinite(Number(base.partnerCount))) base.partnerCount = 0;

    const existingMsgIds = new Set();
    for (const act of base.partnerActions) {
      for (const mid of Array.isArray(act?.partnerMessageIds) ? act.partnerMessageIds : []) {
        existingMsgIds.add(String(mid));
      }
    }

    for (const row of managerRows) {
      const ids = Array.isArray(row.partnerMessageIds) ? row.partnerMessageIds.map(String) : [];
      const overlap = ids.some((id) => existingMsgIds.has(id));
      if (overlap) continue;
      partnershipsAdded += 1;
      if (!dryRun) {
        base.partnerActions.push({
          action: "create",
          partner: String(row.partner || "Sconosciuto").slice(0, 200),
          invite: String(row.invite || "").slice(0, 300),
          managerId: String(managerId),
          partnershipChannelId: String(row.partnershipChannelId),
          partnerMessageIds: ids.slice(0, 25),
          date: row.date || new Date(),
        });
        base.partnerCount = Math.max(0, Number(base.partnerCount || 0) + 1);
        for (const id of ids) existingMsgIds.add(id);
      }
    }

    if (!dryRun) {
      base.managerId = String(managerId);
      await base.save().catch(() => null);
    }
  }

  return { usersTouched, partnershipsAdded };
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
  if (!channel?.isTextBased?.() || !channel.messages?.fetch) throw new Error(`Canale partnership non accessibile: ${channelId}`);

  const scan = await scanToday(channel);
  const apply = await applyRows(guild.id, scan.rows, dryRun);

  console.log(
    JSON.stringify(
      {
        dryRun,
        guildId: String(guild.id),
        channelId: String(channel.id),
        scannedMessages: scan.scannedMessages,
        partnershipEmbedsDetected: scan.partnershipEmbedsDetected,
        parsedRows: scan.parsedRows,
        uniqueRows: scan.rows.length,
        usersTouched: apply.usersTouched,
        partnershipsAdded: apply.partnershipsAdded,
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