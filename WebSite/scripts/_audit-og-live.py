#!/usr/bin/env python3
import re
import ssl
import urllib.request

ctx = ssl.create_default_context()
UAs = {
    "WA": "WhatsApp/2.0",
    "FB": "facebookexternalhit/1.1",
    "Discord": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "TG": "TelegramBot (like TwitterBot)",
    "Slack": "Slackbot-LinkExpanding 1.0",
}
pages = [
    "https://www.viniliecaffe.it/",
    "https://www.viniliecaffe.it/tickets.html",
    "https://www.viniliecaffe.it/staff.html",
    "https://www.viniliecaffe.it/privacy.html",
]
img = "https://www.viniliecaffe.it/og.jpg?v=ogwa4"


def fetch(url, ua):
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
            body = r.read(200000).decode("utf-8", "replace")
            return r.status, dict(r.headers), body
    except Exception as e:
        return None, {}, str(e)


print("=== IMAGE ===")
for name, ua in UAs.items():
    st, hdrs, body = fetch(img, ua)
    if st:
        print(
            f"{name}: status={st} type={hdrs.get('Content-Type','')} len={hdrs.get('Content-Length','')}"
        )
    else:
        print(f"{name}: FAIL {body}")

print("\n=== HTML OG ===")
for page in pages:
    st, hdrs, body = fetch(page, UAs["WA"])
    if not st:
        print(page, "FAIL", body)
        continue
    ogs = re.findall(r'<meta[^>]+property=["\']og:[^"\']+["\'][^>]*>', body, re.I)
    tw = re.findall(r'<meta[^>]+name=["\']twitter:[^"\']+["\'][^>]*>', body, re.I)
    img_m = re.search(
        r'property=["\']og:image["\']\s+content=["\']([^"\']+)', body, re.I
    )
    title = re.search(
        r'property=["\']og:title["\']\s+content=["\']([^"\']+)', body, re.I
    )
    print(f"\n{page}")
    print("  status", st, "og:image", img_m.group(1) if img_m else None)
    print("  og:title", title.group(1) if title else None)
    print("  og tags", len(ogs), "twitter", len(tw))
    disc = re.findall(r"<link[^>]+cdn\.discordapp\.com[^>]*>", body, re.I)
    if disc:
        print("  discord links", len(disc))
