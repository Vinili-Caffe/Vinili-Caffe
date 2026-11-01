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
( cd build/js && find . -name '*.js' | sed 's#^\./##' | grep -v '^Vinili/Utils/Config/idsCatalog\.js$' | LC_ALL=C sort ) > "$TMP/lista.txt"
if [ -d build/archivio ]; then
  ( cd build/archivio && find . -name '*.js' | sed 's#^\./##' | LC_ALL=C sort ) > "$TMP/lista-archivio.txt"
else
  : > "$TMP/lista-archivio.txt"
fi
node tools/controlla-sintassi.cjs build/js "$TMP/lista.txt"
node tools/controlla-sintassi.cjs build/archivio "$TMP/lista-archivio.txt"

PRUNE='\( -path "*/node_modules" -o -path ./Vinili/Data -o -path ./Caffè/Data -o -path ./Vinili/UI -o -path "*/logs" \) -prune -o'
mkdir -p "$TMP"
ssh vinili "cd /opt/bot/bots-ts/src && find . $PRUNE -name '*.js' -print | sed 's#^\./##' | LC_ALL=C sort" > "$TMP/vps.txt"
# Stesso ordinamento qui e sulla VPS (LC_ALL=C): con locale diversi `comm` segna da togliere file che esistono.
LC_ALL=C comm -13 --check-order "$TMP/lista.txt" "$TMP/vps.txt" | grep -v '^Vinili/Utils/Config/idsCatalog\.js$' > "$TMP/da-togliere.txt" || true
echo "$(wc -l < "$TMP/lista.txt") js src, $(wc -l < "$TMP/lista-archivio.txt") js archivio, $(wc -l < "$TMP/da-togliere.txt") da togliere dal server:"
sed 's/^/  - /' "$TMP/da-togliere.txt" | head -60
if [ -n "${PROVA:-}" ]; then echo "prova finita: niente sulla VPS"; exit 0; fi
# Freno di sicurezza: una quantità anomala di file da togliere vuol dire che qualcosa non va.
if [ "$(wc -l < "$TMP/da-togliere.txt")" -gt "${MAX_TOGLIERE:-40}" ]; then
  echo "STOP: troppi file da togliere (>${MAX_TOGLIERE:-40}). Controlla la lista; se è giusta rilancia con MAX_TOGLIERE=<n>." >&2
  exit 1
fi

tar -czf "$TMP/js.tgz" -C build/js -T "$TMP/lista.txt"
tar -czf "$TMP/archivio.tgz" -C build/archivio -T "$TMP/lista-archivio.txt" 2>/dev/null || tar -czf "$TMP/archivio.tgz" -T /dev/null
scp -q "$TMP/js.tgz" vinili:/tmp/vc_sync_js.tgz
scp -q "$TMP/archivio.tgz" vinili:/tmp/vc_sync_archivio.tgz
scp -q "$TMP/da-togliere.txt" vinili:/tmp/vc_sync_togliere.txt
# config/permissions (non sono .js ma servono al runtime)
scp -q src/Vinili/permissions.json vinili:/tmp/vc_sync_permissions.json
scp -q src/Vinili/config.json vinili:/tmp/vc_sync_config.json
ssh vinili "PROCS='$PROCS' bash -s" <<'REMOTE'
set -euo pipefail
B=/root/vc_bot_bak_$(date +%Y%m%d-%H%M%S)-sync
mkdir -p "$B"
cd /opt/bot/bots-ts/src
find . \( -path "*/node_modules" -o -path ./Vinili/Data -o -path ./Caffè/Data -o -path ./Vinili/UI -o -path "*/logs" \) -prune -o -name "*.js" -print > "$B/js-prima.txt"
tar -czf "$B/js-prima.tgz" -T "$B/js-prima.txt"
if [ -d /opt/bot/bots-ts/archivio ]; then
  tar -czf "$B/archivio-prima.tgz" -C /opt/bot/bots-ts archivio || true
fi
[ -f Vinili/permissions.json ] && cp -a Vinili/permissions.json "$B/permissions.json" || true
[ -f Vinili/config.json ] && cp -a Vinili/config.json "$B/config.json" || true
cat > "$B/ripristina.sh" <<EOF
#!/usr/bin/env bash
# Rimette il codice com'era prima della sincronizzazione.
set -uo pipefail
cd /opt/bot/bots-ts/src
tar -tzf /tmp/vc_sync_js.tgz 2>/dev/null | xargs -r rm -f
tar -xzf "$B/js-prima.tgz"
if [ -f "$B/archivio-prima.tgz" ]; then
  rm -rf /opt/bot/bots-ts/archivio
  tar -xzf "$B/archivio-prima.tgz" -C /opt/bot/bots-ts
fi
[ -f "$B/permissions.json" ] && cp -a "$B/permissions.json" Vinili/permissions.json
[ -f "$B/config.json" ] && cp -a "$B/config.json" Vinili/config.json
for p in $PROCS; do pm2 restart "\$p" >/dev/null 2>&1 || echo "pm2 non trova \$p"; done
pm2 ls
EOF
chmod +x "$B/ripristina.sh"
cp /tmp/vc_sync_js.tgz "$B/js-nuovi.tgz"
tar -xzf /tmp/vc_sync_js.tgz
xargs -r rm -f < /tmp/vc_sync_togliere.txt
find . -path "*/node_modules" -prune -o -type d -empty -print | grep -v "/Data\|/UI\|/logs" | xargs -r rmdir 2>/dev/null || true
rm -rf /opt/bot/bots-ts/archivio
mkdir -p /opt/bot/bots-ts/archivio
tar -xzf /tmp/vc_sync_archivio.tgz -C /opt/bot/bots-ts/archivio
install -m 644 /tmp/vc_sync_permissions.json Vinili/permissions.json
install -m 644 /tmp/vc_sync_config.json Vinili/config.json
rm -f /tmp/vc_sync_togliere.txt /tmp/vc_sync_archivio.tgz /tmp/vc_sync_permissions.json /tmp/vc_sync_config.json
for p in $PROCS; do pm2 restart "$p" >/dev/null 2>&1 || echo "ATTENZIONE: pm2 non trova $p (non riavviato)"; done
sleep 40
pm2 ls | grep -E " ($(echo $PROCS | tr ' ' '|')) " || pm2 ls
for u in 3000/webhooks/health 3020/webhooks/site-api/health 3014/webhooks/topgg/health 3010/webhooks/discadia/health; do
  curl -s -o /dev/null -w "$u %{http_code}\n" "http://127.0.0.1:$u" || true
done
echo "backup e ripristino in $B (bash $B/ripristina.sh)"
REMOTE
