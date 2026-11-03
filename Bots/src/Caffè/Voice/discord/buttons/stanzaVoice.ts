const { handleStanzaButton } = require("../../services/stanzaVoiceRoomsService") as typeof import("../../services/stanzaVoiceRoomsService");

function match(interaction?) {
  return Boolean(interaction?.isButton?.() && String(interaction.customId || "").startsWith("stanza_"));
}

async function execute(interaction?) {
  const handled = await handleStanzaButton(interaction);
  return handled === true;
}

export = {
  name: "stanzaVoice",
  order: 12,
  match,
  execute,
};