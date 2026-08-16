#!/usr/bin/env node
"use strict";
/**
 * Corregge messaggi importati con autore "https" (URL scambiati per username).
 *   node Vinyls/Scripts/fixWebTicketHttpsAuthors.js
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

function isFakeAuthor(name, id) {
  if (/^(https?|ftp)$/i.test(String(name || "").trim())) return true;
  if (/^discord:(https?|ftp)$/i.test(String(id || "").trim())) return true;
  return false;
}

function fixContent(authorName, content) {
  let s = String(content || "");
  const scheme = String(authorName || "").trim();
  if (/^\/\//.test(s) && /^(https?|ftp)$/i.test(scheme)) s = `${scheme}:${s}`;
  s = s.replace(
    /(^|[\s\n])\/\/((?:cdn\.discordapp\.com|media\.discordapp\.net|static\.klipy\.com|lf\d+-tiktok|[a-z0-9.-]+\.[a-z]{2,})[^\s]*)/gi,
    "$1https://$2",
  );
  return s;
}

function extractImageUrls(content) {
  const urls = [];
  const re = /https?:\/\/[^\s<>"']+/gi;
  let m;
  while ((m = re.exec(String(content || "")))) {
    const u = m[0].replace(/[),.;]+$/g, "");
    if (
      /\.(gif|png|jpe?g|webp)(\?|$)/i.test(u) ||
      /cdn\.discordapp\.com\/attachments|media\.discordapp\.net\/attachments/i.test(u)
    ) {
      if (!urls.includes(u)) urls.push(u);
    }
  }
  return urls.slice(0, 8);
}

const mongoose = require("mongoose");
(async () => {
  await mongoose.connect(process.env.MONGO_URL_LOCAL || process.env.MONGO_URL);
  const guildId = "1329080093599076474";
  const msgsCol = mongoose.connection.db.collection("sitewebticketmessages");
  const ticketsCol = mongoose.connection.db.collection("sitewebtickets");

  const broken = await msgsCol
    .find({
      guildId,
      $or: [
        { authorName: { $regex: /^(https?|ftp)$/i } },
        { authorId: { $regex: /^discord:(https?|ftp)$/i } },
      ],
    })
    .sort({ ticketId: 1, createdAt: 1 })
    .toArray();

  const byTicket = new Map();
  for (const m of broken) {
    const tid = String(m.ticketId);
    if (!byTicket.has(tid)) byTicket.set(tid, []);
    byTicket.get(tid).push(m);
  }

  let fixed = 0;
  for (const [, list] of byTicket) {
    const ticket = await ticketsCol.findOne({ _id: list[0].ticketId });
    const opener = {
      authorId: String(ticket?.userId || "unknown"),
      authorName: String(ticket?.authorName || "Utente").slice(0, 80),
      authorKind: "user",
      authorAvatarUrl: String(ticket?.authorAvatarUrl || ""),
    };

    const timeline = await msgsCol
      .find({ guildId, ticketId: list[0].ticketId })
      .sort({ createdAt: 1, _id: 1 })
      .project({ _id: 1, authorId: 1, authorName: 1, authorKind: 1, authorAvatarUrl: 1 })
      .toArray();

    let lastReal = opener;
    const donorFor = new Map();
    for (const row of timeline) {
      if (isFakeAuthor(row.authorName, row.authorId)) {
        donorFor.set(String(row._id), lastReal);
        continue;
      }
      if (row.authorKind === "system" || row.authorKind === "bot") {
        lastReal = opener;
      } else {
        lastReal = {
          authorId: row.authorId,
          authorName: row.authorName,
          authorKind: row.authorKind === "staff" ? "staff" : "user",
          authorAvatarUrl: row.authorAvatarUrl || "",
        };
      }
    }

    for (const m of list) {
      const donor = donorFor.get(String(m._id)) || opener;
      const content = fixContent(m.authorName, m.content);
      const images = extractImageUrls(content);
      const existing = Array.isArray(m.imageUrls) ? m.imageUrls.map(String) : [];
      const imageUrls = [...new Set([...existing, ...images])].slice(0, 12);
      await msgsCol.updateOne(
        { _id: m._id },
        {
          $set: {
            authorId: donor.authorId,
            authorName: String(donor.authorName || "Utente").slice(0, 80),
            authorKind: donor.authorKind === "staff" ? "staff" : "user",
            authorAvatarUrl: String(donor.authorAvatarUrl || ""),
            content,
            imageUrls,
          },
        },
      );
      fixed += 1;
    }
  }

  const proto = await msgsCol
    .find({ guildId, content: { $regex: /(^|[\s\n])\/\// } })
    .project({ _id: 1, content: 1, imageUrls: 1 })
    .toArray();
  let protoFixed = 0;
  for (const m of proto) {
    const content = fixContent("https", m.content);
    if (content === m.content) continue;
    const images = extractImageUrls(content);
    const existing = Array.isArray(m.imageUrls) ? m.imageUrls.map(String) : [];
    const imageUrls = [...new Set([...existing, ...images])].slice(0, 12);
    await msgsCol.updateOne({ _id: m._id }, { $set: { content, imageUrls } });
    protoFixed += 1;
  }

  console.log(JSON.stringify({ fixed, protoFixed, ticketsTouched: byTicket.size }, null, 2));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
