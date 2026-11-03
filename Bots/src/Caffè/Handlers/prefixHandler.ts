const ascii = require("ascii-table");
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

function inferSubcommandsFromExecute(command?) {
  const src = String(command?.execute || "");
  if (!src) return [];
  const out = new Set();
  let match = null;

  const eqRegex =/\b(?:sub|subcommand|mode|action|type|operation|choice)\s*={2,3}\s*['"`]([a-z0-9._-]+)['"`]/gi;
  while ((match = eqRegex.exec(src)) !== null) {
    out.add(String(match[1] || "").toLowerCase());
  }

  const caseRegex = /\bcase\s+['"`]([a-z0-9._-]+)['"`]\s*:/gi;
  while ((match = caseRegex.exec(src)) !== null) {
    out.add(String(match[1] || "").toLowerCase());
  }

  const includesRegex =/\[((?:\s*['"`][a-z0-9._-]+['"`]\s*,?)+)\]\.includes\((?:[^)]*)\)/gi;
  while ((match = includesRegex.exec(src)) !== null) {
    const block = String(match[1] || "");
    const tokenRegex = /['"`]([a-z0-9._-]+)['"`]/gi;
    let tokenMatch = null;
    while ((tokenMatch = tokenRegex.exec(block)) !== null) {
      out.add(String(tokenMatch[1] || "").toLowerCase());
    }
  }

  return Array.from(out.values()).filter(Boolean);
}

function ensurePrefixSubcommandMetadata(command?) {
  const declared = Array.isArray(command ?. subcommands)? command.subcommands.map((sub?)=>String(sub || "").trim().toLowerCase(),).filter(Boolean):[];
  const mappedTargets = command ?. subcommandAliases && typeof command.subcommandAliases === "object" ? Object.values(command.subcommandAliases).map((sub?)=>String(sub || "").trim().toLowerCase(),).filter(Boolean):[];
  const inferred = inferSubcommandsFromExecute(command);

  const known = Array.from(new Set([...declared, ...mappedTargets, ...inferred]));
  if (!known.length) return;

  command.canonicalSubcommands = Array.from(new Set(declared));
  command.subcommands = known;
  if (!command.subcommandAliases || typeof command.subcommandAliases !== "object") {
    command.subcommandAliases = {};
  }
  for (const sub of known) {
    if (!String(command.subcommandAliases[sub] || "").trim()) {
      command.subcommandAliases[sub] = sub;
    }
  }
}

function ensurePrefixUsageMetadata(command?, prefix = ",") {
  const name = String(command ?. name || "").trim().toLowerCase();
  if (!name) return;

  const subs = Array.isArray(command ?. subcommands)? command.subcommands.map((sub?)=>String(sub || "").trim().toLowerCase(),).filter(Boolean):[];

  const usage = String(command ?. usage || "").trim()||(subs.length ? Boolean(command ?. allowEmptyArgs)?`${prefix}${name} [${subs.slice(0,8).join(" | ")}]`:`${prefix}${name} <${subs.slice(0,8).join(" | ")}>`:Boolean(command ?. args)?`${prefix}${name} <opzioni>`:`${prefix}${name}`);
  command.usage = usage;

  const examples = Array.isArray(command ?. examples)&& command.examples.some((item?)=>String(item || "").trim())? command.examples:subs.length >=2?[`${prefix}${name} ${subs[0]}`,`${prefix}${name} ${subs[1]}`]:subs.length ===1?[`${prefix}${name} ${subs[0]}`,`${prefix}${name}`]:Boolean(command ?. args)?[`${prefix}${name} esempio`]:[`${prefix}${name}`];
  command.examples = examples;

  if (
    !command.subcommandUsages ||
    typeof command.subcommandUsages !== "object" ||
    Array.isArray(command.subcommandUsages)
  ) {
    command.subcommandUsages = {};
  }
  for (const sub of subs) {
    if (!String(command.subcommandUsages[sub] || "").trim()) {
      command.subcommandUsages[sub] = `${prefix}${name} ${sub} ...`;
    }
  }
}

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
      path.resolve(__dirname, "..", "Community", "discord", "prefix"),
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
    const legacyPrefixBase = path.resolve(__dirname, "..", "Prefix");
    for (const folder of folders) {
      if (folder === "TTS" || folder === "Music") continue;
      const folderPath = path.join(legacyPrefixBase, folder);
      if (!fs.existsSync(folderPath)) continue;
      for (const file of fs.readdirSync(folderPath).filter((f?) => /\.(cjs|mjs|js|cts|mts|ts)$/i.test(f) && !f.endsWith(".d.ts"))) {
        loadPrefixFile(path.join(folderPath, file), folder);
      }
    }

    try {
      const voiceSession = require("../Voice/services/voiceSessionService") as typeof import("../Voice/services/voiceSessionService");
      const { buildTtsCommands } = require("../../shared/tts/discord/prefixCommands") as typeof import("../../shared/tts/discord/prefixCommands");
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
      const { buildMusicListPayload } = require("../../shared/music/discord/musicListUiRuntime") as typeof import("../../shared/music/discord/musicListUiRuntime");
      const { buildMusicControlCommands } = require("../../shared/music/discord/prefixControls") as typeof import("../../shared/music/discord/prefixControls");
      const { buildMusicViewCommands } = require("../../shared/music/discord/prefixViews") as typeof import("../../shared/music/discord/prefixViews");
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
    global.logger?.info?.(
      `[PREFIX] Loaded ${client.pcommands.size} prefix command(s).`,
    );
  };
};