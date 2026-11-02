"use strict";

/**
 * Entrypoint scheduler minigame (bootstrap / loop).
 * Core game logic resta in minigameService.
 */
const core = require("./minigameService") as typeof import("./minigameService");

export = {
  bootstrapMinigameScheduler: (...args) => core.bootstrapMinigameScheduler(...args),
  startMinigameLoop: (...args) => core.startMinigameLoop(...args),
  processHalloweenMinigamesShowcaseForce: (...args) =>
    core.processHalloweenMinigamesShowcaseForce(...args),
};
