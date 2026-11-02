const triggersButtons = require("../../../Triggers/buttons") as typeof import("../../../Triggers/buttons");

/** Sticky #sanzioni + classifica views avatar/banner + unblock/quote. */
const STAFF_PANEL_EXACT_IDS = new Set([
  "generalimoderazione",
  "testualimoderazione",
  "vocalimoderazione",
  "moderazione_staff",
  "regolamento",
  "avatar_views",
  "banner_views",
]);

function match(interaction?) {
  const id = String(interaction?.customId || "");
  if (!interaction?.isButton?.()) return false;
  if (STAFF_PANEL_EXACT_IDS.has(id)) return true;
  return (
    id.startsWith("avatar_unblock:") ||
    id.startsWith("banner_unblock:") ||
    id.startsWith("quote_remove:")
  );
}

async function execute(interaction?, client?) {
  await triggersButtons.execute(interaction, client);
  return true;
}

export = { name: "staffPanels", order: 55, match, execute };
