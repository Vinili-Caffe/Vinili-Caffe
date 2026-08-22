// Stanze gestite solo da Caffè — non claimare i button stanza_* su Vinili.
function match() {
  return false;
}

async function execute() {
  return false;
}

module.exports = {
  name: "stanzaVoice",
  order: 12,
  match,
  execute,
};