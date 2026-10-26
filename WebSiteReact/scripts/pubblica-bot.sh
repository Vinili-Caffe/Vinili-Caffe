#!/usr/bin/env bash
# Pubblica file del bot sulla VPS con backup e controllo sintassi, poi riavvia i processi indicati.
# Uso (dalla cartella WebSiteReact):
#   bash scripts/pubblica-bot.sh "Utils/Web/a.js Utils/Web/b.js" "site-api"
#   bash scripts/pubblica-bot.sh "Events/x.js" "bots site-api"
# I percorsi sono relativi a Vinyls/. Il backup finisce in /root/vc_bot_bak_<data>.
set -euo pipefail
FILES="${1:?file da pubblicare (relativi a Vinyls/)}"
PROCS="${2:-site-api}"
cd "$(dirname "$0")/../../Vinyls"
for f in $FILES; do
  [ -f "$f" ] || { echo "manca $f" >&2; exit 1; }
  node --check "$f"
  scp -q "$f" "vinili:/tmp/vcbot_$(echo "$f" | tr '/' '_')"
done
ssh vinili "FILES='$FILES' PROCS='$PROCS' bash -s" <<'REMOTE'
set -euo pipefail
N=/root/.nvm/versions/node/v22.22.2/bin/node
B=/root/vc_bot_bak_$(date +%Y%m%d-%H%M%S)
mkdir -p "$B"
for f in $FILES; do
  tmp="/tmp/vcbot_$(echo "$f" | tr '/' '_')"
  $N --check "$tmp"
  dest="/opt/bot/Vinyls/$f"
  if [ -f "$dest" ]; then mkdir -p "$B/$(dirname "$f")"; cp -a "$dest" "$B/$f"; fi
  mkdir -p "$(dirname "$dest")"
  install -m 644 "$tmp" "$dest"
done
for p in $PROCS; do pm2 restart "$p" >/dev/null; done
sleep 15
pm2 ls | grep -E " ($(echo $PROCS | tr ' ' '|')) "
echo "backup in $B"
REMOTE
