#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOTS="$ROOT/Bots"
REMOTE_GE="/opt/bot/bots-ts/archivio/giochi-economia/src/Vinili"
TMP="/tmp/vc_sw_econ_hs"

ssh vinili "mkdir -p /opt/bot/bots-ts/tools '$TMP'"
scp -q "$ROOT/Deploy/_compile_one_archivio.cjs" "vinili:/opt/bot/bots-ts/tools/_compile_one_archivio.cjs"

publish_ge() {
  local f="$1" base dir
  base="$(basename "$f" .ts)"
  dir="$(dirname "$f")"
  scp -q "$BOTS/archivio/giochi-economia/src/Vinili/$f" "vinili:$TMP/${base}.ts"
  ssh vinili "mkdir -p '$REMOTE_GE/$dir' && node /opt/bot/bots-ts/tools/_compile_one_archivio.cjs '$TMP/${base}.ts' '$REMOTE_GE/$dir/${base}.js' && rm -f '$REMOTE_GE/$dir/${base}.ts' '$TMP/${base}.ts' && echo ok:$f"
}

publish_ge "Services/Community/starWarsCreditsBridge.ts"
publish_ge "Services/Community/activeEconomyService.ts"
publish_ge "Services/Community/serverEconomyService.ts"

ssh vinili 'pm2 restart bots-vinyls >/dev/null; sleep 2; node -e "
const s=require(\"/opt/bot/bots-ts/archivio/giochi-economia/src/Vinili/Services/Community/activeEconomyService\");
const b=require(\"/opt/bot/bots-ts/archivio/giochi-economia/src/Vinili/Services/Community/starWarsCreditsBridge\");
const fake={config:require(\"/opt/bot/bots-ts/src/Vinili/config.json\")};
console.log(\"economyLive\", s.isServerEconomyEnabled(fake));
console.log(\"walletGuild\", b.walletGuildId(fake, \"999\"));
console.log(\"hasAssert\", typeof s.assertServerEconomyAccess);
"'
