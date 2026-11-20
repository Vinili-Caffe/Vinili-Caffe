#!/usr/bin/env python3
"""Aggiunge Bot Groove ai monitor Uptime Kuma e alla status page pubblica vinili."""
from __future__ import annotations

from uptime_kuma_api import UptimeKumaApi, MonitorType


def load_creds(path="/root/.uptime-kuma-admin"):
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def by_name(mons):
    return {str(m.get("name") or ""): m for m in (mons or [])}


def main() -> int:
    creds = load_creds()
    api = UptimeKumaApi(creds["UPTIME_KUMA_URL"], timeout=120)
    api.login(creds["UPTIME_KUMA_USER"], creds["UPTIME_KUMA_PASS"])
    named = by_name(api.get_monitors())

    groove = named.get("Bot Groove")
    if groove:
        print(f"Aggiorno Bot Groove id={groove['id']}")
        api.edit_monitor(
            id_=int(groove["id"]),
            type=MonitorType.KEYWORD,
            name="Bot Groove",
            url="http://127.0.0.1:3012/health",
            keyword='"ok":true',
            interval=60,
            maxretries=2,
            retryInterval=30,
        )
        groove_id = int(groove["id"])
    else:
        print("Creo monitor Bot Groove")
        res = api.add_monitor(
            type=MonitorType.KEYWORD,
            name="Bot Groove",
            url="http://127.0.0.1:3012/health",
            keyword='"ok":true',
            interval=60,
            maxretries=2,
            retryInterval=30,
        )
        groove_id = int(res.get("monitorID") or res.get("id"))
        print(f"Creato id={groove_id}")

    # Ordine pubblico attuale + Groove dopo Caffè
    public_order = [
        "Sito Vinili & Caffè",
        "Bot Vinili",
        "Bot Vinyls",
        "Bot Caffè",
        "Bot Groove",
        "Database",
        "Musica",
        "Voti Discadia",
    ]
    named = by_name(api.get_monitors())
    public_ids = []
    seen = set()
    for n in public_order:
        m = named.get(n)
        if not m:
            continue
        mid = int(m["id"])
        if mid in seen:
            continue
        seen.add(mid)
        public_ids.append(mid)
        print(f"Pubblico: {n} id={mid}")

    if groove_id not in seen:
        public_ids.append(groove_id)
        print(f"Pubblico: Bot Groove id={groove_id}")

    slug = creds.get("STATUS_PAGE_SLUG", "vinili")
    # preserva titolo/descrizione se già presenti
    try:
        page = api.get_status_page(slug) or {}
    except Exception:
        page = {}
    title = page.get("title") or "Vinili & Caffè — Stato servizi"
    description = page.get("description") or (
        "Stato in tempo reale del sito e dei bot Discord. Se tutto è verde, i servizi funzionano."
    )
    api.save_status_page(
        slug,
        title=title,
        description=description,
        theme=page.get("theme") or "dark",
        published=True,
        showTags=False,
        domainNameList=page.get("domainNameList") or ["status.viniliecaffe.it"],
        customCSS=page.get("customCSS") or "",
        footerText=page.get("footerText") or "Vinili & Caffè",
        showPoweredBy=False,
        icon=page.get("icon") or "/icon.svg",
        publicGroupList=[
            {
                "name": "Servizi principali",
                "weight": 1,
                "monitorList": [{"id": mid} for mid in public_ids],
            }
        ],
    )
    print("Status page aggiornata con Bot Groove")
    api.disconnect()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
