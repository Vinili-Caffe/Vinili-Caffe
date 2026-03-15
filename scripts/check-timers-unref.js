const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const JS_FILES = ["Vinyls/**/*.js", "Coffee/**/*.js", "shared/**/*.js"];
const SKIP_DIRS = ["node_modules", ".git"];

function findJsFiles() {
  const out = [];
  function walk(dir, pattern) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && !SKIP_DIRS.includes(e.name)) walk(full, pattern);
      if (e.isFile() && e.name.endsWith(".js")) out.push(full);
    }
  }
  for (const p of JS_FILES) {
    const dir = path.join(ROOT, p.split("/")[0]);
    walk(dir, p);
  }
  return out;
}

const files = findJsFiles();
const missing = [];

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isSetTimeout = /\bsetTimeout\s*\(/.test(line) && !/setTimeout\./.test(line);
    const isSetInterval = /\bsetInterval\s*\(/.test(line) && !/setInterval\./.test(line);
    if (!isSetTimeout && !isSetInterval) continue;
    if (/new Promise\s*\([^)]*=>\s*setTimeout|await new Promise\s*\([^)]*setTimeout/.test(line)) continue;
    const next = lines.slice(i, Math.min(i + 5, lines.length)).join(" ");
    if (/unref/.test(next)) continue;
    if (/client\._|_startupPanelsRetryTimer|_primaryEngagementInterval|_joinRaidRestoreInterval|_giveawayScheduledEndInterval/.test(next)) continue;
    missing.push({ file: rel, line: i + 1, code: line.trim().slice(0, 80) });
  }
}

if (missing.length) {
  console.log("Timer senza .unref() (potrebbero tenere in vita il processo):");
  missing.forEach((m) => console.log(`  ${m.file}:${m.line}  ${m.code}`));
  process.exit(1);
}
console.log("OK: tutti i timer controllati hanno .unref() o sono assegnati a client._*.");