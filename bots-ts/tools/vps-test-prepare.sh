#!/usr/bin/env bash
# Prepara sulla VPS /opt/bot-ts-test per provare i bot compilati da TypeScript, senza toccare /opt/bot:
#   - il codice .js arriva dall'archivio compilato (/tmp/vc-bots-ts.tgz);
#   - tutto il resto (dati, config, .env, pacchetti, font) sono collegamenti ai file veri di /opt/bot.
# Le cartelle senza codice (es. Data) si collegano intere, così i bot scrivono nei dati veri come al solito.
set -euo pipefail
B=/opt/bot
T=/opt/bot-ts-test
ARCHIVE=/tmp/vc-bots-ts.tgz
[ -f "$ARCHIVE" ] || { echo "manca $ARCHIVE" >&2; exit 1; }
rm -rf "$T"
mkdir -p "$T"
cd "$B"

# radice: collegamenti a tutto tranne il codice dei bot, git e i file pid dei processi
for x in * .[!.]*; do
  case "$x" in Vinyls|Coffee|shared|loader.js|wait-for-lavalink.js|.git|.shard_*) continue ;; esac
  ln -s "$B/$x" "$T/$x"
done

# nelle cartelle dei bot: le cartelle che contengono codice si ricreano, le altre si collegano intere
link_tree() {
  local rel="$1"
  mkdir -p "$T/$rel"
  for entry in "$B/$rel"/* "$B/$rel"/.[!.]*; do
    [ -e "$entry" ] || [ -L "$entry" ] || continue
    local name="${entry##*/}"
    local sub="$rel/$name"
    if [ -d "$entry" ] && [ ! -L "$entry" ] && [ "$name" != node_modules ] && [ -n "$(find "$entry" -name node_modules -prune -o -name '*.js' -print -quit)" ]; then
      link_tree "$sub"
    elif [[ "$name" == *.js ]]; then
      : # il codice arriva dall'archivio compilato
    else
      ln -s "$entry" "$T/$sub"
    fi
  done
}
for d in Vinyls Coffee shared; do link_tree "$d"; done

tar -xzf "$ARCHIVE" -C "$T"
echo "pronto: $(find "$T" -name '*.js' -type f -not -path '*/node_modules/*' | wc -l) file .js compilati, $(find "$T" -type l | wc -l) collegamenti"
# ogni .js dell'originale deve avere il suo compilato
missing=$(cd "$B" && find Vinyls Coffee shared -name node_modules -prune -o -name '*.js' -type f -print | while read -r f; do [ -f "$T/$f" ] || echo "$f"; done | wc -l)
echo "file .js mancanti rispetto a /opt/bot: $missing"
