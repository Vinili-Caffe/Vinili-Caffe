/**
 * Emoji Discord truppe SW (catalogo unità).
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { E } = require(__eventCoreVinili("../shared/emojis/emojiCatalog")) as typeof import("../../../../../../src/shared/emojis/emojiCatalog");
const { CLONE_WARS_UNITS, CIVIL_WAR_UNITS, SEQUEL_UNITS, unitLabelForFaction } = require("./starWarsEconomyCatalog") as typeof import("./starWarsEconomyCatalog");

const TROOP_UNIT_IDS = Object.freeze([
  ...CLONE_WARS_UNITS.map((u) => u.id),
  ...CIVIL_WAR_UNITS.map((u) => u.id),
  ...SEQUEL_UNITS.map((u) => u.id),
]);

const TROOP_ID_SET = new Set(TROOP_UNIT_IDS);

function normalizeId(v?) {
  return String(v || "").trim().toLowerCase();
}

function isTroopUnitId(id?) {
  return TROOP_ID_SET.has(normalizeId(id));
}

function troopEmoji(unitId?) {
  const id = normalizeId(unitId);
  if (!isTroopUnitId(id)) return "";
  return String(E[`VC_${id}`] || "").trim();
}

function troopLabel(unitId?, factionId?) {
  const id = normalizeId(unitId);
  const all = [...CLONE_WARS_UNITS, ...CIVIL_WAR_UNITS, ...SEQUEL_UNITS];
  const unit = all.find((u) => u.id === id);
  if (!unit) return id || "Truppa";
  return unitLabelForFaction(unit, factionId) || id;
}

/** Es. `<:VC_xwing_interceptor:…> **2× X-Wing**` */
function formatTroopMention(unitId?, qty = 1, { bold = true, factionId = null } = {}) {
  const id = normalizeId(unitId);
  const emoji = troopEmoji(id);
  const label = troopLabel(id, factionId);
  const n = Math.max(1, Math.floor(Number(qty) || 1));
  const qtyBit = n > 1 ? `${n}× ` : "";
  const text = bold ? `**${qtyBit}${label}**` : `${qtyBit}${label}`;
  return emoji ? `${emoji} ${text}` : text;
}

function formatTroopMap(units?, { factionId = null, bold = true } = {}) {
  if (!units || typeof units !== "object") return "";
  return Object.entries(units)
    .map(([id, qty]) => {
      const n = Math.max(0, Math.floor(Number(qty) || 0));
      if (!n) return "";
      return formatTroopMention(id, n, { bold, factionId });
    })
    .filter(Boolean)
    .join(", ");
}

export = {
  TROOP_UNIT_IDS,
  isTroopUnitId,
  troopEmoji,
  troopLabel,
  formatTroopMention,
  formatTroopMap,
};
