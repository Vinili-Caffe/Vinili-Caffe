const {
  handlePauseButton,
  handlePauseRequestOpen,
  handlePauseRequestModal,
  handlePauseRolePickForPending,
} = require("../Events/interaction/pauseHandlers") as typeof import("../Events/interaction/pauseHandlers");
const { PAUSE_REQUEST_OPEN_ID } = require("../Utils/Pause/pauseStickyPanelRuntime") as typeof import("../Utils/Pause/pauseStickyPanelRuntime");
const { PAUSE_ROLE_PICK_PREFIX } = require("../Utils/Pause/pauseRequestSubmitRuntime") as typeof import("../Utils/Pause/pauseRequestSubmitRuntime");
const {
  isDiscordWorkflowUiEnabled,
  replyWorkflowMovedToSite,
} = require("../Utils/Web/discordWorkflowUiGate") as typeof import("../Utils/Web/discordWorkflowUiGate");

const PREFIXES = ["pause_accept:", "pause_reject:", "pause_cancel:", "pause_list:", "pause_list_month:"];
const PAUSE_REQUEST_MODAL_ID = "pause_request:modal";

function match(interaction?) {
  if (interaction?.isModalSubmit?.() && interaction.customId === PAUSE_REQUEST_MODAL_ID) return true;
  if (!interaction?.isButton?.()) return false;
  const id = String(interaction.customId || "");
  if (id === PAUSE_REQUEST_OPEN_ID) return true;
  if (id.startsWith(PAUSE_ROLE_PICK_PREFIX)) return true;
  return PREFIXES.some((p?) => id.startsWith(p));
}

async function execute(interaction?) {
  if (!isDiscordWorkflowUiEnabled()) {
    const id = String(interaction?.customId || "");
    const kind = id.startsWith("pause_list") ? "pause" : id.includes("accept") || id.includes("reject") || id.includes("cancel") ? "pauseInbox" : "pause";
    return replyWorkflowMovedToSite(interaction, kind);
  }
  if (await handlePauseRequestModal(interaction)) return;
  if (await handlePauseRequestOpen(interaction)) return;
  if (await handlePauseRolePickForPending(interaction)) return;
  return await handlePauseButton(interaction);
}

export = { name: "pause", order: 60, match, execute };