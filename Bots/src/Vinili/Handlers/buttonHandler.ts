const path = require("path") as typeof import("path");
const { listJsFilesRecursive } = require("../../shared/runtime/fsRuntime") as typeof import("../../shared/runtime/fsRuntime");

const IDS_SUBFOLDER = path.sep + "ids" + path.sep;

const REMOVED_BUTTON_HANDLER_NAMES = new Set([
  "balGui",
  "incomeClaimGui",
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
  "colorsCommand",
  "candidature",
  "ticket",
  "websiteUnbanSite",
  "websiteUnmuteSite",
  "resoconto",
  "profile",
]);

function isNonHandlerFile(relativeKey?) {
  const rel = String(relativeKey || "").replace(/\\/g, "/");
  const base = path.basename(rel).replace(/\.(cjs|mjs|js|cts|mts|ts)$/i, "");
  if (base === "index" || base === "components" || base.endsWith("Helpers")) return true;
  if (rel.endsWith("/topChannel/components.ts") || rel.endsWith("/topChannel/components.js")) return true;
  return false;
}

function collectHandlerPaths(dirs?) {
  const out = [];
  for (const dir of dirs || []) {
    if (!dir) continue;
    const abs = path.resolve(dir);
    try {
      const { existsSync } = require("fs") as typeof import("fs");
      if (!existsSync(abs)) continue;
    } catch {
      continue;
    }
    for (const fullPath of listJsFilesRecursive(abs)) {
      if (fullPath.includes(IDS_SUBFOLDER)) continue;
      if (isNonHandlerFile(path.relative(abs, fullPath))) continue;
      out.push({ dir: abs, fullPath });
    }
  }
  return out;
}

export = (client?) => {
  client.buttonHandlers = client.buttonHandlers || [];

  client.loadButtonHandlers = async (basePaths?) => {
    const defaults = [
      path.resolve(__dirname, "..", "Buttons"),
      path.resolve(__dirname, "..", "MultiGuild", "Buttons"),
    ];
    const dirs = Array.isArray(basePaths)
      ? basePaths
      : basePaths
        ? [basePaths, path.resolve(__dirname, "..", "MultiGuild", "Buttons")]
        : defaults;

    const loaded = [];
    for (const { dir, fullPath } of collectHandlerPaths(dirs)) {
      const key = path.relative(dir, fullPath);
      const fileName = path.basename(fullPath).replace(/\.(cjs|mjs|js|cts|mts|ts)$/i, "");
      if (REMOVED_BUTTON_HANDLER_NAMES.has(String(fileName).trim())) continue;
      try {
        delete require.cache[require.resolve(fullPath)];
        const mod = require(fullPath);
        if (!mod || typeof mod.match !== "function" || typeof mod.execute !== "function") {
          global.logger?.warn?.(`[BUTTON_HANDLERS] ${key}: missing match/execute, skipped.`);
          continue;
        }
        const name = mod.name || fileName;
        if (REMOVED_BUTTON_HANDLER_NAMES.has(String(name).trim())) continue;
        loaded.push({
          name,
          order: typeof mod.order === "number" ? mod.order : 100,
          match: mod.match,
          execute: mod.execute,
          source: key.replace(/\\/g, "/"),
        });
      } catch (err) {
        global.logger?.error?.(`[BUTTON_HANDLERS] Failed to load ${key}:`, err);
      }
    }

    loaded.sort((a?, b?) => a.order - b.order || String(a.name).localeCompare(String(b.name)));
    client.buttonHandlers = loaded;
    return client.buttonHandlers;
  };
};
