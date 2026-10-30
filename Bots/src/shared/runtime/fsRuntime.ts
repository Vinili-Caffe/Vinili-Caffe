const fs = require("fs") as typeof import("fs");
const os = require("os") as typeof import("os");
const path = require("path") as typeof import("path");

function requireDotenv() {
  try {
    return require("dotenv");
  } catch {
    const candidates = [
      path.join(__dirname, "..", "..", "Vinili", "node_modules", "dotenv"),
      path.join(__dirname, "..", "..", "node_modules", "dotenv"),
    ];
    for (const modPath of candidates) {
      try {
        return require(modPath);
      } catch {
              }
    }
    throw new Error("Modulo dotenv mancante: esegui npm install in Vinili/");
  }
}

const dotenv = requireDotenv();

function loadEnvFiles(appRoot = process.cwd()) {
  const safeAppRoot = typeof appRoot === "string" && appRoot.trim().length > 0 ? appRoot : process.cwd();
  const projectRoot = path.resolve(safeAppRoot, "..");
  const envCandidates = [
    path.join(projectRoot, ".env"),
    path.join(safeAppRoot, ".env"),
    path.join(process.cwd(), ".env"),
  ];

  for (const envPath of envCandidates) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath, quiet: true, override: false });
  }
    const useLocal = process.env.MONGO_URL_LOCAL || process.env.MONGODB_URI_LOCAL;
  if (useLocal) {
    delete process.env.MONGO_URL;
    delete process.env.MONGODB_URI;
  }
}

/** .js legacy + .ts (runtime tsx). Esclude .d.ts. */
function isBotCodeFile(name?) {
  const n = String(name || "");
  if (!n || n.endsWith(".d.ts")) return false;
  return /\.(cjs|mjs|js|cts|mts|ts)$/i.test(n);
}

function listFoldersIfExists(dirPath?) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry?) => entry.isDirectory())
    .map((entry?) => entry.name)
    .sort((a?, b?) => a.localeCompare(b));
}

function listJsFilesIfExists(dirPath?) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry?) => entry.isFile() && isBotCodeFile(entry.name))
    .map((entry?) => entry.name)
    .sort((a?, b?) => a.localeCompare(b));
}

function listJsFilesRecursive(dirPath?) {
  if (!fs.existsSync(dirPath)) return [];

  const files = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.sort((a?, b?) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && isBotCodeFile(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  files.sort((a?, b?) => a.localeCompare(b));
  return files;
}

function isPidAlive(pid?) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireSingleInstanceLock(lockName?) {
  const lockPath = path.join(os.tmpdir(), `${lockName}.lock`);
  const pid = process.pid;

  const writeLock=()=>fs.writeFileSync(lockPath,String(pid),{flag:"wx",encoding:"utf8"});

  try {
    writeLock();
  } catch (error) {
    if (!error || error.code !== "EEXIST") throw error;

    let existingPid = null;
    try {
      existingPid = Number.parseInt(fs.readFileSync(lockPath, "utf8"), 10);
    } catch (err) {
      global.logger?.warn?.("[fsRuntime] ", err?.message || err);
    }

    if (isPidAlive(existingPid)) {
      global.logger?.error?.(
        `[LOGIN] Another instance is already running (PID: ${existingPid}). Exiting.`,
      );
      process.exit(1);
    }

    try {
      fs.unlinkSync(lockPath);
    } catch (err) {
      global.logger?.warn?.("[fsRuntime] ", err?.message || err);
    }

    writeLock();
  }

  const release = () => {
    try {
      const current = Number.parseInt(fs.readFileSync(lockPath, "utf8"), 10);
      if (current === pid) fs.unlinkSync(lockPath);
    } catch (err) {
      if (err && err.code === "ENOENT") return;
      global.logger?.warn?.("[fsRuntime] release:", err?.message || err);
    }
  };

  process.on("exit", release);
  process.on("SIGINT", () => {
    release();
  });
  process.on("SIGTERM", () => {
    release();
  });
}

function installHandlers(appRoot?, client?) {
  const handlersDir = path.join(appRoot, "Handlers");
  const handlerFiles = listJsFilesIfExists(handlersDir);
  for (const file of handlerFiles) {
    require(path.join(handlersDir, file))(client);
  }
}

export = { acquireSingleInstanceLock, installHandlers, isBotCodeFile, listFoldersIfExists, listJsFilesIfExists, listJsFilesRecursive, loadEnvFiles };