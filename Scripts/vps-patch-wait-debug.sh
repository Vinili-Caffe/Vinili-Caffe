#!/usr/bin/env bash
set -eu
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

WF=/opt/bot/bots-ts/src/wait-for-lavalink.js
cp -a "$WF" "$WF.bak-alwayson-$(date +%Y%m%d%H%M%S)"

# Patch check() to log why it fails (once every cooldown via existing path)
python3 - <<'PY'
from pathlib import Path
p = Path("/opt/bot/bots-ts/src/wait-for-lavalink.js")
text = p.read_text()
old = '''async function check() {
  if (!(await checkTcp())) return false;
  return checkHttpReady();
}'''
new = '''async function check() {
  const tcpOk = await checkTcp();
  if (!tcpOk) {
    if (!global.__llDbgTcp) {
      global.__llDbgTcp = true;
      console.warn("[wait-for-lavalink] DEBUG tcp fail host="+host+" port="+port+" passLen="+String(process.env.LAVALINK_PASSWORD||"").length+" rawHost="+String(process.env.LAVALINK_HOST||""));
    }
    return false;
  }
  const httpOk = await checkHttpReady();
  if (!httpOk) {
    if (!global.__llDbgHttp) {
      global.__llDbgHttp = true;
      console.warn("[wait-for-lavalink] DEBUG http fail host="+host+" port="+port+" passLen="+String(process.env.LAVALINK_PASSWORD||"").length);
    }
    return false;
  }
  if (!global.__llDbgOk) {
    global.__llDbgOk = true;
    console.warn("[wait-for-lavalink] DEBUG lavalink OK host="+host+" port="+port);
  }
  return true;
}'''
if old not in text:
    # maybe already patched or different formatting
    print("OLD_BLOCK_NOT_FOUND")
    # show nearby
    idx = text.find("async function check()")
    print(repr(text[idx:idx+180]))
else:
    p.write_text(text.replace(old, new, 1))
    print("PATCHED_OK")
PY

# Also patch musicEngine silent failure
ME=/opt/bot/bots-ts/src/shared/music/services/musicEngine.js
cp -a "$ME" "$ME.bak-alwayson-$(date +%Y%m%d%H%M%S)"
python3 - <<'PY'
from pathlib import Path
p = Path("/opt/bot/bots-ts/src/shared/music/services/musicEngine.js")
text = p.read_text()
# find silent return after !ready.ok
needle = "if (!ready.ok) {\n    client._shoukakuInitPending = false;\n    /* wait-for-lavalink"
if needle not in text:
    # try without comment
    import re
    m = re.search(r"if \(!ready\.ok\) \{[^}]+\}", text)
    print("needle missing, nearby:", m.group(0)[:200] if m else "none")
else:
    text = text.replace(
        "if (!ready.ok) {\n    client._shoukakuInitPending = false;\n    /* wait-for-lavalink già monitora: niente warn duplicato al boot. */\n    return;\n  }",
        "if (!ready.ok) {\n    client._shoukakuInitPending = false;\n    global.logger?.warn?.(\"[MUSIC] Lavalink non pronto dopo wait\", { host: ready.host, port: ready.port, waitedMs: ready.waitedMs });\n    return;\n  }",
        1,
    )
    p.write_text(text)
    print("MUSIC_ENGINE_PATCHED")
PY

# Patch musicAlwaysOn ensure to always warn on early exits
AO=/opt/bot/bots-ts/src/shared/music/services/musicAlwaysOn.js
cp -a "$AO" "$AO.bak-alwayson-$(date +%Y%m%d%H%M%S)"
python3 - <<'PY'
from pathlib import Path
p = Path("/opt/bot/bots-ts/src/shared/music/services/musicAlwaysOn.js")
text = p.read_text()
# replace silent returns with warns for key gates - carefully
replacements = [
(
'''    if (!isLavalinkUsable(client)) {
      logMusic("alwaysOn wait lavalink", { guildId: gid });
      return false;
    }''',
'''    if (!isLavalinkUsable(client)) {
      logMusic("alwaysOn wait lavalink", { guildId: gid });
      global.logger?.warn?.("[MUSIC] alwaysOn wait lavalink", { guildId: gid, hasShoukaku: Boolean(client?.shoukaku) });
      return false;
    }'''
),
(
'''    if (!voiceChannel?.isVoiceBased?.()) {
      logMusic("alwaysOn bad channel", { guildId: gid, channelId: always.voiceChannelId });
      return false;
    }''',
'''    if (!voiceChannel?.isVoiceBased?.()) {
      logMusic("alwaysOn bad channel", { guildId: gid, channelId: always.voiceChannelId });
      global.logger?.warn?.("[MUSIC] alwaysOn bad channel", { guildId: gid, channelId: always.voiceChannelId });
      return false;
    }'''
),
(
'''        logMusic("alwaysOn join fail", {
          guildId: gid,
          err: musicJoinVoiceChannelErrorMessage(err) || err?.message || err,
        });''',
'''        const joinErr = musicJoinVoiceChannelErrorMessage(err) || err?.message || err;
        logMusic("alwaysOn join fail", { guildId: gid, err: joinErr });
        global.logger?.warn?.("[MUSIC] alwaysOn join fail", { guildId: gid, err: joinErr });'''
),
(
'''      logMusic("alwaysOn playing", { guildId: gid, channelId: voiceChannel.id, source: session.alwaysOnKey });''',
'''      logMusic("alwaysOn playing", { guildId: gid, channelId: voiceChannel.id, source: session.alwaysOnKey });
      global.logger?.warn?.("[MUSIC] alwaysOn playing", { guildId: gid, channelId: voiceChannel.id, source: session.alwaysOnKey });'''
),
]
n=0
for a,b in replacements:
    if a in text:
        text=text.replace(a,b,1); n+=1
    else:
        print("MISS", a[:60].replace("\n"," "))
p.write_text(text)
print("ALWAYS_ON_PATCHES", n)
PY

pm2 restart bots-vinyls --update-env
echo restarted
