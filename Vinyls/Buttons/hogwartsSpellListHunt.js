const { handleSpellListHuntButton } = require("../Services/Community/hogwartsSpellListHuntService");

function match(interaction) {
  const id = String(interaction?.customId || "");
  return interaction?.isButton?.() && id.startsWith("hogwarts_spell_list:");
}

async function execute(interaction, client) {
  return handleSpellListHuntButton(interaction, client);
}

module.exports = { name: "hogwartsSpellListHunt", order: 72, match, execute };