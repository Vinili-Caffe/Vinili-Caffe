#!/usr/bin/env bash
# Tunnel MongoDB Compass: localhost:27018 -> VPS Mongo (127.0.0.1:27017)
set -euo pipefail
LOCAL_PORT="${1:-27018}"
echo "Tunnel: 127.0.0.1:${LOCAL_PORT} -> vinili-ca Mongo. Chiudi con Ctrl+C."
exec ssh -N -L "${LOCAL_PORT}:127.0.0.1:27017" vinili-ca
