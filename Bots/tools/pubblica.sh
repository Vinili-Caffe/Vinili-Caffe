#!/usr/bin/env bash
# Pubblica sulla VPS (/opt/bot/bots-ts/src). Si scrive sempre in TypeScript: qui ogni .ts viene compilato
# in .js (tools/compila.mjs) e sulla VPS il .js prende il posto del .ts (niente tsx a runtime).
# Gli altri file (json, immagini…) si caricano così come sono.
# Uso (da Git Bash, dalla cartella Bots):
#   bash tools/pubblica.sh "Vinili/Utils/noDmPanel.ts Vinili/Triggers/buttons.ts" "bots-vinyls"
#   bash tools/pubblica.sh "Vinili/Utils/Web/siteStaffCompitiApi.ts" "site-api bot-workers"
#   PROVA=1 bash tools/pubblica.sh "…" "…"   → compila e controlla, niente sulla VPS
# Percorsi relativi a src/. Backup in /root/vc_bot_bak_<data>. Processi: bots-vinyls, bots-coffee,
# site-api, bot-workers (vote-drain/scheduler/poll/partnership), vote-intake (Top.gg/Discadia), auto-backup.
set -euo pipefail
FILES="${1:?file da pubblicare (relativi a src/, es. Vinili/Utils/x.ts)}"
PROCS="${2:?processi da riavviare (es. bots-vinyls, bots-coffee, site-api, bot-workers)}"
cd "$(dirname "$0")/.."

TS_LIST=""
UP_LIST=""
for f in $FILES; do
  f="${f#./}"
  f="${f#src/}"
  [ -f "src/$f" ] || { echo "manca src/$f" >&2; exit 1; }
  if [[ "$f" == *.ts && "$f" != *.d.ts ]]; then
    [[ "$f" == "Vinili/Utils/Config/idsCatalog.ts" ]] && { echo "idsCatalog.js lo rigenera il bot sulla VPS: non si sovrascrive" >&2; exit 1; }
    TS_LIST="$TS_LIST $f"
    UP_LIST="$UP_LIST ${f%.ts}.js"
  else
    UP_LIST="$UP_LIST $f"
  fi
done

if [ -n "$TS_LIST" ]; then
  # shellcheck disable=SC2086
  node tools/compila.mjs $TS_LIST
  for f in $TS_LIST; do node --check "build/js/${f%.ts}.js"; done
fi

if [ -n "${PROVA:-}" ]; then
  for f in $UP_LIST; do echo "ok (prova): $f"; done
  echo "prova finita: niente caricato sulla VPS"
  exit 0
fi

ssh vinili '[ ! -f /opt/bot/bots-ts/src/wait-for-lavalink.ts ]' || {
  echo "la VPS gira ancora con tsx sui .ts: lancia prima una volta bash tools/passa-a-js.sh" >&2
  exit 1
}

for f in $UP_LIST; do
  if [[ "$f" == *.js && -f "build/js/$f" && -f "src/${f%.js}.ts" ]]; then src="build/js/$f"; else src="src/$f"; fi
  scp -q "$src" "vinili:/tmp/vcbot_$(echo "$f" | tr '/' '_')"
done

echo "carico su /opt/bot/bots-ts/src e riavvio: $PROCS"
ssh vinili "FILES='$UP_LIST' PROCS='$PROCS' bash -s" <<'REMOTE'
set -euo pipefail
B=/root/vc_bot_bak_$(date +%Y%m%d-%H%M%S)
mkdir -p "$B"
for f in $FILES; do
  tmp="/tmp/vcbot_$(echo "$f" | tr '/' '_')"
  dest="/opt/bot/bots-ts/src/$f"
  mkdir -p "$B/$(dirname "$f")" "$(dirname "$dest")"
  [ -f "$dest" ] && cp -a "$dest" "$B/$f"
  # il .ts al posto del quale arriva il .js: nel backup e via (due file uguali verrebbero caricati due volte)
  ts="${dest%.js}.ts"
  if [[ "$f" == *.js && -f "$ts" ]]; then cp -a "$ts" "$B/${f%.js}.ts"; rm -f "$ts"; fi
  install -m 644 "$tmp" "$dest"
  rm -f "$tmp"
done
for p in $PROCS; do pm2 restart "$p" >/dev/null 2>&1 || echo "ATTENZIONE: pm2 non trova $p (non riavviato)"; done
sleep 12
pm2 ls | grep -E " ($(echo $PROCS | tr ' ' '|')) " || pm2 ls
echo "backup in $B"
REMOTE
