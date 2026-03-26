const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TARGET_EXT = new Set([".js", ".cjs", ".mjs", ".ts", ".tsx"]);
const SKIP_DIRS = new Set([
  ".git",
  ".cursor",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  "out",
]);
const FIX = process.argv.includes("--fix");

function isLikelyUselessComment(line) {
  const raw = String(line || "").trim();
  if (!raw.startsWith("//")) return false;
  const text = raw.slice(2).trim().toLowerCase();
  if (!text) return false;
  if (text.length < 3) return false;

  // Conservativo: rimuove solo commenti boilerplate inutili molto comuni.
  const uselessPatterns = [
    /^try next\.?$/,
    /^try next$/,
    /^fallback$/,
    /^placeholder$/,
    /^no-op$/,
    /^do nothing$/,
    /^nothing$/,
    /^unused$/,
    /^todo:?$/,
    /^fixme:?$/,
    /^da rimuovere$/,
    /^rimuovere$/,
  ];
  return uselessPatterns.some((re) => re.test(text));
}

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (TARGET_EXT.has(ext)) out.push(full);
  }
  return out;
}

function processFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  let changed = false;
  const nextLines = [];

  for (const line of lines) {
    if (isLikelyUselessComment(line)) {
      changed = true;
      continue;
    }
    nextLines.push(line);
  }

  if (!changed) return 0;
  if (FIX) {
    let out = nextLines.join("\n");
    if (raw.endsWith("\n")) out = out.replace(/\n+$/g, "");
    fs.writeFileSync(filePath, out, "utf8");
  }
  return 1;
}

function main() {
  const files = walk(ROOT);
  let touched = 0;
  for (const file of files) touched += processFile(file);
  process.stdout.write(
    `${FIX ? "Done" : "Check"}: ${touched} file${touched === 1 ? "" : "s"} ${FIX ? "modified" : "would be modified"}.\n`,
  );
}

main();
