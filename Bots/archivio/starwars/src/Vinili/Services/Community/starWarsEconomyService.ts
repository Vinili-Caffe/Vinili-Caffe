/**
 * Economia fazioni: banca, shop truppe, attacco orario.
 * Dichiarazioni per ora UTC; lo scontro risolve quando entrambe hanno scelto (o a fine ora).
 * Esempio 1 (entrambe attaccano): vincitore 15%, perdente 10%.
 * Esempio 2 (una sola attacca / l'altra difende o non agisce): attaccante 100%, difensore 70%.
 */
"use strict";


const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { SiteDocument, SITE_DOCUMENT_TYPE, ActivityUserProfile } = require(__eventCoreVinili("Community/schemas/communitySchemas"));
const { isValidGuildUserId } = require(__eventCoreVinili("../shared/db/validateWriteIds"));
const { resolveStarWarsEventConfig } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
const { resolveFeatureStateNow, FEATURES, EPOCHS } = require("../../Utils/Eventi/starWarsEventCalendar") as typeof import("../../Utils/Eventi/starWarsEventCalendar");
const { unitsForEpoch, EPOCH_FACTIONS, publicShopCatalog } = require("../../Utils/Eventi/starWarsEconomyCatalog") as typeof import("../../Utils/Eventi/starWarsEconomyCatalog");
const { getStarWarsWallet, ROOT, publicWallet } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");
const { ADVENT_EVENT_KEY } = require("../../Utils/Eventi/starWarsAdventCatalog") as typeof import("../../Utils/Eventi/starWarsAdventCatalog");

const BANK_OWNER = "__starwars_faction_bank__";

function normalizeId(v?) {
  return String(v || "").trim();
}
function safeInt(v?, fb = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fb;
}

function bankDedupe(eventKey?, factionId?) {
  return `sw_bank_${eventKey}_${factionId}`;
}

const DOC_TYPE = SITE_DOCUMENT_TYPE.STARWARS_EVENT_STATE;

function currentHourKey(now = new Date()) {
  return now.toISOString().slice(0, 13);
}

function normalizeStance(v?) {
  const s = String(v || "").trim().toLowerCase();
  return s === "attack" || s === "defend" ? s : null;
}

function normalizeBankItems(raw?) {
  const out: Record<string, number> = {};
  const src = raw && typeof raw === "object" ? raw : {};
  for (const id of ["bacta", "sconto_mercato_nero"]) {
    const n = safeInt(src[id]);
    if (n > 0) out[id] = n;
  }
  return out;
}

function normalizeBankBuffs(raw?) {
  const out: Record<string, any> = {};
  const src = raw && typeof raw === "object" ? raw : {};
  const row = src.sconto_mercato_nero;
  if (row && typeof row === "object") {
    out.sconto_mercato_nero = {
      active: true,
      activatedAt: row.activatedAt ? String(row.activatedAt) : null,
      expiresAt: row.expiresAt ? String(row.expiresAt) : null,
    };
  }
  return out;
}

async function getFactionBank(eventKey?, factionId?) {
  const doc = await SiteDocument.findOne({
    docType: DOC_TYPE,
    ownerId: BANK_OWNER,
    dedupeKey: bankDedupe(eventKey, factionId),
  })
    .lean()
    .catch(() => null);
  const payload = doc?.payload && typeof doc.payload === "object" ? doc.payload : null;
  return {
    factionId,
    credits: safeInt(payload?.credits),
    units: payload?.units && typeof payload.units === "object" ? { ...payload.units } : {},
    items: normalizeBankItems(payload?.items),
    buffs: normalizeBankBuffs(payload?.buffs),
    lastAttackAt: payload?.lastAttackAt || null,
    stance: normalizeStance(payload?.stance),
    stanceHour: payload?.stanceHour ? String(payload.stanceHour).slice(0, 13) : null,
    resolvedHour: payload?.resolvedHour ? String(payload.resolvedHour).slice(0, 13) : null,
    updatedAt: payload?.updatedAt || null,
  };
}

