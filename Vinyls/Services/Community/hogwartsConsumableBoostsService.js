const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { economyConfig } = require("./galeoniEconomyService");
const { spendGaleoni } = require("./gringottService");
const { CONSUMABLE_BOOST_SCOPES, CONSUMABLE_BOOST_TYPES, consumablePrice, getConsumableById } = require("../../Utils/Web/hogwartsShopConsumablesCatalog");
const { isHogwartsShopBoostActive } = require("./hogwartsShopBoostsService");
const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOUSE_POINTS_OWNER_ID = "__event__";
const PERSONAL_BOOSTS_PATH = "profile.events.hogwarts.consumableBoosts";
const GUILD_BOOSTS_PATH = "rawWebhook.consumableBoosts";
const SORTED_HOUSE_IDS = ["gryffindor", "hufflepuff", "ravenclaw", "slytherin"];
const HOUSE_BOOST_ANNOUNCE_CHANNEL_BY_ID = {
  gryffindor: () => IDs.channels?.hogwartsHouseGryffindor,
  hufflepuff: () => IDs.channels?.hogwartsHouseHufflepuff,
  ravenclaw: () => IDs.channels?.hogwartsHouseRavenclaw,
  slytherin: () => IDs.channels?.hogwartsHouseSlytherin,
};

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeHouseId(value) {
  const house = normalizeId(value).toLowerCase();
  return SORTED_HOUSE_IDS.includes(house) ? house : "";
}

function safeMs(value) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isBoostRowActive(row, nowMs = Date.now()) {
  if (!row || typeof row !== "object") return false;
  const expiresAt = safeMs(row.expiresAt);
  return expiresAt > Number(nowMs || Date.now());
}

function normalizeBoostRow(row) {
  if (!isBoostRowActive(row)) return null;
  return {
    itemId: normalizeId(row.itemId),
    itemName: normalizeId(row.itemName),
    activatedBy: normalizeId(row.activatedBy),
    expiresAt: new Date(safeMs(row.expiresAt)),
    remainingMs: Math.max(0, safeMs(row.expiresAt) - Date.now()),
  };
}

function isEconomyConsumablesUnlocked(client, nowMs = Date.now()) {
  const cfg = economyConfig(client);
  if (!cfg.enabled) return false;
  if (Number.isFinite(cfg.startMs) && Number(nowMs || Date.now()) < cfg.startMs) return false;
  return true;
}

function economyConsumablesLockMessage(client) {
  const cfg = economyConfig(client);
  if (!cfg.enabled) return "I boost consumabili non sono disponibili.";
  if (Number.isFinite(cfg.startMs) && Date.now() < cfg.startMs) return "I boost consumabili si sbloccano lunedì 10 agosto con l'economia Galeoni.";
  return "";
}

async function loadGuildConsumableBoosts(client, guildId) {
  const eventKey = normalizeId(resolveHogwartsEventConfig(client)?.eventKey) || "hogwarts";
  const doc = await SiteDocument.findOne({
    docType: HOUSE_POINTS_DOC,
    guildId: normalizeId(guildId),
    userId: HOUSE_POINTS_OWNER_ID,
    dedupeKey: eventKey,
  })
    .select(`${GUILD_BOOSTS_PATH}`)
    .lean()
    .catch(() => null);
  return doc?.rawWebhook?.consumableBoosts && typeof doc.rawWebhook.consumableBoosts === "object"
    ? doc.rawWebhook.consumableBoosts
    : {};
}

async function loadPersonalConsumableBoosts(guildId, userId) {
  const doc = await ActivityUserProfile.findOne({
    guildId: normalizeId(guildId),
    userId: normalizeId(userId),
  })
    .select(PERSONAL_BOOSTS_PATH)
    .lean()
    .catch(() => null);
  return doc?.profile?.events?.hogwarts?.consumableBoosts && typeof doc.profile.events.hogwarts.consumableBoosts === "object"
    ? doc.profile.events.hogwarts.consumableBoosts
    : {};
}

