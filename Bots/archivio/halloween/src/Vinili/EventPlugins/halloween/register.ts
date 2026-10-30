/**
 * Plugin Halloween — entrypoint unico per scheduler Discord.
 * Codice feature resta sotto Services/Utils (stesso pack logico); core chiama solo register.
 */
"use strict";

const { isHalloweenRuntimeDisabled } = require("./runtimeKillSwitch") as typeof import("./runtimeKillSwitch");

function registerHalloweenPlugin(client?) {
  if (isHalloweenRuntimeDisabled(client)) {
    global.logger?.info?.("[EventPlugin:halloween] disabled — skip loops");
    return { ok: true, enabled: false };
  }
  try {
    const { startHalloweenEmojiHuntLoop } = require("../../Services/Community/halloweenEmojiHuntService") as typeof import("../../Services/Community/halloweenEmojiHuntService");
    startHalloweenEmojiHuntLoop(client);
  } catch (err) {
    global.logger?.warn?.("[EventPlugin:halloween] emoji hunt:", err?.message || err);
  }
  try {
    const { startHalloweenReactLeaderboardLoop } = require("../../Services/Community/halloweenReactLeaderboardService") as typeof import("../../Services/Community/halloweenReactLeaderboardService");
    startHalloweenReactLeaderboardLoop(client);
  } catch (err) {
    global.logger?.warn?.("[EventPlugin:halloween] react LB:", err?.message || err);
  }
  global.logger?.info?.("[EventPlugin:halloween] registered");
  return { ok: true, enabled: true };
}

export = { registerHalloweenPlugin, isHalloweenRuntimeDisabled };
