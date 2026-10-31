const { replyWorkflowMovedToSite } = require("../Web/discordWorkflowUiGate") as typeof import("../Web/discordWorkflowUiGate");

const ACC_PREFIX = "website_unban_acc";
const REJ_PREFIX = "website_unban_rej";

function match(interaction?) {
  const id = String(interaction?.customId || "");
  return id.startsWith(`${ACC_PREFIX}:`) || id.startsWith(`${REJ_PREFIX}:`);
}

async function execute(interaction?) {
  return replyWorkflowMovedToSite(interaction, "appelliInbox");
}

export = { name: "websiteUnbanSite", order: 25, match, execute };
