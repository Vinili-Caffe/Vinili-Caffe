const { EmbedBuilder, ChannelType, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { addGaleoni, formatGaleoni, hasGringottRewardKey } = require("./gringottService") as typeof import("./gringottService");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../../Utils/DB/validateWriteIds");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { isUserHighStaffExcludedFromHogwartsEvent } = require("../../Utils/Web/hogwartsEventParticipation") as typeof import("../../Utils/Web/hogwartsEventParticipation");
const { housePointPeriodKey: resolveHousePointPeriod } = require("../../Utils/Web/hogwartsHousePointPeriods") as typeof import("../../Utils/Web/hogwartsHousePointPeriods");
const { findExistingSort, resolveSortedHouseId } = require("../../Utils/Web/hogwartsSortingResolve") as typeof import("../../Utils/Web/hogwartsSortingResolve");
const { getHouseMeta } = require("../../Utils/Web/hogwartsSortingBank") as typeof import("../../Utils/Web/hogwartsSortingBank");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const DOC = SITE_DOCUMENT_TYPE.HOGWARTS_REACT_PRESS;
const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOUSE_POINTS_OWNER_ID = "__event__";
const DEFAULT_CONFIG = {
  enabled: true,
  eventKey: "premi_la_react_2026",
  startDate: "2026-07-11T12:00:00",
  endDate: "2026-08-11T12:00:00",
  emoji: "⚡",
  rewardGaleoni: 3,
  rewardHousePoints: 10,
  minIntervalMs: 90 * 60 * 1000,
  maxIntervalMs: 4 * 60 * 60 * 1000,
  activeDurationMs: 30 * 60 * 1000,
  hintBeforeExpiryMs: 5 * 60 * 1000,
  minChatMessagesBetweenRounds: 10,
  maxPerDay: 24,
  minCandidateAgeMs: 2 * 60 * 1000,
  maxCandidateAgeMs: 60 * 60 * 1000,
  candidatePoolSize: 220,
  anyMemberReadableChannel: true,
  channelIds: [],
  pingRoleId: "1507000390493798511",
  sortedOnly: true,
  spawnMinOffsetMs: 3 * 60 * 1000,
  spawnMaxOffsetMs: 52 * 60 * 1000,
  channelRepeatCooldown: 12,
  maxCandidatesPerChannel: 5,
  randomChannelSpawn: true,
  messageHistoryLimit: 100,
  fallbackMessageLimit: 10,
  spawnChannelAttempts: 24,
  nightQuietStartHour: 0,
  nightQuietEndHour: 8,
};

const candidatesByGuild = new Map();
const loopState = new WeakSet();
const spawnLocksByClient = new WeakMap();

function getSpawnLockSet(client?) {
  let set = spawnLocksByClient.get(client);
  if (!set) {
    set = new Set();
    spawnLocksByClient.set(client, set);
  }
  return set;
}

async function withReactPressSpawnLock(client?, guildId?, fn?) {
  const gid = normalizeId(guildId);
  if (!gid) return false;
  const locks = getSpawnLockSet(client);
  if (locks.has(gid)) return false;
  locks.add(gid);
  try {
    return await fn();
  } finally {
    locks.delete(gid);
  }
}

function getExcludedReactPressChannelIds() {
  const ids = [
    IDs.channels?.hogwartsHouseGryffindor,
    IDs.channels?.hogwartsHouseHufflepuff,
    IDs.channels?.hogwartsHouseRavenclaw,
    IDs.channels?.hogwartsHouseSlytherin,
    IDs.channels?.hogwartsHouseActivityReport,
    IDs.channels?.hogwartsSortingLog,
        IDs.channels?.news,
    IDs.channels?.info,
    IDs.channels?.staffList,
    IDs.channels?.bestStaff,
    IDs.channels?.pollBestStaff,
    IDs.channels?.valutazioniStaff,
    IDs.channels?.puntiTolti,
    IDs.channels?.resocontiStaff,
    IDs.channels?.guidaStaff,
    IDs.channels?.guidaMid,
    IDs.channels?.candidatureStaff,
    IDs.channels?.visioneModuli,
    IDs.channels?.ticket,
    IDs.channels?.ticketLogs,
    IDs.channels?.warnStaff,
    IDs.channels?.regolamentoPartner,
    IDs.channels?.descriptionPartner,
    IDs.channels?.partnerRewards,
    IDs.channels?.suggestions,
    IDs.channels?.quotes,
    IDs.channels?.polls,
    IDs.channels?.clickMe,
  ];
  return new Set(ids.map((id?) => normalizeId(id)).filter(Boolean));
}

function resolveReactPressPingRoleId(client?) {
  const eventsRoleId = normalizeId(IDs.roles?.Events);
  const rawParticipant = String(
    resolveHogwartsEventConfig(client)?.completionRoleId ||
      IDs.roles?.HogwartsEventParticipant ||
      DEFAULT_CONFIG.pingRoleId ||
      "",
  ).trim();
  const participantRoleId = normalizeId(
    rawParticipant.split(/[,\s]+/).map((p?) => p.trim()).find((p?) => /^\d{17,22}$/.test(p)) || "",
  );
  if (participantRoleId && participantRoleId !== eventsRoleId) return participantRoleId;
  return normalizeId(IDs.roles?.HogwartsEventParticipant || DEFAULT_CONFIG.pingRoleId);
}

function normalizeId(value?) {
  return String(value || "").trim();
}

function isInvalidReactPressMessage(message?) {
  if (!message) return true;
  if (message.system) return true;
  if (message.webhookId) return true;
  return false;
}

function hasReactPressTargetBody(message?) {
  if (!message) return false;
  if (normalizeId(message.content)) return true;
  if (message.attachments?.size > 0) return true;
  if (message.embeds?.length > 0) return true;
  return false;
}

function safeInt(value?, fallback?, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cfg(client?) {
  const raw = client?.config?.premiLaReact && typeof client.config.premiLaReact === "object" ? client.config.premiLaReact : {};
  const out = { ...DEFAULT_CONFIG, ...raw };
  out.enabled = out.enabled !== false;
  out.channelId = normalizeId(out.channelId || IDs.channels.chat);
  out.announceChannelId = normalizeId(IDs.channels?.chat || out.announceChannelId || out.channelId);
  out.anyMemberReadableChannel = out.anyMemberReadableChannel !== false;
  out.channelIds = Array.isArray(raw.channelIds)
    ? raw.channelIds.map((id?) => normalizeId(id)).filter(Boolean)
    : [];
  out.eventKey = normalizeId(out.eventKey) || DEFAULT_CONFIG.eventKey;
  out.emoji = normalizeId(out.emoji) || DEFAULT_CONFIG.emoji;
  out.rewardGaleoni = safeInt(out.rewardGaleoni, DEFAULT_CONFIG.rewardGaleoni, 0, 1000);
  out.rewardHousePoints = safeInt(out.rewardHousePoints, DEFAULT_CONFIG.rewardHousePoints, 0, 1000);
  out.minIntervalMs = safeInt(out.minIntervalMs, DEFAULT_CONFIG.minIntervalMs, 10 * 60 * 1000, 24 * 60 * 60 * 1000);
  out.maxIntervalMs = safeInt(out.maxIntervalMs, DEFAULT_CONFIG.maxIntervalMs, out.minIntervalMs, 24 * 60 * 60 * 1000);
  out.activeDurationMs = safeInt(out.activeDurationMs, DEFAULT_CONFIG.activeDurationMs, 60 * 1000, 60 * 60 * 1000);
  out.hintBeforeExpiryMs = safeInt(
    out.hintBeforeExpiryMs,
    DEFAULT_CONFIG.hintBeforeExpiryMs,
    60 * 1000,
    out.activeDurationMs - 60 * 1000,
  );
  out.minChatMessagesBetweenRounds = safeInt(
    out.minChatMessagesBetweenRounds,
    DEFAULT_CONFIG.minChatMessagesBetweenRounds,
    1,
    100,
  );
  out.chatActivityChannelId = normalizeId(
    out.chatActivityChannelId || out.announceChannelId || IDs.channels?.chat || "",
  );
  out.maxPerDay = safeInt(out.maxPerDay, DEFAULT_CONFIG.maxPerDay, 1, 24);
  out.minCandidateAgeMs = safeInt(out.minCandidateAgeMs, DEFAULT_CONFIG.minCandidateAgeMs, 0, 24 * 60 * 60 * 1000);
  out.maxCandidateAgeMs = safeInt(out.maxCandidateAgeMs, DEFAULT_CONFIG.maxCandidateAgeMs, out.minCandidateAgeMs + 60 * 1000, 48 * 60 * 60 * 1000);
  out.candidatePoolSize = safeInt(out.candidatePoolSize, DEFAULT_CONFIG.candidatePoolSize, 25, 1000);
  out.pingRoleId = resolveReactPressPingRoleId(client);
  out.sortedOnly = out.sortedOnly !== false;
  out.spawnMinOffsetMs = safeInt(out.spawnMinOffsetMs, 3 * 60 * 1000, 0, 24 * 60 * 60 * 1000);
  out.spawnMaxOffsetMs = safeInt(out.spawnMaxOffsetMs, 52 * 60 * 1000, out.spawnMinOffsetMs, 24 * 60 * 60 * 1000);
  out.channelRepeatCooldown = safeInt(out.channelRepeatCooldown, DEFAULT_CONFIG.channelRepeatCooldown, 0, 48);
  out.maxCandidatesPerChannel = safeInt(out.maxCandidatesPerChannel, DEFAULT_CONFIG.maxCandidatesPerChannel, 1, 40);
  out.randomChannelSpawn = out.randomChannelSpawn !== false;
  out.messageHistoryLimit = safeInt(out.messageHistoryLimit, DEFAULT_CONFIG.messageHistoryLimit, 20, 100);
  out.fallbackMessageLimit = safeInt(out.fallbackMessageLimit, DEFAULT_CONFIG.fallbackMessageLimit, 5, 25);
  out.spawnChannelAttempts = safeInt(out.spawnChannelAttempts, DEFAULT_CONFIG.spawnChannelAttempts, 3, 40);
  out.nightQuietStartHour = safeInt(out.nightQuietStartHour, DEFAULT_CONFIG.nightQuietStartHour, 0, 23);
  out.nightQuietEndHour = safeInt(out.nightQuietEndHour, DEFAULT_CONFIG.nightQuietEndHour, 1, 24);
  return out;
}

function getRomeDateKey(nowMs = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
}

function isMessageFromSameDay(message?, nowMs = Date.now()) {
  const ts = Number(message?.createdTimestamp || 0);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return getRomeDateKey(ts) === getRomeDateKey(nowMs);
}

function getRomeHour(nowMs = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date(nowMs));
  return safeInt(parts.find((part?) => part.type === "hour")?.value, 0, 0, 23);
}

function isNightQuietHours(c?, nowMs = Date.now()) {
  const start = safeInt(c.nightQuietStartHour, DEFAULT_CONFIG.nightQuietStartHour, 0, 23);
  const end = safeInt(c.nightQuietEndHour, DEFAULT_CONFIG.nightQuietEndHour, 1, 24);
  if (start === end) return false;
  const hour = getRomeHour(nowMs);
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function computeSpawnMessageWindow(c?, nowMs = Date.now(), lastSpawnMs = null) {
  const { slotStart } = currentSlotWindow(c, nowMs);
  const eventStartMs = parseLocalMs(c.startDate, DEFAULT_CONFIG.startDate);
  const minFromSlot = Math.max(slotStart, Number.isFinite(lastSpawnMs) ? lastSpawnMs : eventStartMs);
  const minFromMaxAge = nowMs - c.maxCandidateAgeMs;
  const minCreatedAtMs = Math.max(minFromSlot, minFromMaxAge);
  const maxCreatedAtMs = nowMs - c.minCandidateAgeMs;
  return { minCreatedAtMs, maxCreatedAtMs, slotStart };
}

function parseLocalMs(value?, fallback?) {
  const ms = new Date(String(value || fallback)).getTime();
  return Number.isFinite(ms) ? ms : new Date(fallback).getTime();
}

function eventOpen(c?, nowMs = Date.now()) {
  if (!c.enabled || !c.announceChannelId) return false;
  const startMs = parseLocalMs(c.startDate, DEFAULT_CONFIG.startDate);
  const endMs = parseLocalMs(c.endDate, DEFAULT_CONFIG.endDate);
  return Number.isFinite(startMs) && Number.isFinite(endMs) && nowMs >= startMs && nowMs <= endMs;
}

const REACT_PRESS_TEXT_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
    ChannelType.GuildVoice,
]);

