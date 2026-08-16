#!/usr/bin/env python3
"""Force complete Open Graph + Twitter meta on EVERY live HTML page."""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from html import escape

from PIL import Image

ROOT = Path("/var/www/viniliecaffe")
SRC_BANNER = ROOT / "images" / "og-banner.jpg"
SRC_ICON = ROOT / "images" / "vc-server-icon.png"
BUST = "ogwa5"
ORIGIN = "https://www.viniliecaffe.it"
# Prefer conventional /og.jpg; keep apple-touch-icon.jpg on disk for CF allowlist.
# Do NOT emit a second og:image: Discord treats multiple og:image as a gallery.
OG_PATH = f"/og.jpg?v={BUST}"
OG_URL = ORIGIN + OG_PATH
SITE_NAME = "Vinili & Caffè"
DEFAULT_DESC = (
    "Community Discord italiana: vinili, caffè, musica e chiacchiere. "
    "Entra nel server ufficiale Vinili & Caffè."
)


def ensure_banner() -> None:
    if SRC_BANNER.exists():
        im = Image.open(SRC_BANNER).convert("RGB")
    elif SRC_ICON.exists():
        icon = Image.open(SRC_ICON).convert("RGBA")
        im = Image.new("RGB", (1200, 630), (12, 10, 16))
        icon.thumbnail((420, 420), Image.Resampling.LANCZOS)
        im.paste(icon, (90, (630 - icon.height) // 2), icon)
    else:
        raise SystemExit("no banner source")
    if im.size != (1200, 630):
        im = im.resize((1200, 630), Image.Resampling.LANCZOS)
    # Root paths: /og.jpg (canonical) + apple-touch-icon.jpg (CF allowlist mirror)
    outs = [
        ROOT / "og.jpg",
        ROOT / "apple-touch-icon.jpg",
        ROOT / "images" / "og-banner.jpg",
        ROOT / "images" / "og-share.jpg",
    ]
    for dest in outs:
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest, format="JPEG", quality=88, optimize=True)
        print("wrote", dest, dest.stat().st_size)


def meta_content(html: str, prop: str) -> str:
    m = re.search(
        rf'<meta[^>]+(?:property|name)=["\']{re.escape(prop)}["\'][^>]*content=["\']([^"\']*)["\']',
        html,
        re.I,
    )
    if m:
        return m.group(1).strip()
    m = re.search(
        rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']{re.escape(prop)}["\']',
        html,
        re.I,
    )
    return m.group(1).strip() if m else ""


def title_text(html: str) -> str:
    m = re.search(r"<title[^>]*>([^<]*)</title>", html, re.I)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else SITE_NAME


def page_url_from_path(rel: Path) -> str:
    # rel relative to ROOT, e.g. tickets/index.html or privacy.html
    parts = list(rel.parts)
    if parts and parts[-1].lower() == "index.html":
        parts = parts[:-1]
    elif parts and parts[-1].lower().endswith(".html"):
        stem = parts[-1][:-5]  # strip .html
        parts = parts[:-1] + ([stem] if stem and stem != "index" else [])
    path = "/" + "/".join(parts)
    if path != "/" and not path.endswith("/"):
        path += "/"
    if path == "//":
        path = "/"
    return ORIGIN + path


def strip_meta_block(html: str) -> str:
    patterns = [
        r'<meta[^>]+(?:property|name)=["\']og:[^"\']+["\'][^>]*>\s*',
        r'<meta[^>]+(?:property|name)=["\']twitter:[^"\']+["\'][^>]*>\s*',
        r'<link[^>]+rel=["\']image_src["\'][^>]*>\s*',
        r'<meta[^>]+itemprop=["\']image["\'][^>]*>\s*',
        r'<meta[^>]+itemprop=["\']name["\'][^>]*>\s*',
        r'<meta[^>]+itemprop=["\']description["\'][^>]*>\s*',
    ]
    out = html
    for p in patterns:
        out = re.sub(p, "", out, flags=re.I)
    return out


def strip_discord_cdn_icons(html: str) -> str:
    return re.sub(
        r'<link[^>]+rel=["\'](?:shortcut )?icon["\'][^>]*cdn\.discordapp\.com[^>]*>\s*',
        "",
        html,
        flags=re.I,
    )


def build_block(title: str, desc: str, url: str) -> str:
    t = escape(title or SITE_NAME, quote=True)
    d = escape((desc or DEFAULT_DESC)[:300], quote=True)
    u = escape(url or (ORIGIN + "/"), quote=True)
    img = escape(OG_URL, quote=True)
    sn = escape(SITE_NAME, quote=True)
    return "\n".join(
        [
            f'    <meta property="og:type" content="website" />',
            f'    <meta property="og:site_name" content="{sn}" />',
            f'    <meta property="og:locale" content="it_IT" />',
            f'    <meta property="og:title" content="{t}" />',
            f'    <meta property="og:description" content="{d}" />',
            f'    <meta property="og:url" content="{u}" />',
            f'    <meta property="og:image" content="{img}" />',
            f'    <meta property="og:image:secure_url" content="{img}" />',
            f'    <meta property="og:image:type" content="image/jpeg" />',
            f'    <meta property="og:image:width" content="1200" />',
            f'    <meta property="og:image:height" content="630" />',
            f'    <meta property="og:image:alt" content="{sn}" />',
            f'    <meta name="twitter:card" content="summary_large_image" />',
            f'    <meta name="twitter:title" content="{t}" />',
            f'    <meta name="twitter:description" content="{d}" />',
            f'    <meta name="twitter:image" content="{img}" />',
            f'    <link rel="image_src" href="{img}" />',
            f'    <meta itemprop="name" content="{t}" />',
            f'    <meta itemprop="description" content="{d}" />',
            f'    <meta itemprop="image" content="{img}" />',
        ]
    )


def patch_html(html: str, rel: Path) -> str:
    html = strip_discord_cdn_icons(html)
    # Read existing values BEFORE stripping OG tags.
    title = meta_content(html, "og:title") or title_text(html) or SITE_NAME
    desc = (
        meta_content(html, "og:description")
        or meta_content(html, "description")
        or DEFAULT_DESC
    )
    url = meta_content(html, "og:url") or page_url_from_path(rel)
    html = strip_meta_block(html)
    # unescape lightly for rebuild
    title = re.sub(r"&amp;", "&", title)
    desc = re.sub(r"&amp;", "&", desc)
    if url.startswith("/"):
        url = ORIGIN + url
    block = build_block(title, desc, url)
    # MUST be first inside <head>: build injects large scripts before charset,
    # and WhatsApp/Slack often only parse an early prefix of HTML.
    m = re.search(r"<head[^>]*>", html, flags=re.I)
    if not m:
        return html
    return html[: m.end()] + "\n" + block + "\n" + html[m.end() :]


def main() -> None:
    ensure_banner()
    n = 0
    for p in ROOT.rglob("*.html"):
        raw = p.read_text(encoding="utf-8", errors="surrogateescape")
        if "<head" not in raw.lower():
            continue
        rel = p.relative_to(ROOT)
        out = patch_html(raw, rel)
        if out != raw:
            p.write_text(out, encoding="utf-8")
            n += 1
    print("html_patched", n, "OG_URL", OG_URL)


if __name__ == "__main__":
    main()
