/**
 * Ricostruisce voti Discadia di oggi da un canale Discord e aggiorna:
 * - VoteRole (voteroles)
 * - DiscadiaVoter (discadiavoters)
 *
 * Uso:
 *   node scripts/rebuild-today-discadia-votes.js
 *   node scripts/rebuild-today-discadia-votes.js --channel=1442569123426074736 --guild=1329080093599076474
 *   node scripts/rebuild-today-discadia-votes.js --dry-run
 *   node scripts/rebuild-today-discadia-votes.js --atlas
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");
const IDs = require("../Vinyls/Utils/Config/ids");
const { VoteRole } = require("../Vinyls/Schemas/Community/communitySchemas");
const { DiscadiaVoter } = require("../Vinyls/Schemas/Discadia/discadiaSchemas");

const TZ = "Europe/Rome";
const DEFAULT_GUILD_ID = IDs.guilds?.main || "1329080093599076474";
const DEFAULT_CHANNEL_ID = "1442569123426074736";
const VOTE_ROLE_DURATION_MS = 24 * 60 * 60 * 1000;

function resolveMongoUrl() {
  if (process.argv.includes("--atlas")) return process.env.MONGO_URL || process.env.MONGODB_URI;
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI
  );
}

function getArg(name, fallback = "") {
  const hit = process.argv.find((a) => String(a).startsWith(`--${name}=`));
  if (!hit) return fallback;
  return String(hit.split("=").slice(1).join("=")).trim();
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
    for (const field of embed.fields) {
      push(field?.name);
      push(field?.value);
    }
  }
  const data = embed.data || embed._data;
  if (data) {
    push(data.title);
    push(data.description);
    push(data.author?.name);
    push(data.footer?.text);
    if (Array.isArray(data.fields)) {
      for (const field of data.fields) {
        push(field?.name);
        push(field?.value);
      }
    }
  }
  return parts.join("\n");
}

function extractVoteCountFromText(text) {
  const cleaned = String(text || "").replace(/\*\*/g, "");
  let m = cleaned.match(/(?:have\s+)?got\s+(\d+)\s+votes?/i);
  if (m) return Number(m[1]);
  m = cleaned.match(/have\s+(\d+)\s+votes?/i);
  if (m) return Number(m[1]);
  m = cleaned.match(/(\d+)\s+(?:votes?|voti)/i);
  if (m) return Number(m[1]);
  return null;
}

function extractUserIdFromText(text) {
  const m = String(text || "").match(/<@!?(\d{16,})>/);
  return m ? String(m[1]) : null;
}

function extractNameFromText(text) {
  const s = String(text || "");
  const m = s.match(/(?:^|[\r\n])\s*!?\s*([^\s]+)\s+has voted/i) || s.match(/!?\s*([^\s]+)\s+has voted/i);
  return m?.[1] || null;
}