function resolveReactPressCategoryId(channel?, guild?) {
  if (!channel) return "";
  if (channel.isThread?.()) {
    const parent =
      channel.parent ||
      guild?.channels?.cache?.get(String(channel.parentId || "")) ||
      null;
    return String(parent?.parentId || "").trim();
  }
  return String(channel.parentId || "").trim();
}

function isEphemeralOrTemporaryReactPressChannel(channel?, guild?) {
  if (!channel) return true;
  const stanzeId = String(IDs.categories?.categoryStanze || "").trim();
  const privateId = String(IDs.categories?.categoryPrivate || "").trim();
  const categoryId = resolveReactPressCategoryId(channel, guild);
  if (categoryId && stanzeId && categoryId === stanzeId) return true;
  if (categoryId && privateId && categoryId === privateId) return true;
  try {
    const { isChannelInCustomPrivateCategory } = require("../../Utils/Community/customPrivateCategoryUtils") as typeof import("../../Utils/Community/customPrivateCategoryUtils");
    if (guild && isChannelInCustomPrivateCategory(channel, guild)) return true;
    if (channel.isThread?.() && guild) {
      const parent =
        channel.parent || guild.channels.cache.get(String(channel.parentId || "")) || null;
      if (parent && isChannelInCustomPrivateCategory(parent, guild)) return true;
    }
  } catch (_) {}
  return false;
}

function isReactPressStageChannel(channel?) {
  if (!channel) return false;
  if (channel.type === ChannelType.GuildStageVoice) return true;
    if (channel.isThread?.()) {
    const parent = channel.parent || channel.guild?.channels?.cache?.get(String(channel.parentId || ""));
    if (parent?.type === ChannelType.GuildStageVoice) return true;
  }
  return false;
}

function isTextLikeGuildChannel(channel?) {
  if (!channel?.isTextBased?.() || channel.isDMBased?.()) return false;
  if (isReactPressStageChannel(channel)) return false;
  if (isEphemeralOrTemporaryReactPressChannel(channel, channel.guild)) return false;
  if (REACT_PRESS_TEXT_CHANNEL_TYPES.has(channel.type)) return true;
  return Boolean(channel.isTextBased?.()) && channel.type !== ChannelType.GuildStageVoice;
}

function isArchivedReactPressChannel(channel?) {
  return Boolean(channel?.isThread?.() && channel.archived);
}

function resolveReactPressAccessRole(guild?) {
  const memberRoleId = normalizeId(IDs.roles?.Member);
  if (memberRoleId) {
    const memberRole = guild?.roles?.cache?.get(memberRoleId);
    if (memberRole) return memberRole;
  }
  return guild?.roles?.everyone || null;
}

function roleCanAccessReactPressChannel(channel?, role?) {
  if (!channel || !role) return false;
  const perms = channel.permissionsFor(role);
  return Boolean(perms?.has(PermissionsBitField.Flags.ViewChannel));
}

function isMemberReadableChannel(channel?, guild?, client = guild?.client) {
  if (!isTextLikeGuildChannel(channel) || !guild) return false;
  if (isEphemeralOrTemporaryReactPressChannel(channel, guild)) return false;
  if (isArchivedReactPressChannel(channel)) return false;
  const channelId = normalizeId(channel.id);
  if (channelId && getExcludedReactPressChannelIds().has(channelId)) return false;
  const accessRole = resolveReactPressAccessRole(guild);
  if (!roleCanAccessReactPressChannel(channel, accessRole)) return false;
  const me = guild.members.me || guild.members.cache.get(guild.client?.user?.id);
  if (
    me &&
    !me.permissions?.has(PermissionsBitField.Flags.Administrator) &&
    !channel.permissionsFor(me)?.has(PermissionsBitField.Flags.ViewChannel)
  ) {
    return false;
  }
  return true;
}

function isCandidateChannel(channel?, guild?, c?) {
  const channelId = normalizeId(channel?.id);
  if (!channelId || !guild) return false;
  if (c.channelIds?.length) return c.channelIds.includes(channelId);
  if (c.anyMemberReadableChannel === false) return channelId === normalizeId(c.channelId);
  return isMemberReadableChannel(channel, guild);
}

function isCandidateChannelId(channelId?, guild?, c?) {
  const id = normalizeId(channelId);
  if (!id || !guild) return false;
  if (c.channelIds?.length) return c.channelIds.includes(id);
  if (c.anyMemberReadableChannel === false) return id === normalizeId(c.channelId);
  const channel = guild.channels.cache.get(id);
  return channel ? isMemberReadableChannel(channel, guild) : false;
}

async function listCandidateChannels(client?, guild?, c?) {
  if (c.channelIds?.length) {
    const channels = await Promise.all(
      c.channelIds.map((id?) => client.channels.fetch(id).catch(() => null)),
    );
    return channels.filter((ch?) => ch && isCandidateChannel(ch, guild, c));
  }
  if (c.anyMemberReadableChannel === false) {
    const onlyId = normalizeId(c.channelId);
    if (!onlyId) return [];
    const channel =
      guild.channels.cache.get(onlyId) ||
      (await client.channels.fetch(onlyId).catch(() => null));
    return channel && isCandidateChannel(channel, guild, c) ? [channel] : [];
  }
  return listReactPressSpawnChannelPool(guild, client);
}

async function fetchActiveReactPressThreads(guild?) {
  if (!guild?.channels?.fetchActiveThreads) return [];
  try {
    const active = await guild.channels.fetchActiveThreads();
    const threads = active?.threads;
    if (!threads) return [];
    return typeof threads.values === "function" ? [...threads.values()] : [...threads];
  } catch {
    return [];
  }
}

async function listReactPressSpawnChannelPool(guild?, client = guild?.client) {
  if (!guild) return [];
  await guild.channels.fetch().catch(() => null);
  const me = guild.members.me || guild.members.cache.get(client?.user?.id);
  const byId = new Map();
  for (const channel of guild.channels.cache.values()) {
    if (isRandomSpawnReadableChannel(channel, guild, me, client)) {
      byId.set(channel.id, channel);
    }
  }
  for (const thread of await fetchActiveReactPressThreads(guild)) {
    if (isRandomSpawnReadableChannel(thread, guild, me, client)) {
      byId.set(thread.id, thread);
    }
  }
  return [...byId.values()];
}

