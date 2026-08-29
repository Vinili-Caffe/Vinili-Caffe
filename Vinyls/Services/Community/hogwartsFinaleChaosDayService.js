/**
 * Finale chaos day (lunedì 31 ago 00:00 → 1 set 00:00 Rome):
 * ogni ora shuffle dei 3 minigame, spawn a :00 / :20 / :40, durata 15m + indizio a metà.
 * Premi: 1000 galeoni + 500 punti casa (pet/consumabili). Boost 2× personale 1h solo sul 1° slot.
 */
const { EmbedBuilder } = require("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { getHouseMeta } = require("../../Utils/Web/hogwartsSortingBank");
const { CONSUMABLE_BOOST_TYPES, CONSUMABLE_BOOST_SCOPES } = require("../../Utils/Web/hogwartsShopConsumablesCatalog");
const { activateConsumableBoost } = require("./hogwartsConsumableBoostsService");
const { addGaleoni, formatGaleoni } = require("./gringottService");
const { assignManualHousePoints } = require("./hogwartsManualHousePointsService");
const { applyPetHousePointsBoost } = require("./hogwartsShopBoostsService");
const {
  FORBIDDEN_DOC,
  FORBIDDEN_EVENT_OWNER_ID,
  getForbiddenClosure,
  isForbiddenEventClosed,
  forbiddenProgressPayload,
} = require("./hogwartsForbiddenBooksService");
const {
  FORBIDDEN_BOOK_LABELS,
  allConfiguredForbiddenBookIds,
  formatForbiddenBookLabel,
} = require("./hogwartsForbiddenBooksRounds");
const IDs = require("../../Utils/Config/ids");

const DOC = SITE_DOCUMENT_TYPE.HOGWARTS_FINALE_CHAOS;
const OWNER = "__event__";
const TIME_ZONE = "Europe/Rome";
const GAMES = Object.freeze(["reactPress", "forbiddenSection", "findScroll"]);
/** Sezione proibita / pergamena chaos: un solo vincitore ciascuno. */
const CHAOS_FORBIDDEN_MAX_WINNERS = 1;
const CHAOS_FIND_SCROLL_WINNERS = 1;
const loopState = new WeakSet();

const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  eventKey: "hogwarts_finale_chaos_20260831",
  startDate: "2026-08-31T00:00:00",
  endDate: "2026-09-01T00:00:00",
  slotMinutes: [0, 20, 40],
  activeDurationMs: 15 * 60 * 1000,
  hintBeforeExpiryMs: 7.5 * 60 * 1000,
  minChatMessagesBetweenSpawns: 8,
  rewardGaleoni: 1000,
  rewardHousePoints: 500,
  firstSlotBoostDurationMs: 60 * 60 * 1000,
  forbiddenBookCount: 5,
  spawnGraceMs: 5 * 60 * 1000,
  games: [...GAMES],
  pingRoleId: "1507000390493798511",
});

function normalizeId(value) {
  return String(value || "").trim();
}

function safeInt(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cfg(client) {
  const raw = client?.config?.hogwartsFinaleChaosDay && typeof client.config.hogwartsFinaleChaosDay === "object"
    ? client.config.hogwartsFinaleChaosDay
    : {};
  const out = { ...DEFAULT_CONFIG, ...raw };
  out.enabled = out.enabled !== false;
  out.eventKey = normalizeId(out.eventKey) || DEFAULT_CONFIG.eventKey;
  out.slotMinutes = (Array.isArray(out.slotMinutes) ? out.slotMinutes : DEFAULT_CONFIG.slotMinutes)
    .map((n) => safeInt(n, -1, 0, 59))
    .filter((n) => n >= 0);
  if (!out.slotMinutes.length) out.slotMinutes = [...DEFAULT_CONFIG.slotMinutes];
  out.activeDurationMs = safeInt(out.activeDurationMs, DEFAULT_CONFIG.activeDurationMs, 60_000, 30 * 60_000);
  out.hintBeforeExpiryMs = safeInt(
    out.hintBeforeExpiryMs,
    DEFAULT_CONFIG.hintBeforeExpiryMs,
    60_000,
    out.activeDurationMs - 30_000,
  );
  out.minChatMessagesBetweenSpawns = safeInt(
    out.minChatMessagesBetweenSpawns,
    DEFAULT_CONFIG.minChatMessagesBetweenSpawns,
    1,
    100,
  );
  out.rewardGaleoni = safeInt(out.rewardGaleoni, DEFAULT_CONFIG.rewardGaleoni, 0, 100000);
  out.rewardHousePoints = safeInt(out.rewardHousePoints, DEFAULT_CONFIG.rewardHousePoints, 0, 100000);
  out.firstSlotBoostDurationMs = safeInt(
    out.firstSlotBoostDurationMs,
    DEFAULT_CONFIG.firstSlotBoostDurationMs,
    60_000,
    24 * 60 * 60_000,
  );
  out.forbiddenBookCount = safeInt(out.forbiddenBookCount, DEFAULT_CONFIG.forbiddenBookCount, 3, 12);
  out.spawnGraceMs = safeInt(out.spawnGraceMs, DEFAULT_CONFIG.spawnGraceMs, 60_000, out.activeDurationMs);
  out.games = (Array.isArray(out.games) ? out.games : DEFAULT_CONFIG.games)
    .map((g) => normalizeId(g))
    .filter((g) => GAMES.includes(g));
  if (out.games.length !== 3) out.games = [...DEFAULT_CONFIG.games];
  out.announceChannelId = normalizeId(out.announceChannelId || IDs.channels?.chat);
  out.pingRoleId = normalizeId(out.pingRoleId || IDs.roles?.HogwartsEventParticipant || DEFAULT_CONFIG.pingRoleId);
  out.forbiddenBookIds = (Array.isArray(out.forbiddenBookIds) ? out.forbiddenBookIds : [])
    .map((id) => normalizeId(id).toLowerCase())
    .filter(Boolean);
  return out;
}

function getRomeParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function createUtcFromRomeLocal(year, month, day, hour = 0, minute = 0, second = 0) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(utcGuess)).map((x) => [x.type, x.value]));
  const asRome = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return utcGuess - (asRome - utcGuess);
}

