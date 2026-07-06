const {
  REPOST_BTN_PREFIX,
  REPOST_SRC_PREFIX,
  handleRepostaButton,
} = require("../Services/Community/repostService");

function match(interaction) {
  const id = String(interaction?.customId || "");
  return (
    interaction?.isButton?.() &&
    (id.startsWith(REPOST_BTN_PREFIX) || id.startsWith(REPOST_SRC_PREFIX))
  );
}

async function execute(interaction) {
  await handleRepostaButton(interaction);
}

module.exports = { name: "repost", order: 48, match, execute };