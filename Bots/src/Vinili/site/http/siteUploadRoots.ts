/**
 * Root upload sito (questo file sta in bots-ts/src/Vinili/Web).
 * Prima si guarda il vecchio `/opt/bot/Data/uploads/...` (bacheche, contest, suggerimenti, compiti),
 * poi `Vinili/Data/uploads/...`, dove si creano le cartelle nuove.
 */
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");

function resolveSiteUploadRoot(subdir: string, fromDirname = __dirname) {
  const name = String(subdir || "").replace(/^\/+|\/+$/g, "");
  const linked = path.resolve(fromDirname, "../Data/uploads", name);
  const legacyBot = path.resolve(fromDirname, "../../../../Data/uploads", name);

  for (const candidate of [legacyBot, linked]) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (_) {}
  }
  /* default: Vinili/Data (symlink runtime) — crea cartella al primo upload */
  try {
    fs.mkdirSync(linked, { recursive: true });
  } catch (_) {}
  return linked;
}

export = { resolveSiteUploadRoot };
