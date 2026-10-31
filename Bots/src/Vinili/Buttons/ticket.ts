const { isHandledTicketInteraction } = require("../Utils/Ticket/ticketInteractionRuntime") as typeof import("../Utils/Ticket/ticketInteractionRuntime");
const { replyWorkflowMovedToSite } = require("../Web/discordWorkflowUiGate") as typeof import("../Web/discordWorkflowUiGate");

function match(interaction?) {
  const { isTicketButton, isTicketSelect, isTicketModal, isTicketUserSelect } = isHandledTicketInteraction(interaction);
  return isTicketButton || isTicketSelect || isTicketModal || isTicketUserSelect;
}

async function execute(interaction?) {
  return replyWorkflowMovedToSite(interaction, "tickets");
}

export = { name: "ticket", order: 10, match, execute };
