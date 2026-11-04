#!/usr/bin/env bash
set -euo pipefail
ROOT="c:/Users/corva/Desktop/Vinili & Caffè Bots"
scp -q "$ROOT/Bots/archivio/starwars/src/Vinili/Utils/Eventi/starWarsReliquieCatalog.ts" vinili:/tmp/vc_sw_relcat.ts
scp -q "$ROOT/Bots/archivio/starwars/src/Vinili/Utils/Eventi/starWarsPgCatalog.ts" vinili:/tmp/vc_sw_pgcat.ts
scp -q "$ROOT/Bots/archivio/starwars/src/Vinili/Services/Community/starWarsDeckProfileService.ts" vinili:/tmp/vc_sw_deck.ts
scp -q "$ROOT/Bots/archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.ts" vinili:/tmp/vc_sw_mg.ts
scp -q "$ROOT/Bots/archivio/starwars/src/Vinili/Utils/Eventi/starWarsMinigamesRegistry.ts" vinili:/tmp/vc_sw_reg.ts
scp -q "$ROOT/Bots/src/Vinili/site/http/usersLbSearch.ts" vinili:/tmp/vc_users_lb.ts
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
compile /tmp/vc_sw_relcat.ts /tmp/vc_sw_relcat.js
compile /tmp/vc_sw_pgcat.ts /tmp/vc_sw_pgcat.js
compile /tmp/vc_sw_deck.ts /tmp/vc_sw_deck.js
compile /tmp/vc_sw_mg.ts /tmp/vc_sw_mg.js
compile /tmp/vc_sw_reg.ts /tmp/vc_sw_reg.js
compile /tmp/vc_users_lb.ts /tmp/vc_users_lb.js
mkdir -p /opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi
mkdir -p /opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community
install -m 644 /tmp/vc_sw_relcat.js /opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi/starWarsReliquieCatalog.js
install -m 644 /tmp/vc_sw_pgcat.js /opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi/starWarsPgCatalog.js
install -m 644 /tmp/vc_sw_deck.js /opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsDeckProfileService.js
install -m 644 /tmp/vc_sw_mg.js /opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.js
install -m 644 /tmp/vc_sw_reg.js /opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi/starWarsMinigamesRegistry.js
install -m 644 /tmp/vc_users_lb.js /opt/bot/bots-ts/src/Vinili/site/http/usersLbSearch.js
rm -f /tmp/vc_sw_*.ts /tmp/vc_sw_*.js /tmp/vc_users_lb.ts /tmp/vc_users_lb.js
grep -c pickRandomReliquie /opt/bot/bots-ts/archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService.js
grep -c starWarsDecks /opt/bot/bots-ts/src/Vinili/site/http/usersLbSearch.js
pm2 restart bots-vinyls site-api >/dev/null
echo restarted bots-vinyls site-api
'
