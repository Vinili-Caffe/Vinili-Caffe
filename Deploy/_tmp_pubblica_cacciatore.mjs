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

const FILES = [
  "archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.ts",
  "archivio/starwars/src/Vinili/Utils/Eventi/starWarsMinigamesRegistry.ts",
  "archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventCalendar.ts",
];

const outDir = path.join(BOTS, "build", "_pubblica_cacciatore");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const rel of FILES) {
  const src = path.join(BOTS, rel);
  const code = esbuild.transformSync(fs.readFileSync(src, "utf8"), {
    loader: "ts",
    format: "cjs",
    platform: "node",
    target: "node20",
    keepNames: true,
    sourcefile: rel,
    tsconfigRaw: { compilerOptions: tsconfig.compilerOptions },
  }).code;
  const jsRel = rel.replace(/\.ts$/, ".js");
  const dest = path.join(outDir, jsRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, code);
  console.log("compiled", jsRel);
}

const remoteScript = `#!/usr/bin/env bash
set -euo pipefail
B=/root/vc_bot_bak_$(date +%Y%m%d-%H%M%S)-cacciatore
mkdir -p "$B"
for f in \\
  archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.js \\
  archivio/starwars/src/Vinili/Utils/Eventi/starWarsMinigamesRegistry.js \\
  archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventCalendar.js
do
  dest="/opt/bot/bots-ts/$f"
  mkdir -p "$(dirname "$dest")" "$B/$(dirname "$f")"
  [ -f "$dest" ] && cp -a "$dest" "$B/$f"
  install -m 644 "/tmp/vc_cacciatore/$(basename "$f")" "$dest"
  node --check "$dest"
  echo "pubblicato: $f"
done
pm2 restart bots-vinyls site-api >/dev/null
sleep 16
pm2 ls | grep -E 'bots-vinyls|site-api' || true
rg -n "CACCIATORE_TROOP_TIER1|2 truppe T1" /opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.js /opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventCalendar.js | head -n 12 || true
echo "backup $B"
`;

const remotePath = path.join(outDir, "remote.sh");
fs.writeFileSync(remotePath, remoteScript.replace(/\r\n/g, "\n"));

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (r.status) process.exit(r.status || 1);
}

run("ssh", ["vinili", "mkdir -p /tmp/vc_cacciatore"]);
for (const rel of FILES) {
  const jsRel = rel.replace(/\.ts$/, ".js");
  const local = path.join(outDir, jsRel);
  const remote = `/tmp/vc_cacciatore/${path.basename(jsRel)}`;
  run("scp", ["-q", local, `vinili:${remote}`]);
}
run("scp", ["-q", remotePath, "vinili:/tmp/vc_cacciatore/remote.sh"]);
run("ssh", ["vinili", "bash /tmp/vc_cacciatore/remote.sh"]);
