const { handleCandidatureApplicationInteraction } = require("../Events/interaction/candidatureApplicationHandlers");
const {
  isDiscordWorkflowUiEnabled,
  replyWorkflowMovedToSite,
} = require("../Utils/Web/discordWorkflowUiGate");
const APPLY_PREFIXES = ["apply_helper", "apply_partnermanager", "apply_start", "apply_back", "apply_page", "apply_form", "apply_pex"];

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (!id) return false;
  if (APPLY_PREFIXES.some((p) => id === p || id.startsWith(p + ":"))) return true;
  if (id.startsWith("apply_")) return true;
  return false;
}

async function execute(interaction) {
  if (!isDiscordWorkflowUiEnabled()) {
    const id = String(interaction?.customId || "");
    const kind =
      id.startsWith("apply_pex") || id.startsWith("apply_reject") ? "candidatureInbox" : "candidature";
    return replyWorkflowMovedToSite(interaction, kind);
  }
  return await handleCandidatureApplicationInteraction(interaction);
}

module.exports = { name: "candidature", order: 20, match, execute };