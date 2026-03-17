/**
 * Legge i messaggi dal canale supporters (voti Discadia, boost, nuovi sostenitori)
 * e aggiorna il DB: DiscadiaVoter, ActivityEventReward (supporter se evento attivo).
 *
 * Uso: node scripts/rebuild-from-supporters-channel.js [--fix] [--limit=N]
 * Default limit=50000. Senza --fix: dry-run (non scrive su DB).
 */
const path = require("path");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");

const ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

const VINYLS = path.join(ROOT, "Vinyls");
let IDs = { guilds: { main: "" }, channels: { supporters: "1442569123426074736" } };
try {
  IDs = require(path.join(VINYLS, "Utils", "Config", "ids"));
} catch (_) {}
const { DiscadiaVoter } = require(path.join(VINYLS, "Schemas", "Discadia", "discadiaSchemas"));
const { grantEventRewardOnce } = require(path.join(VINYLS, "Services", "Community", "activityEventRewardsService"));

const SUPPORTERS_CHANNEL_ID = String(IDs.channels?.supporters || "1442569123426074736").trim();

function parseArgs(argv) {
  const out = { dryRun: true, limit: 50000 };
  for (const a of argv) {
    const s = String(a || "").trim();
    if (s === "--fix") out.dryRun = false;
    if (s.startsWith("--limit=")) {
      const n = parseInt(s.slice(8), 10);
      if (Number.isFinite(n) && n > 0) out.limit = n;
    }
  }
  return out;
}

function getMongoUrl() {
  return process.env.MONGO_URL_LOCAL || process.env.MONGODB_URI_LOCAL || process.env.MONGO_URL || process.env.MONGODB_URI || null;
}

function getDiscordToken() {
  return process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN || process.env.TOKEN || "";
}

function extractUserIdFromContent(content) {
  if (!content || typeof content !== "string") return null;
  const m = content.match(/<@!?(\d{17,19})>/);
  return m ? m[1] : null;
}

function getEmbedText(msg) {
  const parts = [];
  for (const emb of msg.embeds || []) {
    if (emb?.title) parts.push(String(emb.title));
    if (emb?.description) parts.push(String(emb.description));
    for (const f of emb?.fields || []) {
      if (f?.name) parts.push(String(f.name));
      if (f?.value) parts.push(String(f.value));
    }
  }
  return parts.join(" ").toLowerCase();
}

function isVoteMessage(msg) {
  const text = getEmbedText(msg);
  const hasVote = /voto|votato|nuovo voto/i.test(text) && /discadia/i.test(text);
  return hasVote && extractUserIdFromContent(msg.content);
}

function isSupporterMessage(msg) {
  const text = getEmbedText(msg);
  return /nuovx sostenitore|nuovo sostenitore|nuova sostenitrice/i.test(text) && extractUserIdFromContent(msg.content);
}

function isBoostMessage(msg) {
  const text = getEmbedText(msg);
  return /grazie per il boost|boost!/i.test(text) && extractUserIdFromContent(msg.content);
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));
  const guildId = String(IDs.guilds?.main || "").trim();
  const mongoUrl = getMongoUrl();
  const token = getDiscordToken();

  if (!guildId) throw new Error("IDs.guilds.main non impostato.");
  if (!mongoUrl) throw new Error("MongoDB: imposta MONGO_URL o MONGO_URL_LOCAL.");
  if (!token) throw new Error("Discord: imposta DISCORD_TOKEN_OFFICIAL o TOKEN.");

  console.log("[supporters-rebuild] channelId=" + SUPPORTERS_CHANNEL_ID + " guildId=" + guildId + " dryRun=" + dryRun + " limit=" + limit);

  mongoose.set("strictQuery", false);
  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 20000, connectTimeoutMS: 20000 });
  console.log("[supporters-rebuild] MongoDB connesso.");

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  await new Promise((resolve, reject) => {
    client.once("clientReady", resolve);
    client.once("error", reject);
    setTimeout(() => reject(new Error("Login timeout")), 25000);
  });

  const channel = await client.channels.fetch(SUPPORTERS_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    console.error("[supporters-rebuild] Canale non trovato o non testuale:", SUPPORTERS_CHANNEL_ID);
    client.destroy();
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }

  const messages = [];
  let before = null;
  while (messages.length < limit) {
    const batch = await channel.messages.fetch(before ? { limit: 100, before } : { limit: 100 }).catch(() => null);
    if (!batch?.size) break;
    const values = [...batch.values()];
    for (const msg of values) messages.push(msg);
    if (messages.length >= limit) break;
    before = values[values.length - 1]?.id || null;
    if (!before || values.length < 100) break;
  }
  console.log("[supporters-rebuild] Messaggi letti: " + messages.length);

  let votes = 0;
  let supporters = 0;
  let boosts = 0;

  const voteOps = [];
  const voteByUser = new Map();

  for (const msg of messages) {
    const userId = extractUserIdFromContent(msg.content);
    if (!userId) continue;

    if (isVoteMessage(msg)) {
      votes++;
      const createdAt = msg.createdAt instanceof Date ? msg.createdAt : new Date(msg.createdTimestamp || 0);
      const existing = voteByUser.get(userId);
      if (!existing || createdAt > existing.lastVoteAt) {
        voteByUser.set(userId, { lastVoteAt: createdAt, count: (existing?.count || 0) + 1 });
      } else {
        voteByUser.set(userId, { lastVoteAt: existing.lastVoteAt, count: existing.count + 1 });
      }
    } else if (isSupporterMessage(msg)) {
      supporters++;
      if (!dryRun) {
        await grantEventRewardOnce(guildId, userId, "supporter", { levels: 5, suppressSkipLog: true }).catch(() => null);
      }
    } else if (isBoostMessage(msg)) {
      boosts++;
    }
  }

  for (const [userId, data] of voteByUser.entries()) {
    voteOps.push({
      updateOne: {
        filter: { guildId, userId },
        update: {
          $max: { lastVoteAt: data.lastVoteAt },
          $set: { voteCount: data.count },
          $setOnInsert: { guildId, userId, lastRemindedAt: null, voteMilestoneGranted: [], voteMilestoneNearReminded: [] },
        },
        upsert: true,
      },
    });
  }

  if (!dryRun && voteOps.length) {
    const BATCH = 500;
    for (let i = 0; i < voteOps.length; i += BATCH) {
      await DiscadiaVoter.bulkWrite(voteOps.slice(i, i + BATCH), { ordered: false });
    }
    console.log("[supporters-rebuild] DiscadiaVoter aggiornati: " + voteOps.length + " upsert.");
  }

  console.log("[supporters-rebuild] Riepilogo: vote=" + votes + " supporter=" + supporters + " boost=" + boosts + " (DiscadiaVoter upsert=" + voteOps.length + ")");

  client.destroy();
  await mongoose.disconnect().catch(() => {});
  console.log("[supporters-rebuild] Fatto.");
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});