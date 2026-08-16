#!/usr/bin/env python3
"""Check if CF challenges social crawlers with challenge pages."""
import re
import ssl
import urllib.request

ctx = ssl.create_default_context()
UAs = {
    "WA": "WhatsApp/2.0",
    "FB": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Discord": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "TG": "TelegramBot (like TwitterBot)",
    "Slack": "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "iMessage": "Mozilla/5.0 Facebot Twitterbot/1.0",
    "Browser": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
}


def check(url, ua):
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": "text/html"})
    with urllib.request.urlopen(req, context=ctx, timeout=25) as r:
        raw = r.read(250000)
        body = raw.decode("utf-8", "replace")
        challenge = bool(
            re.search(
                r"Just a moment|cf-challenge|managed_challenge|cf-browser-verification|Attention Required",
                body,
                re.I,
            )
        )
        has_og = 'property="og:image"' in body or "property='og:image'" in body
        return {
            "status": r.status,
            "len": len(raw),
            "ct": r.headers.get("Content-Type", ""),
            "cf": r.headers.get("cf-ray", "-"),
            "challenge": challenge,
            "has_og": has_og,
            "title": (re.search(r"<title[^>]*>([^<]+)", body, re.I) or [None, ""])[1][
                :60
            ],
        }


url = "https://www.viniliecaffe.it/"
img = "https://www.viniliecaffe.it/apple-touch-icon.jpg?v=ogwa2"
print("HTML", url)
for name, ua in UAs.items():
    try:
        d = check(url, ua)
        print(
            f"  {name}: status={d['status']} len={d['len']} challenge={d['challenge']} og={d['has_og']} title={d['title']!r}"
        )
    except Exception as e:
        print(f"  {name}: FAIL {e}")

print("IMG", img)
for name, ua in list(UAs.items())[:5]:
    try:
        req = urllib.request.Request(url=img, headers={"User-Agent": ua})
        with urllib.request.urlopen(req, context=ctx, timeout=25) as r:
            data = r.read(20)
            print(
                f"  {name}: status={r.status} ct={r.headers.get('Content-Type')} magic={data[:3]!r}"
            )
    except Exception as e:
        print(f"  {name}: FAIL {e}")
