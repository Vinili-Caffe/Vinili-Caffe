/**
 * Puzzle di Kessel — 6 difficoltà (pezzi, tempo, casse %, EXP, cooldown).
 */
"use strict";

const PUZZLE_CDN = "https://cdn.viniliecaffe.it/images/starwars/puzzle";
const PUZZLE_V = "20261104pz1";

function img(slug?) {
  return `${PUZZLE_CDN}/${String(slug || "").trim()}.jpg?v=${PUZZLE_V}`;
}

/** @typedef {{ crateId: string, weight: number }} PuzzleCrateOdds */

/**
 * @typedef {object} PuzzleDifficulty
 * @property {string} id
 * @property {string} label
 * @property {number} order
 * @property {number} cols
 * @property {number} rows
 * @property {number} pieces
 * @property {number} timeLimitSec
 * @property {number} cooldownMs
 * @property {number} exp
 * @property {PuzzleCrateOdds[]} crateOdds
 * @property {string} imageUrl
 */

/** @type {readonly PuzzleDifficulty[]} */
const PUZZLE_DIFFICULTIES = Object.freeze([
  Object.freeze({
    id: "facile",
    label: "Facile",
    order: 1,
    cols: 4,
    rows: 3,
    pieces: 12,
    timeLimitSec: 60,
    cooldownMs: 30 * 60 * 1000,
    exp: 50,
    crateOdds: Object.freeze([
      Object.freeze({ crateId: "alpha", weight: 70 }),
      Object.freeze({ crateId: "beta", weight: 30 }),
    ]),
    imageUrl: img("puzzle-facile"),
  }),
  Object.freeze({
    id: "normale",
    label: "Normale",
    order: 2,
    cols: 4,
    rows: 4,
    pieces: 16,
    timeLimitSec: 90,
    cooldownMs: 30 * 60 * 1000,
    exp: 100,
    crateOdds: Object.freeze([
      Object.freeze({ crateId: "alpha", weight: 60 }),
      Object.freeze({ crateId: "beta", weight: 40 }),
    ]),
    imageUrl: img("puzzle-normale"),
  }),
  Object.freeze({
    id: "intermedio",
    label: "Intermedio",
    order: 3,
    cols: 5,
    rows: 4,
    pieces: 20,
    timeLimitSec: 150,
    cooldownMs: 30 * 60 * 1000,
    exp: 150,
    crateOdds: Object.freeze([
      Object.freeze({ crateId: "alpha", weight: 50 }),
      Object.freeze({ crateId: "beta", weight: 50 }),
    ]),
    imageUrl: img("puzzle-intermedio"),
  }),
  Object.freeze({
    id: "difficile",
    label: "Difficile",
    order: 4,
    cols: 6,
    rows: 4,
    pieces: 24,
    timeLimitSec: 240,
    cooldownMs: 80 * 60 * 1000,
    exp: 200,
    crateOdds: Object.freeze([
      Object.freeze({ crateId: "beta", weight: 70 }),
      Object.freeze({ crateId: "omega", weight: 30 }),
    ]),
    imageUrl: img("puzzle-difficile"),
  }),
  Object.freeze({
    id: "esperto",
    label: "Esperto",
    order: 5,
    cols: 6,
    rows: 6,
    pieces: 36,
    timeLimitSec: 300,
    cooldownMs: 80 * 60 * 1000,
    exp: 250,
    crateOdds: Object.freeze([
      Object.freeze({ crateId: "beta", weight: 60 }),
      Object.freeze({ crateId: "omega", weight: 40 }),
    ]),
    imageUrl: img("puzzle-esperto"),
  }),
  Object.freeze({
    id: "impossibile",
    label: "Impossibile",
    order: 6,
    cols: 8,
    rows: 6,
    pieces: 48,
    timeLimitSec: 360,
    cooldownMs: 2 * 60 * 60 * 1000,
    exp: 300,
    crateOdds: Object.freeze([
      Object.freeze({ crateId: "beta", weight: 50 }),
      Object.freeze({ crateId: "omega", weight: 50 }),
    ]),
    imageUrl: img("puzzle-impossibile"),
  }),
]);

type PuzzleDiff = (typeof PUZZLE_DIFFICULTIES)[number];
const BY_ID = new Map<string, PuzzleDiff>(
  PUZZLE_DIFFICULTIES.map((d) => [String(d.id), d]),
);

function listPuzzleDifficulties() {
  return PUZZLE_DIFFICULTIES.slice();
}

function getPuzzleDifficulty(id?): PuzzleDiff | null {
  return BY_ID.get(String(id || "").trim().toLowerCase()) || null;
}

function rollPuzzleCrate(diff?) {
  const odds = Array.isArray(diff?.crateOdds) ? diff.crateOdds : [];
  if (!odds.length) return null;
  const total = odds.reduce((s, o) => s + Math.max(0, Number(o.weight) || 0), 0);
  if (total <= 0) return odds[0]?.crateId || null;
  let r = Math.random() * total;
  for (const o of odds) {
    r -= Math.max(0, Number(o.weight) || 0);
    if (r <= 0) return String(o.crateId || "").trim() || null;
  }
  return String(odds[odds.length - 1]?.crateId || "").trim() || null;
}

function publicPuzzleDifficulty(diff?) {
  if (!diff) return null;
  return {
    id: diff.id,
    label: diff.label,
    order: diff.order,
    cols: diff.cols,
    rows: diff.rows,
    pieces: diff.pieces,
    timeLimitSec: diff.timeLimitSec,
    cooldownMs: diff.cooldownMs,
    exp: diff.exp,
    crateOdds: diff.crateOdds.map((o) => ({ crateId: o.crateId, weight: o.weight })),
    imageUrl: diff.imageUrl,
  };
}

/** Sponsor a interazione (niente AdSense): countdown VC/sponsor → bonus. */
const PUZZLE_AD_BOOSTS = Object.freeze({
  watchSec: 12,
  cooldown: Object.freeze({ max: 3, cutPercent: 35 }),
  time: Object.freeze({ max: 2, bonusSec: 45 }),
  reward: Object.freeze({ max: 1, expMult: 1.5, betterCrateBias: 15 }),
});

function publicPuzzleAdBoosts() {
  return {
    watchSec: PUZZLE_AD_BOOSTS.watchSec,
    cooldown: { ...PUZZLE_AD_BOOSTS.cooldown },
    time: { ...PUZZLE_AD_BOOSTS.time },
    reward: { ...PUZZLE_AD_BOOSTS.reward },
  };
}

function rollPuzzleCrateBiased(diff?, betterBias = 0) {
  const odds = Array.isArray(diff?.crateOdds) ? diff.crateOdds.map((o) => ({ ...o })) : [];
  if (!odds.length) return null;
  const bias = Math.max(0, Number(betterBias) || 0);
  if (bias > 0 && odds.length >= 2) {
    /* Sposta peso dalla prima (peggio) verso l'ultima (meglio). */
    const take = Math.min(bias, Math.max(0, Number(odds[0].weight) || 0));
    odds[0].weight = Math.max(0, Number(odds[0].weight) || 0) - take;
    odds[odds.length - 1].weight = Math.max(0, Number(odds[odds.length - 1].weight) || 0) + take;
  }
  return rollPuzzleCrate({ crateOdds: odds });
}

export = {
  PUZZLE_DIFFICULTIES,
  PUZZLE_AD_BOOSTS,
  listPuzzleDifficulties,
  getPuzzleDifficulty,
  rollPuzzleCrate,
  rollPuzzleCrateBiased,
  publicPuzzleDifficulty,
  publicPuzzleAdBoosts,
};
