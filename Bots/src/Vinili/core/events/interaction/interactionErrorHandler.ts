const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { getCentralChannel } = require("../interactionCreateCommandLogging") as typeof import("../interactionCreateCommandLogging");
const { createInteractionErrorLogger } = require("../../../../shared/discord/createInteractionErrorLogger") as typeof import("../../../../shared/discord/createInteractionErrorLogger");

const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const { logInteractionError } = createInteractionErrorLogger({
  resolveErrorChannelId: () => IDs.channels.errorLogChannel || IDs.channels.serverBotLogs || null,
  getCentralChannel,
  userErrorPayload: {
    content: `${E.VC_Alert} C'è stato un errore nell'esecuzione del comando.`,
  },
});

export = { logInteractionError };
