const fs = require("fs");
const path = require("path");
const { Collection } = require("discord.js");

function getBotRoot() {
  return path.join(__dirname, "..", process.env.BOT_FOLDER || "Vinyls");
}

function loadSlashCommandsNoDeploy(client, commandsDir) {
  if (!fs.existsSync(commandsDir)) return;
  const folders = fs
    .readdirSync(commandsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  for (const folder of folders) {
    const folderPath = path.join(commandsDir, folder);
    const files = fs.readdirSync(folderPath).filter((f) => f.endsWith(".js"));
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      try {
        delete require.cache[require.resolve(filePath)];
        const command = require(filePath);
        const commandJson = typeof command?.data?.toJSON === "function" ? command.data.toJSON() : null;
        const name = command?.data?.name || commandJson?.name || null;
        const type = command?.data?.type ?? commandJson?.type ?? 1;
        if (!name) continue;
        if (typeof command.category === "undefined") command.category = folder;
        command._helpDataJson = commandJson || (typeof command.data?.toJSON === "function" ? command.data.toJSON() : null);
        client.commands.set(`${name}:${type}`, command);
      } catch (err) {
        console.error(`[sync-help-new-until] skip ${filePath}:`, err?.message || err);
      }
    }
  }
}

async function buildSortedHelpNewUntilPayload() {
  const root = getBotRoot();
  const prefixRoot = path.join(root, "Prefix");
  const commandsDir = path.join(root, "Commands");

  const oldLogger = global.logger;
  global.logger = { info() {}, error() {}, warn() {} };

  const client = {
    pcommands: new Collection(),
    aliases: new Collection(),
    commands: new Collection(),
    logs: { success() {} },
  };

  const loadPrefix = require(path.join(root, "Handlers", "prefixHandler.js"));
  loadPrefix(client);
  const helpMod = require(path.join(root, "Prefix", "Utility", "help.js"));

  try {
    const folders = fs
      .readdirSync(prefixRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    await client.prefixCommands(folders, prefixRoot);
    loadSlashCommandsNoDeploy(client, commandsDir);

    const fixedUntil = Number(process.env.HELP_NEW_UNTIL_MS);
    const payload = helpMod.buildHelpNewUntilPayload(
      client,
      Number.isFinite(fixedUntil) ? fixedUntil : undefined,
    );
    return Object.fromEntries(Object.entries(payload).sort((a, b) => a[0].localeCompare(b[0], "it")));
  } finally {
    global.logger = oldLogger;
  }
}

async function run() {
  const root = getBotRoot();
  const outPath = path.join(root, "Utils", "Config", "helpNewUntil.json");
  const sorted = await buildSortedHelpNewUntilPayload();
  const body = JSON.stringify(sorted, null, 2);
  fs.writeFileSync(outPath, body, "utf8");
  console.log("HELP_NEW_UNTIL_SYNC_OK", Object.keys(sorted).length, outPath);
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  module.exports = { run, buildSortedHelpNewUntilPayload, getBotRoot };
}