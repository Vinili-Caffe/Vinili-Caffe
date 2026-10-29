const { handleResocontoActionInteraction } = require("../Events/interaction/resocontoHandlers") as typeof import("../Events/interaction/resocontoHandlers");
const {
  isDiscordWorkflowUiEnabled,
  replyWorkflowMovedToSite,
} = require("../Utils/Web/discordWorkflowUiGate") as typeof import("../Utils/Web/discordWorkflowUiGate");

function match(interaction?) {
  const id = String(interaction?.customId || "");
  if (
    interaction?.isButton?.() &&
    (id.startsWith("resoconto_apply:") || id.startsWith("resoconto_reject:") || id.startsWith("resoconto_override:"))
  ) return true;
  if (interaction?.isModalSubmit?.() && id.startsWith("resoconto_reason:")) return true;
  return false;
}

async function execute(interaction?) {
  if (!isDiscordWorkflowUiEnabled()) {
    return replyWorkflowMovedToSite(interaction, "resocontiInbox");
  }
  return await handleResocontoActionInteraction(interaction);
}

export = { name: "resoconto", order: 70, match, execute };