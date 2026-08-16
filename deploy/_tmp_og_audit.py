#!/usr/bin/env python3
"""Audit OG tags + WhatsApp fetchability across live pages."""
from __future__ import annotations

import re
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path("/var/www/viniliecaffe")
UA_WA = "WhatsApp/2.23.20.0 A"
UA_FB = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
ORIGIN = "https://www.viniliecaffe.it"


def hit(url: str, ua: str):
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = r.read(64)
            return r.status, (r.headers.get("Content-Type") or "")[:40], r.headers.get("Content-Length"), data[:8]
    except urllib.error.HTTPError as e:
        return e.code, "", "", b""
    except Exception as e:
        return "ERR", str(e)[:40], "", b""


def og_from_html(html: str) -> dict:
    head = html.split("</head>", 1)[0] if "</head>" in html else html[:8000]
    out = {}
    for key in ("og:title", "og:description", "og:url", "og:image", "og:image:secure_url", "og:type", "twitter:image"):
        m = re.search(
            rf'<meta[^>]+(?:property|name)=["\']{re.escape(key)}["\'][^>]+content=["\']([^"\']+)["\']',
            head,
            re.I,
        )
        if not m:
            m = re.search(
                rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{re.escape(key)}["\']',
                head,
                re.I,
            )
        out[key] = m.group(1) if m else ""
    return out


pages = [
    "/",
    "/tickets/",
    "/wiki/",
    "/sponsor/",
    "/faq/",
    "/evento/",
    "/candidature/",
    "/recensioni/",
    "/notifications/",
    "/staff/",
]
print("=== PAGE OG AUDIT ===")
images = set()
for path in pages:
    p = ROOT / path.lstrip("/")
    if path.endswith("/"):
        p = p / "index.html"
    if not p.exists():
        print(path, "MISSING_HTML")
        continue
    og = og_from_html(p.read_text(encoding="utf-8", errors="ignore"))
    img = og.get("og:image") or ""
    images.add(img)
    print(
        path,
        "title=" + ("Y" if og["og:title"] else "N"),
        "desc=" + ("Y" if og["og:description"] else "N"),
        "img=" + (img[:70] or "MISSING"),
        "secure=" + ("Y" if og["og:image:secure_url"] else "N"),
    )

print("\n=== IMAGE FETCH ===")
for img in sorted(x for x in images if x):
    for name, ua in (("WA", UA_WA), ("FB", UA_FB)):
        st, ctype, clen, head = hit(img, ua)
        print(name, st, ctype, clen, img[:80])

# also probe common WA-safe vs blocked
print("\n=== PATH PROBE WA ===")
for path in [
    "/apple-touch-icon.jpg?v=ogwa1",
    "/images/og-banner.jpg?v=2",
    "/favicon.ico?v=iosfix6",
]:
    st, ctype, clen, _ = hit(ORIGIN + path, UA_WA)
    print(st, ctype, clen, path)
