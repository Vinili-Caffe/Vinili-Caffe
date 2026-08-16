#!/usr/bin/env python3
from pathlib import Path
import struct

root = Path("/var/www/viniliecaffe")
mb = (root / "site.webmanifest").read_bytes()
print("manifest_c3a8", b"\xc3\xa8" in mb, "qmark", b"Caff?" in mb)
print(mb.decode("utf-8")[:280])

for rel in [
    "apple-touch-icon.png",
    "images/apple-touch-icon-v3.png",
    "images/pwa-icon-192-v3.png",
    "images/pwa-icon-512-v3.png",
]:
    data = (root / rel).read_bytes()
    wh = struct.unpack(">II", data[16:24]) if data[:8] == b"\x89PNG\r\n\x1a\n" else None
    print(rel, len(data), wh)

html = (root / "index.html").read_text(encoding="utf-8", errors="replace")
for line in html.splitlines():
    if any(k in line for k in ("apple-touch-icon", "apple-mobile-web-app-title", "webmanifest")):
        print("html", line.strip())
