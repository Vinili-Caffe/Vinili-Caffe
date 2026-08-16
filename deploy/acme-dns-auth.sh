#!/usr/bin/env bash
# Certbot manual auth hook (DNS-01): pubblica il valore e attende il TXT su Cloudflare.
set -euo pipefail
VAL="${CERTBOT_VALIDATION:?}"
DOMAIN="${CERTBOT_DOMAIN:?}"
NAME="_acme-challenge.${DOMAIN}"
umask 077
printf '%s\n' "$VAL" > /tmp/acme-expected-txt
printf '%s\n' "$NAME" > /tmp/acme-txt-name
printf 'ADD_CLOUDFLARE_TXT name=%s value=%s\n' "$NAME" "$VAL" | tee /tmp/acme-txt-instructions
echo "In attesa del record TXT (fino a ~15 min)…"
for i in $(seq 1 90); do
  got="$(dig +short TXT "$NAME" @1.1.1.1 2>/dev/null | tr -d '"' | tr '\n' ' ')"
  if echo " $got " | grep -q " $VAL "; then
    echo "TXT trovato su 1.1.1.1 — attendo propagazione…"
    sleep 8
    exit 0
  fi
  sleep 10
done
echo "Timeout: TXT non trovato per $NAME" >&2
exit 1
