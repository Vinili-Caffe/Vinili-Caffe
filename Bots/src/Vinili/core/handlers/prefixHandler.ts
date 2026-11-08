const ascii = require("ascii-table");
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

const PERMISSIONS_CANDIDATES=[path.resolve(__dirname, "../../permissions.json"),path.join(process.cwd(),"permissions.json"),];
const REMOVED_PREFIX_COMMANDS = new Set([
  "colors",
  "staff",
  "verify",
  "ticket",
  "notify",
  "quit",
  "classifica",
  "sezioneproibita",
  "libriproibiti",
  "forbiddenbooks",
  "live",
  "myquote",
  "myrepost",
  "myclip",
  "punticasa",
  "puntcasa",
  "pay",
  "paga",
  "duel",
  "bal",
  "balance",
  "shop",
  "negozio",
  "store",
  "tris",
]);
let prefixPermissionsCache = { filePath: null, mtimeMs: 0, data: {} };

function loadPrefixPermissions() {
  try {
    const permissionsPath=PERMISSIONS_CANDIDATES.find((p?) => fs.existsSync(p))||null;
    if (!permissionsPath) return {};
    const stat = fs.statSync(permissionsPath);
    if (
      prefixPermissionsCache.filePath === permissionsPath &&
      prefixPermissionsCache.mtimeMs === stat.mtimeMs
    ) {
      return prefixPermissionsCache.data || {};
    }
    const raw = fs.readFileSync(permissionsPath, "utf8");
    const parsed = JSON.parse(raw) || {};
    const prefix=parsed.prefix&&typeof parsed.prefix==="object"?parsed.prefix:{};
    prefixPermissionsCache = {
      filePath: permissionsPath,
      mtimeMs: stat.mtimeMs,
      data: prefix,
    };
    return prefix;
  } catch {
    return {};
  }
}

