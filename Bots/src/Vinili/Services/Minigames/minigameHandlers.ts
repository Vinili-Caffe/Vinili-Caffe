/** Minigiochi: stale/close, messaggi (guess) e facade verso interaction handlers. */
const stale = require("./minigameHandlersStale") as typeof import("./minigameHandlersStale");
const message = require("./minigameHandlersMessage") as typeof import("./minigameHandlersMessage");
const {
  handleMinigameReaction,
  handleMinigameButton,
  isMinigameFloodExemptChannel,
  handleMinigameVoiceState,
} = require("./minigameInteractionHandlers") as typeof import("./minigameInteractionHandlers");

export = {
  isStaleOrInvalidActiveGame: stale.isStaleOrInvalidActiveGame,
  closeStaleActiveMinigameChannel: stale.closeStaleActiveMinigameChannel,
  handleMinigameReaction,
  handleMinigameMessage: message.handleMinigameMessage,
  handleMinigameButton,
  isMinigameFloodExemptChannel,
  handleMinigameVoiceState,
};
