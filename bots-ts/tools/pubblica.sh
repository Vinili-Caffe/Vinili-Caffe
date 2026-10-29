#!/usr/bin/env bash
# Pubblica sulla VPS file dei bot presi da bots-ts (compilati in dist/), con backup e controllo sintassi,
# poi riavvia i processi indicati. Prende il posto di WebSiteReact/scripts/pubblica-bot.sh ora che i bot
# si sviluppano in TypeScript.
# Uso (da Git Bash, dalla cartella bots-ts):
#   bash tools/pubblica.sh "Vinyls/Utils/noDmPanel.ts Vinyls/Triggers/buttons.ts" "bots-vinyls"
#   bash tools/pubblica.sh "Vinyls/Utils/Web/siteStaffCompitiApi.ts" "site-api"
# I percorsi sono relativi a src/ (vanno bene .ts o .js). Backup in /root/vc_bot_bak_<data>.
set -euo pipefail
FILES="${1:?file da pubblicare (relativi a src/, es. Vinyls/Utils/x.ts)}"
PROCS="${2:?processi da riavviare (es. bots-vinyls, bots-coffee, site-api)}"
cd "$(dirname "$0")/.."

echo "compilo bots-ts…"
node tools/build.mjs | tail -1
echo "controllo che il JS sia quello previsto…"
node tools/verify.mjs | tail -1 || true
node tools/verify.mjs >/dev/null || { echo "verify fallito: il JS compilato non è come previsto, niente pubblicazione" >&2; exit 1; }

LIST=""
for f in $FILES; do
  js="${f%.ts}"; js="${js%.js}.js"
  [ -f "dist/$js" ] || { echo "manca dist/$js" >&2; exit 1; }
  node --check "dist/$js"
  [ -n "${PROVA:-}" ] && { echo "ok (prova): $js"; continue; }
  scp -q "dist/$js" "vinili:/tmp/vcbot_$(echo "$js" | tr '/' '_')"
  LIST="$LIST $js"
done

[ -n "${PROVA:-}" ] && { echo "prova finita: niente caricato sulla VPS"; exit 0; }
echo "carico sulla VPS e riavvio: $PROCS"
ssh vinili "FILES='$LIST' PROCS='$PROCS' bash -s" <<'REMOTE'
set -euo pipefail
N=/root/.nvm/versions/node/v22.22.2/bin/node
B=/root/vc_bot_bak_$(date +%Y%m%d-%H%M%S)
mkdir -p "$B"
for f in $FILES; do
  tmp="/tmp/vcbot_$(echo "$f" | tr '/' '_')"
  $N --check "$tmp"
  dest="/opt/bot/$f"
  if [ -f "$dest" ]; then mkdir -p "$B/$(dirname "$f")"; cp -a "$dest" "$B/$f"; fi
  mkdir -p "$(dirname "$dest")"
  install -m 644 "$tmp" "$dest"
done
for p in $PROCS; do pm2 restart "$p" >/dev/null; done
sleep 15
pm2 ls | grep -E " ($(echo $PROCS | tr ' ' '|')) "
echo "backup in $B"
REMOTE
