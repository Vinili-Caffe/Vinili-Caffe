"use strict";

/**
 * Entrypoint dedicato recovery boost (ready / messageCreate native).
 * Implementazione in guildMemberUpdateService (stesso modulo dell'event).
 */
const gmu = require("./guildMemberUpdateService") as typeof import("./guildMemberUpdateService");

export = {
  channelIdIsBoostNativeRecoveryTarget: gmu.channelIdIsBoostNativeRecoveryTarget,
  handleNativeBoostSystemMessage: gmu.handleNativeBoostSystemMessage,
  recoverMissingBoostEmbedsForUser: gmu.recoverMissingBoostEmbedsForUser,
  recoverConcurrentNativeBoosts: gmu.recoverConcurrentNativeBoosts,
  recoverLastGlobalNativeBoostEmbedsOnStartup: gmu.recoverLastGlobalNativeBoostEmbedsOnStartup,
  recoverRecentBoostEmbedsOnStartup: gmu.recoverRecentBoostEmbedsOnStartup,
  backfillAnnouncedBoostSlotsFromSupportersHistory: gmu.backfillAnnouncedBoostSlotsFromSupportersHistory,
  reconcileDoubleBoosterRolesOnStartup: gmu.reconcileDoubleBoosterRolesOnStartup,
  recoverMissingSecondBoostEmbedsOnStartup: gmu.recoverMissingSecondBoostEmbedsOnStartup,
  recoverUnannouncedBoostersOnStartup: gmu.recoverUnannouncedBoostersOnStartup,
  countNativeBoostSlotsInRecentMessages: gmu.countNativeBoostSlotsInRecentMessages,
  countRecentBotBoostAnnouncesForUser: gmu.countRecentBotBoostAnnouncesForUser,
};
