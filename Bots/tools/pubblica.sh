#!/usr/bin/env bash
# Pubblica TypeScript su VPS in /opt/bot/bots-ts/src (runtime solo TS + tsx).
# Uso (da Git Bash, dalla cartella bots-ts):
#   bash tools/pubblica.sh "Vinyls/Utils/noDmPanel.ts Vinyls/Triggers/buttons.ts" "bots-vinyls"
#   bash tools/pubblica.sh "Vinyls/Utils/Web/siteStaffCompitiApi.ts" "site-api"
# Percorsi relativi a src/. Backup in /root/vc_bot_bak_<data>.
set -euo pipefail
FILES="${1:?file da pubblicare (relativi a src/, es. Vinyls/Utils/x.ts)}"
PROCS="${2:?processi da riavviare (es. bots-vinyls, bots-coffee, site-api)}"
cd "$(dirname "$0")/.."

LIST=""
for f in $FILES; do
  f="${f#./}"
  f="${f#src/}"
  src="src/$f"
  [ -f "$src" ] || { echo "manca $src" >&2; exit 1; }
  [ -n "${PROVA:-}" ] && { echo "ok (prova): $f"; continue; }
  tmpname="$(echo "bots-ts/src/$f" | tr '/' '_')"
  scp -q "$src" "vinili:/tmp/vcbot_$tmpname"
  LIST="$LIST $f"
done

[ -n "${PROVA:-}" ] && { echo "prova finita: niente caricato sulla VPS"; exit 0; }
echo "carico TS su /opt/bot/bots-ts/src e riavvio: $PROCS"
ssh vinili "FILES='$LIST' PROCS='$PROCS' bash -s" <<'REMOTE'
set -euo pipefail
B=/root/vc_bot_bak_$(date +%Y%m%d-%H%M%S)
mkdir -p "$B"
for f in $FILES; do
  tmp="/tmp/vcbot_$(echo "bots-ts/src/$f" | tr '/' '_')"
  dest="/opt/bot/bots-ts/src/$f"
  if [ -f "$dest" ]; then mkdir -p "$B/$(dirname "bots-ts/src/$f")"; cp -a "$dest" "$B/bots-ts/src/$f"; fi
  mkdir -p "$(dirname "$dest")"
  install -m 644 "$tmp" "$dest"
done
for p in $PROCS; do pm2 restart "$p" >/dev/null; done
sleep 12
pm2 ls | grep -E " ($(echo $PROCS | tr ' ' '|')) " || pm2 ls
echo "backup in $B"
REMOTE
