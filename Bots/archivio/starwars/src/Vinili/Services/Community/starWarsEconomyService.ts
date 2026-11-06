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
const WAR_OWNER = "__starwars_war_log__";

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

function warDedupe(eventKey?, hourKey?) {
  return `sw_war_${eventKey}_${hourKey}`;
}

function unitsDiff(before?, after?) {
  const dead: Record<string, number> = {};
  for (const [k, v] of Object.entries(before || {})) {
    const lost = safeInt(v) - safeInt((after || {})[k]);
    if (lost > 0) dead[k] = lost;
  }
  return dead;
}

function labeledUnitRows(unitsMap?, factionId?, epoch?) {
  const catalog = unitsForEpoch(epoch);
  const byId = new Map(catalog.map((u?) => [u.id, u]));
  const rows = [];
  for (const [id, raw] of Object.entries(unitsMap || {})) {
    const qty = safeInt(raw);
    if (qty < 1) continue;
    const u = byId.get(id);
    const label =
      (u?.labels && factionId && u.labels[factionId]) ||
      (u?.labels && Object.values(u.labels)[0]) ||
      id;
    rows.push({
      id,
      label: String(label),
      qty,
      powerEach: safeInt(u?.power),
      power: qty * safeInt(u?.power),
      tier: safeInt(u?.tier, 1),
      type: u?.type || null,
    });
  }
  rows.sort((a?, b?) => b.power - a.power || a.label.localeCompare(b.label, "it"));
  return rows;
}

function factionLabelSafe(epoch?, factionId?) {
  try {
    const { factionDisplayName } = require("./starWarsPeiStandingService") as typeof import("./starWarsPeiStandingService");
    return factionDisplayName(epoch, factionId) || String(factionId || "");
  } catch (_) {
    try {
      const { getFactionMeta } = require("../../Utils/Eventi/starWarsSortingBank") as typeof import("../../Utils/Eventi/starWarsSortingBank");
      return getFactionMeta(factionId)?.label || String(factionId || "");
    } catch (_) {
      return String(factionId || "");
    }
  }
}

function modeLabel(mode?) {
  if (mode === "engagement") return "Scontro pieno";
  if (mode === "raid") return "Raid";
  if (mode === "standoff") return "Stallo";
  return "Guerra";
}

function buildSideReport({ factionId, epoch, stance, deployed, beforeUnits, surviveFactor, hangarAfter }) {
  const survivors = scaleUnits(beforeUnits, surviveFactor);
  const deadUnits = unitsDiff(beforeUnits, survivors);
  return {
    factionId,
    factionLabel: factionLabelSafe(epoch, factionId),
    stance: normalizeStance(stance),
    deployed: Boolean(deployed),
    surviveFactor: Number(surviveFactor) || 0,
    before: {
      units: { ...(beforeUnits || {}) },
      count: unitCount(beforeUnits),
      power: unitPower(beforeUnits, epoch),
      rows: labeledUnitRows(beforeUnits, factionId, epoch),
    },
    survivors: {
      units: { ...survivors },
      count: unitCount(survivors),
      power: unitPower(survivors, epoch),
      rows: labeledUnitRows(survivors, factionId, epoch),
    },
    dead: {
      units: { ...deadUnits },
      count: unitCount(deadUnits),
      power: unitPower(deadUnits, epoch),
      rows: labeledUnitRows(deadUnits, factionId, epoch),
    },
    hangarAfter: {
      units: { ...(hangarAfter || {}) },
      count: unitCount(hangarAfter),
      power: unitPower(hangarAfter, epoch),
      rows: labeledUnitRows(hangarAfter, factionId, epoch),
    },
  };
}

async function saveWarReport(report?) {
  if (!report?.id || !report?.eventKey || !report?.hourKey) return null;
  const dedupeKey = warDedupe(report.eventKey, report.hourKey);
  await SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, ownerId: WAR_OWNER, dedupeKey },
    {
      $set: { payload: report, updatedAt: new Date() },
      $setOnInsert: { docType: DOC_TYPE, ownerId: WAR_OWNER, dedupeKey, guildId: "0" },
    },
    { upsert: true },
  ).catch(() => null);
  return report;
}

