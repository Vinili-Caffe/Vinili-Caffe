const triggersButtons = require("../Triggers/buttons");
const STAFF_IDS = new Set(["sanzioni", "warnstaff", "valutazioni", "pause", "limiti", "regolamento", "generalimoderazione", "testualimoderazione", "vocalimoderazione", "metodi", "ping", "info_rules", "info_donations", "info_sponsor", "info_tags", "candidature_premi_partner", "info_verifica", "info_boost_levels", "info_levels", "info_level", "torna_indietro", "info_badges_roles", "r_multiplier_info", "avatar_views", "banner_views"]);
const STAFF_EMBED_ROLE_SELECT_IDS = new Set([
  "personality_pronouns",
  "personality_age",
  "personality_region",
  "personality_dm",
  "personality_relationship",
  "personality_zodiac",
  "personality_mentions",
  "personality_colors_1",
  "personality_colors_2",
  "personality_colors_plus",
]);

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (interaction?.isButton?.()) {
    if (id.startsWith("staff_") || id.startsWith("avatar_unblock:") || id.startsWith("banner_unblock:") || id.startsWith("quote_remove:")) return true;
    if (STAFF_IDS.has(id)) return true;
  }
  if (interaction?.isStringSelectMenu?.()) return STAFF_EMBED_ROLE_SELECT_IDS.has(id);
  return false;
}

async function execute(interaction, client) {
  return await triggersButtons.execute(interaction, client);
}

module.exports = { name: "staffPanels", order: 55, match, execute };