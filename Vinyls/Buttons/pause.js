const {
  handlePauseButton,
  handlePauseRequestOpen,
  handlePauseRequestModal,
  handlePauseRolePickForPending,
} = require("../Events/interaction/pauseHandlers");
const { PAUSE_REQUEST_OPEN_ID } = require("../Utils/Pause/pauseStickyPanelRuntime");
const { PAUSE_ROLE_PICK_PREFIX } = require("../Utils/Pause/pauseRequestSubmitRuntime");

const PREFIXES = ["pause_accept:", "pause_reject:", "pause_cancel:", "pause_list:", "pause_list_month:"];
const PAUSE_REQUEST_MODAL_ID = "pause_request:modal";

function match(interaction) {
  if (interaction?.isModalSubmit?.() && interaction.customId === PAUSE_REQUEST_MODAL_ID) return true;
  if (!interaction?.isButton?.()) return false;
  const id = String(interaction.customId || "");
  if (id === PAUSE_REQUEST_OPEN_ID) return true;
  if (id.startsWith(PAUSE_ROLE_PICK_PREFIX)) return true;
  return PREFIXES.some((p) => id.startsWith(p));
}

async function execute(interaction) {
  if (await handlePauseRequestModal(interaction)) return;
  if (await handlePauseRequestOpen(interaction)) return;
  if (await handlePauseRolePickForPending(interaction)) return;
  return await handlePauseButton(interaction);
}

module.exports = { name: "pause", order: 60, match, execute };