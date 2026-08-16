#!/usr/bin/env node
"use strict";
/**
 * Rimette authorKind=user per messaggi opener/added classificati come staff.
 *   node Vinyls/Scripts/FixWebTicketCustomerStaffKind.js
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

function normalizePersonName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("#")[0]
    .trim()
    .toLowerCase()
    .replace(/[<>]/g, "")
    .replace(/^_+|_+$/g, "");
}

function foldLeetPersonName(value) {
  return normalizePersonName(value)
    .replace(/4/g, "a")
    .replace(/3/g, "e")
    .replace(/1/g, "i")
    .replace(/0/g, "o")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/\$/g, "s")
    .replace(/@/g, "a");
}

function personNamesLooselyEqual(a, b) {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const fa = foldLeetPersonName(na);
  const fb = foldLeetPersonName(nb);
  if (fa && fb && fa === fb) return true;
  if (fa.length >= 4 && fb.length >= 4 && (fa.includes(fb) || fb.includes(fa))) return true;
  return false;
}

const mongoose = require("mongoose");
(async () => {
  await mongoose.connect(process.env.MONGO_URL_LOCAL || process.env.MONGO_URL);
  const guildId = "1329080093599076474";
  const ticketsCol = mongoose.connection.db.collection("sitewebtickets");
  const msgsCol = mongoose.connection.db.collection("sitewebticketmessages");

  const tickets = await ticketsCol
    .find({ guildId })
    .project({ userId: 1, authorName: 1, addedUsers: 1 })
    .toArray();

  let fixed = 0;
  let ticketsTouched = 0;
  for (const t of tickets) {
    const openerId = String(t.userId || "").trim();
    const added = Array.isArray(t.addedUsers) ? t.addedUsers : [];
    const addedIds = added.map((u) => String(u?.id || "").trim()).filter(Boolean);
    const addedNames = added.map((u) => String(u?.name || "").trim()).filter(Boolean);

    const staffMsgs = await msgsCol
      .find({ guildId, ticketId: t._id, authorKind: "staff" })
      .project({ _id: 1, authorId: 1, authorName: 1 })
      .toArray();

    const ids = [];
    for (const m of staffMsgs) {
      const authorId = String(m.authorId || "").trim();
      const authorName = String(m.authorName || "").trim();
      let hit = Boolean(openerId && authorId && openerId === authorId);
      if (!hit && addedIds.includes(authorId)) hit = true;
      if (!hit && personNamesLooselyEqual(t.authorName, authorName)) hit = true;
      if (!hit && addedNames.some((n) => personNamesLooselyEqual(n, authorName))) hit = true;
      if (!hit && authorId.startsWith("discord:")) {
        const slug = authorId.slice(8);
        if (personNamesLooselyEqual(t.authorName, slug)) hit = true;
        if (!hit && addedNames.some((n) => personNamesLooselyEqual(n, slug))) hit = true;
      }
      if (hit) ids.push(m._id);
    }
    if (!ids.length) continue;
    const r = await msgsCol.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          authorKind: "user",
          authorRoleName: "",
          authorRoleKey: "",
          authorRoleId: null,
        },
      },
    );
    fixed += r.modifiedCount;
    ticketsTouched += 1;
  }

  console.log(JSON.stringify({ fixed, ticketsTouched }, null, 2));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
