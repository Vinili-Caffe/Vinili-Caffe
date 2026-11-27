const path = require("path");
const { execSync } = require("child_process");
const fs = require("fs");

const REPO = path.resolve(__dirname, "..");
const LOCAL_SRC = path.join(REPO, "Bots", "src");
const TEMP_PREFIX = "sync-from-server-";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = {
  ...loadEnvFile(path.join(REPO, ".env")),
  ...loadEnvFile(path.join(REPO, "Bots", ".env")),
};
const SYNC_SERVER = env.SYNC_SERVER || process.env.SYNC_SERVER || "vinili";
const SYNC_REMOTE_PATH = (
  env.SYNC_REMOTE_PATH ||
  process.env.SYNC_REMOTE_PATH ||
  "/opt/bot/bots-ts/src"
)
  .replace(/\\/g, "/")
  .replace(/\/+$/, "");

/** Percorsi relativi a Bots/src (locale) e a bots-ts/src (VPS). */
const FILES = [
  "Vinili/Utils/Config/idsCatalog.js",
  "Vinili/Utils/Config/helpNewUntil.json",
];

if (!fs.existsSync(LOCAL_SRC)) {
  /* Sulla VPS non c’è Bots/src: lo script è solo per sync verso la repo locale. */
  if (String(process.env.SYNC_VERBOSE || "").trim() === "1") {
    console.error("Manca Bots/src — sync-from-server va lanciato dalla repo Vinili & Caffè.");
  }
  process.exit(0);
}

for (const rel of FILES) {
  const remote = `${SYNC_SERVER}:${SYNC_REMOTE_PATH}/${rel}`;
  const localDir = path.join(LOCAL_SRC, path.dirname(rel));
  const localPath = path.join(LOCAL_SRC, rel);
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
  const tempPath = path.join(localDir, TEMP_PREFIX + path.basename(rel));
  try {
    const quotedRemote = remote.includes(" ") ? `"${remote}"` : remote;
    const quotedTemp = tempPath.includes(" ") ? `"${tempPath.replace(/"/g, '\\"')}"` : tempPath;
    execSync(`scp ${quotedRemote} ${quotedTemp}`, { stdio: "pipe", cwd: REPO, shell: true });
    const remoteContent = fs.readFileSync(tempPath, "utf8");
    const localExists = fs.existsSync(localPath);
    const localContent = localExists ? fs.readFileSync(localPath, "utf8") : "";
    if (localContent === remoteContent) {
      try {
        fs.unlinkSync(tempPath);
      } catch (_) {}
      continue;
    }
    fs.writeFileSync(localPath, remoteContent, "utf8");
    try {
      fs.unlinkSync(tempPath);
    } catch (_) {}
    console.log("Aggiornato:", rel);
  } catch (e) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (_) {}
    const ext = path.extname(rel).toLowerCase();
    const placeholder = ext === ".json" ? "{}" : "module.exports = {};\n";
    if (!fs.existsSync(localPath)) {
      fs.writeFileSync(localPath, placeholder, "utf8");
      console.warn("Creato placeholder locale (file assente sul server):", rel);
    } else {
      console.warn("Skip (scp fallito):", rel, e?.message || e);
    }
  }
}

if (String(process.env.SYNC_VERBOSE || "").trim() === "1") {
  console.log("Sync completato.");
  console.log(`  locale: ${LOCAL_SRC}`);
  console.log(`  remoto: ${SYNC_SERVER}:${SYNC_REMOTE_PATH}`);
}
