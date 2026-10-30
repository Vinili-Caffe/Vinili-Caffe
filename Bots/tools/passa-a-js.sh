#!/usr/bin/env bash
# Passaggio UNA TANTUM della VPS al JavaScript compilato + processi uniti + Mongo più leggero.
# Da Git Bash nella cartella Bots:   bash tools/passa-a-js.sh
#   PROVA=1 bash tools/passa-a-js.sh   → controlli e compilazione, niente sulla VPS
# Cosa fa:
#  1. compila src/ (tools/compila.mjs) e confronta i .js con i .ts modulo per modulo (tools/confronta-js.mjs)
#  2. controlla che i .ts della VPS siano quelli locali (a parte i file modificati qui e non ancora in git)
#  3. sulla VPS: backup completo in /root/vc_bot_bak_<data>-js con ripristina.sh, poi al posto di ogni .ts
#     mette il suo .js, aggiorna ecosystem/watchdog/Mongo e riavvia i processi con i nomi nuovi
# Salta le cartelle che sulla VPS sono collegamenti ai bot vecchi (Vinili/Data, UI, Photos, Caffè/Data) e
# i .js che la VPS ha già (idsCatalog.js lo rigenera il bot): lì non cambia niente.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT_REPO="$(cd .. && pwd)"
SKIP_RE='^(Vinili/Data|Vinili/UI|Vinili/Photos|Caffè/Data)/'
TMP="build/passa-js"
rm -rf "$TMP"; mkdir -p "$TMP"

echo "== 1/4 compilo e confronto"
node tools/compila.mjs
for f in $(cd build/js && find . -name '*.js' | sed 's#^\./##'); do node --check "build/js/$f" || { echo "sintassi non valida: $f" >&2; exit 1; }; done
[ -n "${SALTA_CONFRONTO:-}" ] || node tools/confronta-js.mjs

echo "== 2/4 controllo che la VPS abbia gli stessi .ts"
( cd src && find . -path '*/node_modules' -prune -o -name '*.ts' ! -name '*.d.ts' -print0 | xargs -0 md5sum ) | sed 's#  *\*\?\./#  #' | sort -k2 > "$TMP/loc.txt"
ssh vinili 'cd /opt/bot/bots-ts/src && [ -f wait-for-lavalink.ts ] || { echo "GIA_JS"; exit 0; }; find . -path "*/node_modules" -prune -o -name "*.ts" ! -name "*.d.ts" -print0 | xargs -0 md5sum | sed "s#  *\./#  #" | sort -k2' > "$TMP/vps.txt"
grep -q '^GIA_JS' "$TMP/vps.txt" && { echo "la VPS è già passata al JavaScript: per gli aggiornamenti usa tools/pubblica.sh" >&2; exit 1; }
# file cambiati qui e non ancora in git: è normale che siano diversi dalla VPS
( cd "$ROOT_REPO" && { git diff --name-only HEAD -- Bots/src; git ls-files --others --exclude-standard -- Bots/src; } ) | sed 's#^Bots/src/##' | sort -u > "$TMP/locali.txt"
node -e '
const fs=require("fs");const [loc,vps,mine]=process.argv.slice(1).map(f=>fs.readFileSync(f,"utf8"));
const rd=t=>new Map(t.trim().split("\n").filter(Boolean).map(l=>{const m=l.match(/^(\S+)\s+(.+)$/);return [m[2],m[1]]}));
const L=rd(loc),V=rd(vps),M=new Set(mine.trim().split("\n").filter(Boolean));
const bad=[...V].filter(([k,v])=>L.get(k)!==v&&!M.has(k)).map(([k])=>k);
if(bad.length){console.error("sulla VPS questi .ts sono diversi da quelli locali (modificati là?):\n  "+bad.join("\n  "));process.exit(1)}
console.log(`ok: ${V.size} file uguali o modificati qui apposta (${M.size} locali)`);' "$TMP/loc.txt" "$TMP/vps.txt" "$TMP/locali.txt"

echo "== 3/4 preparo il pacchetto"
ssh vinili 'cd /opt/bot/bots-ts/src && find . -path "*/node_modules" -prune -o -name "*.js" -print | sed "s#^\./##"' > "$TMP/vps-js.txt"
( cd build/js && find . -name '*.js' | sed 's#^\./##' ) | grep -Ev "$SKIP_RE" | grep -vxF -f "$TMP/vps-js.txt" | sort > "$TMP/lista.txt"
echo "$(wc -l < "$TMP/lista.txt") file .js da installare (saltati: cartelle dei bot vecchi e $(wc -l < "$TMP/vps-js.txt") .js già presenti)"
tar -czf "$TMP/js.tgz" -C build/js -T "$TMP/lista.txt"