function publicWarSummary(payload?, viewerFactionId?) {
  if (!payload || typeof payload !== "object") return null;
  const winner = payload.winner ? String(payload.winner) : null;
  const youWon = viewerFactionId && winner ? winner === viewerFactionId : null;
  return {
    id: String(payload.id || ""),
    hourKey: String(payload.hourKey || ""),
    resolvedAt: payload.resolvedAt || null,
    epoch: payload.epoch || null,
    mode: payload.mode || null,
    modeLabel: modeLabel(payload.mode),
    winner,
    winnerLabel: winner ? factionLabelSafe(payload.epoch, winner) : null,
    youWon,
    message: payload.message || null,
    left: {
      factionId: payload.left?.factionId || null,
      factionLabel: payload.left?.factionLabel || null,
      stance: payload.left?.stance || null,
      beforeCount: safeInt(payload.left?.before?.count),
      deadCount: safeInt(payload.left?.dead?.count),
      survivorsCount: safeInt(payload.left?.survivors?.count),
    },
    right: {
      factionId: payload.right?.factionId || null,
      factionLabel: payload.right?.factionLabel || null,
      stance: payload.right?.stance || null,
      beforeCount: safeInt(payload.right?.before?.count),
      deadCount: safeInt(payload.right?.dead?.count),
      survivorsCount: safeInt(payload.right?.survivors?.count),
    },
  };
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
    stanceUnits:
      payload?.stanceUnits && typeof payload.stanceUnits === "object" ? { ...payload.stanceUnits } : {},
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
    stanceUnits: bank.stanceUnits && typeof bank.stanceUnits === "object" ? { ...bank.stanceUnits } : {},
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
 * Scrive sempre un resoconto nel registro guerre.
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

  const leftCombat = combatUnitsForHour(left, hourKey);
  const rightCombat = combatUnitsForHour(right, hourKey);
  const leftBefore = { ...leftCombat.map };
  const rightBefore = { ...rightCombat.map };

  let leftFactor = 0;
  let rightFactor = 0;
  let winner = null;
  let mode = "standoff";
  let message = "Nessuna delle due fazioni ha attaccato: le forze schierate sono state perse.";

  if (!leftAttack && !rightAttack) {
    /* Solo le truppe schierate (o hangar se nessuno aveva dichiarato) vengono perse. */
    if (leftCombat.deployed) left.stanceUnits = {};
    else left.units = {};
    if (rightCombat.deployed) right.stanceUnits = {};
    else right.units = {};
    left.resolvedHour = hourKey;
    right.resolvedHour = hourKey;
    await saveFactionBank(eventKey, leftId, left);
    await saveFactionBank(eventKey, rightId, right);
  } else {
    const leftPower = unitPower(leftBefore, epoch);
    const rightPower = unitPower(rightBefore, epoch);

    if (leftAttack && rightAttack) {
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
      message = `Scontro pieno: prevale ${factionLabelSafe(epoch, winner)}.`;
    } else {
      mode = "raid";
      winner = leftPower >= rightPower ? leftId : rightId;
      if (leftAttack) {
        leftFactor = 1.0;
        rightFactor = 0.7;
      } else {
        leftFactor = 0.7;
        rightFactor = 1.0;
      }
      message = `Raid: prevale ${factionLabelSafe(epoch, winner)}. Attaccante 100%, difensore 70% delle forze schierate.`;
    }

    applyCombatOutcome(left, hourKey, leftFactor);
    applyCombatOutcome(right, hourKey, rightFactor);
    left.resolvedHour = hourKey;
    right.resolvedHour = hourKey;
    await saveFactionBank(eventKey, leftId, left);
    await saveFactionBank(eventKey, rightId, right);
  }

  const leftSide = buildSideReport({
    factionId: leftId,
    epoch,
    stance: leftStance,
    deployed: leftCombat.deployed,
    beforeUnits: leftBefore,
    surviveFactor: !leftAttack && !rightAttack ? 0 : leftFactor,
    hangarAfter: left.units,
  });
  const rightSide = buildSideReport({
    factionId: rightId,
    epoch,
    stance: rightStance,
    deployed: rightCombat.deployed,
    beforeUnits: rightBefore,
    surviveFactor: !leftAttack && !rightAttack ? 0 : rightFactor,
    hangarAfter: right.units,
  });

  const report = {
    id: `${eventKey}_${hourKey}`,
    eventKey,
    hourKey,
    epoch,
    resolvedAt: new Date().toISOString(),
    mode,
    modeLabel: modeLabel(mode),
    winner,
    winnerLabel: winner ? factionLabelSafe(epoch, winner) : null,
    message,
    left: leftSide,
    right: rightSide,
    totals: {
      troopsDeployed: leftSide.before.count + rightSide.before.count,
      troopsDead: leftSide.dead.count + rightSide.dead.count,
      troopsSurvived: leftSide.survivors.count + rightSide.survivors.count,
      powerDeployed: leftSide.before.power + rightSide.before.power,
      powerLost: leftSide.dead.power + rightSide.dead.power,
    },
  };
  await saveWarReport(report);

  return {
    ok: true,
    hourKey,
    mode,
    winner,
    leftId,
    rightId,
    leftFactor,
    rightFactor,
    message,
    reportId: report.id,
    myPowerHidden: true,
    enemySurvivingHidden: true,
  };
}

