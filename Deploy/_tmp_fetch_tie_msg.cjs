#!/usr/bin/env node
const fs = require("fs");
function env(k) {
  for (const file of ["/opt/bot/.env", "/opt/bot/bots-ts/.env"]) {
    if (!fs.existsSync(file)) continue;
    const line = fs.readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(k + "="));
    if (!line) continue;
    let v = line.slice(k.length + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return "";
}

const token = env("DISCORD_TOKEN_OFFICIAL") || env("DISCORD_TOKEN") || env("DISCORD_TOKEN_TEST");
const channelId = "1481660281032675510";

(async () => {
  const listRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=15`, {
    headers: { Authorization: `Bot ${token}` },
  });
  const list = await listRes.json();
  if (!Array.isArray(list)) {
    console.log("list fail", listRes.status, list);
    process.exit(1);
  }
  for (const m of list) {
    const content = String(m.content || "");
    const isTie = /pareggio|sondaggio/i.test(content);
    console.log(
      JSON.stringify({
        id: m.id,
        ts: m.timestamp,
        isTie,
        hasPoll: Boolean(m.poll),
        pollAnswers: m.poll?.answers?.length || 0,
        pollQuestion: m.poll?.question?.text || null,
        contentHead: content.slice(0, 120).replace(/\n/g, " | "),
      })
    );
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
