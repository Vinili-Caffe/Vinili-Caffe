#!/usr/bin/env python3
from pathlib import Path
from PIL import Image
import re

root = Path("/var/www/viniliecaffe")
print("=== files ===")
for p in sorted(list(root.glob("apple-touch*.png")) + list((root / "images").glob("apple-touch*.png")) + list((root / "images").glob("pwa-icon*-v4.png"))):
    im = Image.open(p)
    print(f"{p.relative_to(root)} mode={im.mode} size={im.size} bytes={p.stat().st_size}")

print("=== html icons ===")
html = (root / "index.html").read_text(encoding="utf-8", errors="ignore")
for m in re.finditer(r"<(?:link|meta)[^>]+(?:apple-touch|webmanifest|rel=['\"]icon)[^>]*>", html, flags=re.I):
    print(m.group(0)[:260])

print("=== manifest ===")
print((root / "site.webmanifest").read_text(encoding="utf-8"))

print("=== nginx ===")
conf = Path("/etc/nginx/sites-available/viniliecaffe").read_text(encoding="utf-8")
for i, line in enumerate(conf.splitlines(), 1):
    if "apple-touch" in line or "webmanifest" in line or "favicon" in line:
        print(f"{i}:{line}")
