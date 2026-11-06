/**
 * Wallet evento Star Wars su ActivityUserProfile.profile.events.starwars
 * Fase 0: credits/exp/pei/casse/avvento claim. Economia/fazioni dopo.
 */
"use strict";


const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require(__eventCoreVinili(
  "Community/schemas/communitySchemas",
));
const { isValidGuildUserId } = require(__eventCoreVinili("../shared/db/validateWriteIds"));
const { resolveStarWarsEventConfig } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
const {
  ADVENT_EVENT_KEY,
  CRATE_LABELS,
  getAdventDay,
  listAdventDays,
} = require("../../Utils/Eventi/starWarsAdventCatalog") as typeof import("../../Utils/Eventi/starWarsAdventCatalog");
const {
  adventSlotForRomeDate,
  resolveFeatureStateNow,
  EPOCHS,
} = require("../../Utils/Eventi/starWarsEventCalendar") as typeof import("../../Utils/Eventi/starWarsEventCalendar");
const { openCrateLoot } = require("../../Utils/Eventi/starWarsCrateLoot") as typeof import("../../Utils/Eventi/starWarsCrateLoot");
const {
  materializeTroopGrants,
  isTroopTierKey,
} = require("../../Utils/Eventi/starWarsEconomyCatalog") as typeof import("../../Utils/Eventi/starWarsEconomyCatalog");

const ROOT = "profile.events.starwars";
const CRATE_IDS = Object.freeze(Object.keys(CRATE_LABELS));
const BANK_OWNER = "__starwars_faction_bank__";
const BANK_DOC = SITE_DOCUMENT_TYPE.STARWARS_EVENT_STATE;

function normalizeId(v?) {
  return String(v || "").trim();
}

/** Legacy crate ids → current catalog ids. */
function normalizeCrateKey(v?) {
  const id = normalizeId(v);
  if (id === "casuale") return "stellare";
  if (id === "casuale_2") return "cosmica";
  return id;
}

function safeInt(v?, fallback = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

function emptyCrates() {
  const out: Record<string, any> = {};
  for (const id of CRATE_IDS) out[id] = 0;
  return out;
}

function normalizeCrates(raw?) {
  const out = emptyCrates();
  if (!raw || typeof raw !== "object") return out;
  for (const id of CRATE_IDS) out[id] = safeInt(raw[id]);
  // legacy rename: casuale → stellare, casuale_2 → cosmica
  out.stellare = safeInt(out.stellare) + safeInt(raw.casuale);
  out.cosmica = safeInt(out.cosmica) + safeInt(raw.casuale_2);
  return out;
}

function normalizeClaimed(raw?) {
  const out: Record<string, any> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const day = Math.floor(Number(k));
    if (!Number.isFinite(day) || day < 1 || day > 25) continue;
    const at = v == null ? null : String(v);
    if (at) out[String(day)] = at;
  }
  return out;
}

function normalizePublicArmy(raw?) {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const id = normalizeId(k);
    const n = safeInt(v);
    if (id && n > 0) out[id] = n;
  }
  return out;
}

function normalizePublicBuffs(raw?) {
  try {
    const { normalizeBuffs } = require("./starWarsUtilityItemsService") as typeof import("./starWarsUtilityItemsService");
    return normalizeBuffs(raw);
  } catch (_) {
    return {};
  }
}

function normalizePublicLevel(raw?) {
  try {
    const { publicLevelProgress, levelFromEventExp } = require("../../Utils/Eventi/starWarsLevelCatalog") as typeof import("../../Utils/Eventi/starWarsLevelCatalog");
    const exp = safeInt(raw?.exp);
    const stored = safeInt(raw?.pgLevel);
    const computed = levelFromEventExp(exp);
    return publicLevelProgress(exp, Math.max(stored, computed));
  } catch (_) {
    return {
      level: Math.max(0, safeInt(raw?.pgLevel)),
      title: "Non classificato",
      exp: safeInt(raw?.exp),
      expToNext: 0,
      nextLevel: null,
      nextReq: null,
      progressPct: 0,
      maxLevel: 110,
    };
  }
}

