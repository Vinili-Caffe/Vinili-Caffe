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
const REL = "archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.ts";
const code = esbuild.transformSync(fs.readFileSync(path.join(BOTS, REL), "utf8"), {
  loader: "ts",
  format: "cjs",
  platform: "node",
  target: "node20",
  keepNames: true,
  sourcefile: REL,
  tsconfigRaw: { compilerOptions: tsconfig.compilerOptions },
}).code;
const out = path.join(BOTS, "build", "_pubblica_scova.js");
fs.writeFileSync(out, code);
function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (r.status) process.exit(r.status || 1);
}
run("scp", ["-q", out, "vinili:/tmp/vc_scova.js"]);
run("ssh", [
  "vinili",
  'set -euo pipefail; dest=/opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.js; install -m 644 /tmp/vc_scova.js "$dest"; node --check "$dest"; pm2 restart bots-vinyls >/dev/null; sleep 10; grep -n "Mappa aggiornata\\|200_000\\|Confederazione" "$dest" | head -n 8; pm2 ls | grep bots-vinyls || true',
]);
