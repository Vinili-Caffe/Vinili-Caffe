const { handleStarWarsButton } = require("../Services/Community/starWarsDiscordMinigamesService") as typeof import("../Services/Community/starWarsDiscordMinigamesService");

function match(interaction?) {
  const id = String(interaction?.customId || "");
  return id.startsWith("sw_mg:");
}

async function execute(interaction?) {
  return handleStarWarsButton(interaction);
}

export = { name: "starWarsMinigames", order: 78, match, execute };
