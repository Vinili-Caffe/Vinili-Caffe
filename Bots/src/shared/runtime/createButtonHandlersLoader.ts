const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { listJsFilesRecursive } = require("./fsRuntime") as typeof import("./fsRuntime");

const IDS_SUBFOLDER = `${path.sep}ids${path.sep}`;

function defaultIsNonHandlerFile(relativeKey?) {
  const rel = String(relativeKey || "").replace(/\\/g, "/");
  const base = path.basename(rel).replace(/\.(cjs|mjs|js|cts|mts|ts)$/i, "");
  if (base === "index" || base === "components" || base === "idBarrel" || base === "buttonParsers" || base.endsWith("Helpers")) {
    return true;
  }
  if (rel.endsWith("/topChannel/components.ts") || rel.endsWith("/topChannel/components.js")) return true;
  if (rel === "topChannel/components.ts" || rel === "topChannel/components.js") return true;
  return false;
}

/**
 * @param {object} options
 * @param {() => string[]} options.resolveDirs - absolute dirs to scan
 * @param {(rel: string) => boolean} [options.isNonHandlerFile]
 * @param {Set<string>|string[]} [options.removedHandlerNames]
 */
function createButtonHandlersLoader(options: Record<string, any> = {}) {
  const isNonHandlerFile =
    typeof options.isNonHandlerFile === "function" ? options.isNonHandlerFile : defaultIsNonHandlerFile;
  const removed = new Set(
    Array.isArray(options.removedHandlerNames)
      ? options.removedHandlerNames.map((n?) => String(n).toLowerCase())
      : options.removedHandlerNames instanceof Set
        ? [...options.removedHandlerNames].map((n?) => String(n).toLowerCase())
        : [],
  );

  return (client?) => {
    client.buttonHandlers = client.buttonHandlers || [];

    client.loadButtonHandlers = async (basePath?) => {
      const dirs = Array.isArray(basePath)
        ? basePath
        : basePath
          ? [basePath]
          : typeof options.resolveDirs === "function"
            ? options.resolveDirs() || []
            : [];
      const loaded = [];
      const seenNames = new Set();

      for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        const allPaths = listJsFilesRecursive(dir)
          .filter((fullPath?) => !fullPath.includes(IDS_SUBFOLDER))
          .filter((fullPath?) => !isNonHandlerFile(path.relative(dir, fullPath)));
        for (const fullPath of allPaths) {
          const key = path.relative(dir, fullPath);
          const fileName = path.basename(fullPath).replace(/\.(cjs|mjs|js|cts|mts|ts)$/i, "");
          if (removed.has(String(fileName).trim().toLowerCase())) continue;
          try {
            delete require.cache[require.resolve(fullPath)];
            const mod = require(fullPath);
            if (!mod || typeof mod.match !== "function" || typeof mod.execute !== "function") {
              global.logger?.warn?.(`[BUTTON_HANDLERS] ${key}: missing match/execute, skipped.`);
              continue;
            }
            const name = mod.name || fileName;
            const nameKey = String(name).trim().toLowerCase();
            if (removed.has(nameKey) || seenNames.has(nameKey)) continue;
            seenNames.add(nameKey);
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
      }

      loaded.sort((a?, b?) => a.order - b.order || String(a.name).localeCompare(String(b.name)));
      client.buttonHandlers = loaded;
      return client.buttonHandlers;
    };
  };
}

export = { createButtonHandlersLoader, defaultIsNonHandlerFile };
