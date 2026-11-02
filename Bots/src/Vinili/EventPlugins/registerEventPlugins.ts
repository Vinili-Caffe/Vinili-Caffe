/**
 * Contratto plugin eventi (Star Wars).
 * Halloween 2026 + Hogwarts: archiviati in Bots/archivio/{halloween|hogwarts} — non caricati a boot.
 * Pack: archivio/{starwars|halloween|hogwarts}/src/Vinili/…
 *
 * Riattivare stagione (solo se ripristini wiring da archivio):
 * - starWarsRuntime.disabled = false
 */
"use strict";

function registerEventPlugins(client?) {
  const results: Record<string, any> = {
    halloween: { ok: true, archived: true, skipped: true },
    hogwarts: { ok: true, archived: true, skipped: true },
  };
  try {
    const { registerStarWarsPlugin } = require("./starwars/register") as typeof import("./starwars/register");
    results.starwars = registerStarWarsPlugin(client);
  } catch (err) {
    global.logger?.warn?.("[EventPlugins] starwars:", err?.message || err);
    results.starwars = { ok: false, error: String(err?.message || err) };
  }
  return results;
}

export = { registerEventPlugins };
