/** Antinuke: controllo di creazione e cancellazione di ruoli e canali, espulsioni e ban. */
const { KICK_BAN_TRACKER, handleKickBanAction } = require("./antiNukeKickBanAction") as typeof import("./antiNukeKickBanAction");
const { ROLE_CREATION_TRACKER, handleRoleCreationAction } = require("./antiNukeRoleCreationAction") as typeof import("./antiNukeRoleCreationAction");
const { ROLE_DELETION_TRACKER, handleRoleDeletionAction } = require("./antiNukeRoleDeletionAction") as typeof import("./antiNukeRoleDeletionAction");
const { CHANNEL_CREATION_TRACKER, handleChannelCreationAction } = require("./antiNukeChannelCreationAction") as typeof import("./antiNukeChannelCreationAction");
const { CHANNEL_DELETION_TRACKER, handleChannelDeletionAction } = require("./antiNukeChannelDeletionAction") as typeof import("./antiNukeChannelDeletionAction");
const { COMMAND_LOCK_CACHE, enableAntiNukePanic } = require("./antiNukePanicEnable") as typeof import("./antiNukePanicEnable");
const {
  percentToHeat,
  normalizeExecutorId,
  cleanupTrackerMap,
  isPanicExecutorCooldownActive,
  touchPanicExecutorCooldown,
  shouldSkipDuplicatedActionEvent,
  getTrackerExecutorId,
  applyBurstPanicGuard,
} = require("./antiNukeRoleChannelGuards") as typeof import("./antiNukeRoleChannelGuards");

export = { KICK_BAN_TRACKER, ROLE_CREATION_TRACKER, ROLE_DELETION_TRACKER, CHANNEL_CREATION_TRACKER, CHANNEL_DELETION_TRACKER, COMMAND_LOCK_CACHE, percentToHeat, normalizeExecutorId, enableAntiNukePanic, cleanupTrackerMap, isPanicExecutorCooldownActive, touchPanicExecutorCooldown, shouldSkipDuplicatedActionEvent, getTrackerExecutorId, applyBurstPanicGuard, handleKickBanAction, handleRoleCreationAction, handleRoleDeletionAction, handleChannelCreationAction, handleChannelDeletionAction };
