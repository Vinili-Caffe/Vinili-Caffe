#!/usr/bin/env bash
# Cleanup hook DNS-01 (opzionale).
set -euo pipefail
rm -f /tmp/acme-expected-txt /tmp/acme-txt-name /tmp/acme-txt-instructions
exit 0
