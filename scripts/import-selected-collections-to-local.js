const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const DEFAULT_DUMP_ROOT = path.resolve(
  __dirname,
  "../deploy/atlas-to-local-collections-20260320",
);
const DEFAULT_TOOLS_BIN = path.resolve(
  __dirname,
  "../deploy/tools/mongodb-database-tools-windows-x86_64-100.10.0/bin",
);
const DEFAULT_COLLECTIONS = [
  "avatarprivacies",
  "bannerprivacies",
  "birthdayprofiles",
  "customroles",
  "invitetracks",
  "verificationtenures",
  "nodmpreferences",
];

function parseArg(name) {
  const prefix = `${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function getRestoreExe(toolsBin) {
  const win = path.join(toolsBin, "mongorestore.exe");
  const unix = path.join(toolsBin, "mongorestore");
  if (fs.existsSync(win)) return win;
  if (fs.existsSync(unix)) return unix;
  throw new Error(`mongorestore non trovato in: ${toolsBin}`);
}

function main() {
  const localUri =
    parseArg("--uri") ||
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL;
  if (!localUri) {
    throw new Error(
      "URI locale mancante. Usa --uri=<mongodb://...> o imposta MONGO_URL_LOCAL in .env",
    );
  }

  const dumpRoot = parseArg("--dump") || DEFAULT_DUMP_ROOT;
  if (!fs.existsSync(dumpRoot)) {
    throw new Error(`Dump root non trovato: ${dumpRoot}`);
  }

  const toolsBin = parseArg("--tools") || DEFAULT_TOOLS_BIN;
  const restoreExe = getRestoreExe(toolsBin);
  const dbName = parseArg("--db") || "test";
  const collectionsArg = parseArg("--collections");
  const collections = collectionsArg
    ? collectionsArg
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    : DEFAULT_COLLECTIONS;

  const args = ["--uri", localUri, "--drop", dumpRoot];
  for (const c of collections) {
    args.push("--nsInclude", `${dbName}.${c}`);
  }

  console.log("[import-local] restore exe:", restoreExe);
  console.log("[import-local] dump root:", dumpRoot);
  console.log("[import-local] db:", dbName);
  console.log("[import-local] collections:", collections.join(", "));

  const res = spawnSync(restoreExe, args, { stdio: "inherit" });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }

  console.log("[import-local] completato con successo.");
}

main();