function pickWeightedReactPressChannel(channels?, recentChannelIds = []) {
  if (!Array.isArray(channels) || !channels.length) return null;
  const recentSet = new Set(
    (Array.isArray(recentChannelIds) ? recentChannelIds : []).map(normalizeId).filter(Boolean),
  );
  const fresh = channels.filter((ch?) => !recentSet.has(normalizeId(ch.id)));
  const pool = fresh.length ? fresh : channels;
  const weights = pool.map((ch?) => {
    if (ch.isThread?.()) return 3;
    if (ch.type === ChannelType.GuildVoice) return 3;
    return 1;
  });
  const total = weights.reduce((sum?, w?) => sum + w, 0);
  let roll = Math.random() * Math.max(1, total);
  for (let i = 0; i < pool.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function isPremiLaReactEventEnded(c?, nowMs = Date.now()) {
  const endMs = parseLocalMs(c?.endDate, DEFAULT_CONFIG.endDate);
  return Number.isFinite(endMs) && Number(nowMs) > endMs;
}

function randomDelay(c?) {
  return c.minIntervalMs + Math.floor(Math.random() * Math.max(1, c.maxIntervalMs - c.minIntervalMs + 1));
}

function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dedupeKey(c?, messageId?) {
  return `${c.eventKey}:${normalizeId(messageId)}`;
}

async function findReactPressDocForMessage(guildId?, c?, messageId?) {
  const mid = normalizeId(messageId);
  const gid = normalizeId(guildId);
  if (!mid || !gid) return null;
  const byKey = await SiteDocument.findOne({
    docType: DOC,
    guildId: gid,
    dedupeKey: dedupeKey(c, mid),
  })
    .select({ status: 1, rawWebhook: 1, userId: 1, planKey: 1 })
    .lean()
    .catch(() => null);
  if (byKey) return byKey;
    return SiteDocument.findOne({
    docType: DOC,
    guildId: gid,
    "rawWebhook.messageId": mid,
  })
    .sort({ createdAt: -1 })
    .select({ status: 1, rawWebhook: 1, userId: 1, planKey: 1 })
    .lean()
    .catch(() => null);
}

async function findActiveReactPressByMessage(guildId?, messageId?) {
  const mid = normalizeId(messageId);
  const gid = normalizeId(guildId);
  if (!mid || !gid) return null;
  return SiteDocument.findOne({
    docType: DOC,
    guildId: gid,
    status: "active",
    "rawWebhook.messageId": mid,
    "rawWebhook.expiresAt": { $gt: new Date() },
  })
    .select({ status: 1, rawWebhook: 1, userId: 1, planKey: 1 })
    .lean()
    .catch(() => null);
}

function cfgFromReactPressDoc(client?, doc?) {
  const base = cfg(client);
  if (!doc) return base;
  const eventKey =
    normalizeId(doc?.rawWebhook?.eventKey) ||
    normalizeId(doc?.planKey) ||
    base.eventKey;
  const finaleChaos =
    doc?.rawWebhook?.finaleChaos && typeof doc.rawWebhook.finaleChaos === "object"
      ? doc.rawWebhook.finaleChaos
      : null;
  return {
    ...base,
    eventKey,
    rewardGaleoni: safeInt(doc?.rawWebhook?.rewardGaleoni, base.rewardGaleoni, 0, 100000),
    rewardHousePoints: safeInt(doc?.rawWebhook?.rewardHousePoints, base.rewardHousePoints, 0, 100000),
    activeDurationMs: safeInt(doc?.rawWebhook?.activeDurationMs, base.activeDurationMs, 60_000, 60 * 60_000),
    hintBeforeExpiryMs: safeInt(
      doc?.rawWebhook?.hintBeforeExpiryMs,
      base.hintBeforeExpiryMs,
      60_000,
      safeInt(doc?.rawWebhook?.activeDurationMs, base.activeDurationMs, 60_000, 60 * 60_000) - 60_000,
    ),
        startDate: "2020-01-01T00:00:00",
    endDate: "2099-12-31T23:59:59",
    finaleChaos,
  };
}

async function resolveSortedHouse(guildId?, userId?, eventKey?) {
  const existing = await findExistingSort(guildId, userId, eventKey).catch(() => null);
  return resolveSortedHouseId(existing);
}

async function awardHousePoints(client?, guildId?, userId?, amount?) {
  const base = safeInt(amount, 0, 0, 100000);
  if (base <= 0) return null;
  const { applyPetHousePointsBoost } = require("./hogwartsShopBoostsService") as typeof import("./hogwartsShopBoostsService");
  const petBoost = await applyPetHousePointsBoost(client, guildId, userId, base);
  const points = petBoost.points;
  if (points <= 0) return null;
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  if (!isValidGuildUserId(gid, uid)) return null;
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = normalizeId(eventCfg?.eventKey) || "hogwarts";
  const houseId = await resolveSortedHouse(gid, uid, eventKey);
  if (!houseId) return null;
  const now = new Date();
  const periodKey = String(resolveHousePointPeriod(now.getTime())?.key || "").trim();
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
  return {
    houseId,
    points,
    petMultiplier: petBoost.multiplier > 1 ? petBoost.multiplier : 0,
    petName: petBoost.petName || "",
  };
}

function recordReactPressCandidateMessage(message?) {
  const c = cfg(message?.client);
  if (!eventOpen(c)) return;
  if (!message?.guild || !message?.author) return;
  if (isInvalidReactPressMessage(message)) return;
  if (!isCandidateChannel(message.channel, message.guild, c)) return;
  if (!hasReactPressTargetBody(message)) return;
  void (async () => {
    const authorMember = message.member || (await getGuildMemberCached(message.guild, message.author.id).catch(() => null));
    if (!message.author?.bot && (await isUserHighStaffExcludedFromHogwartsEvent(message.client, message.author.id, authorMember))) return;
    addCandidate(message.guild.id, {
      guildId: normalizeId(message.guild.id),
      channelId: normalizeId(message.channelId),
      messageId: normalizeId(message.id),
      authorId: normalizeId(message.author.id),
      createdAt: Number(message.createdTimestamp || Date.now()),
    }, c);
  })().catch(() => null);
}

function addCandidate(guildId?, row?, c?) {
  const gid = normalizeId(guildId);
  if (!gid) return;
  if (row?.authorExcludedFromHogwarts) return;
  const arr = candidatesByGuild.get(gid) || [];
  if (arr.some((item?) => normalizeId(item.messageId) === normalizeId(row.messageId))) return;
  arr.push(row);
  candidatesByGuild.set(gid, arr.slice(-c.candidatePoolSize));
}

async function seedRecentCandidatesFromGuild(client?, guild?, c?) {
  const channels = await listCandidateChannels(client, guild, c);
  for (const channel of channels.slice(0, 48)) {
    if (!channel?.messages?.fetch) continue;
    const messages = await channel.messages.fetch({ limit: 40 }).catch(() => null);
    if (!messages?.size) continue;
    for (const message of messages.values()) {
      if (isInvalidReactPressMessage(message)) continue;
      if (!hasReactPressTargetBody(message)) continue;
      const authorId = normalizeId(message.author.id);
      const authorMember = await getGuildMemberCached(guild, authorId).catch(() => null);
      const authorExcludedFromHogwarts =
        !message.author?.bot &&
        (await isUserHighStaffExcludedFromHogwartsEvent(client, authorId, authorMember));
      addCandidate(guild.id, {
        guildId: normalizeId(guild.id),
        channelId: normalizeId(message.channelId),
        messageId: normalizeId(message.id),
        authorId,
        authorExcludedFromHogwarts,
        createdAt: Number(message.createdTimestamp || Date.now()),
      }, c);
    }
  }
}

function passesCandidateRow(row?, c?, guild?, nowMs?, { minCreatedAtMs = null, maxCreatedAtMs = null, enforceMaxAge = false } = {}) {
  if (row?.authorExcludedFromHogwarts) return false;
  const createdAt = Number(row.createdAt || 0);
  if (!createdAt) return false;
  if (minCreatedAtMs != null && createdAt < minCreatedAtMs) return false;
  if (maxCreatedAtMs != null && createdAt > maxCreatedAtMs) return false;
  const age = nowMs - createdAt;
  if (age < c.minCandidateAgeMs) return false;
  if (enforceMaxAge && age > c.maxCandidateAgeMs) return false;
  return isCandidateChannelId(row.channelId, guild, c);
}

async function candidateRowFromMessage(client?, guild?, message?, c?, nowMs = Date.now()) {
  if (!message?.guild || isInvalidReactPressMessage(message)) return null;
  if (!hasReactPressTargetBody(message)) return null;
  if (!isCandidateChannel(message.channel, guild, c)) return null;
  const authorId = normalizeId(message.author.id);
  const authorMember = await getGuildMemberCached(guild, authorId).catch(() => null);
  if (!message.author?.bot && (await isUserHighStaffExcludedFromHogwartsEvent(client, authorId, authorMember))) return null;
  const row = {
    guildId: normalizeId(guild.id),
    channelId: normalizeId(message.channelId),
    messageId: normalizeId(message.id),
    authorId,
    createdAt: Number(message.createdTimestamp || nowMs),
  };
  return row;
}

function eligibleCandidates(guild?, c?, nowMs = Date.now(), windowOpts: Record<string, any> = {}) {
  return (candidatesByGuild.get(normalizeId(guild?.id)) || []).filter((row?) =>
    passesCandidateRow(row, c, guild, nowMs, windowOpts),
  );
}

function shuffleArray(items?) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isRandomSpawnReadableChannel(channel?, guild?, me?, client?) {
  if (!channel || !guild) return false;
  if (!isTextLikeGuildChannel(channel)) return false;
  if (channel.type === ChannelType.GuildAnnouncement) return false;
  if (isArchivedReactPressChannel(channel)) return false;
  if (isEphemeralOrTemporaryReactPressChannel(channel, guild)) return false;
  const channelId = normalizeId(channel.id);
  if (channelId && getExcludedReactPressChannelIds().has(channelId)) return false;
  if (!channel.viewable) return false;
  if (me && !me.permissions?.has(PermissionsBitField.Flags.Administrator)) {
    const botPerms = channel.permissionsFor(me);
    if (!botPerms?.has(PermissionsBitField.Flags.ViewChannel)) return false;
    if (!botPerms?.has(PermissionsBitField.Flags.AddReactions)) return false;
  }
  const accessRole = resolveReactPressAccessRole(guild);
  if (!roleCanAccessReactPressChannel(channel, accessRole)) return false;
  return true;
}

async function pickRandomReactPressChannel(guild?, c?, excludeChannelIds = [], recentChannelIds = []) {
  if (!guild) return null;
  const me = guild.members.me || guild.members.cache.get(guild.client?.user?.id);
  const client = guild.client;
  const excluded = new Set([
    ...getExcludedReactPressChannelIds(),
    ...(Array.isArray(excludeChannelIds) ? excludeChannelIds.map(normalizeId).filter(Boolean) : []),
  ]);

  if (c.channelIds?.length) {
    const allowed = c.channelIds.map(normalizeId).filter((id?) => id && !excluded.has(id));
    const channels = (
      await Promise.all(allowed.map((id?) => guild.channels.fetch(id).catch(() => guild.channels.cache.get(id) || null)))
    ).filter((channel?) => channel && isRandomSpawnReadableChannel(channel, guild, me, client));
    return pickWeightedReactPressChannel(channels, recentChannelIds);
  }

  const pool = await listReactPressSpawnChannelPool(guild, client);
  const channels = pool.filter((channel?) => !excluded.has(normalizeId(channel.id)));
  return pickWeightedReactPressChannel(channels, recentChannelIds);
}

async function isMessageBlockedForReactPress(guild?, c?, messageId?) {
  const key = dedupeKey(c, messageId);
  const existing = await SiteDocument.findOne({
    docType: DOC,
    guildId: normalizeId(guild?.id),
    dedupeKey: key,
  })
    .select("status rawWebhook.expiresAt")
    .lean()
    .catch(() => null);
  const status = normalizeId(existing?.status);
  if (status === "completed") return true;
  if (status === "active") {
    const expMs = new Date(existing?.rawWebhook?.expiresAt || 0).getTime();
    if (Number.isFinite(expMs) && expMs > Date.now()) return true;
  }
  return false;
}

async function collectValidReactPressCandidates(client?, guild?, c?, messages?) {
  const candidates = [];
  for (const message of messages) {
    if (!message?.guild || isInvalidReactPressMessage(message)) continue;
    if (!hasReactPressTargetBody(message)) continue;
    if (await isMessageBlockedForReactPress(guild, c, message.id)) continue;
    const authorId = normalizeId(message.author.id);
    const authorMember = await getGuildMemberCached(guild, authorId).catch(() => null);
    if (!message.author?.bot && (await isUserHighStaffExcludedFromHogwartsEvent(client, authorId, authorMember))) {
      continue;
    }
    candidates.push(message);
  }
  return candidates;
}

async function pickReactPressMessageInChannel(client?, guild?, channel?, c?) {
  if (!channel?.messages?.fetch) return null;
  const historyLimit = safeInt(c.messageHistoryLimit, DEFAULT_CONFIG.messageHistoryLimit, 20, 100);
  const fallbackLimit = safeInt(c.fallbackMessageLimit, DEFAULT_CONFIG.fallbackMessageLimit, 5, 25);
  const messages = await channel.messages.fetch({ limit: historyLimit }).catch(() => null);
  if (!messages?.size) return null;

  const ordered = [...messages.values()];
  const validCandidates = await collectValidReactPressCandidates(client, guild, c, ordered);
  if (!validCandidates.length) return null;

  const todayCandidates = validCandidates.filter((message?) => isMessageFromSameDay(message));
  if (todayCandidates.length) {
    return todayCandidates[Math.floor(Math.random() * todayCandidates.length)];
  }

    const recentIds = new Set(ordered.slice(0, fallbackLimit).map((message?) => normalizeId(message.id)));
  const recentValid = validCandidates.filter((message?) => recentIds.has(normalizeId(message.id)));
  const pool = recentValid.length ? recentValid : validCandidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function spawnReactPressViaRandomChannel(client?, guild?, c?) {
  const recentChannelIds = await recentReactPressSpawnChannelIds(guild.id, c, c.channelRepeatCooldown);
  const excludeChannels = [...recentChannelIds].filter(Boolean);
  const failures = [];
  const maxAttempts = safeInt(c.spawnChannelAttempts, DEFAULT_CONFIG.spawnChannelAttempts, 3, 40);
  let allowRecentChannels = false;

  const { slotStart, slotEnd } = currentSlotWindow(c);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await hasSpawnInSlot(guild.id, c, slotStart, slotEnd)) break;
    if (!allowRecentChannels && attempt >= Math.ceil(maxAttempts * 0.6) && recentChannelIds.length) {
      allowRecentChannels = true;
    }
    const excluded = allowRecentChannels ? [] : excludeChannels;
    const channel = await pickRandomReactPressChannel(guild, c, excluded, recentChannelIds);
    if (!channel) {
      if (!allowRecentChannels && recentChannelIds.length) {
        allowRecentChannels = true;
        continue;
      }
      break;
    }
    const channelId = normalizeId(channel.id);
    const message = await pickReactPressMessageInChannel(client, guild, channel, c);
    if (!message) {
      failures.push(`no_message:${channelId}`);
      if (!excludeChannels.includes(channelId)) excludeChannels.push(channelId);
      continue;
    }
    const chosen = {
      channelId,
      messageId: normalizeId(message.id),
      authorId: normalizeId(message.author?.id),
    };
    const result = await trySpawnReactPressOnCandidate(client, guild, c, chosen);
    if (result.ok) {
      await clearOrphanReactPressEmojis(client, guild.id, c, chosen.channelId, chosen.messageId);
      await announceReactPressSpawn(client, guild, c, result.message);
      return true;
    }
    failures.push(`${result.code || "unknown"}:${channelId}`);
    if (!excludeChannels.includes(channelId)) excludeChannels.push(channelId);
  }

    const poolOk = await spawnReactPressViaCandidatePool(client, guild, c);
  if (poolOk) return true;

  if (failures.length) {
    global.logger?.warn?.(
      "[PREMI LA REACT] Spawn random-channel fallito:",
      failures.slice(0, 6).join(", ") || "nessun canale valido",
    );
  }
  return false;
}

async function spawnReactPressViaCandidatePool(client?, guild?, c?) {
  let pool = await resolveSpawnCandidatePool(client, guild, c);
  if (!pool.length) return false;
  pool = capPoolPerChannel(pool, c.maxCandidatesPerChannel);
  const recentChannelIds = new Set(
    await recentReactPressSpawnChannelIds(guild.id, c, c.channelRepeatCooldown),
  );
  let picked = pickSpawnCandidates(pool, c, 12, recentChannelIds);
  if (!picked.length) {
    picked = pickSpawnCandidates(pool, c, 12, new Set());
  }
  const failures = [];
  const { slotStart, slotEnd } = currentSlotWindow(c);
  for (const chosen of picked) {
    if (await hasSpawnInSlot(guild.id, c, slotStart, slotEnd)) break;
    const result = await trySpawnReactPressOnCandidate(client, guild, c, chosen);
    if (result.ok) {
      await clearOrphanReactPressEmojis(client, guild.id, c, chosen.channelId, chosen.messageId);
      await announceReactPressSpawn(client, guild, c, result.message);
      return true;
    }
    failures.push(result.code || "unknown");
  }
  global.logger?.warn?.("[PREMI LA REACT] Spawn pool fallito:", failures.slice(0, 5).join(", ") || "nessun candidato");
  return false;
}

function capPoolPerChannel(pool?, maxPerChannel = 5) {
  const limit = Math.max(1, Math.floor(Number(maxPerChannel) || 5));
  const counts = new Map();
  const out = [];
  for (const row of shuffleArray(pool)) {
    const channelId = normalizeId(row?.channelId);
    if (!channelId) continue;
    const used = counts.get(channelId) || 0;
    if (used >= limit) continue;
    counts.set(channelId, used + 1);
    out.push(row);
  }
  return out;
}

function groupCandidatesByChannel(pool?) {
  const byChannel = new Map();
  for (const row of pool) {
    const channelId = normalizeId(row.channelId);
    if (!channelId) continue;
    if (!byChannel.has(channelId)) byChannel.set(channelId, []);
    byChannel.get(channelId).push(row);
  }
  return byChannel;
}

function pickSpawnCandidates(pool?, c?, limit = 12, recentChannelIds = new Set()) {
  if (!pool.length) return [];
  const byChannel = groupCandidatesByChannel(pool);
  let channelIds = [...byChannel.keys()];
  if (!channelIds.length) return [];

  const recent = recentChannelIds instanceof Set ? recentChannelIds : new Set(recentChannelIds || []);
  const freshChannels = shuffleArray(channelIds.filter((id?) => !recent.has(id)));
  const repeatChannels = shuffleArray(channelIds.filter((id?) => recent.has(id)));
  channelIds = freshChannels.length ? [...freshChannels, ...repeatChannels] : shuffleArray(channelIds);

  const picked = [];
  for (const channelId of channelIds) {
    if (picked.length >= limit) break;
    const rows = byChannel.get(channelId);
    if (!rows?.length) continue;
    const idx = Math.floor(Math.random() * rows.length);
    picked.push(rows[idx]);
  }
  return picked;
}

async function recentReactPressSpawnChannelIds(guildId?, c?, limit = 4) {
  const docs = await SiteDocument.find({
    docType: DOC,
    guildId: normalizeId(guildId),
    planKey: c.eventKey,
    status: { $in: ["active", "completed", "expired"] },
  })
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.floor(Number(limit) || 4)))
    .select("rawWebhook.channelId")
    .lean()
    .catch(() => []);
  return docs.map((row?) => normalizeId(row?.rawWebhook?.channelId)).filter(Boolean);
}