async function listWarReports(client?, { limit = 40, viewerFactionId = null } = {}) {
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const lim = Math.min(80, Math.max(1, safeInt(limit, 40)));
  const prefix = `sw_war_${eventKey}_`;
  const docs = await SiteDocument.find({
    docType: DOC_TYPE,
    ownerId: WAR_OWNER,
    dedupeKey: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` },
  })
    .sort({ updatedAt: -1 })
    .limit(lim)
    .lean()
    .catch(() => []);
  const wars = (docs || [])
    .map((d?) => publicWarSummary(d?.payload, viewerFactionId))
    .filter(Boolean);
  return { ok: true, eventKey, wars, count: wars.length };
}

async function getWarReport(client?, { warId, viewerFactionId = null } = {}) {
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const rawId = String(warId || "").trim();
  if (!rawId) return { ok: false, status: 400, error: "bad_id", message: "Guerra non indicata." };
  const hourKey = rawId.startsWith(`${eventKey}_`) ? rawId.slice(eventKey.length + 1) : rawId;
  const dedupeKey = warDedupe(eventKey, hourKey);
  const doc = await SiteDocument.findOne({ docType: DOC_TYPE, ownerId: WAR_OWNER, dedupeKey })
    .lean()
    .catch(() => null);
  const payload = doc?.payload && typeof doc.payload === "object" ? doc.payload : null;
  if (!payload) {
    return { ok: false, status: 404, error: "not_found", message: "Resoconto non trovato." };
  }
  const summary = publicWarSummary(payload, viewerFactionId);
  return {
    ok: true,
    status: 200,
    war: {
      ...payload,
      ...summary,
      youWon: summary?.youWon ?? null,
    },
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
 * Crediti di sistema → banca fazione (minigame, premi, ecc.).
 * Non scala il wallet personale e non conta come contributo utente (+deposita).
 * Se passa userId, aggiorna solo volume PEI.
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
        reason: "faction_bank_system",
      });
    } catch (_) {}
  }
  return { ok: true, credits: bank.credits, added: add, factionId: fid };
}

/**
 * Unico modo per versare crediti personali → banca fazione (+deposita).
 * Scala wallet, incrementa banca e factionBankGiven.
 */
async function depositPersonalCreditsToFaction(
  client?,
  { guildId, userId, amount }: { guildId?: string | null; userId?: string | null; amount?: number | null } = {},
) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const add = safeInt(amount);
  if (!isValidGuildUserId(g, u)) {
    return { ok: false, status: 400, error: "bad_ids", message: "Utente non valido." };
  }
  if (add < 1) {
    return { ok: false, status: 400, error: "bad_amount", message: "Indica un importo intero almeno di 1 credito." };
  }

  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const features = resolveFeatureStateNow(new Date());
  const economyOk = Boolean(features.economyOn) || !cfg.publicEnabled;
  if (!economyOk) {
    return { ok: false, status: 403, error: "economy_off", message: "L'economia fazioni non è attiva." };
  }

  const wallet = await getStarWarsWallet(g, u, eventKey);
  if (!wallet.factionId) {
    return {
      ok: false,
      status: 403,
      error: "no_faction",
      message: "Devi prima completare lo smistamento.",
    };
  }
  if (safeInt(wallet.credits) < add) {
    return {
      ok: false,
      status: 409,
      error: "insufficient_credits",
      message: `Crediti insufficienti (hai ${safeInt(wallet.credits).toLocaleString("it-IT")}).`,
      wallet,
    };
  }

  const nowIso = new Date().toISOString();
  const updated = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u, [`${ROOT}.credits`]: { $gte: add } },
    {
      $inc: {
        [`${ROOT}.credits`]: -add,
        [`${ROOT}.factionBankGiven`]: add,
        [`${ROOT}.creditsVolume`]: add,
      },
      $set: { [`${ROOT}.updatedAt`]: nowIso, [`${ROOT}.eventKey`]: eventKey },
    },
    { new: true },
  ).catch(() => null);

  if (!updated) {
    return {
      ok: false,
      status: 409,
      error: "insufficient_credits",
      message: "Crediti insufficienti.",
    };
  }

  const bank = await getFactionBank(eventKey, wallet.factionId);
  bank.credits = safeInt(bank.credits) + add;
  await saveFactionBank(eventKey, wallet.factionId, bank);

  /* PEI da volume già incluso via $inc creditsVolume: sync pei come buyUnit */
  const peiGain = add / 100000;
  if (peiGain > 0) {
    await ActivityUserProfile.updateOne(
      { guildId: g, userId: u },
      { $inc: { [`${ROOT}.pei`]: peiGain } },
    ).catch(() => null);
  }

  let pub = publicWallet(updated.profile?.events?.starwars, eventKey);
  try {
    pub = await attachFactionArsenalToWallet(pub, eventKey);
  } catch (_) {}
  /* factionBankGiven già incrementato sul doc; publicWallet da updated potrebbe essere pre-refresh pei */
  pub = {
    ...pub,
    credits: safeInt(pub.credits),
    factionBankGiven: safeInt(pub.factionBankGiven) || safeInt(wallet.factionBankGiven) + add,
  };

  return {
    ok: true,
    status: 200,
    deposited: add,
    factionId: wallet.factionId,
    bankCredits: bank.credits,
    factionBankGiven: pub.factionBankGiven,
    wallet: pub,
    bank,
  };
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

function unitCount(unitsMap?) {
  let n = 0;
  for (const v of Object.values(unitsMap || {})) n += safeInt(v);
  return n;
}

function addUnits(base?, add?) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(base || {})) {
    const n = safeInt(v);
    if (n > 0) out[k] = n;
  }
  for (const [k, v] of Object.entries(add || {})) {
    const n = safeInt(v);
    if (n > 0) out[k] = safeInt(out[k]) + n;
  }
  return out;
}

function subtractUnits(base?, take?) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(base || {})) {
    const n = safeInt(v);
    if (n > 0) out[k] = n;
  }
  for (const [k, v] of Object.entries(take || {})) {
    const id = String(k);
    const n = safeInt(v);
    if (!n) continue;
    const left = safeInt(out[id]) - n;
    if (left > 0) out[id] = left;
    else delete out[id];
  }
  return out;
}

/** Normalizza schieramento contro hangar disponibile. */
function normalizeDeploy(raw?, available?) {
  const out: Record<string, number> = {};
  const src = raw && typeof raw === "object" ? raw : {};
  const hangar = available && typeof available === "object" ? available : {};
  for (const [k, v] of Object.entries(src)) {
    const id = String(k || "").trim();
    if (!id) continue;
    const n = Math.min(safeInt(v), safeInt(hangar[id]));
    if (n > 0) out[id] = n;
  }
  return out;
}

/** Unità in combattimento per l'ora: schierate se presenti, altrimenti tutto l'hangar (passivo). */
function combatUnitsForHour(bank?, hourKey?) {
  if (bank?.stanceHour === hourKey && bank.stanceUnits && typeof bank.stanceUnits === "object") {
    if (unitCount(bank.stanceUnits) > 0) return { map: { ...bank.stanceUnits }, deployed: true };
  }
  return { map: { ...(bank?.units || {}) }, deployed: false };
}

function applyCombatOutcome(bank?, hourKey?, factor?) {
  const combat = combatUnitsForHour(bank, hourKey);
  const survivors = scaleUnits(combat.map, factor);
  if (combat.deployed) {
    bank.units = addUnits(bank.units || {}, survivors);
    bank.stanceUnits = {};
  } else {
    bank.units = survivors;
    bank.stanceUnits = {};
  }
  return bank;
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
  try {
    const { permissionsForTier } = require("../../Utils/Eventi/starWarsFactionRanksCatalog") as typeof import("../../Utils/Eventi/starWarsFactionRanksCatalog");
    if (!permissionsForTier(wallet.factionRankTier).buyTroops) {
      return {
        ok: false,
        status: 403,
        error: "rank_forbidden",
        message: "Il tuo rango non può acquistare truppe.",
      };
    }
  } catch (_) {}
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

  /* Shop truppe: paga SOLO dalla banca fazione (non crediti personali). */
  const bank = await getFactionBank(eventKey, wallet.factionId);
  if (safeInt(bank.credits) < cost) {
    return {
      ok: false,
      status: 409,
      error: "insufficient_bank_credits",
      message: `Crediti banca insufficienti (banca: ${safeInt(bank.credits).toLocaleString("it-IT")}).`,
      bankCredits: safeInt(bank.credits),
    };
  }
  bank.credits = safeInt(bank.credits) - cost;
  bank.units[uid] = safeInt(bank.units[uid]) + amount;
  await saveFactionBank(eventKey, wallet.factionId, bank);

  const pub = await attachFactionArsenalToWallet(wallet, eventKey);
  return {
    ok: true,
    status: 200,
    unitId: uid,
    qty: amount,
    cost,
    baseCost,
    discountMult,
    paidFrom: "faction_bank",
    bankCredits: safeInt(bank.credits),
    wallet: pub,
    bank,
  };
}

async function attackFaction(
  client?,
  {
    guildId,
    userId,
    defend = false,
    useBacta = false,
    deploy = null,
  }: {
    guildId?: string | null;
    userId?: string | null;
    defend?: boolean;
    useBacta?: boolean;
    deploy?: Record<string, number> | null;
  } = {},
) {
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
  try {
    const { permissionsForTier } = require("../../Utils/Eventi/starWarsFactionRanksCatalog") as typeof import("../../Utils/Eventi/starWarsFactionRanksCatalog");
    if (!permissionsForTier(wallet.factionRankTier).war) {
      return {
        ok: false,
        status: 403,
        error: "rank_forbidden",
        message: "Il tuo rango non può dichiarare attacco o difesa.",
      };
    }
  } catch (_) {}
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

  const deployed = normalizeDeploy(deploy, myBank.units);
  if (unitCount(deployed) < 1) {
    return {
      ok: false,
      status: 400,
      error: "no_deploy",
      message: "Schiera almeno un'unità dall'arsenale della fazione.",
    };
  }

  myBank.units = subtractUnits(myBank.units, deployed);
  myBank.stanceUnits = deployed;
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
      deploy: deployed,
      deployCount: unitCount(deployed),
      deployPower: unitPower(deployed, epoch),
      bactaUsed,
      bactaHealed,
      message: defend
        ? "Difesa dichiarata con le forze schierate. Se l'avversario attacca quest'ora, terrrete il 70% di quelle truppe."
        : "Attacco dichiarato con le forze schierate. In attesa della scelta avversaria quest'ora.",
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
    deploy: deployed,
    deployCount: unitCount(deployed),
    deployPower: unitPower(deployed, epoch),
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
  let bankCredits = 0;
  if (walletOut?.factionId) {
    const ownBank = await getFactionBank(eventKey, walletOut.factionId);
    bankCredits = safeInt(ownBank.credits);
  }
  let canBuyTroops = false;
  let canWar = false;
  try {
    const { permissionsForTier } = require("../../Utils/Eventi/starWarsFactionRanksCatalog") as typeof import("../../Utils/Eventi/starWarsFactionRanksCatalog");
    const perms = permissionsForTier(walletOut?.factionRankTier);
    canBuyTroops = Boolean(perms.buyTroops);
    canWar = Boolean(perms.war);
  } catch (_) {}
  const economyGate = Boolean(features.economyOn) || !cfg.publicEnabled;

  return {
    ok: true,
    economyOn: Boolean(features.economyOn),
    economyPhase: features.economyPhase,
    epoch,
    shop,
    shopDiscountMult,
    wallet: walletOut,
    bankCredits,
    banks,
    canBuyTroops,
    canWar,
    buyEnabled: economyGate && canBuyTroops,
    attackEnabled: economyGate && canWar,
  };
}

/** Hub pagina Fazione: banca + arsenale + oggetti + contributo personale. */
async function getFactionHubSnapshot(client, { guildId, userId }) {
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const features = resolveFeatureStateNow(new Date());
  const epoch = features.epoch || EPOCHS.CLONE_WARS;
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!u) {
    return { ok: false, status: 401, error: "missing_user", message: "Accedi con Discord." };
  }

  let wallet = await getStarWarsWallet(g, u, eventKey);
  wallet = await attachFactionArsenalToWallet(wallet, eventKey);
  if (!wallet.factionId) {
    return {
      ok: false,
      status: 403,
      error: "no_faction",
      message: "Devi prima completare lo smistamento.",
      wallet,
    };
  }

  const bank = await getFactionBank(eventKey, wallet.factionId);
  const hourKey = currentHourKey();
  const power = unitPower(bank.units, epoch);
  const unitCount = Object.values(bank.units || {}).reduce((a?, n?) => a + safeInt(n), 0);
  const shopCatalog = publicShopCatalog(epoch, wallet.factionId);
  const unitLabels = Object.fromEntries((shopCatalog.units || []).map((x?) => [x.id, x.label]));

  let utilityItems = [];
  let utilityLabels = {};
  try {
    const {
      publicUtilityCatalog,
      UTILITY_ITEM_LABELS,
      FACTION_UTILITY_ITEM_IDS,
    } = require("../../Utils/Eventi/starWarsUtilityItemsCatalog") as typeof import("../../Utils/Eventi/starWarsUtilityItemsCatalog");
    utilityLabels = { ...UTILITY_ITEM_LABELS };
    utilityItems = publicUtilityCatalog().filter((row?) => FACTION_UTILITY_ITEM_IDS.includes(row.id));
  } catch (_) {}

  let factionLabel = wallet.factionId;
  try {
    const { factionDisplayName } = require("./starWarsPeiStandingService") as typeof import("./starWarsPeiStandingService");
    factionLabel = factionDisplayName(epoch, wallet.factionId) || wallet.factionId;
  } catch (_) {
    try {
      const { getFactionMeta } = require("../../Utils/Eventi/starWarsSortingBank") as typeof import("../../Utils/Eventi/starWarsSortingBank");
      factionLabel = getFactionMeta(wallet.factionId)?.label || wallet.factionId;
    } catch (_) {}
  }

  let buffs = {};
  try {
    const { normalizeBuffs } = require("./starWarsUtilityItemsService") as typeof import("./starWarsUtilityItemsService");
    buffs = normalizeBuffs(bank.buffs);
  } catch (_) {
    buffs = {};
  }

  const myGiven = safeInt(wallet.factionBankGiven);
  const bankCredits = safeInt(bank.credits);
  const rank = wallet.factionRank || null;
  const canBuyTroops = Boolean(rank?.canBuyTroops);
  const canWar = Boolean(rank?.canWar);
  const canManageRanks = Boolean(rank?.canManageRanks);
  const economyGate = Boolean(features.economyOn) || !cfg.publicEnabled;

  let shop = null;
  let shopDiscountMult = 1;
  if (canBuyTroops) {
    try {
      const { shopDiscountMultiplier } = require("./starWarsUtilityItemsService") as typeof import("./starWarsUtilityItemsService");
      shopDiscountMult = await shopDiscountMultiplier(g, u);
    } catch (_) {}
    const shopRaw = publicShopCatalog(epoch, wallet.factionId);
    shop =
      shopDiscountMult < 1 && shopRaw?.units
        ? {
            ...shopRaw,
            discountMult: shopDiscountMult,
            units: shopRaw.units.map((x?) => ({
              ...x,
              cost: Math.max(1, Math.floor(Number(x.cost || 0) * shopDiscountMult)),
              baseCost: x.cost,
              discountMult: shopDiscountMult,
            })),
          }
        : shopRaw;
  }

  return {
    ok: true,
    status: 200,
    eventKey,
    epoch,
    economyOn: Boolean(features.economyOn),
    economyPhase: features.economyPhase,
    factionId: wallet.factionId,
    factionLabel,
    factionRank: rank,
    canBuyTroops,
    canWar,
    canManageRanks,
    buyEnabled: economyGate && canBuyTroops,
    attackEnabled: economyGate && canWar,
    shop,
    shopDiscountMult,
    hourKey,
    stance: stanceForHour(bank, hourKey),
    pendingStance: Boolean(stanceForHour(bank, hourKey) && bank.resolvedHour !== hourKey),
    bank: {
      credits: bankCredits,
      units: bank.units || {},
      items: bank.items || {},
      buffs,
      power,
      unitCount,
      lastAttackAt: bank.lastAttackAt || null,
    },
    contribution: {
      given: myGiven,
      sharePct: bankCredits > 0 ? Math.min(100, Math.round((myGiven / bankCredits) * 1000) / 10) : 0,
    },
    unitLabels,
    utilityItems,
    utilityLabels,
    wallet,
  };
}

export = {
  getFactionBank,
  saveFactionBank,
  addFactionBankCredits,
  depositPersonalCreditsToFaction,
  attachFactionArsenalToWallet,
  buyUnit,
  attackFaction,
  getEconomySnapshot,
  getFactionHubSnapshot,
  unitPower,
  resolveBattleForHour,
  resolveStaleHours,
  currentHourKey,
  listWarReports,
  getWarReport,
};
