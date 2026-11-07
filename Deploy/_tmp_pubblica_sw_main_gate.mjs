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
    rel: "src/Vinili/Minigames/services/minigameConfig.ts",
    remote: "src/Vinili/Minigames/services/minigameConfig.js",
    kind: "ts",
  },
  {
    rel: "archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventConfig.ts",
    remote: "archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventConfig.js",
    kind: "ts",
  },
  {
    rel: "archivio/starwars/src/Vinili/Utils/Minigames/starWarsMinigameHooks.ts",
    remote: "archivio/starwars/src/Vinili/Utils/Minigames/starWarsMinigameHooks.js",
    kind: "ts",
  },
  {
    rel: "src/Vinili/config.json",
    remote: "src/Vinili/config.json",
    kind: "json",
  },
];

const outDir = path.join(BOTS, "build", "_pubblica_sw_main_gate");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const f of FILES) {
  const src = path.join(BOTS, f.rel);
  const dest = path.join(outDir, path.basename(f.remote));
  if (f.kind === "json") {
    fs.copyFileSync(src, dest);
  } else {
    const code = esbuild.transformSync(fs.readFileSync(src, "utf8"), {
      loader: "ts",
      format: "cjs",
      platform: "node",
      target: "node20",
      keepNames: true,
      sourcefile: f.rel,
      tsconfigRaw: { compilerOptions: tsconfig.compilerOptions },
    }).code;
    fs.writeFileSync(dest, code);
  }
  console.log("prepared", f.remote);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (r.status) process.exit(r.status || 1);
}

const remoteSh = `#!/usr/bin/env bash
set -euo pipefail
B=/root/vc_bot_bak_$(date +%Y%m%d-%H%M%S)-sw-main-gate
mkdir -p "$B"
for rel in \\
  src/Vinili/Minigames/services/minigameConfig.js \\
  archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventConfig.js \\
  archivio/starwars/src/Vinili/Utils/Minigames/starWarsMinigameHooks.js \\
  src/Vinili/config.json
do
  dest="/opt/bot/bots-ts/$rel"
  base=$(basename "$rel")
  mkdir -p "$(dirname "$dest")" "$B/$(dirname "$rel")"
  [ -f "$dest" ] && cp -a "$dest" "$B/$rel"
  install -m 644 "/tmp/vc_sw_main_gate/$base" "$dest"
  if [[ "$rel" == *.js ]]; then node --check "$dest"; fi
  echo "pubblicato: $rel"
done
pm2 restart bots-vinyls site-api >/dev/null
sleep 12
pm2 ls | grep -E 'bots-vinyls|site-api' || true
node - <<'NODE'
const cfg=require('/opt/bot/bots-ts/src/Vinili/config.json');
const { resolveStarWarsEventConfig, isStarWarsPublicWindowOpen } = require('/opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventConfig.js');
const IDs=require('/opt/bot/bots-ts/src/Vinili/Config/ids.js');
const client={ config: cfg };
const r=resolveStarWarsEventConfig(client);
console.log('gate', {
  publicEnabled: r.publicEnabled,
  testGuildForceLive: r.testGuildForceLive,
  publicOpenDate: r.publicOpenDate,
  publicWindowNow: isStarWarsPublicWindowOpen(client),
  mainGuild: IDs.guilds?.main,
  testGuild: IDs.guilds?.test,
});
const { getConfig } = require('/opt/bot/bots-ts/src/Vinili/Minigames/services/minigameConfig.js');
const mg=getConfig(client);
console.log('minigames', { starWarsEventLive: mg?.starWarsEventLive, channelId: mg?.channelId });
NODE
echo "backup $B"
`;

fs.writeFileSync(path.join(outDir, "remote.sh"), remoteSh.replace(/\r\n/g, "\n"));
run("ssh", ["vinili", "mkdir -p /tmp/vc_sw_main_gate"]);
for (const f of FILES) {
  run("scp", ["-q", path.join(outDir, path.basename(f.remote)), `vinili:/tmp/vc_sw_main_gate/${path.basename(f.remote)}`]);
}
run("scp", ["-q", path.join(outDir, "remote.sh"), "vinili:/tmp/vc_sw_main_gate/remote.sh"]);
run("ssh", ["vinili", "bash /tmp/vc_sw_main_gate/remote.sh"]);
