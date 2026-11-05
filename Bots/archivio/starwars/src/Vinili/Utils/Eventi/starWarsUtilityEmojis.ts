/**
 * Emoji Discord oggetti utility SW.
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { E } = require(__eventCoreVinili("../shared/emojis/emojiCatalog")) as typeof import("../../../../../src/shared/emojis/emojiCatalog");
const {
  UTILITY_ITEM_IDS,
  UTILITY_ITEM_LABELS,
  isUtilityItemId,
} = require("./starWarsUtilityItemsCatalog") as typeof import("./starWarsUtilityItemsCatalog");

function normalizeId(v?) {
  return String(v || "").trim().toLowerCase();
}

function utilityEmoji(itemId?) {
  const id = normalizeId(itemId);
  if (!isUtilityItemId(id)) return "";
  return String(E[`VC_${id}`] || "").trim();
}

function utilityLabel(itemId?) {
  const id = normalizeId(itemId);
  return UTILITY_ITEM_LABELS[id] || id || "Oggetto";
}

/** Es. `<:VC_bacta:…> **Bacta**` */
function formatUtilityMention(itemId?, qty = 1, { bold = true } = {}) {
  const id = normalizeId(itemId);
  const emoji = utilityEmoji(id);
  const label = utilityLabel(id);
  const n = Math.max(1, Math.floor(Number(qty) || 1));
  const qtyBit = n > 1 ? `${n}× ` : "";
  const text = bold ? `**${qtyBit}${label}**` : `${qtyBit}${label}`;
  return emoji ? `${emoji} ${text}` : text;
}

export = {
  UTILITY_ITEM_IDS,
  utilityEmoji,
  utilityLabel,
  formatUtilityMention,
};