if [ -n "${PROVA:-}" ]; then echo "prova finita: niente caricato sulla VPS"; exit 0; fi

echo "== 4/4 carico e riavvio sulla VPS"
scp -q "$TMP/js.tgz" vinili:/tmp/vc_js.tgz
scp -q "$ROOT_REPO/ecosystem.config.cjs" vinili:/tmp/vc_ecosystem.config.cjs
scp -q "$ROOT_REPO/Deploy/ha/hostWatchdogApp.js" vinili:/tmp/vc_hostWatchdogApp.js
scp -q "$ROOT_REPO/Deploy/docker-mongodb-compose.yml" vinili:/tmp/vc_docker-mongodb-compose.yml
ssh vinili 'bash -s' <<'REMOTE'
set -euo pipefail
B=/root/vc_bot_bak_$(date +%Y%m%d-%H%M%S)-js
mkdir -p "$B"
cd /opt/bot/bots-ts/src
find . -path "*/node_modules" -prune -o -name "*.ts" ! -name "*.d.ts" -print | sed "s#^\./##" > "$B/ts-list.txt"
tar -czf "$B/ts.tgz" -T "$B/ts-list.txt"
tar -tzf /tmp/vc_js.tgz > "$B/js-list.txt"
cp -a /opt/bot/ecosystem.config.cjs "$B/"
cp -a /opt/bot/deploy/ha/hostWatchdogApp.js "$B/"
cp -a /opt/bot/deploy/docker-mongodb-compose.yml "$B/"
cp -a /root/.pm2/dump.pm2 "$B/" 2>/dev/null || true
cat > "$B/ripristina.sh" <<EOF
#!/usr/bin/env bash
# Torna a com'era prima del passaggio al JavaScript (TS con tsx, processi separati, Mongo 0.4).
set -uo pipefail
pm2 delete vote-intake bot-workers auto-backup site-api bots-vinyls bots-coffee host-watchdog >/dev/null 2>&1
cd /opt/bot/bots-ts/src && xargs -r rm -f < "$B/js-list.txt" && tar -xzf "$B/ts.tgz"
cp -a "$B/ecosystem.config.cjs" /opt/bot/ecosystem.config.cjs
cp -a "$B/hostWatchdogApp.js" /opt/bot/deploy/ha/hostWatchdogApp.js
cp -a "$B/docker-mongodb-compose.yml" /opt/bot/deploy/docker-mongodb-compose.yml
( cd /opt/bot/deploy && bash start-mongo.sh >/dev/null )
cd /opt/bot && pm2 start ecosystem.config.cjs --only "discadia-votes,topgg-votes,vote-drain,site-api,partnership-migration,bot-scheduler,community-poll,auto-backup,host-watchdog,bots-vinyls,bots-coffee"
pm2 save
EOF
chmod +x "$B/ripristina.sh"
echo "backup e ripristino in $B (bash $B/ripristina.sh)"

tar -xzf /tmp/vc_js.tgz
xargs -r rm -f < "$B/ts-list.txt"
install -m 644 /tmp/vc_ecosystem.config.cjs /opt/bot/ecosystem.config.cjs
install -m 755 /tmp/vc_hostWatchdogApp.js /opt/bot/deploy/ha/hostWatchdogApp.js
install -m 644 /tmp/vc_docker-mongodb-compose.yml /opt/bot/deploy/docker-mongodb-compose.yml

echo "riavvio Mongo con la cache a 0.3 GB"
( cd /opt/bot/deploy && bash start-mongo.sh >/dev/null )
for i in $(seq 1 30); do docker exec vc-mongodb mongosh --quiet --eval "db.runCommand({ping:1}).ok" >/dev/null 2>&1 && break; sleep 2; done

echo "riavvio i processi"
pm2 delete discadia-votes topgg-votes vote-drain partnership-migration bot-scheduler community-poll auto-backup site-api bots-vinyls bots-coffee host-watchdog >/dev/null 2>&1 || true
cd /opt/bot && pm2 start ecosystem.config.cjs --only "vote-intake,site-api,bot-workers,auto-backup,host-watchdog,bots-vinyls,bots-coffee" >/dev/null
pm2 save >/dev/null
sleep 60
pm2 ls
free -m
echo "se qualcosa non va: bash $B/ripristina.sh"
REMOTE
