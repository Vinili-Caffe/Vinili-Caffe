const path = require("path") as typeof import("path");
const { listJsFilesRecursive } = require("../../shared/runtime/fsRuntime") as typeof import("../../shared/runtime/fsRuntime");

const IDS_SUBFOLDER = path.sep + "ids" + path.sep;

const REMOVED_BUTTON_HANDLER_NAMES = new Set([
  // balGui / incomeClaimGui: gated by serverEconomy.enabled at runtime
  "blackjackGui",
  "coinflipGui",
  "duelGui",
  "robGui",
  "rouletteGui",
  "rpsGui",
  "scratchGui",
  "shopGui",
  "slotsGui",
  "trisGui",
  "classificaToggle",
  "myquoteDelete",
  "myrepostDelete",
  "myclipDelete",
  "myquotePagination",
  "myrepostPagination",
  "myclipPagination",
]);

function isNonHandlerFile(relativeKey?) {
  const rel = String(relativeKey || "").replace(/\\/g, "/");
  const base = path.basename(rel).replace(/\.(cjs|mjs|js|cts|mts|ts)$/i, "");
  if (base === "index" || base === "components" || base.endsWith("Helpers")) return true;
  if (rel === "topChannel/components.ts" || rel === "topChannel/components.js") return true;
  return false;
}

export = (client?) => {
  client.buttonHandlers = client.buttonHandlers || [];

  client.loadButtonHandlers = async (basePath?) => {
    const dir = basePath || path.resolve(__dirname, "..", "Buttons");
    const allPaths = listJsFilesRecursive(dir)
      .filter((fullPath?) => !fullPath.includes(IDS_SUBFOLDER))
      .filter((fullPath?) => !isNonHandlerFile(path.relative(dir, fullPath)));
    const loaded = [];

    for (const fullPath of allPaths) {
      const key = path.relative(dir, fullPath);
      try {
        delete require.cache[require.resolve(fullPath)];
        const mod = require(fullPath);
        if (!mod || typeof mod.match !== "function" || typeof mod.execute !== "function") {
          global.logger?.warn?.(`[BUTTON_HANDLERS] ${key}: missing match/execute, skipped.`);
          continue;
        }
        const name = mod.name || path.basename(fullPath).replace(/\.(cjs|mjs|js|cts|mts|ts)$/i, "");
        if (REMOVED_BUTTON_HANDLER_NAMES.has(String(name).trim())) {
          continue;
        }
        loaded.push({
          name,
          order: typeof mod.order === "number" ? mod.order : 100,
          match: mod.match,
          execute: mod.execute,
        });
      } catch (err) {
        global.logger?.error?.(`[BUTTON_HANDLERS] Failed to load ${key}:`, err);
      }
    }

    loaded.sort((a?, b?) => a.order - b.order || String(a.name).localeCompare(String(b.name)));
    client.buttonHandlers = loaded;
    global.logger?.info?.(`[BUTTON_HANDLERS] Loaded ${client.buttonHandlers.length} button handlers.`);
    return client.buttonHandlers;
  };
};