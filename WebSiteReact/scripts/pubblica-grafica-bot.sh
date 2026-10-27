#!/usr/bin/env bash
# Una tantum (24/10/2026): grafica del bot.
# - skullboard come Discord (orario in italiano, nome col gradiente del ruolo, doppia risoluzione);
# - rank card: nick identico a Discord (spazi intorno alle emoji) e barretta tra nick e livello;
# - testo con emoji: lo spazio dopo/prima di un'emoji non si perde più (vale per tutte le immagini del bot).
# Backup dei file, controllo sintassi, poi riavvio di `bots` (comandi/skullboard) e `site-api` (anteprima sul sito).
set -euo pipefail
cd "$(dirname "$0")/../../Vinyls"
FILES="Utils/Render/skullboardCanvas.js Events/messageReactionAdd.js Utils/Render/rankCanvas.js Utils/Render/canvasEmojiRichText.js"
for f in $FILES; do scp -q "$f" "vinili:/tmp/$(basename "$f")"; done
ssh vinili "FILES='$FILES' bash -s" <<'REMOTE'
set -euo pipefail
N=/root/.nvm/versions/node/v22.22.2/bin/node
B=/root/vc_bot_bak_grafica_$(date +%Y%m%d-%H%M%S)
mkdir -p "$B"
for f in $FILES; do
  $N --check "/tmp/$(basename "$f")"
  cp -a "/opt/bot/Vinyls/$f" "$B/"
done
for f in $FILES; do install -m 644 "/tmp/$(basename "$f")" "/opt/bot/Vinyls/$f"; done
pm2 restart site-api >/dev/null
pm2 restart bots-vinyls bots-coffee >/dev/null 2>&1 || pm2 restart bots >/dev/null
sleep 20
pm2 ls | grep -E " bots| site-api "
echo "backup in $B"
REMOTE