async function saveFactionBank(eventKey?, factionId?, bank?) {
  const nowIso = new Date().toISOString();
  const payload = {
    credits: safeInt(bank.credits),
    units: bank.units || {},
    items: normalizeBankItems(bank.items),
    buffs: normalizeBankBuffs(bank.buffs),
    lastAttackAt: bank.lastAttackAt || null,
    stance: normalizeStance(bank.stance),
    stanceHour: bank.stanceHour ? String(bank.stanceHour).slice(0, 13) : null,
    resolvedHour: bank.resolvedHour ? String(bank.resolvedHour).slice(0, 13) : null,
    updatedAt: nowIso,
  };
  await SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, ownerId: BANK_OWNER, dedupeKey: bankDedupe(eventKey, factionId) },
    {
      $set: { payload, updatedAt: new Date() },
      $setOnInsert: { docType: DOC_TYPE, ownerId: BANK_OWNER, dedupeKey: bankDedupe(eventKey, factionId), guildId: "0" },
    },
    { upsert: true },
  ).catch(() => null);
  return payload;
}

/** Overlay arsenale fazione su wallet pubblico (truppe + bacta/sconto). */
async function attachFactionArsenalToWallet(wallet?, eventKey?) {
  if (!wallet?.factionId) return wallet;
  const bank = await getFactionBank(eventKey, wallet.factionId);
  let factionBuffs: Record<string, any> = {};
  try {
    const { normalizeBuffs } = require("./starWarsUtilityItemsService") as typeof import("./starWarsUtilityItemsService");
    const {
      UTILITY_ITEM_LABELS,
      UTILITY_ITEM_BLURBS,
    } = require("../../Utils/Eventi/starWarsUtilityItemsCatalog") as typeof import("../../Utils/Eventi/starWarsUtilityItemsCatalog");
    factionBuffs = normalizeBuffs(bank.buffs) || {};
    if (factionBuffs.sconto_mercato_nero) {
      factionBuffs.sconto_mercato_nero.label = UTILITY_ITEM_LABELS.sconto_mercato_nero;
      factionBuffs.sconto_mercato_nero.blurb = UTILITY_ITEM_BLURBS.sconto_mercato_nero;
    }
  } catch (_) {
    factionBuffs = {};
  }
  const items = { ...(wallet.items || {}) };
  items.bacta = safeInt(bank.items?.bacta);
  items.sconto_mercato_nero = safeInt(bank.items?.sconto_mercato_nero);
  const buffs = { ...(wallet.buffs || {}) };
  if (factionBuffs.sconto_mercato_nero) buffs.sconto_mercato_nero = factionBuffs.sconto_mercato_nero;
  else delete buffs.sconto_mercato_nero;
  return {
    ...wallet,
    army: bank.units && typeof bank.units === "object" ? { ...bank.units } : {},
    items,
    buffs,
  };
}

function stanceForHour(bank?, hourKey?) {
  if (!bank?.stanceHour || bank.stanceHour !== hourKey) return null;
  return normalizeStance(bank.stance);
}

function isHourResolved(bank?, hourKey?) {
  return Boolean(hourKey && bank?.resolvedHour === hourKey);
}

/**
 * Risolve lo scontro per un'ora: entrambi attaccano → 15%/10%; una sola attacca → 100%/70%.
 * Stance assente = ritiro passivo (come Difendi).
 */
async function resolveBattleForHour(eventKey?, leftId?, rightId?, epoch?, hourKey?) {
  let left = await getFactionBank(eventKey, leftId);
  let right = await getFactionBank(eventKey, rightId);
  if (isHourResolved(left, hourKey) || isHourResolved(right, hourKey)) {
    return { ok: true, alreadyResolved: true, hourKey };
  }

  const leftStance = stanceForHour(left, hourKey);
  const rightStance = stanceForHour(right, hourKey);
  const leftAttack = leftStance === "attack";
  const rightAttack = rightStance === "attack";

  if (!leftAttack && !rightAttack) {
    left.units = {};
    right.units = {};
    left.resolvedHour = hourKey;
    right.resolvedHour = hourKey;
    await saveFactionBank(eventKey, leftId, left);
    await saveFactionBank(eventKey, rightId, right);
    return {
      ok: true,
      hourKey,
      mode: "standoff",
      winner: null,
      message: "Nessuna delle due fazioni ha attaccato: le truppe di entrambe sono state perse.",
    };
  }

  const leftPower = unitPower(left.units, epoch);
  const rightPower = unitPower(right.units, epoch);
  let leftFactor;
  let rightFactor;
  let winner;
  let mode;

  if (leftAttack && rightAttack) {
    /* Esempio 1 — scontro pieno */
    mode = "engagement";
    if (leftPower >= rightPower) {
      winner = leftId;
      leftFactor = 0.15;
      rightFactor = 0.1;
    } else {
      winner = rightId;
      leftFactor = 0.1;
      rightFactor = 0.15;
    }
  } else {
    /* Esempio 2 — una attacca, l'altra ritira/difende: attaccante 100%, difensore 70% */
    mode = "raid";
    winner = leftPower >= rightPower ? leftId : rightId;
    if (leftAttack) {
      leftFactor = 1.0;
      rightFactor = 0.7;
    } else {
      leftFactor = 0.7;
      rightFactor = 1.0;
    }
  }

  left.units = scaleUnits(left.units, leftFactor);
  right.units = scaleUnits(right.units, rightFactor);
  left.resolvedHour = hourKey;
  right.resolvedHour = hourKey;
  await saveFactionBank(eventKey, leftId, left);
  await saveFactionBank(eventKey, rightId, right);

  return {
    ok: true,
    hourKey,
    mode,
    winner,
    leftId,
    rightId,
    leftFactor,
    rightFactor,
    myPowerHidden: true,
    enemySurvivingHidden: true,
  };
}

