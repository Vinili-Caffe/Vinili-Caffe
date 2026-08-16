#!/usr/bin/env node
"use strict";
/**
 * Riempie claimedByName vuoti/invisibili dai membri Discord.
 */
const fs = require("fs");
for (const line of fs.readFileSync("/opt/bot/.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[m[1]]) process.env[m[1]] = v;
}
const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");

function isBadName(name) {
  return !String(name || "")
    .replace(/[\u200B-\u200D\uFEFF\u3164\u115F\u1160\u2800\u00A0\u180E\u2060\u318D\uFFA0\u10FC\u{1CBC}\u17B4\u17B5]/gu, "")
    .trim();
}

(async () => {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });
  await client.login(process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN);
  const guildId = "1329080093599076474";
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId));
  await guild.members.fetch().catch(() => null);

  await mongoose.connect(process.env.MONGO_URL_LOCAL || process.env.MONGO_URL);
  const tickets = mongoose.connection.db.collection("sitewebtickets");
  const rows = await tickets
    .find({ guildId, claimedBy: { $type: "string", $ne: "" } })
    .project({ claimedBy: 1, claimedByName: 1, ticketNumber: 1 })
    .toArray();

  let updated = 0;
  for (const t of rows) {
    if (!isBadName(t.claimedByName)) continue;
    const uid = String(t.claimedBy || "").trim();
    if (!/^\d{5,32}$/.test(uid)) continue;
    const member = guild.members.cache.get(uid) || (await guild.members.fetch(uid).catch(() => null));
    if (!member) continue;
    const name = String(member.displayName || member.user?.globalName || member.user?.username || "").trim();
    if (!name || isBadName(name)) continue;
    await tickets.updateOne({ _id: t._id }, { $set: { claimedByName: name.slice(0, 80) } });
    updated += 1;
  }
  console.log(JSON.stringify({ checked: rows.length, updated }, null, 2));
  await mongoose.disconnect();
  await client.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
