#!/usr/bin/env bash
# Linux: delega a PowerShell se disponibile, altrimenti solo backend.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PS1="$ROOT/scripts/deploy-all.ps1"

if command -v pwsh >/dev/null 2>&1; then
  exec pwsh -NoProfile -File "$PS1" "$@"
fi

if command -v powershell >/dev/null 2>&1; then
  exec powershell -NoProfile -File "$PS1" "$@"
fi

echo "PowerShell (pwsh) non installato — uso deploy backend bash (senza sito)."
echo "Per deploy completo sito+bot installa pwsh: https://learn.microsoft.com/powershell/scripting/install/install-ubuntu"
echo

exec "$ROOT/scripts/deploy-backend.sh" "$@"
