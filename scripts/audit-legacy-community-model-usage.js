/**
 * Audit rapido: trova file che usano ancora modelli legacy community.
 * Utile durante lo switch verso ActivityUserProfile.
 *
 * Uso:
 *   node scripts/audit-legacy-community-model-usage.js
 */
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const TARGET_DIRS = ["Vinyls", "scripts"];
const LEGACY_TOKENS = [
  "ActivityUser",
  "ActivityDailyCompact",
  "ActivityHourlyCompact",
  "ActivityEventReward",
  "ExpUser",
  "EventUserExpSnapshot",
  "EventWeekWinner",
  "LevelHistoryUser",
];

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && full.endsWith(".js")) out.push(full);
  }
  return out;
}

function main() {
  const files = TARGET_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
  const matches = [];
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const hit = LEGACY_TOKENS.filter((token) => raw.includes(token));
    if (hit.length) {
      matches.push({
        file: path.relative(ROOT, file).replace(/\\/g, "/"),
        tokens: hit,
      });
    }
  }
  console.log(JSON.stringify({ totalFiles: files.length, legacyMatches: matches.length, rows: matches }, null, 2));
}

main();