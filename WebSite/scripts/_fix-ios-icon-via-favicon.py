#!/usr/bin/env python3
"""Point all Apple/PWA icon refs at /favicon.ico (only path CF allows without challenge)."""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path("/var/www/viniliecaffe")
SRC = ROOT / "images" / "vc-server-icon.png"
# Legacy wrong asset (VinylMusics event logo) — do not use.
LEGACY_SRC = ROOT / "seratafilm" / "vinylmusics_logo_hd.png"
BG = (12, 10, 16)
BUST = "iosfix4"
ZOOM = 1.28


def make_rgb(size: int, dest: Path) -> None:
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    scale = (size * ZOOM) / min(w, h)
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - size) // 2
    top = (nh - size) // 2
    cropped = resized.crop((left, top, left + size, top + size))
    layer = Image.new("RGBA", (size, size), (*BG, 255))
    layer.paste(cropped, (0, 0), cropped)
    out = layer.convert("RGB")
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, format="PNG", optimize=True)
    print("wrote", dest, out.size, dest.stat().st_size)


def patch_html(html: str) -> str:
    html = re.sub(
        r'<link[^>]+rel=["\']apple-touch-icon(?:-precomposed)?["\'][^>]*>\s*',
        "",
        html,
        flags=re.I,
    )
    html = re.sub(
        r'<link[^>]+rel=["\'](?:shortcut )?icon["\'][^>]*>\s*',
        "",
        html,
        flags=re.I,
    )
    html = re.sub(
        r'<link[^>]+rel=["\']manifest["\'][^>]*>\s*',
        "",
        html,
        flags=re.I,
    )
    html = re.sub(
        r'<meta[^>]+name=["\']apple-mobile-web-app-(?:capable|title)["\'][^>]*>\s*',
        "",
        html,
        flags=re.I,
    )
    html = re.sub(
        r'<meta[^>]+name=["\']mobile-web-app-capable["\'][^>]*>\s*',
        "",
        html,
        flags=re.I,
    )
    # CRITICAL: only /favicon.ico bypasses Cloudflare Managed Challenge for icon fetchers.
    icon = f"/favicon.ico?v={BUST}"
    block = "\n".join(
        [
            f'    <link rel="apple-touch-icon" sizes="180x180" href="{icon}" />',
            f'    <link rel="apple-touch-icon" href="{icon}" />',
            f'    <link rel="apple-touch-icon-precomposed" sizes="180x180" href="{icon}" />',
            f'    <link rel="icon" type="image/png" sizes="180x180" href="{icon}" />',
            f'    <link rel="shortcut icon" href="{icon}" />',
            f'    <link rel="manifest" href="/site.webmanifest?v={BUST}" />',
            '    <meta name="apple-mobile-web-app-capable" content="yes" />',
            '    <meta name="mobile-web-app-capable" content="yes" />',
            '    <meta name="apple-mobile-web-app-title" content="Vinili &amp; Caffè" />',
        ]
    )
    m = re.search(r"<head[^>]*>", html, flags=re.I)
    if not m:
        return html
    return html[: m.end()] + "\n" + block + "\n" + html[m.end() :]


def main() -> None:
    src = SRC if SRC.exists() else LEGACY_SRC
    if not src.exists():
        raise SystemExit(f"missing {SRC} and {LEGACY_SRC}")
    if src == LEGACY_SRC:
        print("WARN using legacy VINYLMUSICS logo — prefer images/vc-server-icon.png")
    global SRC
    SRC = src
    make_rgb(180, ROOT / "favicon.ico")
    make_rgb(180, ROOT / "apple-touch-icon.png")
    make_rgb(180, ROOT / "apple-touch-icon-v5.png")
    make_rgb(192, ROOT / "images" / "pwa-icon-192-v5.png")
    make_rgb(512, ROOT / "images" / "pwa-icon-512-v5.png")

    brand = "Vinili & Caffè"
    # Manifest icons also use favicon.ico so CF doesn't challenge them.
    icon = f"/favicon.ico?v={BUST}"
    manifest = {
        "name": brand,
        "short_name": brand,
        "description": f"Community Discord {brand}",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "background_color": "#120e0b",
        "theme_color": "#2a1f18",
        "icons": [
            {"src": icon, "sizes": "180x180", "type": "image/png", "purpose": "any"},
            {"src": icon, "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": icon, "sizes": "512x512", "type": "image/png", "purpose": "any"},
        ],
    }
    (ROOT / "site.webmanifest").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    n = 0
    for p in ROOT.rglob("*.html"):
        raw = p.read_text(encoding="utf-8", errors="surrogateescape")
        out = patch_html(raw)
        if out != raw:
            p.write_text(out, encoding="utf-8")
            n += 1
    print("html_patched", n)

    # Serve favicon.ico as image/png (bytes are PNG) — Safari is happier.
    conf = Path("/etc/nginx/sites-available/viniliecaffe")
    text = conf.read_text(encoding="utf-8")
    old = """    location = /favicon.ico {
        default_type image/png;
        add_header Cache-Control "public, max-age=0, must-revalidate" always;
        try_files $uri =404;
    }"""
    new = """    location = /favicon.ico {
        default_type image/png;
        types { }
        default_type image/png;
        add_header Cache-Control "public, max-age=0, must-revalidate" always;
        add_header CDN-Cache-Control "max-age=0, must-revalidate" always;
        try_files $uri =404;
    }"""
    if "location = /favicon.ico" in text and "CDN-Cache-Control" not in text.split("location = /favicon.ico")[1][:400]:
        text = text.replace(
            """    location = /favicon.ico {
        default_type image/png;
        add_header Cache-Control "public, max-age=0, must-revalidate" always;
        try_files $uri =404;
    }""",
            new,
            1,
        )
        conf.write_text(text, encoding="utf-8")
        print("nginx_favicon_patched")
    else:
        # ensure default_type image/png
        if "location = /favicon.ico" in text:
            print("nginx_favicon_exists")
        else:
            print("nginx_favicon_missing")

    head = (ROOT / "index.html").read_text(encoding="utf-8", errors="ignore")
    assert f"favicon.ico?v={BUST}" in head
    assert "cdn.discordapp.com/icons" not in head.split("</head>")[0]
    print("OK", BUST)


if __name__ == "__main__":
    main()
