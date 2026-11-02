/** Minigiochi: ciclo di un round (salvataggio, indizi, tempo scaduto, vittorie perse durante un riavvio, vittoria). */
const start = require("./minigameRoundStart") as typeof import("./minigameRoundStart");
const advance = require("./minigameRoundAdvance") as typeof import("./minigameRoundAdvance");
const end = require("./minigameRoundEnd") as typeof import("./minigameRoundEnd");
const scoring = require("./minigameRoundScoring") as typeof import("./minigameRoundScoring");

export = {
  resolveMinigameGuildIdAsync: start.resolveMinigameGuildIdAsync,
  markSent: start.markSent,
  TOT_STATE_SUFFIX: start.TOT_STATE_SUFFIX,
  saveActiveGame: start.saveActiveGame,
  purgeExpiredMinigameDbState: end.purgeExpiredMinigameDbState,
  parseStateTarget: end.parseStateTarget,
  shouldRevealHangmanSolutionOnBoard: advance.shouldRevealHangmanSolutionOnBoard,
  updateHangmanBoardMessage: advance.updateHangmanBoardMessage,
  buildMinigameTimeoutEmbedForGame: end.buildMinigameTimeoutEmbedForGame,
  buildGameSnapshotFromPersistedState: end.buildGameSnapshotFromPersistedState,
  deleteFindMinigameRemoteMessage: end.deleteFindMinigameRemoteMessage,
  closeExpiredMinigameState: end.closeExpiredMinigameState,
  scheduleMinigameRoundTimeout: end.scheduleMinigameRoundTimeout,
  sendMinigameTimeoutAndClose: end.sendMinigameTimeoutAndClose,
  scheduleMinuteHint: advance.scheduleMinuteHint,
  scheduleGenericHint: advance.scheduleGenericHint,
  findBotVoiceSessionByGuild: end.findBotVoiceSessionByGuild,
  leaveFindBotVoiceChannel: end.leaveFindBotVoiceChannel,
  catchUpMemoryEmojiWinFromHistory: scoring.catchUpMemoryEmojiWinFromHistory,
  handleMinigameWin: scoring.handleMinigameWin,
};
