/**
 * Kill-switch runtime Halloween (plugin evento).
 * Default: attivo se halloweenEvent.enabled (stagione), altrimenti off.
 * Override hard: halloweenRuntime.disabled === true → sempre off;
 * halloweenRuntime.disabled === false → forza on (anche fuori calendario).
 */
"use strict";

const { resolveHalloweenEventConfig, isHalloweenEventLive } = require("../../Utils/Eventi/halloweenEventConfig") as typeof import("../../Utils/Eventi/halloweenEventConfig");

function readRuntimeOverride(client?) {
  try {
    const raw = client?.config?.halloweenRuntime;
    if (raw && typeof raw === "object") {
      if (raw.disabled === true) return "force_off";
      if (raw.disabled === false) return "force_on";
    }
  } catch (_) {}
  return null;
}

function isHalloweenRuntimeDisabled(client?) {
  const override = readRuntimeOverride(client);
  if (override === "force_off") return true;
  if (override === "force_on") return false;
  try {
    const cfg = resolveHalloweenEventConfig(client);
    if (!cfg.enabled) return true;
    return !isHalloweenEventLive(client);
  } catch (_) {
    return true;
  }
}

export = { isHalloweenRuntimeDisabled };
