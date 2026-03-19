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
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const { ExpUser } = require("../Vinyls/Schemas/Community/communitySchemas");
const { getTotalExpForLevel, getCurrentWeekKey } = require("../Vinyls/Services/Community/expService");
const IDs = require("../Vinyls/Utils/Config/ids");
const { isValidGuildUserId } = require("../Vinyls/Utils/DB/validateWriteIds");

const TZ = "Europe/Rome";
const DEFAULT_GUILD_ID = IDs.guilds?.main || "1329080093599076474";
const LEVEL_CHANNEL_ID = "1442569138114662490";

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
  const m = s.match(/<@!?(\d{15,21})>/);
  return m ? String(m[1]) : null;
}

function normalizeDiscordFormatText(text) {
  return String(text || "")
    .replace(/[*_`~>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    /\blivello(?:\*{1,2})?\s*(?:\*{1,2})?\s*(?:[:`]|n\.?|numero)?\s*`?\s*([1-9]\d{0,2})(?!\d)/i,
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
  const mLevel = description.match(/livello(?:\*{1,2})?\s*(?:\*{1,2})?\s*`?\s*(\d{1,4})\s*`?/i);
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
  if (!message?.author?.bot && !message?.webhookId) return false;
  const contentRaw = String(message?.content || "");
  const content = contentRaw.toLowerCase();
  const contentNorm = normalizeDiscordFormatText(contentRaw).toLowerCase();
  const hasEmbed = Array.isArray(message?.embeds) && message.embeds.length > 0;
  if (!hasEmbed) return false;
  const embedTextRaw = flattenEmbedText(message?.embeds?.[0]);
  const embedText = embedTextRaw.toLowerCase();
  const embedNorm = normalizeDiscordFormatText(embedTextRaw).toLowerCase();
  const joinedNorm = `${contentNorm}\n${embedNorm}`;
  const hasOfficialContent =
    /<a?:[A-Za-z0-9_]+:\d{16,}>\s*<@!?\d{15,21}>\s+sei\s+salit[oa](?:\/a)?\s+di\s+livello!?/i.test(contentRaw) ||
    /<@!?\d{15,21}>\s+sei\s+salit[oa](?:\/a)?\s+di\s+livello!?/i.test(contentRaw) ||
    /<@!?\d{15,21}>\s+sei\s+salit[oa](?:\/a)?\s+di\s+livello!?/i.test(contentNorm);
  if (!hasOfficialContent) return false;
  const isOfficialEmbed =
    /leveled?\s*up/i.test(embedNorm) &&
    (
      /hai\s+appena\s+raggiunto\s+il\s+livello/i.test(joinedNorm) ||
      /hai\s+appena\s+raggiunto\s+il\s+<@&\d{15,21}>/i.test(joinedNorm)
    );
  return isOfficialEmbed;
}

function extractUserIdFromMessage(msg) {
  const fromMentions = msg?.mentions?.users?.first?.();
  if (fromMentions?.id) return String(fromMentions.id);
  const fromContent = parseMentionUserId(msg?.content);
  if (fromContent) return fromContent;
  const fromEmbeds = (msg?.embeds || []).map((e) => flattenEmbedText(e)).join("\n");
  const fromEmbedText = parseMentionUserId(fromEmbeds);
  if (fromEmbedText) return fromEmbedText;
  const fromInteraction = msg?.interactionMetadata?.user?.id || msg?.interaction?.user?.id;
  if (fromInteraction) return String(fromInteraction);
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

function getRomeStartUtcMsFromDays(days = 1, now = new Date()) {
  const safeDays = Math.max(1, Math.min(30, Math.floor(Number(days || 1))));
  return getRomeDayStartUtcMs(now) - (safeDays - 1) * 24 * 60 * 60 * 1000;
}

function isSupportedTextChannel(ch) {
  if (!ch?.isTextBased?.() || !ch?.messages?.fetch) return false;
  const allowed = new Set([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
  ]);
  return allowed.has(ch.type);
}

async function scanTodayLevelEmbeds(channel, startMs) {
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
      if (Number.isFinite(startMs) && Number(msg.createdTimestamp || 0) < startMs) {
        stop = true;
        break;
      }
      if (!isLikelyLevelUpMessage(msg)) continue;

      const userId = extractUserIdFromMessage(msg);
      if (!userId) continue;

      const bestLevel = extractBestLevelFromMessage(msg);
      if (!bestLevel) continue;

      matched += 1;
      const prev = levelsByUser.get(userId);
      const ts = Number(msg.createdTimestamp || 0);
      if (!prev || ts > Number(prev.ts || 0)) {
        levelsByUser.set(userId, { level: Number(bestLevel), ts, messageId: String(msg.id || "") });
      }
    }
    before = msgs[msgs.length - 1]?.id;
    if (!before || msgs.length < 100) break;
  }

  return { scanned, matched, levelsByUser };
}

async function applyLevels(guildId, levelsByUser, dryRun) {
  const allowDecrease = !process.argv.includes("--no-decrease");
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
    if (!isValidGuildUserId(String(guildId), String(userId))) {
      skipped += 1;
      continue;
    }
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

async function filterUsersStillInGuild(guild, levelsByUser) {
  const usersInGuild = new Map();
  const ids = Array.from(levelsByUser.keys()).map((v) => String(v)).filter((v) => v.trim().length > 0);
  const idSet = new Set(ids);
  // Percorso principale: fetch completo membri e filtro locale, evita buchi dovuti a errori batch/singolo.
  const allMembers = await guild.members.fetch().catch(() => null);
  if (allMembers && allMembers.size > 0) {
    for (const [memberId] of allMembers) {
      const key = String(memberId);
      if (!idSet.has(key)) continue;
      const level = Number(levelsByUser.get(key)?.level || 0);
      if (level > 0) usersInGuild.set(key, level);
    }
    return usersInGuild;
  }
  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    let fetched = await guild.members.fetch({ user: chunk, force: true }).catch(() => null);
    if (!fetched) {
      fetched = await guild.members.fetch({ user: chunk, force: true }).catch(() => null);
    }
    if (fetched) {
      for (const [memberId] of fetched) {
        const level = Number(levelsByUser.get(String(memberId))?.level || 0);
        if (level > 0) usersInGuild.set(String(memberId), level);
      }
      continue;
    }
    // Fallback: se il fetch in batch fallisce (utente non trovato/errore parziale),
    // proviamo per singolo utente per non perdere level-up validi del resto del chunk.
    for (const userId of chunk) {
      let single = await guild.members.fetch({ user: userId, force: true }).catch(() => null);
      if (!single) {
        single = await guild.members.fetch({ user: userId, force: true }).catch(() => null);
      }
      const memberId = single?.id ? String(single.id) : "";
      if (!memberId) continue;
      const level = Number(levelsByUser.get(memberId)?.level || 0);
      if (level > 0) usersInGuild.set(memberId, level);
    }
  }
  return usersInGuild;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const allowDecrease = !process.argv.includes("--no-decrease");
  const allHistory = process.argv.includes("--all-history");
  const scanAllChannels = process.argv.includes("--all-channels");
  const daysArg = process.argv.find((a) => String(a).startsWith("--days="));
  const guildArg = process.argv.find((a) => String(a).startsWith("--guild="));
  const channelArg = process.argv.find((a) => String(a).startsWith("--channel="));
  const guildId = guildArg ? String(guildArg.split("=").slice(1).join("=")).trim() : String(DEFAULT_GUILD_ID);
  const specificChannelId = channelArg ? String(channelArg.split("=").slice(1).join("=")).trim() : "";
  const daysLookback = daysArg
    ? Math.max(1, Math.min(30, Math.floor(Number(String(daysArg.split("=").slice(1).join("=")).trim() || 1))))
    : (allHistory ? null : 1);
  const scanStartMs = Number.isFinite(daysLookback) ? getRomeStartUtcMsFromDays(daysLookback, new Date()) : null;

  const mongoUrl = resolveMongoUrl();
  const token = process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN;
  if (!mongoUrl) throw new Error("Mongo URL mancante");
  if (!token) throw new Error("Discord token mancante");

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers] });
  await client.login(token);

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new Error(`Guild non trovata: ${guildId}`);
  await guild.channels.fetch().catch(() => null);
  await guild.channels.fetchActiveThreads?.().catch(() => null);

  let channels = [];
  if (specificChannelId) {
    const ch = await guild.channels.fetch(String(specificChannelId)).catch(() => null);
    if (!ch?.isTextBased?.() || !ch.messages?.fetch) throw new Error(`Canale non accessibile: ${specificChannelId}`);
    channels = [ch];
  } else if (scanAllChannels) {
    channels = Array.from(guild.channels.cache.values()).filter(isSupportedTextChannel);
  } else {
    const ch = await guild.channels.fetch(String(LEVEL_CHANNEL_ID)).catch(() => null);
    if (!ch?.isTextBased?.() || !ch.messages?.fetch) throw new Error(`Canale level-up non accessibile: ${LEVEL_CHANNEL_ID}`);
    channels = [ch];
  }

  const mergedLevels = new Map();
  let scannedMessages = 0;
  let matchedLevelMessages = 0;
  let scannedChannels = 0;
  for (const channel of channels) {
    if (!channel?.isTextBased?.() || !channel.messages?.fetch) continue;
    scannedChannels += 1;
    const scan = await scanTodayLevelEmbeds(channel, scanStartMs);
    scannedMessages += Number(scan.scanned || 0);
    matchedLevelMessages += Number(scan.matched || 0);
    for (const [uid, payload] of scan.levelsByUser.entries()) {
      const prev = mergedLevels.get(uid);
      if (!prev || Number(payload?.ts || 0) > Number(prev?.ts || 0)) {
        mergedLevels.set(uid, payload);
      }
    }
  }

  const usersStillInGuild = await filterUsersStillInGuild(guild, mergedLevels);
  const removedNotInGuild = Math.max(0, mergedLevels.size - usersStillInGuild.size);
  const apply = await applyLevels(guild.id, usersStillInGuild, dryRun);

  console.log(
    JSON.stringify(
      {
        dryRun,
        allowDecrease,
        allHistory,
        scanAllChannels,
        daysLookback,
        scanStartAt: Number.isFinite(scanStartMs) ? new Date(scanStartMs).toISOString() : null,
        guildId: guild.id,
        levelChannelId: specificChannelId || String(LEVEL_CHANNEL_ID),
        scannedChannels,
        scannedMessages,
        matchedLevelEmbeds: matchedLevelMessages,
        usersWithDetectedLevelUp: mergedLevels.size,
        usersStillInGuild: usersStillInGuild.size,
        ignoredUsersNotInGuild: removedNotInGuild,
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