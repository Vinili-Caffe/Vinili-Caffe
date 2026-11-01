const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js") as typeof import("discord.js");
const ROLE_PANEL_DEFAULT_CATEGORY = "pronouns";
const ROLE_PANEL_CATEGORY_KEYS = [
  "pronouns",
  "age",
  "region",
  "zodiac",
  "dm",
  "relationship",
  "mentions",
  "hobby",
  "gaming",
  "colors1",
  "colors_level",
  "colors_plus",
];

function normalizeRolePanelCategory(raw?) {
  const s = String(raw || "").trim();
  if (ROLE_PANEL_CATEGORY_KEYS.includes(s)) return s;
  return ROLE_PANEL_DEFAULT_CATEGORY;
}

export = {
  ROLE_PANEL_CATEGORY_KEYS,
  normalizeRolePanelCategory,
};