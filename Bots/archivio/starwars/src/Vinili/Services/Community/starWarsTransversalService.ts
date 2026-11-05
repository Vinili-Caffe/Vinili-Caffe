/**
 * Trasversali: remap epoche, PEI board, traditore, premi fine fase, oggetti.
 */
"use strict";


const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { SiteDocument, SITE_DOCUMENT_TYPE, ActivityUserProfile } = require(__eventCoreVinili("Community/schemas/communitySchemas"));
const { isValidGuildUserId } = require(__eventCoreVinili("../shared/db/validateWriteIds"));
const { resolveStarWarsEventConfig } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
const { EPOCHS, resolveFeatureStateNow } = require("../../Utils/Eventi/starWarsEventCalendar") as typeof import("../../Utils/Eventi/starWarsEventCalendar");
const { EPOCH_FACTIONS } = require("../../Utils/Eventi/starWarsEconomyCatalog") as typeof import("../../Utils/Eventi/starWarsEconomyCatalog");
const { ADVENT_EVENT_KEY } = require("../../Utils/Eventi/starWarsAdventCatalog") as typeof import("../../Utils/Eventi/starWarsAdventCatalog");
const { ROOT, getStarWarsWallet, publicWallet } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");
const { grantStarWarsReward } = require("./starWarsRewardsService") as typeof import("./starWarsRewardsService");

const DOC_TYPE = SITE_DOCUMENT_TYPE.STARWARS_EVENT_STATE;
const OWNER = "__starwars_transversal__";

/** Remap fazione quando cambia epoca (linee PDF). */
const FACTION_REMAP = Object.freeze({
  [EPOCHS.CLONE_WARS]: {
    /* identity */
  },
  [EPOCHS.CIVIL_WAR]: {
    repubblica: "ribellione",
    separatisti: "impero",
  },
  [EPOCHS.SEQUEL]: {
    ribellione: "nuova_repubblica",
    impero: "nuovo_ordine",
    repubblica: "nuova_repubblica",
    separatisti: "nuovo_ordine",
  },
});

function normalizeId(v?) {
  return String(v || "").trim();
}
function safeInt(v?, fb = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fb;
}

function remapFactionId(factionId?, targetEpoch?) {
  const f = normalizeId(factionId);
  if (!f) return null;
  const map = FACTION_REMAP[targetEpoch] || {};
  if (map[f]) return map[f];
  const allowed = EPOCH_FACTIONS[targetEpoch] || [];
  if (allowed.includes(f)) return f;
  return allowed[0] || f;
}

/**
 * Allinea wallet.epoch + factionId all'epoca corrente del calendario.
 * A ogni nuova fase (epoca) i crediti evento tornano a 0.
 * Idempotente; chiamato da status API / shop.
 */
async function ensureEpochAlignment(client, { guildId, userId }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return { ok: false, error: "bad_ids" };
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const features = resolveFeatureStateNow(new Date());
  const targetEpoch = features.epoch || EPOCHS.CLONE_WARS;
  const wallet = await getStarWarsWallet(g, u, eventKey);

  const prevEpoch = normalizeId(wallet.epoch) || null;
  /* Crediti evento a 0 a ogni cambio fase (epoca precedente → nuova). */
  const epochChanged = Boolean(prevEpoch) && prevEpoch !== targetEpoch;
  const nextFaction = wallet.factionId ? remapFactionId(wallet.factionId, targetEpoch) : null;
  const factionChanged = Boolean(wallet.factionId) && nextFaction !== wallet.factionId;
  const needEpochWrite = prevEpoch !== targetEpoch;

  if (!needEpochWrite && !factionChanged) {
    return { ok: true, wallet, remapped: false, creditsReset: false };
  }

  const $set: Record<string, any> = {
    [`${ROOT}.epoch`]: targetEpoch,
    [`${ROOT}.updatedAt`]: new Date().toISOString(),
    [`${ROOT}.eventKey`]: eventKey,
  };
  if (nextFaction) $set[`${ROOT}.factionId`] = nextFaction;
  if (epochChanged) $set[`${ROOT}.credits`] = 0;

  const updated = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    {
      $set,
      $setOnInsert: { guildId: g, userId: u },
    },
    { upsert: true, new: true },
  ).catch(() => null);
  return {
    ok: true,
    wallet: publicWallet(updated?.profile?.events?.starwars, eventKey),
    remapped: factionChanged,
    creditsReset: epochChanged,
    from: wallet.factionId,
    to: nextFaction,
    epoch: targetEpoch,
  };
}