async function loadCandidatesFromGuild(client?, guild?, c?, nowMs = Date.now(), windowOpts: Record<string, any> = {}) {
  const channels = await listCandidateChannels(client, guild, c);
  const rows = [];
  for (const channel of channels.slice(0, 48)) {
    if (!channel?.messages?.fetch) continue;
    const messages = await channel.messages.fetch({ limit: 60 }).catch(() => null);
    if (!messages?.size) continue;
    for (const message of messages.values()) {
      const row = await candidateRowFromMessage(client, guild, message, c, nowMs);
      if (!row || !passesCandidateRow(row, c, guild, nowMs, windowOpts)) continue;
      rows.push(row);
    }
  }
  return rows;
}

async function lastReactPressSpawnAtMs(guildId?, c?) {
  const doc = await SiteDocument.findOne({
    docType: DOC,
    guildId: normalizeId(guildId),
    planKey: c.eventKey,
    status: { $in: ["active", "completed", "expired"] },
  })
    .sort({ createdAt: -1 })
    .select("createdAt")
    .lean()
    .catch(() => null);
  const ms = doc?.createdAt ? new Date(doc.createdAt).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}

async function resolveSpawnCandidatePool(client?, guild?, c?, nowMs = Date.now()) {
  const lastSpawnMs = await lastReactPressSpawnAtMs(guild.id, c);
  const window = computeSpawnMessageWindow(c, nowMs, lastSpawnMs);
  const windowOpts = {
    minCreatedAtMs: window.minCreatedAtMs,
    maxCreatedAtMs: window.maxCreatedAtMs,
    enforceMaxAge: true,
  };
  if (window.minCreatedAtMs > window.maxCreatedAtMs) {
    return [];
  }
  let pool = await loadCandidatesFromGuild(client, guild, c, nowMs, windowOpts);
  if (!pool.length) {
    await seedRecentCandidatesFromGuild(client, guild, c);
    pool = eligibleCandidates(guild, c, nowMs, windowOpts);
  }
  return pool;
}

async function activeChallenge(guildId?) {
  const now = new Date();
  return SiteDocument.findOne({
    docType: DOC,
    guildId: normalizeId(guildId),
    status: "active",
    "rawWebhook.expiresAt": { $gt: now },
  })
    .sort({ createdAt: -1 })
    .lean()
    .catch(() => null);
}

function spawnIntervalMs(c?) {
  if (c.minIntervalMs === c.maxIntervalMs) return c.minIntervalMs;
  return randomDelay(c);
}

