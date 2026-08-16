#!/usr/bin/env node
"use strict";
/**
 * Rimuove dallo addedUsers i membri staff (non sono clienti del ticket).
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
const IDs = require("../Utils/Config/ids");

(async () => {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });
  await client.login(process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN);
  const guildId = "1329080093599076474";
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId));
  await guild.members.fetch().catch(() => null);

  const staffRoleIds = [
    IDs.roles?.Founder,
    IDs.roles?.Manager,
    IDs.roles?.Admin,
    IDs.roles?.Director,
    IDs.roles?.HighStaff,
    IDs.roles?.SeniorModerator,
    IDs.roles?.Mod,
    IDs.roles?.Helper,
    IDs.roles?.PartnerManager,
    IDs.roles?.CommunityManager,
    IDs.roles?.Staff,
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  function isStaffId(uid) {
    const m = guild.members.cache.get(String(uid));
    if (!m) return false;
    return staffRoleIds.some((id) => m.roles.cache.has(id));
  }

  await mongoose.connect(process.env.MONGO_URL_LOCAL || process.env.MONGO_URL);
  const tickets = mongoose.connection.db.collection("sitewebtickets");
  const cursor = tickets.find({ guildId, "addedUsers.0": { $exists: true } });
  let touched = 0;
  let removed = 0;
  while (await cursor.hasNext()) {
    const t = await cursor.next();
    const added = Array.isArray(t.addedUsers) ? t.addedUsers : [];
    const next = added.filter((u) => !isStaffId(u?.id));
    const diff = added.length - next.length;
    if (!diff) continue;
    removed += diff;
    touched += 1;
    await tickets.updateOne({ _id: t._id }, { $set: { addedUsers: next } });
  }
  console.log(JSON.stringify({ touched, removed }, null, 2));
  await mongoose.disconnect();
  await client.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