function resolveScopeBoost(boostType, scope, guildBoosts, personalBoosts, houseId, nowMs = Date.now()) {
  if (scope === CONSUMABLE_BOOST_SCOPES.PERSONAL) {
    return normalizeBoostRow(personalBoosts?.[boostType], nowMs);
  }
  const typeBucket = guildBoosts?.[boostType] && typeof guildBoosts[boostType] === "object" ? guildBoosts[boostType] : {};
  if (scope === CONSUMABLE_BOOST_SCOPES.GLOBAL) {
    return normalizeBoostRow(typeBucket.global, nowMs);
  }
  const house = normalizeHouseId(houseId);
  if (!house) return null;
  const houses = typeBucket.houses && typeof typeBucket.houses === "object" ? typeBucket.houses : {};
  return normalizeBoostRow(houses[house], nowMs);
}

async function getActiveConsumableBoosts(client, guildId, userId, houseId) {
  const nowMs = Date.now();
  const [guildBoosts, personalBoosts] = await Promise.all([
    loadGuildConsumableBoosts(client, guildId),
    loadPersonalConsumableBoosts(guildId, userId),
  ]);
  const house = normalizeHouseId(houseId);
  const out = {
    housePoints: {
      global: resolveScopeBoost(CONSUMABLE_BOOST_TYPES.HOUSE_POINTS, CONSUMABLE_BOOST_SCOPES.GLOBAL, guildBoosts, personalBoosts, house, nowMs),
      house: resolveScopeBoost(CONSUMABLE_BOOST_TYPES.HOUSE_POINTS, CONSUMABLE_BOOST_SCOPES.HOUSE, guildBoosts, personalBoosts, house, nowMs),
      personal: resolveScopeBoost(CONSUMABLE_BOOST_TYPES.HOUSE_POINTS, CONSUMABLE_BOOST_SCOPES.PERSONAL, guildBoosts, personalBoosts, house, nowMs),
    },
    exp: {
      global: resolveScopeBoost(CONSUMABLE_BOOST_TYPES.EXP, CONSUMABLE_BOOST_SCOPES.GLOBAL, guildBoosts, personalBoosts, house, nowMs),
      house: resolveScopeBoost(CONSUMABLE_BOOST_TYPES.EXP, CONSUMABLE_BOOST_SCOPES.HOUSE, guildBoosts, personalBoosts, house, nowMs),
      personal: resolveScopeBoost(CONSUMABLE_BOOST_TYPES.EXP, CONSUMABLE_BOOST_SCOPES.PERSONAL, guildBoosts, personalBoosts, house, nowMs),
    },
  };
  return out;
}

function computeConsumableMultiplier(activeBoosts, boostType) {
  const bucket = boostType === CONSUMABLE_BOOST_TYPES.EXP ? activeBoosts?.exp : activeBoosts?.housePoints;
  if (!bucket) return { multiplier: 1, labels: [] };
  let multiplier = 1;
  const labels = [];
  for (const scope of ["global", "house", "personal"]) {
    const row = bucket[scope];
    if (!row) continue;
    multiplier *= 2;
    labels.push(row.itemName || scope);
  }
  return { multiplier, labels };
}

async function resolveHousePointsConsumableMultiplier(client, guildId, userId, houseId) {
  if (!isHogwartsShopBoostActive(client)) return { multiplier: 1, labels: [] };
  const active = await getActiveConsumableBoosts(client, guildId, userId, houseId);
  return computeConsumableMultiplier(active, CONSUMABLE_BOOST_TYPES.HOUSE_POINTS);
}

async function resolveExpConsumableMultiplier(client, guildId, userId, houseId) {
  if (!isHogwartsShopBoostActive(client)) return { multiplier: 1, labels: [] };
  const active = await getActiveConsumableBoosts(client, guildId, userId, houseId);
  return computeConsumableMultiplier(active, CONSUMABLE_BOOST_TYPES.EXP);
}

function anyActiveHouseBoost(guildBoosts, boostType, nowMs = Date.now()) {
  const houses = guildBoosts?.[boostType]?.houses;
  if (!houses || typeof houses !== "object") return null;
  for (const [houseId, row] of Object.entries(houses)) {
    const normalized = normalizeBoostRow(row, nowMs);
    if (normalized) return { ...normalized, houseId: normalizeHouseId(houseId) };
  }
  return null;
}

