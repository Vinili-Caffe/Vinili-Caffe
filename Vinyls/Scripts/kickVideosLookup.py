#!/usr/bin/env python3
"""Fetch Kick channel videos via urllib (Node/curl TLS often blocked by Kick WAF)."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def main() -> int:
    slug = (sys.argv[1] if len(sys.argv) > 1 else "").strip().lower().lstrip("@")
    if not slug:
        print(json.dumps({"ok": False, "error": "missing_slug"}))
        return 2
    url = f"https://kick.com/api/v2/channels/{slug}/videos"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://kick.com/",
            "Origin": "https://kick.com",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8", "replace")
            data = json.loads(raw)
            print(json.dumps({"ok": True, "status": resp.status, "data": data}, ensure_ascii=False))
            return 0
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:500]
        print(json.dumps({"ok": False, "status": e.code, "error": body}, ensure_ascii=False))
        return 1
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
