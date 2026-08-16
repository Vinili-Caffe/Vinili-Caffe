#!/usr/bin/env python3
import re
import ssl
import urllib.request

ctx = ssl.create_default_context()
paths = ["/", "/tickets", "/tickets.html", "/staff", "/privacy", "/regole", "/wiki"]
ua = "WhatsApp/2.0"


def fetch(url, ua):
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
        body = r.read(120000).decode("utf-8", "replace")
        return r.status, dict(r.headers), body


for p in paths:
    url = "https://www.viniliecaffe.it" + p
    try:
        st, hdrs, body = fetch(url, ua)
        img = re.search(
            r'property=["\']og:image["\']\s+content=["\']([^"\']+)', body, re.I
        )
        ou = re.search(
            r'property=["\']og:url["\']\s+content=["\']([^"\']+)', body, re.I
        )
        print(
            p,
            st,
            "ogimg=" + (img.group(1) if img else "MISSING"),
            "ogurl=" + (ou.group(1) if ou else "MISSING"),
            "cf=" + hdrs.get("cf-ray", "-"),
            "ct=" + hdrs.get("content-type", ""),
        )
    except Exception as e:
        print(p, "FAIL", e)

print("--- response headers home ---")
st, hdrs, body = fetch("https://www.viniliecaffe.it/", ua)
for k in (
    "content-type",
    "x-robots-tag",
    "cache-control",
    "cf-cache-status",
    "server",
    "content-security-policy",
):
    if k in {x.lower(): x for x in hdrs}.keys() or True:
        # headers dict may be case-insensitive
        v = hdrs.get(k) or hdrs.get(k.title()) or hdrs.get(k.upper())
        # try all
        for hk, hv in hdrs.items():
            if hk.lower() == k:
                print(f"{hk}: {hv}")
                break
