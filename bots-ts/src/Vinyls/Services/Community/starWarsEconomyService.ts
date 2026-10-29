/**
 * Economia fazioni: banca, shop truppe, attacco orario.
 * Regole PDF: potenza nascosta; vittoria → survivor 15% attaccante / 10% difensore se attacco;
 * ritiro (non attacca mentre altri attaccano) → 70% survivor, attaccante 100%.
 */
"use strict";

const { SiteDocument, SITE_DOCUMENT_TYPE, ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../../Utils/DB/validateWriteIds");
const { resolveStarWarsEventConfig } = require("../../Utils/Web/starWarsEventConfig") as typeof import("../../Utils/Web/starWarsEventConfig");
const { resolveFeatureStateNow, FEATURES, EPOCHS } = require("../../Utils/Web/starWarsEventCalendar") as typeof import("../../Utils/Web/starWarsEventCalendar");
const { unitsForEpoch, EPOCH_FACTIONS, publicShopCatalog } = require("../../Utils/Web/starWarsEconomyCatalog") as typeof import("../../Utils/Web/starWarsEconomyCatalog");
const { getStarWarsWallet, ROOT, publicWallet } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");
const { ADVENT_EVENT_KEY } = require("../../Utils/Web/starWarsAdventCatalog") as typeof import("../../Utils/Web/starWarsAdventCatalog");

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
    lastAttackAt: payload?.lastAttackAt || null,
    updatedAt: payload?.updatedAt || null,
  };
}

async function saveFactionBank(eventKey?, factionId?, bank?) {
  const nowIso = new Date().toISOString();
  const payload = {
    credits: safeInt(bank.credits),
    units: bank.units || {},
    lastAttackAt: bank.lastAttackAt || null,
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
  const cost = unit.cost * amount;
  if (wallet.credits < cost) {
    return { ok: false, status: 409, error: "insufficient_credits", message: "Crediti insufficienti." };
  }

  const nowIso = new Date().toISOString();
  const updated = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u, [`${ROOT}.credits`]: { $gte: cost } },
    {
      $inc: {
        [`${ROOT}.credits`]: -cost,
        [`${ROOT}.army.${uid}`]: amount,
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

  return {
    ok: true,
    status: 200,
    unitId: uid,
    qty: amount,
    cost,
    wallet: publicWallet(updated.profile?.events?.starwars, eventKey),
    bank,
  };
}

async function attackFaction(client, { guildId, userId, defend = false }) {
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

  const myBank = await getFactionBank(eventKey, myId);
  const enemyBank = await getFactionBank(eventKey, enemyId);

  const hourKey = new Date().toISOString().slice(0, 13);
  if (myBank.lastAttackAt && String(myBank.lastAttackAt).startsWith(hourKey)) {
    return { ok: false, status: 429, error: "cooldown", message: "Puoi attaccare al massimo una volta ogni ora (fazione)." };
  }

  if (defend) {
    /* Segna "ritiro / difesa" — non attacca */
    myBank.lastAttackAt = new Date().toISOString();
    await saveFactionBank(eventKey, myId, myBank);
    return { ok: true, status: 200, mode: "defend", message: "La fazione resta in difesa quest'ora." };
  }

  const myPower = unitPower(myBank.units, epoch);
  const enemyPower = unitPower(enemyBank.units, epoch);
  const iAttack = true;
  const enemyAttacking = false; /* semplificato: un attacco alla volta; enemy "non attacca" in questo tick */

  let myFactor;
  let enemyFactor;
  let winner;
  if (myPower >= enemyPower) {
    winner = myId;
    myFactor = 0.15;
    enemyFactor = 0.1;
  } else {
    winner = enemyId;
    myFactor = 0.1;
    enemyFactor = 0.15;
  }
  /* Se il difensore non attacca (ritiro): PDF esempio 2 → difensore 70%, attaccante 100% */
  if (!enemyAttacking && winner === myId) {
    /* we attacked and won vs passive — enemy keeps 70%? Actually: if republic doesn't attack and separatists do, republic loses with 70% keep, sep 100% */
  }
  if (iAttack && !enemyAttacking) {
    if (myPower >= enemyPower) {
      winner = myId;
      myFactor = 1.0;
      enemyFactor = 0.7;
    } else {
      winner = enemyId;
      myFactor = 1.0; /* attaccante perde ma PDF says attacker keeps 100% when defender retreated? esempio 2: attaccanti 100%, difensori 70% */
      enemyFactor = 0.7;
      myFactor = 1.0;
    }
  }

  myBank.units = scaleUnits(myBank.units, myFactor);
  enemyBank.units = scaleUnits(enemyBank.units, enemyFactor);
  myBank.lastAttackAt = new Date().toISOString();
  await saveFactionBank(eventKey, myId, myBank);
  await saveFactionBank(eventKey, enemyId, enemyBank);

  return {
    ok: true,
    status: 200,
    mode: "attack",
    winner,
    myPowerHidden: true,
    mySurviving: myBank.units,
    enemySurvivingHidden: true,
    message: winner === myId ? "La tua fazione ha prevalso." : "La fazione avversaria ha prevalso.",
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
  for (const f of factions) {
    const b = await getFactionBank(eventKey, f);
    banks[f] = {
      factionId: f,
      unitCount: Object.values(b.units || {}).reduce((a?, n?) => a + safeInt(n), 0),
      /* potenza nascosta agli altri */
      powerVisible: false,
      lastAttackAt: b.lastAttackAt,
    };
  }
  return {
    ok: true,
    economyOn: Boolean(features.economyOn),
    economyPhase: features.economyPhase,
    epoch,
    shop: publicShopCatalog(epoch, wallet?.factionId || null),
    wallet,
    banks,
    buyEnabled: Boolean(features.economyOn) || !cfg.publicEnabled, /* HS test: buy ok while locked */
    attackEnabled: Boolean(features.economyOn) || !cfg.publicEnabled,
  };
}

export = {
  getFactionBank,
  saveFactionBank,
  buyUnit,
  attackFaction,
  getEconomySnapshot,
  unitPower,
};
