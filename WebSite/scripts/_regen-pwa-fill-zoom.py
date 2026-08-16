#!/usr/bin/env python3
"""Regenerate PWA icons: fill square with zoom so vinyl isn't letterboxed."""
from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path("/var/www/viniliecaffe")
SRC = ROOT / "images" / "vc-server-icon.png"
BUST = "iosfix6"
# Solo un filo di crop sulle bande spiaggia sopra/sotto — niente zoom sul solo disco.
ZOOM = 1.14
BG = (12, 10, 16)


def cover_zoom(im: Image.Image, size: int, zoom: float = ZOOM) -> Image.Image:
    im = im.convert("RGBA")
    # Scale so the shorter side fills (size * zoom), then center-crop.
    w, h = im.size
    scale = (size * zoom) / min(w, h)
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - size) // 2
    top = (nh - size) // 2
    cropped = resized.crop((left, top, left + size, top + size))
    canvas = Image.new("RGBA", (size, size), BG + (255,))
    canvas.paste(cropped, (0, 0), cropped)
    return canvas.convert("RGB")


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
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")
    src = Image.open(SRC)
    outs = {
        ROOT / "favicon.ico": 180,
        ROOT / "apple-touch-icon.png": 180,
        ROOT / "apple-touch-icon-v5.png": 180,
        ROOT / "apple-touch-icon-180x180.png": 180,
        ROOT / "apple-touch-icon-precomposed.png": 180,
        ROOT / "images" / "apple-touch-icon-v5.png": 180,
        ROOT / "images" / "pwa-icon-192-v5.png": 192,
        ROOT / "images" / "pwa-icon-512-v5.png": 512,
    }
    for path, size in outs.items():
        rgb = cover_zoom(src, size)
        path.parent.mkdir(parents=True, exist_ok=True)
        rgb.save(path, format="PNG", optimize=True)
        print("wrote", path.name, size, path.stat().st_size)

    brand = "Vinili & Caffè"
    icon = f"/favicon.ico?v={BUST}"
    manifest = {
        "name": brand,
        "short_name": brand,
        "description": f"Community Discord {brand}",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "background_color": "#0c0a10",
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
        # Only refresh icon/manifest links — do not touch og:image (apple-touch-icon.jpg).
        out = patch_html(raw)
        if out != raw:
            p.write_text(out, encoding="utf-8")
            n += 1
    print("html_patched", n, "bust", BUST)


if __name__ == "__main__":
    main()
