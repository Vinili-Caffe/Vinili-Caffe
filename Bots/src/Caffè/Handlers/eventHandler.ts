const ascii = require("ascii-table");
const path = require("path") as typeof import("path");
const { listJsFilesRecursive } = require("../../shared/runtime/fsRuntime") as typeof import("../../shared/runtime/fsRuntime");
const{clearBoundHandlers,normalizeLifecycleEventName,trackBoundHandler,}=require("../../shared/runtime/loaderRuntime") as typeof import("../../shared/runtime/loaderRuntime");

export = (client?) => {
  if (!client._eventHandlers) client._eventHandlers = new Map();

  client.handleEvents = async (baseDir?) => {
    clearBoundHandlers(client, "_eventHandlers");

    const absBase = path.resolve(baseDir);
    const statusMap = new Map();
    let loaded = 0;

    const RARE_EVENT_DEFAULTS = [
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
    const skipRare = String(process.env.VC_SKIP_RARE_EVENTS || "").trim() === "1";
    const skipEvents = new Set([
      ...(skipRare ? RARE_EVENT_DEFAULTS : []),
      ...String(process.env.VC_SKIP_EVENTS || "")
        .split(/[,+\s]+/)
        .map((s?) => s.trim())
        .filter(Boolean),
    ]);

    for (const file of listJsFilesRecursive(absBase)) {
      const rel = path.relative(absBase, file).replace(/\\/g, "/");
      try {
        if (skipEvents.has(rel) || skipEvents.has(path.basename(rel).replace(/\.(cjs|mjs|js|cts|mts|ts)$/i, ""))) continue;
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
        loaded += 1;
      } catch (err) {
        statusMap.set(rel, "Error loading");
        global.logger.error(`[EVENTS] Failed to load ${rel}:`, err);
      }
    }

    const table = new ascii().setHeading("Folder", "File", "Status");
    for (const [rel, status] of Array.from(statusMap.entries()).sort((a?, b?) =>
      a[0].localeCompare(b[0]),
    )) {
      const folder = path.dirname(rel).replace(/\\/g, "/");
      const file = path.basename(rel);
      const folderLabel = folder === "." ? "Events" : `Events/${folder}`;
      table.addRow(folderLabel, file, status);
    }

    const LOG_EVENTS = String(process.env.LOG_EVENTS || process.env.LOG_COMMANDS || "0") === "1";
    if (LOG_EVENTS) global.logger.info(table.toString());
    /* Conteggio incluso in [BOOT] Loaded modules — niente riga dedicata. */
  };
};