function slotSpawnOffsetMs(c?, slotStartMs?) {
  const intervalMs = spawnIntervalMs(c);
  const minOffset = safeInt(c.spawnMinOffsetMs, 3 * 60 * 1000, 0, intervalMs - 60_000);
  const maxOffset = safeInt(c.spawnMaxOffsetMs, intervalMs - 3 * 60 * 1000, minOffset, intervalMs - 60_000);
  const span = Math.max(0, maxOffset - minOffset);
  const seed = `${c.eventKey}:${slotStartMs}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return minOffset + (span > 0 ? hash % (span + 1) : 0);
}

function slotSpawnAtMs(c?, slotStartMs?) {
  return slotStartMs + slotSpawnOffsetMs(c, slotStartMs);
}

function currentSlotWindow(c?, nowMs = Date.now()) {
  const startMs = parseLocalMs(c.startDate, DEFAULT_CONFIG.startDate);
  const intervalMs = c.minIntervalMs === c.maxIntervalMs ? c.minIntervalMs : c.minIntervalMs;
  if (nowMs < startMs) return { slotStart: startMs, slotEnd: startMs + intervalMs };
  const slotIndex = Math.floor((nowMs - startMs) / intervalMs);
  const slotStart = startMs + slotIndex * intervalMs;
  return { slotStart, slotEnd: slotStart + intervalMs, intervalMs };
}

async function shouldSpawnThisSlotNow(c?, guildId?, nowMs = Date.now()) {
  const { slotStart, slotEnd } = currentSlotWindow(c, nowMs);
  if (await hasSpawnInSlot(guildId, c, slotStart, slotEnd)) return false;
  return nowMs >= slotSpawnAtMs(c, slotStart);
}

async function resolveNextSpawnAtMs(client?, c?, nowMs = Date.now()) {
  const guildId = normalizeId(IDs.guilds.main);
  const startMs = parseLocalMs(c.startDate, DEFAULT_CONFIG.startDate);
  const intervalMs = c.minIntervalMs === c.maxIntervalMs ? c.minIntervalMs : c.minIntervalMs;
  if (nowMs < startMs) return startMs + slotSpawnOffsetMs(c, startMs);
  const { slotStart, slotEnd } = currentSlotWindow(c, nowMs);
  if (!(await hasSpawnInSlot(guildId, c, slotStart, slotEnd))) {
    const spawnAt = slotSpawnAtMs(c, slotStart);
    if (nowMs < spawnAt) return spawnAt;
    return nowMs + 15_000;
  }
  return slotSpawnAtMs(c, slotEnd);
}

async function hasSpawnInSlot(guildId?, c?, slotStart?, slotEnd?) {
  const found = await SiteDocument.findOne({
    docType: DOC,
    guildId: normalizeId(guildId),
    planKey: c.eventKey,
    status: { $in: ["active", "completed", "expired"] },
    createdAt: { $gte: new Date(slotStart), $lt: new Date(slotEnd) },
  })
    .select("_id")
    .lean()
    .catch(() => null);
  return Boolean(found);
}

function isCountableChatActivityMessage(message?) {
  if (!message || message.author?.bot) return false;
  if (message.system) return false;
  if (message.webhookId) return false;
  return hasReactPressTargetBody(message);
}

async function getLastReactPressRoundEndedAt(guildId?, c?) {
  const gid = normalizeId(guildId);
  if (!gid) return null;
  const last = await SiteDocument.findOne({
    docType: DOC,
    guildId: gid,
    planKey: c.eventKey,
    status: { $in: ["completed", "expired"] },
  })
    .sort({ updatedAt: -1 })
    .select({ status: 1, rawWebhook: 1, updatedAt: 1 })
    .lean()
    .catch(() => null);
  if (!last) return null;
  const status = normalizeId(last.status);
  const claimedAt = last?.rawWebhook?.claimedAt ? new Date(last.rawWebhook.claimedAt).getTime() : NaN;
  const expiredAt = last?.rawWebhook?.expiredAt ? new Date(last.rawWebhook.expiredAt).getTime() : NaN;
  const updatedAt = last?.updatedAt ? new Date(last.updatedAt).getTime() : NaN;
  if (status === "completed" && Number.isFinite(claimedAt)) return new Date(claimedAt);
  if (status === "expired" && Number.isFinite(expiredAt)) return new Date(expiredAt);
  if (Number.isFinite(updatedAt)) return new Date(updatedAt);
  return null;
}

async function countChatMessagesSince(client?, channelId?, sinceMs?, minRequired?) {
  const chatId = normalizeId(channelId);
  if (!chatId || !Number.isFinite(sinceMs)) return 0;
  const channel = await client.channels.fetch(chatId).catch(() => null);
  if (!channel?.messages?.fetch) return 0;
  let count = 0;
  let beforeId = undefined;
  const maxPages = 6;
  for (let page = 0; page < maxPages; page += 1) {
    const opts: Record<string, any> = { limit: 100 };
    if (beforeId) opts.before = beforeId;
    const batch = await channel.messages.fetch(opts).catch(() => null);
    if (!batch?.size) break;
    const ordered = [...batch.values()].sort((a?, b?) => b.createdTimestamp - a.createdTimestamp);
    let reachedOlder = false;
    for (const message of ordered) {
      if (message.createdTimestamp < sinceMs) {
        reachedOlder = true;
        break;
      }
      if (isCountableChatActivityMessage(message)) count += 1;
      if (count >= minRequired) return count;
    }
    if (reachedOlder) break;
    const oldest = ordered[ordered.length - 1];
    beforeId = oldest?.id;
    if (!beforeId || batch.size < 100) break;
  }
  return count;
}

async function hasEnoughChatMessagesSinceLastRound(client?, guild?, c?) {
  const minRequired = safeInt(
    c.minChatMessagesBetweenRounds,
    DEFAULT_CONFIG.minChatMessagesBetweenRounds,
    1,
    100,
  );
  const chatId = normalizeId(c.chatActivityChannelId || c.announceChannelId || IDs.channels?.chat || "");
  if (!chatId) return true;
  const endedAt = await getLastReactPressRoundEndedAt(guild?.id, c);
  if (!endedAt) return true;
  const count = await countChatMessagesSince(client, chatId, endedAt.getTime(), minRequired);
  return count >= minRequired;
}

async function expireReactPressChallenge(client?, guildId?, c?, row?, { announce = false } = {}) {
  const now = new Date();
  const updated = await SiteDocument.updateOne(
    { _id: row._id, status: "active" },
    { $set: { status: "expired", "rawWebhook.expiredAt": now } },
  ).catch(() => null);
  if (!updated?.modifiedCount) return false;

  const channelId = normalizeId(row?.rawWebhook?.channelId || c.channelId);
  const messageId = normalizeId(row?.rawWebhook?.messageId);
  const ch = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
  const msg = ch && messageId ? await ch.messages.fetch(messageId).catch(() => null) : null;
  if (msg) await removeReactPressEmojiFromMessage(msg, c.emoji);
  if (announce) await announceReactPressExpired(client, c, channelId);
  return true;
}

async function expireOldChallenges(client?, guildId?, c?, { announce = true } = {}) {
  const now = new Date();
  const gid = normalizeId(guildId);
  let announcedAny = false;
  const expired = await SiteDocument.find({
    docType: DOC,
    guildId: gid,
    status: "active",
    "rawWebhook.expiresAt": { $lte: now },
  }).lean().catch(() => []);
  for (const row of expired) {
    const did = await expireReactPressChallenge(client, guildId, c, row, { announce });
    if (did && announce) announcedAny = true;
  }
  const liveActives = await SiteDocument.find({
    docType: DOC,
    guildId: gid,
    status: "active",
    "rawWebhook.expiresAt": { $gt: now },
  })
    .sort({ createdAt: -1 })
    .lean()
    .catch(() => []);
  for (const row of liveActives.slice(1)) {
    await expireReactPressChallenge(client, guildId, c, row, { announce: false });
  }
  return announcedAny;
}

async function ensureActiveChallengeReaction(client?, c?, active?) {
  const channelId = normalizeId(active?.rawWebhook?.channelId || c.channelId);
  const messageId = normalizeId(active?.rawWebhook?.messageId);
  if (!channelId || !messageId) return;
    const stillLive = await activeChallenge(normalizeId(active?.guildId) || normalizeId(IDs.guilds.main));
  const stillMsgId = normalizeId(stillLive?.rawWebhook?.messageId);
  if (!stillLive || stillMsgId !== messageId) return;
  const ch = await client.channels.fetch(channelId).catch(() => null);
  const msg = ch?.messages ? await ch.messages.fetch(messageId).catch(() => null) : null;
  if (!msg) return;
  const hasReact = [...(msg.reactions?.cache?.values() || [])].some((reaction?) => sameEmoji(reaction, c.emoji));
  if (!hasReact) {
    await msg.react(c.emoji).catch((err?) =>
      global.logger?.warn?.("[PREMI LA REACT] Reaction mancante, re-add fallito:", err?.message || err),
    );
  }
}

async function claimReactPressRound(gid?, c?, messageId?, uid?, now = new Date()) {
  const filter = {
    docType: DOC,
    guildId: normalizeId(gid),
    dedupeKey: dedupeKey(c, messageId),
    status: "active",
    "rawWebhook.expiresAt": { $gt: now },
  };
  const update = {
    $set: {
      status: "completed",
      userId: normalizeId(uid),
      "rawWebhook.winnerUserId": normalizeId(uid),
      "rawWebhook.claimedAt": now,
    },
    $unset: {
      "rawWebhook.rewardsGrantedAt": 1,
      "rawWebhook.announceSentAt": 1,
      "rawWebhook.housePointsGranted": 1,
    },
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const doc = await SiteDocument.findOneAndUpdate(filter, update, { new: true }).lean().catch(() => null);
    if (doc) return doc;
    if (attempt < 2) await new Promise((resolve?) => setTimeout(resolve, 300));
  }
  return null;
}

function reactPressRewardKey(c?, messageId?, uid?) {
  return `${c.eventKey}:${normalizeId(messageId)}:${normalizeId(uid)}`;
}

async function fulfillReactPressWin(client?, c?, doc?, { user = null, message = null, announce = true } = {}) {
  if (!doc || normalizeId(doc.status) !== "completed") return false;
  const gid = normalizeId(doc.guildId);
  const uid = normalizeId(doc.userId || doc.rawWebhook?.winnerUserId);
  const messageId = normalizeId(doc.rawWebhook?.messageId);
  const channelId = normalizeId(doc.rawWebhook?.channelId || message?.channelId || message?.channel?.id);
  if (!isValidGuildUserId(gid, uid) || !messageId) return false;

  const alreadyGranted = Boolean(doc.rawWebhook?.rewardsGrantedAt);
  const rewardKey = reactPressRewardKey(c, messageId, uid);
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = normalizeId(eventCfg?.eventKey) || c.eventKey;
  const rewardGaleoni = safeInt(doc.rawWebhook?.rewardGaleoni, c.rewardGaleoni, 0, 100000);
  const rewardHousePoints = safeInt(doc.rawWebhook?.rewardHousePoints, c.rewardHousePoints, 0, 100000);
  const finaleChaos = doc.rawWebhook?.finaleChaos && typeof doc.rawWebhook.finaleChaos === "object"
    ? doc.rawWebhook.finaleChaos
    : null;

    const galeoniAlreadyPaid = alreadyGranted
    ? true
    : await hasGringottRewardKey(gid, uid, rewardKey).catch(() => false);

  let galeoni = null;
  let houseAward = null;
  if (!alreadyGranted) {
    if (galeoniAlreadyPaid) {
      await SiteDocument.updateOne(
        { _id: doc._id, status: "completed" },
        {
          $set: {
            "rawWebhook.rewardsGrantedAt": new Date(),
            "rawWebhook.housePointsGranted": true,
            "rawWebhook.announceSentAt": doc.rawWebhook?.announceSentAt || new Date(0),
          },
        },
      ).catch(() => null);
    } else {
      galeoni = await addGaleoni({
        guildId: gid,
        userId: uid,
        amount: rewardGaleoni,
        reason: finaleChaos ? "Finale chaos — Premi la react" : "Premi la react",
        actorId: "bot",
        source: finaleChaos ? "hogwarts_finale_chaos" : "premi_la_react",
        eventKey,
        rewardKey,
      });

      if (galeoni?.ok === false && galeoni.code === "duplicate_reward") {
        await SiteDocument.updateOne(
          { _id: doc._id, status: "completed" },
          {
            $set: {
              "rawWebhook.rewardsGrantedAt": new Date(),
              "rawWebhook.housePointsGranted": true,
              "rawWebhook.announceSentAt": doc.rawWebhook?.announceSentAt || new Date(0),
            },
          },
        ).catch(() => null);
      } else {
        const houseLock = await SiteDocument.findOneAndUpdate(
          {
            _id: doc._id,
            status: "completed",
            "rawWebhook.housePointsGranted": { $ne: true },
          },
          { $set: { "rawWebhook.housePointsGranted": true } },
          { new: true },
        )
          .lean()
          .catch(() => null);
        if (houseLock) {
          houseAward = await awardHousePoints(client, gid, uid, rewardHousePoints);
        }

        if (finaleChaos?.firstSlot && !doc.rawWebhook?.finaleBoostGranted) {
          try {
            const { grantFinaleChaosBoost } = require("./hogwartsFinaleChaosDayService") as typeof import("./hogwartsFinaleChaosDayService");
            await grantFinaleChaosBoost(client, {
              guildId: gid,
              userId: uid,
              boostType: finaleChaos.boostType || "housePoints",
              boostScope: finaleChaos.boostScope || "personal",
              durationMs: finaleChaos.firstSlotBoostDurationMs || 3600000,
              eventKey,
            });
            await SiteDocument.updateOne(
              { _id: doc._id },
              { $set: { "rawWebhook.finaleBoostGranted": true } },
            ).catch(() => null);
          } catch (err) {
            global.logger?.warn?.("[PREMI LA REACT] finale boost:", err?.message || err);
          }
        }

        await SiteDocument.updateOne(
          { _id: doc._id, status: "completed" },
          { $set: { "rawWebhook.rewardsGrantedAt": new Date() } },
        ).catch(() => null);

        if (galeoni?.ok === false) {
          global.logger?.warn?.("[PREMI LA REACT] galeoni non assegnati:", galeoni.code, uid);
        }
      }
    }
  }

    const shouldAnnounce = announce && !galeoniAlreadyPaid;
  if (shouldAnnounce) {
    const announceLock = await SiteDocument.findOneAndUpdate(
      {
        _id: doc._id,
        status: "completed",
        $or: [
          { "rawWebhook.announceSentAt": { $exists: false } },
          { "rawWebhook.announceSentAt": null },
        ],
      },
      { $set: { "rawWebhook.announceSentAt": new Date() } },
      { new: true },
    )
      .lean()
      .catch(() => null);
    if (announceLock) {
      const guild =
        client.guilds.cache.get(gid) ||
        (await client.guilds.fetch(gid).catch(() => null));
      const member = guild
        ? await getGuildMemberCached(guild, uid).catch(() => null)
        : null;
      const winnerName = member?.displayName || user?.username || "Utente";
      const clickerHouse = await resolveSortedHouse(gid, uid, eventKey);
      const rewardText = [
        rewardGaleoni > 0 ? formatGaleoni(rewardGaleoni) : "",
        (houseAward?.points || rewardHousePoints) > 0
          ? `${houseAward?.points || rewardHousePoints} punti`
          : "",
        finaleChaos?.firstSlot
          ? `boost 2× ${finaleChaos.boostType === "exp" ? "EXP" : "punti casa"} ${finaleChaos.boostScope === "house" ? "di casata" : "personale"} (1h, si somma)`
          : "",
      ]
        .filter(Boolean)
        .join(" + ") || "punto evento";
      const galeoniNote =
        galeoni?.ok === false
          ? "\n<a:VC_Alert:1482706673176150077> Premi in elaborazione (riprova automatica al prossimo tick)."
          : "";
      const embed = new EmbedBuilder()
        .setColor(0xd4af37)
        .setTitle("<:VC_harrypotters:1510941833222557696> Premi la react!")
        .setDescription(
          [
            `<:VC_Dobby:1510941838138413146> **${winnerName}** ha cliccato per primo e vince **${rewardText}**.`,
            channelId ? `<:VC_Owlcall:1510941826176126976> Era in <#${channelId}>.` : "",
            galeoniNote,
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .setFooter({
          text: `Punti assegnati a ${getHouseMeta(houseAward?.houseId || clickerHouse)?.label || houseAward?.houseId || clickerHouse || "casa"}.`,
        })
        .setTimestamp();
      await sendReactPressAnnounce(client, c, { embeds: [embed], allowedMentions: { repliedUser: false } });
    }
  }

  let msg = message;
  if (!msg && channelId) {
    const ch = await client.channels.fetch(channelId).catch(() => null);
    msg = ch?.messages ? await ch.messages.fetch(messageId).catch(() => null) : null;
  }
  if (msg) {
    const botId = normalizeId(client?.user?.id);
    const react =
      [...(msg.reactions?.cache?.values() || [])].find((reaction?) => sameEmoji(reaction, c.emoji)) || null;
    if (botId && react) await react.users?.remove?.(botId).catch(() => null);
    if (react) await react.users?.remove?.(uid).catch(() => null);
    await removeReactPressEmojiFromMessage(msg, c.emoji);
  }
  return !alreadyGranted;
}

