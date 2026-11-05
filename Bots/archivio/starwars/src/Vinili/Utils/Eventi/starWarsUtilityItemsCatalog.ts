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
  bacta: "Si usa solo in attacco: cura il 5% dell'esercito quando schieri le truppe.",
  festival_ancestors: "Crediti ed exp doppi dai voti per 24 ore.",
  riciclaggio_hutt: "+10% crediti dai minigames per 24 ore.",
  sconto_mercato_nero: "Shop al −20% per 24 ore.",
});

/** Durata buff attivabili (ms). Bacta è istantaneo. */
const BUFF_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Chance di trovare ANCHE un oggetto utility (oltre a crediti/exp o truppe).
 */
const CRATE_ITEM_DROP_CHANCE = Object.freeze({
  alpha: 0.04,
  beta: 0.07,
  omega: 0.1,
  lunare: 0.12,
  solare: 0.14,
  planetario: 0.17,
  nebulare: 0.2,
  galattico: 0.22,
  avvento: 0.01,
  militare: 0.02,
  militare_plus: 0.03,
  militare_op: 0.04,
  stellare: 0.005,
  cosmica: 0.005,
});

function normalizeId(v?) {
  return String(v || "").trim();
}

function isUtilityItemId(id?) {
  return UTILITY_ITEM_IDS.includes(normalizeId(id));
}

function publicUtilityCatalog() {
  let emojiOf = (_id?) => "";
  try {
    const { utilityEmoji } = require("./starWarsUtilityEmojis") as typeof import("./starWarsUtilityEmojis");
    emojiOf = utilityEmoji;
  } catch (_) {}
  return UTILITY_ITEM_IDS.map((id?) => ({
    id,
    label: UTILITY_ITEM_LABELS[id],
    blurb: UTILITY_ITEM_BLURBS[id],
    kind: id === "bacta" ? "instant" : "buff_24h",
    emoji: emojiOf(id) || "",
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
