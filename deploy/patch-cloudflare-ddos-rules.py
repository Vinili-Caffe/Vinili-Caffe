#!/usr/bin/env python3
"""Cloudflare WAF + rate limit rules for viniliecaffe.it (API token)."""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ZONE_NAME = "viniliecaffe.it"
TOKEN_PATH = Path("/etc/letsencrypt/cloudflare.ini")
WAF_TOKEN_PATH = Path("/etc/cloudflare/vc-waf-token")

WAF_RULES = [
    {
        "description": "VC: allow verified bots + Lighthouse",
        "expression": (
            '(cf.client.bot) or '
            '(http.user_agent contains "Chrome-Lighthouse") or '
            '(http.user_agent contains "Google Page Speed") or '
            '(http.user_agent contains "Lighthouse")'
        ),
        "action": "skip",
        "action_parameters": {"ruleset": "current"},
    },
    {
        "description": "VC: block common exploit scans",
        "expression": (
            '(http.request.uri.path contains "/.env") or '
            '(http.request.uri.path contains "/wp-admin") or '
            '(http.request.uri.path contains "/wp-login") or '
            '(http.request.uri.path contains "/phpmyadmin") or '
            '(http.request.uri.path contains "/.git") or '
            '(http.request.uri.path contains "/cgi-bin/") or '
            '(http.request.uri.path contains "/vendor/phpunit")'
        ),
        "action": "block",
    },
]

RATE_RULE = {
    "description": "VC: rate limit webhooks",
    "expression": '(http.request.uri.path contains "/webhooks/")',
    "action": "block",
    "ratelimit": {
        "characteristics": ["cf.colo.id", "ip.src"],
        "period": 10,
        "requests_per_period": 20,
        "mitigation_timeout": 10,
    },
}


def load_token() -> str:
    tok = str(os.environ.get("CF_API_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN") or "").strip()
    if tok:
        return tok
    if WAF_TOKEN_PATH.is_file():
        tok = WAF_TOKEN_PATH.read_text(encoding="utf-8").strip()
        if tok:
            return tok
    if TOKEN_PATH.is_file():
        for line in TOKEN_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("dns_cloudflare_api_token"):
                return line.split("=", 1)[1].strip()
    return ""


def cf_request(method: str, url: str, token: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {err.code}: {body}") from err


def zone_id(token: str) -> str:
    q = urllib.parse.quote(ZONE_NAME)
    data = cf_request("GET", f"https://api.cloudflare.com/client/v4/zones?name={q}", token)
    if not data.get("success") or not data.get("result"):
        raise RuntimeError(f"zone lookup failed: {data.get('errors')}")
    return str(data["result"][0]["id"])


def upsert_ruleset_phase(token: str, zid: str, phase: str, rules: list[dict], label: str) -> None:
    entry_url = f"https://api.cloudflare.com/client/v4/zones/{zid}/rulesets/phases/{phase}/entrypoint"
    rs_id = None
    current_rules: list[dict] = []
    try:
        existing = cf_request("GET", entry_url, token)
        rs = existing.get("result") or {}
        rs_id = rs.get("id")
        current_rules = list(rs.get("rules") or [])
    except RuntimeError as err:
        if not re.search(r"\b404\b|10003", str(err)):
            raise

    kept = [r for r in current_rules if not str(r.get("description", "")).startswith("VC:")]
    merged = [{**r, "enabled": True} for r in rules] + kept

    payload = {"rules": merged}
    if rs_id:
        cf_request(
            "PUT",
            f"https://api.cloudflare.com/client/v4/zones/{zid}/rulesets/{rs_id}",
            token,
            payload,
        )
        print(f"{label}: updated ({len(rules)} VC rules)")
        return

    try:
        cf_request("PUT", entry_url, token, payload)
        print(f"{label}: entrypoint created ({len(rules)} VC rules)")
    except RuntimeError:
        create_payload = {
            "name": f"VC {label}",
            "kind": "zone",
            "phase": phase,
            "rules": merged,
        }
        cf_request(
            "POST",
            f"https://api.cloudflare.com/client/v4/zones/{zid}/rulesets",
            token,
            create_payload,
        )
        print(f"{label}: created ({len(rules)} VC rules)")


def print_manual() -> None:
    print(
        "\nCloudflare API non disponibile o token senza permessi WAF/Rate Limit.\n"
        "Dashboard manuale:\n"
        "  Security → WAF → Custom rules:\n"
        "    1) Skip: (cf.client.bot) or (http.user_agent contains \"Chrome-Lighthouse\")\n"
        "    2) Block: path contains /.env, /wp-admin, /.git\n"
        "  Security → WAF → Rate limiting rules:\n"
        "    Path contains /webhooks/ → 120 req/min → Block 2 min\n"
        "  DNS: www + apex proxied (arancione)\n"
        "  Security → Settings: Security Level Medium, Bot Fight Mode ON\n"
    )


def main() -> int:
    token = load_token()
    if not token:
        print("Missing CF API token", file=sys.stderr)
        print_manual()
        return 1

    try:
        zid = zone_id(token)
        print(f"zone {ZONE_NAME}: {zid}")
        upsert_ruleset_phase(token, zid, "http_request_firewall_custom", WAF_RULES, "WAF custom")
        upsert_ruleset_phase(token, zid, "http_ratelimit", [RATE_RULE], "Rate limit")
    except RuntimeError as err:
        msg = str(err)
        print(f"Cloudflare error: {msg}", file=sys.stderr)
        if re.search(r"403|401|9109|10000", msg):
            print_manual()
            return 2
        return 1

    print("Cloudflare anti-DDoS rules applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
