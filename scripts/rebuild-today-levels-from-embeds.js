/**
 * Ricostruisce i livelli di oggi leggendo i messaggi level-up nel canale level.
 *
 * Uso:
 *   node scripts/rebuild-today-levels-from-embeds.js
 *   node scripts/rebuild-today-levels-from-embeds.js --guild=1329080093599076474
 *   node scripts/rebuild-today-levels-from-embeds.js --dry-run
 *   node scripts/rebuild-today-levels-from-embeds.js --atlas
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");
const { ExpUser } = require("../Vinyls/Schemas/Community/communitySchemas");
const { getTotalExpForLevel, getCurrentWeekKey } = require("../Vinyls/Services/Community/expService");
const IDs = require("../Vinyls/Utils/Config/ids");

const TZ = "Europe/Rome";
const DEFAULT_GUILD_ID = IDs.guilds?.main || "1329080093599076474";
const LEVEL_CHANNEL_ID = IDs.channels?.commands || "1442569189486497905";

const ROLE_TO_LEVEL = new Map([
  [String(IDs.roles?.Level10 || ""), 10],
  [String(IDs.roles?.Level20 || ""), 20],
  [String(IDs.roles?.Level30 || ""), 30],
  [String(IDs.roles?.Level50 || ""), 50],
  [String(IDs.roles?.Level70 || ""), 70],
  [String(IDs.roles?.Level100 || ""), 100],
].filter(([k]) => k));

function resolveMongoUrl() {
  if (process.argv.includes("--atlas")) return process.env.MONGO_URL || process.env.MONGODB_URI;
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI
  );
}

function parseMentionUserId(content) {
  const s = String(content || "");
  const m = s.match(/<@!?(\d{16,})>/);
  return m ? String(m[1]) : null;
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

function parseLevelFromText(text) {
  const s = String(text || "");
  const patterns = [
    /sei\s+salit[oa](?:\/a)?\s+di\s+livello[^0-9]{0,12}(\d{1,3})(?!\d)/i,
    /\braggiunt[oa]\s+il\s+livello[^0-9]{0,12}(\d{1,3})(?!\d)/i,
    /\blivello\s*(?:[:`]|n\.?|numero)?\s*([1-9]\d{0,2})(?!\d)/i,
    /\blevel(?:ed)?\s*up[^0-9]{0,12}([1-9]\d{0,2})(?!\d)/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0 && n <= 300) return n;
  }
  return null;
}

function parseLevelFromEmbed(embed) {
  const title = String(embed?.title || "");
  const description = String(embed?.description || "");

  // Caso standard: "Hai appena ... livello `12`"
  const mLevel = description.match(/livello\s*`?\s*(\d{1,4})\s*`?/i);
  if (mLevel) {
    const n = Number(mLevel[1]);
    if (Number.isFinite(n) && n > 0 && n <= 300) return n;
  }

  // Caso perks: "Hai appena raggiunto il <@&ROLE_ID>"
  const mRole = description.match(/<@&(\d{16,})>/);
  if (mRole) {
    const lvl = ROLE_TO_LEVEL.get(String(mRole[1]));
    if (Number.isFinite(lvl) && lvl > 0) return lvl;
  }

  // Fallback sul title se mai contiene numero livello
  const mTitle = title.match(/level\s*(\d{1,4})/i);
  if (mTitle) {
    const n = Number(mTitle[1]);
    if (Number.isFinite(n) && n > 0 && n <= 300) return n;
  }

  const fromText = parseLevelFromText(flattenEmbedText(embed));
  if (fromText) return fromText;

  return null;
}

function isLikelyLevelUpMessage(message) {
  const content = String(message?.content || "").toLowerCase();
  const embedText = flattenEmbedText(message?.embeds?.[0]).toLowerCase();
  const joined = `${content}\n${embedText}`;
  return (
    /leveled?\s*up/i.test(joined) ||
    /sei\s+salit[oa](?:\/a)?\s+di\s+livello/i.test(joined) ||
    /livello/i.test(joined)
  );
}

function extractUserIdFromMessage(msg) {
  const fromContent = parseMentionUserId(msg?.content);
  if (fromContent) return fromContent;
  const fromEmbeds = (msg?.embeds || []).map((e) => flattenEmbedText(e)).join("\n");
  const fromEmbedText = parseMentionUserId(fromEmbeds);
  if (fromEmbedText) return fromEmbedText;
  return null;
}

function extractBestLevelFromMessage(msg) {
  let best = null;
  for (const embed of msg?.embeds || []) {
    const level = parseLevelFromEmbed(embed);
    if (level) best = best == null ? level : Math.max(best, level);
  }
  const fromText = parseLevelFromText(String(msg?.content || ""));
  if (fromText) best = best == null ? fromText : Math.max(best, fromText);
  return best;
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

async function scanTodayLevelEmbeds(channel) {
  const startMs = getRomeDayStartUtcMs(new Date());
  const levelsByUser = new Map();
  let scanned = 0;
  let matched = 0;

  let before;
  let stop = false;
  while (!stop) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || batch.size === 0) break;
    const msgs = Array.from(batch.values());
    scanned += msgs.length;
    for (const msg of msgs) {
      if (Number(msg.createdTimestamp || 0) < startMs) {
        stop = true;
        break;
      }
      if (!isLikelyLevelUpMessage(msg)) continue;

      const userId = extractUserIdFromMessage(msg);
      if (!userId) continue;

      const bestLevel = extractBestLevelFromMessage(msg);
      if (!bestLevel) continue;

      matched += 1;
      levelsByUser.set(userId, Math.max(Number(levelsByUser.get(userId) || 0), Number(bestLevel)));
    }
    before = msgs[msgs.length - 1]?.id;
    if (!before || msgs.length < 100) break;
  }

  return { scanned, matched, levelsByUser };
}

async function applyLevels(guildId, levelsByUser, dryRun) {
  const allowDecrease = process.argv.includes("--allow-decrease");
  const weekKey = getCurrentWeekKey();
  const rows = await ExpUser.find({
    guildId: String(guildId),
    userId: { $in: Array.from(levelsByUser.keys()) },
  })
    .lean()
    .catch(() => []);
  const byUser = new Map(rows.map((r) => [String(r.userId), r]));

  let updated = 0;
  let skipped = 0;
  const ops = [];
  for (const [userId, targetLevelRaw] of levelsByUser.entries()) {
    const targetLevel = Math.max(1, Math.floor(Number(targetLevelRaw || 0)));
    const minExp = Math.max(0, Number(getTotalExpForLevel(targetLevel) || 0));
    const row = byUser.get(String(userId));
    const oldLevel = Math.max(0, Math.floor(Number(row?.level || 0)));
    const oldTotal = Math.max(0, Number(row?.totalExp || 0));
    const newLevel = allowDecrease ? targetLevel : Math.max(oldLevel, targetLevel);
    const newTotal = allowDecrease ? minExp : Math.max(oldTotal, minExp);

    if (newLevel === oldLevel && newTotal === oldTotal) {
      skipped += 1;
      continue;
    }

    updated += 1;
    if (!dryRun) {
      ops.push({
        updateOne: {
          filter: { guildId: String(guildId), userId: String(userId) },
          update: {
            $setOnInsert: { guildId: String(guildId), userId: String(userId) },
            $set: { level: newLevel, totalExp: newTotal, weeklyKey: weekKey },
          },
          upsert: true,
        },
      });
    }
  }

  if (!dryRun && ops.length) {
    await ExpUser.bulkWrite(ops, { ordered: false }).catch(() => null);
  }

  return { updated, skipped };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const guildArg = process.argv.find((a) => String(a).startsWith("--guild="));
  const guildId = guildArg ? String(guildArg.split("=").slice(1).join("=")).trim() : String(DEFAULT_GUILD_ID);

  const mongoUrl = resolveMongoUrl();
  const token = process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN;
  if (!mongoUrl) throw new Error("Mongo URL mancante");
  if (!token) throw new Error("Discord token mancante");

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
  await client.login(token);

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new Error(`Guild non trovata: ${guildId}`);
  const channel = await guild.channels.fetch(String(LEVEL_CHANNEL_ID)).catch(() => null);
  if (!channel?.isTextBased?.() || !channel.messages?.fetch) throw new Error(`Canale level-up non accessibile: ${LEVEL_CHANNEL_ID}`);

  const scan = await scanTodayLevelEmbeds(channel);
  const apply = await applyLevels(guild.id, scan.levelsByUser, dryRun);

  console.log(
    JSON.stringify(
      {
        dryRun,
        allowDecrease,
        guildId: guild.id,
        levelChannelId: String(LEVEL_CHANNEL_ID),
        scannedMessages: scan.scanned,
        matchedLevelEmbeds: scan.matched,
        usersWithDetectedLevelUp: scan.levelsByUser.size,
        updatedUsers: apply.updated,
        skippedUsers: apply.skipped,
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