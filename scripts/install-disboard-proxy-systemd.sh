#!/usr/bin/env bash
set -euo pipefail

BOT_DIR="${BOT_DIR:-/opt/bot}"
SERVICE_NAME="${SERVICE_NAME:-disboard-reviews-proxy}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
ENV_FILE="${BOT_DIR}/scripts/disboard-proxy.env"
SERVICE_SRC="${BOT_DIR}/scripts/disboard-reviews-proxy.service"
ENV_EXAMPLE="${BOT_DIR}/scripts/disboard-proxy.env.example"

if [[ ! -f "${SERVICE_SRC}" ]]; then
  echo "ERRORE: file non trovato ${SERVICE_SRC}"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  if [[ -f "${ENV_EXAMPLE}" ]]; then
    cp "${ENV_EXAMPLE}" "${ENV_FILE}"
    echo "Creato ${ENV_FILE} da template. MODIFICA DISBOARD_PROXY_API_KEY e DISBOARD_CF_COOKIE prima di usare in produzione."
  else
    echo "ERRORE: manca anche il template ${ENV_EXAMPLE}"
    exit 1
  fi
fi

cp "${SERVICE_SRC}" "${SERVICE_FILE}"
chmod 644 "${SERVICE_FILE}"
systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

echo "Stato servizio:"
systemctl --no-pager --full status "${SERVICE_NAME}" || true
echo
echo "Health check locale:"
curl -fsS "http://127.0.0.1:8787/health" || true
echo
echo "Ora imposta in Vinyls/config.json:"
echo "\"disboardReviews.fetchEndpoint\": \"http://127.0.0.1:8787/disboard/reviews\""
echo "\"disboardReviews.fetchEndpointSecret\": \"<stesso valore di DISBOARD_PROXY_API_KEY>\""
