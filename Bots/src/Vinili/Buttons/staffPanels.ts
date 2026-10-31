const triggersButtons = require("../Triggers/buttons") as typeof import("../Triggers/buttons");
/* Guida staff Discord dismessa → sito. Restano info/sanzioni sticky + unblock avatar/banner + quote/repost. */
const STAFF_IDS = new Set([
  "moderazione_staff",
  "regolamento",
  "generalimoderazione",
  "testualimoderazione",
  "vocalimoderazione",
  "info_rules",
  "info_donations",
  "info_sponsor",
  "candidature_premi_partner",
  "info_boost_levels",
  "info_levels",
  "info_level",
  "torna_indietro",
  "info_badges_roles",
  "r_multiplier_info",
  "avatar_views",
  "banner_views",
]);

function match(interaction?) {
  const id = String(interaction?.customId || "");
  if (interaction?.isButton?.()) {
    if (
      id.startsWith("staff_") ||
      id.startsWith("middle_") ||
      id.startsWith("avatar_unblock:") ||
      id.startsWith("banner_unblock:") ||
      id.startsWith("quote_remove:") ||
      id.startsWith("repost_remove:") ||
      id.startsWith("myrepost_del:") ||
      id.startsWith("myclip_del:") ||
      id.startsWith("myquote_del:")
    ) {
      return true;
    }
    if (STAFF_IDS.has(id)) return true;
  }
  return false;
}

async function execute(interaction?, client?) {
  await triggersButtons.execute(interaction, client);
  return true;
}

export = { name: "staffPanels", order: 55, match, execute };
