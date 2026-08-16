#!/usr/bin/env node
"use strict";
/**
 * Reclassifica messaggi transcript `discord:*` segnati staff → user
 * (partner/aggiunti non-opener classificati male dall'import).
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
const mongoose = require("mongoose");
(async () => {
  await mongoose.connect(process.env.MONGO_URL_LOCAL || process.env.MONGO_URL);
  const msgs = mongoose.connection.db.collection("sitewebticketmessages");
  const r = await msgs.updateMany(
    {
      guildId: "1329080093599076474",
      authorKind: "staff",
      authorId: { $regex: /^discord:/ },
    },
    {
      $set: {
        authorKind: "user",
        authorRoleName: "",
        authorRoleKey: "",
        authorRoleId: null,
      },
    },
  );
  console.log(JSON.stringify({ matched: r.matchedCount, modified: r.modifiedCount }, null, 2));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
