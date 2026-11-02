const {
  REPOST_BTN_PREFIX,
  REPOST_SRC_PREFIX,
  REPOST_REMOVE_PREFIX,
  handleRepostaButton,
  handleRepostRemoveButton,
  isRepostRemoveButton,
} = require("../../Services/Community/repostService") as typeof import("../../Services/Community/repostService");

function match(interaction?) {
  const id = String(interaction?.customId || "");
  return (
    interaction?.isButton?.() &&
    (id.startsWith(REPOST_BTN_PREFIX) ||
      id.startsWith(REPOST_SRC_PREFIX) ||
      id.startsWith(REPOST_REMOVE_PREFIX) ||
      isRepostRemoveButton(id))
  );
}

async function execute(interaction?) {
  if (isRepostRemoveButton(interaction.customId)) {
    await handleRepostRemoveButton(interaction);
    return true;
  }
  await handleRepostaButton(interaction);
  return true;
}

export = { name: "repost", order: 48, match, execute };
