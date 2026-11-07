#!/usr/bin/env node
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const BOTS = path.join(REPO, "Bots");
const require = createRequire(path.join(BOTS, "package.json"));
const esbuild = require("esbuild");
const tsconfig = JSON.parse(fs.readFileSync(path.join(BOTS, "tsconfig.json"), "utf8"));
const REL = "src/Vinili/site/suggestions/siteSuggestionsBroadcast.ts";
const code = esbuild.transformSync(fs.readFileSync(path.join(BOTS, REL), "utf8"), {
  loader: "ts",
  format: "cjs",
  platform: "node",
  target: "node20",
  keepNames: true,
  sourcefile: REL,
  tsconfigRaw: { compilerOptions: tsconfig.compilerOptions },
}).code;
const out = path.join(BOTS, "build", "_pubblica_siteSuggestionsBroadcast.js");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, code);
console.log("compiled", REL);

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (r.status) process.exit(r.status || 1);
}

run("scp", ["-q", out, "vinili:/tmp/vc_siteSuggestionsBroadcast.js"]);
run("ssh", [
  "vinili",
  [
    "set -euo pipefail",
    'dest=/opt/bot/bots-ts/src/Vinili/site/suggestions/siteSuggestionsBroadcast.js',
    'B=/root/vc_bot_bak_$(date +%Y%m%d-%H%M%S)-broadcast',
    'mkdir -p "$B/src/Vinili/site/suggestions"',
    '[ -f "$dest" ] && cp -a "$dest" "$B/src/Vinili/site/suggestions/"',
    'install -m 644 /tmp/vc_siteSuggestionsBroadcast.js "$dest"',
    'node --check "$dest"',
    "pm2 restart bots-vinyls site-api >/dev/null",
    "sleep 12",
    'grep -n "broadcastSiteEventoWalletChanged\\|evento_wallet_changed" "$dest" | head -n 10',
    'pm2 ls | grep -E "bots-vinyls|site-api" || true',
    'echo "backup $B"',
  ].join("; "),
]);
