const { handleSpellListHuntButton } = require("../Services/Community/hogwartsSpellListHuntService");
const { resolveHogwartsEventConfig, isEventWindowOpen } = require("../Utils/Web/hogwartsSortingConfig");

function match(interaction) {
  const id = String(interaction?.customId || "");
  return interaction?.isButton?.() && id.startsWith("hogwarts_spell_list:");
}

async function execute(interaction, client) {
  const eventCfg = resolveHogwartsEventConfig(client);
  if (!isEventWindowOpen(eventCfg)?.open) {
    await interaction.reply({ content: "Evento Hogwarts concluso.", flags: 64 }).catch(() => null);
    return true;
  }
  return handleSpellListHuntButton(interaction, client);
}

module.exports = { name: "hogwartsSpellListHunt", order: 72, match, execute };