#!/bin/bash
UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
# Copy big icon onto paths that might bypass CF challenge
cp -f /var/www/viniliecaffe/apple-touch-icon-v5.png /var/www/viniliecaffe/favicon-180.ico
cp -f /var/www/viniliecaffe/apple-touch-icon-v5.png /var/www/viniliecaffe/favicon.png
# Also ensure favicon.ico is the REAL 180 logo (not 32px) so if Safari falls back it still looks good
cp -f /var/www/viniliecaffe/apple-touch-icon-v5.png /var/www/viniliecaffe/favicon.ico

for u in \
  /favicon.ico \
  /favicon.png \
  /favicon-180.ico \
  /apple-touch-icon.png \
  /apple-touch-icon.ico \
  /robots.txt \
  /sitemap.xml
do
  code=$(/usr/bin/curl -sS -A "$UA" -o /tmp/cf.bin -w "%{http_code} %{content_type} %{size_download}" --max-time 20 "https://www.viniliecaffe.it${u}" || echo "err")
  kind=$(file -b /tmp/cf.bin | cut -c1-45)
  echo "${code} | ${kind} | ${u}"
done