function sanitizeName(name) {
  return String(name || "").replace(/^[!@#:_*`~\-\.]+|[!@#:_*`~\-\.]+$/g, "");
}

function looksLikeVoteMessage(message) {
  const embedText = flattenEmbedText(message.embeds?.[0]);
  const joined = `${message.content || ""}\n${embedText}`.toLowerCase();
  const looksLikeVote = /has voted|voted|ha votato|votato/i.test(joined) || (joined.includes("discadia") && /(vote|voto|votato)/i.test(joined));
  const looksLikeBump = /(server has been bumped|has been successfully bumped|bump(?:ed)?\s*successfully|successfully bumped|bump complete|bump done|thanks for bumping|you can bump again)/i.test(joined);
  return looksLikeVote && !looksLikeBump;
}

async function resolveUserFromMessage(message) {
  const mentioned = message.mentions?.users?.first();
  if (mentioned && !mentioned.bot) return mentioned;

  const embedText = flattenEmbedText(message.embeds?.[0]);
  const id =
    extractUserIdFromText(message.content || "") ||
    extractUserIdFromText(embedText);
  if (id) {
    const m = await message.guild.members.fetch(id).catch(() => null);
    return m?.user || null;
  }

  const rawName =
    extractNameFromText(message.content || "") ||
    extractNameFromText(embedText) ||
    extractNameFromText(message.embeds?.[0]?.title || "");
  const name = sanitizeName(rawName).toLowerCase();
  if (!name) return null;

  const cached = message.guild.members.cache.find((m) => {
    const u = String(m.user?.username || "").toLowerCase();
    const d = String(m.displayName || "").toLowerCase();
    return u === name || d === name;
  });
  if (cached?.user && !cached.user.bot) return cached.user;

  const searched = await message.guild.members.fetch({ query: name, limit: 5 }).catch(() => null);
  if (searched?.size) {
    const exact = searched.find((m) => {
      const u = String(m.user?.username || "").toLowerCase();
      const d = String(m.displayName || "").toLowerCase();
      return u === name || d === name;
    });
    const pick = exact || searched.first();
    if (pick?.user && !pick.user.bot) return pick.user;
  }

  return null;
}

async function scanChannelToday(channel) {
  const dayStartMs = getRomeDayStartUtcMs(new Date());
  const byUser = new Map();
  let scanned = 0;
  let voteMessages = 0;

  let before;
  let stop = false;
  while (!stop) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || batch.size === 0) break;
    const list = Array.from(batch.values());
    scanned += list.length;

    for (const message of list) {
      if (Number(message.createdTimestamp || 0) < dayStartMs) {
        stop = true;
        break;
      }
      if (!looksLikeVoteMessage(message)) continue;

      const user = await resolveUserFromMessage(message);
      if (!user?.id) continue;
      voteMessages += 1;

      const embedText = flattenEmbedText(message.embeds?.[0]);
      const fullText = `${message.content || ""}\n${embedText}`;
      const voteCount = extractVoteCountFromText(fullText);
      const userId = String(user.id);
      const previous = byUser.get(userId) || {
        userId,
        latestVoteAt: 0,
        voteCountFromEmbed: null,
        votesDetected: 0,
      };
      previous.latestVoteAt = Math.max(previous.latestVoteAt, Number(message.createdTimestamp || 0));
      previous.votesDetected += 1;
      if (Number.isFinite(voteCount) && voteCount > 0) {
        previous.voteCountFromEmbed = Math.max(Number(previous.voteCountFromEmbed || 0), Number(voteCount));
      }
      byUser.set(userId, previous);
    }

    before = list[list.length - 1]?.id;
    if (!before || list.length < 100) break;
  }

  return { scanned, voteMessages, byUser };
}

async function applyVotes(guildId, byUser, dryRun) {
  const userIds = Array.from(byUser.keys());
  if (!userIds.length) return { usersUpdated: 0 };

  const existing = await DiscadiaVoter.find({
    guildId: String(guildId),
    userId: { $in: userIds },
  })
    .lean()
    .catch(() => []);
  const existingByUser = new Map(existing.map((d) => [String(d.userId), d]));

  if (dryRun) return { usersUpdated: userIds.length };

  for (const userId of userIds) {
    const row = byUser.get(userId);
    const prev = existingByUser.get(userId);

    const latestVoteAt = new Date(Number(row.latestVoteAt || Date.now()));
    const existingCount = Number(prev?.voteCount || 0);
    const embedCount = Number(row.voteCountFromEmbed || 0);
    const nextVoteCount = Math.max(existingCount, embedCount || 0, 1);

    await DiscadiaVoter.updateOne(
      { guildId: String(guildId), userId: String(userId) },
      {
        $setOnInsert: {
          guildId: String(guildId),
          userId: String(userId),
          lastRemindedAt: null,
          voteMilestoneGranted: [],
          voteMilestoneNearReminded: [],
        },
        $max: { lastVoteAt: latestVoteAt, voteCount: nextVoteCount },
      },
      { upsert: true },
    ).catch(() => null);

    const expiresAt = new Date(Number(row.latestVoteAt || Date.now()) + VOTE_ROLE_DURATION_MS);
    await VoteRole.updateOne(
      { guildId: String(guildId), userId: String(userId) },
      { $set: { guildId: String(guildId), userId: String(userId), expiresAt } },
      { upsert: true },
    ).catch(() => null);
  }

  return { usersUpdated: userIds.length };
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

  const scan = await scanChannelToday(channel);
  const apply = await applyVotes(guild.id, scan.byUser, dryRun);

  console.log(
    JSON.stringify(
      {
        dryRun,
        guildId: guild.id,
        channelId: String(channel.id),
        scannedMessages: scan.scanned,
        voteMessagesDetected: scan.voteMessages,
        uniqueUsersDetected: scan.byUser.size,
        usersUpdated: apply.usersUpdated,
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