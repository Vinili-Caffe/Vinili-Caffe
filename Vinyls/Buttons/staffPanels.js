const triggersButtons = require("../Triggers/buttons");
const { STAFF_GUIDE_MENU_ID } = require("../Utils/Staff/staffGuideMenuComponents");
const STAFF_IDS = new Set(["sanzioni", "moderazione_staff", "warnstaff", "valutazioni", "pause", "limiti", "regolamento", "lineeguida", "comandi", "guidapartners", "guidamiddle", "generalimoderazione", "testualimoderazione", "vocalimoderazione", "metodi", "ping", "info_rules", "info_donations", "info_sponsor", "candidature_premi_partner", "info_boost_levels", "info_levels", "info_level", "torna_indietro", "info_badges_roles", "r_multiplier_info", "avatar_views", "banner_views"]);
const STAFF_EMBED_ROLE_SELECT_IDS = new Set(["personality_pronouns", "personality_age", "personality_region", "personality_dm", "personality_relationship", "personality_zodiac", "personality_mentions", "personality_hobby", "personality_colors_1", "personality_colors_plus"]);

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (interaction?.isButton?.()) {
    if (id.startsWith("staff_") || id.startsWith("middle_") || id.startsWith("avatar_unblock:") || id.startsWith("banner_unblock:") || id.startsWith("quote_remove:") || id.startsWith("repost_remove:") || id.startsWith("myrepost_del:") || id.startsWith("myclip_del:") || id.startsWith("myquote_del:")) return true;
    if (STAFF_IDS.has(id)) return true;
  }
  if (interaction?.isStringSelectMenu?.()) {
    if (id === STAFF_GUIDE_MENU_ID) return true;
    return STAFF_EMBED_ROLE_SELECT_IDS.has(id);
  }
  return false;
}

async function execute(interaction, client) {
  await triggersButtons.execute(interaction, client);
  return true;
}

module.exports = { name: "staffPanels", order: 55, match, execute };