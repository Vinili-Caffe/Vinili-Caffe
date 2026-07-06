#!/usr/bin/env bash
set -euo pipefail

INIT=$(pro api u.pro.attach.magic.initiate.v1)
TOKEN=$(echo "$INIT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['attributes']['token'])")
CODE=$(echo "$INIT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['attributes']['user_code'])")
echo "MAGIC_CODE=$CODE"
echo "MAGIC_URL=https://ubuntu.com/pro/attach"
echo "Apri il link, accedi con Ubuntu One (gratis) e inserisci il codice entro 10 minuti."

if ! pro api u.pro.attach.magic.wait.v1 --args "magic_token=$TOKEN"; then
  echo "ATTACH_FAILED: attach non completato in tempo."
  exit 1
fi

echo "ATTACH_OK"
pro enable esm-apps -y
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
echo "---"
pro security-status 2>&1 | tail -20