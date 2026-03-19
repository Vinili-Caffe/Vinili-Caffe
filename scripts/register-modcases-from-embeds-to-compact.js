/**
 * Registra mod cases mancanti in modalità compact (ModCaseUser.cases[])
 * leggendo gli embed dal canale dove vengono pubblicati i log.
 *
 * Uso:
 *   node scripts/register-modcases-from-embeds-to-compact.js
 *   node scripts/register-modcases-from-embeds-to-compact.js --dry-run
 *   node scripts/register-modcases-from-embeds-to-compact.js --atlas   (forza Atlas)
 *
 * Requisiti:
 * - .env deve avere DISCORD_TOKEN o DISCORD_TOKEN_OFFICIAL
 * - .env deve avere MONGO_URL_LOCAL (se usi local) o MONGO_URL (Atlas)
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const { Client, GatewayIntentBits, Partials } = require("discord.js");

const { ModCaseUser, ModConfig } = require("../Vinyls/Schemas/Moderation/moderationSchemas");

const CHANNEL_ID = "1442569294796820541";
const WANTED_CASES = new Set([77, 78, 79, 80]);

const MOD_CASE_MAX_CASES_PER_USER = Math.max(100, Number(process.env.MOD_CASE_MAX_CASES_PER_USER) || 800);

function parseCaseIdFromTitle(title) {
  const t = String(title || "");
  const m = t.match(/case\s+(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function normalizeAction(actionLabel) {
  const a = String(actionLabel || "").trim().toUpperCase();
  if (!a) return "UNKNOWN";
  if (a.includes("WARN")) return "WARN";
  if (a.includes("MUTE")) return "MUTE";
  if (a.includes("BAN")) return "BAN";
  if (a.includes("LOCK")) return "LOCK";
  if (a.includes("KICK")) return "KICK";
  return a;
}

function parseDurationToMs(durationText) {
  const s = String(durationText || "").trim();
  if (!s) return null;

  // Supporta: 1d, 24h, 30m, 45s, anche combinazioni tipo 1d12h
  const re = /(\d+)\s*([dhms])/gi;
  let any = false;
  let total = 0;
  let match;
  while ((match = re.exec(s)) !== null) {
    any = true;
    const value = Number(match[1]);
    const unit = String(match[2]).toLowerCase();
    if (!Number.isFinite(value)) continue;
    if (unit === "d") total += value * 24 * 60 * 60 * 1000;
    else if (unit === "h") total += value * 60 * 60 * 1000;
    else if (unit === "m") total += value * 60 * 1000;
    else if (unit === "s") total += value * 1000;
  }

  return any ? total : null;
}

function extractSnowflake(text) {
  const s = String(text || "");
  const m = s.match(/<@!?(\d{16,})>/);
  if (m) return m[1];
  const m2 = s.match(/\b(\d{16,})\b/);
  return m2 ? m2[1] : null;
}

function parseFromEmbed(embed, message) {
  const footerText = embed?.footer?.text || "";
  const userId = (footerText.match(/ID:\s*(\d{16,})/i) || [])[1] || null;

  const modField = (embed?.fields || []).find((f) => /moderator/i.test(f.name));
  const modId = extractSnowflake(modField?.value);

  const reasonField = (embed?.fields || []).find((f) => /reason/i.test(f.name));
  const reason = String(reasonField?.value || "").trim() || "Nessun motivo fornito";

  const durationField = (embed?.fields || []).find((f) => /duration/i.test(f.name));
  const durationRaw = durationField?.value;
  const durationMs = durationRaw ? parseDurationToMs(durationRaw) : null;

  const title = String(embed?.title || "");
  const caseId = parseCaseIdFromTitle(title);
  if (!caseId || !WANTED_CASES.has(caseId)) return null;

  // Title tipico: "Case 78 · Warn · autumnleaf_00"
  const actionLabel = (() => {
    const parts = title.split("·").map((x) => x.trim());
    if (parts.length >= 2) return parts[1];
    return "";
  })();
  const action = normalizeAction(actionLabel);

  const guildId = message.guildId || message.guild?.id || null;
  if (!guildId) return null;
  if (!userId) return null;
  if (!modId) return null;

  const createdAt = message.createdAt ? new Date(message.createdAt) : new Date();
  const expiresAt = durationMs ? new Date(createdAt.getTime() + durationMs) : null;

  return {
    guildId: String(guildId),
    userId: String(userId),
    modId: String(modId),
    caseId,
    action,
    reason,
    durationMs: durationMs == null ? null : Number(durationMs),
    expiresAt,
    active: true,
    context: { channelId: message.channelId, messageId: message.id },
    edits: [],
    closedAt: null,
    closeReason: null,
    createdAt,
    updatedAt: new Date(),
  };
}

async function resolveMongoUrl() {
  const forceAtlas = process.argv.includes("--atlas");
  const forceLocal = process.argv.includes("--local");
  if (forceAtlas) return process.env.MONGO_URL || process.env.MONGODB_URI;
  if (forceLocal) return process.env.MONGO_URL_LOCAL || process.env.MONGODB_URI_LOCAL;
  // auto: prova local prima, poi atlas
  const local = process.env.MONGO_URL_LOCAL || process.env.MONGODB_URI_LOCAL;
  const atlas = process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!local) return atlas;
  if (!atlas) return local;
  return local;
}

async function upsertCompactCase(entry, { dryRun }) {
  const n = Number(entry.caseId);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid caseId in entry");

  if (dryRun) {
    return { mode: "dry-run", insertedOrUpdated: false };
  }

  // 1) prova a sostituire un case già presente nello stesso ModCaseUser
  const replaced = await ModCaseUser.updateOne(
    { guildId: entry.guildId, userId: entry.userId, "cases.caseId": n },
    {
      $set: {
        "cases.$[c].action": entry.action,
        "cases.$[c].reason": entry.reason,
        "cases.$[c].modId": entry.modId,
        "cases.$[c].durationMs": entry.durationMs,
        "cases.$[c].expiresAt": entry.expiresAt,
        "cases.$[c].active": entry.active,
        "cases.$[c].context": entry.context,
        "cases.$[c].edits": entry.edits,
        "cases.$[c].closedAt": entry.closedAt,
        "cases.$[c].closeReason": entry.closeReason,
        "cases.$[c].createdAt": entry.createdAt,
        "cases.$[c].updatedAt": entry.updatedAt,
      },
    },
    { arrayFilters: [{ "c.caseId": n }] },
  ).catch(() => null);

  const wasReplaced = Boolean(replaced?.matchedCount && replaced.matchedCount > 0);
  if (wasReplaced) return { mode: "replaced", insertedOrUpdated: true };

  // 2) se non esiste, facciamo upsert del documento e push della entry
  await ModCaseUser.updateOne(
    { guildId: entry.guildId, userId: entry.userId },
    {
      $setOnInsert: { guildId: entry.guildId, userId: entry.userId },
      $push: {
        cases: {
          $each: [
            {
              caseId: entry.caseId,
              action: entry.action,
              userId: entry.userId,
              modId: entry.modId,
              reason: entry.reason,
              durationMs: entry.durationMs,
              expiresAt: entry.expiresAt,
              active: entry.active,
              context: entry.context,
              edits: entry.edits,
              closedAt: entry.closedAt,
              closeReason: entry.closeReason,
              createdAt: entry.createdAt,
              updatedAt: entry.updatedAt,
            },
          ],
          $slice: -MOD_CASE_MAX_CASES_PER_USER,
        },
      },
    },
    { upsert: true },
  ).catch((e) => {
    throw e;
  });

  return { mode: "inserted", insertedOrUpdated: true };
}

async function run() {
  const dryRun = process.argv.includes("--dry-run");

  const token = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL;
  if (!token) throw new Error("Missing DISCORD_TOKEN (or DISCORD_TOKEN_OFFICIAL) in .env");

  const mongoUrl = await resolveMongoUrl();
  if (!mongoUrl) throw new Error("Missing Mongo URL in .env (MONGO_URL_LOCAL/MONGO_URL etc.)");

  // Discord client
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    partials: [Partials.Channel],
  });

  await client.login(token);

  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel || !("messages" in channel)) {
    throw new Error(`Channel ${CHANNEL_ID} non è text-based oppure non accessibile`);
  }

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 5000 }).catch(() => null);
  // se la connessione fallisce in auto, prova Atlas (ultimo tentativo)
  if (mongoose.connection.readyState !== 1 && !process.argv.includes("--atlas")) {
    const atlas = process.env.MONGO_URL || process.env.MONGODB_URI;
    if (atlas) await mongoose.connect(atlas, { serverSelectionTimeoutMS: 5000 }).catch(() => null);
  }
  if (mongoose.connection.readyState !== 1) throw new Error("MongoDB connection failed (local/atlas)");

  const wantedLeft = new Set(WANTED_CASES);
  const upserted = [];

  let beforeId = undefined;
  for (let page = 0; page < 50 && wantedLeft.size > 0; page++) {
    const batch = await channel.messages.fetch({ limit: 100, before: beforeId }).catch(() => null);
    if (!batch || batch.size === 0) break;

    const messages = Array.from(batch.values()).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    beforeId = messages[messages.length - 1]?.id;

    for (const message of messages) {
      if (!message?.embeds?.length) continue;
      for (const embed of message.embeds) {
        const parsed = parseFromEmbed(embed, message);
        if (!parsed) continue;
        if (!wantedLeft.has(parsed.caseId)) continue;

        const result = await upsertCompactCase(parsed, { dryRun });
        upserted.push({ caseId: parsed.caseId, mode: result.mode });
        wantedLeft.delete(parsed.caseId);

        if (wantedLeft.size === 0) break;
      }
      if (wantedLeft.size === 0) break;
    }
  }

  // Aggiorna anche mod_config.caseCounter almeno al max importato
  if (upserted.length > 0 && !dryRun) {
    const maxImported = Math.max(...upserted.map((x) => Number(x.caseId)));
    const first = upserted[0];
    // guildId lo recuperiamo dal primo documento: entry viene sempre dentro lo stesso guild del channel
    const guildId = String(process.env.MAIN_GUILD_ID || "1329080093599076474");
    await ModConfig.updateOne({ guildId }, { $setOnInsert: { guildId }, $max: { caseCounter: maxImported } }, { upsert: true }).catch(() => null);
  }

  console.log(JSON.stringify({ dryRun, upserted, remainingWanted: Array.from(wantedLeft).sort((a, b) => a - b) }, null, 2));

  await mongoose.disconnect().catch(() => null);
  await client.destroy().catch(() => null);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
