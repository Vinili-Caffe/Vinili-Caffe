/**
 * Plugin Hogwarts — archivio only (non caricato a boot).
 * Riattiva: ripristina questo file in src/Vinili/EventPlugins/hogwarts
 * + registerEventPlugins + hogwartsRuntime.disabled = false.
 */
"use strict";

const path = require("path") as typeof import("path");

function resolveHogwartsKillSwitch() {
  const candidates = [
    path.resolve(__dirname, "../../../../archivio/hogwarts/src/Vinili/Utils/Web/hogwartsRuntimeKillSwitch"),
    path.resolve(__dirname, "../../../../archivio/hogwarts/src/Vinili/Utils/Web/hogwartsRuntimeKillSwitch.ts"),
  ];
  for (const p of candidates) {
    try {
      return require(p);
    } catch (_) {}
  }
  return null;
}

function isHogwartsRuntimeDisabled(client?) {
  const mod = resolveHogwartsKillSwitch();
  if (mod?.isHogwartsRuntimeDisabled) return Boolean(mod.isHogwartsRuntimeDisabled(client));
  try {
    const raw = client?.config?.hogwartsRuntime;
    if (raw && typeof raw === "object" && raw.disabled === false) return false;
  } catch (_) {}
  return true;
}

function registerHogwartsPlugin(client?) {
  if (isHogwartsRuntimeDisabled(client)) {
    return { ok: true, enabled: false };
  }
  global.logger?.warn?.(
    "[EventPlugin:hogwarts] enabled in config but pack is archive-only; restore modules from archivio/hogwarts before full live use",
  );
  return { ok: true, enabled: true, archiveOnly: true };
}

export = { registerHogwartsPlugin, isHogwartsRuntimeDisabled };
