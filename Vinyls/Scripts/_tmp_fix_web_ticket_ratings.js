#!/usr/bin/env node
"use strict";
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
  const db = mongoose.connection.db;
  const col = db.collection("sitewebtickets");
  const bad = await col.countDocuments({
    $or: [
      { ratingTicketScore: { $lte: 0 } },
      { ratingTicketScore: { $gt: 5 } },
      { ratingStafferScore: { $lte: 0 } },
      { ratingStafferScore: { $gt: 5 } },
    ],
  });
  const res = await col.updateMany(
    {
      $or: [
        { ratingTicketScore: { $lte: 0 } },
        { ratingTicketScore: { $gt: 5 } },
        { ratingTicketScore: 0 },
      ],
    },
    { $set: { ratingTicketScore: null } },
  );
  const res2 = await col.updateMany(
    {
      $or: [{ ratingStafferScore: { $lte: 0 } }, { ratingStafferScore: { $gt: 5 } }],
    },
    { $set: { ratingStafferScore: null } },
  );
  console.log(JSON.stringify({ badBefore: bad, clearedTicketScore: res.modifiedCount, clearedStafferScore: res2.modifiedCount }, null, 2));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