async function getPeiLeaderboard(client?, { limit = 25 } = {}) {
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const lim = Math.min(100, Math.max(1, safeInt(limit, 25)));
  const rows = await ActivityUserProfile.find({
    [`${ROOT}.eventKey`]: eventKey,
    [`${ROOT}.pei`]: { $gt: 0 },
  })
    .select(`userId ${ROOT}.pei ${ROOT}.factionId ${ROOT}.exp ${ROOT}.credits`)
    .sort({ [`${ROOT}.pei`]: -1 })
    .limit(lim)
    .lean()
    .catch(() => []);
  return {
    ok: true,
    eventKey,
    items: (rows || []).map((r?, i?) => {
      const sw = r.profile?.events?.starwars || {};
      return {
        rank: i + 1,
        userId: r.userId,
        pei: Number(sw.pei) || 0,
        factionId: sw.factionId || null,
        exp: safeInt(sw.exp),
        credits: safeInt(sw.credits),
      };
    }),
  };
}

/** Traditore: un membro random della fazione avversaria "spia" — round giornaliero. */
async function getOrSpawnTraditore(client, { guildId }) {
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const dedupe = `traditore_${eventKey}_${day}`;
  const existing = await SiteDocument.findOne({ docType: DOC_TYPE, ownerId: OWNER, dedupeKey: dedupe })
    .lean()
    .catch(() => null);
  if (existing?.payload?.status === "active" || existing?.payload?.status === "caught") {
    return { ok: true, ...existing.payload, day };
  }

  const features = resolveFeatureStateNow(new Date());
  const epoch = features.epoch || EPOCHS.CLONE_WARS;
  const factions = EPOCH_FACTIONS[epoch] || [];
  if (factions.length < 2) return { ok: false, error: "no_factions" };

  /* pick spy from largest faction pool */
  const candidates = await ActivityUserProfile.find({
    [`${ROOT}.eventKey`]: eventKey,
    [`${ROOT}.factionId`]: { $in: factions },
  })
    .select(`userId ${ROOT}.factionId`)
    .limit(200)
    .lean()
    .catch(() => []);
  if (!candidates.length) {
    return { ok: true, status: "waiting", day, message: "Serve almeno un giocatore smistato." };
  }
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const trueFaction = pick.profile?.events?.starwars?.factionId;
  const coverFaction = factions.find((f?) => f !== trueFaction) || factions[0];
  const payload = {
    status: "active",
    spyUserId: pick.userId,
    trueFaction,
    coverFaction,
    createdAt: new Date().toISOString(),
    guesses: {},
  };
  await SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: dedupe },
    {
      $set: { payload, updatedAt: new Date() },
      $setOnInsert: { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: dedupe, guildId: normalizeId(guildId) || "0" },
    },
    { upsert: true },
  ).catch(() => null);
  return { ok: true, ...payload, day, spyHidden: true, spyUserId: undefined };
}

async function accuseTraditore(client, { guildId, userId, accusedUserId }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const accused = normalizeId(accusedUserId);
  if (!isValidGuildUserId(g, u) || !accused) return { ok: false, status: 400, error: "bad_ids" };
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const dedupe = `traditore_${eventKey}_${day}`;
  const doc = await SiteDocument.findOne({ docType: DOC_TYPE, ownerId: OWNER, dedupeKey: dedupe })
    .lean()
    .catch(() => null);
  if (!doc?.payload || doc.payload.status !== "active") {
    return { ok: false, status: 404, error: "no_round", message: "Nessun traditore attivo oggi." };
  }
  if (doc.payload.guesses?.[u]) {
    return { ok: false, status: 409, error: "already_guessed" };
  }
  const correct = accused === normalizeId(doc.payload.spyUserId);
  const guesses = { ...(doc.payload.guesses || {}), [u]: { accused, correct, at: new Date().toISOString() } };
  const payload = { ...doc.payload, guesses };
  if (correct) {
    payload.status = "caught";
    payload.caughtBy = u;
    payload.caughtAt = new Date().toISOString();
  }
  await SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: dedupe },
    { $set: { payload, updatedAt: new Date() } },
  ).catch(() => null);

  if (correct) {
    await grantStarWarsReward(client, {
      guildId: g,
      userId: u,
      reason: "traditore",
      grant: { crateId: "omega", crateQty: 1, exp: 300, credits: 100000 },
    });
    return { ok: true, status: 200, correct: true, message: "Hai smascherato il traditore!" };
  }
  await grantStarWarsReward(client, {
    guildId: g,
    userId: u,
    reason: "traditore_miss",
    grant: { exp: 20 },
  });
  return { ok: true, status: 200, correct: false, message: "Non è lui." };
}

