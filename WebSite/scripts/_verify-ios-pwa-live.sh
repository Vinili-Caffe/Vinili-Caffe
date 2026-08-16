#!/bin/bash
set -e
R=(--resolve www.viniliecaffe.it:443:127.0.0.1)
curl -sS "${R[@]}" -D- -o /tmp/m.bin https://www.viniliecaffe.it/site.webmanifest | head -20
echo "BODY:"
python3 - <<'PY'
b=open("/tmp/m.bin","rb").read()
print(b[:240].decode("utf-8","replace"))
print("c3a8", b"\xc3\xa8" in b, "qmark", b"Caff?" in b)
PY
for u in /apple-touch-icon.png /images/apple-touch-icon-v3.png /images/pwa-icon-192-v3.png /images/pwa-icon-512-v3.png; do
  curl -sS "${R[@]}" -o /tmp/i.bin -w "%{http_code} %{content_type} %{size_download} ${u}\n" "https://www.viniliecaffe.it${u}"
  file /tmp/i.bin
done
echo "HTML:"
curl -sS "${R[@]}" https://www.viniliecaffe.it/ | grep -E 'apple-touch|webmanifest|apple-mobile-web-app-title' | head -15
echo "MIME:"
grep -n webmanifest /etc/nginx/mime.types || echo "no webmanifest in mime.types"
grep -nE 'types \{|webmanifest|manifest' /etc/nginx/sites-enabled/viniliecaffe | head -40 || true
