/**
 * Assegna EXP voce partendo da activitydaily(activitydailycompact) voiceSeconds.
 *
 * Uso:
 *   node scripts/reassign-voice-exp-from-activitydaily.js
 *   node scripts/reassign-voice-exp-from-activitydaily.js --date=2026-03-19
 *   node scripts/reassign-voice-exp-from-activitydaily.js --guild=1329080093599076474
 *   node scripts/reassign-voice-exp-from-activitydaily.js --dry-run
 *   node scripts/reassign-voice-exp-from-activitydaily.js --atlas
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");
const IDs = require("../Vinyls/Utils/Config/ids");
const {
  ActivityDaily,
  ActivityDailyCompact,
} = require("../Vinyls/Schemas/Community/communitySchemas");
const {
  VOICE_EXP_PER_MINUTE,
  addExpWithLevel,
} = require("../Vinyls/Services/Community/expService");
const { isValidGuildUserId } = require("../Vinyls/Utils/DB/validateWriteIds");

const TZ = "Europe/Rome";
const DEFAULT_GUILD_ID = IDs.guilds?.main || "1329080093599076474";

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

function romeDateKey(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type) => String(p.find((x) => x.type === type)?.value || "");
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function parseDateKey(raw) {
  const s = String(raw || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

async function collectVoiceSecondsByUser(guildId, dateKey) {
  const byUser = new Map();
  let source = "activitydailycompact";
  let rows = 0;

  const compact = await ActivityDailyCompact.findOne({
    guildId: String(guildId),
    dateKey: String(dateKey),
  })
    .select("users")
    .lean()
    .catch(() => null);

  if (compact?.users && typeof compact.users === "object") {
    const usersEntries = compact.users instanceof Map
      ? Array.from(compact.users.entries())
      : Object.entries(compact.users);
    for (const [uid, payload] of usersEntries) {
      const userId = String(uid || "").trim();
      const sec = Math.max(0, Math.floor(Number(payload?.voiceSeconds || 0)));
      if (!userId || sec <= 0) continue;
      byUser.set(userId, Number(byUser.get(userId) || 0) + sec);
      rows += 1;
    }
  } else {
    source = "activitydaily";
    const legacyRows = await ActivityDaily.find({
      guildId: String(guildId),
      dateKey: String(dateKey),
      voiceSeconds: { $gt: 0 },
    })
      .select("userId voiceSeconds")
      .lean()
      .catch(() => []);
    for (const row of legacyRows) {
      const userId = String(row?.userId || "").trim();
      const sec = Math.max(0, Math.floor(Number(row?.voiceSeconds || 0)));
      if (!userId || sec <= 0) continue;
      byUser.set(userId, Number(byUser.get(userId) || 0) + sec);
      rows += 1;
    }
  }

  return { byUser, source, rows };
}

function voiceSecondsToBaseExp(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  return Math.max(0, Math.floor((safeSeconds * Number(VOICE_EXP_PER_MINUTE || 0)) / 60));
}

async function applyVoiceExp(guild, secondsByUser, dryRun) {
  let processedUsers = 0;
  let awardedUsers = 0;
  let skippedInvalidIds = 0;
  let skippedNotInGuild = 0;
  let skippedZeroExp = 0;
  let totalVoiceSeconds = 0;
  let totalBaseExp = 0;

  for (const [userIdRaw, secondsRaw] of secondsByUser.entries()) {
    const userId = String(userIdRaw || "").trim();
    const seconds = Math.max(0, Math.floor(Number(secondsRaw || 0)));
    processedUsers += 1;

    if (!isValidGuildUserId(String(guild.id), userId)) {
      skippedInvalidIds += 1;
      continue;
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      skippedNotInGuild += 1;
      continue;
    }

    const baseExp = voiceSecondsToBaseExp(seconds);
    if (baseExp <= 0) {
      skippedZeroExp += 1;
      continue;
    }

    awardedUsers += 1;
    totalVoiceSeconds += seconds;
    totalBaseExp += baseExp;

    if (!dryRun) {
      await addExpWithLevel(
        guild,
        userId,
        baseExp,
        true,
        true,
        { source: "activity" },
      ).catch(() => null);
    }
  }

  return {
    processedUsers,
    awardedUsers,
    skippedInvalidIds,
    skippedNotInGuild,
    skippedZeroExp,
    totalVoiceSeconds,
    totalBaseExp,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const guildId = getArg("guild", String(DEFAULT_GUILD_ID));
  const dateArg = parseDateKey(getArg("date", ""));
  const dateKey = dateArg || romeDateKey(new Date());

  const mongoUrl = resolveMongoUrl();
  const token = process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN;
  if (!mongoUrl) throw new Error("Mongo URL mancante");
  if (!token) throw new Error("Discord token mancante");

  await mongoose.connect(mongoUrl, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });
  await client.login(token);

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new Error(`Guild non trovata: ${guildId}`);

  const collected = await collectVoiceSecondsByUser(guild.id, dateKey);
  const applied = await applyVoiceExp(guild, collected.byUser, dryRun);

  console.log(
    JSON.stringify(
      {
        dryRun,
        guildId: String(guild.id),
        dateKey,
        sourceCollection: collected.source,
        sourceRows: collected.rows,
        uniqueUsersWithVoiceSeconds: collected.byUser.size,
        processedUsers: applied.processedUsers,
        awardedUsers: applied.awardedUsers,
        skippedInvalidIds: applied.skippedInvalidIds,
        skippedNotInGuild: applied.skippedNotInGuild,
        skippedZeroExp: applied.skippedZeroExp,
        totalVoiceSeconds: applied.totalVoiceSeconds,
        voiceExpPerMinute: Number(VOICE_EXP_PER_MINUTE || 0),
        baseExpAssigned: applied.totalBaseExp,
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