function readSlice(doc?) {
  return doc?.profile?.events?.starwars && typeof doc.profile.events.starwars === "object"
    ? doc.profile.events.starwars
    : null;
}

function publicFactionRank(raw?) {
  try {
    const { publicRank } = require("../../Utils/Eventi/starWarsFactionRanksCatalog") as typeof import("../../Utils/Eventi/starWarsFactionRanksCatalog");
    if (!raw?.factionId) return null;
    return publicRank(raw.factionId, raw.factionRankTier || 1, raw.epoch);
  } catch (_) {
    return null;
  }
}

function publicWallet(raw?, eventKey?) {
  const key = normalizeId(raw?.eventKey) || eventKey || ADVENT_EVENT_KEY;
  if (raw && normalizeId(raw.eventKey) && normalizeId(raw.eventKey) !== key) {
    return blankWallet(key);
  }
  const factionRankTier = Math.max(1, Math.min(4, safeInt(raw?.factionRankTier, 1) || 1));
  return {
    eventKey: key,
    factionId: raw?.factionId ? String(raw.factionId) : null,
    epoch: raw?.epoch ? String(raw.epoch) : null,
    factionRankTier: raw?.factionId ? factionRankTier : null,
    factionRank: publicFactionRank(raw),
    pgLevel: Math.max(0, safeInt(raw?.pgLevel)),
    exp: safeInt(raw?.exp),
    credits: safeInt(raw?.credits),
    pei: Number(raw?.pei) || 0,
    creditsVolume: safeInt(raw?.creditsVolume),
    factionBankGiven: safeInt(raw?.factionBankGiven),
    votes: safeInt(raw?.votes),
    quizCorrectTotal: safeInt(raw?.quizCorrectTotal),
    crates: normalizeCrates(raw?.crates),
    items: raw?.items && typeof raw.items === "object" ? { ...raw.items } : {},
    army: normalizePublicArmy(raw?.army),
    pendingTroops: normalizePublicArmy(raw?.pendingTroops),
    buffs: normalizePublicBuffs(raw?.buffs),
    level: normalizePublicLevel(raw),
    deckPG: Array.isArray(raw?.deckPG) ? raw.deckPG.slice(0, 200) : [],
    deckReliquie: Array.isArray(raw?.deckReliquie) ? raw.deckReliquie.slice(0, 200) : [],
    advent: {
      claimed: normalizeClaimed(raw?.advent?.claimed),
    },
    updatedAt: raw?.updatedAt ? String(raw.updatedAt) : null,
  };
}

function blankWallet(eventKey?) {
  return {
    eventKey: eventKey || ADVENT_EVENT_KEY,
    factionId: null,
    epoch: null,
    factionRankTier: null,
    factionRank: null,
    pgLevel: 0,
    exp: 0,
    credits: 0,
    pei: 0,
    creditsVolume: 0,
    factionBankGiven: 0,
    votes: 0,
    quizCorrectTotal: 0,
    crates: emptyCrates(),
    items: {},
    army: {},
    pendingTroops: {},
    buffs: {},
    level: normalizePublicLevel({ pgLevel: 0, exp: 0 }),
    deckPG: [],
    deckReliquie: [],
    advent: { claimed: {} },
    updatedAt: null,
  };
}

function normalizeFactionBankItems(raw?) {
  const out: Record<string, number> = {};
  const src = raw && typeof raw === "object" ? raw : {};
  for (const id of ["bacta", "sconto_mercato_nero"]) {
    const n = safeInt(src[id]);
    if (n > 0) out[id] = n;
  }
  return out;
}

