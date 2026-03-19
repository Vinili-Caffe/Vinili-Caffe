/**
 * Ricostruisce i dati voto Discadia di oggi da canale supporters:
 * - aggiorna discadiavoters (DiscadiaVoter)
 * - aggiorna voteroles (VoteRole, scadenza 24h dal voto)
 *
 * Canale sorgente:
 *   1442569123426074736
 *
 * Uso:
 *   node scripts/rebuild-today-discadia-voters-from-channel.js
 *   node scripts/rebuild-today-discadia-voters-from-channel.js --dry-run
 *   node scripts/rebuild-today-discadia-voters-from-channel.js --atlas
 *   node scripts/rebuild-today-discadia-voters-from-channel.js --guild=1329080093599076474
 *   node scripts/rebuild-today-discadia-voters-from-channel.js --channel=1442569123426074736
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");
const IDs = require("../Vinyls/Utils/Config/ids");
const { DiscadiaVoter } = require("../Vinyls/Schemas/Discadia/discadiaSchemas");
const { VoteRole } = require("../Vinyls/Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../Vinyls/Utils/DB/validateWriteIds");

const TZ = "Europe/Rome";
const DEFAULT_GUILD_ID = IDs.guilds?.main || "1329080093599076474";
const DEFAULT_CHANNEL_ID = "1442569123426074736";
const VOTE_ROLE_DURATION_MS = 24 * 60 * 60 * 1000;

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
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const pick = (type) => Number(p.find((x) => x.type === type)?.value || 0);
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

function parseUserId(text) {
  const s = String(text || "");
  const m = s.match(/<@!?(\d{15,21})>/);
  return m ? String(m[1]) : null;
}

function parseVoteCount(text) {
  const s = String(text || "");
  const m = s.match(/(\d+)\s*°\s*voto/i) || s.match(/(\d+)\s*(?:votes?|voti)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseVoteEntry(msg) {
  const embed = msg?.embeds?.[0];
  if (!embed) return null;
  const title = String(embed.title || "");
  if (!/nuovo\s+voto/i.test(title)) return null;

  const content = String(msg.content || "");
  const description = String(embed.description || "");
  const userId = parseUserId(content) || parseUserId(description);
  if (!userId) return null;

  const voteCount = parseVoteCount(description);
  const voteAt = new Date(Number(msg.createdTimestamp || Date.now()));
  return {
    userId,
    voteAt,
    voteCount,
    expiresAt: new Date(voteAt.getTime() + VOTE_ROLE_DURATION_MS),
    messageId: String(msg.id || ""),
  };
}

async function scanTodayVotes(channel, startMs) {
  const byUser = new Map();
  let scannedMessages = 0;
  let matchedVoteMessages = 0;
  let before;
  let stop = false;

  while (!stop) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || batch.size === 0) break;
    const list = Array.from(batch.values());
    scannedMessages += list.length;

    for (const msg of list) {
      const ts = Number(msg.createdTimestamp || 0);
      if (ts < startMs) {
        stop = true;
        break;
      }
      const entry = parseVoteEntry(msg);
      if (!entry) continue;
      matchedVoteMessages += 1;
      const prev = byUser.get(entry.userId);
      if (!prev || Number(entry.voteAt.getTime()) > Number(prev.voteAt.getTime())) {
        byUser.set(entry.userId, entry);
      } else if (prev && prev.voteCount == null && entry.voteCount != null) {
        prev.voteCount = entry.voteCount;
      }
    }

    before = list[list.length - 1]?.id;
    if (!before || list.length < 100) break;
  }

  return { byUser, scannedMessages, matchedVoteMessages };
}

async function applyVotes(guildId, entries, dryRun) {
  const users = entries.map((e) => String(e.userId));
  const existingVoters = await DiscadiaVoter.find({
    guildId: String(guildId),
    userId: { $in: users },
  })
    .lean()
    .catch(() => []);
  const existingVoteRole = await VoteRole.find({
    guildId: String(guildId),
    userId: { $in: users },
  })
    .lean()
    .catch(() => []);

  const voterByUser = new Map(existingVoters.map((r) => [String(r.userId), r]));
  const voteRoleByUser = new Map(existingVoteRole.map((r) => [String(r.userId), r]));

  const voterOps = [];
  const voteRoleOps = [];
  let skippedInvalid = 0;

  for (const row of entries) {
    const userId = String(row.userId);
    if (!isValidGuildUserId(String(guildId), userId)) {
      skippedInvalid += 1;
      continue;
    }

    const prevVoter = voterByUser.get(userId);
    const prevCount = Math.max(0, Number(prevVoter?.voteCount || 0));
    const computedCount = row.voteCount == null ? Math.max(1, prevCount + 1) : Math.max(prevCount, Number(row.voteCount));

    voterOps.push({
      updateOne: {
        filter: { guildId: String(guildId), userId },
        update: {
          $setOnInsert: {
            guildId: String(guildId),
            userId,
            voteMilestoneGranted: [],
            voteMilestoneNearReminded: [],
          },
          $set: {
            lastVoteAt: new Date(row.voteAt),
            voteCount: computedCount,
          },
        },
        upsert: true,
      },
    });

    const prevRole = voteRoleByUser.get(userId);
    const prevExpiresAt = prevRole?.expiresAt ? new Date(prevRole.expiresAt) : null;
    const nextExpiresAt = !prevExpiresAt || row.expiresAt > prevExpiresAt ? row.expiresAt : prevExpiresAt;
    voteRoleOps.push({
      updateOne: {
        filter: { guildId: String(guildId), userId },
        update: {
          $setOnInsert: { guildId: String(guildId), userId },
          $set: { expiresAt: new Date(nextExpiresAt) },
        },
        upsert: true,
      },
    });
  }

  if (!dryRun && voterOps.length) {
    await DiscadiaVoter.bulkWrite(voterOps, { ordered: false }).catch(() => null);
  }
  if (!dryRun && voteRoleOps.length) {
    await VoteRole.bulkWrite(voteRoleOps, { ordered: false }).catch(() => null);
  }

  return {
    updatedDiscadiaVoters: voterOps.length,
    updatedVoteRoles: voteRoleOps.length,
    skippedInvalid,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const guildId = getArg("guild", String(DEFAULT_GUILD_ID));
  const channelId = getArg("channel", DEFAULT_CHANNEL_ID);

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

  const startMs = getRomeDayStartUtcMs(new Date());
  const scan = await scanTodayVotes(channel, startMs);
  const entries = Array.from(scan.byUser.values());
  const apply = await applyVotes(String(guild.id), entries, dryRun);

  console.log(
    JSON.stringify(
      {
        dryRun,
        guildId: String(guild.id),
        channelId: String(channelId),
        scanStartAt: new Date(startMs).toISOString(),
        scannedMessages: scan.scannedMessages,
        matchedVoteMessages: scan.matchedVoteMessages,
        uniqueVotersDetected: entries.length,
        updatedDiscadiaVoters: apply.updatedDiscadiaVoters,
        updatedVoteRoles: apply.updatedVoteRoles,
        skippedInvalid: apply.skippedInvalid,
      },
      null,
      2,
    ),
  );

  await client.destroy();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});