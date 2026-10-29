const coordination = require("./chatHubCoordination") as typeof import("./chatHubCoordination");

export = {
  CHAT_HUB_SOURCES: coordination.CHAT_HUB_SOURCES,
  DEFAULT_CROSS_BOT_GAP_MS: coordination.DEFAULT_CROSS_BOT_GAP_MS,
  recordChatHubBotPost: coordination.recordChatHubBotPost,
  extendChatHubQuietForMs: coordination.extendChatHubQuietForMs,
  extendChatHubQuietUntil: coordination.extendChatHubQuietUntil,
  msUntilOtherBotGap: coordination.msUntilOtherBotGap,
  msUntilChatHubAllowsPost: coordination.msUntilChatHubAllowsPost,
  waitForChatHubBotGap: coordination.waitForChatHubBotGap,
  waitForChatHubSlot: coordination.waitForChatHubSlot,
};