#!/usr/bin/env bash
# Installa Uptime Kuma (Docker, host network) + nginx status.viniliecaffe.it
set -euo pipefail

KUMA_DIR="${KUMA_DIR:-/opt/uptime-kuma}"
KUMA_PORT="${KUMA_PORT:-3001}"
CREDS_FILE="${CREDS_FILE:-/root/.uptime-kuma-admin}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/status.viniliecaffe.it}"
DOMAIN="${STATUS_DOMAIN:-status.viniliecaffe.it}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Esegui come root." >&2
  exit 1
fi

command -v docker >/dev/null || { echo "docker mancante" >&2; exit 1; }
command -v nginx >/dev/null || { echo "nginx mancante" >&2; exit 1; }

mkdir -p "$KUMA_DIR"

if [[ ! -f "$CREDS_FILE" ]]; then
  ADMIN_USER="admin"
  ADMIN_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  umask 077
  cat >"$CREDS_FILE" <<EOF
UPTIME_KUMA_URL=http://127.0.0.1:${KUMA_PORT}
UPTIME_KUMA_USER=${ADMIN_USER}
UPTIME_KUMA_PASS=${ADMIN_PASS}
STATUS_PAGE_SLUG=vinili
STATUS_PAGE_URL=https://${DOMAIN}/status/vinili
EOF
  chmod 600 "$CREDS_FILE"
  echo "Credenziali create in $CREDS_FILE"
else
  # shellcheck disable=SC1090
  source "$CREDS_FILE"
  ADMIN_USER="${UPTIME_KUMA_USER:-admin}"
  ADMIN_PASS="${UPTIME_KUMA_PASS:-}"
fi

if docker ps -a --format '{{.Names}}' | grep -qx 'uptime-kuma'; then
  echo "Container uptime-kuma già presente — riavvio…"
  docker start uptime-kuma >/dev/null || true
else
  echo "Avvio Uptime Kuma su porta ${KUMA_PORT} (host network)…"
  docker run -d \
    --name uptime-kuma \
    --restart=always \
    --network host \
    -v uptime-kuma-data:/app/data \
    louislam/uptime-kuma:1
fi

echo "Attendo UI Kuma…"
for i in $(seq 1 60); do
  if curl -fsS -m 2 "http://127.0.0.1:${KUMA_PORT}/" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -fsS -m 5 "http://127.0.0.1:${KUMA_PORT}/" >/dev/null

cat >"$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${KUMA_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
EOF

ln -sfn "$NGINX_SITE" /etc/nginx/sites-enabled/status.viniliecaffe.it
nginx -t
systemctl reload nginx

if command -v certbot >/dev/null; then
  echo "Richiesta certificato Let's Encrypt per ${DOMAIN}…"
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || {
    echo "WARN: certbot non riuscito (DNS Cloudflare / SSL). Nginx HTTP ok; riprova dopo aver settato SSL Full su Cloudflare." >&2
  }
fi

echo "OK — Kuma su http://127.0.0.1:${KUMA_PORT} / https://${DOMAIN}"
echo "Credenziali: $CREDS_FILE"
