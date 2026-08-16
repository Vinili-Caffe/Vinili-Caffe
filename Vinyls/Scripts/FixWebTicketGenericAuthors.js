#!/usr/bin/env node
"use strict";
/**
 * Risolve authorName generici / corrotti e riallinea subject al formato canale Discord.
 *   node Vinyls/Scripts/FixWebTicketGenericAuthors.js
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isBadDisplayName(name) {
  const s = String(name || "").trim();
  if (!s) return true;
  if (/^Utente\s+\d+$/i.test(s)) return true;
  if (/^[᲼｜︲༄\s\-_.]+$/u.test(s)) return true;
  if (s.length < 2) return true;
  return false;
}

function subjectNeedsRebuild(subject) {
  const s = String(subject || "").trim();
  if (!s) return true;
  if (/utente-\d+/i.test(s)) return true;
  if (/᲼᲼|᲼$/u.test(s)) return true;
  if (/^discord(\s|[.#-])/i.test(s)) return true;
  if (/importat[oa]\s+da\b/i.test(s)) return true;
  if (!s.includes("᲼") && !s.includes("︲") && !s.startsWith("༄")) return true;
  return false;
}

function pickBestName(...candidates) {
  for (const c of candidates) {
    const s = String(c || "").trim();
    if (!isBadDisplayName(s)) return s.slice(0, 80);
  }
  return "";
}

function avatarUrlFromUser(u) {
  if (!u || !u.id) return "";
  if (!u.avatar) {
    let idx = 0;
    try {
      idx = Number((BigInt(String(u.id)) >> 22n) % 6n);
    } catch {
      idx = 0;
    }
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  }
  const ext = String(u.avatar).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${ext}?size=128`;
}

async function discordGet(path) {
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

const mongoose = require("mongoose");
const { buildTicketChannelName } = require("../Utils/Ticket/ticketNamingRuntime");
const { getTicketPanelConfig } = require("../Utils/Ticket/ticketPanelConfig");

function panelFor(category) {
  const id = String(category || "supporto").toLowerCase();
  const key = id === "high" ? "highstaff" : id;
  return getTicketPanelConfig(key) || getTicketPanelConfig("supporto") || { emoji: "🎫", name: id };
}

(async () => {
  if (!botToken()) throw new Error("missing DISCORD_TOKEN_OFFICIAL");
  await mongoose.connect(process.env.MONGO_URL_LOCAL || process.env.MONGO_URL);
  const guildId = "1329080093599076474";
  const ticketsCol = mongoose.connection.db.collection("sitewebtickets");
  const msgsCol = mongoose.connection.db.collection("sitewebticketmessages");

  const tickets = await ticketsCol
    .find({
      guildId,
      userId: { $regex: /^\d{17,20}$/ },
      $or: [
        { authorName: { $regex: /^Utente\s+\d+$/i } },
        { authorName: { $regex: /^[᲼｜︲༄\s\-_.]*$/u } },
        { subject: { $regex: /utente-\d+/i } },
        { subject: { $regex: /᲼᲼/u } },
        { subject: { $not: /᲼|︲|^༄/ } },
      ],
    })
    .project({ ticketNumber: 1, userId: 1, authorName: 1, authorAvatarUrl: 1, subject: 1, category: 1 })
    .toArray();

  const userIds = [...new Set(tickets.map((t) => String(t.userId)).filter((id) => /^\d{17,20}$/.test(id)))];
  console.log(JSON.stringify({ tickets: tickets.length, uniqueUsers: userIds.length }));

  const cache = new Map();
  for (let i = 0; i < userIds.length; i += 1) {
    const id = userIds[i];
    if (cache.has(id)) continue;
    const [memberRes, userRes] = await Promise.all([
      discordGet(`/guilds/${guildId}/members/${id}`),
      discordGet(`/users/${id}`),
    ]);
    await sleep(90);
    const user = (memberRes.ok && memberRes.json?.user) || (userRes.ok && userRes.json) || null;
    const nick = memberRes.ok ? memberRes.json?.nick : "";
    const name = pickBestName(nick, user?.global_name, user?.username);
    const avatarUrl = avatarUrlFromUser(user);
    cache.set(id, { name, avatarUrl, username: String(user?.username || "").trim() });
    if (i && i % 40 === 0) {
      console.log(JSON.stringify({ i, resolved: [...cache.values()].filter((x) => x.name).length }));
    }
  }

  let ticketFixed = 0;
  let msgFixed = 0;
  let unresolved = 0;

  for (const t of tickets) {
    const id = String(t.userId);
    let realName = String((cache.get(id) || {}).name || "").trim();

    if (!realName) {
      const hit = await msgsCol.findOne(
        {
          guildId,
          ticketId: t._id,
          authorId: id,
          authorKind: "user",
        },
        { projection: { authorName: 1, authorAvatarUrl: 1 }, sort: { createdAt: 1 } },
      );
      const fromMsg = pickBestName(hit?.authorName);
      if (fromMsg) realName = fromMsg;
    }

    if (!realName) {
      unresolved += 1;
      continue;
    }

    const resolved = cache.get(id) || {};
    const nextSubject =
      subjectNeedsRebuild(t.subject) || isBadDisplayName(t.authorName)
        ? buildTicketChannelName(panelFor(t.category), realName, realName)
        : String(t.subject);
    const nextAvatar = String(resolved.avatarUrl || t.authorAvatarUrl || "");
    const set = {
      authorName: realName.slice(0, 80),
      subject: nextSubject,
    };
    if (nextAvatar) set.authorAvatarUrl = nextAvatar;

    await ticketsCol.updateOne({ _id: t._id }, { $set: set });
    ticketFixed += 1;

    const r = await msgsCol.updateMany(
      {
        guildId,
        ticketId: t._id,
        authorId: id,
        $or: [{ authorName: { $regex: /^Utente\s+\d+$/i } }, { authorName: { $regex: /^[᲼｜︲༄\s\-_.]*$/u } }],
      },
      {
        $set: {
          authorName: realName.slice(0, 80),
          ...(nextAvatar ? { authorAvatarUrl: nextAvatar } : {}),
        },
      },
    );
    msgFixed += r.modifiedCount;
  }

  const sample1551 = await ticketsCol.findOne(
    { guildId, ticketNumber: 1551 },
    { projection: { authorName: 1, subject: 1, userId: 1 } },
  );
  const leftGeneric = await ticketsCol.countDocuments({
    guildId,
    $or: [{ authorName: { $regex: /^Utente\s+\d+$/i } }, { subject: { $regex: /utente-\d+/i } }],
  });

  console.log(JSON.stringify({ ticketFixed, msgFixed, unresolved, leftGeneric, sample1551 }, null, 2));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
