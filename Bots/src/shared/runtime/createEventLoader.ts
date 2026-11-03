const ascii = require("ascii-table");
const path = require("path") as typeof import("path");
const { listJsFilesRecursive } = require("./fsRuntime") as typeof import("./fsRuntime");
const {
  discoverModuleEventFiles,
  defaultModuleEventFolderLabel,
} = require("./discoverModuleEventFiles") as typeof import("./discoverModuleEventFiles");
const {
  clearBoundHandlers,
  normalizeLifecycleEventName,
  trackBoundHandler,
} = require("./loaderRuntime") as typeof import("./loaderRuntime");

const DEFAULT_RARE_EVENTS = [
  "emojiCreate",
  "emojiDelete",
  "emojiUpdate",
  "stickerCreate",
  "stickerDelete",
  "stickerUpdate",
  "stageInstanceDelete",
  "webhookUpdate",
  "channelPinsUpdate",
  "threadMembersUpdate",
  "guildScheduledEventCreate",
  "guildScheduledEventUpdate",
  "guildScheduledEventDelete",
];

function resolveSkipEvents(rareDefaults?) {
  const rare = Array.isArray(rareDefaults) ? rareDefaults : DEFAULT_RARE_EVENTS;
  const skipRare = String(process.env.VC_SKIP_RARE_EVENTS || "").trim() === "1";
  return new Set([
    ...(skipRare ? rare : []),
    ...String(process.env.VC_SKIP_EVENTS || "")
      .split(/[,+\s]+/)
      .map((s?) => String(s || "").trim())
      .filter(Boolean),
  ]);
}

/**
 * Shared Discord event file loader (client.handleEvents).
 * Loads legacy `Events/` (baseDir) plus `<Module>/events/**` under the bot root.
 * @param {object} [options]
 * @param {(absBase: string, botRoot: string) => string[]} [options.extraEventFiles]
 * @param {(rel: string) => string} [options.folderLabelForRel]
 * @param {string[]} [options.rareEventDefaults]
 * @param {boolean} [options.discoverModuleEvents=true]
 */
function installEventLoader(client?, options: Record<string, any> = {}) {
  if (!client) return;
  if (!client._eventHandlers) client._eventHandlers = new Map();

  const extraEventFiles =
    typeof options.extraEventFiles === "function" ? options.extraEventFiles : null;
  const folderLabelForRel =
    typeof options.folderLabelForRel === "function"
      ? options.folderLabelForRel
      : defaultModuleEventFolderLabel;
  const rareDefaults = options.rareEventDefaults;
  const discoverModules = options.discoverModuleEvents !== false;

  client.handleEvents = async (baseDir?) => {
    clearBoundHandlers(client, "_eventHandlers");

    const absBase = path.resolve(baseDir);
    const botRoot =
      path.basename(absBase).toLowerCase() === "events" ? path.dirname(absBase) : absBase;
    const statusMap = new Map();
    const skipEvents = resolveSkipEvents(rareDefaults);

    const extras = extraEventFiles
      ? (extraEventFiles(absBase, botRoot) || [])
          .map((f?) => String(f || "").trim())
          .filter(Boolean)
          .filter((f?) => {
            try {
              require.resolve(f);
              return true;
            } catch {
              return false;
            }
          })
      : [];

    const moduleFiles = discoverModules ? discoverModuleEventFiles(botRoot) : [];
    const legacyFiles = listJsFilesRecursive(
      path.basename(absBase).toLowerCase() === "events" ? absBase : path.join(botRoot, "Events"),
    );
    const seen = new Set();
    const files = [];
    for (const file of [...legacyFiles, ...moduleFiles, ...extras]) {
      const key = path.resolve(file);
      if (seen.has(key)) continue;
      seen.add(key);
      files.push(file);
    }

    for (const file of files) {
      const underEvents = file.startsWith(absBase + path.sep) || file.startsWith(absBase + "/");
      const rel = underEvents
        ? path.relative(absBase, file).replace(/\\/g, "/")
        : path.relative(botRoot, file).replace(/\\/g, "/");
      try {
        const baseName = path.basename(rel).replace(/\.(cjs|mjs|js|cts|mts|ts)$/i, "");
        if (skipEvents.has(rel) || skipEvents.has(baseName)) continue;
        delete require.cache[require.resolve(file)];
        const event = require(file);
        if (!event?.name || typeof event.execute !== "function") continue;
        if (skipEvents.has(String(event.name))) continue;

        const eventName = normalizeLifecycleEventName(event.name);
        const handler = async (...args) => {
          return Promise.resolve(event.execute(...args, client)).catch((err?) => {
            global.logger?.error?.(`[EVENT ${eventName}]`, err);
          });
        };

        const bind = event.once ? client.once.bind(client) : client.on.bind(client);
        bind(eventName, handler);
        trackBoundHandler(client, "_eventHandlers", eventName, handler);
        statusMap.set(rel, eventName === event.name ? "Loaded" : `Loaded as ${eventName}`);
      } catch (err) {
        statusMap.set(rel, "Error loading");
        global.logger?.error?.(`[EVENTS] Failed to load ${rel}:`, err);
      }
    }

    const LOG_EVENTS = String(process.env.LOG_EVENTS || process.env.LOG_COMMANDS || "0") === "1";
    if (LOG_EVENTS) {
      const table = new ascii().setHeading("Folder", "File", "Status");
      const maxFolder = 18;
      const maxFile = 32;
      const maxStatus = 18;
      for (const [rel, status] of Array.from(statusMap.entries()).sort((a?, b?) =>
        a[0].localeCompare(b[0]),
      )) {
        let folderLabel = folderLabelForRel(rel);
        const file = path.basename(rel);
        if (folderLabel.length > maxFolder) folderLabel = folderLabel.slice(0, maxFolder - 1) + "…";
        const fileShort = file.length > maxFile ? file.slice(0, maxFile - 1) + "…" : file;
        const statusShort =
          String(status).length > maxStatus
            ? String(status).slice(0, maxStatus - 1) + "…"
            : String(status);
        table.addRow(folderLabel, fileShort, statusShort);
      }
      const tableStr = table.toString();
      tableStr.split("\n").forEach((line?) => global.logger?.info?.(line));
    }
  };
}

export = { installEventLoader, DEFAULT_RARE_EVENTS };
