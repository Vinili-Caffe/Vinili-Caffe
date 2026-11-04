const coordination = require("./chatHubCoordination") as typeof import("./chatHubCoordination");

export = {
  CHAT_HUB_SOURCES: coordination.CHAT_HUB_SOURCES,
  CHAT_HUB_KINDS: coordination.CHAT_HUB_KINDS,
  DEFAULT_CROSS_BOT_GAP_MS: coordination.DEFAULT_CROSS_BOT_GAP_MS,
  DEFAULT_SAME_BOT_GAP_MS: coordination.DEFAULT_SAME_BOT_GAP_MS,
  DEFAULT_AFTER_MINIGAME_GAP_MS: coordination.DEFAULT_AFTER_MINIGAME_GAP_MS,
  recordChatHubBotPost: coordination.recordChatHubBotPost,
  noteChatHubKindAt: coordination.noteChatHubKindAt,
  extendChatHubQuietForMs: coordination.extendChatHubQuietForMs,
  extendChatHubQuietUntil: coordination.extendChatHubQuietUntil,
  msUntilOtherBotGap: coordination.msUntilOtherBotGap,
  msUntilChatHubAllowsPost: coordination.msUntilChatHubAllowsPost,
  waitForChatHubSlot: coordination.waitForChatHubSlot,
  claimChatHubSlot: coordination.claimChatHubSlot,
};
