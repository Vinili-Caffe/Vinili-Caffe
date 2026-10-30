/**
 * Kill-switch runtime Star Wars (plugin evento).
 * Default: off finché starWarsEvent.enabled / public window non aprono il pack.
 * Override: starWarsRuntime.disabled === false → forza on; === true → sempre off.
 */
"use strict";

const { resolveStarWarsEventConfig, isStarWarsEventLive, isStarWarsPublicWindowOpen } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");

function readRuntimeOverride(client?) {
  try {
    const raw = client?.config?.starWarsRuntime;
    if (raw && typeof raw === "object") {
      if (raw.disabled === true) return "force_off";
      if (raw.disabled === false) return "force_on";
    }
  } catch (_) {}
  return null;
}

function isStarWarsRuntimeDisabled(client?) {
  const override = readRuntimeOverride(client);
  if (override === "force_off") return true;
  if (override === "force_on") return false;
  try {
    const cfg = resolveStarWarsEventConfig(client);
    if (!cfg.enabled) return true;
    if (typeof isStarWarsEventLive === "function" && isStarWarsEventLive(client)) return false;
    if (typeof isStarWarsPublicWindowOpen === "function" && isStarWarsPublicWindowOpen(client)) return false;
    return true;
  } catch (_) {
    return true;
  }
}

export = { isStarWarsRuntimeDisabled };
