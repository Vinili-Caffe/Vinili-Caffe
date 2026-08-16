#!/usr/bin/env node
"use strict";
/**
 * Riallinea subject web ticket al formato canale Discord (emoji+categoria+username).
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
const { sanitizeTicketChannelTail, buildTicketChannelName } = require("../Utils/Ticket/ticketNamingRuntime");
const { getTicketPanelConfig } = require("../Utils/Ticket/ticketPanelConfig");

function panelFor(category) {
  const id = String(category || "supporto").toLowerCase();
  const key = id === "high" ? "highstaff" : id;
  return getTicketPanelConfig(key) || getTicketPanelConfig("supporto") || { emoji: "🎫", name: id };
}

function needsFix(subject) {
  const s = String(subject || "").trim();
  if (!s) return true;
  if (/^discord(\s|[.#-])/i.test(s)) return true;
  if (/importat[oa]\s+da\b/i.test(s)) return true;
  const tail = s.includes("᲼") ? s.slice(s.lastIndexOf("᲼") + 1) : s;
  const sanitized = sanitizeTicketChannelTail(tail, "");
  return /^discord(-\d+)?(-|$)/i.test(sanitized);
}

(async () => {
  await mongoose.connect(process.env.MONGO_URL_LOCAL || process.env.MONGO_URL);
  const col = mongoose.connection.db.collection("sitewebtickets");
  const guildId = "1329080093599076474";
  const rows = await col.find({ guildId }).project({ subject: 1, authorName: 1, category: 1, ticketNumber: 1 }).toArray();
  let fixed = 0;
  for (const t of rows) {
    if (!needsFix(t.subject)) continue;
    const author = String(t.authorName || "").trim() || `utente-${t.ticketNumber || "x"}`;
    const next = buildTicketChannelName(panelFor(t.category), author, author);
    if (next === t.subject) continue;
    await col.updateOne({ _id: t._id }, { $set: { subject: next } });
    fixed += 1;
  }
  console.log(JSON.stringify({ total: rows.length, fixed }, null, 2));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