function writeFactionBankPayload(payload?, patch?) {
  const nowIso = new Date().toISOString();
  const base = payload && typeof payload === "object" ? payload : {};
  return {
    credits: safeInt(patch?.credits != null ? patch.credits : base.credits),
    units: patch?.units != null ? patch.units : base.units && typeof base.units === "object" ? { ...base.units } : {},
    items: normalizeFactionBankItems(patch?.items != null ? patch.items : base.items),
    buffs: patch?.buffs != null ? patch.buffs : base.buffs && typeof base.buffs === "object" ? { ...base.buffs } : {},
    lastAttackAt: patch?.lastAttackAt !== undefined ? patch.lastAttackAt : base.lastAttackAt || null,
    stance: patch?.stance !== undefined ? patch.stance : base.stance || null,
    stanceHour: patch?.stanceHour !== undefined ? patch.stanceHour : base.stanceHour || null,
    resolvedHour: patch?.resolvedHour !== undefined ? patch.resolvedHour : base.resolvedHour || null,
    updatedAt: nowIso,
  };
}

async function loadFactionBankPayload(eventKey?, factionId?) {
  const fid = normalizeId(factionId).toLowerCase();
  const ek = normalizeId(eventKey) || ADVENT_EVENT_KEY;
  if (!fid) return { dedupe: "", payload: {} };
  const dedupe = `sw_bank_${ek}_${fid}`;
  const doc = await SiteDocument.findOne({
    docType: BANK_DOC,
    ownerId: BANK_OWNER,
    dedupeKey: dedupe,
  })
    .lean()
    .catch(() => null);
  const payload = doc?.payload && typeof doc.payload === "object" ? { ...doc.payload } : {};
  return { dedupe, payload };
}

async function persistFactionBankPayload(dedupe?, payload?) {
  if (!dedupe) return;
  await SiteDocument.findOneAndUpdate(
    { docType: BANK_DOC, ownerId: BANK_OWNER, dedupeKey: dedupe },
    {
      $set: { payload, updatedAt: new Date() },
      $setOnInsert: { docType: BANK_DOC, ownerId: BANK_OWNER, dedupeKey: dedupe, guildId: "0" },
    },
    { upsert: true },
  ).catch(() => null);
}

async function creditFactionBankUnits(eventKey?, factionId?, unitsMap?) {
  const fid = normalizeId(factionId).toLowerCase();
  if (!fid || !unitsMap || typeof unitsMap !== "object") return;
  try {
    const { dedupe, payload } = await loadFactionBankPayload(eventKey, fid);
    const units = payload.units && typeof payload.units === "object" ? { ...payload.units } : {};
    let changed = false;
    for (const [unitId, qty] of Object.entries(unitsMap)) {
      const n = safeInt(qty);
      const id = normalizeId(unitId);
      if (!id || !n || isTroopTierKey(id)) continue;
      units[id] = safeInt(units[id]) + n;
      changed = true;
    }
    if (!changed) return;
    await persistFactionBankPayload(dedupe, writeFactionBankPayload(payload, { units }));
  } catch (_) {}
}

async function creditFactionBankItems(eventKey?, factionId?, itemsMap?) {
  const fid = normalizeId(factionId).toLowerCase();
  if (!fid || !itemsMap || typeof itemsMap !== "object") return;
  try {
    const { dedupe, payload } = await loadFactionBankPayload(eventKey, fid);
    const items = normalizeFactionBankItems(payload.items);
    let changed = false;
    for (const [itemId, qty] of Object.entries(itemsMap)) {
      const id = normalizeId(itemId);
      const n = safeInt(qty);
      if (!id || !n || (id !== "bacta" && id !== "sconto_mercato_nero")) continue;
      items[id] = safeInt(items[id]) + n;
      changed = true;
    }
    if (!changed) return;
    await persistFactionBankPayload(dedupe, writeFactionBankPayload(payload, { items }));
  } catch (_) {}
}

/** Sposta casse legacy casuale/casuale_2 → stellare/cosmica in DB. */
async function migrateLegacyCrateIds(guildId?, userId?) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return;
  const casualePath = `${ROOT}.crates.casuale`;
  const casuale2Path = `${ROOT}.crates.casuale_2`;
  const doc = await ActivityUserProfile.findOne({
    guildId: g,
    userId: u,
    $or: [{ [casualePath]: { $gt: 0 } }, { [casuale2Path]: { $gt: 0 } }],
  })
    .select(ROOT)
    .lean()
    .catch(() => null);
  if (!doc) return;
  const crates = readSlice(doc)?.crates || {};
  const a = safeInt(crates.casuale);
  const b = safeInt(crates.casuale_2);
  if (!a && !b) return;
  const $inc: Record<string, number> = {};
  const $unset: Record<string, number> = {};
  if (a) {
    $inc[`${ROOT}.crates.stellare`] = a;
    $unset[casualePath] = 1;
  }
  if (b) {
    $inc[`${ROOT}.crates.cosmica`] = b;
    $unset[casuale2Path] = 1;
  }
  await ActivityUserProfile.updateOne(
    { guildId: g, userId: u },
    { $inc, $unset, $set: { [`${ROOT}.updatedAt`]: new Date().toISOString() } },
  ).catch(() => null);
}

