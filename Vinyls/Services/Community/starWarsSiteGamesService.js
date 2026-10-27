/**
 * Giochi sito: Accademia (mira), Podracing Championship, Miniera Kyber.
 * HS può giocare con publicEnabled=false.
 */
"use strict";

const { SiteDocument, SITE_DOCUMENT_TYPE, ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { resolveStarWarsEventConfig } = require("../../Utils/Web/starWarsEventConfig");
const { FEATURES, resolveFeatureStateNow } = require("../../Utils/Web/starWarsEventCalendar");
const { ADVENT_EVENT_KEY } = require("../../Utils/Web/starWarsAdventCatalog");
const { getStarWarsWallet, ROOT, publicWallet } = require("./starWarsEventWalletService");
const { grantStarWarsReward } = require("./starWarsRewardsService");
const { getRuntimeFlags } = require("../../Utils/Web/starWarsRuntimeGate");

const DOC_TYPE = SITE_DOCUMENT_TYPE.STARWARS_EVENT_STATE;
const OWNER = "__starwars_site_games__";
const PODS = Object.freeze([
  { id: "sebulba", label: "Sebulba", speed: 92, luck: 40 },
  { id: "anakin", label: "Anakin", speed: 88, luck: 70 },
  { id: "gasgano", label: "Gasgano", speed: 85, luck: 55 },
  { id: "teemto", label: "Teemto", speed: 80, luck: 60 },
  { id: "ben", label: "Ben Quadinaros", speed: 70, luck: 75 },
]);

function normalizeId(v) {
  return String(v || "").trim();
}
function safeInt(v, fb = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fb;
}
function hourBucket(d = new Date()) {
  return d.toISOString().slice(0, 13);
}
function dayBucketRome(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
function accademiaSlot(d = new Date()) {
  /* ogni 4h */
  const h = Math.floor(d.getUTCHours() / 4) * 4;
  return `${d.toISOString().slice(0, 10)}T${String(h).padStart(2, "0")}`;
}
function garaSlot(d = new Date()) {
  /* ogni 3h */
  const h = Math.floor(d.getUTCHours() / 3) * 3;
  return `${d.toISOString().slice(0, 10)}T${String(h).padStart(2, "0")}`;
}

function featurePlayable(client, featureKey) {
  const flags = getRuntimeFlags(client);
  if (!flags.enabled) return false;
  if (!flags.publicEnabled) return true; /* HS anteprima: playable */
  const state = resolveFeatureStateNow(new Date());
  return Boolean(state.features?.includes(featureKey));
}

async function getDoc(dedupeKey) {
  return SiteDocument.findOne({ docType: DOC_TYPE, ownerId: OWNER, dedupeKey })
    .lean()
    .catch(() => null);
}

async function setDoc(dedupeKey, payload, guildId = "0") {
  await SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, ownerId: OWNER, dedupeKey },
    {
      $set: { payload, updatedAt: new Date() },
      $setOnInsert: { docType: DOC_TYPE, ownerId: OWNER, dedupeKey, guildId },
    },
    { upsert: true },
  ).catch(() => null);
}

/* ——— Accademia ——— */
function buildTargets(seed) {
  const count = 8 + (seed % 5);
  const targets = [];
  for (let i = 0; i < count; i += 1) {
    const x = ((seed * 37 + i * 53) % 90) + 5;
    const y = ((seed * 19 + i * 41) % 70) + 10;
    const r = 4 + ((seed + i) % 6);
    targets.push({ id: `t${i}`, x, y, r, points: 10 + (i % 3) * 5 });
  }
  return targets;
}

async function getAccademiaState(client, { guildId, userId }) {
  const playable = featurePlayable(client, FEATURES.EVENT_ACCADEMIA);
  const slot = accademiaSlot();
  const seed = Number(slot.replace(/\D/g, "").slice(-8)) || 1;
  const targets = buildTargets(seed);
  let played = false;
  let lastScore = null;
  let playToken = null;
  if (userId) {
    const dedupe = `accademia_${slot}_${userId}`;
    const doc = await getDoc(dedupe);
    played = Boolean(doc?.payload?.done);
    lastScore = doc?.payload?.score ?? null;
    if (!played && playable) {
      playToken = cryptoRandomToken();
      await setDoc(
        dedupe,
        {
          done: false,
          playToken,
          issuedAt: Date.now(),
          at: new Date().toISOString(),
        },
        normalizeId(guildId),
      );
    }
  }
  return {
    ok: true,
    playable,
    slot,
    targets: played ? [] : targets,
    played,
    lastScore,
    playToken,
    durationSec: 30,
    rewardHint: "cassa militare + exp in base al punteggio",
  };
}

