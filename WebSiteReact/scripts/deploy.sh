#!/bin/bash
# Pubblica out/ (dopo `npm run build`) su www.
#   bash scripts/deploy.sh www
#   SKIP_CHECK=1 bash scripts/deploy.sh www   # emergenza
# Swap atomico con backup in /root/vc_www_bak/ (ultimi 5).
# Rollback: ssh vinili, rimetti l'ultima cartella di backup al posto di DEST.
set -euo pipefail

TARGET="${1:-}"
case "$TARGET" in
  www) DEST=/var/www/viniliecaffe-react; HOST=www.viniliecaffe.it; BAK_PREFIX=viniliecaffe-react ;;
  beta)
    echo "beta dismessa: usa solo www (beta.viniliecaffe.it → redirect a www)" >&2
    exit 1
    ;;
  *) echo "uso: bash scripts/deploy.sh www" >&2; exit 1 ;;
esac

[ -f out/index.html ] || { echo "manca out/: lancia prima npm run build" >&2; exit 1; }

if [ "${SKIP_CHECK:-0}" != 1 ]; then
  MSYS_NO_PATHCONV=1 node scripts/check-site.mjs || { echo "controllo fallito: www non aggiornato" >&2; exit 1; }
fi

TGZ=/tmp/vc-react-out.tgz
tar -czf "$TGZ" -C out .
scp -q "$TGZ" vinili:/root/vc-react-out.tgz

ssh -o ClearAllForwardings=yes vinili "DEST=$DEST HOST=$HOST BAK_PREFIX=$BAK_PREFIX bash -s" <<'REMOTE'
set -euo pipefail
NAME="${BAK_PREFIX:-$(basename "$DEST")}"
mkdir -p /root/vc_www_bak
[ -d "$DEST" ] && cp -a "$DEST" "/root/vc_www_bak/${NAME}-$(date +%Y%m%d-%H%M%S)"
N="$DEST.new"; rm -rf "$N"; mkdir -p "$N"
tar -xzf /root/vc-react-out.tgz -C "$N"
chown -R www-data:www-data "$N" 2>/dev/null || true
rm -rf "$DEST.old"; [ -d "$DEST" ] && mv "$DEST" "$DEST.old"; mv "$N" "$DEST"; rm -rf "$DEST.old"
ls -1dt /root/vc_www_bak/${NAME}-* 2>/dev/null | tail -n +6 | xargs -r rm -rf
for p in / /tickets/ /sponsor/ /sw.js; do
  printf "%s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' --resolve "$HOST:443:127.0.0.1" "https://$HOST$p")"
done
REMOTE
echo "pubblicato su $TARGET"

if [ "${SKIP_CHECK:-0}" != 1 ]; then
  sleep 3
  if ! CHECK_ORIGIN="https://$HOST" MSYS_NO_PATHCONV=1 node scripts/check-site.mjs / /regole/ /wiki/ /vote/ /perks/ /wordle/ /classifiche/; then
    echo "controllo dal vivo fallito: rimetto la versione precedente" >&2
    ssh -o ClearAllForwardings=yes vinili "DEST=$DEST BAK_PREFIX=$BAK_PREFIX bash -s" <<'ROLLBACK'
set -euo pipefail
NAME="${BAK_PREFIX:-$(basename "$DEST")}"
PREV=$(ls -1dt /root/vc_www_bak/${NAME}-* | head -1)
rm -rf "$DEST.bad"; mv "$DEST" "$DEST.bad"; cp -a "$PREV" "$DEST"; rm -rf "$DEST.bad"
echo "ripristinata $PREV"
ROLLBACK
    exit 1
  fi
fi
