#!/usr/bin/env bash
set -euo pipefail
EXPECTED="$(cat /tmp/acme-expected-txt 2>/dev/null || true)"
if [[ -z "$EXPECTED" ]]; then
  echo "Nessuna challenge in corso"
  exit 1
fi
echo "Attendo TXT=$EXPECTED"
for i in $(seq 1 60); do
  got="$(dig +short TXT _acme-challenge.status.viniliecaffe.it @1.1.1.1 2>/dev/null | tr -d '"' | tr '\n' ' ')"
  echo "[$i] dig=[$got]"
  if echo " $got " | grep -q " $EXPECTED "; then
    echo "DNS OK — attendo fine certbot…"
    for j in $(seq 1 60); do
      if [[ -f /etc/letsencrypt/live/status.viniliecaffe.it/fullchain.pem ]]; then
        echo "CERT_READY"
        tail -20 /tmp/issue-status-le.log
        exit 0
      fi
      if ! pgrep -f 'certbot certonly' >/dev/null; then
        echo "certbot terminato"
        tail -40 /tmp/issue-status-le.log
        [[ -f /etc/letsencrypt/live/status.viniliecaffe.it/fullchain.pem ]] && echo CERT_READY && exit 0
        exit 1
      fi
      sleep 5
    done
    exit 1
  fi
  sleep 10
done
echo "TIMEOUT DNS"
exit 1