/** Chiude ore precedenti ancora pendenti (attacco senza risposta → raid vs ritiro). */
async function resolveStaleHours(eventKey?, leftId?, rightId?, epoch?, currentHour?) {
  const left = await getFactionBank(eventKey, leftId);
  const right = await getFactionBank(eventKey, rightId);
  const hours = new Set();
  for (const b of [left, right]) {
    if (b.stanceHour && b.stanceHour < currentHour && b.resolvedHour !== b.stanceHour) {
      hours.add(b.stanceHour);
    }
  }
  const results = [];
  for (const h of [...hours].sort()) {
    results.push(await resolveBattleForHour(eventKey, leftId, rightId, epoch, h));
  }
  return results;
}

/**
 * Aggiunge crediti alla banca fazione.
 * Se passa userId, conta il versamento nel volume PEI dell'utente.
 */
async function addFactionBankCredits(client?, factionId?, amount?, { guildId = null, userId = null } = {}) {
  const fid = normalizeId(factionId).toLowerCase();
  const add = safeInt(amount);
  if (!fid || add <= 0) return { ok: false, credits: 0 };
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const bank = await getFactionBank(eventKey, fid);
  bank.credits = safeInt(bank.credits) + add;
  await saveFactionBank(eventKey, fid, bank);
  const uid = normalizeId(userId);
  const gid = normalizeId(guildId);
  if (uid && gid) {
    try {
      const { grantStarWarsCreditsVolumePei } = require("./starWarsRewardsService") as typeof import("./starWarsRewardsService");
      await grantStarWarsCreditsVolumePei(client, {
        guildId: gid,
        userId: uid,
        amount: add,
        reason: "faction_bank_deposit",
      });
    } catch (_) {}
  }
  return { ok: true, credits: bank.credits, added: add, factionId: fid };
}

function unitPower(unitsMap?, epoch?) {
  const catalog = unitsForEpoch(epoch);
  let power = 0;
  for (const u of catalog) {
    const qty = safeInt(unitsMap?.[u.id]);
    power += qty * u.power;
  }
  return power;
}

function scaleUnits(unitsMap?, factor?) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(unitsMap || {})) {
    const n = Math.floor(safeInt(v) * factor);
    if (n > 0) out[k] = n;
  }
  return out;
}