function getPermissionSubcommands(commandName?) {
  const safeName=String(commandName||"").trim().toLowerCase();
  if (!safeName) return [];
  const prefixPerms = loadPrefixPermissions();
  const cfg = prefixPerms?.[safeName];
  const subMap=cfg?.subcommands&&typeof cfg.subcommands==="object"?cfg.subcommands:null;
  if (!subMap) return [];
  return Object.keys(subMap)
    .map((sub?) =>
      String(sub || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

const {
  ensurePrefixSubcommandMetadata: ensurePrefixSubcommandMetadataShared,
  ensurePrefixUsageMetadata,
} = require("../../../shared/runtime/prefixSubcommandMetadata") as typeof import("../../../shared/runtime/prefixSubcommandMetadata");

function ensurePrefixSubcommandMetadata(command?) {
  ensurePrefixSubcommandMetadataShared(command, {
    extraSubcommands: getPermissionSubcommands(command?.name),
  });
}

function loadPrefixFilesFromDir(dirPath?, folderLabel?, newPcommands?, newAliases?, statusMap?) {
  if (!dirPath || !fs.existsSync(dirPath)) return;
  const files = fs
    .readdirSync(dirPath)
    .filter((f?) => /\.(cjs|mjs|js|cts|mts|ts)$/i.test(f) && !f.endsWith(".d.ts"));
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const key = `${folderLabel}/${file}`;
    try {
      delete require.cache[require.resolve(fullPath)];
      const command = require(fullPath);
      if (!command || !command.name) {
        statusMap.set(key, "Missing name");
        continue;
      }
      if (REMOVED_PREFIX_COMMANDS.has(String(command.name || "").trim().toLowerCase())) {
        continue;
      }
      if (command.skipLoad || command.skipPrefix) {
        continue;
      }
      command.folder = command.folder || folderLabel;
      ensurePrefixSubcommandMetadata(command);
      ensurePrefixUsageMetadata(command, "+");
      newPcommands.set(command.name, command);
      statusMap.set(key, "Loaded");
      if (Array.isArray(command.aliases)) {
        for (const alias of command.aliases) newAliases.set(alias, command.name);
      }
    } catch (err) {
      statusMap.set(key, "Error loading");
      global.logger.error(`[PREFIX_COMMANDS] Failed to load ${key}:`, err);
    }
  }
}

export = (client?) => {
  client.prefixCommands = async (folders?, basePath?) => {
    const prefixBase = basePath || path.resolve(__dirname, "..", "..", "Prefix");
    const newPcommands = new client.pcommands.constructor();
    const newAliases = new client.aliases.constructor();
    const statusMap = new Map();

    for (const folder of folders) {
      loadPrefixFilesFromDir(
        path.join(prefixBase, folder),
        folder,
        newPcommands,
        newAliases,
        statusMap,
      );
    }

    // Community utility prefix (+afk, +avatar, +repost, …) — niente facade sotto Prefix/Utility
    loadPrefixFilesFromDir(
      path.resolve(__dirname, "..", "..", "Community", "discord", "prefix"),
      "Utility",
      newPcommands,
      newAliases,
      statusMap,
    );

    // Partnership prefix vive in Partner/discord/prefix (niente facade sotto Prefix/)
    loadPrefixFilesFromDir(
      path.resolve(__dirname, "..", "..", "Partner", "discord", "prefix"),
      "Partnership",
      newPcommands,
      newAliases,
      statusMap,
    );

    // Stats prefix vive in Stats/discord/prefix (niente facade sotto Prefix/Stats)
    loadPrefixFilesFromDir(
      path.resolve(__dirname, "..", "..", "Stats", "discord", "prefix"),
      "Stats",
      newPcommands,
      newAliases,
      statusMap,
    );

    // Minigames prefix (es. +ship)
    loadPrefixFilesFromDir(
      path.resolve(__dirname, "..", "..", "Minigames", "discord", "prefix"),
      "Minigames",
      newPcommands,
      newAliases,
      statusMap,
    );

    // Star Wars prefix (archivio) — HS-only staging su server test
    loadPrefixFilesFromDir(
      path.resolve(__dirname, "..", "..", "..", "..", "archivio", "starwars", "src", "Vinili", "Prefix", "Minigames"),
      "StarWars",
      newPcommands,
      newAliases,
      statusMap,
    );
    loadPrefixFilesFromDir(
      path.resolve(__dirname, "..", "..", "..", "..", "archivio", "starwars", "src", "Vinili", "Prefix", "Economy"),
      "StarWars",
      newPcommands,
      newAliases,
      statusMap,
    );

    /* Economia Discord (archivio): attiva solo nelle fasi SW / anteprima HS */
    const econPrefixDir = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "archivio",
      "giochi-economia",
      "src",
      "Vinili",
      "Prefix",
      "Economy",
    );
    const SW_ECONOMY_PREFIX_ALLOW = new Set([
      "blackjack",
      "coinflip",
      "daily",
      "monthly",
      "rob",
      "roulette",
      "rps",
      "scratch",
      "slots",
      "weekly",
      "work",
    ]);
    if (fs.existsSync(econPrefixDir)) {
      for (const file of fs
        .readdirSync(econPrefixDir)
        .filter((f?) => /\.(cjs|mjs|js|cts|mts|ts)$/i.test(f) && !f.endsWith(".d.ts"))) {
        const base = file.replace(/\.(cjs|mjs|js|cts|mts|ts)$/i, "").toLowerCase();
        if (!SW_ECONOMY_PREFIX_ALLOW.has(base)) continue;
        const fullPath = path.join(econPrefixDir, file);
        const key = `Economy/${file}`;
        try {
          delete require.cache[require.resolve(fullPath)];
          const command = require(fullPath);
          if (!command?.name) {
            statusMap.set(key, "Missing name");
            continue;
          }
          if (command.skipLoad || command.skipPrefix) continue;
          command.folder = command.folder || "Economy";
          ensurePrefixSubcommandMetadata(command);
          ensurePrefixUsageMetadata(command, "+");
          newPcommands.set(command.name, command);
          statusMap.set(key, "Loaded");
          if (Array.isArray(command.aliases)) {
            for (const alias of command.aliases) newAliases.set(alias, command.name);
          }
        } catch (err) {
          statusMap.set(key, "Error loading");
          global.logger.error(`[PREFIX_COMMANDS] Failed to load ${key}:`, err);
        }
      }
    }

    // Backup prefix (+backup)
    loadPrefixFilesFromDir(
      path.resolve(__dirname, "..", "..", "Backup", "discord", "prefix"),
      "Admin",
      newPcommands,
      newAliases,
      statusMap,
    );

    // Level prefix (+rank, +level)
    loadPrefixFilesFromDir(
      path.resolve(__dirname, "..", "..", "Level", "discord", "prefix"),
      "Level",
      newPcommands,
      newAliases,
      statusMap,
    );

    // Security prefix (+security)
    loadPrefixFilesFromDir(
      path.resolve(__dirname, "..", "..", "Security", "discord", "prefix"),
      "Admin",
      newPcommands,
      newAliases,
      statusMap,
    );

    // TTS prefix = shared
    try {
      const { getVoiceSessionService } = require("../../../shared/voice/voiceSessionService") as typeof import("../../../shared/voice/voiceSessionService");
      const voiceSession = getVoiceSessionService({
        snapshotPath: path.join(__dirname, "..", "..", "Data", "voiceSessionSnapshot.json"),
        snapshotKey: "vinyls_voice_sessions",
      });
      const { buildTtsCommands } = require("../../../shared/tts/discord/prefixCommands") as typeof import("../../../shared/tts/discord/prefixCommands");
      const sharedTts = buildTtsCommands({
        prefix: "+",
        coffee: false,
        getVoiceSession: voiceSession.getVoiceSession,
        setVoiceSession: voiceSession.setVoiceSession,
        clearVoiceSession: voiceSession.clearVoiceSession,
        executeLeavePartnership: (message?) => {
          const { executeLeavePartnership } = require("../../Partner/tenant/tenantPartnershipLeaveRuntime") as typeof import("../../Partner/tenant/tenantPartnershipLeaveRuntime");
          return executeLeavePartnership(message);
        },
      });
      for (const command of sharedTts as any[]) {
        if (!command?.name) continue;
        command.folder = command.folder || "TTS";
        newPcommands.set(command.name, command);
        statusMap.set(`TTS/${command.name}.shared`, "Loaded.");
        if (Array.isArray(command.aliases)) {
          for (const alias of command.aliases) newAliases.set(alias, command.name);
        }
      }
    } catch (err) {
      global.logger?.error?.("[PREFIX] TTS shared commands:", err);
    }

    // Music prefix = shared (controls + views); runtime list UI resta bot-local
    try {
      const { buildMusicListPayload } = require("../../../shared/music/discord/buttons/musicListUi") as typeof import("../../../shared/music/discord/buttons/musicListUi");
      const { buildMusicControlCommands } = require("../../../shared/music/discord/prefixControls") as typeof import("../../../shared/music/discord/prefixControls");
      const { buildMusicViewCommands } = require("../../../shared/music/discord/prefixViews") as typeof import("../../../shared/music/discord/prefixViews");
      const sharedMusic = [
        ...buildMusicControlCommands({ prefix: "+", coffee: false }),
        ...buildMusicViewCommands({ prefix: "+", coffee: false, buildMusicListPayload }),
      ];
      for (const command of sharedMusic as any[]) {
        if (!command?.name) continue;
        command.folder = command.folder || "Music";
        newPcommands.set(command.name, command);
        statusMap.set(`Music/${command.name}.shared`, "Loaded.");
        if (Array.isArray(command.aliases)) {
          for (const alias of command.aliases) newAliases.set(alias, command.name);
        }
      }
    } catch (err) {
      global.logger?.error?.("[PREFIX] Music shared commands:", err);
    }

    // Moderation prefix vive in Moderation/discord/prefix
    loadPrefixFilesFromDir(
      path.resolve(__dirname, "..", "..", "Moderation", "discord", "prefix"),
      "Moderation",
      newPcommands,
      newAliases,
      statusMap,
    );

    // Prefix MultiGuild (es. +help tenant-only)
    const mgPrefixBase = path.resolve(__dirname, "..", "..", "..", "MultiGuild", "discord", "prefix");
    if (fs.existsSync(mgPrefixBase)) {
      const mgFolders = fs
        .readdirSync(mgPrefixBase, { withFileTypes: true })
        .filter((e?) => e.isDirectory())
        .map((e?) => e.name);
      for (const folder of mgFolders) {
        loadPrefixFilesFromDir(
          path.join(mgPrefixBase, folder),
          folder,
          newPcommands,
          newAliases,
          statusMap,
        );
      }
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
      global.logger.info(table.toString());
    }
    try {
      const { noteBoot } = require("../../../shared/runtime/bootSummary") as typeof import("../../../shared/runtime/bootSummary");
      noteBoot(client, { prefix: client.pcommands.size });
    } catch (_) {
      /* ignore */
    }
    if (String(process.env.BOOT_VERBOSE || "").trim() === "1") {
      global.logger.info(
        `[PREFIX_COMMANDS] Loaded ${client.pcommands.size} PrefixCommands.`,
      );
    }

    client._prefixOverrideCache = null;
  };
};