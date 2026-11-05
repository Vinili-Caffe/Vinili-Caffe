/**
 * Emoji Discord casse SW (chiuse / aperte).
 * Catalogo: shared/emojis → VC_<crateId>closed / VC_<crateId>open
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { E } = require(__eventCoreVinili("../shared/emojis/emojiCatalog")) as typeof import("../../../../../src/shared/emojis/emojiCatalog");
const { CRATE_LABELS } = require("./starWarsAdventCatalog") as typeof import("./starWarsAdventCatalog");

const CRATE_EMOJI_IDS = Object.freeze([
  "alpha",
  "beta",
  "omega",
  "lunare",
  "solare",
  "planetario",
  "nebulare",
  "galattico",
  "avvento",
  "militare",
  "militare_plus",
  "militare_op",
  "casuale",
]);

function normalizeCrateId(crateId?) {
  return String(crateId || "")
    .trim()
    .toLowerCase();
}

/** Emoji cassa: closed di default (premio da vincere / inventario); open dopo claim. */
function crateEmoji(crateId?, open = false) {
  const id = normalizeCrateId(crateId);
  if (!id || !CRATE_EMOJI_IDS.includes(id)) return "";
  const key = open ? `VC_${id}open` : `VC_${id}closed`;
  return String(E[key] || "").trim();
}

function crateLabel(crateId?) {
  const id = normalizeCrateId(crateId);
  return CRATE_LABELS[id] || (id ? `Cassa ${id}` : "Cassa");
}

/**
 * Es. `<:VC_alphaclosed:…> **Cassa Alpha**` oppure con qty `2×`.
 * open=false → chiusa (spawn/premio); open=true → aperta (vinta/ritirata).
 */
function formatCrateMention(crateId?, qty = 1, { open = false, bold = true } = {}) {
  const id = normalizeCrateId(crateId);
  const emoji = crateEmoji(id, open);
  const label = crateLabel(id);
  const n = Math.max(1, Math.floor(Number(qty) || 1));
  const qtyBit = n > 1 ? `${n}× ` : "";
  const text = bold ? `**${qtyBit}${label}**` : `${qtyBit}${label}`;
  return emoji ? `${emoji} ${text}` : text;
}

export = {
  CRATE_EMOJI_IDS,
  crateEmoji,
  crateLabel,
  formatCrateMention,
};
