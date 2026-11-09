#!/usr/bin/env bash
# Recupera i transcript HTML completi dalla VPS vecchia (vinili) alla nuova (vinili-ca).
# Il bot tiene nel database solo i primi 2000 caratteri; il transcript completo è un file in
# <Vinili>/local_transcripts/<guildId>/transcript_<canale>_<ms>.html (cancellato dopo 90 giorni).
#
# Uso (PowerShell):
#   & "C:\Program Files\Git\bin\bash.exe" -lc 'cd /c/Users/corva/Desktop/Vinili*/Deploy && bash recupera-transcript.sh'
#     → solo controllo: dove sono, quanti file, quanto pesano. Non copia niente.
#   & "C:\Program Files\Git\bin\bash.exe" -lc 'cd /c/Users/corva/Desktop/Vinili*/Deploy && COPIA=1 bash recupera-transcript.sh'
#     → copia sulla nuova i file che mancano (quelli già presenti non vengono toccati).
#
# I file passano dal tuo PC (vecchia → PC → nuova) compressi: non serve che le due VPS si parlino.
# La data dei file resta quella originale, così la pulizia dei 90 giorni continua a funzionare giusta.
set -euo pipefail

OLD="${VC_OLD_HOST:-vinili}"
NEW="${VC_NEW_HOST:-vinili-ca}"
NEW_DIR="${VC_NEW_DIR:-/opt/bot/bots-ts/src/Vinili/local_transcripts}"

find_dirs='for base in /opt /root /home /srv; do [ -d "$base" ] && find "$base" -maxdepth 7 -type d -name local_transcripts -not -path "*/node_modules/*" 2>/dev/null; done | sort -u'
count_in='d="$1"; n=$(find "$d" -type f -name "*.html" 2>/dev/null | wc -l); s=$(du -sh "$d" 2>/dev/null | cut -f1); echo "  $d  →  $n file ($s)"'

echo "== VPS vecchia ($OLD): cartelle local_transcripts"
OLD_DIRS=$(ssh "$OLD" "$find_dirs" || true)
if [ -z "$OLD_DIRS" ]; then
  echo "  nessuna cartella trovata: sulla vecchia i transcript non ci sono più."
  exit 0
fi
while IFS= read -r d; do ssh "$OLD" "bash -c '$count_in' _ '$d'"; done <<< "$OLD_DIRS"

echo
echo "== VPS nuova ($NEW): $NEW_DIR"
ssh "$NEW" "bash -c '$count_in' _ '$NEW_DIR'" 2>/dev/null || echo "  (cartella ancora vuota o assente)"

if [ -z "${COPIA:-}" ]; then
  echo
  echo "Solo controllo. Per copiare davvero: COPIA=1 bash recupera-transcript.sh"
  exit 0
fi

ssh "$NEW" "mkdir -p '$NEW_DIR'"
while IFS= read -r d; do
  [ -z "$d" ] && continue
  echo
  echo "== Copio $OLD:$d → $NEW:$NEW_DIR (salto i file già presenti)"
  # sudo -n: se sulla vecchia i file sono di root e l'utente ssh non lo è
  ssh "$OLD" "cd '$d' && (tar czf - . 2>/dev/null || sudo -n tar czf - .)" \
    | ssh "$NEW" "cd '$NEW_DIR' && tar xzf - --skip-old-files"
done <<< "$OLD_DIRS"

echo
echo "== Dopo la copia"
ssh "$NEW" "bash -c '$count_in' _ '$NEW_DIR'"
echo "Fatto. Non serve riavviare niente: la dashboard legge i file a ogni apertura."
