#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOTS="$ROOT/Bots"
REMOTE_SW="/opt/bot/bots-ts/archivio/starwars/src/Vinili"
REMOTE_GE="/opt/bot/bots-ts/archivio/giochi-economia/src/Vinili"
TMP="/tmp/vc_sw_end"

ssh vinili "mkdir -p /opt/bot/bots-ts/tools '$TMP'"
scp -q "$ROOT/Deploy/_compile_one_archivio.cjs" "vinili:/opt/bot/bots-ts/tools/_compile_one_archivio.cjs"

publish() {
  local root_local="$1" remote_root="$2" f="$3"
  local base dir
  base="$(basename "$f" .ts)"
  dir="$(dirname "$f")"
  scp -q "$root_local/$f" "vinili:$TMP/${base}.ts"
  ssh vinili "mkdir -p '$remote_root/$dir' && node /opt/bot/bots-ts/tools/_compile_one_archivio.cjs '$TMP/${base}.ts' '$remote_root/$dir/${base}.js' && rm -f '$remote_root/$dir/${base}.ts' '$TMP/${base}.ts' && echo ok:$f"
}

for f in \
  Utils/Eventi/starWarsEventConfig.ts \
  Utils/Eventi/starWarsEventCalendar.ts \
  EventPlugins/starwars/runtimeKillSwitch.ts \
  Web/siteStarWarsEventoApi.ts
do
  publish "$BOTS/archivio/starwars/src/Vinili" "$REMOTE_SW" "$f"
done

for f in \
  Services/Community/activeEconomyService.ts \
  Services/Community/serverEconomyService.ts
do
  publish "$BOTS/archivio/giochi-economia/src/Vinili" "$REMOTE_GE" "$f"
done

ssh vinili 'pm2 restart bots-vinyls site-api >/dev/null; sleep 2; node -e "
const c=require(\"/opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventConfig\");
const cal=require(\"/opt/bot/bots-ts/archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventCalendar\");
const fake={config:require(\"/opt/bot/bots-ts/src/Vinili/config.json\")};
const end=new Date(fake.config.starWarsEvent.endDate+\"+01:00\");
console.log(\"endDate\", fake.config.starWarsEvent.endDate);
console.log(\"endMs\", c.resolveStarWarsEventConfig(fake).endMs, new Date(c.resolveStarWarsEventConfig(fake).endMs).toISOString());
console.log(\"pastEnd now\", c.isPastStarWarsEventEnd(fake));
console.log(\"live now\", c.isStarWarsEventLive(fake));
const after=new Date(\"2027-02-28T21:01:00+01:00\");
console.log(\"past after 21:01\", c.isPastStarWarsEventEnd(fake, after));
console.log(\"live after 21:01\", c.isStarWarsEventLive(fake, after));
const st=cal.resolveFeatureStateAtStamp(\"2027-02-28T21:00\");
console.log(\"features at close\", (st.features||[]).join(\",\")||\"(none)\", \"economyOn\", st.economyOn);
"'
