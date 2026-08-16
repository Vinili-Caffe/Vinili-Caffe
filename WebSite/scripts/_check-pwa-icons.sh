#!/bin/bash
set -e
R=(--resolve www.viniliecaffe.it:443:127.0.0.1)
echo '=== files ==='
ls -la /var/www/viniliecaffe/apple-touch-icon.png /var/www/viniliecaffe/images/apple-touch-icon*.png /var/www/viniliecaffe/images/pwa-icon*.png /var/www/viniliecaffe/images/*logo* 2>&1 | head -50
echo '=== manifest ==='
head -c 800 /var/www/viniliecaffe/site.webmanifest; echo
echo '=== html ==='
curl -sS "${R[@]}" https://www.viniliecaffe.it/ | tr '>' '>\n' | grep -iE 'apple-touch|webmanifest|rel=.icon' | head -25
echo '=== http ==='
for u in /apple-touch-icon.png /apple-touch-icon-precomposed.png /images/apple-touch-icon-v3.png /images/pwa-icon-192-v3.png /favicon.ico /images/vinylmusics_logo_hd.png /images/vc-header-logo.png; do
  code=$(curl -sS "${R[@]}" -o /tmp/i.bin -w "%{http_code} %{content_type} %{size_download}" "https://www.viniliecaffe.it${u}" || echo "err")
  echo "$code $u"
  file /tmp/i.bin 2>/dev/null | sed "s|^|  |"
done
python3 - <<'PY'
import struct
from pathlib import Path
root=Path('/var/www/viniliecaffe')
for rel in ['apple-touch-icon.png','images/apple-touch-icon-v3.png','images/pwa-icon-192-v3.png','images/pwa-icon-512-v3.png']:
 p=root/rel
 if not p.exists():
  print(rel,'MISSING'); continue
 b=p.read_bytes()
 if b[:8]!=b'\x89PNG\r\n\x1a\n':
  print(rel,'NOT_PNG', b[:20]); continue
 w,h=struct.unpack('>II', b[16:24])
 print(rel, f'{w}x{h}', len(b))
PY
EOF