async function buyUnit(client, { guildId, userId, unitId, qty = 1 }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const uid = normalizeId(unitId);
  const amount = Math.max(1, safeInt(qty, 1));
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const features = resolveFeatureStateNow(new Date());
  if (!isValidGuildUserId(g, u)) return { ok: false, status: 400, error: "bad_ids" };

  const wallet = await getStarWarsWallet(g, u, eventKey);
  if (!wallet.factionId) {
    return { ok: false, status: 403, error: "no_faction", message: "Devi prima fare lo smistamento." };
  }
  const epoch = features.epoch || wallet.epoch || EPOCHS.CLONE_WARS;
  const catalog = unitsForEpoch(epoch);
  const unit = catalog.find((x?) => x.id === uid);
  if (!unit) return { ok: false, status: 404, error: "unknown_unit", message: "Unità non in catalogo." };
  if (!unit.labels[wallet.factionId]) {
    return { ok: false, status: 403, error: "wrong_faction", message: "Unità non della tua fazione." };
  }
  let discountMult = 1;
  try {
    const { shopDiscountMultiplier } = require("./starWarsUtilityItemsService") as typeof import("./starWarsUtilityItemsService");
    discountMult = await shopDiscountMultiplier(g, u);
  } catch (_) {}
  const baseCost = unit.cost * amount;
  const cost = Math.max(1, Math.floor(baseCost * discountMult));
  if (wallet.credits < cost) {
    return { ok: false, status: 409, error: "insufficient_credits", message: "Crediti insufficienti." };
  }

  const nowIso = new Date().toISOString();
  const peiGain = cost / 100000; /* 10M crediti spesi → 100 PEI */
  const updated = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u, [`${ROOT}.credits`]: { $gte: cost } },
    {
      $inc: {
        [`${ROOT}.credits`]: -cost,
        [`${ROOT}.creditsVolume`]: cost,
        [`${ROOT}.pei`]: peiGain,
      },
      $set: { [`${ROOT}.updatedAt`]: nowIso, [`${ROOT}.eventKey`]: eventKey },
    },
    { new: true },
  ).catch(() => null);
  if (!updated) {
    return { ok: false, status: 409, error: "insufficient_credits", message: "Crediti insufficienti." };
  }

  const bank = await getFactionBank(eventKey, wallet.factionId);
  bank.units[uid] = safeInt(bank.units[uid]) + amount;
  await saveFactionBank(eventKey, wallet.factionId, bank);

  const pub = await attachFactionArsenalToWallet(
    publicWallet(updated.profile?.events?.starwars, eventKey),
    eventKey,
  );
  return {
    ok: true,
    status: 200,
    unitId: uid,
    qty: amount,
    cost,
    baseCost,
    discountMult,
    pei: peiGain,
    wallet: pub,
    bank,
  };
}

async function attackFaction(client, { guildId, userId, defend = false, useBacta = false }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const features = resolveFeatureStateNow(new Date());
  const epoch = features.epoch || EPOCHS.CLONE_WARS;
  const factions = EPOCH_FACTIONS[epoch] || EPOCH_FACTIONS[EPOCHS.CLONE_WARS];

  const wallet = await getStarWarsWallet(g, u, eventKey);
  if (!wallet.factionId || !factions.includes(wallet.factionId)) {
    return { ok: false, status: 403, error: "no_faction", message: "Fazione non valida per questa epoca." };
  }
  const myId = wallet.factionId;
  const enemyId = factions.find((f?) => f !== myId);
  if (!enemyId) return { ok: false, status: 500, error: "no_enemy" };

  const hourKey = currentHourKey();
  await resolveStaleHours(eventKey, myId, enemyId, epoch, hourKey);

  let myBank = await getFactionBank(eventKey, myId);
  if (stanceForHour(myBank, hourKey) || (myBank.lastAttackAt && String(myBank.lastAttackAt).startsWith(hourKey))) {
    return {
      ok: false,
      status: 429,
      error: "cooldown",
      message: "La fazione ha già scelto per quest'ora.",
    };
  }

  let bactaUsed = false;
  let bactaHealed = null;
  if (useBacta && !defend) {
    const { computeBactaHeal } = require("./starWarsUtilityItemsService") as typeof import("./starWarsUtilityItemsService");
    const bactaQty = safeInt(myBank.items?.bacta);
    if (bactaQty < 1) {
      return {
        ok: false,
        status: 409,
        error: "no_bacta",
        message: "La fazione non ha Bacta da usare in attacco.",
      };
    }
    const heal = computeBactaHeal(myBank.units);
    if (!heal.hadArmy) {
      return {
        ok: false,
        status: 409,
        error: "no_army",
        message: "Non ci sono truppe nell'arsenale della fazione da curare con Bacta.",
      };
    }
    myBank.items = { ...(myBank.items || {}) };
    const left = bactaQty - 1;
    if (left > 0) myBank.items.bacta = left;
    else delete myBank.items.bacta;
    myBank.units = heal.after;
    bactaUsed = true;
    bactaHealed = heal.healed;
  }

  const stance = defend ? "defend" : "attack";
  myBank.stance = stance;
  myBank.stanceHour = hourKey;
  myBank.lastAttackAt = new Date().toISOString();
  await saveFactionBank(eventKey, myId, myBank);

  const enemyBank = await getFactionBank(eventKey, enemyId);
  const enemyStance = stanceForHour(enemyBank, hourKey);

  if (!enemyStance) {
    return {
      ok: true,
      status: 200,
      mode: defend ? "defend_pending" : "attack_pending",
      pending: true,
      hourKey,
      stance,
      bactaUsed,
      bactaHealed,
      message: defend
        ? "Difesa dichiarata. Se l'avversario attacca quest'ora, terrrete il 70% delle truppe."
        : "Attacco dichiarato. In attesa della scelta avversaria quest'ora.",
    };
  }

  const resolved = await resolveBattleForHour(eventKey, myId, enemyId, epoch, hourKey);
  const myWon = resolved.winner === myId;
  let message;
  if (resolved.mode === "standoff") {
    message = resolved.message;
  } else if (resolved.mode === "engagement") {
    message = myWon
      ? "Scontro pieno: la tua fazione ha prevalso."
      : "Scontro pieno: la fazione avversaria ha prevalso.";
  } else {
    const iAttacked = stance === "attack";
    message = myWon
      ? iAttacked
        ? "Raid: avete prevalso e mantenete tutte le truppe; il difensore tiene il 70%."
        : "Raid: avete prevalso in difesa; tenete il 70%, l'attaccante il 100%."
      : iAttacked
        ? "Raid: l'avversario ha prevalso; mantenete tutte le truppe, loro il 70%."
        : "Raid: l'avversario ha prevalso; tenete il 70% delle truppe.";
  }

  const fresh = await getFactionBank(eventKey, myId);
  return {
    ok: true,
    status: 200,
    mode: resolved.mode || (defend ? "defend" : "attack"),
    pending: false,
    hourKey,
    winner: resolved.winner,
    myPowerHidden: true,
    mySurviving: fresh.units,
    enemySurvivingHidden: true,
    bactaUsed,
    bactaHealed,
    message,
  };
}

