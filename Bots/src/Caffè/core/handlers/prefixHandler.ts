const ascii = require("ascii-table");
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

const {
  ensurePrefixSubcommandMetadata,
  ensurePrefixUsageMetadata,
} = require("../../../shared/runtime/prefixSubcommandMetadata") as typeof import("../../../shared/runtime/prefixSubcommandMetadata");

export = (client?) => {
  client.prefixCommands = async (folders = [], basePath?) => {
    const runtimePrefix = String(client?.config?.prefix || ",");
    const newPcommands = new client.pcommands.constructor();
    const newAliases = new client.aliases.constructor();
    const statusMap = new Map();

    function loadPrefixFile(fullPath?, folderLabel?) {
      const key = `${folderLabel}/${path.basename(fullPath)}`;
      try {
        delete require.cache[require.resolve(fullPath)];
        const command = require(fullPath);
        if (!command || !command.name) {
          statusMap.set(key, "Missing name.");
          return;
        }
        if (command.skipLoad || command.skipPrefix) return;
        command.folder = command.folder || folderLabel;
        ensurePrefixSubcommandMetadata(command);
        ensurePrefixUsageMetadata(command, runtimePrefix);
        newPcommands.set(command.name, command);
        statusMap.set(key, "Loaded.");
        if (Array.isArray(command.aliases)) {
          for (const alias of command.aliases) newAliases.set(alias, command.name);
        }
      } catch (err) {
        statusMap.set(key, "Error loading.");
        global.logger?.error?.(`[PREFIX] Failed to load ${key}:`, err);
      }
    }

    // Community (e altri moduli) — flat dirs under */discord/prefix
    const modulePrefixDirs = [
      path.resolve(__dirname, "..", "..", "Community", "discord", "prefix"),
    ];
    if (basePath) modulePrefixDirs.unshift(basePath);
    for (const dir of modulePrefixDirs) {
      if (!fs.existsSync(dir)) continue;
      const folderLabel = path.basename(path.dirname(path.dirname(dir))) || "prefix";
      for (const file of fs.readdirSync(dir).filter((f?) => /\.(cjs|mjs|js|cts|mts|ts)$/i.test(f) && !f.endsWith(".d.ts"))) {
        loadPrefixFile(path.join(dir, file), folderLabel);
      }
    }
    // legacy optional Prefix/<folder> if still present
    const legacyPrefixBase = path.resolve(__dirname, "..", "..", "Prefix");
    for (const folder of folders) {
      if (folder === "TTS" || folder === "Music") continue;
      const folderPath = path.join(legacyPrefixBase, folder);
      if (!fs.existsSync(folderPath)) continue;
      for (const file of fs.readdirSync(folderPath).filter((f?) => /\.(cjs|mjs|js|cts|mts|ts)$/i.test(f) && !f.endsWith(".d.ts"))) {
        loadPrefixFile(path.join(folderPath, file), folder);
      }
    }

    try {
      const { getVoiceSessionService } = require("../../../shared/voice/voiceSessionService") as typeof import("../../../shared/voice/voiceSessionService");
      const voiceSession = getVoiceSessionService({
        snapshotPath: path.join(__dirname, "..", "..", "Data", "voiceSessionSnapshot.json"),
        snapshotKey: "coffee_voice_sessions",
      });
      const { buildTtsCommands } = require("../../../shared/tts/discord/prefixCommands") as typeof import("../../../shared/tts/discord/prefixCommands");
      const sharedTts = buildTtsCommands({
        prefix: runtimePrefix || ",",
        coffee: true,
        getVoiceSession: voiceSession.getVoiceSession,
        setVoiceSession: voiceSession.setVoiceSession,
        clearVoiceSession: voiceSession.clearVoiceSession,
      });
      for (const command of sharedTts as any[]) {
        if (!command?.name) continue;
        command.folder = command.folder || "TTS";
        ensurePrefixSubcommandMetadata(command);
        ensurePrefixUsageMetadata(command, runtimePrefix);
        newPcommands.set(command.name, command);
        statusMap.set(`TTS/${command.name}.shared`, "Loaded.");
        if (Array.isArray(command.aliases)) {
          for (const alias of command.aliases) newAliases.set(alias, command.name);
        }
      }
    } catch (err) {
      global.logger?.error?.("[PREFIX] TTS shared commands:", err);
    }

    try {
      const { buildMusicListPayload } = require("../../../shared/music/discord/buttons/musicListUi") as typeof import("../../../shared/music/discord/buttons/musicListUi");
      const { buildMusicControlCommands } = require("../../../shared/music/discord/prefixControls") as typeof import("../../../shared/music/discord/prefixControls");
      const { buildMusicViewCommands } = require("../../../shared/music/discord/prefixViews") as typeof import("../../../shared/music/discord/prefixViews");
      const sharedMusic = [
        ...buildMusicControlCommands({ prefix: runtimePrefix || ",", coffee: true }),
        ...buildMusicViewCommands({
          prefix: runtimePrefix || ",",
          coffee: true,
          buildMusicListPayload,
        }),
      ];
      for (const command of sharedMusic as any[]) {
        if (!command?.name) continue;
        command.folder = command.folder || "Music";
        ensurePrefixSubcommandMetadata(command);
        ensurePrefixUsageMetadata(command, runtimePrefix);
        newPcommands.set(command.name, command);
        statusMap.set(`Music/${command.name}.shared`, "Loaded.");
        if (Array.isArray(command.aliases)) {
          for (const alias of command.aliases) newAliases.set(alias, command.name);
        }
      }
    } catch (err) {
      global.logger?.error?.("[PREFIX] Music shared commands:", err);
    }

    client.pcommands.clear();
    client.aliases.clear();
    for (const [k, v] of newPcommands) client.pcommands.set(k, v);
    for (const [k, v] of newAliases) client.aliases.set(k, v);

    const LOG_PREFIX = String(process.env.LOG_PREFIX || process.env.LOG_COMMANDS || "0") === "1";
    if (LOG_PREFIX) {
      const table = new ascii().setHeading("Folder", "File", "Status");
      for (const [key, status] of Array.from(statusMap.entries()).sort((a?, b?) =>
        a[0].localeCompare(b[0]),
      )) {
        const [folder, file] = key.split("/");
        table.addRow(folder, file, status);
      }
      global.logger?.info?.(table.toString());
    }
    try {
      const { noteBoot } = require("../../../shared/runtime/bootSummary") as typeof import("../../../shared/runtime/bootSummary");
      noteBoot(client, { prefix: client.pcommands.size });
    } catch (_) {
      /* ignore */
    }
    if (LOG_PREFIX || String(process.env.BOOT_VERBOSE || "").trim() === "1") {
      global.logger?.info?.(
        `[PREFIX] Loaded ${client.pcommands.size} prefix command(s).`,
      );
    }
  };
};