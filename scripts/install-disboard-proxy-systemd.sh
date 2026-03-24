#!/usr/bin/env bash
set -euo pipefail

BOT_DIR="${BOT_DIR:-/opt/bot}"
SERVICE_NAME="${SERVICE_NAME:-disboard-reviews-proxy}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
ENV_FILE="${BOT_DIR}/.env"
SERVICE_SRC="${BOT_DIR}/scripts/disboard-reviews-proxy.service"

if [[ ! -f "${SERVICE_SRC}" ]]; then
  echo "ERRORE: file non trovato ${SERVICE_SRC}"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERRORE: file non trovato ${ENV_FILE}"
  echo "Crea ${ENV_FILE} con le variabili DISBOARD_PROXY_* prima di installare il servizio."
  exit 1
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
echo "Variabili richieste nel file ${ENV_FILE}:"
echo "DISBOARD_PROXY_PORT=8787"
echo "DISBOARD_PROXY_HOST=127.0.0.1"
echo "DISBOARD_PROXY_API_KEY=<chiave>"
echo "DISBOARD_CF_COOKIE=cf_clearance=<valore>"
echo "DISBOARD_REVIEW_URL=https://disboard.org/it/server/reviews/1329080093599076474"
echo "DISBOARD_PROXY_TIMEOUT_MS=15000"
echo
echo "Ora imposta in Vinyls/config.json:"
echo "\"disboardReviews.fetchEndpoint\": \"http://127.0.0.1:8787/disboard/reviews\""
echo "\"disboardReviews.fetchEndpointSecret\": \"<stesso valore di DISBOARD_PROXY_API_KEY>\""
