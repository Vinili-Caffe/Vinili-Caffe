/**
 * Ranghi fazione per epoca (dal più basso al più alto).
 * Non basati su PEI/livello: assegnati dal rango massimo (max 1) o da High Staff.
 */
"use strict";

const { EPOCHS } = require("./starWarsEventCalendar") as typeof import("./starWarsEventCalendar");

const RANK_MAX_TIER = 4;

/** Permessi cumulativi per tier. */
const RANK_PERMISSIONS = Object.freeze({
  1: Object.freeze({ buyTroops: false, war: false, manageRanks: false }),
  2: Object.freeze({ buyTroops: true, war: false, manageRanks: false }),
  3: Object.freeze({ buyTroops: true, war: true, manageRanks: false }),
  4: Object.freeze({ buyTroops: true, war: true, manageRanks: true }),
});

/**
 * Etichette per fazione (id wallet).
 * clone_wars: repubblica / separatisti
 * civil_war: ribellione / impero
 * sequel: nuova_repubblica / nuovo_ordine (Primo Ordine)
 */
const RANK_LABELS = Object.freeze({
  repubblica: Object.freeze({
    1: "Clone Trooper",
    2: "Clone Commander CC",
    3: "Clone Commander ARC",
    4: "Clone Marshal Commander CCM",
  }),
  separatisti: Object.freeze({
    1: "Droide da battaglia B1",
    2: "Droide Comando OOM",
    3: "Droide Tattico T",
    4: "Droide Tattico ST",
  }),
  ribellione: Object.freeze({
    1: "Volontario Ribelle",
    2: "Capitano Ribelle",
    3: "Generale Ribelle",
    4: "Leader dell'Alleanza",
  }),
  impero: Object.freeze({
    1: "Stormtrooper",
    2: "Comandante",
    3: "Grande Ammiraglio",
    4: "Grand Moff",
  }),
  nuova_repubblica: Object.freeze({
    1: "Soldato",
    2: "Capitano",
    3: "Generale",
    4: "Gran Generale",
  }),
  nuovo_ordine: Object.freeze({
    1: "Cadetto",
    2: "Capitano",
    3: "Ammiraglio",
    4: "Generale",
  }),
});

function normalizeId(v?) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

function normalizeFactionId(factionId?) {
  const f = normalizeId(factionId);
  if (f === "primo_ordine") return "nuovo_ordine";
  return f;
}

function clampTier(v?, fallback = 1) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(RANK_MAX_TIER, n));
}

function permissionsForTier(tier?) {
  const t = clampTier(tier, 1);
  return { ...RANK_PERMISSIONS[t] };
}

function rankLabel(factionId?, tier?) {
  const f = normalizeFactionId(factionId);
  const t = clampTier(tier, 1);
  const map = RANK_LABELS[f];
  return map?.[t] || `Rango ${t}`;
}

function resolveTierFromName(factionId?, rawName?) {
  const f = normalizeFactionId(factionId);
  const map = RANK_LABELS[f];
  if (!map) return null;
  const needle = normalizeId(rawName).replace(/\s+/g, " ");
  if (!needle) return null;
  if (/^[1-4]$/.test(needle)) return Number(needle);
  for (const [tier, label] of Object.entries(map)) {
    if (normalizeId(label).replace(/\s+/g, " ") === needle) return Number(tier);
  }
  /* match parziale / slug */
  for (const [tier, label] of Object.entries(map)) {
    const slug = normalizeId(label).replace(/[^a-z0-9]+/g, "");
    const nslug = needle.replace(/[^a-z0-9]+/g, "");
    if (slug && (slug === nslug || slug.includes(nslug) || nslug.includes(slug))) return Number(tier);
  }
  return null;
}

function publicRank(factionId?, tier?, epoch?) {
  const t = clampTier(tier, 1);
  const perms = permissionsForTier(t);
  return {
    tier: t,
    maxTier: RANK_MAX_TIER,
    label: rankLabel(factionId, t),
    factionId: normalizeFactionId(factionId) || null,
    epoch: epoch ? String(epoch) : null,
    permissions: perms,
    canBuyTroops: Boolean(perms.buyTroops),
    canWar: Boolean(perms.war),
    canManageRanks: Boolean(perms.manageRanks),
  };
}

function ranksCatalogForFaction(factionId?) {
  const f = normalizeFactionId(factionId);
  const map = RANK_LABELS[f];
  if (!map) return [];
  return [1, 2, 3, 4].map((tier) => publicRank(f, tier));
}

function epochForFaction(factionId?) {
  const f = normalizeFactionId(factionId);
  if (f === "repubblica" || f === "separatisti") return EPOCHS.CLONE_WARS;
  if (f === "ribellione" || f === "impero") return EPOCHS.CIVIL_WAR;
  if (f === "nuova_repubblica" || f === "nuovo_ordine") return EPOCHS.SEQUEL;
  return null;
}

export = {
  RANK_MAX_TIER,
  RANK_PERMISSIONS,
  RANK_LABELS,
  normalizeFactionId,
  clampTier,
  permissionsForTier,
  rankLabel,
  resolveTierFromName,
  publicRank,
  ranksCatalogForFaction,
  epochForFaction,
};