/**
 * Sposta truppe/oggetti arsenale ancora sul wallet personale → banca fazione (one-shot).
 */
async function migratePersonalArsenalToFaction(guildId?, userId?, eventKey = "") {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const key = normalizeId(eventKey) || ADVENT_EVENT_KEY;
  if (!isValidGuildUserId(g, u)) return;

  const doc = await ActivityUserProfile.findOne({ guildId: g, userId: u }).select(ROOT).lean().catch(() => null);
  const raw = readSlice(doc);
  const factionId = raw?.factionId ? String(raw.factionId) : null;
  if (!factionId) return;

  const army = normalizePublicArmy(raw?.army);
  const factionItems: Record<string, number> = {};
  for (const id of ["bacta", "sconto_mercato_nero"]) {
    const n = safeInt(raw?.items?.[id]);
    if (n) factionItems[id] = n;
  }
  const personalSconto = raw?.buffs?.sconto_mercato_nero;
  const hasArmy = Object.keys(army).length > 0;
  const hasItems = Object.keys(factionItems).length > 0;
  const hasScontoBuff =
    personalSconto &&
    typeof personalSconto === "object" &&
    Number.isFinite(Date.parse(String(personalSconto.expiresAt || ""))) &&
    Date.parse(String(personalSconto.expiresAt || "")) > Date.now();

  if (!hasArmy && !hasItems && !hasScontoBuff) return;

  if (hasArmy) await creditFactionBankUnits(key, factionId, army);
  if (hasItems) await creditFactionBankItems(key, factionId, factionItems);
  if (hasScontoBuff) {
    try {
      const { dedupe, payload } = await loadFactionBankPayload(key, factionId);
      const buffs = payload.buffs && typeof payload.buffs === "object" ? { ...payload.buffs } : {};
      const existingExp = Date.parse(String(buffs.sconto_mercato_nero?.expiresAt || ""));
      const personalExp = Date.parse(String(personalSconto.expiresAt || ""));
      if (!Number.isFinite(existingExp) || existingExp < personalExp) {
        buffs.sconto_mercato_nero = {
          active: true,
          activatedAt: personalSconto.activatedAt || new Date().toISOString(),
          expiresAt: personalSconto.expiresAt,
        };
        await persistFactionBankPayload(dedupe, writeFactionBankPayload(payload, { buffs }));
      }
    } catch (_) {}
  }

  const $unset: Record<string, number> = {
    [`${ROOT}.army`]: 1,
    [`${ROOT}.items.bacta`]: 1,
    [`${ROOT}.items.sconto_mercato_nero`]: 1,
    [`${ROOT}.buffs.sconto_mercato_nero`]: 1,
  };
  await ActivityUserProfile.updateOne(
    { guildId: g, userId: u },
    { $unset, $set: { [`${ROOT}.updatedAt`]: new Date().toISOString(), [`${ROOT}.eventKey`]: key } },
  ).catch(() => null);
}

/**
 * Converte pendingTroops.tierN → unità vere nella banca fazione (niente army personale).
 * Ritorna wallet aggiornato.
 */
