const { handleMinigameButton } = require("../../services/minigameService") as typeof import("../../services/minigameService");

async function execute(interaction?, client?) {
  return await handleMinigameButton(interaction, client);
}

function match(interaction?) {
  const id = String(interaction?.customId || "");
  return id.startsWith("minigame_");
}

export = { name: "minigame", order: 80, match, execute };
