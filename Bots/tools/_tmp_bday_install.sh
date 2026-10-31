#!/bin/bash
set -euo pipefail
FILES="Vinili/Services/Community/birthdayService.js Vinili/Services/Community/profileStore.js Vinili/Services/Community/expService.js Vinili/Web/siteProfileExtrasApi.js"
PROCS="bots-vinyls site-api"
B=/root/vc_bot_bak_$(date +%Y%m%d-%H%M%S)
mkdir -p "$B"
for f in $FILES; do
  tmp="/tmp/vcbot_$(echo "$f" | tr '/' '_')"
  dest="/opt/bot/bots-ts/src/$f"
  mkdir -p "$B/$(dirname "$f")" "$(dirname "$dest")"
  [ -f "$dest" ] && cp -a "$dest" "$B/$f"
  ts="${dest%.js}.ts"
  if [[ "$f" == *.js && -f "$ts" ]]; then cp -a "$ts" "$B/${f%.js}.ts"; rm -f "$ts"; fi
  install -m 644 "$tmp" "$dest"
  rm -f "$tmp"
  echo "installed $dest"
done
for p in $PROCS; do pm2 restart "$p" >/dev/null; done
sleep 12
pm2 ls | grep -E " (bots-vinyls|site-api) " || pm2 ls
echo "backup in $B"
grep -n "birthdayFlair\|isBirthdayDayChangeLocked\|BIRTHDAY_PERSONALIZZA\|birthday_locked" \
  /opt/bot/bots-ts/src/Vinili/Services/Community/birthdayService.js \
  /opt/bot/bots-ts/src/Vinili/Services/Community/expService.js \
  /opt/bot/bots-ts/src/Vinili/Web/siteProfileExtrasApi.js | head -40
