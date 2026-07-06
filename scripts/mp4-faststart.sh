#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -lt 1 ]; then
  echo "Uso: $0 <file.mp4> [file2.mp4 ...]" >&2
  echo "Riorganizza l'atomo moov all'inizio (streaming web) senza ricodificare." >&2
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg non trovato. Installa ffmpeg e riprova." >&2
  exit 1
fi
for src in "$@"; do
  if [ ! -f "$src" ]; then
    echo "File mancante: $src" >&2
    exit 1
  fi
  dir=$(dirname "$src")
  base=$(basename "$src")
  tmp="$dir/.${base%.mp4}.faststart.tmp.mp4"
  echo "==> $src"
  ffmpeg -y -i "$src" -c copy -movflags +faststart "$tmp"
  mv "$src" "$dir/.${base}.no-faststart.bak"
  mv "$tmp" "$src"
  echo "OK: $src (backup: $dir/.${base}.no-faststart.bak)"
done