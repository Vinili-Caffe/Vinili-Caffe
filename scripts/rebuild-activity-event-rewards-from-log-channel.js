/**
 * Rebuild/repair ActivityEventReward leggendo il canale log premi evento.
 *
 * Fonte: embed inviati da Vinyls/Services/Community/eventRewardLogService.js
 * Canale default: 1477994178230095903
 *
 * Uso:
 *   node scripts/rebuild-activity-event-rewards-from-log-channel.js            (dry-run)
 *   node scripts/rebuild-activity-event-rewards-from-log-channel.js --fix
 *   node scripts/rebuild-activity-event-rewards-from-log-channel.js --fix --since=2026-03-13T16:30
 *   node scripts/rebuild-activity-event-rewards-from-log-channel.js --fix --channel=1477994178230095903
 */
const path = require("path");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");

const ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

const IDs = require(path.join(ROOT, "Vinyls", "Utils", "Config", "ids"));
const { ActivityEventReward } = require(path.join(ROOT, "Vinyls", "Schemas", "Community", "communitySchemas"));

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
    channelId: "1477994178230095903",
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

function getEmbedField(embed, nameIncludes) {
  const fields = Array.isArray(embed?.fields) ? embed.fields : [];
  const needle = String(nameIncludes || "").toLowerCase();
  return fields.find((f) => String(f?.name || "").toLowerCase().includes(needle)) || null;
}

function extractUserIdFromEmbed(embed) {
  const desc = String(embed?.description || "");
  const m = desc.match(/<@(\d{17,20})>/);
  return m ? m[1] : null;
}

function extractWeekFromEmbed(embed) {
  const f = getEmbedField(embed, "settimana");
  if (!f) return null;
  const n = Number(String(f.value || "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeRewardTypeFromTipo(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (!t) return null;
  if (t.includes("supporter")) return "supporter";
  if (t.includes("verificat")) return "verificato";
  if (t.includes("guilded")) return "guilded";
  if (t.includes("inviti")) return "invite";
  if (t.includes("voto") && t.includes("discadia")) return "voter";
  if (t.includes("recensione") && t.includes("disboard")) return "recensione";
  return null;
}

function extractRewardFromEmbed(embed) {
  const tipo = getEmbedField(embed, "tipo")?.value || "";
  const detail = getEmbedField(embed, "dettaglio")?.value || "";
  const week = extractWeekFromEmbed(embed);

  const detailStr = String(detail || "");
  const m = detailStr.match(/Evento reward:\s*([a-zA-Z0-9_-]+)(?:\s+tier\s+(\d+))?/i);
  if (m) {
    return {
      rewardType: String(m[1]).trim(),
      tier: m[2] != null ? Number(m[2]) : null,
      week,
      source: "detail",
    };
  }

  const rt = normalizeRewardTypeFromTipo(tipo);
  if (rt) {
    return {
      rewardType: rt,
      tier: week != null ? week : null,
      week,
      source: "tipo",
    };
  }

  return null;
}

async function fetchMessages(channel, since, limit) {
  const out = [];
  let before = null;
  while (out.length < limit) {
    const batch = await channel.messages.fetch({ limit: 100, before: before ?? undefined }).catch(() => null);
    if (!batch || batch.size === 0) break;
    for (const [, m] of batch) {
      if (since && m.createdAt && m.createdAt.getTime() < since.getTime()) {
        return out;
      }
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

  console.log(`[eventRewards] guildId=${guildId} channelId=${channelId} dryRun=${dryRun} since=${since ? since.toISOString() : "ALL"} limit=${limit}`);

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
    if (!channel?.isTextBased?.()) throw new Error("Canale log non trovato o non testuale.");

    const messages = await fetchMessages(channel, since, limit);
    console.log(`[eventRewards] messages fetched: ${messages.length}`);

    const ops = [];
    let parsed = 0;
    let skipped = 0;

    for (const msg of messages) {
      const embeds = Array.isArray(msg.embeds) ? msg.embeds : [];
      if (!embeds.length) continue;

      for (const e of embeds) {
        const title = String(e?.title || "");
        if (!title.includes("Premio evento")) continue;
        const userId = extractUserIdFromEmbed(e);
        const reward = extractRewardFromEmbed(e);
        if (!userId || !reward?.rewardType) {
          skipped++;
          continue;
        }
        parsed++;
        const rewardType = String(reward.rewardType);
        const tierVal = reward.tier != null && Number.isFinite(Number(reward.tier)) ? Number(reward.tier) : null;

        ops.push({
          updateOne: {
            filter: { guildId: String(guildId), userId: String(userId), rewardType, tier: tierVal },
            update: { $setOnInsert: {} },
            upsert: true,
          },
        });
      }
    }

    console.log(`[eventRewards] parsed=${parsed} skipped=${skipped} ops=${ops.length}`);
    if (dryRun) return;

    const BATCH = 1000;
    for (let i = 0; i < ops.length; i += BATCH) {
      await ActivityEventReward.bulkWrite(ops.slice(i, i + BATCH), { ordered: false });
    }
    console.log("[eventRewards] bulkWrite done.");
  } finally {
    client.destroy();
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});