async function flushPendingTierTroops(guildId?, userId?, eventKey = "") {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const key = normalizeId(eventKey) || ADVENT_EVENT_KEY;
  if (!isValidGuildUserId(g, u)) return blankWallet(key);

  await migratePersonalArsenalToFaction(g, u, key);

  const doc = await ActivityUserProfile.findOne({ guildId: g, userId: u }).select(ROOT).lean().catch(() => null);
  const raw = readSlice(doc);
  if (!raw) return blankWallet(key);
  const pending = raw.pendingTroops && typeof raw.pendingTroops === "object" ? raw.pendingTroops : {};
  const tierMap: Record<string, number> = {};
  for (const [k, v] of Object.entries(pending)) {
    if (!isTroopTierKey(k)) continue;
    const n = safeInt(v);
    if (n) tierMap[k] = n;
  }
  if (!Object.keys(tierMap).length) return publicWallet(raw, key);

  const factionId = raw.factionId ? String(raw.factionId) : null;
  const features = resolveFeatureStateNow(new Date());
  const epoch = raw.epoch || features.epoch || EPOCHS.CLONE_WARS;
  /* Senza fazione: non materializzare (resta pending finché non fa smistamento). */
  if (!factionId) return publicWallet(raw, key);

  const { units } = materializeTroopGrants(tierMap, { epoch, factionId });
  if (!Object.keys(units).length) return publicWallet(raw, key);

  const nowIso = new Date().toISOString();
  const $unset: Record<string, number> = {};
  for (const k of Object.keys(tierMap)) $unset[`${ROOT}.pendingTroops.${k}`] = 1;

  const updated = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    { $unset, $set: { [`${ROOT}.updatedAt`]: nowIso, [`${ROOT}.eventKey`]: key } },
    { new: true },
  ).catch(() => null);

  await creditFactionBankUnits(key, factionId, units);
  return publicWallet(readSlice(updated) || raw, key);
}

async function getStarWarsWallet(guildId?, userId?, eventKey = "") {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const key = normalizeId(eventKey) || ADVENT_EVENT_KEY;
  if (!isValidGuildUserId(g, u)) return blankWallet(key);
  await migrateLegacyCrateIds(g, u);
  /* Auto-flush: tier pending → arsenale fazione + migrazione legacy personale. */
  return flushPendingTierTroops(g, u, key);
}

/**
 * Claim avvento atomico.
 * @returns {{ ok, status?, error?, message?, wallet?, granted?, day? }}
 */
