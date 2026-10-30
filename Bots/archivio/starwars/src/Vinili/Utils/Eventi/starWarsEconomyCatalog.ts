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
  { id: "atte_aat_cw", tier: 1, type: "terra", power: 2, cost: 200000, labels: { ribellione: "AT-TE", impero: "AAT" } },
  { id: "ywings_tie", tier: 1, type: "aria", power: 3, cost: 300000, labels: { ribellione: "BTL Y-Wings", impero: "TIE" } },
  { id: "htt_itt", tier: 2, type: "terra", power: 4, cost: 400000, labels: { ribellione: "HTT", impero: "ITT" } },
  { id: "xwing_interceptor", tier: 2, type: "aria", power: 5, cost: 500000, labels: { ribellione: "T-65 X-Wing", impero: "TIE Interceptor" } },
  { id: "gr75_gozanti", tier: 2, type: "aria", power: 6, cost: 600000, labels: { ribellione: "GR-75", impero: "Gozanti" } },
  { id: "mc80_imperial", tier: 3, type: "aria", power: 7, cost: 700000, labels: { ribellione: "MC80", impero: "Imperial I" } },
]);

const SEQUEL_UNITS = Object.freeze([
  { id: "ribelli_storm_sq", tier: 1, type: "terra", power: 1, cost: 100000, labels: { nuova_repubblica: "Ribelli", nuovo_ordine: "Stormtrooper" } },
  { id: "colonnello", tier: 1, type: "terra", power: 2, cost: 200000, labels: { nuova_repubblica: "Colonnello", nuovo_ordine: "Colonnello" } },
  { id: "generale", tier: 1, type: "terra", power: 3, cost: 300000, labels: { nuova_repubblica: "Generale", nuovo_ordine: "Generale" } },
  { id: "ewings_tie_ssf", tier: 2, type: "aria", power: 5, cost: 500000, labels: { nuova_repubblica: "E-Wings", nuovo_ordine: "TIE SSF" } },
  { id: "endurance_resurgent", tier: 2, type: "aria", power: 6, cost: 600000, labels: { nuova_repubblica: "Endurance", nuovo_ordine: "Resurgent" } },
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

export = {
  CLONE_WARS_UNITS,
  CIVIL_WAR_UNITS,
  SEQUEL_UNITS,
  EPOCH_FACTIONS,
  unitsForEpoch,
  publicShopCatalog,
};
