#!/usr/bin/env python3
"""Bake {{PLACEHOLDERS}} in notifications/index.html from donor pages + site.config."""
from __future__ import annotations

import json
import re
import shutil
from datetime import datetime
from pathlib import Path

WWW = Path("/var/www/viniliecaffe")
BOT = Path("/opt/bot/WebSite")
TARGET = WWW / "notifications" / "index.html"
DONOR = WWW / "faq/index.html"
USER = WWW / "user/index.html"
CFG = BOT / "site.config.json"
VER_NOTIF = "20260828notifBoot1"
VER_INBOX = "20260828inboxMobile3"

def grab(text: str, pattern: str, default: str = "") -> str:
    m = re.search(pattern, text, flags=re.S)
    if not m:
        return default
    val = ""
    try:
        # Support multi-group alternation patterns (first non-empty group).
        for i in range(1, (m.lastindex or 0) + 1):
            g = m.group(i)
            if g:
                val = str(g).strip()
                break
    except IndexError:
        val = ""
    if not val:
        try:
            val = (m.group(1) or "").strip()
        except IndexError:
            val = ""
    if "{{" in val or "}}" in val:
        return default
    return val or default

def main() -> None:
    if not TARGET.exists():
        raise SystemExit(f"missing {TARGET}")
    live = TARGET.read_text(encoding="utf-8", errors="replace")
    if "{{" not in live:
        print("no placeholders — skip")
        return

    donor = DONOR.read_text(encoding="utf-8", errors="replace") if DONOR.exists() else ""
    user = USER.read_text(encoding="utf-8", errors="replace") if USER.exists() else ""
    cfg = {}
    if CFG.exists():
        cfg = json.loads(CFG.read_text(encoding="utf-8"))

    site_url = grab(donor, r'property="og:url"\s+content="([^"]+)"', "https://www.viniliecaffe.it/faq/")
    if site_url.endswith("/faq/"):
        site_url = site_url[: -len("faq/")]
    elif not site_url.endswith("/"):
        site_url += "/"

    site_name = grab(donor, r"<title>([^|<]+)", "Vinili &amp; Caffè").strip()
    guild_icon = ""
    m_icon = re.search(
        r'<img[^>]*class="[^"]*vc-header-logo-img[^"]*"[^>]*src="([^"]+)"',
        donor,
    ) or re.search(
        r'<img[^>]*src="([^"]+)"[^>]*class="[^"]*vc-header-logo-img[^"]*"',
        donor,
    )
    if m_icon:
        guild_icon = m_icon.group(1).strip()
    if not guild_icon or "{{" in guild_icon:
        guild_icon = grab(donor, r'vc-header-logo-img[^>]*src="([^"]+)"', "")
    if not guild_icon or "{{" in guild_icon:
        guild_icon = (
            "https://cdn.discordapp.com/icons/1329080093599076474/"
            "a_152fffe587276d12887237d53390e495.gif?size=256"
        )
    discord_invite = grab(donor, r'aria-label="Entra su Discord"[^>]*href="([^"]+)"', "https://discord.gg/viniliecaffe")
    og_image = grab(donor, r'property="og:image"\s+content="([^"]+)"', "https://cdn.discordapp.com/icons/1329080093599076474/a_152fffe587276d12887237d53390e495.png?size=256&v=ogguild1")
    build_ver = grab(donor, r'vc-fonts\.css\?v=([^"\']+)', VER_NOTIF)
    client_id = grab(donor, r'clientId:\s*"([0-9]+)"', str(cfg.get("discordOAuthClientId", "")))
    redirect_uri = grab(donor, r'redirectUri:\s*"([^"]+)"', site_url)

    notif_api = grab(user, r'window\.__VC_SITE_NOTIFS\s*=\s*\{[^}]*apiUrl:\s*"([^"]+)"', "/webhooks/site-notifications")
    notif_api_local = grab(
        user,
        r'window\.__VC_SITE_NOTIFS\s*=\s*\{[^}]*apiUrlLocal:\s*"([^"]*)"',
        "http://127.0.0.1:3042/webhooks/site-notifications",
    )
    staff_access = grab(
        user,
        r'window\.__VC_STAFF_ACCESS\s*=\s*\{[^}]*apiUrl:\s*"([^"]+)"',
        "/webhooks/site-staff-access",
    )
    staff_access_local = grab(
        user,
        r'window\.__VC_STAFF_ACCESS\s*=\s*\{[^}]*apiUrlLocal:\s*"([^"]*)"',
        "http://127.0.0.1:3042/webhooks/site-staff-access",
    )

    year = str(datetime.now().year)
    copyright_url = grab(donor, r'href="([^"]+)"[^>]*>Â©|href="([^"]+)"[^>]*>©', "")
    if not copyright_url:
        copyright_url = grab(donor, r'class="vc-footer-copy-link"\s+href="([^"]+)"', "/copyright/")

    replacements = {
        "COOKIEYES_BLOCK": "",
        "GA_BLOCK": """<!-- gtagPrivacy2 / gtagAllPages1 -->
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag("consent", "default", {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "granted",
        functionality_storage: "granted",
        personalization_storage: "denied",
        security_storage: "granted",
        wait_for_update: 400
      });
      gtag("set", "ads_data_redaction", true);
      gtag("set", "url_passthrough", true);
    </script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-KPF6425N60"></script>
    <script>
      gtag("js", new Date());
      gtag("config", "G-KPF6425N60", {
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        anonymize_ip: true,
        send_page_view: true
      });
    </script>""",
        "SITE_NAME": site_name,
        "SITE_URL": site_url,
        "YEAR": year,
        "BUILD_ASSET_VERSION": build_ver,
        "GUILD_ICON_URL": guild_icon,
        "DISCORD_INVITE_URL": discord_invite,
        "DISCORD_OAUTH_CLIENT_ID": client_id,
        "DISCORD_OAUTH_REDIRECT_URI": redirect_uri,
        "OG_IMAGE_URL": og_image,
        "WIKI_URL": "/wiki/",
        "SPONSOR_URL": "/sponsor/",
        "DONATIONS_URL": "/donazioni/",
        "FAQ_URL": "/faq/",
        "VOTE_URL": "/vote/",
        "PERKS_URL": "/perks/",
        "RUOLI_PAGE_URL": "/ruoli/",
        "REVIEWS_PAGE_URL": "/recensioni/",
        "COMMUNITY_RULES_URL": "/regole/",
        "TERMS_URL": "/terms/",
        "PRIVACY_URL": "/dati/",
        "COOKIE_POLICY_URL": "/cookie/",
        "COPYRIGHT_URL": copyright_url or "/copyright/",
        "RICHIESTE_CANDIDATURE_URL": "/candidature/",
        "RICHIESTE_SUGGERIMENTI_URL": "/suggerimenti/",
        "RICHIESTE_UNBAN_URL": "/unban/",
        "TICKETS_PAGE_URL": "/tickets/",
        "USER_PAGE_URL": site_url + "user/",
        "INSTAGRAM_URL": "https://www.instagram.com/viniliecaffe/",
        "TIKTOK_URL": "https://www.tiktok.com/@viniliecaffe",
        "LIVE_STATS_BOOT_WIKI": "",
        "SITE_NOTIFICATIONS_API_URL": notif_api,
        "SITE_NOTIFICATIONS_API_URL_LOCAL": notif_api_local,
        "STAFF_ACCESS_API_URL": staff_access,
        "STAFF_ACCESS_API_URL_LOCAL": staff_access_local,
    }

    out = live
    for key, val in replacements.items():
        out = out.replace("{{" + key + "}}", val)

    missing = sorted(set(re.findall(r"\{\{([A-Z0-9_]+)\}\}", out)))
    if missing:
        raise SystemExit(f"still missing placeholders: {missing}")

    out = re.sub(
        r"notifications-page\.js\?v=[^\"']+",
        f"notifications-page.js?v={VER_NOTIF}",
        out,
    )
    out = re.sub(
        r"notifications-staff-tab\.js\?v=[^\"']+",
        f"notifications-staff-tab.js?v={VER_INBOX}",
        out,
    )
    out = re.sub(
        r"discord-auth\.js\?v=[^\"']+",
        "discord-auth.js?v=20260828notifFlat13",
        out,
    )
    out = re.sub(
        r"vc-home-cine\.js\?v=[^\"']+",
        "vc-home-cine.js?v=20260828notifFlat13",
        out,
    )

    bak = TARGET.with_suffix(".html.bak_ph_" + VER_NOTIF)
    shutil.copy2(TARGET, bak)
    TARGET.write_text(out, encoding="utf-8")
    print(f"baked {TARGET} ({len(out)} bytes), backup {bak.name}")

    bot_target = BOT / "notifications" / "index.html"
    if bot_target.parent.is_dir():
        bot_target.write_text(out, encoding="utf-8")
        print(f"baked {bot_target}")

    assert "{{" not in out
    assert "notifications-page.js?v=" + VER_NOTIF in out
    print("ok")

if __name__ == "__main__":
    main()
