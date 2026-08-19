#!/usr/bin/env python3
"""Patch Lavalink logging levels without touching OAuth / plugin secrets."""
from pathlib import Path
import re
import subprocess

CFG = Path("/opt/bot/Lavalink/application.yml")
if not CFG.is_file():
    raise SystemExit("missing " + str(CFG))

text = CFG.read_text(encoding="utf-8")
new_block = """logging:
  level:
    root: WARN
    lavalink: WARN
    # YouTube clients (TVHTML5 / WEBEMBEDDED) falliscono spesso e ritentano:
    # AllClientsFailedException + dump formati itag inquinano PM2 senza essere crash.
    dev.lavalink.youtube: ERROR
    dev.lavalink.youtube.http.YoutubeOauth2Handler: WARN
    com.sedmelluq.discord.lavaplayer: ERROR
    com.sedmelluq.discord.lavaplayer.track.playback: ERROR
  request:
    enabled: false
"""
nxt, n = re.subn(
    r"logging:\n(?:  .*\n)+",
    new_block,
    text,
    count=1,
)
if n != 1:
    raise SystemExit("logging block not patched n=%s" % n)
if nxt != text:
    CFG.write_text(nxt, encoding="utf-8")

print("patched", CFG)
print("youtube_error", "dev.lavalink.youtube: ERROR" in CFG.read_text(encoding="utf-8"))
print("oauth_untouched", "refreshToken:" in CFG.read_text(encoding="utf-8"))
r = subprocess.run(["pm2", "restart", "lavalink", "--update-env"], check=False)
print("pm2_restart", r.returncode)
