/**
 * Utility consumabili evento SW (drop casse + inventario).
 */
"use strict";

const UTILITY_ITEM_IDS = Object.freeze([
  "bacta",
  "festival_ancestors",
  "riciclaggio_hutt",
  "sconto_mercato_nero",
]);

const UTILITY_ITEM_LABELS = Object.freeze({
  bacta: "Bacta",
  festival_ancestors: "Festival Ancestors",
  riciclaggio_hutt: "Riciclaggio degli Hutt",
  sconto_mercato_nero: "Sconto mercato nero",
});

const UTILITY_ITEM_BLURBS = Object.freeze({
  bacta: "Cura il 5% dell'esercito personale (solo truppe).",
  festival_ancestors: "Crediti ed exp doppi dai voti per 24 ore.",
  riciclaggio_hutt: "+10% crediti dai minigames per 24 ore.",
  sconto_mercato_nero: "Shop al −20% per 24 ore.",
});

/** Durata buff attivabili (ms). Bacta è istantaneo. */
const BUFF_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Chance drop oggetto bonus per cassa (dopo crediti/exp).
 * Militari esclusi.
 */
const CRATE_ITEM_DROP_CHANCE = Object.freeze({
  avvento: 0.08,
  alpha: 0.08,
  beta: 0.12,
  omega: 0.15,
  lunare: 0.18,
  solare: 0.22,
  planetario: 0.25,
  nebulare: 0.28,
  galattico: 0.32,
  casuale: 0.1,
});

function normalizeId(v?) {
  return String(v || "").trim();
}

function isUtilityItemId(id?) {
  return UTILITY_ITEM_IDS.includes(normalizeId(id));
}

function publicUtilityCatalog() {
  return UTILITY_ITEM_IDS.map((id?) => ({
    id,
    label: UTILITY_ITEM_LABELS[id],
    blurb: UTILITY_ITEM_BLURBS[id],
    kind: id === "bacta" ? "instant" : "buff_24h",
  }));
}

/** Roll eventuale item da cassa (o null). */
function rollUtilityItemDrop(resolvedCrateId?) {
  const cid = normalizeId(resolvedCrateId);
  const chance = Number(CRATE_ITEM_DROP_CHANCE[cid] || 0);
  if (!(chance > 0) || Math.random() >= chance) return null;
  const pick = UTILITY_ITEM_IDS[Math.floor(Math.random() * UTILITY_ITEM_IDS.length)];
  return pick || null;
}

export = {
  UTILITY_ITEM_IDS,
  UTILITY_ITEM_LABELS,
  UTILITY_ITEM_BLURBS,
  BUFF_DURATION_MS,
  CRATE_ITEM_DROP_CHANCE,
  isUtilityItemId,
  publicUtilityCatalog,
  rollUtilityItemDrop,
};
