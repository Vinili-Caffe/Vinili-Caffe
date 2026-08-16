#!/usr/bin/env node
"use strict";
const fs = require("fs");
for (const p of ["/opt/bot/.env", "/opt/bot/deploy/.env.mongo"]) {
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
  const live = await db.collection("guildfeaturebuckets").findOne(
    { guildId: "1329080093599076474" },
    { projection: { tickets: 1 } },
  );
  const tickets = Array.isArray(live?.tickets) ? live.tickets : [];
  const start = new Date("2026-08-15T00:00:00+02:00").getTime();
  const end = new Date("2026-08-16T00:00:00+02:00").getTime();
  const purgeApprox = new Date("2026-08-15T20:40:00+02:00").getTime();
  let inBackupWindow = 0;
  let afterBackupBeforePurge = 0;
  let today = 0;
  const afterMidnight = [];
  for (const t of tickets) {
    const ms = t.createdAt ? new Date(t.createdAt).getTime() : 0;
    if (!ms || ms < start || ms >= end) continue;
    today += 1;
    inBackupWindow += 1;
    afterMidnight.push({
      n: t.ticketNumber,
      open: t.open,
      channelId: t.channelId,
      createdAt: t.createdAt,
      closeReason: t.closeReason || null,
      userId: t.userId,
    });
  }
  // Tickets that existed at purge but not in midnight backup ≈ 1522-1517 = 5
  console.log(
    JSON.stringify(
      {
        totalRestoredNow: tickets.length,
        createdTodayInRestoredData: today,
        todaySamples: afterMidnight.slice(0, 15),
        lostEstimate: {
          atPurge: 1522,
          inMidnightBackup: 1517,
          missingVsPurge: 1522 - 1517,
          note: "I ~5 ticket creati dopo le 00:00 di oggi e presenti al purge non sono nel backup e non risultano ripristinabili da dump successivi (nessun backup dopo mezzanotte).",
        },
        openChannelsDeletedAtPurge: 2,
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
