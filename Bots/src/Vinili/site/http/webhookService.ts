/** Facade webhook HTTP: stessa API pubblica, implementazione nei moduli fratelli. */
const {
  startWebhookServer,
  startGatewayHealthOnlyHttp,
  shouldStartBotHttpServer,
  isCandidatureWebsiteApiEnabled,
} = require("./webhookServerBootstrap") as typeof import("./webhookServerBootstrap");
const {
  extractTopggVoteDiscordUserId,
  isTopggWebhookAuthorized,
} = require("./topggVoteWebhook") as typeof import("./topggVoteWebhook");

export = {
  startWebhookServer,
  startGatewayHealthOnlyHttp,
  shouldStartBotHttpServer,
  isCandidatureWebsiteApiEnabled,
  extractTopggVoteDiscordUserId,
  isTopggWebhookAuthorized,
};
