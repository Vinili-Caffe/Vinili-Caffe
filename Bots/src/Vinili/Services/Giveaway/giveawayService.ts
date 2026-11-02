/** Facade giveaway: UI + partecipazione + lifecycle. */
const {
  GIVEAWAY_ENTER_PREFIX,
  GIVEAWAY_LEAVE_PREFIX,
  GIVEAWAY_COUNT_PREFIX,
  GIVEAWAY_REROLL_PREFIX,
  parseDuration,
  buildGiveawayEmbed,
  buildEnterButton,
} = require("./giveawayUi") as typeof import("./giveawayUi");
const {
  enterGiveaway,
  leaveGiveaway,
  showGiveawayJoinCount,
} = require("./giveawayParticipation") as typeof import("./giveawayParticipation");
const {
  createGiveaway,
  setGiveawayMessageId,
  endGiveawayByMessageId,
  editGiveawayByMessageId,
  deleteGiveawayByMessageId,
  rerollGiveaway,
  rerollGiveawayByMessageId,
  runScheduledEnds,
  scheduleGiveawayEnd,
  scheduleActiveGiveawayEnds,
  syncActiveGiveawayButtons,
} = require("./giveawayLifecycle") as typeof import("./giveawayLifecycle");

export = {
  GIVEAWAY_ENTER_PREFIX,
  GIVEAWAY_LEAVE_PREFIX,
  GIVEAWAY_COUNT_PREFIX,
  GIVEAWAY_REROLL_PREFIX,
  parseDuration,
  buildGiveawayEmbed,
  buildEnterButton,
  createGiveaway,
  setGiveawayMessageId,
  enterGiveaway,
  leaveGiveaway,
  showGiveawayJoinCount,
  endGiveawayByMessageId,
  editGiveawayByMessageId,
  deleteGiveawayByMessageId,
  rerollGiveaway,
  rerollGiveawayByMessageId,
  runScheduledEnds,
  scheduleGiveawayEnd,
  scheduleActiveGiveawayEnds,
  syncActiveGiveawayButtons,
};