function parseConfigDateMs(value, fallback) {
  const raw = normalizeId(value) || fallback;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (!m) return NaN;
  return createUtcFromRomeLocal(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] || 0),
  );
}

function isWithinChaosWindow(c, nowMs = Date.now()) {
  const startMs = parseConfigDateMs(c.startDate, DEFAULT_CONFIG.startDate);
  const endMs = parseConfigDateMs(c.endDate, DEFAULT_CONFIG.endDate);
  return Number.isFinite(startMs) && Number.isFinite(endMs) && nowMs >= startMs && nowMs < endMs;
}

function hourKeyFromParts(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}`;
}

function slotKey(hourKey, minute) {
  return `${hourKey}:${String(minute).padStart(2, "0")}`;
}

function resolveCurrentSlot(parts, c) {
  const minutes = [...c.slotMinutes].sort((a, b) => a - b);
  let chosen = null;
  for (const m of minutes) {
    if (parts.minute >= m) chosen = m;
  }
  if (chosen == null) return null;
  const hourKey = hourKeyFromParts(parts);
  const slotStartMs = createUtcFromRomeLocal(parts.year, parts.month, parts.day, parts.hour, chosen, 0);
  return {
    minute: chosen,
    hourKey,
    slotKey: slotKey(hourKey, chosen),
    slotStartMs,
    slotIndex: minutes.indexOf(chosen),
  };
}

function shuffleGames(games, seed) {
  const arr = [...games];
  let h = 0;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const j = h % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function pickRandomBoost() {
  return {
    boostType: Math.random() < 0.5 ? "exp" : "housePoints",
    boostScope: Math.random() < 0.5 ? "personal" : "house",
  };
}

function normalizeBoostType(value) {
  return String(value || "").trim().toLowerCase() === "exp" ? "exp" : "housePoints";
}

function normalizeBoostScope(value) {
  return String(value || "").trim().toLowerCase() === "house" ? "house" : "personal";
}

function boostTypeLabelIt(boostType) {
  return normalizeBoostType(boostType) === "exp" ? "EXP" : "punti casa";
}

function boostScopeLabelIt(boostScope) {
  return normalizeBoostScope(boostScope) === "house" ? "di casata" : "personale";
}

function buildBoostLine(boostType, boostScope) {
  return `2× ${boostTypeLabelIt(boostType)} ${boostScopeLabelIt(boostScope)} per 1 ora (si somma agli altri boost attivi)`;
}

function pickForbiddenBookIds(c, seed) {
  if (c.forbiddenBookIds.length >= c.forbiddenBookCount) {
    return shuffleGames(c.forbiddenBookIds, seed).slice(0, c.forbiddenBookCount);
  }
  const pool = allConfiguredForbiddenBookIds(null);
  const labels = Object.keys(FORBIDDEN_BOOK_LABELS || {});
  const all = [...new Set([...(Array.isArray(pool) ? pool : []), ...labels])].filter(Boolean);
  return shuffleGames(all.length ? all : ["home", "faq", "wiki", "regole", "vote"], seed).slice(0, c.forbiddenBookCount);
}

function gameLabel(game) {
  if (game === "reactPress") return "Premi la react";
  if (game === "forbiddenSection") return "Sezione proibita";
  if (game === "findScroll") return "Caccia alle pergamene";
  return game;
}

function formatPrizeLines(c, { firstSlot, boostType, boostScope } = {}) {
  const lines = [
    `**${formatGaleoni(c.rewardGaleoni)}**`,
    `<a:VC_Winner:1482535294757507255> **${c.rewardHousePoints} punti casa** (con multi animale / boost attivi)`,
  ];
  if (firstSlot) {
    lines.push(
      `<a:VC_Events:1482706144953897223> **Bonus 1° minigioco dell'ora:** boost **2× ${boostTypeLabelIt(boostType)} ${boostScopeLabelIt(boostScope)}** per **1 ora** (si somma agli altri)`,
    );
  }
  return lines;
}