function boostTypeLabel(boostType) {
  return boostType === CONSUMABLE_BOOST_TYPES.EXP ? "EXP" : "punti casa";
}

function resolveConsumablePurchaseBlock(activeBoosts, item, guildBoosts, nowMs = Date.now()) {
  if (!item?.boostType) return { blocked: true, reason: "Oggetto non valido." };
  const bucket = item.boostType === CONSUMABLE_BOOST_TYPES.EXP ? activeBoosts?.exp : activeBoosts?.housePoints;
  if (!bucket) return { blocked: false };
  const typeLabel = boostTypeLabel(item.boostType);

  if (bucket.global) {
    return {
      blocked: true,
      code: "boost_active",
      reason: `È attivo un boost globale ${typeLabel} (${bucket.global.itemName}). Nessun altro boost ${typeLabel} può essere attivato finché non scade.`,
      blocking: bucket.global,
    };
  }

  if (item.scope === CONSUMABLE_BOOST_SCOPES.GLOBAL) {
    const houseConflict = anyActiveHouseBoost(guildBoosts, item.boostType, nowMs);
    if (houseConflict) {
      return {
        blocked: true,
        code: "boost_active",
        reason: `Una casa ha già un boost ${typeLabel} attivo (${houseConflict.itemName}). Attendi la scadenza prima di attivarne uno globale.`,
        blocking: houseConflict,
      };
    }
    return { blocked: false };
  }

  if (item.scope === CONSUMABLE_BOOST_SCOPES.HOUSE) {
    if (bucket.house) {
      return {
        blocked: true,
        code: "boost_active",
        reason: `La tua casa ha già un boost ${typeLabel} attivo (${bucket.house.itemName}). Un altro membro deve attendere la scadenza prima di attivarne uno nuovo per la casa.`,
        blocking: bucket.house,
      };
    }
    return { blocked: false };
  }

  if (bucket.personal) {
    return {
      blocked: true,
      code: "boost_active",
      reason: `Hai già un boost ${typeLabel} personale attivo (${bucket.personal.itemName}). Attendi la scadenza prima di attivarne un altro.`,
      blocking: bucket.personal,
    };
  }
  return { blocked: false };
}

function boostConflictMessage(item, activeRow) {
  const name = activeRow?.itemName || "boost attivo";
  const typeLabel = boostTypeLabel(item?.boostType);
  if (item?.scope === CONSUMABLE_BOOST_SCOPES.GLOBAL) {
    return `Non puoi attivare un boost globale ${typeLabel}: ${name} è già attivo per una casa.`;
  }
  if (item?.scope === CONSUMABLE_BOOST_SCOPES.HOUSE) {
    return `La tua casa ha già un boost ${typeLabel} attivo (${name}). Attendi la scadenza.`;
  }
  return `Hai già un boost ${typeLabel} personale attivo (${name}). Attendi la scadenza.`;
}

async function assertConsumableActivationAllowed(client, guildId, userId, houseId, item) {
  if (!item?.id) return { ok: false, code: "invalid_item", message: "Oggetto consumabile non valido." };
  if (!isEconomyConsumablesUnlocked(client)) {
    return { ok: false, code: "economy_locked", message: economyConsumablesLockMessage(client) };
  }
  if (!isHogwartsShopBoostActive(client)) {
    return { ok: false, code: "event_closed", message: "I boost consumabili sono disponibili solo durante l'evento Hogwarts." };
  }
  const house = normalizeHouseId(houseId);
  if (!house && item.scope !== CONSUMABLE_BOOST_SCOPES.GLOBAL) {
    return { ok: false, code: "not_sorted", message: "Completa lo smistamento per attivare questo boost." };
  }
  const nowMs = Date.now();
  const [active, guildBoosts] = await Promise.all([
    getActiveConsumableBoosts(client, guildId, userId, house),
    loadGuildConsumableBoosts(client, guildId),
  ]);
  const block = resolveConsumablePurchaseBlock(active, item, guildBoosts, nowMs);
  if (block.blocked) {
    return { ok: false, code: block.code || "boost_active", message: block.reason || boostConflictMessage(item, block.blocking) };
  }
  return { ok: true, houseId: house };
}

