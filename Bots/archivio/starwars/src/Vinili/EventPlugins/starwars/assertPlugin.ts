"use strict";

const { isStarWarsRuntimeDisabled } = require("./runtimeKillSwitch") as typeof import("./runtimeKillSwitch");

async function assertStarWarsPluginOrReply(message?) {
  if (!isStarWarsRuntimeDisabled(message?.client)) return true;
  try {
    await message?.reply?.("L'evento Star Wars non è attivo.").catch(() => null);
  } catch (_) {}
  return false;
}

export = { assertStarWarsPluginOrReply, isStarWarsRuntimeDisabled };