async function claimAdventDay(client, { guildId, userId, day, staffPreview = false }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const dayNum = Math.floor(Number(day));
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;

  if (!isValidGuildUserId(g, u)) {
    return { ok: false, status: 400, error: "bad_ids", message: "Utente non valido." };
  }
  const slot = getAdventDay(dayNum);
  if (!slot) {
    return { ok: false, status: 400, error: "bad_day", message: "Giorno avvento non valido." };
  }

  const todaySlot = adventSlotForRomeDate(new Date());
  /* Stagione chiusa: pubblico no; High Staff (staffPreview) sì, senza limiti di giorno. */
  if (todaySlot == null && !staffPreview) {
    return {
      ok: false,
      status: 410,
      error: "advent_closed",
      message: "Il calendario dell'avvento è terminato.",
    };
  }
  if (!staffPreview) {
    if (dayNum > todaySlot) {
      return {
        ok: false,
        status: 403,
        error: "too_early",
        message: "Questo giorno non è ancora sbloccato.",
      };
    }
    /* Solo il giorno corrente: se salti la mezzanotte, la ricompensa di quel giorno è persa. */
    if (dayNum < todaySlot) {
      return {
        ok: false,
        status: 403,
        error: "missed_day",
        message: "Hai saltato questo giorno: la ricompensa non è più ritirabile.",
      };
    }
  }

  const rewardKey = `advent_${eventKey}_${dayNum}`;
  const claimedPath = `${ROOT}.advent.claimed.${dayNum}`;
  const nowIso = new Date().toISOString();

  const inc: Record<string, any> = {};
  const granted = [];
  for (const part of slot.rewards) {
    if (part.type === "crate") {
      const id = normalizeCrateKey(part.crateId);
      const qty = Math.max(1, safeInt(part.qty, 1));
      if (!CRATE_LABELS[id]) continue;
      const path = `${ROOT}.crates.${id}`;
      inc[path] = (inc[path] || 0) + qty;
      granted.push({ type: "crate", crateId: id, qty, label: CRATE_LABELS[id] });
    } else if (part.type === "credits" || part.type === "premium_credits") {
      /* Tutti i crediti avvento = crediti evento (mai premium sito). */
      const amount = safeInt(part.amount);
      if (amount > 0) {
        inc[`${ROOT}.credits`] = (inc[`${ROOT}.credits`] || 0) + amount;
        granted.push({ type: "credits", amount });
      }
    }
  }

  const setFields = {
    [`${ROOT}.eventKey`]: eventKey,
    [claimedPath]: nowIso,
    [`${ROOT}.updatedAt`]: nowIso,
  };

  const update: Record<string, any> = {
    $set: setFields,
    $addToSet: { [`${ROOT}.rewardKeys`]: rewardKey },
    $setOnInsert: { guildId: g, userId: u },
  };
  if (Object.keys(inc).length) update.$inc = inc;

  /* Mixed starwars: non castare `rewardKeys: { $ne }` in query (CastError path rewardKeys).
     Idempotenza = claimed.<day> assente. Update via collection: no cast Mongoose su $addToSet Mixed. */
  let updated = null;
  try {
    const raw = await ActivityUserProfile.collection.findOneAndUpdate(
      {
        guildId: g,
        userId: u,
        [claimedPath]: { $exists: false },
      },
      update,
      { upsert: true, returnDocument: "after" },
    );
    updated = raw && typeof raw === "object" && "value" in raw ? raw.value : raw;
  } catch (err) {
    if (err && (err.code === 11000 || String(err.message || "").includes("E11000"))) {
      updated = null;
    } else {
      throw err;
    }
  }

  if (!updated) {
    const current = await getStarWarsWallet(g, u, eventKey);
    if (current.advent.claimed[String(dayNum)]) {
      return {
        ok: false,
        status: 409,
        error: "already_claimed",
        message: "Hai già ritirato questo giorno.",
        wallet: current,
        day: dayNum,
      };
    }
    return { ok: false, status: 500, error: "persist_failed", message: "Salvataggio non riuscito." };
  }

  return {
    ok: true,
    status: 200,
    day: dayNum,
    label: slot.label,
    granted,
    wallet: publicWallet(readSlice(updated), eventKey),
  };
}

function adventPublicCatalog() {
  return listAdventDays().map((d?) => ({
    day: d.day,
    label: d.label,
    rewards: d.rewards.map((r?) => ({ ...r })),
  }));
}

/**
 * Assegna fazione una sola volta (smistamento).
 * @returns {{ ok, status?, error?, message?, wallet?, factionId? }}
 */
async function setStarWarsFaction(client, { guildId, userId, factionId, epoch = "clone_wars", scores = null }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const fid = normalizeId(factionId);
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  if (!isValidGuildUserId(g, u) || !fid) {
    return { ok: false, status: 400, error: "bad_ids", message: "Dati non validi." };
  }

  const nowIso = new Date().toISOString();
  const factionPath = `${ROOT}.factionId`;
  const $set = {
    [`${ROOT}.eventKey`]: eventKey,
    [factionPath]: fid,
    [`${ROOT}.epoch`]: String(epoch || "clone_wars"),
    [`${ROOT}.factionRankTier`]: 1,
    [`${ROOT}.sortedAt`]: nowIso,
    [`${ROOT}.updatedAt`]: nowIso,
  };
  if (scores && typeof scores === "object") $set[`${ROOT}.sortScores`] = scores;

  const updated = await ActivityUserProfile.findOneAndUpdate(
    {
      guildId: g,
      userId: u,
      $or: [{ [factionPath]: { $exists: false } }, { [factionPath]: null }, { [factionPath]: "" }],
    },
    {
      $set,
      $setOnInsert: { guildId: g, userId: u },
    },
    { upsert: true, new: true },
  ).catch(() => null);

  if (!updated) {
    const current = await getStarWarsWallet(g, u, eventKey);
    if (current.factionId) {
      try {
        const { applyStarWarsFactionRoleOnTest } = require("./starWarsFactionTestRoles") as typeof import("./starWarsFactionTestRoles");
        await applyStarWarsFactionRoleOnTest(client, { userId: u, factionId: current.factionId });
      } catch (_) {}
      return {
        ok: false,
        status: 409,
        error: "already_sorted",
        message: "Sei già stato smistato.",
        wallet: current,
        factionId: current.factionId,
      };
    }
    return { ok: false, status: 500, error: "persist_failed", message: "Salvataggio non riuscito." };
  }

  try {
    const { applyStarWarsFactionRoleOnTest } = require("./starWarsFactionTestRoles") as typeof import("./starWarsFactionTestRoles");
    await applyStarWarsFactionRoleOnTest(client, { userId: u, factionId: fid });
  } catch (_) {}

  /* Primo smistato della fazione → rango massimo (bootstrap senza comandi HS). */
  try {
    const { maybeBootstrapMarshal } = require("./starWarsFactionRankService") as typeof import("./starWarsFactionRankService");
    await maybeBootstrapMarshal(g, u, fid, eventKey);
  } catch (_) {}

  /* Truppe tier pending dalle casse → unità della nuova fazione. */
  const wallet = await flushPendingTierTroops(g, u, eventKey);

  return {
    ok: true,
    status: 200,
    factionId: fid,
    wallet,
  };
}

