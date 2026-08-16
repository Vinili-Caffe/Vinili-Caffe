#!/usr/bin/env python3
"""Check if social crawlers get real HTML or CF challenge for pages."""
from __future__ import annotations

import re
import urllib.request
import urllib.error

ORIGIN = "https://www.viniliecaffe.it"
pages = ["/", "/tickets/", "/wiki/", "/sponsor/", "/faq/", "/evento/"]
uas = {
    "WhatsApp": "WhatsApp/2.23.20.0 A",
    "facebook": "facebookexternalhit/1.1",
    "Discordbot": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "TelegramBot": "TelegramBot (like TwitterBot)",
    "Slackbot": "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "iMessage": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0",
}


def fetch(url, ua):
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read(12000).decode("utf-8", "ignore")
            return r.status, body
    except urllib.error.HTTPError as e:
        body = e.read(4000).decode("utf-8", "ignore") if e.fp else ""
        return e.code, body
    except Exception as e:
        return "ERR", str(e)


for page in pages:
    print(f"\n== {page} ==")
    for name, ua in uas.items():
        st, body = fetch(ORIGIN + page, ua)
        challenge = "Just a moment" in body or "cf-browser-verification" in body or "Managed Challenge" in body
        og_img = ""
        m = re.search(r'property=["\']og:image["\'][^>]*content=["\']([^"\']+)', body, re.I)
        if not m:
            m = re.search(r'content=["\']([^"\']+)["\'][^>]*property=["\']og:image["\']', body, re.I)
        if m:
            og_img = m.group(1)[:70]
        og_title = "og:title" in body
        print(f"  {name:12} {st} challenge={challenge} title={og_title} img={og_img or 'NONE'}")
