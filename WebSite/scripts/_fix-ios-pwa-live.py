#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from pathlib import Path
import json
import re
import shutil

root = Path("/var/www/viniliecaffe")
img = root / "images"
BRAND = "Vinili & Caff\u00e8"  # Vinili & Caffè

src180 = img / "apple-touch-icon-v2.png"
if not src180.exists():
    src180 = img / "pwa-icon-180.png"
dst180 = img / "apple-touch-icon-v3.png"
shutil.copyfile(src180, dst180)
shutil.copyfile(src180, root / "apple-touch-icon.png")
shutil.copyfile(img / "pwa-icon-192-v2.png", img / "pwa-icon-192-v3.png")
shutil.copyfile(img / "pwa-icon-512-v2.png", img / "pwa-icon-512-v3.png")

manifest = {
    "name": BRAND,
    "short_name": BRAND,
    "description": "Community Discord " + BRAND,
    "start_url": "/",
    "scope": "/",
    "display": "standalone",
    "background_color": "#120e0b",
    "theme_color": "#2a1f18",
    "icons": [
        {"src": "/images/pwa-icon-192-v3.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "/images/pwa-icon-512-v3.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "/images/apple-touch-icon-v3.png", "sizes": "180x180", "type": "image/png", "purpose": "any"},
    ],
}
(root / "site.webmanifest").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

ICON = '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />'
ICON2 = '<link rel="apple-touch-icon" href="/images/apple-touch-icon-v3.png" />'
TITLE = '<meta name="apple-mobile-web-app-title" content="Vinili &amp; Caff\u00e8" />'
CAPABLE = '<meta name="apple-mobile-web-app-capable" content="yes" />'
MOBILE = '<meta name="mobile-web-app-capable" content="yes" />'


def patch_html(html: str) -> str:
    html = re.sub(r'<link[^>]+rel=["\']apple-touch-icon["\'][^>]*>\s*', "", html, flags=re.I)
    html = re.sub(
        r'<meta[^>]+name=["\']apple-mobile-web-app-title["\'][^>]*>\s*',
        "",
        html,
        flags=re.I,
    )
    lower = html.lower()
    inserts = [ICON, ICON2, TITLE]
    if "apple-mobile-web-app-capable" not in lower:
        inserts.append(CAPABLE)
    if "mobile-web-app-capable" not in lower:
        inserts.append(MOBILE)
    block = "\n    ".join(inserts)
    idx = lower.rfind("</head>")
    if idx < 0:
        return html
    return html[:idx] + "    " + block + "\n  " + html[idx:]


n = 0
for p in root.rglob("*.html"):
    raw = p.read_text(encoding="utf-8", errors="surrogateescape")
    out = patch_html(raw)
    if out != raw:
        p.write_text(out, encoding="utf-8")
        n += 1

mb = (root / "site.webmanifest").read_bytes()
print("manifest_has_utf8_e", BRAND.encode("utf-8") in mb)
print("manifest_has_qmark", b"Caff?" in mb)
print("html_patched", n)
print("root_icon_bytes", (root / "apple-touch-icon.png").stat().st_size)
print((root / "site.webmanifest").read_text(encoding="utf-8")[:160])
