/**
 * Giochi sito: Accademia (mira), Podracing Championship, Miniera Kyber.
 * HS può giocare con publicEnabled=false.
 */
"use strict";


const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { SiteDocument, SITE_DOCUMENT_TYPE, ActivityUserProfile } = require(__eventCoreVinili("Community/schemas/communitySchemas"));
const { isValidGuildUserId } = require(__eventCoreVinili("../shared/db/validateWriteIds"));
const { resolveStarWarsEventConfig } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
const { FEATURES, resolveFeatureStateNow } = require("../../Utils/Eventi/starWarsEventCalendar") as typeof import("../../Utils/Eventi/starWarsEventCalendar");
const { ADVENT_EVENT_KEY } = require("../../Utils/Eventi/starWarsAdventCatalog") as typeof import("../../Utils/Eventi/starWarsAdventCatalog");
const { getStarWarsWallet, ROOT, publicWallet } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");
const { grantStarWarsReward } = require("./starWarsRewardsService") as typeof import("./starWarsRewardsService");
const { getRuntimeFlags } = require("../../Utils/Eventi/starWarsRuntimeGate") as typeof import("../../Utils/Eventi/starWarsRuntimeGate");
const {
  listPuzzleDifficulties,
  getPuzzleDifficulty,
  rollPuzzleCrateBiased,
  publicPuzzleDifficulty,
  publicPuzzleAdBoosts,
  PUZZLE_AD_BOOSTS,
} = require("../../Utils/Eventi/starWarsPuzzleCatalog") as typeof import("../../Utils/Eventi/starWarsPuzzleCatalog");

const DOC_TYPE = SITE_DOCUMENT_TYPE.STARWARS_EVENT_STATE;
const OWNER = "__starwars_site_games__";
const PODS = Object.freeze([
  { id: "sebulba", label: "Sebulba", speed: 92, luck: 40 },
  { id: "anakin", label: "Anakin", speed: 88, luck: 70 },
  { id: "gasgano", label: "Gasgano", speed: 85, luck: 55 },
  { id: "teemto", label: "Teemto", speed: 80, luck: 60 },
  { id: "ben", label: "Ben Quadinaros", speed: 70, luck: 75 },
]);

