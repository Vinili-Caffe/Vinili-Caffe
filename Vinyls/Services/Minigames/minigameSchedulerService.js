"use strict";

/**
 * Entrypoint scheduler minigame (bootstrap / loop).
 * Core game logic resta in minigameService; showcase halloween estratto a parte.
 */
const core = require("./minigameService");
const halloween = require("./minigameHalloweenShowcaseService");

module.exports = {
  bootstrapMinigameScheduler: (...args) => core.bootstrapMinigameScheduler(...args),
  startMinigameLoop: (...args) => core.startMinigameLoop(...args),
  processHalloweenMinigamesShowcaseForce: (...args) =>
    halloween.processHalloweenMinigamesShowcaseForce(...args),
};
