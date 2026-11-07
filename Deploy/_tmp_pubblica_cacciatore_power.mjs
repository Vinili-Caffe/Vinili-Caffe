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
  {
    rel: "archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.ts",
    remote: "archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.js",
  },
  {
    rel: "archivio/starwars/src/Vinili/Utils/Eventi/starWarsEconomyCatalog.ts",
    remote: "archivio/starwars/src/Vinili/Utils/Eventi/starWarsEconomyCatalog.js",
  },
  {
    rel: "archivio/starwars/src/Vinili/Utils/Eventi/starWarsMinigamesRegistry.ts",
    remote: "archivio/starwars/src/Vinili/Utils/Eventi/starWarsMinigamesRegistry.js",
  },
  {
    rel: "archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventCalendar.ts",
    remote: "archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventCalendar.js",
  },
];

const outDir = path.join(BOTS, "build", "_pubblica_cacciatore_power");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const f of FILES) {
  const code = esbuild.transformSync(fs.readFileSync(path.join(BOTS, f.rel), "utf8"), {
    loader: "ts",
    format: "cjs",
    platform: "node",
    target: "node20",
    keepNames: true,
    sourcefile: f.rel,
    tsconfigRaw: { compilerOptions: tsconfig.compilerOptions },
  }).code;
  const dest = path.join(outDir, path.basename(f.remote));
  fs.writeFileSync(dest, code);
  console.log("compiled", f.remote);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (r.status) process.exit(r.status || 1);
}

const remoteSh = `#!/usr/bin/env bash
set -euo pipefail
B=/root/vc_bot_bak_$(date +%Y%m%d-%H%M%S)-cacciatore-power
mkdir -p "$B"
for rel in \\
  archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.js \\
  archivio/starwars/src/Vinili/Utils/Eventi/starWarsEconomyCatalog.js \\
  archivio/starwars/src/Vinili/Utils/Eventi/starWarsMinigamesRegistry.js \\
  archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventCalendar.js
do
  dest="/opt/bot/bots-ts/$rel"
  base=$(basename "$rel")
  mkdir -p "$(dirname "$dest")" "$B/$(dirname "$rel")"
  [ -f "$dest" ] && cp -a "$dest" "$B/$rel"
  install -m 644 "/tmp/vc_cacciatore_power/$base" "$dest"
  node --check "$dest"
  echo "pubblicato: $rel"
done
pm2 restart bots-vinyls site-api >/dev/null
sleep 14
pm2 ls | grep -E 'bots-vinyls|site-api' || true
grep -n "CACCIATORE_TROOP_POWER\\|pickUnitForPower\\|2 truppe potenza 1" \\
  /opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.js \\
  /opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi/starWarsEconomyCatalog.js \\
  /opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventCalendar.js | head -n 20
echo "backup $B"
`;

fs.writeFileSync(path.join(outDir, "remote.sh"), remoteSh.replace(/\r\n/g, "\n"));
run("ssh", ["vinili", "mkdir -p /tmp/vc_cacciatore_power"]);
for (const f of FILES) {
  run("scp", ["-q", path.join(outDir, path.basename(f.remote)), `vinili:/tmp/vc_cacciatore_power/${path.basename(f.remote)}`]);
}
run("scp", ["-q", path.join(outDir, "remote.sh"), "vinili:/tmp/vc_cacciatore_power/remote.sh"]);
run("ssh", ["vinili", "bash /tmp/vc_cacciatore_power/remote.sh"]);
