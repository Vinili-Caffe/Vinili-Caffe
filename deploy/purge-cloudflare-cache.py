#!/usr/bin/env python3
"""Purge all Cloudflare cache for viniliecaffe.it (uses /etc/cloudflare/vc-waf-token on VPS)."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ZONE_NAME = "viniliecaffe.it"
TOKEN_PATH = Path("/etc/cloudflare/vc-waf-token")


def api(method: str, url: str, token: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    token = TOKEN_PATH.read_text(encoding="utf-8").strip()
    zones = api("GET", f"https://api.cloudflare.com/client/v4/zones?name={ZONE_NAME}", token)
    results = zones.get("result") or []
    if not results:
        print(json.dumps(zones, indent=2))
        return 1
    zone_id = results[0]["id"]
    out = api(
        "POST",
        f"https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache",
        token,
        {"purge_everything": True},
    )
    print(json.dumps({"zone_id": zone_id, "success": out.get("success"), "errors": out.get("errors")}))
    return 0 if out.get("success") else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.HTTPError as e:
        print(e.read().decode("utf-8", errors="replace"), file=sys.stderr)
        raise SystemExit(1)
