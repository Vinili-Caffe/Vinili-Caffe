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
VER_STAFF = "20260831phBakeStaff1"

COMMON_REPS = {
    # Plain & (not &amp;): used in both HTML and JS configs. HTML5 accepts it;
    # &amp; inside JS strings shows literally in document.title / UI.
    "{{SITE_NAME}}": "Vinili & Caffè",
    "{{YEAR}}": str(datetime.now().year),
    "{{SITE_URL}}": "https://www.viniliecaffe.it/",
    "{{COOKIEYES_BLOCK}}": "",
    "{{GA_BLOCK}}": """    <!-- gtagPrivacy2 / gtagAllPages1: Consent Mode BEFORE gtag/js — sitewide -->
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
    </script>
""",
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
    "{{COMMUNITY_RULES_API_URL}}": "/webhooks/site-rules",
    "{{COMMUNITY_RULES_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-rules",
    "{{TERMS_URL}}": "/terms/",
    "{{PRIVACY_URL}}": "/dati/",
    "{{COOKIE_POLICY_URL}}": "/cookie/",
    "{{COPYRIGHT_URL}}": "/copyright/",
    "{{TICKETS_PAGE_URL}}": "/tickets/",
    "{{RICHIESTE_CANDIDATURE_URL}}": "/candidature/",
    "{{RICHIESTE_SUGGERIMENTI_URL}}": "/feedback/",
    "{{SUGGESTIONS_PAGE_URL}}": "https://www.viniliecaffe.it/feedback/",
    "{{SUGGESTIONS_PAGE_TITLE}}": "Vinili & Caffè | Feedback",
    "{{SUGGESTIONS_META_DESCRIPTION}}": "Feedback per Vinili & Caffè: proponi idee, segnala problemi, commenta e segui le decisioni dell'High Staff.",
    "{{SUGGESTIONS_OG_TITLE}}": "Vinili & Caffè | Feedback",
    "{{SUGGESTIONS_OG_URL}}": "https://www.viniliecaffe.it/feedback/",
    "{{RICHIESTE_UNBAN_URL}}": "/appelli/",
    "{{CANDIDATURE_SUBMIT_API_URL}}": "/webhooks/site-candidature",
    "{{CANDIDATURE_SUBMIT_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-candidature",
    "{{UNBAN_SUBMIT_API_URL}}": "/webhooks/site-unban",
    "{{UNBAN_SUBMIT_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-unban",
    "{{UNMUTE_SUBMIT_API_URL}}": "/webhooks/site-unmute",
    "{{UNMUTE_SUBMIT_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-unmute",
    "{{USER_PAGE_URL}}": "https://www.viniliecaffe.it/user/",
    "{{OG_IMAGE_URL}}": "https://www.viniliecaffe.it/images/og-server-icon.gif?v=20260904brandGif1",
    "{{OG_IMAGE_WIDTH}}": "512",
    "{{OG_IMAGE_HEIGHT}}": "512",
    "{{OG_IMAGE_ALT}}": "Vinili & Caffè",
    "{{OG_SITE_NAME}}": "Vinili & Caffè",
    "{{GUILD_ICON_URL}}": "https://www.viniliecaffe.it/images/og-server-icon.gif?v=20260904brandGif1",
    "{{SITE_NOTIFICATIONS_API_URL}}": "/webhooks/site-notifications",
    "{{SITE_NOTIFICATIONS_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-notifications",
    "{{VOTE_API_URL}}": "/webhooks/site-vote",
    "{{VOTE_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-vote",
    "{{SUGGESTIONS_API_URL}}": "/webhooks/site-suggestions",
    "{{SUGGESTIONS_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-suggestions",
    "{{REVIEWS_API_URL}}": "/webhooks/site-reviews",
    "{{REVIEWS_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-reviews",
    "{{ROLES_API_URL}}": "/webhooks/site-roles",
    "{{ROLES_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-roles",
    "{{BOT_FEEDBACK_API_URL}}": "/webhooks/site-bot-feedback",
    "{{BOT_FEEDBACK_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-bot-feedback",
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
    "{{WEB_TICKETS_API_URL}}": "/webhooks/site-web-tickets",
    "{{WEB_TICKETS_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-web-tickets",
    "{{TICKETS_PAGE_TITLE}}": "Vinili & Caffè | Ticket",
    "{{TICKETS_META_DESCRIPTION}}": "Apri un ticket live sul sito e chatta con lo staff in tempo reale con il tuo account Discord.",
    "{{TICKETS_OG_TITLE}}": "Vinili & Caffè | Ticket live",
    "{{TICKETS_OG_URL}}": "https://www.viniliecaffe.it/tickets/",
    "{{SUPPORT_EMAIL}}": "supporto@viniliecaffe.it",
    "{{LIVE_STATS_BOOT_WIKI}}": "",
    "{{LIVE_STATS_BOOT_USER}}": "",
    "{{CANDIDATURE_PAGE_TITLE}}": "Vinili & Caffè | Candidature",
    "{{CANDIDATURE_OG_TITLE}}": "Vinili & Caffè | Candidature",
    "{{CANDIDATURE_META_DESCRIPTION}}": "Candidati come Helper o Partner Manager nella community Discord Vinili & Caffè.",
    "{{CANDIDATURE_OG_URL}}": "https://www.viniliecaffe.it/candidature/",
    "{{FOOTER_SOCIAL_LEFT}}": "",
    "{{FOOTER_SOCIAL_RIGHT}}": "",
    "{{PERKS_PAGE_TITLE}}": "Vinili & Caffè | Perks",
    "{{PERKS_META_DESCRIPTION}}": "Perks boost Nitro, livelli EXP, badge e verifica selfie della community Discord Vinili & Caffè: riepilogo vantaggi.",
    "{{PERKS_OG_TITLE}}": "Vinili & Caffè | Perks",
    "{{PERKS_OG_URL}}": "https://www.viniliecaffe.it/perks/",
    "{{RUOLI_PAGE_TITLE}}": "Vinili & Caffè | Ruoli Personalizzati",
    "{{RUOLI_META_DESCRIPTION}}": "Tutti i ruoli personalizzati creati dal profilo sul sito nella community Discord Vinili & Caffè.",
    "{{RUOLI_OG_TITLE}}": "Vinili & Caffè | Ruoli Personalizzati",
    "{{RUOLI_OG_URL}}": "https://www.viniliecaffe.it/ruoli/",
    "{{REVIEWS_PAGE_TITLE}}": "Vinili & Caffè | Recensioni",
    "{{REVIEWS_META_DESCRIPTION}}": "Recensioni della community di Vinili & Caffè: leggi i feedback sul server e lascia la tua opinione.",
    "{{REVIEWS_OG_TITLE}}": "Vinili & Caffè | Recensioni",
    "{{REVIEWS_OG_URL}}": "https://www.viniliecaffe.it/recensioni/",
    "{{REVIEWS_URL}}": "/recensioni/",
    "{{DATI_PAGE_TITLE}}": "Vinili & Caffè | I tuoi dati",
    "{{DATI_META_DESCRIPTION}}": "Esporta o richiedi la cancellazione dei tuoi dati (GDPR) su Vinili & Caffè.",
    "{{DATI_OG_TITLE}}": "Vinili & Caffè | I tuoi dati",
    "{{DATI_PAGE_URL}}": "https://www.viniliecaffe.it/dati/",
    "{{DASHBOARD_PAGE_URL}}": "/dashboard/",
    "{{DASHBOARD_GUILD_PAGE_URL}}": "/dashboard/guild/",
    "{{DASHBOARD_SUGGESTIONS_PAGE_URL}}": "/dashboard/feedback/",
    "{{DASHBOARD_FAQ_PAGE_URL}}": "/dashboard/faq/",
    "{{DASHBOARD_PREMIUM_PAGE_URL}}": "/dashboard/premium/",
    "{{DASHBOARD_PREMIUM_CREDITS_PAGE_URL}}": "/dashboard/premium/crediti/",
    "{{DASHBOARD_PROFILE_PAGE_URL}}": "/dashboard/profilo/",
    "{{DASHBOARD_PROFILE_SUB_PAGE_URL}}": "/dashboard/profilo/abbonamento/",
    "{{DASHBOARD_PREMIUM_CREDITS_PAGE_TITLE}}": "Vinili & Caffè | Crediti Premium",
    "{{DASHBOARD_PREMIUM_CREDITS_META_DESCRIPTION}}": "Gestisci i crediti premium del tuo account su Vinili & Caffè.",
    "{{DASHBOARD_PREMIUM_CREDITS_OG_TITLE}}": "Vinili & Caffè | Crediti Premium",
    "{{DASHBOARD_PREMIUM_CREDITS_OG_URL}}": "https://www.viniliecaffe.it/dashboard/premium/crediti/",
    "{{DASHBOARD_PROFILE_PAGE_TITLE}}": "Vinili & Caffè | Profilo",
    "{{DASHBOARD_PROFILE_META_DESCRIPTION}}": "Il tuo profilo sulla dashboard Vinili & Caffè: punti, obiettivi, badge e preferenze.",
    "{{DASHBOARD_PROFILE_OG_TITLE}}": "Vinili & Caffè | Profilo",
    "{{DASHBOARD_PROFILE_OG_URL}}": "https://www.viniliecaffe.it/dashboard/profilo/",
    "{{DASHBOARD_SUGGESTIONS_PAGE_TITLE}}": "Vinili & Caffè | Feedback bot",
    "{{DASHBOARD_SUGGESTIONS_META_DESCRIPTION}}": "Feedback su Vinili: idee, miglioramenti e segnalazioni bug — dashboard Vinili & Caffè.",
    "{{DASHBOARD_SUGGESTIONS_OG_TITLE}}": "Vinili & Caffè | Feedback bot",
    "{{DASHBOARD_SUGGESTIONS_OG_URL}}": "https://www.viniliecaffe.it/dashboard/feedback/",
    "{{BOT_REVIEWS_PAGE_TITLE}}": "Vinili & Caffè | Recensioni",
    "{{BOT_REVIEWS_META_DESCRIPTION}}": "Recensioni di ViniliCaffeBot: feedback su musica, partnership e strumenti, filtrabili per lingua.",
    "{{BOT_REVIEWS_OG_TITLE}}": "Vinili & Caffè | Recensioni",
    "{{BOT_REVIEWS_OG_URL}}": "https://www.viniliecaffe.it/dashboard/recensioni/",
    "{{DASHBOARD_API_URL}}": "/webhooks/site-dashboard",
    "{{DASHBOARD_API_URL_LOCAL}}": "http://127.0.0.1:3042/webhooks/site-dashboard",
    "{{BOT_REVIEWS_PAGE_URL}}": "/dashboard/recensioni/",
    "{{STATUS_PAGE_URL}}": "/status/",
    "{{PAYPAL_DONATIONS_URL}}": "https://www.paypal.com/paypalme/viniliecaffeit",
    "{{WIKI_BOT_VINILI_AVATAR_URL}}": "https://cdn.discordapp.com/avatars/1329118940110127204/a_2f3825915a41d0f9bcbf9f2675e6d6f0.gif?size=128",
    "{{WIKI_BOT_CAFFE_AVATAR_URL}}": "https://cdn.discordapp.com/avatars/1466495522474037463/a_22dd648e8c21d246ccca2cf395533ea8.gif?size=128",
    "{{WIKI_PAGE_TITLE}}": "Vinili & Caffè | Wiki",
    "{{WIKI_META_DESCRIPTION}}": "Documentazione, comandi e guide del server Vinili &amp; Caffè su Discord.",
    "{{WIKI_OG_TITLE}}": "Vinili & Caffè | Wiki",
    "{{WIKI_OG_URL}}": "https://www.viniliecaffe.it/wiki",
    "{{WIKI_ECONOMY_UNLOCK_MS}}": "1786363200000",
    "{{WIKI_ECONOMY_VISIBLE}}": "false",
    "{{WIKI_MEMBER_ROLE_ID}}": "1442568949605597264",
    "{{WIKI_VIP_ROLE_ID}}": "1544830866616754257",
    "{{DISCORD_SPONSOR_TICKETS_MESSAGE_URL}}": "https://www.viniliecaffe.it/tickets/",
    "{{USER_PAGE_TITLE}}": "Vinili & Caffè | Community",
    "{{USER_OG_TITLE}}": "Vinili & Caffè | Community",
    "{{USER_OG_URL}}": "https://www.viniliecaffe.it/user/",
    "{{USER_META_DESCRIPTION}}": "Profilo community e staff su Vinili & Caffè.",
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
    # Import locally so this file stays runnable as a standalone scp'd script
    # when bake_url_safe.py sits beside it under WebSite/scripts/.
    try:
        from bake_url_safe import replace_leftover_placeholders
    except ImportError:
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from bake_url_safe import replace_leftover_placeholders

    reps = dict(COMMON_REPS)
    reps["{{GUILD_ICON_URL}}"] = guild_icon_from_home()
    reps["{{BUILD_ASSET_VERSION}}"] = build_ver
    out = text
    for k, v in reps.items():
        out = out.replace(k, v)
    # Never bake leftover *_URL / API / webhook placeholders to "#".
    return replace_leftover_placeholders(out, reps, strict_api=True)

def bump(text: str, name: str, ver: str) -> str:
    return re.sub(rf"({re.escape(name)}\?v=)[^\"']+", rf"\g<1>{ver}", text)

def bake_file(rel: str, build_ver: str, post=None, roots=None) -> None:
    roots = roots or (WWW, BOT)
    for root in roots:
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
    return text

def post_user(text: str) -> str:
    return text

def post_staff(text: str) -> str:
    text = bump(text, "vc-home-cine.js", "20260831cineCardUnify1")
    text = bump(text, "staff-pause.css", "20260831cineCardUnify1")
    text = bump(text, "discord-auth.js", "20260831site429Fix2")
    text = bump(text, "vc-landing.js", "20260831site429Fix2")
    text = bump(text, "vc-chrome-sync.js", "20260831site429Fix2")
    return text

def post_i18n_js(text: str) -> str:
    return text

def main() -> None:
    build_notif = build_ver_from_faq(VER_NOTIF)
    build_user = build_ver_from_faq(VER_USER)
    build_staff = build_ver_from_faq(VER_STAFF)
    # Always bake every HTML under WWW/BOT that still has placeholders.
    for root in (WWW, BOT):
        if not root.is_dir():
            continue
        for p in sorted(root.rglob("*.html")):
            if ".bak" in p.name:
                continue
            try:
                raw = p.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            if "{{" not in raw or not re.search(r"\{\{[A-Z0-9_]+\}\}", raw):
                continue
            rel = str(p.relative_to(root)).replace("\\", "/")
            ver = build_staff if rel.startswith("staff/") else (build_notif if rel.startswith("notifications/") else build_user)
            post = post_staff if rel.startswith("staff/") else None
            bake_file(rel, ver, post, roots=(root,))
    for rel in ("js/vc-i18n-locales.js", "js/vc-i18n-pages-extra.js"):
        bake_file(rel, build_staff, post_i18n_js, roots=(WWW,))
    leftover_pages = []
    ph = re.compile(r"\{\{[A-Z0-9_]+\}\}")
    for p in sorted(WWW.rglob("*.html")):
        try:
            t = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if ph.search(t):
            leftover_pages.append(str(p.relative_to(WWW)))
    if leftover_pages:
        raise SystemExit("leftover html placeholders: " + ", ".join(leftover_pages[:40]))
    for rel in (
        "notifications/index.html",
        "user/index.html",
        "staff/guida/index.html",
        "staff/pause/index.html",
        "staff/organico/index.html",
        "candidature/index.html",
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
            if rel == "candidature/index.html":
                assert "/webhooks/site-candidature" in t, "candidature api missing"
    for rel in ("js/vc-i18n-locales.js", "js/vc-i18n-pages-extra.js"):
        p = WWW / rel
        if p.is_file():
            t = p.read_text(encoding="utf-8")
            assert "{{" not in t, rel
            assert "Vinili" in t, rel
    # Guard against the tickets-style bake bug (apiUrl: "#").
    for p in sorted(WWW.rglob("*.html")):
        if ".bak" in p.name:
            continue
        try:
            t = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if 'apiUrl: "#"' in t or "apiUrl: '#'" in t:
            raise SystemExit(f"apiUrl baked to # in {p.relative_to(WWW)}")
    print("done", VER_STAFF)

if __name__ == "__main__":
    main()
