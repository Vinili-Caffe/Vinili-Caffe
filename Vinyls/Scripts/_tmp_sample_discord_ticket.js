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
  const all = await db.collection("guildfeaturebuckets").findOne(
    { guildId: "1329080093599076474" },
    { projection: { tickets: 1, ticketCounter: 1 } },
  );
  const tickets = all?.tickets || [];
  const types = {};
  for (const x of tickets) {
    const k = String(x.ticketType || x.panelId || "unknown");
    types[k] = (types[k] || 0) + 1;
  }
  const sample = tickets.slice(0, 2).map((x) => ({
    keys: Object.keys(x),
    ticketNumber: x.ticketNumber,
    ticketType: x.ticketType,
    panelId: x.panelId,
    open: x.open,
    userId: x.userId,
    userTag: x.userTag,
    claimedBy: x.claimedBy,
    closeReason: x.closeReason,
    closedBy: x.closedBy,
    hasTranscript: Boolean(x.transcript || x.hasTranscript),
    transcriptLen: typeof x.transcript === "string" ? x.transcript.length : 0,
    descriptionText: x.descriptionText ? String(x.descriptionText).slice(0, 80) : null,
    createdAt: x.createdAt,
    closedAt: x.closedAt,
  }));
  console.log(JSON.stringify({ count: tickets.length, counter: all?.ticketCounter, types, sample }, null, 2));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
