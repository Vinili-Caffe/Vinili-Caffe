#!/usr/bin/env python3
"""Configura monitor + status page su Uptime Kuma (locale)."""
from __future__ import annotations

import os
import sys
import time


def load_creds(path: str) -> dict[str, str]:
    out: dict[str, str] = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def collect_existing(api) -> dict[str, int]:
    existing: dict[str, int] = {}
    raw = None
    for attempt in range(5):
        try:
            raw = api.get_monitors()
            break
        except Exception as e:
            print(f"get_monitors retry {attempt + 1}/5: {e}")
            time.sleep(2)
    if raw is None:
        return existing
    if isinstance(raw, dict):
        for mid, mon in raw.items():
            if not isinstance(mon, dict):
                continue
            name = str(mon.get("name") or "")
            if name:
                existing[name] = int(mon.get("id") or mid)
    elif isinstance(raw, list):
        for mon in raw:
            name = str(mon.get("name") or "")
            if name and mon.get("id") is not None:
                existing[name] = int(mon["id"])
    return existing


def main() -> int:
    creds_path = os.environ.get("CREDS_FILE", "/root/.uptime-kuma-admin")
    if not os.path.isfile(creds_path):
        print(f"Manca {creds_path}", file=sys.stderr)
        return 1

    try:
        from uptime_kuma_api import UptimeKumaApi, MonitorType
    except ImportError:
        print("Installa: pip3 install --break-system-packages uptime-kuma-api", file=sys.stderr)
        return 1

    creds = load_creds(creds_path)
    url = creds.get("UPTIME_KUMA_URL", "http://127.0.0.1:3001")
    user = creds.get("UPTIME_KUMA_USER", "admin")
    password = creds.get("UPTIME_KUMA_PASS", "")
    slug = creds.get("STATUS_PAGE_SLUG", "vinili")
    if not password:
        print("Password assente nelle credenziali", file=sys.stderr)
        return 1

    api = UptimeKumaApi(url, timeout=120)
    try:
        api.setup(user, password)
        print("Setup admin completato")
        try:
            api.disconnect()
        except Exception:
            pass
        time.sleep(2)
        api = UptimeKumaApi(url, timeout=120)
        api.login(user, password)
        print("Login OK (post-setup)")
    except Exception as e:
        print(f"Setup saltato ({e})")
        try:
            api.disconnect()
        except Exception:
            pass
        time.sleep(1)
        api = UptimeKumaApi(url, timeout=120)
        api.login(user, password)
        print("Login OK")

    time.sleep(2)
    # Monitor sull'origin (127.0.0.1): Cloudflare blocca spesso i probe dal VPS (403).
    host_hdr = "Host:www.viniliecaffe.it"
    monitors = [
        {
            "type": MonitorType.HTTP,
            "name": "Sito web",
            "url": "https://127.0.0.1/",
            "headers": host_hdr,
            "ignoreTls": True,
            "interval": 60,
            "maxretries": 2,
            "retryInterval": 30,
            "accepted_statuscodes": ["200-299", "301", "302"],
        },
        {
            "type": MonitorType.KEYWORD,
            "name": "Bot Discord (Vinyls)",
            "url": "http://127.0.0.1:3000/webhooks/status",
            "keyword": "online",
            "interval": 60,
            "maxretries": 2,
            "retryInterval": 30,
        },
        {
            "type": MonitorType.KEYWORD,
            "name": "Stack health (bot+mongo+lavalink)",
            "url": "http://127.0.0.1:3000/webhooks/health",
            "keyword": '"ok":true',
            "interval": 60,
            "maxretries": 2,
            "retryInterval": 30,
        },
        {
            "type": MonitorType.KEYWORD,
            "name": "Site API",
            "url": "http://127.0.0.1:3020/webhooks/site-api/health",
            "keyword": '"ok":true',
            "interval": 60,
            "maxretries": 2,
            "retryInterval": 30,
        },
        {
            "type": MonitorType.KEYWORD,
            "name": "Discadia intake",
            "url": "http://127.0.0.1:3010/webhooks/discadia/health",
            "keyword": '"ok":true',
            "interval": 60,
            "maxretries": 2,
            "retryInterval": 30,
        },
        {
            "type": MonitorType.PORT,
            "name": "MongoDB",
            "hostname": "127.0.0.1",
            "port": 27017,
            "interval": 60,
            "maxretries": 2,
            "retryInterval": 30,
        },
        {
            "type": MonitorType.PORT,
            "name": "Lavalink",
            "hostname": "127.0.0.1",
            "port": 2333,
            "interval": 60,
            "maxretries": 2,
            "retryInterval": 30,
        },
    ]

    existing = collect_existing(api)
    monitor_ids: list[int] = []
    for spec in monitors:
        name = spec["name"]
        if name in existing:
            print(f"Monitor già presente: {name}")
            monitor_ids.append(int(existing[name]))
            continue
        print(f"Creo monitor: {name}")
        res = api.add_monitor(**spec)
        mid = None
        if isinstance(res, dict):
            mid = res.get("monitorID") or res.get("id")
        elif isinstance(res, int):
            mid = res
        if mid is not None:
            monitor_ids.append(int(mid))
            existing[name] = int(mid)
        time.sleep(0.25)

    pages = {}
    try:
        pages = api.get_status_pages() or {}
    except Exception:
        pages = {}

    page_exists = False
    if isinstance(pages, dict):
        for _, p in pages.items():
            if isinstance(p, dict) and str(p.get("slug") or "") == slug:
                page_exists = True
                break
    elif isinstance(pages, list):
        for p in pages:
            if str(p.get("slug") or "") == slug:
                page_exists = True
                break

    if not page_exists:
        print(f"Creo status page slug={slug}")
        try:
            api.add_status_page(slug, "Vinili & Caffè — Stato servizi")
        except Exception as e:
            print(f"WARN add_status_page: {e}")

    try:
        api.save_status_page(
            slug,
            title="Vinili & Caffè — Stato servizi",
            description="Stato in tempo reale di sito, bot Discord, API, database e Lavalink.",
            theme="dark",
            published=True,
            showTags=False,
            domainNameList=["status.viniliecaffe.it"],
            customCSS="",
            footerText="Vinili & Caffè",
            showPoweredBy=False,
            icon="/icon.svg",
            publicGroupList=[
                {
                    "name": "Servizi",
                    "weight": 1,
                    "monitorList": [{"id": mid} for mid in monitor_ids],
                }
            ],
        )
        print("Status page salvata")
    except Exception as e:
        print(f"WARN save_status_page: {e}")
        print("Apri la UI e assegna i monitor alla status page se serve.")

    try:
        api.disconnect()
    except Exception:
        pass

    print("Fatto.")
    print(f"Admin UI: https://status.viniliecaffe.it/ (o {url})")
    print(f"Status pubblica: https://status.viniliecaffe.it/status/{slug}")
    print(f"Credenziali: {creds_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
