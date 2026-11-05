/**
 * Cataloghi economia evento (truppe per epoca) — da CALENDARIO EVENTO.pdf.
 * Acquisto/battaglie: fasi successive; qui solo dati.
 */
"use strict";

const { EPOCHS } = require("./starWarsEventCalendar") as typeof import("./starWarsEventCalendar");

/** Clone Wars: Repubblica ↔ Separatisti */
const CLONE_WARS_UNITS = Object.freeze([
  { id: "cloni_droidi", tier: 1, type: "terra", power: 1, cost: 100000, labels: { repubblica: "Cloni", separatisti: "Droidi" } },
  { id: "tx130_gat", tier: 1, type: "terra", power: 2, cost: 200000, labels: { repubblica: "TX-130", separatisti: "GAT" } },
  { id: "arc170_vulture", tier: 1, type: "aria", power: 3, cost: 300000, labels: { repubblica: "ARC-170", separatisti: "Vulture" } },
  { id: "atte_aat", tier: 2, type: "terra", power: 4, cost: 400000, labels: { repubblica: "AT-TE", separatisti: "AAT" } },
  { id: "jedi_cacciatore", tier: 2, type: "terra", power: 5, cost: 500000, labels: { repubblica: "Jedi", separatisti: "Cacciatore di taglie" } },
  { id: "atot_mtt", tier: 2, type: "terra", power: 6, cost: 600000, labels: { repubblica: "AT-OT", separatisti: "MTT" } },
  { id: "laat_hmp", tier: 3, type: "aria", power: 7, cost: 700000, labels: { repubblica: "LAAT", separatisti: "HMP" } },
  { id: "havw_ig227", tier: 3, type: "terra", power: 8, cost: 800000, labels: { repubblica: "HAVw A6", separatisti: "IG-227" } },
  { id: "acclamator_munificent", tier: 3, type: "aria", power: 9, cost: 900000, labels: { repubblica: "Acclamator", separatisti: "Munificent" } },
  { id: "venator_providence", tier: 4, type: "aria", power: 10, cost: 1000000, labels: { repubblica: "Venator", separatisti: "Providence" } },
]);

const CIVIL_WAR_UNITS = Object.freeze([
  { id: "ribelli_storm", tier: 1, type: "terra", power: 1, cost: 100000, labels: { ribellione: "Ribelli", impero: "Stormtrooper" } },
  { id: "atte_aat_cw", tier: 2, type: "terra", power: 2, cost: 200000, labels: { ribellione: "AT-TE", impero: "AAT" } },
  { id: "ywings_tie", tier: 2, type: "aria", power: 3, cost: 300000, labels: { ribellione: "BTL Y-Wings", impero: "TIE" } },
  { id: "htt_itt", tier: 3, type: "terra", power: 4, cost: 400000, labels: { ribellione: "HTT", impero: "ITT" } },
  { id: "xwing_interceptor", tier: 3, type: "aria", power: 5, cost: 500000, labels: { ribellione: "T-65 X-Wing", impero: "TIE Interceptor" } },
  { id: "gr75_gozanti", tier: 4, type: "aria", power: 6, cost: 600000, labels: { ribellione: "GR-75", impero: "Gozanti" } },
  { id: "mc80_imperial", tier: 4, type: "aria", power: 7, cost: 700000, labels: { ribellione: "MC80", impero: "Imperial I" } },
]);

const SEQUEL_UNITS = Object.freeze([
  { id: "ribelli_storm_sq", tier: 1, type: "terra", power: 1, cost: 100000, labels: { nuova_repubblica: "Repubblicano", nuovo_ordine: "Assaltatore" } },
  { id: "colonnello", tier: 2, type: "terra", power: 2, cost: 200000, labels: { nuova_repubblica: "Colonnello", nuovo_ordine: "Capitano" } },
  { id: "generale", tier: 3, type: "terra", power: 3, cost: 300000, labels: { nuova_repubblica: "Generale", nuovo_ordine: "Generale" } },
  { id: "ewings_tie_ssf", tier: 4, type: "aria", power: 5, cost: 500000, labels: { nuova_repubblica: "E-Wings", nuovo_ordine: "TIE SSF" } },
  { id: "endurance_resurgent", tier: 4, type: "aria", power: 6, cost: 600000, labels: { nuova_repubblica: "Endurance", nuovo_ordine: "Resurgent" } },
]);

