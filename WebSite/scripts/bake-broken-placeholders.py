#!/usr/bin/env python3
"""Re-bake {{PLACEHOLDERS}} on live pages (notifications + user + staff)."""
from __future__ import annotations

import re
import shutil
from datetime import datetime
from pathlib import Path

WWW = Path("/var/www/viniliecaffe")
BOT = Path("/opt/bot/WebSite")
HOME = WWW / "index.html"
FAQ = WWW / "faq/index.html"

VER_USER = "20260828staffManage1"
VER_NOTIF = "20260828notifBoot1"
VER_INBOX = "20260828inboxMobile7"

COMMON_REPS = {
    "{{SITE_NAME}}": "Vinili &amp; Caffè",
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
    "{{RICHIESTE_SUGGERIMENTI_URL}}": "/suggerimenti/",
    "{{RICHIESTE_UNBAN_URL}}": "/unban/",
    "{{USER_PAGE_URL}}": "https://www.viniliecaffe.it/user/",
    "{{OG_IMAGE_URL}}": "/images/og-banner.jpg",
    "{{GUILD_ICON_URL}}": "https://cdn.discordapp.com/icons/1329080093599076474/a_152fffe587276d12887237d53390e495.gif?size=256",
    "{{SITE_NOTIFICATIONS_API_URL}}": "/webhooks/site-notifications",
    "{{SITE_NOTIFICATIONS_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-notifications",
    "{{STAFF_ACCESS_API_URL}}": "/webhooks/site-staff-access",
    "{{STAFF_ACCESS_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-staff-access",
    "{{USERS_LEADERBOARD_API_URL}}": "/webhooks/site-users",
    "{{USERS_LEADERBOARD_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-users",
    "{{STAFF_PROFILE_API_URL}}": "/webhooks/site-staff-profile",
    "{{STAFF_PROFILE_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-staff-profile",
    "{{STAFF_PM_SHOP_API_URL}}": "/webhooks/site-staff-pm-shop",
    "{{STAFF_PM_SHOP_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-staff-pm-shop",
    "{{STAFF_MANAGE_API_URL}}": "/webhooks/site-staff-manage",
    "{{STAFF_MANAGE_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-staff-manage",
    "{{STAFF_ORGANICO_API_URL}}": "/webhooks/site-staff-organico",
    "{{STAFF_ORGANICO_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-staff-organico",
    "{{STAFF_PAUSE_API_URL}}": "/webhooks/site-staff-pause",
    "{{STAFF_PAUSE_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-staff-pause",
    "{{STAFF_SERATAFILM_API_URL}}": "/webhooks/site-staff-seratafilm",
    "{{STAFF_SERATAFILM_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-staff-seratafilm",
    "{{LIVE_STATS_BOOT_WIKI}}": "",
    "{{LIVE_STATS_BOOT_USER}}": "",
    "{{FOOTER_SOCIAL_LEFT}}": "",
    "{{FOOTER_SOCIAL_RIGHT}}": "",
    "{{USER_PAGE_TITLE}}": "Vinili &amp; Caffè | Community",
    "{{USER_OG_TITLE}}": "Vinili &amp; Caffè | Community",
    "{{USER_OG_URL}}": "https://www.viniliecaffe.it/user/",
    "{{USER_META_DESCRIPTION}}": "Profilo community e staff su Vinili &amp; Caffè.",
}


def guild_icon_from_home() -> str:
    if not HOME.exists():
        return COMMON_REPS["{{GUILD_ICON_URL}}"]
    home = HOME.read_text(encoding="utf-8", errors="replace")
    m = re.search(r'class="vc-header-logo-img"[^>]*src="([^"]+)"', home)
    return m.group(1) if m else COMMON_REPS["{{GUILD_ICON_URL}}"]


def build_ver_from_faq(default: str) -> str:
    if not FAQ.exists():
        return default
    faq = FAQ.read_text(encoding="utf-8", errors="replace")
    m = re.search(r'vc-fonts\.css\?v=([^"\']+)', faq)
    return m.group(1) if m else default


def bake_text(text: str, build_ver: str) -> str:
    reps = dict(COMMON_REPS)
    reps["{{GUILD_ICON_URL}}"] = guild_icon_from_home()
    reps["{{BUILD_ASSET_VERSION}}"] = build_ver
    out = text
    for k, v in reps.items():
        out = out.replace(k, v)
    leftover = sorted(set(re.findall(r"\{\{[A-Z0-9_]+\}\}", out)))
    for ph in leftover:
        if any(x in ph for x in ("BLOCK", "LOCAL", "BOOT", "SOCIAL")):
            out = out.replace(ph, "")
        elif "URL" in ph:
            out = out.replace(ph, "#")
        else:
            out = out.replace(ph, "")
    return out


def bump(text: str, name: str, ver: str) -> str:
    return re.sub(rf"({re.escape(name)}\?v=)[^\"']+", rf"\g<1>{ver}", text)


def bake_file(rel: str, build_ver: str, post=None) -> None:
    for root in (WWW, BOT):
        path = root / rel
        if not path.is_file():
            continue
        raw = path.read_text(encoding="utf-8", errors="replace")
        if "{{" not in raw:
            print(f"skip (ok) {path}")
            continue
        bak = path.with_suffix(path.suffix + ".bak_ph_fix")
        shutil.copy2(path, bak)
        out = bake_text(raw, build_ver)
        if post:
            out = post(out)
        left = sorted(set(re.findall(r"\{\{[A-Z0-9_]+\}\}", out)))
        if left:
            raise SystemExit(f"unbaked in {path}: {left}")
        path.write_text(out, encoding="utf-8")
        print(f"baked {path} (backup {bak.name})")


def post_notif(text: str) -> str:
    # Non forzare ?v= vecchi: i deploy recenti gestiscono già il cache-bust.
    return text


def post_user(text: str) -> str:
    return text


def post_staff(text: str) -> str:
    return text


def main() -> None:
    build_notif = build_ver_from_faq(VER_NOTIF)
    build_user = build_ver_from_faq(VER_USER)
    build_staff = build_ver_from_faq(VER_INBOX)
    bake_file("notifications/index.html", build_notif, post_notif)
    bake_file("user/index.html", build_user, post_user)
    for rel in (
        "staff/pause/index.html",
        "staff/guida/index.html",
        "staff/punti-tolti/index.html",
        "staff/organico/index.html",
        "staff/inbox/index.html",
        "staff/index.html",
        "staff/gestione/index.html",
    ):
        bake_file(rel, build_staff, post_staff)
    for rel in (
        "notifications/index.html",
        "user/index.html",
        "staff/organico/index.html",
    ):
        p = WWW / rel
        if p.is_file():
            t = p.read_text(encoding="utf-8")
            assert "{{" not in t, rel
            assert "Vinili" in t, rel
            if rel == "user/index.html":
                assert "__VC_STAFF_MANAGE" in t, "manage config missing"
                assert "staff-manage-modal.js" in t, "manage modal script missing"
            if rel == "staff/organico/index.html":
                assert "__VC_STAFF_ORGANICO" in t, "organico config missing"
                assert "/webhooks/site-staff-organico" in t, "organico api missing"
    print("done")


if __name__ == "__main__":
    main()
