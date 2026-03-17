/**
 * Rebuild/repair Poll (pollschema) leggendo il canale polls.
 *
 * Fonte: messaggi creati da Vinyls/Commands/Admin/poll.js (buildPollMessageContent)
 * Canale target (user): 1442569128706838528
 *
 * Uso:
 *   node scripts/rebuild-polls-from-channel.js                       (dry-run)
 *   node scripts/rebuild-polls-from-channel.js --fix
 *   node scripts/rebuild-polls-from-channel.js --fix --since=2026-03-13T16:30
 *   node scripts/rebuild-polls-from-channel.js --fix --channel=1442569128706838528
 */
const path = require("path");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");

const ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

const IDs = require(path.join(ROOT, "Vinyls", "Utils", "Config", "ids"));
const Poll = require(path.join(ROOT, "Vinyls", "Schemas", "Poll", "pollSchema"));

const COUNTER_FILTER_QUESTION = "__counter__";
const TIME_ZONE = "Europe/Rome";

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
    channelId: "1442569128706838528",
    since: null,
    limit: 50000,
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
    if (a.startsWith("--limit=")) out.limit = Math.max(1, Math.min(200000, Number(a.split("=").slice(1).join("=").trim()) || 50000));
  }
  return out;
}

function romeWeekday(date) {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, weekday: "short" });
  const w = fmt.format(date);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[String(w)] ?? 0;
}

function looksLikePollMessage(content) {
  const c = String(content || "");
  return c.includes("__Poll #") && c.includes("**") && c.includes("__");
}

function parsePollMessageContent(content) {
  const c = String(content || "");
  const numMatch = c.match(/__Poll\s*#(\d+)__/i);
  if (!numMatch) return null;
  const pollcount = Number(numMatch[1]);
  if (!Number.isFinite(pollcount) || pollcount <= 0) return null;

  const qMatch = c.match(/\*\*([\s\S]+?)\*\*/);
  const domanda = qMatch ? String(qMatch[1]).trim() : null;
  if (!domanda) return null;

  const rawMatches = c.match(/__([^_]+)__/g)?.map((entry) => entry.replace(/__/g, "").trim()) || [];
  const answers = rawMatches.filter((text) => !/^Poll\s*#\d+$/i.test(text));
  const normalized = [];
  for (let i = 0; i < 10; i += 1) normalized.push(answers[i] ?? null);

  return {
    pollcount,
    domanda,
    risposta1: normalized[0],
    risposta2: normalized[1],
    risposta3: normalized[2],
    risposta4: normalized[3],
    risposta5: normalized[4],
    risposta6: normalized[5],
    risposta7: normalized[6],
    risposta8: normalized[7],
    risposta9: normalized[8],
    risposta10: normalized[9],
  };
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

  console.log(`[polls] guildId=${guildId} channelId=${channelId} dryRun=${dryRun} since=${since ? since.toISOString() : "ALL"} limit=${limit}`);

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
    if (!channel?.isTextBased?.()) throw new Error("Canale polls non trovato o non testuale.");

    const messages = await fetchMessages(channel, since, limit);
    console.log(`[polls] messages fetched: ${messages.length}`);

    const ops = [];
    let parsed = 0;
    let skipped = 0;
    let maxPoll = 0;

    for (const msg of messages) {
      if (!looksLikePollMessage(msg.content)) continue;
      const parsedPoll = parsePollMessageContent(msg.content);
      if (!parsedPoll) {
        skipped++;
        continue;
      }
      parsed++;
      maxPoll = Math.max(maxPoll, Number(parsedPoll.pollcount || 0));

      ops.push({
        updateOne: {
          filter: { guildId: String(guildId), pollcount: parsedPoll.pollcount },
          update: {
            $setOnInsert: {},
            $set: {
              ...parsedPoll,
              guildId: String(guildId),
              messageId: String(msg.id),
              source: "rebuild",
            },
          },
          upsert: true,
        },
      });
    }

    console.log(`[polls] parsed=${parsed} skipped=${skipped} ops=${ops.length} maxPoll=${maxPoll}`);
    if (dryRun) return;

    const BATCH = 1000;
    for (let i = 0; i < ops.length; i += BATCH) {
      await Poll.bulkWrite(ops.slice(i, i + BATCH), { ordered: false });
    }

    if (maxPoll > 0) {
      await Poll.findOneAndUpdate(
        { guildId: String(guildId), domanda: COUNTER_FILTER_QUESTION },
        { $set: { guildId: String(guildId), domanda: COUNTER_FILTER_QUESTION, pollcount: maxPoll } },
        { upsert: true, setDefaultsOnInsert: true },
      ).catch(() => {});
    }

    console.log("[polls] bulkWrite done.");
  } finally {
    client.destroy();
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});