const EPOCH_FACTIONS = Object.freeze({
  [EPOCHS.CLONE_WARS]: ["repubblica", "separatisti"],
  [EPOCHS.CIVIL_WAR]: ["ribellione", "impero"],
  [EPOCHS.SEQUEL]: ["nuova_repubblica", "nuovo_ordine"],
});

function unitsForEpoch(epoch?) {
  if (epoch === EPOCHS.CIVIL_WAR) return CIVIL_WAR_UNITS.slice();
  if (epoch === EPOCHS.SEQUEL) return SEQUEL_UNITS.slice();
  return CLONE_WARS_UNITS.slice();
}

function publicShopCatalog(epoch = EPOCHS.CLONE_WARS, factionId = null) {
  const units = unitsForEpoch(epoch);
  const factions = EPOCH_FACTIONS[epoch] || EPOCH_FACTIONS[EPOCHS.CLONE_WARS];
  return {
    epoch,
    factions,
    units: units.map((u?) => ({
      id: u.id,
      tier: u.tier,
      type: u.type,
      power: u.power,
      cost: u.cost,
      label: factionId && u.labels[factionId] ? u.labels[factionId] : Object.values(u.labels)[0],
      labels: { ...u.labels },
    })),
  };
}

function parseTroopTierKey(key?) {
  const m = /^tier\s*([1-4])$/i.exec(String(key || "").trim());
  return m ? Number(m[1]) : null;
}

function isTroopTierKey(key?) {
  return parseTroopTierKey(key) != null;
}

function unitLabelForFaction(unit?, factionId?) {
  if (!unit) return "";
  const fid = String(factionId || "").trim().toLowerCase();
  if (fid && unit.labels?.[fid]) return String(unit.labels[fid]);
  return String(Object.values(unit.labels || {})[0] || unit.id || "");
}

/** Unità random del tier (per fazione/epoca). Se manca il tier, usa il più vicino ≤ richiesto. */
function pickUnitForTier(epoch?, factionId?, tier?) {
  const t = Math.floor(Number(tier));
  if (!Number.isFinite(t) || t < 1) return null;
  const fid = String(factionId || "").trim().toLowerCase();
  const all = unitsForEpoch(epoch).filter((u?) => !fid || u.labels?.[fid]);
  if (!all.length) return null;
  let pool = all.filter((u?) => u.tier === t);
  if (!pool.length) {
    const lower = all.filter((u?) => u.tier <= t).sort((a?, b?) => b.tier - a.tier);
    if (lower.length) {
      const best = lower[0].tier;
      pool = lower.filter((u?) => u.tier === best);
    } else {
      pool = all.slice();
    }
  }
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

/**
 * Converte mappa loot truppe (`tier2: 2` o già `cloni_droidi: 1`) → `{ unitId: qty }`.
 * Ogni pezzo di un tier viene pescato a caso tra le unità di quel tier.
 */
function materializeTroopGrants(troops?, { epoch = EPOCHS.CLONE_WARS, factionId = null } = {}) {
  const out: Record<string, number> = {};
  const labels: Record<string, string> = {};
  if (!troops || typeof troops !== "object") return { units: out, labels };

  for (const [key, rawQty] of Object.entries(troops)) {
    const qty = Math.max(0, Math.floor(Number(rawQty) || 0));
    if (!qty) continue;
    const tier = parseTroopTierKey(key);
    if (tier != null) {
      for (let i = 0; i < qty; i++) {
        const unit = pickUnitForTier(epoch, factionId, tier);
        if (!unit) continue;
        out[unit.id] = (out[unit.id] || 0) + 1;
        labels[unit.id] = unitLabelForFaction(unit, factionId);
      }
      continue;
    }
    const id = String(key || "").trim();
    if (!id || isTroopTierKey(id)) continue;
    out[id] = (out[id] || 0) + qty;
    const known = unitsForEpoch(epoch).find((u?) => u.id === id);
    labels[id] = known ? unitLabelForFaction(known, factionId) : id;
  }
  return { units: out, labels };
}

export = {
  CLONE_WARS_UNITS,
  CIVIL_WAR_UNITS,
  SEQUEL_UNITS,
  EPOCH_FACTIONS,
  unitsForEpoch,
  publicShopCatalog,
  parseTroopTierKey,
  isTroopTierKey,
  pickUnitForTier,
  materializeTroopGrants,
  unitLabelForFaction,
};
