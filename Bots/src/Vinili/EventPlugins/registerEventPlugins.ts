/**
 * Contratto plugin eventi (Hogwarts / Halloween / Star Wars).
 * Pack codice: archivio/{halloween|starwars|hogwarts}/src/Vinili/…
 * Qui restano shim + register; il core Vinili avvia solo da questo entrypoint.
 *
 * Riattivare stagione:
 * - halloweenRuntime.disabled = false (o halloweenEvent.enabled + finestra live)
 * - starWarsRuntime.disabled = false (o starWarsEvent.enabled + live)
 * - hogwartsRuntime.disabled = false (+ moduli già in archivio/hogwarts)
 */
"use strict";

function registerEventPlugins(client?) {
  const results: Record<string, any> = {};
  try {
    const { registerHalloweenPlugin } = require("./halloween/register") as typeof import("./halloween/register");
    results.halloween = registerHalloweenPlugin(client);
  } catch (err) {
    global.logger?.warn?.("[EventPlugins] halloween:", err?.message || err);
    results.halloween = { ok: false, error: String(err?.message || err) };
  }
  try {
    const { registerStarWarsPlugin } = require("./starwars/register") as typeof import("./starwars/register");
    results.starwars = registerStarWarsPlugin(client);
  } catch (err) {
    global.logger?.warn?.("[EventPlugins] starwars:", err?.message || err);
    results.starwars = { ok: false, error: String(err?.message || err) };
  }
  try {
    const { registerHogwartsPlugin } = require("./hogwarts/register") as typeof import("./hogwarts/register");
    results.hogwarts = registerHogwartsPlugin(client);
  } catch (err) {
    global.logger?.warn?.("[EventPlugins] hogwarts:", err?.message || err);
    results.hogwarts = { ok: false, error: String(err?.message || err) };
  }
  return results;
}

export = { registerEventPlugins };