async function catchUpActiveReactPressReactions(client?, c?, live?) {
  const claimCfg = cfgFromReactPressDoc(client, live);
  const channelId = normalizeId(live?.rawWebhook?.channelId || claimCfg.channelId);
  const messageId = normalizeId(live?.rawWebhook?.messageId);
  const gid = normalizeId(live?.guildId) || normalizeId(IDs.guilds.main);
  if (!channelId || !messageId || !gid) return false;

  const ch = await client.channels.fetch(channelId).catch(() => null);
  const message = ch?.messages ? await ch.messages.fetch(messageId).catch(() => null) : null;
  if (!message) return false;

  const reaction =
    [...(message.reactions?.cache?.values() || [])].find((row?) => sameEmoji(row, claimCfg.emoji)) || null;
  if (!reaction) return false;

  const users = await reaction.users.fetch().catch(() => null);
  if (!users?.size) return false;

  const botId = normalizeId(client?.user?.id);
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = normalizeId(eventCfg?.eventKey) || claimCfg.eventKey;
  const guild =
    message.guild ||
    client.guilds.cache.get(gid) ||
    (await client.guilds.fetch(gid).catch(() => null));

    const candidates = [...users.values()]
    .filter((u?) => u && !u.bot && normalizeId(u.id) !== botId)
    .sort((a?, b?) => String(a.id).localeCompare(String(b.id)));

  for (const user of candidates) {
    const uid = normalizeId(user.id);
    if (!isValidGuildUserId(gid, uid)) continue;
    const member = guild ? await getGuildMemberCached(guild, uid).catch(() => null) : null;
    if (await isUserHighStaffExcludedFromHogwartsEvent(client, uid, member)) continue;
    if (claimCfg.sortedOnly) {
      const house = await resolveSortedHouse(gid, uid, eventKey);
      if (!house) {
        await reaction.users?.remove?.(uid).catch(() => null);
        continue;
      }
    }
    const doc = await claimReactPressRound(gid, claimCfg, messageId, uid, new Date());
    if (!doc) continue;
    global.logger?.warn?.("[PREMI LA REACT] catch-up win dopo riavvio:", uid, messageId);
    await fulfillReactPressWin(client, claimCfg, doc, { user, message, announce: true });
    return true;
  }
  return false;
}

async function recoverUnfulfilledReactPressWins(client?, c?) {
  const gid = normalizeId(IDs.guilds.main);
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const pending = await SiteDocument.find({
    docType: DOC,
    guildId: gid,
    status: "completed",
    "rawWebhook.claimedAt": { $gte: since },
    $or: [
      { "rawWebhook.rewardsGrantedAt": { $exists: false } },
      { "rawWebhook.rewardsGrantedAt": null },
    ],
  })
    .sort({ "rawWebhook.claimedAt": 1 })
    .limit(20)
    .lean()
    .catch(() => []);
  let recovered = 0;
  let backfilled = 0;
  for (const doc of pending) {
    const uid = normalizeId(doc.userId || doc.rawWebhook?.winnerUserId);
    const messageId = normalizeId(doc.rawWebhook?.messageId);
    if (!uid || !messageId) continue;
    const rewardKey = reactPressRewardKey(c, messageId, uid);
    const alreadyPaid = await hasGringottRewardKey(gid, uid, rewardKey).catch(() => false);
    if (alreadyPaid) {
            await fulfillReactPressWin(client, c, doc, { announce: false });
      backfilled += 1;
      continue;
    }
    const ok = await fulfillReactPressWin(client, c, doc, { announce: true });
    if (ok) recovered += 1;
  }
  if (recovered) global.logger?.warn?.(`[PREMI LA REACT] recuperati ${recovered} premi dopo crash/riavvio`);
  if (backfilled) global.logger?.warn?.(`[PREMI LA REACT] allineati ${backfilled} flag su win già pagati`);
  return recovered;
}

async function messageHasReactPressEmoji(message?, emoji?) {
  if (!message?.id) return false;
  let msg = message;
  if (!msg.reactions?.cache?.size && typeof msg.fetch === "function") {
    msg = await msg.fetch().catch(() => msg);
  }
  return [...(msg.reactions?.cache?.values() || [])].some((reaction?) => sameEmoji(reaction, emoji));
}

async function removeReactPressEmojiFromMessage(message?, emoji?) {
  if (!message?.id) return false;
  let msg = message;
  if (typeof msg.fetch === "function") {
    msg = await msg.fetch().catch(() => msg);
  }
  const botId = normalizeId(msg.client?.user?.id);
  let matched = false;

  for (const reaction of [...(msg.reactions?.cache?.values() || [])]) {
    if (!sameEmoji(reaction, emoji)) continue;
    matched = true;

        const removedAll = await reaction.remove().then(() => true).catch(() => false);
    if (removedAll) return true;

        if (botId) await reaction.users.remove(botId).catch(() => null);

        try {
      const users = await reaction.users.fetch().catch(() => reaction.users?.cache || null);
      if (users?.size) {
        for (const user of users.values()) {
          if (botId && normalizeId(user.id) === botId) continue;
          await reaction.users.remove(user.id).catch(() => null);
        }
      }
    } catch (_) {
          }
  }

  if (!matched && botId) {
        try {
      const resolved =
        msg.reactions.resolve(emoji) ||
        [...(msg.reactions?.cache?.values() || [])].find((reaction?) => sameEmoji(reaction, emoji));
      if (resolved) await resolved.users.remove(botId).catch(() => null);
    } catch (_) {
          }
  }

    const fresh = await msg.channel?.messages?.fetch?.(msg.id).catch(() => null);
  if (!fresh) return false;
  const still = [...(fresh.reactions?.cache?.values() || [])].filter((reaction?) => sameEmoji(reaction, emoji));
  if (!still.length) return true;

  for (const reaction of still) {
    const removedAll = await reaction.remove().then(() => true).catch(() => false);
    if (removedAll) continue;
    if (botId) await reaction.users.remove(botId).catch(() => null);
    const users = await reaction.users.fetch().catch(() => null);
    if (!users?.size) continue;
    for (const user of users.values()) {
      await reaction.users.remove(user.id).catch(() => null);
    }
  }

  const verify = await msg.channel?.messages?.fetch?.(msg.id).catch(() => null);
  const left = [...(verify?.reactions?.cache?.values() || [])].some((reaction?) => sameEmoji(reaction, emoji));
  if (left) {
    global.logger?.warn?.(
      "[PREMI LA REACT] impossibile rimuovere ⚡ dal messaggio",
      msg.id,
      "(serve Manage Messages sul canale?)",
    );
  }
  return !left;
}

async function clearOrphanReactPressEmojis(client?, guildId?, c?, channelId?, keepMessageId = "") {
  const channel = await client.channels.fetch(normalizeId(channelId)).catch(() => null);
  if (!channel?.messages?.fetch) return;
  const messages = await channel.messages.fetch({ limit: 40 }).catch(() => null);
  if (!messages?.size) return;
  const keepId = normalizeId(keepMessageId);
  for (const message of messages.values()) {
    if (keepId && normalizeId(message.id) === keepId) continue;
    const hasEventEmoji = [...(message.reactions?.cache?.values() || [])].some((reaction?) => sameEmoji(reaction, c.emoji));
    if (hasEventEmoji) await removeReactPressEmojiFromMessage(message, c.emoji);
  }
}

async function todayChallengeCount(guildId?) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return SiteDocument.countDocuments({
    docType: DOC,
    guildId: normalizeId(guildId),
    createdAt: { $gte: start, $lt: end },
  }).catch(() => 0);
}

