/**
 * Plugin Star Wars — entrypoint unico per minigiochi Discord auto-spawn.
 * Prefix SW restano caricati ma gated a runtime (kill-switch + starWarsRuntimeGate).
 */
"use strict";

const { isStarWarsRuntimeDisabled } = require("./runtimeKillSwitch") as typeof import("./runtimeKillSwitch");

function registerStarWarsPlugin(client?) {
  if (isStarWarsRuntimeDisabled(client)) {
    return { ok: true, enabled: false };
  }
  try {
    const { startStarWarsMinigamesLoop } = require("../../Services/Community/starWarsDiscordMinigamesService") as typeof import("../../Services/Community/starWarsDiscordMinigamesService");
    startStarWarsMinigamesLoop(client);
  } catch (err) {
    global.logger?.warn?.("[EventPlugin:starwars] minigames loop:", err?.message || err);
  }
  try {
    const { startStarWarsQuizMalusLoop } = require("../../Services/Community/starWarsQuizMalusService") as typeof import("../../Services/Community/starWarsQuizMalusService");
    startStarWarsQuizMalusLoop(client);
  } catch (err) {
    global.logger?.warn?.("[EventPlugin:starwars] quiz malus loop:", err?.message || err);
  }
  global.logger?.info?.("[EventPlugin:starwars] registered");
  return { ok: true, enabled: true };
}

export = { registerStarWarsPlugin, isStarWarsRuntimeDisabled };
