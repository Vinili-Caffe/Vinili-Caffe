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
function base(s) {
  return String(s || "")
    .split("#")[0]
    .trim()
    .toLowerCase()
    .replace(/[<>]/g, "")
    .replace(/^_+|_+$/g, "");
}
function fold(s) {
  return base(s)
    .replace(/4/g, "a")
    .replace(/3/g, "e")
    .replace(/1/g, "i")
    .replace(/0/g, "o")
    .replace(/5/g, "s")
    .replace(/7/g, "t");
}
function loose(a, b) {
  const na = base(a);
  const nb = base(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const fa = fold(na);
  const fb = fold(nb);
  if (fa && fb && fa === fb) return true;
  if (fa.length >= 4 && fb.length >= 4 && (fa.includes(fb) || fb.includes(fa))) return true;
  return false;
}
(async () => {
  await mongoose.connect(process.env.MONGO_URL_LOCAL || process.env.MONGO_URL);
  const g = "1329080093599076474";
  const tickets = mongoose.connection.db.collection("sitewebtickets");
  const msgs = mongoose.connection.db.collection("sitewebticketmessages");

  // Find staff messages whose name loosely matches ticket opener
  const recent = await tickets
    .find({ guildId: g })
    .project({ ticketNumber: 1, userId: 1, authorName: 1, addedUsers: 1 })
    .toArray();

  let mis = 0;
  const samples = [];
  for (const t of recent) {
    const opener = t.authorName;
    const addedNames = (t.addedUsers || []).map((u) => u.name);
    const addedIds = new Set((t.addedUsers || []).map((u) => String(u.id)));
    const staffMsgs = await msgs
      .find({ ticketId: t._id, authorKind: "staff" })
      .project({ authorId: 1, authorName: 1 })
      .toArray();
    for (const m of staffMsgs) {
      const byId = String(m.authorId) === String(t.userId) || addedIds.has(String(m.authorId));
      const byName = loose(opener, m.authorName) || addedNames.some((n) => loose(n, m.authorName));
      const bySlug =
        String(m.authorId || "").startsWith("discord:") &&
        (loose(opener, String(m.authorId).slice(8)) ||
          addedNames.some((n) => loose(n, String(m.authorId).slice(8))));
      if (byId || byName || bySlug) {
        mis += 1;
        if (samples.length < 12) {
          samples.push({
            ticket: t.ticketNumber,
            opener,
            msgName: m.authorName,
            msgId: m.authorId,
            byId,
            byName,
            bySlug,
          });
        }
      }
    }
  }
  // Also: user messages that somehow show staff - count staff msgs vs user msgs for openers
  const openerUserMsgs = await msgs.countDocuments({ guildId: g, authorKind: "user" });
  const openerStaffTotal = await msgs.countDocuments({ guildId: g, authorKind: "staff" });
  console.log(JSON.stringify({ mis, samples, openerUserMsgs, openerStaffTotal }, null, 2));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
