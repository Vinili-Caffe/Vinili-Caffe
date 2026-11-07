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
    rel: "archivio/starwars/src/Vinili/Services/Community/starWarsRewardsService.ts",
    remote: "archivio/starwars/src/Vinili/Services/Community/starWarsRewardsService.js",
  },
  {
    rel: "archivio/starwars/src/Vinili/Services/Community/starWarsQuizRewards.ts",
    remote: "archivio/starwars/src/Vinili/Services/Community/starWarsQuizRewards.js",
  },
  {
    rel: "archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.ts",
    remote: "archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.js",
  },
];

const outDir = path.join(BOTS, "build", "_pubblica_mg_rewards");
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
B=/root/vc_bot_bak_$(date +%Y%m%d-%H%M%S)-mg-rewards
mkdir -p "$B"
for rel in \\
  archivio/starwars/src/Vinili/Services/Community/starWarsRewardsService.js \\
  archivio/starwars/src/Vinili/Services/Community/starWarsQuizRewards.js \\
  archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.js
do
  dest="/opt/bot/bots-ts/$rel"
  base=$(basename "$rel")
  mkdir -p "$(dirname "$dest")" "$B/$(dirname "$rel")"
  [ -f "$dest" ] && cp -a "$dest" "$B/$rel"
  install -m 644 "/tmp/vc_mg_rewards/$base" "$dest"
  node --check "$dest"
  echo "pubblicato: $rel"
done
pm2 restart bots-vinyls >/dev/null
sleep 12
pm2 ls | grep bots-vinyls || true
rg -n "walletGuildId|notifyEventoWalletLive|broadcastSiteEventoWalletChanged" \\
  /opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsRewardsService.js \\
  /opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsQuizRewards.js | head -n 20
echo "backup $B"
`;

fs.writeFileSync(path.join(outDir, "remote.sh"), remoteSh.replace(/\r\n/g, "\n"));
run("ssh", ["vinili", "mkdir -p /tmp/vc_mg_rewards"]);
for (const f of FILES) {
  run("scp", ["-q", path.join(outDir, path.basename(f.remote)), `vinili:/tmp/vc_mg_rewards/${path.basename(f.remote)}`]);
}
run("scp", ["-q", path.join(outDir, "remote.sh"), "vinili:/tmp/vc_mg_rewards/remote.sh"]);
run("ssh", ["vinili", "bash /tmp/vc_mg_rewards/remote.sh"]);