/** Premi fine fase economia: top PEI + banca fazione vincente (stub applicabile da HS). */
async function grantPhaseEndRewards(client, { guildId, phase, winningFactionId }) {
  const g = normalizeId(guildId);
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const phaseN = safeInt(phase, 1);
  const dedupe = `phase_end_${eventKey}_${phaseN}`;
  const existing = await SiteDocument.findOne({ docType: DOC_TYPE, ownerId: OWNER, dedupeKey: dedupe })
    .lean()
    .catch(() => null);
  if (existing?.payload?.done) {
    return { ok: false, status: 409, error: "already_granted" };
  }

  const top = await getPeiLeaderboard(client, { limit: 10 });
  const granted = [];
  for (const row of top.items.slice(0, 5)) {
    const out = await grantStarWarsReward(client, {
      guildId: g,
      userId: row.userId,
      reason: `phase_end_${phaseN}`,
      grant: { crateId: "omega", crateQty: 1, exp: 500, credits: 200000 },
    });
    granted.push({ userId: row.userId, ok: out.ok });
  }
  if (winningFactionId) {
    const members = await ActivityUserProfile.find({
      [`${ROOT}.eventKey`]: eventKey,
      [`${ROOT}.factionId`]: normalizeId(winningFactionId),
    })
      .select("userId")
      .limit(500)
      .lean()
      .catch(() => []);
    for (const m of members || []) {
      await grantStarWarsReward(client, {
        guildId: g,
        userId: m.userId,
        reason: `phase_win_${phaseN}`,
        grant: { credits: 50000, exp: 100 },
      });
    }
  }
  await SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: dedupe },
    {
      $set: {
        payload: { done: true, phase: phaseN, winningFactionId: winningFactionId || null, at: new Date().toISOString(), top: granted },
        updatedAt: new Date(),
      },
      $setOnInsert: { docType: DOC_TYPE, ownerId: OWNER, dedupeKey: dedupe, guildId: g || "0" },
    },
    { upsert: true },
  ).catch(() => null);
  return { ok: true, status: 200, phase: phaseN, granted };
}

/** Rango PEI globale + in fazione (1 = primo). */
async function getUserPeiRanks(client?, { userId, factionId = null, pei = 0 } = {}) {
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const u = normalizeId(userId);
  const peiNum = Number(pei) || 0;
  if (!u) return { peiRank: null, factionRank: null };

  const peiHigher = await ActivityUserProfile.countDocuments({
    [`${ROOT}.eventKey`]: eventKey,
    [`${ROOT}.pei`]: { $gt: peiNum },
  }).catch(() => 0);

  let factionRank = null;
  const fid = normalizeId(factionId).toLowerCase();
  if (fid) {
    const factionHigher = await ActivityUserProfile.countDocuments({
      [`${ROOT}.eventKey`]: eventKey,
      [`${ROOT}.factionId`]: fid,
      [`${ROOT}.pei`]: { $gt: peiNum },
    }).catch(() => 0);
    factionRank = Math.max(1, Number(factionHigher) || 0) + 1;
  }

  return {
    peiRank: Math.max(1, Number(peiHigher) || 0) + 1,
    factionRank,
  };
}

export = {
  FACTION_REMAP,
  remapFactionId,
  ensureEpochAlignment,
  getPeiLeaderboard,
  getUserPeiRanks,
  getOrSpawnTraditore,
  accuseTraditore,
  grantPhaseEndRewards,
};
