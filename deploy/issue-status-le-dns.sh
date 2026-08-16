#!/usr/bin/env bash
# Ottiene Let's Encrypt per status.viniliecaffe.it via DNS-01 e aggiorna nginx.
set -euo pipefail
DOMAIN="${STATUS_DOMAIN:-status.viniliecaffe.it}"
AUTH="/opt/bot/deploy/acme-dns-auth.sh"
CLEAN="/opt/bot/deploy/acme-dns-cleanup.sh"
NGINX_SITE="/etc/nginx/sites-available/status.viniliecaffe.it"

sed -i 's/\r$//' "$AUTH" "$CLEAN" 2>/dev/null || true
chmod +x "$AUTH" "$CLEAN"

echo "Avvio certbot DNS-01 per ${DOMAIN}…"
echo "Quando compare ADD_CLOUDFLARE_TXT, crea in Cloudflare un record TXT e attendi."
certbot certonly \
  --manual \
  --preferred-challenges dns \
  --manual-auth-hook "$AUTH" \
  --manual-cleanup-hook "$CLEAN" \
  --manual-public-ip-logging-ok \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email

LIVE="/etc/letsencrypt/live/${DOMAIN}"
test -f "$LIVE/fullchain.pem"
test -f "$LIVE/privkey.pem"

cat >"$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${DOMAIN};

    ssl_certificate ${LIVE}/fullchain.pem;
    ssl_certificate_key ${LIVE}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
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

nginx -t
systemctl reload nginx
echo "OK — certificato LE attivo. Puoi usare Cloudflare SSL = Full (Strict)."