function normalizeId(v?) {
  return String(v || "").trim();
}
function safeInt(v?, fb = 0) {
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

function featurePlayable(client?, featureKey?) {
  const flags = getRuntimeFlags(client);
  if (!flags.enabled) return false;
  if (!flags.publicEnabled) return true; /* HS anteprima: playable */
  const state = resolveFeatureStateNow(new Date());
  return Boolean(state.features?.includes(featureKey));
}

async function getDoc(dedupeKey?) {
  return SiteDocument.findOne({ docType: DOC_TYPE, ownerId: OWNER, dedupeKey })
    .lean()
    .catch(() => null);
}

async function setDoc(dedupeKey?, payload?, guildId = "0") {
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
function buildTargets(seed?) {
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
  const byId = new Map(targets.map((t?) => [t.id, t]));
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
    pods: PODS.map((p?) => ({ id: p.id, label: p.label })),
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
  const pod = PODS.find((p?) => p.id === pid);
  if (!pod) return { ok: false, status: 404, error: "unknown_pod" };
  const slot = garaSlot();
  const dedupe = `gara_${slot}_${u}`;
  const existing = await getDoc(dedupe);
  if (existing?.payload?.podId) {
    return { ok: false, status: 409, error: "already_picked", pick: existing.payload.podId, result: existing.payload.result };
  }

  /* Esito deterministic per slot+user */
  const seed = Number(`${slot.replace(/\D/g, "")}${u.slice(-4)}`.slice(-10)) || 1;
  const scores = PODS.map((p?, i?) => ({
    id: p.id,
    score: p.speed + ((seed + i * 17) % (p.luck + 1)),
  }));
  scores.sort((a?, b?) => b.score - a.score);
  const place = scores.findIndex((s?) => s.id === pid) + 1;
  const won = place === 1;
  const result = { place, won, finishOrder: scores.map((s?) => s.id) };
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

/* ——— Puzzle di Kessel ——— */
const PUZZLE_ATTEMPT_GRACE_MS = 12_000;
const puzzleAdSessions = new Map(); /* adSessionId → { userId, kind, difficultyId, attemptId, startedAt } */

function puzzleClaimsDocKey(userId?) {
  return `puzzle_claims_${normalizeId(userId)}`;
}

function puzzleAttemptDocKey(userId?, difficultyId?) {
  return `puzzle_attempt_${normalizeId(userId)}_${normalizeId(difficultyId)}`;
}

function readClaimsBlob(payload?) {
  const claimsRaw = payload?.claims && typeof payload.claims === "object" ? payload.claims : {};
  const cdEndsAt = payload?.cdEndsAt && typeof payload.cdEndsAt === "object" ? { ...payload.cdEndsAt } : {};
  const cdAdsUsed = payload?.cdAdsUsed && typeof payload.cdAdsUsed === "object" ? { ...payload.cdAdsUsed } : {};
  const claims: Record<string, string> = {};
  for (const [k, v] of Object.entries(claimsRaw)) {
    if (typeof v === "string") claims[k] = v;
    else if (v && typeof v === "object" && (v as any).claimedAt) claims[k] = String((v as any).claimedAt);
  }
  return { claims, cdEndsAt, cdAdsUsed };
}

function puzzleCooldownRemainingMs(claimsBlob?, difficultyId?, cooldownMs?, now = Date.now()) {
  const id = String(difficultyId || "");
  const ends = Date.parse(String(claimsBlob?.cdEndsAt?.[id] || ""));
  if (Number.isFinite(ends) && ends > 0) return Math.max(0, ends - now);
  const last = Date.parse(String(claimsBlob?.claims?.[id] || ""));
  if (!Number.isFinite(last) || last <= 0) return 0;
  return Math.max(0, last + Math.max(0, Number(cooldownMs) || 0) - now);
}

async function getPuzzleState(client, { guildId, userId }) {
  const playable = featurePlayable(client, FEATURES.EVENT_PUZZLE_KESSEL);
  const claimsPayload =
    userId ? ((await getDoc(puzzleClaimsDocKey(userId)))?.payload as Record<string, any>) || {} : {};
  const blob = readClaimsBlob(claimsPayload);
  const now = Date.now();
  const adBoosts = publicPuzzleAdBoosts();
  const difficulties = listPuzzleDifficulties().map((d?) => {
    const lastClaimAt = blob.claims[d.id] ? String(blob.claims[d.id]) : null;
    const remainingMs = userId ? puzzleCooldownRemainingMs(blob, d.id, d.cooldownMs, now) : 0;
    const cdUsed = safeInt(blob.cdAdsUsed[d.id]);
    return {
      ...publicPuzzleDifficulty(d),
      lastClaimAt,
      cooldownRemainingMs: remainingMs,
      canStart: Boolean(playable && userId && remainingMs <= 0),
      canPlayGuest: Boolean(playable),
      cdAdsUsed: cdUsed,
      cdAdsLeft: Math.max(0, adBoosts.cooldown.max - cdUsed),
      canCutCooldown: Boolean(userId && remainingMs > 0 && cdUsed < adBoosts.cooldown.max),
    };
  });
  return {
    ok: true,
    playable,
    difficulties,
    adBoosts,
    serverNow: new Date(now).toISOString(),
  };
}

async function startPuzzleAttempt(client, { guildId, userId, difficultyId }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return { ok: false, status: 400, error: "bad_ids" };
  if (!featurePlayable(client, FEATURES.EVENT_PUZZLE_KESSEL)) {
    return { ok: false, status: 403, error: "feature_off", message: "Puzzle non attivo." };
  }
  const diff = getPuzzleDifficulty(difficultyId);
  if (!diff) return { ok: false, status: 400, error: "bad_difficulty", message: "Difficoltà non valida." };

  const claimsDoc = await getDoc(puzzleClaimsDocKey(u));
  const blob = readClaimsBlob(claimsDoc?.payload);
  const remainingMs = puzzleCooldownRemainingMs(blob, diff.id, diff.cooldownMs);
  if (remainingMs > 0) {
    return {
      ok: false,
      status: 429,
      error: "cooldown",
      message: "Questa difficoltà è ancora in cooldown.",
      cooldownRemainingMs: remainingMs,
      difficulty: publicPuzzleDifficulty(diff),
    };
  }

  const startedAt = Date.now();
  const expiresAt = startedAt + diff.timeLimitSec * 1000 + PUZZLE_ATTEMPT_GRACE_MS;
  const attemptId = `${diff.id}_${startedAt}_${Math.floor(Math.random() * 1e9)}`;
  await setDoc(
    puzzleAttemptDocKey(u, diff.id),
    {
      attemptId,
      difficultyId: diff.id,
      startedAt: new Date(startedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      claimed: false,
      timeAdsUsed: 0,
      rewardAdsUsed: 0,
      timeBonusSec: 0,
      rewardBoosted: false,
    },
    g,
  );

  return {
    ok: true,
    status: 200,
    attemptId,
    startedAt: new Date(startedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    difficulty: publicPuzzleDifficulty(diff),
    adBoosts: publicPuzzleAdBoosts(),
    timeAdsUsed: 0,
    rewardAdsUsed: 0,
  };
}

async function beginPuzzleAdSession(client, { guildId, userId, kind, difficultyId, attemptId }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return { ok: false, status: 400, error: "bad_ids" };
  if (!featurePlayable(client, FEATURES.EVENT_PUZZLE_KESSEL)) {
    return { ok: false, status: 403, error: "feature_off", message: "Puzzle non attivo." };
  }
  const k = String(kind || "").trim().toLowerCase();
  if (!["cooldown", "time", "reward"].includes(k)) {
    return { ok: false, status: 400, error: "bad_kind", message: "Tipo boost non valido." };
  }
  const diff = getPuzzleDifficulty(difficultyId);
  if (!diff) return { ok: false, status: 400, error: "bad_difficulty", message: "Difficoltà non valida." };

  if (k === "cooldown") {
    const claimsDoc = await getDoc(puzzleClaimsDocKey(u));
    const blob = readClaimsBlob(claimsDoc?.payload);
    const remainingMs = puzzleCooldownRemainingMs(blob, diff.id, diff.cooldownMs);
    const used = safeInt(blob.cdAdsUsed[diff.id]);
    if (remainingMs <= 0) {
      return { ok: false, status: 400, error: "no_cooldown", message: "Nessun cooldown da ridurre." };
    }
    if (used >= PUZZLE_AD_BOOSTS.cooldown.max) {
      return { ok: false, status: 429, error: "ad_limit", message: "Hai già usato tutti i tagli cooldown." };
    }
  } else {
    const attemptDoc = await getDoc(puzzleAttemptDocKey(u, diff.id));
    const attempt = attemptDoc?.payload && typeof attemptDoc.payload === "object" ? attemptDoc.payload : null;
    if (!attempt || String(attempt.attemptId || "") !== String(attemptId || "").trim()) {
      return { ok: false, status: 409, error: "bad_attempt", message: "Tentativo non valido." };
    }
    if (attempt.claimed) {
      return { ok: false, status: 409, error: "already_claimed", message: "Partita già chiusa." };
    }
    if (k === "time" && safeInt(attempt.timeAdsUsed) >= PUZZLE_AD_BOOSTS.time.max) {
      return { ok: false, status: 429, error: "ad_limit", message: "Limite tempo extra raggiunto." };
    }
    if (k === "reward" && safeInt(attempt.rewardAdsUsed) >= PUZZLE_AD_BOOSTS.reward.max) {
      return { ok: false, status: 429, error: "ad_limit", message: "Premio già potenziato." };
    }
  }

  const adSessionId = `pzad_${u}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  puzzleAdSessions.set(adSessionId, {
    userId: u,
    kind: k,
    difficultyId: diff.id,
    attemptId: String(attemptId || "").trim() || null,
    startedAt: Date.now(),
  });
  return {
    ok: true,
    status: 200,
    adSessionId,
    kind: k,
    watchSec: PUZZLE_AD_BOOSTS.watchSec,
  };
}

async function finishPuzzleAdSession(client, { guildId, userId, adSessionId }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return { ok: false, status: 400, error: "bad_ids" };
  const sid = String(adSessionId || "").trim();
  const sess = puzzleAdSessions.get(sid);
  if (!sess || sess.userId !== u) {
    return { ok: false, status: 400, error: "bad_ad_session", message: "Sessione sponsor non valida." };
  }
  const needMs = Math.max(0, PUZZLE_AD_BOOSTS.watchSec * 1000 - 400);
  if (Date.now() - sess.startedAt < needMs) {
    return { ok: false, status: 400, error: "ad_early", message: "Completa lo sponsor per il tempo richiesto." };
  }
  puzzleAdSessions.delete(sid);

  const diff = getPuzzleDifficulty(sess.difficultyId);
  if (!diff) return { ok: false, status: 400, error: "bad_difficulty" };

  if (sess.kind === "cooldown") {
    const claimsKey = puzzleClaimsDocKey(u);
    const claimsDoc = await getDoc(claimsKey);
    const blob = readClaimsBlob(claimsDoc?.payload);
    const remainingMs = puzzleCooldownRemainingMs(blob, diff.id, diff.cooldownMs);
    const used = safeInt(blob.cdAdsUsed[diff.id]);
    if (remainingMs <= 0 || used >= PUZZLE_AD_BOOSTS.cooldown.max) {
      return { ok: false, status: 429, error: "ad_limit", message: "Boost cooldown non disponibile." };
    }
    const cut = Math.floor(remainingMs * (PUZZLE_AD_BOOSTS.cooldown.cutPercent / 100));
    const nextRemaining = Math.max(0, remainingMs - Math.max(cut, 60_000));
    const endsAt = Date.now() + nextRemaining;
    blob.cdEndsAt[diff.id] = new Date(endsAt).toISOString();
    blob.cdAdsUsed[diff.id] = used + 1;
    await setDoc(claimsKey, { claims: blob.claims, cdEndsAt: blob.cdEndsAt, cdAdsUsed: blob.cdAdsUsed }, g);
    return {
      ok: true,
      status: 200,
      kind: "cooldown",
      cooldownRemainingMs: nextRemaining,
      cdAdsUsed: used + 1,
      cdAdsLeft: Math.max(0, PUZZLE_AD_BOOSTS.cooldown.max - (used + 1)),
      cutMs: remainingMs - nextRemaining,
    };
  }

  const attemptKey = puzzleAttemptDocKey(u, diff.id);
  const attemptDoc = await getDoc(attemptKey);
  const attempt = attemptDoc?.payload && typeof attemptDoc.payload === "object" ? { ...attemptDoc.payload } : null;
  if (!attempt || String(attempt.attemptId || "") !== String(sess.attemptId || "")) {
    return { ok: false, status: 409, error: "bad_attempt", message: "Tentativo non valido." };
  }

  if (sess.kind === "time") {
    const used = safeInt(attempt.timeAdsUsed);
    if (used >= PUZZLE_AD_BOOSTS.time.max) {
      return { ok: false, status: 429, error: "ad_limit", message: "Limite tempo extra raggiunto." };
    }
    const bonus = PUZZLE_AD_BOOSTS.time.bonusSec;
    const prevExp = Date.parse(String(attempt.expiresAt || ""));
    const base = Number.isFinite(prevExp) ? prevExp : Date.now();
    attempt.expiresAt = new Date(base + bonus * 1000).toISOString();
    attempt.timeAdsUsed = used + 1;
    attempt.timeBonusSec = safeInt(attempt.timeBonusSec) + bonus;
    await setDoc(attemptKey, attempt, g);
    return {
      ok: true,
      status: 200,
      kind: "time",
      bonusSec: bonus,
      timeAdsUsed: attempt.timeAdsUsed,
      timeAdsLeft: Math.max(0, PUZZLE_AD_BOOSTS.time.max - attempt.timeAdsUsed),
      expiresAt: attempt.expiresAt,
      timeBonusSec: attempt.timeBonusSec,
    };
  }

  /* reward */
  const usedR = safeInt(attempt.rewardAdsUsed);
  if (usedR >= PUZZLE_AD_BOOSTS.reward.max) {
    return { ok: false, status: 429, error: "ad_limit", message: "Premio già potenziato." };
  }
  attempt.rewardAdsUsed = usedR + 1;
  attempt.rewardBoosted = true;
  await setDoc(attemptKey, attempt, g);
  return {
    ok: true,
    status: 200,
    kind: "reward",
    rewardAdsUsed: attempt.rewardAdsUsed,
    expMult: PUZZLE_AD_BOOSTS.reward.expMult,
    betterCrateBias: PUZZLE_AD_BOOSTS.reward.betterCrateBias,
  };
}

async function completePuzzleAttempt(client, { guildId, userId, difficultyId, attemptId, elapsedMs }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return { ok: false, status: 400, error: "bad_ids" };
  if (!featurePlayable(client, FEATURES.EVENT_PUZZLE_KESSEL)) {
    return { ok: false, status: 403, error: "feature_off", message: "Puzzle non attivo." };
  }
  const diff = getPuzzleDifficulty(difficultyId);
  if (!diff) return { ok: false, status: 400, error: "bad_difficulty", message: "Difficoltà non valida." };

  const attemptKey = puzzleAttemptDocKey(u, diff.id);
  const attemptDoc = await getDoc(attemptKey);
  const attempt = attemptDoc?.payload && typeof attemptDoc.payload === "object" ? attemptDoc.payload : null;
  if (!attempt || String(attempt.attemptId || "") !== String(attemptId || "").trim()) {
    return { ok: false, status: 409, error: "bad_attempt", message: "Tentativo non valido. Ricomincia il puzzle." };
  }
  if (attempt.claimed) {
    return { ok: false, status: 409, error: "already_claimed", message: "Premio già ritirato per questo tentativo." };
  }

  const now = Date.now();
  const expiresAt = Date.parse(String(attempt.expiresAt || ""));
  if (!Number.isFinite(expiresAt) || now > expiresAt) {
    return { ok: false, status: 408, error: "time_up", message: "Tempo scaduto: niente ricompensa." };
  }

  const startedAt = Date.parse(String(attempt.startedAt || ""));
  const elapsed = Math.max(0, Math.floor(Number(elapsedMs)));
  const serverElapsed = Number.isFinite(startedAt) ? now - startedAt : elapsed;
  const timeBonusSec = safeInt(attempt.timeBonusSec);
  const limitMs = (diff.timeLimitSec + timeBonusSec) * 1000 + PUZZLE_ATTEMPT_GRACE_MS;
  if (elapsed > limitMs || serverElapsed > limitMs) {
    return { ok: false, status: 408, error: "time_up", message: "Tempo scaduto: niente ricompensa." };
  }
  if (elapsed < 4_000 && serverElapsed < 4_000) {
    return { ok: false, status: 400, error: "too_fast", message: "Completamento non valido." };
  }

  const claimsDoc = await getDoc(puzzleClaimsDocKey(u));
  const blob = readClaimsBlob(claimsDoc?.payload);
  const remainingMs = puzzleCooldownRemainingMs(blob, diff.id, diff.cooldownMs, now);
  if (remainingMs > 0) {
    return {
      ok: false,
      status: 429,
      error: "cooldown",
      message: "Questa difficoltà è ancora in cooldown.",
      cooldownRemainingMs: remainingMs,
    };
  }

  const rewardBoosted = Boolean(attempt.rewardBoosted);
  const exp = rewardBoosted ? Math.round(diff.exp * PUZZLE_AD_BOOSTS.reward.expMult) : diff.exp;
  const crateId = rollPuzzleCrateBiased(
    diff,
    rewardBoosted ? PUZZLE_AD_BOOSTS.reward.betterCrateBias : 0,
  );
  const grant = await grantStarWarsReward(client, {
    guildId: g,
    userId: u,
    reason: `puzzle_${diff.id}`,
    grant: {
      exp,
      ...(crateId ? { crateId, crateQty: 1 } : {}),
    },
  });

  const claimedAt = new Date(now).toISOString();
  blob.claims[diff.id] = claimedAt;
  blob.cdEndsAt[diff.id] = new Date(now + diff.cooldownMs).toISOString();
  blob.cdAdsUsed[diff.id] = 0;
  await setDoc(puzzleClaimsDocKey(u), { claims: blob.claims, cdEndsAt: blob.cdEndsAt, cdAdsUsed: blob.cdAdsUsed }, g);
  await setDoc(attemptKey, { ...attempt, claimed: true, claimedAt, elapsedMs: elapsed }, g);

  return {
    ok: true,
    status: 200,
    difficulty: publicPuzzleDifficulty(diff),
    elapsedMs: elapsed,
    rewardBoosted,
    grant: grant.granted,
    wallet: grant.wallet,
    cooldownRemainingMs: diff.cooldownMs,
    nextAvailableAt: new Date(now + diff.cooldownMs).toISOString(),
  };
}

export = {
  getAccademiaState,
  submitAccademia,
  getGaraState,
  pickGaraPod,
  getMinieraState,
  digMiniera,
  getPuzzleState,
  startPuzzleAttempt,
  completePuzzleAttempt,
  beginPuzzleAdSession,
  finishPuzzleAdSession,
  featurePlayable,
};
