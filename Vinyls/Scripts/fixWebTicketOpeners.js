#!/usr/bin/env node
"use strict";
/**
 * Riclassifica i messaggi dell'opener su TUTTI i ticket web importati.
 * Usa DISCORD_TOKEN_OFFICIAL per risolvere username/global_name/nick.
 *
 *   node Vinyls/Scripts/fixWebTicketOpeners.js
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

function normalizePersonName(s) {
  return String(s || "")
    .split("#")[0]
    .trim()
    .toLowerCase()
    .replace(/[<>]/g, "")
    .replace(/^_+|_+$/g, "");
}

function foldLeetName(s) {
  return normalizePersonName(s)
    .replace(/4/g, "a")
    .replace(/3/g, "e")
    .replace(/1/g, "i")
    .replace(/0/g, "o")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/\$/g, "s")
    .replace(/@/g, "a");
}

function namesLooselyEqual(a, b) {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const fa = foldLeetName(na);
  const fb = foldLeetName(nb);
  if (fa && fb && fa === fb) return true;
  if (fa.length >= 4 && fb.length >= 4 && (fa.includes(fb) || fb.includes(fa))) return true;
  return false;
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

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function discordGet(path) {
  const t = botToken();
  if (!t) return { ok: false, status: 0, json: null };
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

function collectAliasesFromUser(user, member) {
  const out = new Set();
  const add = (x) => {
    const n = normalizePersonName(x);
    if (n && n.length >= 2) out.add(n);
    const f = foldLeetName(x);
    if (f && f.length >= 2) out.add(f);
  };
  if (user) {
    add(user.username);
    add(user.global_name);
  }
  if (member) {
    add(member.nick);
    if (member.user) {
      add(member.user.username);
      add(member.user.global_name);
    }
  }
  return out;
}

const mongoose = require("mongoose");
(async () => {
  const token = botToken();
  if (!token) throw new Error("missing DISCORD_TOKEN_OFFICIAL");

  const me = await discordGet("/users/@me");
  console.log(JSON.stringify({ bot: me.ok ? me.json?.username : null, status: me.status }));

  await mongoose.connect(process.env.MONGO_URL_LOCAL || process.env.MONGO_URL);
  const guildId = "1329080093599076474";
  const ticketsCol = mongoose.connection.db.collection("sitewebtickets");
  const msgsCol = mongoose.connection.db.collection("sitewebticketmessages");

  const tickets = await ticketsCol
    .find({ guildId }, { projection: { _id: 1, userId: 1, authorName: 1, ticketNumber: 1 } })
    .toArray();

  const aliasCache = new Map();
  let modifiedMsgs = 0;
  let modifiedTickets = 0;
  let lookedUp = 0;
  let failLookup = 0;

  for (let i = 0; i < tickets.length; i += 1) {
    const t = tickets[i];
    const userId = String(t.userId || "").trim();
    if (!userId || !/^\d{5,32}$/.test(userId)) continue;

    let aliases = aliasCache.get(userId);
    if (!aliases) {
      lookedUp += 1;
      const [userRes, memberRes] = await Promise.all([
        discordGet(`/users/${userId}`),
        discordGet(`/guilds/${guildId}/members/${userId}`),
      ]);
      await sleep(150);
      if (!userRes.ok && !memberRes.ok) failLookup += 1;
      aliases = collectAliasesFromUser(userRes.json, memberRes.json);
      // anche authorName già sul ticket
      const an = normalizePersonName(t.authorName);
      if (an) aliases.add(an);
      const af = foldLeetName(t.authorName);
      if (af) aliases.add(af);
      aliasCache.set(userId, aliases);

      // Aggiorna authorName ticket se era generico / leet nick e abbiamo username
      const prefer =
        (memberRes.json && (memberRes.json.nick || memberRes.json.user?.global_name || memberRes.json.user?.username)) ||
        (userRes.json && (userRes.json.global_name || userRes.json.username)) ||
        "";
      const preferStr = String(prefer || "").trim();
      if (preferStr && preferStr !== String(t.authorName || "").trim()) {
        const cur = String(t.authorName || "");
        if (!cur || /^Utente\s+\d+$/i.test(cur) || /[<>]/.test(cur) || /[0-9]/.test(cur)) {
          await ticketsCol.updateOne({ _id: t._id }, { $set: { authorName: preferStr.slice(0, 80) } });
          modifiedTickets += 1;
          t.authorName = preferStr;
        }
      }
    }

    const candidates = await msgsCol
      .find({
        ticketId: t._id,
        authorKind: { $nin: ["bot", "system"] },
      })
      .project({ _id: 1, authorId: 1, authorName: 1, authorKind: 1 })
      .toArray();

    const ids = [];
    for (const m of candidates) {
      const authorId = String(m.authorId || "");
      if (authorId === userId) {
        ids.push(m._id);
        continue;
      }
      const authorName = String(m.authorName || "");
      const slug = authorId.startsWith("discord:") ? authorId.slice(8) : "";
      let hit = false;
      if (namesLooselyEqual(t.authorName, authorName) || (slug && namesLooselyEqual(t.authorName, slug))) {
        hit = true;
      } else {
        const nameFold = foldLeetName(authorName);
        const slugFold = foldLeetName(slug);
        for (const a of aliases) {
          if (!a) continue;
          if (namesLooselyEqual(a, authorName) || namesLooselyEqual(a, slug)) {
            hit = true;
            break;
          }
          if (nameFold && (nameFold === a || nameFold.includes(a) || a.includes(nameFold))) {
            if (Math.min(nameFold.length, a.length) >= 4) {
              hit = true;
              break;
            }
          }
          if (slugFold && (slugFold === a || slugFold.includes(a) || a.includes(slugFold))) {
            if (Math.min(slugFold.length, a.length) >= 4) {
              hit = true;
              break;
            }
          }
        }
      }
      if (hit) ids.push(m._id);
    }

    if (!ids.length) continue;
    const r = await msgsCol.updateMany(
      { _id: { $in: ids } },
      { $set: { authorKind: "user", authorId: userId } },
    );
    modifiedMsgs += r.modifiedCount;

    if (i && i % 100 === 0) {
      console.log(JSON.stringify({ i, lookedUp, failLookup, modifiedMsgs, modifiedTickets }));
    }
  }

  // Stats finali: quanti ticket hanno ancora messaggi "staff" il cui nome matcha opener
  const sample = await ticketsCol.findOne({ guildId, ticketNumber: 1351 });
  const sampleMsgs = sample
    ? await msgsCol
        .find({ ticketId: sample._id })
        .project({ authorKind: 1, authorId: 1, authorName: 1 })
        .toArray()
    : [];

  console.log(
    JSON.stringify(
      {
        tickets: tickets.length,
        lookedUp,
        failLookup,
        modifiedMsgs,
        modifiedTickets,
        sample1351: {
          authorName: sample?.authorName,
          aliases: sample ? [...(aliasCache.get(String(sample.userId)) || [])] : [],
          msgs: sampleMsgs.map((m) => ({ kind: m.authorKind, id: m.authorId, name: m.authorName })),
        },
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