/**
 * Apri 1 cassa dall'inventario → crediti/exp evento (o truppe pending).
 */
async function openStarWarsCrate(client, { guildId, userId, crateId }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const cid = normalizeCrateKey(crateId);
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  if (!isValidGuildUserId(g, u) || !CRATE_LABELS[cid]) {
    return { ok: false, status: 400, error: "bad_crate", message: "Cassa non valida." };
  }

  await migrateLegacyCrateIds(g, u);

  const loot = openCrateLoot(cid);
  if (!loot.ok) {
    return { ok: false, status: 400, error: loot.error || "loot_failed", message: "Loot non disponibile." };
  }

  /* Flush eventuali tier pending prima dell'apertura. */
  await flushPendingTierTroops(g, u, eventKey);
  const before = await ActivityUserProfile.findOne({ guildId: g, userId: u }).select(ROOT).lean().catch(() => null);
  const beforeSlice = readSlice(before);
  const factionId = beforeSlice?.factionId ? String(beforeSlice.factionId) : null;
  const features = resolveFeatureStateNow(new Date());
  const epoch = beforeSlice?.epoch || features.epoch || EPOCHS.CLONE_WARS;

  let troopUnits: Record<string, number> = {};
  let troopLabels: Record<string, string> = {};
  if (loot.troops && typeof loot.troops === "object") {
    if (factionId) {
      const mat = materializeTroopGrants(loot.troops, { epoch, factionId });
      troopUnits = mat.units;
      troopLabels = mat.labels;
    } else {
      /* Senza fazione: resta pending per tier (si materializza allo smistamento). */
      for (const [k, v] of Object.entries(loot.troops)) {
        const n = safeInt(v);
        if (n && isTroopTierKey(k)) troopUnits[k] = n;
      }
    }
  }

  const cratePath = `${ROOT}.crates.${cid}`;
  const nowIso = new Date().toISOString();
  const $inc: Record<string, number> = { [cratePath]: -1 };
  if (loot.credits) $inc[`${ROOT}.credits`] = loot.credits;
  if (loot.exp) $inc[`${ROOT}.exp`] = loot.exp;

  const $set = {
    [`${ROOT}.eventKey`]: eventKey,
    [`${ROOT}.updatedAt`]: nowIso,
  };
  /* Truppe: solo pending senza fazione; con fazione → banca (niente army personale). */
  if (!factionId) {
    for (const [tier, qty] of Object.entries(troopUnits)) {
      if (qty) $inc[`${ROOT}.pendingTroops.${tier}`] = qty;
    }
  }
  const factionItemGains: Record<string, number> = {};
  if (loot.items && typeof loot.items === "object") {
    let isFactionItem = (_id?) => false;
    try {
      const { isFactionUtilityItemId } = require("../../Utils/Eventi/starWarsUtilityItemsCatalog") as typeof import("../../Utils/Eventi/starWarsUtilityItemsCatalog");
      isFactionItem = isFactionUtilityItemId;
    } catch (_) {}
    for (const [itemId, qty] of Object.entries(loot.items)) {
      const n = safeInt(qty);
      if (!n) continue;
      if (isFactionItem(itemId)) {
        if (factionId) factionItemGains[itemId] = safeInt(factionItemGains[itemId]) + n;
        else $inc[`${ROOT}.items.${itemId}`] = n; /* pending personale → migrazione allo smistamento */
      } else {
        $inc[`${ROOT}.items.${itemId}`] = n;
      }
    }
  }

  const updated = await ActivityUserProfile.findOneAndUpdate(
    {
      guildId: g,
      userId: u,
      [cratePath]: { $gte: 1 },
    },
    { $inc, $set, $setOnInsert: { guildId: g, userId: u } },
    { upsert: false, new: true },
  ).catch(() => null);

  if (!updated) {
    const current = await getStarWarsWallet(g, u, eventKey);
    return {
      ok: false,
      status: 409,
      error: "no_crate",
      message: "Non hai questa cassa.",
      wallet: current,
    };
  }

  if (factionId && Object.keys(troopUnits).length) {
    await creditFactionBankUnits(eventKey, factionId, troopUnits);
  }
  if (factionId && Object.keys(factionItemGains).length) {
    await creditFactionBankItems(eventKey, factionId, factionItemGains);
  }

  let wallet = publicWallet(readSlice(updated), eventKey);
  try {
    const { attachFactionArsenalToWallet } = require("./starWarsEconomyService") as typeof import("./starWarsEconomyService");
    wallet = await attachFactionArsenalToWallet(wallet, eventKey);
  } catch (_) {}
  let levelUp = null;
  if (loot.exp) {
    try {
      const { applyStarWarsLevelProgress } = require("./starWarsLevelService") as typeof import("./starWarsLevelService");
      const prog = await applyStarWarsLevelProgress(client, { guildId: g, userId: u });
      if (prog?.ok) {
        if (prog.wallet) {
          wallet = prog.wallet;
          try {
            const { attachFactionArsenalToWallet } = require("./starWarsEconomyService") as typeof import("./starWarsEconomyService");
            wallet = await attachFactionArsenalToWallet(wallet, eventKey);
          } catch (_) {}
        }
        if (Array.isArray(prog.leveled) && prog.leveled.length) {
          levelUp = { from: prog.prevLevel, to: prog.level, title: prog.title, milestones: prog.leveled };
        }
      }
    } catch (_) {}
  }

  let troopNote = loot.note || null;
  if (factionId && Object.keys(troopLabels).length) {
    try {
      const { formatTroopMap } = require("../../Utils/Eventi/starWarsTroopEmojis") as typeof import("../../Utils/Eventi/starWarsTroopEmojis");
      troopNote = formatTroopMap(troopUnits, { factionId, bold: true }) || Object.entries(troopUnits)
        .map(([id, qty]) => `${qty}× ${troopLabels[id] || id}`)
        .join(" · ");
    } catch (_) {
      troopNote = Object.entries(troopUnits)
        .map(([id, qty]) => `${qty}× ${troopLabels[id] || id}`)
        .join(" · ");
    }
  }

  return {
    ok: true,
    status: 200,
    crateId: cid,
    loot: {
      resolvedCrate: loot.resolvedCrate,
      credits: loot.credits || 0,
      exp: loot.exp || 0,
      troops: factionId ? troopUnits : loot.troops || null,
      troopLabels: factionId ? troopLabels : null,
      items: loot.items || null,
      note: troopNote || loot.note || null,
    },
    levelUp,
    wallet,
  };
}

export = {
  ROOT,
  CRATE_IDS,
  CRATE_LABELS,
  blankWallet,
  publicWallet,
  getStarWarsWallet,
  flushPendingTierTroops,
  creditFactionBankUnits,
  creditFactionBankItems,
  claimAdventDay,
  setStarWarsFaction,
  openStarWarsCrate,
  adventPublicCatalog,
  getAdventDay,
};