async function trySpawnReactPressOnCandidate(client?, guild?, c?, chosen?) {
  const channel = await client.channels.fetch(chosen.channelId).catch(() => null);
  if (!channel?.messages) return { ok: false, code: "channel_missing" };
  if (isArchivedReactPressChannel(channel)) return { ok: false, code: "thread_archived" };
  const message = await channel.messages.fetch(chosen.messageId).catch(() => null);
  if (!message || isInvalidReactPressMessage(message)) return { ok: false, code: "message_missing" };
  const authorMember = await getGuildMemberCached(guild, chosen.authorId).catch(() => null);
  if (!message.author?.bot && (await isUserHighStaffExcludedFromHogwartsEvent(client, chosen.authorId, authorMember))) {
    return { ok: false, code: "author_excluded" };
  }
  const key = dedupeKey(c, message.id);
  const existing = await SiteDocument.findOne({
    docType: DOC,
    guildId: guild.id,
    dedupeKey: key,
  })
    .select("status rawWebhook.expiresAt")
    .lean()
    .catch(() => null);
  const existingStatus = normalizeId(existing?.status);
  if (existingStatus === "completed") return { ok: false, code: "message_already_won" };
  if (existingStatus === "active") {
    const expMs = new Date(existing?.rawWebhook?.expiresAt || 0).getTime();
    if (Number.isFinite(expMs) && expMs > Date.now()) return { ok: false, code: "message_already_active" };
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + c.activeDurationMs);
  const rawWebhook = {
    eventKey: c.eventKey,
    channelId: channel.id,
    messageId: message.id,
    authorId: normalizeId(message.author?.id),
    emoji: c.emoji,
    rewardGaleoni: c.rewardGaleoni,
    rewardHousePoints: c.rewardHousePoints,
    expiresAt,
    activeDurationMs: c.activeDurationMs,
    hintBeforeExpiryMs: c.hintBeforeExpiryMs,
    ...(c.finaleChaos && typeof c.finaleChaos === "object" ? { finaleChaos: c.finaleChaos } : {}),
  };
  let doc;
  try {
    doc = await SiteDocument.findOneAndUpdate(
      { docType: DOC, guildId: guild.id, dedupeKey: key },
      {
        $set: {
          status: "active",
          userId: HOUSE_POINTS_OWNER_ID,
          planKey: c.eventKey,
          rawWebhook,
        },
        $setOnInsert: {
          docType: DOC,
          guildId: guild.id,
          dedupeKey: key,
          createdBy: "bot",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    global.logger?.warn?.("[PREMI LA REACT] doc update:", err?.message || err);
    doc = null;
  }
  if (!doc || normalizeId(doc.status) !== "active") {
    return { ok: false, code: "doc_conflict" };
  }
  try {
    await message.react(c.emoji);
  } catch (err) {
    const errMsg = String(err?.message || err || "");
        await SiteDocument.deleteOne({ _id: doc._id }).catch(() => null);
    if (/thread is archived/i.test(errMsg)) {
      return { ok: false, code: "thread_archived" };
    }
    global.logger?.warn?.("[PREMI LA REACT] react fallita:", errMsg);
    return { ok: false, code: "react_failed" };
  }
  const rivalActive = await SiteDocument.findOne({
    docType: DOC,
    guildId: guild.id,
    status: "active",
    "rawWebhook.expiresAt": { $gt: new Date() },
    _id: { $ne: doc._id },
  })
    .select("_id")
    .lean()
    .catch(() => null);
  if (rivalActive) {
    await SiteDocument.deleteOne({ _id: doc._id }).catch(() => null);
    await removeReactPressEmojiFromMessage(message, c.emoji);
    return { ok: false, code: "spawn_race_lost" };
  }
  return { ok: true, message, channel };
}

async function sendReactPressAnnounce(client?, c?, payload?) {
  const announceChannelId = normalizeId(c.announceChannelId);
  const announceChannel = announceChannelId ? await client.channels.fetch(announceChannelId).catch(() => null) : null;
  if (!announceChannel?.send) {
    global.logger?.warn?.(`[PREMI LA REACT] Canale annuncio #chat (${announceChannelId || "?"}) non disponibile.`);
    return false;
  }
  try {
    await announceChannel.send(payload);
    return true;
  } catch (err) {
    global.logger?.warn?.("[PREMI LA REACT] Avviso annuncio:", err?.message || err);
    return false;
  }
}

async function announceReactPressSpawn(client?, guild?, c?, message?) {
  const eventsRoleId = normalizeId(IDs.roles?.Events);
  let roleId = normalizeId(c.pingRoleId);
  if (!roleId || roleId === eventsRoleId) roleId = resolveReactPressPingRoleId(client);
  const emoji = c.emoji || "⚡";
  const durationMin = Math.max(1, Math.round(c.activeDurationMs / 60_000));
  const chaos = c.finaleChaos && typeof c.finaleChaos === "object" ? c.finaleChaos : null;
  const prizeBlock = chaos
    ? [
        "",
        "**Premi:**",
        `• **${formatGaleoni(c.rewardGaleoni)}**`,
        `• **${c.rewardHousePoints} punti casa** (con multi animale / boost)`,
        chaos.firstSlot
          ? `• **Bonus 1° slot:** boost **2× ${chaos.boostType === "exp" ? "EXP" : "punti casa"} ${chaos.boostScope === "house" ? "di casata" : "personale"}** per 1 ora (si somma agli altri)`
          : "",
      ].filter(Boolean)
    : [];
  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(`<:VC_harrypotters:1510941833222557696> Premi la react!`)
    .setDescription(
      [
        `<:VC_Dobby:1510941838138413146> È stata messa la reaction **${emoji}** su un messaggio casuale in un **canale a caso** del server — **cercalo tu!**`,
        "",
        `<:VC_Owlcall:1510941826176126976> Solo utenti **smistati** possono partecipare!.`,
        `<a:VC_pixeltime:1482535344103620771> Hai **${durationMin} minuti** per trovarla.`,
        ...prizeBlock,
      ].join("\n"),
    )
    .setTimestamp();
  await sendReactPressAnnounce(client, c, {
    content: roleId ? `<@&${roleId}>` : null,
    embeds: [embed],
    allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
  });
}

async function announceReactPressExpired(client?, c?, channelId = "") {
  const emoji = c.emoji || "⚡";
  const durationMin = Math.max(1, Math.round(c.activeDurationMs / 60_000));
  const chId = normalizeId(channelId);
  const channelLine = chId
    ? `<:VC_Dobby:1510941838138413146> Era in ${`<#${chId}>`}.`
    : "";
  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(`<:VC_harrypotters:1510941833222557696> Premi la react!`)
    .setDescription(
      [
        `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Nessuno ha trovato la reaction **${emoji}** in tempo (**${durationMin} minuti**).`,
        channelLine,
        "",
        `<:VC_Owlcall:1510941826176126976> Restate in alert per il prossimo round!`,
      ].filter(Boolean).join("\n"),
    )
    .setTimestamp();
  await sendReactPressAnnounce(client, c, {
    embeds: [embed],
    allowedMentions: { parse: [] },
  });
}

function reactPressHintDue(active?, c?, nowMs = Date.now()) {
  if (!active || normalizeId(active.status) !== "active") return false;
  if (active?.rawWebhook?.hintSentAt) return false;
  const expMs = new Date(active?.rawWebhook?.expiresAt || 0).getTime();
  if (!Number.isFinite(expMs) || expMs <= nowMs) return false;
  const hintBeforeMs = safeInt(c.hintBeforeExpiryMs, DEFAULT_CONFIG.hintBeforeExpiryMs, 60 * 1000, c.activeDurationMs);
  return nowMs >= expMs - hintBeforeMs;
}

async function announceReactPressHint(client?, c?, active?) {
  const channelId = normalizeId(active?.rawWebhook?.channelId);
  if (!channelId) return false;
  const expMs = new Date(active?.rawWebhook?.expiresAt || 0).getTime();
  const nowMs = Date.now();
  if (!Number.isFinite(expMs) || expMs <= nowMs) return false;
  const hintClaim = await SiteDocument.findOneAndUpdate(
    {
      _id: active._id,
      status: "active",
      $or: [{ "rawWebhook.hintSentAt": { $exists: false } }, { "rawWebhook.hintSentAt": null }],
    },
    { $set: { "rawWebhook.hintSentAt": new Date() } },
    { new: true },
  )
    .lean()
    .catch(() => null);
  if (!hintClaim) return false;
  const remainingMin = Math.max(1, Math.ceil((expMs - nowMs) / 60_000));
  const emoji = c.emoji || "⚡";
  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(`<:VC_harrypotters:1510941833222557696> Premi la react — indizio!`)
    .setDescription(
      [
        `<:VC_Owlcall:1510941826176126976> Nessuno ha ancora trovato la reaction **${emoji}**.`,
        "",
        `<:VC_Dobby:1510941838138413146> **Indizio:** è su un messaggio in ${channelId ? `<#${channelId}>` : "un canale del server"}.`,
        `<a:VC_pixeltime:1482535344103620771> Restano circa **${remainingMin} minuti**.`,
      ].join("\n"),
    )
    .setTimestamp();
  const sent = await sendReactPressAnnounce(client, c, {
    embeds: [embed],
    allowedMentions: { parse: [] },
  });
  return Boolean(sent);
}

async function maybeAnnounceReactPressHint(client?, c?, active?) {
  if (!reactPressHintDue(active, c)) return false;
  return announceReactPressHint(client, c, active);
}

async function canSpawnNewReactPressRound(client?, guild?, c?) {
  const gid = normalizeId(guild?.id);
  if (!gid) return false;
  const live = await activeChallenge(gid);
  if (live) return false;
  const { slotStart, slotEnd } = currentSlotWindow(c);
  if (await hasSpawnInSlot(gid, c, slotStart, slotEnd)) return false;
  if (!(await shouldSpawnThisSlotNow(c, gid))) return false;
  if (await todayChallengeCount(gid) >= c.maxPerDay) return false;
  if (!(await hasEnoughChatMessagesSinceLastRound(client, guild, c))) return false;
  return true;
}

async function spawnReactPressChallengeUnlocked(client?, guild?, c?) {
  await expireOldChallenges(client, guild.id, c, { announce: true });
  const live = await activeChallenge(guild.id);
  if (live) {
    await ensureActiveChallengeReaction(client, c, live);
    await maybeAnnounceReactPressHint(client, c, live);
    return false;
  }
  if (!(await canSpawnNewReactPressRound(client, guild, c))) return false;
  if (c.randomChannelSpawn) {
    return spawnReactPressViaRandomChannel(client, guild, c);
  }
  return spawnReactPressViaCandidatePool(client, guild, c);
}

async function spawnReactPressChallenge(client?, guild?, c?) {
  const gid = normalizeId(guild?.id);
  if (!gid) return false;
  return withReactPressSpawnLock(client, gid, () => spawnReactPressChallengeUnlocked(client, guild, c));
}

async function resolveNextReactPressTickDelayMs(client?, c?) {
  const guildId = normalizeId(IDs.guilds.main);
  const now = Date.now();
  const active = await activeChallenge(guildId);
  if (active?.rawWebhook?.finaleChaos) {
    const expMs = new Date(active?.rawWebhook?.expiresAt || 0).getTime();
    let delay = Number.isFinite(expMs) ? Math.max(15_000, expMs - now + 5_000) : 15_000;
    const rc = cfgFromReactPressDoc(client, active);
    if (!active?.rawWebhook?.hintSentAt && Number.isFinite(expMs) && expMs > now) {
      const hintBeforeMs = safeInt(rc.hintBeforeExpiryMs, DEFAULT_CONFIG.hintBeforeExpiryMs, 60 * 1000, rc.activeDurationMs);
      const hintAtMs = expMs - hintBeforeMs;
      if (hintAtMs > now) {
        delay = Math.min(delay, Math.max(15_000, hintAtMs - now));
      }
    }
    return Math.min(delay, 20_000);
  }
  if (!eventOpen(c)) return 30 * 60 * 1000;
  const startMs = parseLocalMs(c.startDate, DEFAULT_CONFIG.startDate);
  if (now < startMs) {
    return Math.max(15_000, slotSpawnAtMs(c, startMs) - now);
  }
  if (active) {
    const expMs = new Date(active?.rawWebhook?.expiresAt || 0).getTime();
    let delay = Number.isFinite(expMs) ? Math.max(15_000, expMs - now + 5_000) : 15_000;
    if (!active?.rawWebhook?.hintSentAt && Number.isFinite(expMs) && expMs > now) {
      const hintBeforeMs = safeInt(c.hintBeforeExpiryMs, DEFAULT_CONFIG.hintBeforeExpiryMs, 60 * 1000, c.activeDurationMs);
      const hintAtMs = expMs - hintBeforeMs;
      if (hintAtMs > now) {
        delay = Math.min(delay, Math.max(15_000, hintAtMs - now));
      }
    }
    return delay;
  }
  const nextSpawnAt = await resolveNextSpawnAtMs(client, c, now);
  return Math.max(15_000, nextSpawnAt - now);
}

async function runPremiLaReactTick(client?, reason = "tick") {
  const c = cfg(client);
  const guild =
    client.guilds.cache.get(IDs.guilds.main) ||
    (await client.guilds.fetch(IDs.guilds.main).catch(() => null));
  if (!guild) {
    global.logger?.warn?.(`[PREMI LA REACT] Guild main assente (${reason}).`);
    return false;
  }
  const live = await activeChallenge(guild.id);
  if (live?.rawWebhook?.finaleChaos) {
    const rc = cfgFromReactPressDoc(client, live);
    await expireOldChallenges(client, guild.id, rc, { announce: true });
    const stillLive = await activeChallenge(guild.id);
    if (stillLive) {
      await ensureActiveChallengeReaction(client, rc, stillLive);
      await maybeAnnounceReactPressHint(client, rc, stillLive);
    }
    return true;
  }
  if (!eventOpen(c)) return false;
  return spawnReactPressChallenge(client, guild, c);
}

async function resumeReactPressOnBoot(client?) {
  const base = cfg(client);
  const guild =
    client.guilds.cache.get(IDs.guilds.main) ||
    (await client.guilds.fetch(IDs.guilds.main).catch(() => null));
  if (!guild) return;
    const live = await activeChallenge(guild.id);
  if (live) {
    const c = cfgFromReactPressDoc(client, live);
    await recoverUnfulfilledReactPressWins(client, c).catch((err?) =>
      global.logger?.warn?.("[PREMI LA REACT] recover unfulfilled:", err?.message || err),
    );
    const caughtUp = await catchUpActiveReactPressReactions(client, c, live).catch((err?) => {
      global.logger?.warn?.("[PREMI LA REACT] catch-up reactions:", err?.message || err);
      return false;
    });
    if (caughtUp) return;
    await ensureActiveChallengeReaction(client, c, live);
    await maybeAnnounceReactPressHint(client, c, live);
    return;
  }
  if (!eventOpen(base)) return;
  await recoverUnfulfilledReactPressWins(client, base).catch((err?) =>
    global.logger?.warn?.("[PREMI LA REACT] recover unfulfilled:", err?.message || err),
  );
  await expireOldChallenges(client, guild.id, base, { announce: true });
}

async function tick(client?) {
  await runPremiLaReactTick(client, "scheduled");
}

function startReactPressEventLoop(client?) {
  const { isHogwartsRuntimeDisabled } = require("../../Utils/Web/hogwartsRuntimeKillSwitch") as typeof import("../../Utils/Web/hogwartsRuntimeKillSwitch");
  if (isHogwartsRuntimeDisabled(client)) return;
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  const schedule = () => {
    void resolveNextReactPressTickDelayMs(client, cfg(client))
      .then((delay?) => {
        const timer = setTimeout(async () => {
          await tick(client).catch((err?) => global.logger?.warn?.("[PREMI LA REACT] tick:", err?.message || err));
          schedule();
        }, delay);
        timer.unref?.();
        client._premiLaReactTimer = timer;
      })
      .catch((err?) => {
        global.logger?.warn?.("[PREMI LA REACT] schedule:", err?.message || err);
        const timer = setTimeout(() => schedule(), 60_000);
        timer.unref?.();
        client._premiLaReactTimer = timer;
      });
  };
  const bootstrap = () => {
    void resumeReactPressOnBoot(client).catch((err?) =>
      global.logger?.warn?.("[PREMI LA REACT] boot resume:", err?.message || err),
    );
  };
  if (client.isReady?.()) {
    setTimeout(bootstrap, 12_000).unref?.();
  } else {
    client.once("ready", () => setTimeout(bootstrap, 12_000).unref?.());
  }
  schedule();
}

function sameEmoji(reaction?, emoji?) {
  const expected = normalizeId(emoji).replace(/[\uFE0E\uFE0F]/g, "");
  const name = normalizeId(reaction?.emoji?.name).replace(/[\uFE0E\uFE0F]/g, "");
  return expected && name === expected;
}

async function resolveReactPressMessage(reaction?) {
  let liveReaction = reaction;
  if (liveReaction?.partial) {
    liveReaction = await liveReaction.fetch().catch(() => null);
    if (!liveReaction) return null;
  }
  let message = liveReaction.message;
  if (message?.partial) {
    message = await message.fetch().catch(() => null);
  }
  return message || null;
}

async function handleReactPressReaction(client?, reaction?, user?) {
  const base = cfg(client);
  if (user?.bot) return false;

  let liveReaction = reaction;
  if (liveReaction?.partial) {
    liveReaction = await liveReaction.fetch().catch(() => null);
    if (!liveReaction) return false;
  }
  if (!sameEmoji(liveReaction, base.emoji)) return false;

  const message = await resolveReactPressMessage(liveReaction);
  if (!message?.guild) return false;
  const gid = normalizeId(message.guild.id);
  const uid = normalizeId(user.id);
  if (!isValidGuildUserId(gid, uid)) return false;

      const liveDoc = await findActiveReactPressByMessage(gid, message.id);
  if (!liveDoc && !eventOpen(base)) return false;
  const c = liveDoc ? cfgFromReactPressDoc(client, liveDoc) : base;

  const clickerMember = await getGuildMemberCached(message.guild, uid).catch(() => null);
  if (await isUserHighStaffExcludedFromHogwartsEvent(client, uid, clickerMember)) return false;
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = normalizeId(eventCfg?.eventKey) || c.eventKey;
  const clickerHouse = await resolveSortedHouse(gid, uid, eventKey);
  if (c.sortedOnly && !clickerHouse) {
    await liveReaction.users?.remove?.(uid).catch(() => null);
    return true;
  }
  const now = new Date();
  const doc = await claimReactPressRound(gid, c, message.id, uid, now);
  if (!doc) {
    const existing = await findReactPressDocForMessage(gid, c, message.id);
    const status = normalizeId(existing?.status);
    const winnerId = normalizeId(existing?.userId || existing?.rawWebhook?.winnerUserId);
    const claimCfg = existing ? cfgFromReactPressDoc(client, existing) : c;

        if (status === "completed" && winnerId === uid) {
      await fulfillReactPressWin(client, claimCfg, existing, { user, message, announce: true });
      return true;
    }

    if (status === "completed" || status === "expired") {
      await liveReaction.users?.remove?.(uid).catch(() => null);
      await removeReactPressEmojiFromMessage(message, claimCfg.emoji);
      return true;
    }

    if (status === "active") {
      const expMs = new Date(existing?.rawWebhook?.expiresAt || 0).getTime();
      if (!Number.isFinite(expMs) || expMs <= Date.now()) {
        await liveReaction.users?.remove?.(uid).catch(() => null);
        await removeReactPressEmojiFromMessage(message, claimCfg.emoji);
        return true;
      }
            await new Promise((resolve?) => setTimeout(resolve, 400));
      const retry = await claimReactPressRound(gid, claimCfg, message.id, uid, new Date());
      if (retry) {
        await fulfillReactPressWin(client, claimCfg, retry, { user, message, announce: true });
      }
      return true;
    }

        global.logger?.warn?.(
      "[PREMI LA REACT] claim fallito senza doc certo — reaction lasciata:",
      message.id,
      uid,
    );
    return true;
  }

  await fulfillReactPressWin(client, c, doc, { user, message, announce: true });
  return true;
}

async function announceActiveReactPressRound(client?) {
  const c = cfg(client);
  if (!eventOpen(c)) return false;
  const gid = normalizeId(IDs.guilds.main);
  const live = await activeChallenge(gid);
  if (!live) return false;
  const channelId = normalizeId(live?.rawWebhook?.channelId || c.channelId);
  const messageId = normalizeId(live?.rawWebhook?.messageId);
  if (!channelId || !messageId) return false;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  const message = channel?.messages ? await channel.messages.fetch(messageId).catch(() => null) : null;
  if (!message) return false;
  const guild =
    client.guilds.cache.get(gid) ||
    (await client.guilds.fetch(gid).catch(() => null));
  if (!guild) return false;
  await announceReactPressSpawn(client, guild, c, message);
  return true;
}

async function spawnFinaleChaosReactPress(client?, guild?, opts: Record<string, any> = {}) {
  try {
    const { isHouseChannelQuietHours } = require("./hogwartsHouseChannelMinigameService") as typeof import("./hogwartsHouseChannelMinigameService");
    if (isHouseChannelQuietHours(client)) return false;
  } catch (_) {}
  const base = cfg(client);
  const c = {
    ...base,
    eventKey: normalizeId(opts.eventKey) || `${base.eventKey}_finale_chaos`,
    activeDurationMs: safeInt(opts.activeDurationMs, 15 * 60 * 1000, 60_000, 30 * 60_000),
    hintBeforeExpiryMs: safeInt(opts.hintBeforeExpiryMs, 7.5 * 60 * 1000, 60_000, 20 * 60_000),
    rewardGaleoni: safeInt(opts.rewardGaleoni, 1000, 0, 100000),
    rewardHousePoints: safeInt(opts.rewardHousePoints, 500, 0, 100000),
    pingRoleId: normalizeId(opts.pingRoleId || base.pingRoleId),
    announceChannelId: normalizeId(opts.announceChannelId || base.announceChannelId || IDs.channels?.chat),
    nightQuietStartHour: -1,
    nightQuietEndHour: -1,
    maxPerDay: 999,
    minChatMessagesBetweenRounds: 0,
    randomChannelSpawn: true,
    finaleChaos: {
      firstSlot: opts.firstSlot === true,
      boostType: opts.boostType === "exp" ? "exp" : "housePoints",
      boostScope: opts.boostScope === "house" ? "house" : "personal",
      firstSlotBoostDurationMs: safeInt(opts.firstSlotBoostDurationMs, 3600000, 60_000, 24 * 3600000),
      slotKey: normalizeId(opts.slotKey),
      chaosEventKey: normalizeId(opts.chaosEventKey),
    },
  };
  const gid = normalizeId(guild?.id);
  if (!gid) return false;
  return withReactPressSpawnLock(client, gid, async () => {
    await expireOldChallenges(client, gid, c, { announce: true });
    const live = await activeChallenge(gid);
    if (live) {
      await ensureActiveChallengeReaction(client, c, live);
      await maybeAnnounceReactPressHint(client, c, live);
      return false;
    }
    if (c.randomChannelSpawn) return spawnReactPressViaRandomChannel(client, guild, c);
    return spawnReactPressViaCandidatePool(client, guild, c);
  });
}

async function tickFinaleChaosReactPressRounds(client?, guild?, chaosCfg?, nowMs = Date.now()) {
  const gid = normalizeId(guild?.id);
  if (!gid) return;
  const activeDocs = await SiteDocument.find({
    docType: DOC,
    guildId: gid,
    status: "active",
    "rawWebhook.finaleChaos": { $exists: true },
  })
    .lean()
    .catch(() => []);
  for (const doc of activeDocs) {
    const rc = {
      ...cfgFromReactPressDoc(client, doc),
      hintBeforeExpiryMs: safeInt(
        chaosCfg?.hintBeforeExpiryMs ?? doc?.rawWebhook?.hintBeforeExpiryMs,
        DEFAULT_CONFIG.hintBeforeExpiryMs,
        60_000,
        20 * 60_000,
      ),
      activeDurationMs: safeInt(
        chaosCfg?.activeDurationMs ?? doc?.rawWebhook?.activeDurationMs,
        DEFAULT_CONFIG.activeDurationMs,
        60_000,
        30 * 60_000,
      ),
    };
    const expMs = new Date(doc.rawWebhook?.expiresAt || 0).getTime();
    if (Number.isFinite(expMs) && nowMs >= expMs) {
      await expireOldChallenges(client, gid, rc, { announce: true });
      continue;
    }
    await maybeAnnounceReactPressHint(client, rc, doc);
  }
}

export = {
  announceActiveReactPressRound,
  cfgFromReactPressDoc,
  getPremiLaReactConfig: cfg,
  handleReactPressReaction,
  isPremiLaReactEventEnded,
  maybeAnnounceReactPressHint,
  recordReactPressCandidateMessage,
  runPremiLaReactTick,
  startReactPressEventLoop,
  spawnFinaleChaosReactPress,
  tickFinaleChaosReactPressRounds,
};