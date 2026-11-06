#!/usr/bin/env node
const fs = require("fs");
function env(k) {
  const line = fs.readFileSync("/opt/bot/.env", "utf8").split(/\r?\n/).find((l) => l.startsWith(k + "="));
  if (!line) return "";
  let v = line.slice(k.length + 1);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}
(async () => {
  const token = env("DISCORD_TOKEN_OFFICIAL") || env("DISCORD_TOKEN");
  for (const id of ["1568339188498170001", "1568343106326102179"]) {
    const res = await fetch(`https://discord.com/api/v10/channels/1481660281032675510/messages/${id}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    const m = await res.json();
    console.log(
      JSON.stringify(
        {
          id: m.id,
          timestamp: m.timestamp,
          edited_timestamp: m.edited_timestamp,
          flags: m.flags,
          hasPoll: Boolean(m.poll),
          pollAnswerCount: m.poll?.answers?.length,
          components: m.components?.length || 0,
          embeds: m.embeds?.length || 0,
          type: m.type,
          contentLen: String(m.content || "").length,
        },
        null,
        2
      )
    );
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
