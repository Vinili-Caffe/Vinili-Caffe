#!/usr/bin/env bash
set -euo pipefail

echo "== process / systemd =="
ps aux | rg -i "node|pm2|bot|vinili|vinyl|coffee" | rg -v "rg -i" | head -40 || true
systemctl list-units --type=service --state=running 2>/dev/null | rg -i "bot|vinili|vinyl|coffee|node" || true
ls -la /etc/systemd/system/*bot* /etc/systemd/system/*vinili* /etc/systemd/system/*vinyl* 2>/dev/null || true

echo "== .env mongo-ish keys =="
python3 - <<'PY'
from pathlib import Path
p=Path('/opt/bot/.env')
text=p.read_text(encoding='utf-8', errors='ignore')
for line in text.splitlines():
    s=line.strip()
    if not s or s.startswith('#'): continue
    if '=' not in s: continue
    k,v=s.split('=',1)
    k=k.strip()
    if any(x in k.upper() for x in ['MONGO','DB','DATABASE','URI','GROQ','OPENAI','VOICE']):
        print(f"{k}={'***SET***' if v.strip() else 'EMPTY'}")
PY

echo "== find bot entry + logs =="
ls -la /opt/bot/ | head -60
find /opt/bot -maxdepth 3 -type d -name 'logs' 2>/dev/null
find /var/log -iname '*bot*' -o -iname '*vinili*' -o -iname '*vinyl*' 2>/dev/null | head
journalctl --no-pager -n 5 2>/dev/null | head || true

echo "== which node process cwd =="
for pid in $(pgrep -f 'node' | head -20); do
  echo "PID $pid"
  tr '\0' ' ' < /proc/$pid/cmdline 2>/dev/null; echo
  ls -l /proc/$pid/cwd 2>/dev/null || true
  ls -l /proc/$pid/fd 2>/dev/null | rg 'log|\.out|\.err' | head -10 || true
done

echo "== recent bot stdout via journal for service names =="
for u in bot vinili vinyls coffee vinyls-bot vinili-bot bots; do
  if systemctl cat "$u" >/dev/null 2>&1; then
    echo "UNIT $u"
    systemctl status "$u" --no-pager -n 20 || true
    journalctl -u "$u" --since "7 days ago" --no-pager 2>/dev/null | rg -i "transcri|whisper|voice|groq|clip|ffmpeg|audio" | tail -50 || true
  fi
done
