#!/usr/bin/env python3
"""Deploy staff premium footer + staff footer column JS (VER=20260909staffFooter1)."""
from __future__ import annotations

import re
import shutil
from datetime import datetime
from pathlib import Path

VER = "20260909staffFooter1"
WWW = Path("/var/www/viniliecaffe")
BOT = Path("/opt/bot/WebSite")
STAGING = Path(f"/tmp/vc_staffFooter1")

COMMON = {
    "{{SITE_NAME}}": "Vinili & Caffè",
    "{{YEAR}}": str(datetime.now().year),
    "{{SITE_URL}}": "https://www.viniliecaffe.it/",
    "{{COOKIEYES_BLOCK}}": "",
    "{{GA_BLOCK}}": "",
    "{{DISCORD_OAUTH_CLIENT_ID}}": "1329118940110127204",
    "{{DISCORD_OAUTH_REDIRECT_URI}}": "https://www.viniliecaffe.it/",
    "{{DISCORD_INVITE_URL}}": "https://discord.gg/viniliecaffe",
    "{{INSTAGRAM_URL}}": "https://www.instagram.com/viniliecaffe/",
    "{{TIKTOK_URL}}": "https://www.tiktok.com/@viniliecaffe",
    "{{WIKI_URL}}": "/wiki/",
    "{{SPONSOR_URL}}": "/sponsor/",
    "{{DONATIONS_URL}}": "/donazioni/",
    "{{FAQ_URL}}": "/faq/",
    "{{VOTE_URL}}": "/vote/",
    "{{PERKS_URL}}": "/perks/",
    "{{RUOLI_PAGE_URL}}": "/ruoli/",
    "{{REVIEWS_PAGE_URL}}": "/recensioni/",
    "{{COMMUNITY_RULES_URL}}": "/regole/",
    "{{TERMS_URL}}": "/terms/",
    "{{PRIVACY_URL}}": "/dati/",
    "{{COOKIE_POLICY_URL}}": "/cookie/",
    "{{COPYRIGHT_URL}}": "/copyright/",
    "{{TICKETS_PAGE_URL}}": "/tickets/",
    "{{RICHIESTE_CANDIDATURE_URL}}": "/candidature/",
    "{{RICHIESTE_SUGGERIMENTI_URL}}": "/feedback/",
    "{{RICHIESTE_UNBAN_URL}}": "/appelli/",
    "{{USER_PAGE_URL}}": "https://www.viniliecaffe.it/user/",
    "{{OG_IMAGE_URL}}": "https://www.viniliecaffe.it/images/og-server-icon.gif?v=20260904brandGif1",
    "{{GUILD_ICON_URL}}": "https://www.viniliecaffe.it/images/og-server-icon.gif?v=20260904brandGif1",
    "{{STAFF_ACCESS_API_URL}}": "/webhooks/site-staff-access",
    "{{STAFF_ACCESS_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-staff-access",
    "{{STAFF_ORGANICO_API_URL}}": "/webhooks/site-staff-organico",
    "{{STAFF_ORGANICO_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-staff-organico",
    "{{BUILD_ASSET_VERSION}}": VER,
}


def bake(text: str) -> str:
    out = text
    for k, v in COMMON.items():
        out = out.replace(k, v)
    return out


def copy_file(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    if dest.suffix.lower() in {".html", ".htm"}:
        raw = dest.read_text(encoding="utf-8")
        baked = bake(raw)
        if "{{" in baked:
            left = sorted(set(re.findall(r"\{\{[A-Z0-9_]+\}\}", baked)))
            # allow leftover rare placeholders outside footer
            bad = [x for x in left if x not in {"{{LIVE_STATS_BOOT_WIKI}}", "{{LIVE_STATS_BOOT_USER}}"}]
            if bad:
                raise SystemExit(f"PLACEHOLDERS left in {dest}: {bad[:8]}")
        dest.write_text(baked, encoding="utf-8")


STAFF_HTML = [
    "staff/guida/index.html",
    "staff/pause/index.html",
    "staff/confessionale/index.html",
    "staff/organico/index.html",
    "staff/accesso-richiesto/index.html",
]

JS = [
    "js/staff-site-nav.js",
    "js/discord-auth.js",
]

# Key pages with premium footer that need discord-auth bust for staff col
KEY_HTML = [
    "index.html",
    "user/index.html",
    "notifications/index.html",
    "faq/index.html",
    "wiki/index.html",
    "regole/index.html",
    "tickets/index.html",
]


def main() -> None:
    assert STAGING.is_dir(), f"missing staging {STAGING}"
    for rel in STAFF_HTML + JS:
        src = STAGING / rel
        assert src.is_file(), f"missing {src}"
        for root in (WWW, BOT):
            if not root.exists():
                continue
            copy_file(src, root / rel)
            print("OK", root / rel)

    # Bust discord-auth / staff-site-nav on key live pages without replacing whole HTML
    auth_re = re.compile(r"discord-auth\.js\?v=[^\"']+")
    snav_re = re.compile(r"staff-site-nav\.js\?v=[^\"']+")
    for rel in KEY_HTML:
        for root in (WWW, BOT):
            if not root.exists():
                continue
            path = root / rel
            if not path.is_file():
                continue
            raw = path.read_text(encoding="utf-8", errors="replace")
            nxt = auth_re.sub(f"discord-auth.js?v={VER}", raw)
            nxt = snav_re.sub(f"staff-site-nav.js?v={VER}", nxt)
            if nxt != raw:
                path.write_text(nxt, encoding="utf-8")
                print("BUST", path)

    # Prefer not to re-run full-site bake here (needs bake_url_safe on PYTHONPATH).
    # Staff HTML already baked via COMMON in copy_file().

    # Site-wide discord-auth cache bust on live HTML (footer staff col path)
    auth_re = re.compile(r"discord-auth\.js\?v=[^\"']+")
    snav_re = re.compile(r"staff-site-nav\.js\?v=[^\"']+")
    for root in (WWW, BOT):
        if not root.exists():
            continue
        n = 0
        for html in root.rglob("*.html"):
            raw = html.read_text(encoding="utf-8", errors="replace")
            nxt = auth_re.sub(f"discord-auth.js?v={VER}", raw)
            nxt = snav_re.sub(f"staff-site-nav.js?v={VER}", nxt)
            if nxt != raw:
                html.write_text(nxt, encoding="utf-8")
                n += 1
        print(f"BUST html under {root}: {n}")

    # Assert staff pages
    for rel in STAFF_HTML:
        p = WWW / rel
        t = p.read_text(encoding="utf-8")
        assert "vc-premium-footer" in t, f"no premium footer in {rel}"
        left = sorted(set(re.findall(r"\{\{[A-Z0-9_]+\}\}", t)))
        assert not left, f"placeholders in {rel}: {left[:8]}"
        print("ASSERT footer", rel)

    snav = (WWW / "js/staff-site-nav.js").read_text(encoding="utf-8")
    assert "injectStaffFooterColumns" in snav
    assert 'data-vc-footer-staff="1"' in snav
    assert "/staff/confessionale/" in snav
    auth = (WWW / "js/discord-auth.js").read_text(encoding="utf-8")
    assert f"staff-site-nav.js?v={VER}" in auth
    print("PASS", VER)


if __name__ == "__main__":
    main()
