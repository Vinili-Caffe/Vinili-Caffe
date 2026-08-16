#!/usr/bin/env bash
# Comprime / ottimizza un MP4 per la Serata Film (streaming browser).
# Uso:
#   ./scripts/compress-seratafilm-video.sh
#   ./scripts/compress-seratafilm-video.sh path/input.mp4 path/output.mp4
# Richiede ffmpeg nel PATH (apt install ffmpeg).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INPUT="${1:-$ROOT/images/evento-hogwarts/ven.mp4}"
OUTPUT="${2:-}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "[compress-seratafilm] ffmpeg non trovato. Installa con: sudo apt install ffmpeg" >&2
  exit 1
fi

if [[ ! -f "$INPUT" ]]; then
  echo "[compress-seratafilm] File non trovato: $INPUT" >&2
  exit 1
fi

if [[ -z "$OUTPUT" ]]; then
  base="$(basename "$INPUT" .mp4)"
  dir="$(dirname "$INPUT")"
  OUTPUT="$dir/${base}-web.mp4"
fi

if [[ -e "$OUTPUT" ]]; then
  echo "[compress-seratafilm] Output esiste già: $OUTPUT" >&2
  echo "Rinominalo o passa un percorso diverso come secondo argomento." >&2
  exit 1
fi

# ~2.2 Mbps video + 128k audio: buon compromesso qualità/buffering per proiezione web.
# faststart sposta i metadati all'inizio del file (fondamentale per lo streaming HTTP).
VIDEO_KBPS="${VC_SERATAFILM_VIDEO_KBPS:-2200}"
AUDIO_KBPS="${VC_SERATAFILM_AUDIO_KBPS:-128}"
PRESET="${VC_SERATAFILM_FFMPEG_PRESET:-medium}"
REMUX_ONLY="${VC_SERATAFILM_REMUX_ONLY:-0}"

echo "[compress-seratafilm] Input:  $INPUT"
echo "[compress-seratafilm] Output: $OUTPUT"

if [[ "$REMUX_ONLY" == "1" ]]; then
  echo "[compress-seratafilm] Modalità remux (copia stream + faststart, nessuna ricodifica)"
  ffmpeg -hide_banner -y -i "$INPUT" \
    -c copy \
    -movflags +faststart \
    -map 0 \
    "$OUTPUT"
else
  echo "[compress-seratafilm] Video ${VIDEO_KBPS}k, audio ${AUDIO_KBPS}k, preset=${PRESET}"
  ffmpeg -hide_banner -y -i "$INPUT" \
    -c:v libx264 -preset "$PRESET" -profile:v high -level 4.1 \
    -b:v "${VIDEO_KBPS}k" -maxrate "$((VIDEO_KBPS * 13 / 10))k" -bufsize "$((VIDEO_KBPS * 2))k" \
    -pix_fmt yuv420p \
    -c:a aac -b:a "${AUDIO_KBPS}k" -ac 2 \
    -movflags +faststart \
    -map 0:v:0 -map 0:a:0? \
    "$OUTPUT"
fi

in_size="$(du -h "$INPUT" | awk '{print $1}')"
out_size="$(du -h "$OUTPUT" | awk '{print $1}')"
echo "[compress-seratafilm] Fatto: $in_size → $out_size"
echo "[compress-seratafilm] Aggiorna site.config.json → seratafilmEvent.linkFilm con il nuovo path, poi npm run build."
