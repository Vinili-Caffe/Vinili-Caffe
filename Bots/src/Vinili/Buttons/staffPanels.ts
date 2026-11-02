const triggersButtons = require("../Triggers/buttons") as typeof import("../Triggers/buttons");

function match(interaction?) {
  const id = String(interaction?.customId || "");
  if (interaction?.isButton?.()) {
    if (
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
  }
  return false;
}

async function execute(interaction?, client?) {
  await triggersButtons.execute(interaction, client);
  return true;
}

export = { name: "staffPanels", order: 55, match, execute };
