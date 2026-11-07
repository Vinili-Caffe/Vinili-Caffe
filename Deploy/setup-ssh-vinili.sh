#!/usr/bin/env bash
# Ricrea l'alias SSH "vinili" (root@45.143.196.131) su questa macchina.
set -euo pipefail

SSH_DIR="${HOME}/.ssh"
KEY="${SSH_DIR}/vinili"
HOST_ALIAS="vinili"
HOST_IP="45.143.196.131"
HOST_USER="root"

mkdir -p "${SSH_DIR}"
chmod 700 "${SSH_DIR}"

if [[ ! -f "${KEY}" ]]; then
  ssh-keygen -t ed25519 -f "${KEY}" -N "" -C "vinili-vps-$(hostname)"
fi
chmod 600 "${KEY}"
chmod 644 "${KEY}.pub"

CONFIG_BLOCK=$(cat <<EOF
Host ${HOST_ALIAS}
  HostName ${HOST_IP}
  User ${HOST_USER}
  IdentityFile ${KEY}
  IdentitiesOnly yes
  ServerAliveInterval 15
  ServerAliveCountMax 3
  ConnectTimeout 15
EOF
)

CONFIG_FILE="${SSH_DIR}/config"
touch "${CONFIG_FILE}"
chmod 600 "${CONFIG_FILE}"

if grep -q "^Host ${HOST_ALIAS}$" "${CONFIG_FILE}" 2>/dev/null; then
  python3 - "${CONFIG_FILE}" "${HOST_ALIAS}" "${CONFIG_BLOCK}" <<'PY'
import re, sys
path, alias, block = sys.argv[1:4]
text = open(path, encoding="utf-8").read()
pattern = rf"(?ms)^Host {re.escape(alias)}$.*?(?=^Host |\Z)"
if re.search(pattern, text):
    text = re.sub(pattern, block.rstrip() + "\n\n", text, count=1)
else:
    text = (text.rstrip() + "\n\n" if text.strip() else "") + block.rstrip() + "\n"
open(path, "w", encoding="utf-8").write(text)
PY
else
  printf '\n%s\n' "${CONFIG_BLOCK}" >> "${CONFIG_FILE}"
fi

echo "Chiave pubblica (da avere in authorized_keys sul server):"
cat "${KEY}.pub"
echo

if ssh -o BatchMode=yes -o ConnectTimeout=10 "${HOST_ALIAS}" "echo ok" >/dev/null 2>&1; then
  echo "SSH ${HOST_ALIAS}: connessione OK."
  exit 0
fi

echo "La chiave non è ancora sul server. Installazione con ssh-copy-id..."
echo "(Inserisci la password root del VPS quando richiesta.)"
ssh-copy-id -i "${KEY}.pub" "${HOST_ALIAS}"

if ssh -o BatchMode=yes -o ConnectTimeout=10 "${HOST_ALIAS}" "echo ok" >/dev/null 2>&1; then
  echo "SSH ${HOST_ALIAS}: configurato e funzionante."
else
  echo "ssh-copy-id completato ma il test BatchMode è fallito. Prova: ssh ${HOST_ALIAS}"
  exit 1
fi
