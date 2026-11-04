#!/usr/bin/env bash
set -euo pipefail
ROOT="c:/Users/corva/Desktop/Vinili & Caffè Bots"
scp -q "$ROOT/Bots/archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.ts" vinili:/tmp/vc_sw_mg.ts
scp -q "$ROOT/Bots/archivio/starwars/src/Vinili/Utils/Eventi/starWarsMinigamesRegistry.ts" vinili:/tmp/vc_sw_reg.ts
scp -q "$ROOT/Bots/archivio/starwars/src/Vinili/Prefix/Minigames/swspawn.ts" vinili:/tmp/vc_sw_spawn.ts
ssh vinili 'set -euo pipefail
cd /opt/bot/bots-ts
compile() {
  local in="$1" out="$2"
  node -e "
const esbuild=require(\"esbuild\");
esbuild.buildSync({
  entryPoints:[\"$in\"],
  outfile:\"$out\",
  platform:\"node\",
  format:\"cjs\",
  target:\"node20\",
  bundle:false,
  sourcemap:false,
  logLevel:\"error\",
});
console.log(\"compiled\", \"$out\");
"
  node --check "$out"
}
compile /tmp/vc_sw_mg.ts /tmp/vc_sw_mg.js
compile /tmp/vc_sw_reg.ts /tmp/vc_sw_reg.js
compile /tmp/vc_sw_spawn.ts /tmp/vc_sw_spawn.js
install -m 644 /tmp/vc_sw_mg.js /opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.js
install -m 644 /tmp/vc_sw_reg.js /opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi/starWarsMinigamesRegistry.js
install -m 644 /tmp/vc_sw_spawn.js /opt/bot/bots-ts/archivio/starwars/src/Vinili/Prefix/Minigames/swspawn.js
rm -f /tmp/vc_sw_mg.ts /tmp/vc_sw_mg.js /tmp/vc_sw_reg.ts /tmp/vc_sw_reg.js /tmp/vc_sw_spawn.ts /tmp/vc_sw_spawn.js
rm -f /opt/bot/bots-ts/archivio/starwars/src/Vinili/Prefix/Minigames/punta.js
rm -f /opt/bot/bots-ts/archivio/starwars/src/Vinili/Prefix/Minigames/conquista.js
echo removed punta.js
grep -c site_only_gara /opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.js
grep -c scommessa /opt/bot/bots-ts/archivio/starwars/src/Vinili/Prefix/Minigames/swspawn.js || true
ls /opt/bot/bots-ts/archivio/starwars/src/Vinili/Prefix/Minigames/
pm2 restart bots-vinyls >/dev/null
echo restarted bots-vinyls
'
