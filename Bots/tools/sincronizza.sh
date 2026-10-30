#!/usr/bin/env bash
# Allinea TUTTO il codice dei bot sulla VPS a quello compilato qui (dopo spostamenti/archiviazioni di file):
# carica ogni .js di build/js e toglie dal server i .js che in locale non esistono più.
# Non tocca: node_modules, Vinili/Data, Caffè/Data, Vinili/UI, log, idsCatalog.js (lo rigenera il bot).
# Backup completo del codice e ripristino in /root/vc_bot_bak_<data>-sync.
# Da Git Bash nella cartella Bots:
#   bash tools/sincronizza.sh                       → riavvia tutti i processi dei bot
#   PROVA=1 bash tools/sincronizza.sh               → mostra cosa farebbe, niente sulla VPS
set -euo pipefail
cd "$(dirname "$0")/.."
PROCS="${PROCS:-bots-vinyls bots-coffee site-api bot-workers vote-intake}"
TMP="build/sync"
rm -rf "$TMP"; mkdir -p "$TMP"

node tools/compila.mjs >/dev/null
node tools/controlla-archivio.cjs | tail -1
( cd build/js && find . -name '*.js' | sed 's#^\./##' | grep -v '^Vinili/Utils/Config/idsCatalog\.js$' | sort ) > "$TMP/lista.txt"
for f in $(cat "$TMP/lista.txt"); do node --check "build/js/$f"; done

PRUNE='\( -path "*/node_modules" -o -path ./Vinili/Data -o -path ./Caffè/Data -o -path ./Vinili/UI -o -path "*/logs" \) -prune -o'
ssh vinili "cd /opt/bot/bots-ts/src && find . $PRUNE -name '*.js' -print | sed 's#^\./##' | sort" > "$TMP/vps.txt"
comm -13 "$TMP/lista.txt" "$TMP/vps.txt" | grep -v '^Vinili/Utils/Config/idsCatalog\.js$' > "$TMP/da-togliere.txt" || true
echo "$(wc -l < "$TMP/lista.txt") file da caricare, $(wc -l < "$TMP/da-togliere.txt") da togliere dal server:"
sed 's/^/  - /' "$TMP/da-togliere.txt" | head -60
if [ -n "${PROVA:-}" ]; then echo "prova finita: niente sulla VPS"; exit 0; fi

tar -czf "$TMP/js.tgz" -C build/js -T "$TMP/lista.txt"
scp -q "$TMP/js.tgz" vinili:/tmp/vc_sync_js.tgz
scp -q "$TMP/da-togliere.txt" vinili:/tmp/vc_sync_togliere.txt
ssh vinili "PROCS='$PROCS' bash -s" <<'REMOTE'
set -euo pipefail
B=/root/vc_bot_bak_$(date +%Y%m%d-%H%M%S)-sync
mkdir -p "$B"
cd /opt/bot/bots-ts/src
find . \( -path "*/node_modules" -o -path ./Vinili/Data -o -path ./Caffè/Data -o -path ./Vinili/UI -o -path "*/logs" \) -prune -o -name "*.js" -print > "$B/js-prima.txt"
tar -czf "$B/js-prima.tgz" -T "$B/js-prima.txt"
cat > "$B/ripristina.sh" <<EOF
#!/usr/bin/env bash
# Rimette il codice com'era prima della sincronizzazione.
set -uo pipefail
cd /opt/bot/bots-ts/src
tar -tzf /tmp/vc_sync_js.tgz 2>/dev/null | xargs -r rm -f
tar -xzf "$B/js-prima.tgz"
pm2 restart $PROCS >/dev/null
pm2 ls
EOF
chmod +x "$B/ripristina.sh"
cp /tmp/vc_sync_js.tgz "$B/js-nuovi.tgz"
tar -xzf /tmp/vc_sync_js.tgz
xargs -r rm -f < /tmp/vc_sync_togliere.txt
find . -path "*/node_modules" -prune -o -type d -empty -print | grep -v "/Data\|/UI\|/logs" | xargs -r rmdir 2>/dev/null || true
rm -f /tmp/vc_sync_togliere.txt
pm2 restart $PROCS >/dev/null
sleep 40
pm2 ls | grep -E " ($(echo $PROCS | tr ' ' '|')) " || pm2 ls
for u in 3000/webhooks/health 3020/webhooks/site-api/health 3014/webhooks/topgg/health 3010/webhooks/discadia/health; do
  curl -s -o /dev/null -w "$u %{http_code}\n" "http://127.0.0.1:$u" || true
done
echo "backup e ripristino in $B (bash $B/ripristina.sh)"
REMOTE
