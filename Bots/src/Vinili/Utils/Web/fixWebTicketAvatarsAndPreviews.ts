#!/usr/bin/env node
"use strict";
/**
 * Backfill avatar + ripulisce messaggi/anteprime "Nessun contenuto messaggio".
 *   node Vinili/Scripts/fixWebTicketAvatarsAndPreviews.js
 */
const fs = require("fs") as typeof import("fs");
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

function botToken() {
  return (
    process.env.DISCORD_TOKEN_OFFICIAL ||
    process.env.DISCORD_TOKEN ||
    process.env.TOKEN ||
    process.env.BOT_TOKEN ||
    process.env.DISCORD_BOT_TOKEN ||
    ""
  );
}

function sleep(ms?) {
  return new Promise((r?) => setTimeout(r, ms));
}

function isUseless(content?) {
  const s = String(content || "").trim();
  if (!s) return true;
  if (/nessun contenuto/i.test(s)) return true;
  if (/^…altre \d+ messaggi/i.test(s)) return true;
  if (/^\[troncato\]$/i.test(s)) return true;
  return false;
}

function preview(text?, max = 180) {
  let s = String(text || "")
    .replace(/\[Embed\s+\d+\]/gi, " ")
    .replace(/\bTitolo:\s*/gi, "")
    .replace(/\bDescrizione:\s*/gi, "")
    .replace(/\*?Nessun contenuto[^*\n]*/gi, " ")
    .replace(/:\w+:/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || isUseless(s) || /^…altre \d+ messaggi/i.test(s)) return "";
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function defaultAvatarUrl(id?) {
  let idx = 0;
  try {
    idx = Number((BigInt(String(id)) >> 22n) % 6n);
  } catch {
    idx = Number(String(id).replace(/\D/g, "").slice(-1) || "0") % 6;
  }
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

function avatarUrlFromUser(u?) {
  if (!u || !u.id) return "";
  if (!u.avatar) return defaultAvatarUrl(u.id);
  const ext = String(u.avatar).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${ext}?size=128`;
}

async function discordGet(path?) {
  const t = botToken();
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bot ${t}` },
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

const mongoose = require("mongoose") as typeof import("mongoose");
(async () => {
  if (!botToken()) throw new Error("missing DISCORD_TOKEN_OFFICIAL");
  await mongoose.connect(process.env.MONGO_URL_LOCAL || process.env.MONGO_URL);
  const guildId = "1329080093599076474";
  const msgsCol = mongoose.connection.db.collection("sitewebticketmessages");
  const ticketsCol = mongoose.connection.db.collection("sitewebtickets");

  // 1) elimina messaggi inutili (anche tronchi parziali)
  const del = await msgsCol.deleteMany({
    guildId,
    content: { $regex: /nessun contenuto/i },
  });
  console.log(JSON.stringify({ deletedUseless: del.deletedCount }));

  // 2) avatar per authorId snowflake (fallback default CDN se API fallisce)
  const ids = await msgsCol.distinct("authorId", {
    guildId,
    authorId: { $regex: /^\d{17,20}$/ },
    $or: [{ authorAvatarUrl: "" }, { authorAvatarUrl: null }, { authorAvatarUrl: { $exists: false } }],
  });
  const ticketUserIds = await ticketsCol.distinct("userId", {
    guildId,
    $or: [{ authorAvatarUrl: "" }, { authorAvatarUrl: null }, { authorAvatarUrl: { $exists: false } }],
  });
  const allIds = [...new Set([...ids, ...ticketUserIds].map(String).filter((id?) => /^\d{17,20}$/.test(id)))];
  console.log(JSON.stringify({ avatarTargets: allIds.length }));

  let avatarUpdates = 0;
  const cache = new Map();
  for (let i = 0; i < allIds.length; i += 1) {
    const id = allIds[i];
    let url = cache.get(id);
    if (url == null) {
      const [memberRes, userRes] = await Promise.all([
        discordGet(`/guilds/${guildId}/members/${id}`),
        discordGet(`/users/${id}`),
      ]);
      await sleep(80);
      const user = (memberRes.ok && memberRes.json?.user) || (userRes.ok && userRes.json) || null;
      url = avatarUrlFromUser(user) || defaultAvatarUrl(id);
      cache.set(id, url);
    }
    const r1 = await msgsCol.updateMany(
      { guildId, authorId: id, $or: [{ authorAvatarUrl: "" }, { authorAvatarUrl: null }, { authorAvatarUrl: { $exists: false } }] },
      { $set: { authorAvatarUrl: url } },
    );
    const r2 = await ticketsCol.updateMany(
      { guildId, userId: id, $or: [{ authorAvatarUrl: "" }, { authorAvatarUrl: null }, { authorAvatarUrl: { $exists: false } }] },
      { $set: { authorAvatarUrl: url } },
    );
    avatarUpdates += r1.modifiedCount + r2.modifiedCount;
    if (i && i % 50 === 0) console.log(JSON.stringify({ i, avatarUpdates }));
  }

  // 2b) staff importati come discord:username → search membri guild
  const staffKeys = await msgsCol.distinct("authorId", {
    guildId,
    authorId: { $regex: /^discord:/i },
    $or: [{ authorAvatarUrl: "" }, { authorAvatarUrl: null }, { authorAvatarUrl: { $exists: false } }],
  });
  console.log(JSON.stringify({ staffAvatarTargets: staffKeys.length }));
  let staffAvatarUpdates = 0;
  const staffCache = new Map();
  for (let i = 0; i < staffKeys.length; i += 1) {
    const key = String(staffKeys[i] || "");
    const uname = key.replace(/^discord:/i, "").trim();
    if (!uname) continue;
    let url = staffCache.get(uname.toLowerCase());
    if (url == null) {
      const q = encodeURIComponent(uname.slice(0, 32));
      const res = await discordGet(`/guilds/${guildId}/members/search?query=${q}&limit=10`);
      await sleep(150);
      let user = null;
      if (res.ok && Array.isArray(res.json)) {
        const lower = uname.toLowerCase();
        const hit =
          res.json.find((m?) => String(m?.user?.username || "").toLowerCase() === lower) ||
          res.json.find((m?) => String(m?.nick || "").toLowerCase() === lower) ||
          res.json.find((m?) => String(m?.user?.global_name || "").toLowerCase() === lower) ||
          res.json[0];
        user = hit?.user || null;
      }
      url = avatarUrlFromUser(user) || "";
      staffCache.set(uname.toLowerCase(), url);
    }
    if (!url) continue;
    const r1 = await msgsCol.updateMany(
      { guildId, authorId: key, $or: [{ authorAvatarUrl: "" }, { authorAvatarUrl: null }, { authorAvatarUrl: { $exists: false } }] },
      { $set: { authorAvatarUrl: url } },
    );
    staffAvatarUpdates += r1.modifiedCount;
    if (i && i % 25 === 0) console.log(JSON.stringify({ staffI: i, staffAvatarUpdates }));
  }

  // 3) ricalcola lastMessagePreview su tutti i ticket
  const tickets = await ticketsCol.find({ guildId }, { projection: { _id: 1 } }).toArray();
  let previewFixed = 0;
  for (let i = 0; i < tickets.length; i += 1) {
    const t = tickets[i];
    const lastMsgs = await msgsCol
      .find({ ticketId: t._id })
      .sort({ createdAt: -1 })
      .limit(40)
      .project({ content: 1, authorKind: 1, createdAt: 1, imageUrls: 1 })
      .toArray();
    let lastPreview = "";
    let lastAt = null;
    let lastKind = "system";
    const count = await msgsCol.countDocuments({ ticketId: t._id });
    for (const m of lastMsgs) {
      if (!m || m.authorKind === "system") continue;
      if (isUseless(m.content) && !(m.imageUrls && m.imageUrls.length)) continue;
      const p = preview(m.content) || (m.imageUrls && m.imageUrls.length ? "📷 Immagine" : "");
      if (!p) continue;
      lastPreview = p;
      lastAt = m.createdAt;
      lastKind = m.authorKind || "system";
      break;
    }
    if (!lastPreview) lastPreview = "Ticket";
    await ticketsCol.updateOne(
      { _id: t._id },
      {
        $set: {
          lastMessagePreview: String(lastPreview).slice(0, 180),
          ...(lastAt ? { lastMessageAt: lastAt } : {}),
          lastAuthorKind: lastKind,
          messageCount: count,
        },
      },
    );
    previewFixed += 1;
    if (i && i % 200 === 0) console.log(JSON.stringify({ previewI: i, previewFixed }));
  }

  console.log(
    JSON.stringify(
      { deletedUseless: del.deletedCount, avatarUpdates, staffAvatarUpdates, previewFixed },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
})().catch((e?) => {
  console.error(e);
  process.exit(1);
});
