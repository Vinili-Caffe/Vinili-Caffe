#!/usr/bin/env bash
# Per VPS/Linux: avvia Lavalink con Java. Usato da PM2.
# Forza la directory di lavoro e la config: se PM2 usa cwd diverso da questa cartella,
# senza --spring.config.additional-location Lavalink può avviarsi SENZA application.yml locale
# (nessun plugin LavaSrc → link Spotify finiscono su HttpAudioSourceManager → Unknown file format).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1
ENV_FILE="$SCRIPT_DIR/.env.lavalink"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi
JAVA_EXE=""
for candidate in java "$(which java 2>/dev/null)"; do
  if command -v "$candidate" &>/dev/null; then
    JAVA_EXE="$candidate"
    break
  fi
done
if [ -z "$JAVA_EXE" ] || [ ! -x "$JAVA_EXE" ]; then
  for p in /usr/bin/java /usr/lib/jvm/*/bin/java; do
    [ -x "$p" ] && JAVA_EXE="$p" && break
  done
fi
if [ -z "$JAVA_EXE" ] || [ ! -x "$JAVA_EXE" ]; then
  echo "Java non trovato. Installa openjdk-17-jre (apt install openjdk-17-jre)"
  exit 1
fi
JAR="$SCRIPT_DIR/Lavalink.jar"
CFG="$SCRIPT_DIR/application.yml"
if [ ! -f "$JAR" ]; then
  echo "[Lavalink] ERRORE: manca $JAR"
  exit 1
fi
if [ ! -f "$CFG" ]; then
  echo "[Lavalink] ERRORE: manca $CFG — i plugin (LavaSrc / YouTube) non verranno configurati."
  exit 1
fi
echo "[Lavalink] cwd=$SCRIPT_DIR jar=$JAR config=$CFG java=$JAVA_EXE"
exec "$JAVA_EXE" -Xms256m -Xmx768m -XX:+UseG1GC -XX:+ParallelRefProcEnabled -jar "$JAR" --spring.config.additional-location="optional:file:$SCRIPT_DIR/"