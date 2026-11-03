const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { getCentralChannel } = require("../interactionCreateCommandLogging") as typeof import("../interactionCreateCommandLogging");
const { createInteractionErrorLogger } = require("../../../../shared/discord/createInteractionErrorLogger") as typeof import("../../../../shared/discord/createInteractionErrorLogger");

const { logInteractionError } = createInteractionErrorLogger({
  resolveErrorChannelId: () => IDs.channels.errorLogChannel || IDs.channels.serverBotLogs || null,
  getCentralChannel,
  userErrorPayload: {
    content: "<a:VC_Alert:1482706673176150077> C'è stato un errore nell'esecuzione del comando.",
  },
});

export = { logInteractionError };
