#!/usr/bin/env python3
"""Probe Spotify Web API + Lavalink ISRC → YT mirror."""
import base64
import json
import re
import urllib.parse
import urllib.request

LL = "http://127.0.0.1:2333"
TRACKS = [
    "7qiZfU4dY1lWllzX7mPBI3",  # Shape of You
    "0VjIjW4GlUZUMMdkwHzrMh",  # Blinding Lights
    "11dFghVXANMlKmJXsNCbNl",  # Cut To The Feeling
]


def load_yml():
    text = open("/opt/bot/Lavalink/application.yml", encoding="utf-8").read()
    cid = re.search(r'clientId:\s*"([^"]+)"', text).group(1)
    sec = re.search(r'clientSecret:\s*"([^"]+)"', text).group(1)
    pw = re.search(r'password:\s*"([^"]+)"', text).group(1)
    return cid, sec, pw


def ll_get(path: str, password: str):
    req = urllib.request.Request(f"{LL}{path}", headers={"Authorization": password})
    with urllib.request.urlopen(req, timeout=35) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    cid, sec, pw = load_yml()
    auth = base64.b64encode(f"{cid}:{sec}".encode()).decode()
    req = urllib.request.Request(
        "https://accounts.spotify.com/api/token",
        data=b"grant_type=client_credentials",
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    tok = json.loads(urllib.request.urlopen(req, timeout=20).read())["access_token"]
    print("spotify token ok")

    ok_any = False
    for tid in TRACKS:
        try:
            r = urllib.request.Request(
                f"https://api.spotify.com/v1/tracks/{tid}?market=IT",
                headers={"Authorization": f"Bearer {tok}"},
            )
            d = json.loads(urllib.request.urlopen(r, timeout=20).read())
            isrc = (d.get("external_ids") or {}).get("isrc") or ""
            print("api", tid, d.get("name"), "|", d.get("artists", [{}])[0].get("name"), "| isrc", isrc)
        except Exception as e:
            print("api", tid, "ERR", e)
            continue

        url = f"https://open.spotify.com/track/{tid}"
        data = ll_get(f"/v4/loadtracks?identifier={urllib.parse.quote(url, safe='')}", pw)
        print("  ll loadType", data.get("loadType"))
        info = {}
        if data.get("loadType") == "track":
            info = (data.get("data") or {}).get("info") or {}
        print("  ll meta", info.get("title"), "|", info.get("author"), "| isrc", info.get("isrc"))
        isrc = info.get("isrc") or isrc
        if not isrc:
            continue
        for prefix in ("ytmsearch:", "ytsearch:"):
            yt = ll_get(
                f"/v4/loadtracks?identifier={urllib.parse.quote(prefix + isrc, safe='')}",
                pw,
            )
            arr = yt.get("data") if isinstance(yt.get("data"), list) else []
            top = (arr[0] or {}).get("info") if arr else {}
            title = (top.get("title") or "").lower()
            author = (top.get("author") or "").lower()
            want = (info.get("title") or d.get("name") or "").lower()
            hit = bool(title) and (
                want.split("(")[0].strip()[:8] in title
                or any(w in title for w in want.split()[:2] if len(w) > 3)
            )
            print(f"  {prefix}{isrc} -> {top.get('title')} | {top.get('author')} hit={hit}")
            if hit:
                ok_any = True
        break

    # confirm new remirror helpers exist on disk
    vinyls = open("/opt/bot/Vinyls/Services/Music/lavalinkMusicService.js", encoding="utf-8").read()
    print("deploy_isrc_first", "isIsrcRemirrorAttempt" in vinyls and "MIRROR_TITLE_MATCH_MIN" in vinyls)
    print("PASS" if ok_any and "isIsrcRemirrorAttempt" in vinyls else "FAIL")


if __name__ == "__main__":
    main()
