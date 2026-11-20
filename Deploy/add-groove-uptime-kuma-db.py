#!/usr/bin/env python3
"""Aggiunge Bot Groove in Uptime Kuma clonando Bot Caffè nel DB (+ link status page).

Usare quando mancano le credenziali admin API (`/root/.uptime-kuma-admin`).
Poi: `sudo docker restart uptime-kuma`.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

DB = Path("/var/lib/docker/volumes/uptime-kuma-data/_data/kuma.db")


def main() -> int:
    con = sqlite3.connect(str(DB))
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    existing = cur.execute("SELECT id FROM monitor WHERE name = ?", ("Bot Groove",)).fetchone()
    if existing:
        groove_id = int(existing["id"])
        print(f"Bot Groove già presente id={groove_id}")
        cur.execute(
            "UPDATE monitor SET url = ?, keyword = ?, active = 1, type = 'keyword' WHERE id = ?",
            ("http://127.0.0.1:3012/health", '"ok":true', groove_id),
        )
    else:
        coffee = cur.execute("SELECT * FROM monitor WHERE name = ?", ("Bot Caffè",)).fetchone()
        if not coffee:
            raise SystemExit("manca monitor Bot Caffè da clonare")
        cols = [k for k in coffee.keys() if k != "id"]
        values = []
        for c in cols:
            if c == "name":
                values.append("Bot Groove")
            elif c == "url":
                values.append("http://127.0.0.1:3012/health")
            elif c == "keyword":
                values.append('"ok":true')
            else:
                values.append(coffee[c])
        placeholders = ",".join("?" for _ in cols)
        cur.execute(
            f"INSERT INTO monitor ({','.join(cols)}) VALUES ({placeholders})",
            values,
        )
        groove_id = int(cur.lastrowid)
        print(f"Creato Bot Groove id={groove_id}")

    link = cur.execute(
        "SELECT id, weight FROM monitor_group WHERE monitor_id = ? AND group_id = 5",
        (groove_id,),
    ).fetchone()
    if link:
        print(f"Già in status page weight={link['weight']}")
    else:
        cur.execute(
            "UPDATE monitor_group SET weight = weight + 1 WHERE group_id = 5 AND weight >= 4"
        )
        cur.execute(
            "INSERT INTO monitor_group (monitor_id, group_id, weight, send_url) VALUES (?, 5, 4, 0)",
            (groove_id,),
        )
        print("Aggiunto alla status page pubblica (weight 4)")

    cur.execute(
        "UPDATE status_page SET description = ?, modified_date = datetime('now') WHERE slug = 'vinili'",
        (
            "Stato in tempo reale del sito, dei bot Discord (Vinili, Caffè, Groove), del database, della musica e dei voti Discadia.",
        ),
    )

    con.commit()
    print("--- public order ---")
    for row in cur.execute(
        """
        SELECT m.id, m.name, mg.weight
        FROM monitor_group mg
        JOIN monitor m ON m.id = mg.monitor_id
        WHERE mg.group_id = 5
        ORDER BY mg.weight
        """
    ):
        print(f"{row['weight']}. {row['name']} (id={row['id']})")
    con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
