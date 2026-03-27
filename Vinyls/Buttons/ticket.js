const { isHandledTicketInteraction } = require("../Utils/Ticket/ticketInteractionRuntime");
const { handleTicketInteraction } = require("../Events/interaction/ticketHandlers");

function match(interaction) {
  const { isTicketButton, isTicketSelect, isTicketModal, isTicketUserSelect } = isHandledTicketInteraction(interaction);
  return isTicketButton || isTicketSelect || isTicketModal || isTicketUserSelect;
}

async function execute(interaction) {
  return await handleTicketInteraction(interaction);
}

module.exports = { name: "ticket", order: 10, match, execute };