async function announceChat(client, c, payload) {
  const chId = c.announceChannelId;
  if (!chId) return null;
  const ch = await client.channels.fetch(chId).catch(() => null);
  if (!ch?.send) return null;
  return ch.send(payload).catch(() => null);
}

async function loadDoc(guildId, dedupeKey) {
  return SiteDocument.findOne({
    docType: DOC,
    guildId: normalizeId(guildId),
    userId: OWNER,
    dedupeKey: normalizeId(dedupeKey),
  })
    .lean()
    .catch(() => null);
}

async function upsertDoc(guildId, dedupeKey, setFields, setOnInsert = {}) {
  return SiteDocument.findOneAndUpdate(
    {
      docType: DOC,
      guildId: normalizeId(guildId),
      userId: OWNER,
      dedupeKey: normalizeId(dedupeKey),
    },
    {
      $setOnInsert: {
        docType: DOC,
        guildId: normalizeId(guildId),
        userId: OWNER,
        dedupeKey: normalizeId(dedupeKey),
        createdBy: "bot",
        ...setOnInsert,
      },
      $set: setFields,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function ensureHourPlan(guildId, c, hourKey) {
  const dedupeKey = `hour:${hourKey}`;
  const existing = await loadDoc(guildId, dedupeKey);
  if (existing?.rawWebhook?.order?.length === 3) {
    const rw = existing.rawWebhook;
    return {
      ...rw,
      boostType: normalizeBoostType(rw.boostType),
      boostScope: normalizeBoostScope(rw.boostScope || "personal"),
    };
  }
  const order = shuffleGames(c.games, `${c.eventKey}:${hourKey}`);
  const boost = pickRandomBoost();
  const doc = await upsertDoc(
    guildId,
    dedupeKey,
    {
      status: "planned",
      planKey: c.eventKey,
      rawWebhook: {
        eventKey: c.eventKey,
        hourKey,
        order,
        boostType: boost.boostType,
        boostScope: boost.boostScope,
        firstSlotBoostDurationMs: c.firstSlotBoostDurationMs,
      },
    },
  );
  return doc?.rawWebhook || { hourKey, order, ...boost };
}

async function countChatSince(client, channelId, sinceMs, minRequired) {
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch?.messages?.fetch) return minRequired;
  let count = 0;
  let beforeId;
  for (let page = 0; page < 5; page += 1) {
    const opts = { limit: 100 };
    if (beforeId) opts.before = beforeId;
    const batch = await ch.messages.fetch(opts).catch(() => null);
    if (!batch?.size) break;
    const ordered = [...batch.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    let older = false;
    for (const msg of ordered) {
      if (msg.createdTimestamp < sinceMs) {
        older = true;
        break;
      }
      if (!msg.author?.bot && !msg.system && !msg.webhookId) count += 1;
      if (count >= minRequired) return count;
    }
    if (older) break;
    beforeId = ordered[ordered.length - 1]?.id;
    if (!beforeId || batch.size < 100) break;
  }
  return count;
}

async function hasEnoughChat(client, guildId, c) {
  const last = await SiteDocument.findOne({
    docType: DOC,
    guildId: normalizeId(guildId),
    planKey: c.eventKey,
    status: { $in: ["spawned", "won", "expired"] },
    "rawWebhook.kind": "slot",
  })
    .sort({ "rawWebhook.spawnedAt": -1, createdAt: -1 })
    .lean()
    .catch(() => null);
  if (!last) return true;
  const since = new Date(last.rawWebhook?.spawnedAt || last.createdAt || 0).getTime();
  if (!Number.isFinite(since) || since <= 0) return true;
  const n = await countChatSince(client, c.announceChannelId, since, c.minChatMessagesBetweenSpawns);
  return n >= c.minChatMessagesBetweenSpawns;
}

async function grantHousePointsWithMult(client, guildId, userId, basePoints, reason) {
  const base = Math.max(0, Math.floor(Number(basePoints) || 0));
  if (base <= 0) return { points: 0, houseId: "", multiplier: 1 };
  const pet = await applyPetHousePointsBoost(client, guildId, userId, base);
  const points = Math.max(0, Math.floor(Number(pet.points) || 0));
  if (points <= 0) return { points: 0, houseId: "", multiplier: pet.multiplier || 1, petName: pet.petName || "" };
  const { resolveSortedHouseForUser } = require("./galeoniEconomyService");
  const houseId = await resolveSortedHouseForUser(guildId, userId, client).catch(() => "");
  if (!houseId) return { points: 0, houseId: "", multiplier: pet.multiplier || 1, petName: pet.petName || "" };
  await assignManualHousePoints(client, {
    guildId,
    houseId,
    points,
    actorId: "bot",
    reason,
  });
  return {
    points,
    houseId,
    multiplier: pet.multiplier || 1,
    petName: pet.petName || "",
    consumableLabels: pet.consumableLabels || [],
  };
}

async function extendFinaleChaosBoost(client, { guildId, userId, houseId, boostType, boostScope, durationMs, eventKey, item }) {
  const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  const type = boostType === "exp" ? CONSUMABLE_BOOST_TYPES.EXP : CONSUMABLE_BOOST_TYPES.HOUSE_POINTS;
  const scope = boostScope === "house" ? CONSUMABLE_BOOST_SCOPES.HOUSE : CONSUMABLE_BOOST_SCOPES.PERSONAL;
  const addMs = Math.max(60_000, Math.floor(Number(durationMs) || 3600000));
  const now = new Date();
  const ek = normalizeId(eventKey) || "hogwarts";

  if (scope === CONSUMABLE_BOOST_SCOPES.PERSONAL) {
    const path = `profile.events.hogwarts.consumableBoosts.${type}`;
    const before = await ActivityUserProfile.findOne({ guildId: gid, userId: uid }).select(path).lean().catch(() => null);
    const prevExp = before?.profile?.events?.hogwarts?.consumableBoosts?.[type]?.expiresAt
      ? new Date(before.profile.events.hogwarts.consumableBoosts[type].expiresAt).getTime()
      : 0;
    const base = Number.isFinite(prevExp) && prevExp > now.getTime() ? prevExp : now.getTime();
    const expiresAt = new Date(base + addMs);
    const row = {
      itemId: item.id,
      itemName: item.name,
      activatedBy: uid,
      activatedAt: now,
      expiresAt,
      scope,
      boostType: type,
      houseId: normalizeId(houseId),
      endAnnounced: false,
      stackedFromFinaleChaos: true,
    };
    await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      {
        $setOnInsert: { guildId: gid, userId: uid },
        $set: {
          [path]: row,
          "profile.events.hogwarts.consumableBoosts.eventKey": ek,
          "profile.events.hogwarts.consumableBoosts.updatedAt": now,
        },
      },
      { upsert: true },
    ).catch(() => null);
    return { ok: true, extended: true, expiresAt, scope, boostType: type };
  }

  const house = normalizeId(houseId).toLowerCase();
  if (!house) return { ok: false, code: "not_sorted", message: "Casa assente per boost di casata." };
  const scopePath = `rawWebhook.consumableBoosts.${type}.houses.${house}`;
  const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
  const before = await SiteDocument.findOne({
    docType: HOUSE_POINTS_DOC,
    guildId: gid,
    userId: OWNER,
    dedupeKey: ek,
  })
    .select(scopePath)
    .lean()
    .catch(() => null);
  const prev = before?.rawWebhook?.consumableBoosts?.[type]?.houses?.[house]?.expiresAt;
  const prevExp = prev ? new Date(prev).getTime() : 0;
  const base = Number.isFinite(prevExp) && prevExp > now.getTime() ? prevExp : now.getTime();
  const expiresAt = new Date(base + addMs);
  const row = {
    itemId: item.id,
    itemName: item.name,
    activatedBy: uid,
    activatedAt: now,
    expiresAt,
    scope,
    boostType: type,
    houseId: house,
    endAnnounced: false,
    stackedFromFinaleChaos: true,
  };
  await SiteDocument.updateOne(
    {
      docType: HOUSE_POINTS_DOC,
      guildId: gid,
      userId: OWNER,
      dedupeKey: ek,
    },
    {
      $setOnInsert: {
        docType: HOUSE_POINTS_DOC,
        guildId: gid,
        userId: OWNER,
        dedupeKey: ek,
        createdBy: "hogwarts_finale_chaos_boost",
        status: "active",
        planKey: "hogwarts_house_points",
      },
      $set: {
        [scopePath]: row,
        "rawWebhook.eventKey": ek,
        "rawWebhook.updatedAt": now,
      },
    },
    { upsert: true },
  ).catch(() => null);
  return { ok: true, extended: true, expiresAt, scope, boostType: type, houseId: house };
}

async function grantFinaleChaosBoost(client, {
  guildId,
  userId,
  houseId: houseIdHint,
  boostType,
  boostScope,
  durationMs,
  eventKey,
}) {
  const type = normalizeBoostType(boostType) === "exp" ? CONSUMABLE_BOOST_TYPES.EXP : CONSUMABLE_BOOST_TYPES.HOUSE_POINTS;
  const scope = normalizeBoostScope(boostScope) === "house" ? CONSUMABLE_BOOST_SCOPES.HOUSE : CONSUMABLE_BOOST_SCOPES.PERSONAL;
  let houseId = normalizeId(houseIdHint).toLowerCase();
  if (!houseId) {
    try {
      const { resolveSortedHouseForUser } = require("./galeoniEconomyService");
      houseId = normalizeId(await resolveSortedHouseForUser(guildId, userId, client)).toLowerCase();
    } catch (_) {
      houseId = "";
    }
  }
  if (scope === CONSUMABLE_BOOST_SCOPES.HOUSE && !houseId) {
    return { ok: false, code: "not_sorted", message: "Serve lo smistamento per il boost di casata." };
  }
  const item = {
    id: `finale-chaos-${scope}-${type}-1h`,
    name: `Boost Finale Chaos 2× ${boostTypeLabelIt(type)} ${boostScopeLabelIt(scope)}`,
    boostType: type,
    scope,
    durationMs: Math.max(60_000, Math.floor(Number(durationMs) || 3600000)),
  };
  const activated = await activateConsumableBoost(client, {
    guildId,
    userId,
    houseId,
    item,
    eventKey: normalizeId(eventKey) || "hogwarts",
    skipPrecheck: true,
  });
  if (activated?.ok) return { ...activated, extended: false, scope, boostType: type };
  if (activated?.code === "boost_active") {
    return extendFinaleChaosBoost(client, {
      guildId,
      userId,
      houseId,
      boostType: type,
      boostScope: scope,
      durationMs: item.durationMs,
      eventKey,
      item,
    });
  }
  return activated;
}

/** @deprecated alias */
async function grantFinaleChaosPersonalBoost(client, opts) {
  return grantFinaleChaosBoost(client, { ...opts, boostScope: opts.boostScope || "personal" });
}

async function grantFinaleChaosWinRewards(client, {
  guildId,
  userIds,
  c,
  rewardKeyPrefix,
  reason,
  firstSlot,
  boostType,
  boostScope,
}) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(normalizeId).filter(Boolean))];
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = normalizeId(eventCfg?.eventKey) || c.eventKey;
  const results = [];
  for (const uid of ids) {
    const galeoni = await addGaleoni({
      guildId,
      userId: uid,
      amount: c.rewardGaleoni,
      reason,
      actorId: "bot",
      source: "hogwarts_finale_chaos",
      eventKey,
      rewardKey: `${rewardKeyPrefix}:galeoni:${uid}`,
    });
    const house = await grantHousePointsWithMult(
      client,
      guildId,
      uid,
      c.rewardHousePoints,
      reason,
    );
    let boost = null;
    if (firstSlot) {
      boost = await grantFinaleChaosBoost(client, {
        guildId,
        userId: uid,
        houseId: house?.houseId || "",
        boostType: boostType || "housePoints",
        boostScope: boostScope || "personal",
        durationMs: c.firstSlotBoostDurationMs,
        eventKey,
      });
    }
    results.push({ userId: uid, galeoni, house, boost });
  }
  return results;
}