async function getEconomySnapshot(client, { guildId, userId }) {
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const features = resolveFeatureStateNow(new Date());
  const epoch = features.epoch || EPOCHS.CLONE_WARS;
  const wallet = userId ? await getStarWarsWallet(guildId, userId, eventKey) : null;
  const factions = EPOCH_FACTIONS[epoch] || [];
  const banks: Record<string, any> = {};
  const hourKey = currentHourKey();
  for (const f of factions) {
    const b = await getFactionBank(eventKey, f);
    const own = wallet?.factionId && f === wallet.factionId;
    banks[f] = {
      factionId: f,
      /* conteggio/potenza solo per la propria fazione */
      unitCount: own ? Object.values(b.units || {}).reduce((a?, n?) => a + safeInt(n), 0) : null,
      powerVisible: false,
      lastAttackAt: b.lastAttackAt,
      stance: own ? stanceForHour(b, hourKey) : null,
      pending: own ? Boolean(stanceForHour(b, hourKey) && b.resolvedHour !== hourKey) : null,
    };
  }
  let shopDiscountMult = 1;
  if (userId) {
    try {
      const { shopDiscountMultiplier } = require("./starWarsUtilityItemsService") as typeof import("./starWarsUtilityItemsService");
      shopDiscountMult = await shopDiscountMultiplier(guildId, userId);
    } catch (_) {}
  }
  const shopRaw = publicShopCatalog(epoch, wallet?.factionId || null);
  const shop =
    shopDiscountMult < 1 && shopRaw?.units
      ? {
          ...shopRaw,
          discountMult: shopDiscountMult,
          units: shopRaw.units.map((u?) => ({
            ...u,
            cost: Math.max(1, Math.floor(Number(u.cost || 0) * shopDiscountMult)),
            baseCost: u.cost,
            discountMult: shopDiscountMult,
          })),
        }
      : shopRaw;

  const walletOut = wallet ? await attachFactionArsenalToWallet(wallet, eventKey) : null;

  return {
    ok: true,
    economyOn: Boolean(features.economyOn),
    economyPhase: features.economyPhase,
    epoch,
    shop,
    shopDiscountMult,
    wallet: walletOut,
    banks,
    buyEnabled: Boolean(features.economyOn) || !cfg.publicEnabled, /* HS test: buy ok while locked */
    attackEnabled: Boolean(features.economyOn) || !cfg.publicEnabled,
  };
}

export = {
  getFactionBank,
  saveFactionBank,
  addFactionBankCredits,
  attachFactionArsenalToWallet,
  buyUnit,
  attackFaction,
  getEconomySnapshot,
  unitPower,
  resolveBattleForHour,
  resolveStaleHours,
  currentHourKey,
};
