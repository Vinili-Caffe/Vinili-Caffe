const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { listFoldersIfExists, listJsFilesRecursive } = require("./fsRuntime") as typeof import("./fsRuntime");

const SKIP_TOP_LEVEL = new Set([
  "node_modules",
  "Events",
  "Handlers",
  "Commands",
  "Prefix",
  "Triggers",
  "Buttons",
  "archivio",
  // Own capital-E Events/ loader (Windows case-folds events === Events)
  "MultiGuild",
]);

/**
 * Discover Discord event modules under `<botRoot>/<Module>/events/**`.
 * Also accepts legacy `Events/` via listJsFilesRecursive on the handleEvents baseDir.
 */
function discoverModuleEventFiles(botRoot?, options: Record<string, any> = {}) {
  const root = path.resolve(String(botRoot || ""));
  if (!root || !fs.existsSync(root)) return [];

  const skip = new Set([
    ...SKIP_TOP_LEVEL,
    ...(Array.isArray(options.skipTopLevel) ? options.skipTopLevel.map(String) : []),
  ]);
  const out = [];
  for (const folder of listFoldersIfExists(root)) {
    if (skip.has(folder)) continue;
    const eventsDir = path.join(root, folder, "events");
    if (!fs.existsSync(eventsDir)) continue;
    out.push(...listJsFilesRecursive(eventsDir));
  }
  return out;
}

function defaultModuleEventFolderLabel(rel?) {
  const normalized = String(rel || "").replace(/\\/g, "/");
  const parts = normalized.split("/");
  // Community/events/foo.ts → Community/events
  // Community/events/interaction/x.ts → Community/events/interaction
  if (parts.length >= 2 && parts[1] === "events") {
    return parts.slice(0, Math.min(3, parts.length - 1 || 2)).join("/");
  }
  const folder = path.dirname(normalized);
  if (folder === ".") return "Events";
  return `Events/${folder}`;
}

export = { discoverModuleEventFiles, defaultModuleEventFolderLabel, SKIP_TOP_LEVEL };
