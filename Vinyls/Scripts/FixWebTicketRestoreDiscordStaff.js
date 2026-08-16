#!/usr/bin/env node
"use strict";
/**
 * Ripristina authorKind=staff per autori transcript `discord:*` presenti nello staff roster.
 */
const fs = require("fs");
for (const p of ["/opt/bot/.env"]) {
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

function norm(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("#")[0]
    .trim()
    .toLowerCase()
    .replace(/[<>._]+/g, "")
    .replace(/^_+|_+$/g, "");
}

const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");

(async () => {
  const token = process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN;
  if (!token) throw new Error("missing token");
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });
  await client.login(token);
  const { getCachedStaffRoster } = require("../Utils/Web/siteStaffRosterCache");
  const roster = await getCachedStaffRoster(client);
  if (!roster?.ok) throw new Error("roster unavailable");
  const staffNames = new Set();
  const people = [];
  if (roster.membersById?.values) people.push(...roster.membersById.values());
  else if (Array.isArray(roster.sections)) {
    for (const s of roster.sections) if (Array.isArray(s.members)) people.push(...s.members);
  }
  for (const p of people) {
    if (p?.username) staffNames.add(norm(p.username));
    if (p?.displayName) staffNames.add(norm(p.displayName));
  }

  await mongoose.connect(process.env.MONGO_URL_LOCAL || process.env.MONGO_URL);
  const msgs = mongoose.connection.db.collection("sitewebticketmessages");
  const cursor = msgs.find({
    guildId: "1329080093599076474",
    authorKind: "user",
    authorId: { $regex: /^discord:/ },
  });
  let modified = 0;
  const bulk = [];
  while (await cursor.hasNext()) {
    const m = await cursor.next();
    const slug = norm(String(m.authorId || "").slice(8));
    const name = norm(m.authorName);
    if (!staffNames.has(slug) && !staffNames.has(name)) continue;
    bulk.push({
      updateOne: {
        filter: { _id: m._id },
        update: { $set: { authorKind: "staff" } },
      },
    });
    if (bulk.length >= 500) {
      const r = await msgs.bulkWrite(bulk, { ordered: false });
      modified += r.modifiedCount || 0;
      bulk.length = 0;
    }
  }
  if (bulk.length) {
    const r = await msgs.bulkWrite(bulk, { ordered: false });
    modified += r.modifiedCount || 0;
  }
  console.log(JSON.stringify({ staffNameKeys: staffNames.size, modified }, null, 2));
  await mongoose.disconnect();
  await client.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
