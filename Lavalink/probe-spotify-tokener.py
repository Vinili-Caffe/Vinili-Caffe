#!/usr/bin/env python3
import json
import subprocess
import time
import urllib.parse
import urllib.request

PASS = "youshallnotpass"
BASE = "http://127.0.0.1:2333"
PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1EIhP42YEbJXkn"


def auth_req(url: str) -> urllib.request.Request:
    req = urllib.request.Request(url)
    # Lavalink v4: Authorization = password in chiaro (non Basic)
    req.add_header("Authorization", PASS)
    return req


def wait_ready(timeout=90):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            with urllib.request.urlopen(auth_req(f"{BASE}/version"), timeout=3) as r:
                print("version", r.read().decode()[:200])
                return True
        except Exception as e:
            print("wait", type(e).__name__, e)
            time.sleep(2)
    print("FAIL not ready")
    return False


def load(identifier: str):
    q = urllib.parse.urlencode({"identifier": identifier})
    with urllib.request.urlopen(auth_req(f"{BASE}/v4/loadtracks?{q}"), timeout=120) as r:
        return json.loads(r.read().decode())


def main():
    ok_tok = False
    for i in range(8):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8003/api/token", timeout=60) as r:
                print("tokener", r.status, r.read()[:80])
                ok_tok = True
                break
        except Exception as e:
            print("tokener_try", i, type(e).__name__, e)
            time.sleep(3)
    if not ok_tok:
        print("tokener_fail")
        return 2
    if not wait_ready():
        return 2
    try:
        d = load(PLAYLIST)
    except Exception as e:
        print("load_fail", type(e).__name__, e)
        try:
            out = subprocess.check_output(
                ["tail", "-n", "80", "/root/.pm2/logs/lavalink-out-0.log"], text=True
            )
            print(out[-3500:])
        except Exception:
            pass
        return 2
    lt = d.get("loadType")
    data = d.get("data")
    print("loadType", lt)
    if isinstance(data, dict):
        info = data.get("info") or {}
        tracks = data.get("tracks") or []
        print("name", info.get("name"))
        print("tracks", len(tracks) if isinstance(tracks, list) else 0)
        if tracks:
            t0 = tracks[0].get("info") or {}
            print("first", t0.get("title"), "-", t0.get("author"))
        if lt == "error":
            print("error", json.dumps(data)[:800])
            return 2
    else:
        print("data", str(data)[:400])
        if lt == "error":
            return 2
    ok = lt in ("playlist", "track", "search") and (
        (isinstance(data, dict) and len(data.get("tracks") or []) > 0) or lt == "track"
    )
    print("PASS" if ok else "FAIL")
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
