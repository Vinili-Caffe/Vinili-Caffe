const { handleStanzaButton } = require("../Services/Voice/stanzaVoiceRoomsService");

function match(interaction) {
  return Boolean(interaction?.isButton?.() && String(interaction.customId || "").startsWith("stanza_"));
}

async function execute(interaction) {
  const handled = await handleStanzaButton(interaction);
  return handled === true;
}

module.exports = {
  name: "stanzaVoice",
  order: 12,
  match,
  execute,
};