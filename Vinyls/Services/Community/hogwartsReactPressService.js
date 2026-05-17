const { EmbedBuilder } = require("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { addGaleoni, formatGaleoni } = require("./gringottService");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const IDs = require("../../Utils/Config/ids");
const DOC = SITE_DOCUMENT_TYPE.HOGWARTS_REACT_PRESS;
const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOUSE_POINTS_OWNER_ID = "__event__";
const HOUSE_IDS = ["gryffindor", "hufflepuff", "ravenclaw", "slytherin"];
const DEFAULT_CONFIG = {
  enabled: true,
  eventKey: "premi_la_react_2026",
  startDate: "2026-07-11T00:00:00",
  endDate: "2026-08-11T23:59:59",
  emoji: "⚡",
  rewardGaleoni: 3,
  rewardHousePoints: 10,
  minIntervalMs: 90 * 60 * 1000,
  maxIntervalMs: 4 * 60 * 60 * 1000,
  activeDurationMs: 10 * 60 * 1000,
  maxPerDay: 24,
  minCandidateAgeMs: 2 * 60 * 1000,
  maxCandidateAgeMs: 6 * 60 * 60 * 1000,
  candidatePoolSize: 220,
};
const PERIODS = [
  { key: "2026-06-01_2026-06-14", start: "2026-06-01", end: "2026-06-14" },
  { key: "2026-06-15_2026-06-28", start: "2026-06-15", end: "2026-06-28" },
  { key: "2026-06-29_2026-07-12", start: "2026-06-29", end: "2026-07-12" },
  { key: "2026-07-13_2026-07-26", start: "2026-07-13", end: "2026-07-26" },
  { key: "2026-07-27_2026-08-09", start: "2026-07-27", end: "2026-08-09" },
  { key: "2026-08-10_2026-08-23", start: "2026-08-10", end: "2026-08-23" },
  { key: "2026-08-24_2026-08-31", start: "2026-08-24", end: "2026-08-31" },
];

const candidatesByGuild = new Map();
const loopState = new WeakSet();

function normalizeId(value) {
  return String(value || "").trim();
}

function safeInt(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cfg(client) {
  const raw = client?.config?.premiLaReact && typeof client.config.premiLaReact === "object" ? client.config.premiLaReact : {};
  const out = { ...DEFAULT_CONFIG, ...raw };
  out.enabled = out.enabled !== false;
  out.channelId = normalizeId(out.channelId || IDs.channels.chat);
  out.eventKey = normalizeId(out.eventKey) || DEFAULT_CONFIG.eventKey;
  out.emoji = normalizeId(out.emoji) || DEFAULT_CONFIG.emoji;
  out.rewardGaleoni = safeInt(out.rewardGaleoni, DEFAULT_CONFIG.rewardGaleoni, 0, 1000);
  out.rewardHousePoints = safeInt(out.rewardHousePoints, DEFAULT_CONFIG.rewardHousePoints, 0, 1000);
  out.minIntervalMs = safeInt(out.minIntervalMs, DEFAULT_CONFIG.minIntervalMs, 10 * 60 * 1000, 24 * 60 * 60 * 1000);
  out.maxIntervalMs = safeInt(out.maxIntervalMs, DEFAULT_CONFIG.maxIntervalMs, out.minIntervalMs, 24 * 60 * 60 * 1000);
  out.activeDurationMs = safeInt(out.activeDurationMs, DEFAULT_CONFIG.activeDurationMs, 60 * 1000, 60 * 60 * 1000);
  out.maxPerDay = safeInt(out.maxPerDay, DEFAULT_CONFIG.maxPerDay, 1, 24);
  out.minCandidateAgeMs = safeInt(out.minCandidateAgeMs, DEFAULT_CONFIG.minCandidateAgeMs, 0, 24 * 60 * 60 * 1000);
  out.maxCandidateAgeMs = safeInt(out.maxCandidateAgeMs, DEFAULT_CONFIG.maxCandidateAgeMs, out.minCandidateAgeMs + 60 * 1000, 48 * 60 * 60 * 1000);
  out.candidatePoolSize = safeInt(out.candidatePoolSize, DEFAULT_CONFIG.candidatePoolSize, 25, 1000);
  return out;
}

function parseLocalMs(value, fallback) {
  const ms = new Date(String(value || fallback)).getTime();
  return Number.isFinite(ms) ? ms : new Date(fallback).getTime();
}

function eventOpen(c, nowMs = Date.now()) {
  if (!c.enabled || !c.channelId) return false;
  const startMs = parseLocalMs(c.startDate, DEFAULT_CONFIG.startDate);
  const endMs = parseLocalMs(c.endDate, DEFAULT_CONFIG.endDate);
  return Number.isFinite(startMs) && Number.isFinite(endMs) && nowMs >= startMs && nowMs <= endMs;
}

function randomDelay(c) {
  return c.minIntervalMs + Math.floor(Math.random() * Math.max(1, c.maxIntervalMs - c.minIntervalMs + 1));
}

function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dedupeKey(c, messageId) {
  return `${c.eventKey}:${normalizeId(messageId)}`;
}

function normalizeHouseId(value) {
  const house = normalizeId(value).toLowerCase();
  return HOUSE_IDS.includes(house) ? house : "";
}

function dateOnlyMs(value, endOfDay = false) {
  const s = normalizeId(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms = new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00"}`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function housePointPeriodKey(nowMs = Date.now()) {
  const now = Number(nowMs || Date.now());
  for (const period of PERIODS) {
    const start = dateOnlyMs(period.start, false);
    const end = dateOnlyMs(period.end, true);
    if (Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end) return period.key;
  }
  return "";
}

async function resolveSortedHouse(guildId, userId, eventKey) {
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  if (!isValidGuildUserId(gid, uid)) return "";
  const doc = await SiteDocument.findOne({
    docType: SITE_DOCUMENT_TYPE.HOGWARTS_SORTING,
    guildId: gid,
    userId: uid,
    dedupeKey: normalizeId(eventKey) || "hogwarts",
  })
    .select("status planKey rawWebhook.houseId")
    .lean()
    .catch(() => null);
  return normalizeHouseId(doc?.status || doc?.rawWebhook?.houseId || doc?.planKey);
}

async function awardHousePoints(client, guildId, userId, amount) {
  const points = safeInt(amount, 0, 0, 1000);
  if (points <= 0) return null;
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  if (!isValidGuildUserId(gid, uid)) return null;
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = normalizeId(eventCfg?.eventKey) || "hogwarts";
  const houseId = await resolveSortedHouse(gid, uid, eventKey);
  if (!houseId) return null;
  const now = new Date();
  const periodKey = housePointPeriodKey(now.getTime());
  const inc = {
    "rawWebhook.byGame.premiLaReact": points,
    "rawWebhook.total": points,
    [`rawWebhook.totals.${houseId}`]: points,
  };
  if (periodKey) inc[`rawWebhook.byPeriod.${periodKey}.${houseId}`] = points;
  await SiteDocument.findOneAndUpdate(
    {
      docType: HOUSE_POINTS_DOC,
      guildId: gid,
      userId: HOUSE_POINTS_OWNER_ID,
      dedupeKey: eventKey,
    },
    {
      $setOnInsert: {
        docType: HOUSE_POINTS_DOC,
        guildId: gid,
        userId: HOUSE_POINTS_OWNER_ID,
        dedupeKey: eventKey,
        createdBy: "premiLaReact",
        status: "active",
      },
      $set: {
        planKey: "hogwarts_house_points",
        "rawWebhook.eventKey": eventKey,
        "rawWebhook.updatedAt": now,
      },
      $inc: inc,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return { houseId, points };
}

function recordReactPressCandidateMessage(message) {
  const c = cfg(message?.client);
  if (!eventOpen(c)) return;
  if (!message?.guild || !message?.author || message.author.bot) return;
  if (message.system || message.webhookId || message.applicationId) return;
  if (normalizeId(message.channelId) !== c.channelId) return;
  if (!normalizeId(message.content) && !message.attachments?.size) return;
  addCandidate(message.guild.id, {
    guildId: normalizeId(message.guild.id),
    channelId: normalizeId(message.channelId),
    messageId: normalizeId(message.id),
    authorId: normalizeId(message.author.id),
    createdAt: Number(message.createdTimestamp || Date.now()),
  }, c);
}

function addCandidate(guildId, row, c) {
  const gid = normalizeId(guildId);
  if (!gid) return;
  const arr = candidatesByGuild.get(gid) || [];
  if (arr.some((item) => normalizeId(item.messageId) === normalizeId(row.messageId))) return;
  arr.push(row);
  candidatesByGuild.set(gid, arr.slice(-c.candidatePoolSize));
}

async function seedRecentCandidatesFromChannel(client, guildId, c) {
  const channel = await client.channels.fetch(c.channelId).catch(() => null);
  if (!channel?.messages) return;
  const messages = await channel.messages.fetch({ limit: 80 }).catch(() => null);
  if (!messages?.size) return;
  for (const message of messages.values()) {
    if (!message?.guild || message.author?.bot || message.system || message.webhookId || message.applicationId) continue;
    if (!normalizeId(message.content) && !message.attachments?.size) continue;
    addCandidate(guildId, {
      guildId: normalizeId(guildId),
      channelId: normalizeId(message.channelId),
      messageId: normalizeId(message.id),
      authorId: normalizeId(message.author.id),
      createdAt: Number(message.createdTimestamp || Date.now()),
    }, c);
  }
}

function eligibleCandidates(guildId, c) {
  const now = Date.now();
  return (candidatesByGuild.get(normalizeId(guildId)) || []).filter((row) => {
    const age = now - Number(row.createdAt || 0);
    return age >= c.minCandidateAgeMs && age <= c.maxCandidateAgeMs && normalizeId(row.channelId) === c.channelId;
  });
}

async function activeChallenge(guildId) {
  return SiteDocument.findOne({ docType: DOC, guildId: normalizeId(guildId), status: "active" })
    .sort({ createdAt: -1 })
    .lean()
    .catch(() => null);
}

async function expireOldChallenges(client, guildId, c) {
  const now = new Date();
  const expired = await SiteDocument.find({
    docType: DOC,
    guildId: normalizeId(guildId),
    status: "active",
    "rawWebhook.expiresAt": { $lte: now },
  }).lean().catch(() => []);
  for (const row of expired) {
    await SiteDocument.updateOne({ _id: row._id, status: "active" }, { $set: { status: "expired", "rawWebhook.expiredAt": now } }).catch(() => null);
    const channelId = normalizeId(row?.rawWebhook?.channelId || c.channelId);
    const messageId = normalizeId(row?.rawWebhook?.messageId);
    const ch = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
    const msg = ch && messageId ? await ch.messages.fetch(messageId).catch(() => null) : null;
    if (msg) await msg.reactions.cache.get(c.emoji)?.remove().catch(() => null);
  }
}

async function todayChallengeCount(guildId) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return SiteDocument.countDocuments({
    docType: DOC,
    guildId: normalizeId(guildId),
    createdAt: { $gte: start, $lt: end },
  }).catch(() => 0);
}

async function spawnReactPressChallenge(client, guild, c) {
  if (await activeChallenge(guild.id)) return false;
  if (await todayChallengeCount(guild.id) >= c.maxPerDay) return false;
  const pool = eligibleCandidates(guild.id, c);
  if (!pool.length) return false;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  const channel = await client.channels.fetch(chosen.channelId).catch(() => null);
  if (!channel?.messages) return false;
  const message = await channel.messages.fetch(chosen.messageId).catch(() => null);
  if (!message || message.author?.bot) return false;
  await message.react(c.emoji);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + c.activeDurationMs);
  const doc = await SiteDocument.findOneAndUpdate(
    { docType: DOC, guildId: guild.id, dedupeKey: dedupeKey(c, message.id) },
    {
      $setOnInsert: {
        docType: DOC,
        guildId: guild.id,
        userId: HOUSE_POINTS_OWNER_ID,
        dedupeKey: dedupeKey(c, message.id),
        createdBy: "bot",
        status: "active",
        planKey: c.eventKey,
        rawWebhook: {
          eventKey: c.eventKey,
          channelId: channel.id,
          messageId: message.id,
          authorId: normalizeId(message.author?.id),
          emoji: c.emoji,
          rewardGaleoni: c.rewardGaleoni,
          rewardHousePoints: c.rewardHousePoints,
          expiresAt,
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  if (!doc || normalizeId(doc.status) !== "active") {
    await message.reactions.cache.get(c.emoji)?.remove().catch(() => null);
    return false;
  }
  return true;
}

async function tick(client) {
  const c = cfg(client);
  if (!eventOpen(c)) return;
  const guild = client.guilds.cache.get(IDs.guilds.main) || (await client.guilds.fetch(IDs.guilds.main).catch(() => null));
  if (!guild) return;
  await expireOldChallenges(client, guild.id, c);
  if (!eligibleCandidates(guild.id, c).length) await seedRecentCandidatesFromChannel(client, guild.id, c);
  await spawnReactPressChallenge(client, guild, c);
}

function startReactPressEventLoop(client) {
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  const schedule = () => {
    const c = cfg(client);
    const delay = eventOpen(c) ? randomDelay(c) : 30 * 60 * 1000;
    const timer = setTimeout(async () => {
      await tick(client).catch((err) => global.logger?.warn?.("[PREMI LA REACT] tick:", err?.message || err));
      schedule();
    }, delay);
    timer.unref?.();
    client._premiLaReactTimer = timer;
  };
  setTimeout(() => tick(client).catch(() => null), 30_000).unref?.();
  schedule();
}

function sameEmoji(reaction, emoji) {
  const expected = normalizeId(emoji).replace(/[\uFE0E\uFE0F]/g, "");
  const name = normalizeId(reaction?.emoji?.name).replace(/[\uFE0E\uFE0F]/g, "");
  return expected && name === expected;
}

async function handleReactPressReaction(client, reaction, user) {
  const c = cfg(client);
  if (!eventOpen(c) || user?.bot || !sameEmoji(reaction, c.emoji)) return false;
  const message = reaction.partial ? await reaction.fetch().then((r) => r.message).catch(() => null) : reaction.message;
  if (!message?.guild || normalizeId(message.channelId) !== c.channelId) return false;
  const gid = normalizeId(message.guild.id);
  const uid = normalizeId(user.id);
  if (!isValidGuildUserId(gid, uid)) return false;
  const now = new Date();
  const doc = await SiteDocument.findOneAndUpdate(
    {
      docType: DOC,
      guildId: gid,
      dedupeKey: dedupeKey(c, message.id),
      status: "active",
      "rawWebhook.expiresAt": { $gt: now },
    },
    {
      $set: {
        status: "completed",
        userId: uid,
        "rawWebhook.winnerUserId": uid,
        "rawWebhook.claimedAt": now,
      },
    },
    { new: true },
  ).lean().catch(() => null);
  if (!doc) return false;
  const eventCfg = resolveHogwartsEventConfig(client);
  const rewardKey = `${c.eventKey}:${message.id}:${uid}`;
  const galeoni = await addGaleoni({
    guildId: gid,
    userId: uid,
    amount: c.rewardGaleoni,
    reason: "Premi la react",
    actorId: "bot",
    source: "premi_la_react",
    eventKey: normalizeId(eventCfg?.eventKey) || c.eventKey,
    rewardKey,
  });
  const houseAward = await awardHousePoints(client, gid, uid, c.rewardHousePoints);
  const member = await getGuildMemberCached(message.guild, uid).catch(() => null);
  const winnerName = member?.displayName || user.username || "Utente";
  const rewardText = [
    c.rewardGaleoni > 0 ? formatGaleoni(c.rewardGaleoni) : "",
    houseAward?.points ? `${houseAward.points} punti ${houseAward.houseId}` : "",
  ].filter(Boolean).join(" + ") || "punto evento";
  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("⚡ Premi la react!")
    .setDescription(`**${winnerName}** ha cliccato per primo e vince **${rewardText}**.`)
    .setFooter({ text: houseAward?.houseId ? "Punti assegnati alla casa di appartenenza." : "Nessun punto casa: utente non smistato." })
    .setTimestamp();
  await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => null);
  await reaction.remove().catch(() => null);
  if (galeoni?.ok === false) {
    global.logger?.warn?.("[PREMI LA REACT] galeoni non assegnati:", galeoni.code, uid);
  }
  return true;
}

module.exports = { handleReactPressReaction, recordReactPressCandidateMessage, startReactPressEventLoop };