function formatDurationIt(durationMs) {
  const totalMin = Math.max(1, Math.ceil(Number(durationMs || 0) / 60000));
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

function resolveHouseBoostAnnounceChannelId(houseId) {
  const house = normalizeHouseId(houseId);
  if (!house) return "";
  const pick = HOUSE_BOOST_ANNOUNCE_CHANNEL_BY_ID[house];
  return pick ? normalizeId(pick()) : "";
}

function resolveHouseBoostAnnounceRoleId(client, houseId) {
  const house = normalizeHouseId(houseId);
  if (!house) return "";
  const cfg = resolveHogwartsEventConfig(client);
  return normalizeId(cfg?.houses?.[house]?.roleId);
}

async function announceGlobalConsumableBoost(client, guildId, { item, buyerDisplayName, houseLabel }) {
  const channelId = normalizeId(IDs.channels?.eventAnnouncements);
  if (!channelId) return;
  const guild = client?.guilds?.cache?.get(normalizeId(guildId)) || (await client?.guilds?.fetch?.(normalizeId(guildId)).catch(() => null));
  if (!guild) return;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return;
  const effectLabel = item.boostType === CONSUMABLE_BOOST_TYPES.EXP ? "EXP" : "punti casa";
  const buyer = normalizeId(buyerDisplayName) || "Un mago";
  const housePart = houseLabel ? ` (${houseLabel})` : "";
  const duration = formatDurationIt(item.durationMs);
  const content = `<a:VC_Events:1482706144953897223> **${buyer}**${housePart} ha attivato **${item.name}**!\n`
    + `> Boost **×2 ${effectLabel}** globale per **${duration}**.`;
  await channel.send({ content, allowedMentions: { parse: [] } }).catch((err) => {
    global.logger?.warn?.("[hogwarts-consumable-boost] announce:", err?.message || err);
  });
}

async function activateConsumableBoost(client, { guildId, userId, houseId, item, eventKey, buyerDisplayName, houseLabel }) {
  const check = await assertConsumableActivationAllowed(client, guildId, userId, houseId, item);
  if (!check.ok) return check;
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  const house = check.houseId;
  if (!isValidGuildUserId(gid, uid)) return { ok: false, code: "invalid_ids", message: "Attivazione non valida." };
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(60000, Math.floor(Number(item.durationMs) || 0)));
  const boostRow = {
    itemId: item.id,
    itemName: item.name,
    activatedBy: uid,
    activatedAt: now,
    expiresAt,
  };
  if (item.scope === CONSUMABLE_BOOST_SCOPES.PERSONAL) {
    const path = `${PERSONAL_BOOSTS_PATH}.${item.boostType}`;
    await ActivityUserProfile.findOneAndUpdate(
      { guildId: gid, userId: uid },
      {
        $set: {
          [path]: boostRow,
          "profile.events.hogwarts.consumableBoosts.eventKey": normalizeId(eventKey) || "hogwarts",
          "profile.events.hogwarts.consumableBoosts.updatedAt": now,
        },
        $setOnInsert: { guildId: gid, userId: uid },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => null);
  } else {
    const ek = normalizeId(eventKey) || "hogwarts";
    const scopePath = item.scope === CONSUMABLE_BOOST_SCOPES.GLOBAL
      ? `${GUILD_BOOSTS_PATH}.${item.boostType}.global`
      : `${GUILD_BOOSTS_PATH}.${item.boostType}.houses.${house}`;
    await SiteDocument.findOneAndUpdate(
      {
        docType: HOUSE_POINTS_DOC,
        guildId: gid,
        userId: HOUSE_POINTS_OWNER_ID,
        dedupeKey: ek,
      },
      {
        $setOnInsert: {
          docType: HOUSE_POINTS_DOC,
          guildId: gid,
          userId: HOUSE_POINTS_OWNER_ID,
          dedupeKey: ek,
          createdBy: "hogwarts_consumable_boost",
          status: "active",
          planKey: "hogwarts_house_points",
        },
        $set: {
          [scopePath]: boostRow,
          "rawWebhook.eventKey": ek,
          "rawWebhook.updatedAt": now,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => null);
  }
  if (item.scope === CONSUMABLE_BOOST_SCOPES.GLOBAL) {
    void announceGlobalConsumableBoost(client, gid, { item, buyerDisplayName, houseLabel });
  } else if (item.scope === CONSUMABLE_BOOST_SCOPES.HOUSE && house) {
    void announceHouseConsumableBoost(client, gid, house, { item, buyerDisplayName, houseLabel });
  }
  const active = await getActiveConsumableBoosts(client, gid, uid, house);
  return {
    ok: true,
    expiresAt,
    activeBoosts: active,
    message: `${item.name} attivato! Boost ×2 fino alle ${expiresAt.toLocaleString("it-IT", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}.`,
  };
}

async function purchaseAndActivateConsumable(client, { guildId, userId, houseId, itemId, eventKey, buyerDisplayName, houseLabel }) {
  const item = getConsumableById(itemId);
  const check = await assertConsumableActivationAllowed(client, guildId, userId, houseId, item);
  if (!check.ok) return check;
  const price = consumablePrice(item);
  const payment = await spendGaleoni({
    guildId,
    userId,
    amount: price,
    reason: `Shop Hogwarts: ${item.name}`,
    actorId: "site",
    source: "hogwarts_shop_consumable",
    eventKey,
  });
  if (!payment?.ok) {
    return {
      ok: false,
      code: payment?.code || "payment_failed",
      message: payment?.code === "insufficient_funds"
        ? "Non hai abbastanza Galeoni per attivare questo boost."
        : "Attivazione non completata. Riprova tra poco.",
    };
  }
  const activated = await activateConsumableBoost(client, { guildId, userId, houseId, item, eventKey, buyerDisplayName, houseLabel });
  if (!activated.ok) {
    const { addGaleoni } = require("./gringottService");
    await addGaleoni({
      guildId,
      userId,
      amount: price,
      reason: `Rimborso boost: ${item.name}`,
      actorId: "site",
      source: "hogwarts_shop_consumable_refund",
      eventKey,
    }).catch(() => null);
    return activated;
  }
  return { ...activated, spent: price, item };
}

function publicActiveBoostsPayload(activeBoosts) {
  const mapScope = (row) => (row ? { itemId: row.itemId, itemName: row.itemName, expiresAt: row.expiresAt, remainingMs: row.remainingMs } : null);
  return {
    housePoints: {
      global: mapScope(activeBoosts?.housePoints?.global),
      house: mapScope(activeBoosts?.housePoints?.house),
      personal: mapScope(activeBoosts?.housePoints?.personal),
    },
    exp: {
      global: mapScope(activeBoosts?.exp?.global),
      house: mapScope(activeBoosts?.exp?.house),
      personal: mapScope(activeBoosts?.exp?.personal),
    },
  };
}

function publicConsumablesCatalogWithAvailability(catalog, activeBoosts, guildBoosts) {
  const base = catalog && typeof catalog === "object" ? catalog : { categories: [] };
  const categories = Array.isArray(base.categories) ? base.categories : [];
  return {
    categories: categories.map((cat) => ({
      ...cat,
      items: (Array.isArray(cat.items) ? cat.items : []).map((item) => {
        const block = resolveConsumablePurchaseBlock(activeBoosts, item, guildBoosts);
        return {
          ...item,
          purchaseBlocked: block.blocked,
          purchaseBlockedReason: block.blocked ? block.reason || "" : "",
        };
      }),
    })),
  };
}

module.exports = { activateConsumableBoost, assertConsumableActivationAllowed, economyConsumablesLockMessage, getActiveConsumableBoosts, isEconomyConsumablesUnlocked, loadGuildConsumableBoosts, publicActiveBoostsPayload, publicConsumablesCatalogWithAvailability, purchaseAndActivateConsumable, resolveConsumablePurchaseBlock, resolveExpConsumableMultiplier, resolveHousePointsConsumableMultiplier };