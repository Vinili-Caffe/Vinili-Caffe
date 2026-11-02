/** Facade webhook HTTP: stessa API pubblica, implementazione nei moduli fratelli. */
const {
  startWebhookServer,
  shouldStartBotHttpServer,
  isCandidatureWebsiteApiEnabled,
} = require("./webhookServerBootstrap") as typeof import("./webhookServerBootstrap");
const {
  extractTopggVoteDiscordUserId,
  isTopggWebhookAuthorized,
} = require("./topggVoteWebhook") as typeof import("./topggVoteWebhook");

export = {
  startWebhookServer,
  shouldStartBotHttpServer,
  isCandidatureWebsiteApiEnabled,
  extractTopggVoteDiscordUserId,
  isTopggWebhookAuthorized,
};