async function spawnForbiddenSection(client, guild, c, meta) {
  const bookIds = pickForbiddenBookIds(c, meta.slotKey);
  const expiresAt = new Date(Date.now() + c.activeDurationMs);
  const booksDedupeKey = `finale_chaos_forbidden:${meta.slotKey}`;
  const windowDedupeKey = `forbidden_window:${meta.slotKey}`;
  await SiteDocument.findOneAndUpdate(
    {
      docType: FORBIDDEN_DOC,
      guildId: guild.id,
      userId: FORBIDDEN_EVENT_OWNER_ID,
      dedupeKey: booksDedupeKey,
    },
    {
      $setOnInsert: {
        docType: FORBIDDEN_DOC,
        guildId: guild.id,
        userId: FORBIDDEN_EVENT_OWNER_ID,
        dedupeKey: booksDedupeKey,
        createdBy: "finale_chaos",
      },
      $set: {
        status: "open",
        planKey: c.eventKey,
        rawWebhook: {
          eventKey: c.eventKey,
          winners: [],
          bookIds,
          expiresAt,
          roundId: `chaos_${meta.slotKey.replace(/[^a-zA-Z0-9]/g, "_")}`,
          slotKey: meta.slotKey,
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  await upsertDoc(guild.id, windowDedupeKey, {
    status: "active",
    planKey: c.eventKey,
    rawWebhook: {
      eventKey: c.eventKey,
      kind: "forbidden_window",
      slotKey: meta.slotKey,
      hourKey: meta.hourKey,
      slotIndex: meta.slotIndex,
      firstSlot: meta.firstSlot === true,
      boostType: meta.boostType || "",
      boostScope: meta.boostScope || "personal",
      bookIds,
      expiresAt,
      hintSentAt: null,
      booksDedupeKey,
      roundId: `chaos_${meta.slotKey.replace(/[^a-zA-Z0-9]/g, "_")}`,
      roundLabel: `Finale ${meta.slotKey}`,
    },
  });

  const prizeLines = formatPrizeLines(c, {
    firstSlot: meta.firstSlot,
    boostType: meta.boostType,
    boostScope: meta.boostScope,
  });
  const bookLines = bookIds.map((id) => `• **${formatForbiddenBookLabel(id)}**`).join("\n");
  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("<a:VC_Events:1482706144953897223> Sezione proibita — round lampo!")
    .setDescription(
      [
        "La **Sezione proibita** è di nuovo aperta: cerca e raccogli i **libri proibiti** sulle pagine del **sito** viniliecaffe.it.",
        "",
        `Hai **${Math.round(c.activeDurationMs / 60000)} minuti**. Vince **il primo** mago che completa tutti i libri.`,
        "",
        "**Libri di questo round:**",
        bookLines,
        "",
        "**Premi:**",
        ...prizeLines,
      ].join("\n"),
    )
    .setTimestamp();
  const roleId = c.pingRoleId;
  await announceChat(client, c, {
    content: roleId ? `<@&${roleId}>` : null,
    embeds: [embed],
    allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
  });
  return true;
}

async function resolveFinaleChaosForbiddenRuntime(client, nowMs = Date.now()) {
  const c = cfg(client);
  if (!c.enabled || !isWithinChaosWindow(c, nowMs)) return null;
  const guildId = normalizeId(client?.config?.mainGuildId || IDs.guilds?.main);
  if (!guildId) return null;
  const active = await SiteDocument.findOne({
    docType: DOC,
    guildId,
    userId: OWNER,
    status: "active",
    planKey: c.eventKey,
    "rawWebhook.kind": "forbidden_window",
    "rawWebhook.expiresAt": { $gt: new Date(nowMs) },
  })
    .sort({ createdAt: -1 })
    .lean()
    .catch(() => null);
  if (!active) return null;
  const rw = active.rawWebhook || {};
  const closure = await getForbiddenClosure(guildId, rw.booksDedupeKey || `finale_chaos_forbidden:${rw.slotKey}`);
  const closed = isForbiddenEventClosed(closure);
  const startMs = new Date(active.createdAt || nowMs).getTime();
  const endMs = new Date(rw.expiresAt || 0).getTime();
  return {
    mode: "finale_chaos",
    enabled: true,
    round: {
      id: rw.roundId,
      label: rw.roundLabel,
      startMs,
      endMs,
      bookIds: Array.isArray(rw.bookIds) ? rw.bookIds : [],
    },
    roundId: rw.roundId,
    roundLabel: rw.roundLabel,
    roundActive: !closed,
    roundClosed: closed,
    bookIds: Array.isArray(rw.bookIds) ? rw.bookIds : [],
    dedupeKey: rw.booksDedupeKey || `finale_chaos_forbidden:${rw.slotKey}`,
    chaosSlotKey: rw.slotKey,
    chaosDocId: active._id,
    closure,
    nextRound: null,
    nextRoundId: null,
    nextRoundStartMs: null,
    roundStartMs: startMs,
    roundEndMs: endMs,
    betweenRounds: false,
    open: !closed,
    startMs,
    endMs,
    finaleChaos: {
      firstSlot: rw.firstSlot === true,
      boostType: rw.boostType || "",
      boostScope: rw.boostScope || "personal",
      rewardGaleoni: c.rewardGaleoni,
      rewardHousePoints: c.rewardHousePoints,
      eventKey: c.eventKey,
      slotKey: rw.slotKey,
    },
  };
}

async function tryAutoWinFinaleChaosForbidden(client, { guildId, userId, houseId, runtime }) {
  const c = cfg(client);
  if (!runtime || runtime.mode !== "finale_chaos") return { ok: false, code: "not_chaos" };
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  const hid = normalizeId(houseId).toLowerCase();
  if (!gid || !uid || !hid) return { ok: false, code: "bad_input" };
  const dedupeKey = normalizeId(runtime.dedupeKey);
  const closure = await getForbiddenClosure(gid, dedupeKey);
  const progress = forbiddenProgressPayload(null, closure, { bookIds: runtime.bookIds });
  if (progress.closed) return { ok: false, code: "event_closed", winners: progress.winners };
  if (progress.winners.some((w) => normalizeId(w.userId) === uid)) {
    return { ok: false, code: "already_winner", winners: progress.winners };
  }
  if (progress.winners.length >= CHAOS_FORBIDDEN_MAX_WINNERS) {
    return { ok: false, code: "max_winners", winners: progress.winners };
  }
  const entry = {
    userId: uid,
    houseId: hid,
    assignedAt: new Date().toISOString(),
    assignedBy: "finale_chaos_auto",
  };
  const nextWinners = [...progress.winners, entry];
  const shouldClose = nextWinners.length >= CHAOS_FORBIDDEN_MAX_WINNERS;
  const updated = await SiteDocument.findOneAndUpdate(
    {
      docType: FORBIDDEN_DOC,
      guildId: gid,
      userId: FORBIDDEN_EVENT_OWNER_ID,
      dedupeKey,
      status: { $ne: "closed" },
    },
    {
      $set: {
        status: shouldClose ? "closed" : "open",
        planKey: c.eventKey,
        "rawWebhook.winners": nextWinners,
        "rawWebhook.roundId": runtime.roundId,
        ...(shouldClose ? { "rawWebhook.closedAt": new Date() } : {}),
      },
      $setOnInsert: {
        docType: FORBIDDEN_DOC,
        guildId: gid,
        userId: FORBIDDEN_EVENT_OWNER_ID,
        dedupeKey,
        createdBy: "finale_chaos",
      },
    },
    { upsert: true, new: true },
  ).catch(() => null);
  if (!updated) return { ok: false, code: "write_failed" };

  const fc = runtime.finaleChaos || {};
  const rewards = await grantFinaleChaosWinRewards(client, {
    guildId: gid,
    userIds: [uid],
    c: {
      ...c,
      rewardGaleoni: fc.rewardGaleoni ?? c.rewardGaleoni,
      rewardHousePoints: fc.rewardHousePoints ?? c.rewardHousePoints,
      firstSlotBoostDurationMs: c.firstSlotBoostDurationMs,
    },
    rewardKeyPrefix: `${c.eventKey}:${fc.slotKey || runtime.roundId}:forbidden`,
    reason: `Finale chaos — Sezione proibita ${fc.slotKey || ""}`,
    firstSlot: fc.firstSlot === true,
    boostType: fc.boostType || "housePoints",
    boostScope: fc.boostScope || "personal",
  });
  const houseMeta = getHouseMeta(hid);
  const award = rewards[0];
  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("<a:VC_Events:1482706144953897223> Sezione proibita — vittoria!")
    .setDescription(
      [
        `<@${uid}> (**${houseMeta?.label || hid}**) ha completato tutti i libri proibiti!`,
        "",
        `**${formatGaleoni(c.rewardGaleoni)}**`,
        `<a:VC_Winner:1482535294757507255> **${award?.house?.points || c.rewardHousePoints} punti casa**`,
        fc.firstSlot
          ? `<a:VC_Events:1482706144953897223> Boost attivo: **${buildBoostLine(fc.boostType, fc.boostScope)}**`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setTimestamp();
  await announceChat(client, c, { embeds: [embed], allowedMentions: { users: [uid] } });

  if (shouldClose) {
    await SiteDocument.updateOne(
      { _id: runtime.chaosDocId },
      { $set: { status: "won", "rawWebhook.resolvedAt": new Date() } },
    ).catch(() => null);
  }
  return { ok: true, winners: nextWinners, closed: shouldClose, rewards };
}

async function maybeHintOrExpireForbidden(client, guild, c, nowMs = Date.now()) {
  const active = await SiteDocument.find({
    docType: DOC,
    guildId: guild.id,
    userId: OWNER,
    status: "active",
    planKey: c.eventKey,
    "rawWebhook.kind": "forbidden_window",
  })
    .lean()
    .catch(() => []);
  for (const doc of active) {
    const expMs = new Date(doc.rawWebhook?.expiresAt || 0).getTime();
    if (!Number.isFinite(expMs)) continue;
    if (nowMs >= expMs) {
      await SiteDocument.updateOne(
        { _id: doc._id, status: "active" },
        { $set: { status: "expired", "rawWebhook.expiredAt": new Date() } },
      ).catch(() => null);
      await SiteDocument.updateOne(
        {
          docType: FORBIDDEN_DOC,
          guildId: guild.id,
          userId: FORBIDDEN_EVENT_OWNER_ID,
          dedupeKey: doc.rawWebhook?.booksDedupeKey,
          status: { $ne: "closed" },
        },
        { $set: { status: "closed", "rawWebhook.closedAt": new Date() } },
      ).catch(() => null);
      await announceChat(client, c, {
        content:
          "<a:VC_Alert:1482706673176150077> **Sezione proibita** — tempo scaduto: nessuno ha completato i libri sul sito in tempo.",
      });
      continue;
    }
    if (doc.rawWebhook?.hintSentAt) continue;
    if (nowMs < expMs - c.hintBeforeExpiryMs) continue;
    const remainingMin = Math.max(1, Math.ceil((expMs - nowMs) / 60000));
    const books = (Array.isArray(doc.rawWebhook?.bookIds) ? doc.rawWebhook.bookIds : [])
      .map((id) => `• **${formatForbiddenBookLabel(id)}**`)
      .join("\n");
    const embed = new EmbedBuilder()
      .setColor(0xd4af37)
      .setTitle("<a:VC_Events:1482706144953897223> Sezione proibita — indizio!")
      .setDescription(
        [
          "Metà tempo: i libri sono ancora nascosti sulle pagine del **sito** — aprirle e raccoglierli prima che scada il round.",
          "",
          "**Libri richiesti:**",
          books || "—",
          "",
          `<a:VC_pixeltime:1482535344103620771> Restano circa **${remainingMin} minuti**.`,
        ].join("\n"),
      )
      .setTimestamp();
    const sent = await announceChat(client, c, { embeds: [embed], allowedMentions: { parse: [] } });
    if (sent?.id) {
      await SiteDocument.updateOne(
        { _id: doc._id, status: "active", "rawWebhook.hintSentAt": { $exists: false } },
        { $set: { "rawWebhook.hintSentAt": new Date() } },
      ).catch(() => null);
    }
  }
}

async function spawnReactPressChaos(client, guild, c, meta) {
  const { spawnFinaleChaosReactPress } = require("./hogwartsReactPressService");
  return spawnFinaleChaosReactPress(client, guild, {
    eventKey: `${c.eventKey}_react`,
    activeDurationMs: c.activeDurationMs,
    hintBeforeExpiryMs: c.hintBeforeExpiryMs,
    rewardGaleoni: c.rewardGaleoni,
    rewardHousePoints: c.rewardHousePoints,
    pingRoleId: c.pingRoleId,
    announceChannelId: c.announceChannelId,
    firstSlot: meta.firstSlot === true,
    boostType: meta.boostType || "",
    boostScope: meta.boostScope || "personal",
    firstSlotBoostDurationMs: c.firstSlotBoostDurationMs,
    slotKey: meta.slotKey,
    chaosEventKey: c.eventKey,
  });
}

async function spawnFindScrollChaos(client, guild, c, meta) {
  const { startFinaleChaosFindScroll } = require("../Minigames/minigameService");
  return startFinaleChaosFindScroll(client, {
    durationMs: c.activeDurationMs,
    hintBeforeExpiryMs: c.hintBeforeExpiryMs,
    rewardGaleoni: c.rewardGaleoni,
    rewardHousePoints: c.rewardHousePoints,
    pingRoleId: c.pingRoleId,
    firstSlot: meta.firstSlot === true,
    boostType: meta.boostType || "",
    boostScope: meta.boostScope || "personal",
    firstSlotBoostDurationMs: c.firstSlotBoostDurationMs,
    slotKey: meta.slotKey,
    chaosEventKey: c.eventKey,
    announceChannelId: c.announceChannelId,
  });
}

async function trySpawnSlot(client, guild, c, slot, plan) {
  const existing = await loadDoc(guild.id, `slot:${slot.slotKey}`);
  if (existing && ["spawned", "won", "expired", "skipped"].includes(normalizeId(existing.status))) {
    return false;
  }
  const nowMs = Date.now();
  if (nowMs > slot.slotStartMs + c.spawnGraceMs) {
    await upsertDoc(guild.id, `slot:${slot.slotKey}`, {
      status: "skipped",
      planKey: c.eventKey,
      rawWebhook: {
        kind: "slot",
        slotKey: slot.slotKey,
        reason: "grace_elapsed",
      },
    });
    return false;
  }
  if (!(await hasEnoughChat(client, guild.id, c))) return false;

  const game = plan.order?.[slot.slotIndex];
  if (!game) return false;
  const firstSlot = slot.slotIndex === 0;
  const boostPick = {
    boostType: normalizeBoostType(plan.boostType),
    boostScope: normalizeBoostScope(plan.boostScope),
  };
  const meta = {
    ...slot,
    firstSlot,
    boostType: boostPick.boostType,
    boostScope: boostPick.boostScope,
  };

  let ok = false;
  if (game === "reactPress") ok = await spawnReactPressChaos(client, guild, c, meta);
  else if (game === "forbiddenSection") ok = await spawnForbiddenSection(client, guild, c, meta);
  else if (game === "findScroll") ok = await spawnFindScrollChaos(client, guild, c, meta);

  if (!ok) return false;
  await upsertDoc(guild.id, `slot:${slot.slotKey}`, {
    status: "spawned",
    planKey: c.eventKey,
    rawWebhook: {
      kind: "slot",
      eventKey: c.eventKey,
      slotKey: slot.slotKey,
      hourKey: slot.hourKey,
      slotIndex: slot.slotIndex,
      game,
      firstSlot,
      boostType: meta.boostType,
      boostScope: meta.boostScope,
      spawnedAt: new Date(),
    },
  });
  global.logger?.info?.(
    `[FINALE CHAOS] Spawn ${gameLabel(game)} @ ${slot.slotKey} (first=${firstSlot}, boost=${meta.boostType}/${meta.boostScope})`,
  );
  return true;
}

async function tickFinaleChaos(client) {
  const c = cfg(client);
  if (!c.enabled) return;
  const nowMs = Date.now();
  if (!isWithinChaosWindow(c, nowMs)) return;
  const guildId = normalizeId(IDs.guilds?.main || client?.config?.mainGuildId);
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return;

  await maybeHintOrExpireForbidden(client, guild, c, nowMs);

  const parts = getRomeParts(new Date(nowMs));
  const slot = resolveCurrentSlot(parts, c);
  if (!slot) return;
  const plan = await ensureHourPlan(guild.id, c, slot.hourKey);
  await trySpawnSlot(client, guild, c, slot, plan);
}

function startHogwartsFinaleChaosDayLoop(client) {
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  const run = () => {
    tickFinaleChaos(client).catch((err) =>
      global.logger?.warn?.("[FINALE CHAOS] tick:", err?.message || err),
    );
  };
  run();
  const interval = setInterval(run, 20 * 1000);
  if (typeof interval.unref === "function") interval.unref();
  global.logger?.info?.("[FINALE CHAOS] loop avviato");
}

module.exports = {
  cfg,
  startHogwartsFinaleChaosDayLoop,
  tickFinaleChaos,
  resolveFinaleChaosForbiddenRuntime,
  tryAutoWinFinaleChaosForbidden,
  grantFinaleChaosWinRewards,
  grantFinaleChaosBoost,
  grantFinaleChaosPersonalBoost,
  formatPrizeLines,
  gameLabel,
  isWithinChaosWindow,
  CHAOS_FORBIDDEN_MAX_WINNERS,
  CHAOS_FIND_SCROLL_WINNERS,
};
