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
  const res = await fetch("https://discord.com/api/v10/channels/1481660281032675510/messages?limit=5", {
    headers: { Authorization: `Bot ${token}` },
  });
  console.log("status", res.status);
  const list = await res.json();
  for (const m of list) {
    console.log({
      id: m.id,
      hasPoll: Boolean(m.poll),
      answers: m.poll?.answers?.length || 0,
      head: String(m.content || "").slice(0, 90).replace(/\n/g, " | "),
    });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