function cryptoRandomToken() {
  try {
    return require("node:crypto").randomBytes(16).toString("hex");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

async function submitAccademia(client, { guildId, userId, hits = [], playToken = null, startedAt = null }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return { ok: false, status: 400, error: "bad_ids" };
  if (!featurePlayable(client, FEATURES.EVENT_ACCADEMIA)) {
    return { ok: false, status: 403, error: "feature_off", message: "Accademia non attiva." };
  }
  const slot = accademiaSlot();
  const dedupe = `accademia_${slot}_${u}`;
  const existing = await getDoc(dedupe);
  if (existing?.payload?.done) {
    return { ok: false, status: 409, error: "already_played", message: "Hai già fatto questa prova." };
  }
  const sessionToken = String(existing?.payload?.playToken || "").trim();
  const clientToken = String(playToken || "").trim();
  if (!sessionToken || !clientToken || sessionToken !== clientToken) {
    return { ok: false, status: 403, error: "bad_session", message: "Sessione prova non valida. Ricarica." };
  }
  const issuedAt = Number(existing?.payload?.issuedAt) || 0;
  const clientStart = Number(startedAt) || 0;
  const startMs = issuedAt > 0 ? issuedAt : clientStart;
  const elapsedMs = Math.max(0, Date.now() - startMs);
  // Anti-cheat: niente max score istantaneo; cap hit credibili ~1 ogni 400ms
  if (elapsedMs < 2500) {
    return { ok: false, status: 429, error: "too_fast", message: "Troppo veloce — riprova giocando la prova." };
  }
  const seed = Number(slot.replace(/\D/g, "").slice(-8)) || 1;
  const targets = buildTargets(seed);
  const byId = new Map(targets.map((t) => [t.id, t]));
  let score = 0;
  const seen = new Set();
  const maxCredibleHits = Math.min(targets.length, Math.max(1, Math.floor(elapsedMs / 400)));
  for (const h of Array.isArray(hits) ? hits : []) {
    if (seen.size >= maxCredibleHits) break;
    const id = normalizeId(h?.id || h);
    if (!id || seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    score += byId.get(id).points;
  }
  await setDoc(dedupe, { done: true, score, hits: seen.size, elapsedMs, at: new Date().toISOString() }, g);
  const crateId = score >= 80 ? "militare_op" : score >= 40 ? "militare_plus" : "militare";
  const exp = Math.min(500, 50 + score * 2);
  const grant = await grantStarWarsReward(client, {
    guildId: g,
    userId: u,
    reason: "accademia",
    grant: { crateId, crateQty: 1, exp },
  });
  return { ok: true, status: 200, score, hits: seen.size, grant: grant.granted, wallet: grant.wallet };
}

/* ——— Gara (Podracing Championship) ——— */
async function getGaraState(client, { guildId, userId }) {
  const playable = featurePlayable(client, FEATURES.EVENT_PODRACING_CHAMP);
  const slot = garaSlot();
  let pick = null;
  let result = null;
  if (userId) {
    const doc = await getDoc(`gara_${slot}_${userId}`);
    pick = doc?.payload?.podId || null;
    result = doc?.payload?.result || null;
  }
  return {
    ok: true,
    playable,
    slot,
    pods: PODS.map((p) => ({ id: p.id, label: p.label })),
    pick,
    result,
    canPick: playable && !pick,
  };
}

async function pickGaraPod(client, { guildId, userId, podId }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const pid = normalizeId(podId);
  if (!isValidGuildUserId(g, u)) return { ok: false, status: 400, error: "bad_ids" };
  if (!featurePlayable(client, FEATURES.EVENT_PODRACING_CHAMP)) {
    return { ok: false, status: 403, error: "feature_off", message: "Gara non attiva." };
  }
  const pod = PODS.find((p) => p.id === pid);
  if (!pod) return { ok: false, status: 404, error: "unknown_pod" };
  const slot = garaSlot();
  const dedupe = `gara_${slot}_${u}`;
  const existing = await getDoc(dedupe);
  if (existing?.payload?.podId) {
    return { ok: false, status: 409, error: "already_picked", pick: existing.payload.podId, result: existing.payload.result };
  }

  /* Esito deterministic per slot+user */
  const seed = Number(`${slot.replace(/\D/g, "")}${u.slice(-4)}`.slice(-10)) || 1;
  const scores = PODS.map((p, i) => ({
    id: p.id,
    score: p.speed + ((seed + i * 17) % (p.luck + 1)),
  }));
  scores.sort((a, b) => b.score - a.score);
  const place = scores.findIndex((s) => s.id === pid) + 1;
  const won = place === 1;
  const result = { place, won, finishOrder: scores.map((s) => s.id) };
  await setDoc(dedupe, { podId: pid, result, at: new Date().toISOString() }, g);

  const grant = await grantStarWarsReward(client, {
    guildId: g,
    userId: u,
    reason: "gara",
    grant: won
      ? { crateId: "beta", crateQty: 1, exp: 200, credits: 50000 }
      : place <= 3
        ? { exp: 100, credits: 15000 }
        : { exp: 40 },
  });
  return { ok: true, status: 200, pick: pid, result, grant: grant.granted, wallet: grant.wallet };
}

/* ——— Miniera Kyber ——— */
/** Solo blu/verde — Kyber naturali Jedi (canon). */
const KYBER_COLORS = Object.freeze(["blu", "verde"]);

async function getMinieraState(client, { guildId, userId }) {
  const playable = featurePlayable(client, FEATURES.EVENT_KYBER);
  const day = dayBucketRome();
  let digs = 0;
  let finds = [];
  if (userId) {
    const doc = await getDoc(`miniera_${day}_${userId}`);
    digs = safeInt(doc?.payload?.digs);
    finds = Array.isArray(doc?.payload?.finds) ? doc.payload.finds : [];
  }
  return {
    ok: true,
    playable,
    day,
    digs,
    maxDigs: 3,
    remaining: Math.max(0, 3 - digs),
    finds,
    colors: KYBER_COLORS.slice(),
    canDig: playable && digs < 3,
  };
}

async function digMiniera(client, { guildId, userId }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return { ok: false, status: 400, error: "bad_ids" };
  if (!featurePlayable(client, FEATURES.EVENT_KYBER)) {
    return { ok: false, status: 403, error: "feature_off", message: "Miniera non attiva." };
  }
  const day = dayBucketRome();
  const dedupe = `miniera_${day}_${u}`;
  const existing = await getDoc(dedupe);
  const digs = safeInt(existing?.payload?.digs);
  if (digs >= 3) {
    return { ok: false, status: 429, error: "daily_limit", message: "Massimo 3 estrazioni al giorno." };
  }
  const color = KYBER_COLORS[Math.floor(Math.random() * KYBER_COLORS.length)];
  const rare = Math.random() < 0.12;
  const find = { color, rare, at: new Date().toISOString() };
  const finds = [...(Array.isArray(existing?.payload?.finds) ? existing.payload.finds : []), find];
  await setDoc(dedupe, { digs: digs + 1, finds }, g);

  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    {
      $inc: { [`${ROOT}.items.kyber.${color}`]: 1, [`${ROOT}.items.kyber_rare`]: rare ? 1 : 0 },
      $set: { [`${ROOT}.updatedAt`]: new Date().toISOString(), [`${ROOT}.eventKey`]: eventKey },
      $setOnInsert: { guildId: g, userId: u },
    },
    { upsert: true },
  ).catch(() => null);

  const grant = await grantStarWarsReward(client, {
    guildId: g,
    userId: u,
    reason: "miniera",
    grant: rare
      ? { crateId: "alpha", crateQty: 1, exp: 150, credits: 25000 }
      : { exp: 50, credits: 5000 },
  });
  return {
    ok: true,
    status: 200,
    find,
    digs: digs + 1,
    remaining: Math.max(0, 2 - digs),
    grant: grant.granted,
    wallet: grant.wallet,
  };
}

module.exports = {
  getAccademiaState,
  submitAccademia,
  getGaraState,
  pickGaraPod,
  getMinieraState,
  digMiniera,
  featurePlayable,
};
