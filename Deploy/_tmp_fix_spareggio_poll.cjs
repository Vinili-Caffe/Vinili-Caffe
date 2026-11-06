#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function env(k) {
  for (const file of ["/opt/bot/.env", "/opt/bot/bots-ts/.env"]) {
    if (!fs.existsSync(file)) continue;
    const line = fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(k + "="));
    if (!line) continue;
    let v = line.slice(k.length + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v) return v;
  }
  return process.env[k] || "";
}

const { Client, GatewayIntentBits } = require("/opt/bot/node_modules/discord.js");
const mongoose = require("/opt/bot/node_modules/mongoose");

const ANNOUNCEMENT_CHANNEL_ID = "1481660281032675510";
const EXISTING_MSG = "1568339188498170001";
const EVENTS_ROLE_ID = "1544830669023346688";
const STATE_KEY = "movieNightAnnouncement.v1";
const titles = [
  "Perfetti Sconosciuti",
  "Chiamami col tuo nome",
  "Unfriended",
  "Birds of prey",
  "Bullet train",
  "Edward mani di forbici",
  "Nuovo Olimpo",
  "Resident evil",
  "Red, White & Royal Blu",
  "practical magic 1998",
];

function mongoUri() {
  const raw =
    env("MONGO_URI") ||
    env("MONGODB_URI") ||
    env("MONGO_URL") ||
    env("DATABASE_URL");
  return raw.replace(/^["']|["']$/g, "");
}

(async () => {
  const token = env("DISCORD_TOKEN_OFFICIAL") || env("DISCORD_TOKEN");
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  await new Promise((r) => client.once("clientReady", r)).catch(() => null);
  if (!client.isReady()) await new Promise((r) => client.once("ready", r));

  const ch = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
  const original = await ch.messages.fetch(EXISTING_MSG);
  console.log("original hasPoll", Boolean(original.poll));

  // Intercept REST to confirm poll is in the body
  const origPost = client.rest.post.bind(client.rest);
  client.rest.post = async (url, options) => {
    const body = options?.body;
    if (String(url).includes("/messages")) {
      console.log("REST messages POST", {
        hasPoll: Boolean(body?.poll),
        answers: body?.poll?.answers?.length || 0,
        firstAnswer: body?.poll?.answers?.[0],
      });
    }
    return origPost(url, options);
  };

  const content = [
    `## <a:VC_Announce:1482534613568979007> **SERATA FILM**`,
    "",
    `> <:VC_Stats:1482527532682055780>  Sondaggio di spareggio (il messaggio precedente non includeva il poll). Votate quale film guardare!`,
    "",
    `<:VC_Vote:1482535223001485473> __Votate il sondaggio in basso__`,
    "",
    `<a:VC_Ping:1482535000000000000>`.replace(/<a:VC_Ping:\d+>/, "🔔") + `︲<@&${EVENTS_ROLE_ID}>`,
  ].join("\n");

  // Prefer exact emoji from original if present
  const pingLine = (original.content.split("\n").find((l) => l.includes(`<@&${EVENTS_ROLE_ID}>`)) || "").trim();

  const msg = await ch.send({
    content: [
      `## <a:VC_Announce:1482534613568979007> **SERATA FILM**`,
      "",
      `> <:VC_Stats:1482527532682055780>  Sondaggio di spareggio: il messaggio delle 20:00 non aveva il poll allegato. Votate qui sotto!`,
      "",
      `<:VC_Vote:1482535223001485473> __Votate il sondaggio in basso__`,
      "",
      pingLine || `🔔︲<@&${EVENTS_ROLE_ID}>`,
    ].join("\n"),
    reply: { messageReference: EXISTING_MSG, failIfNotExists: false },
    allowedMentions: { roles: [EVENTS_ROLE_ID] },
    poll: {
      question: { text: "Quale film guardiamo domani alle 21:00?" },
      answers: titles.map((t) => ({ text: String(t).slice(0, 55) })),
      duration: 4,
      allowMultiselect: false,
    },
  });

  console.log("repair sent", {
    id: msg.id,
    hasPoll: Boolean(msg.poll),
    answers: msg.poll?.answers?.size ?? msg.poll?.answers?.length,
  });

  if (!msg.poll) {
    console.error("STILL NO POLL — abort state update");
    client.destroy();
    process.exit(2);
  }

  // Update bot state so finale uses this poll
  const uri = mongoUri();
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const candidates = ["botstates", "botStates", "states"];
  let updated = false;
  for (const colName of candidates) {
    const col = db.collection(colName);
    const qVariants = [
      { _id: STATE_KEY },
      { key: STATE_KEY },
      { name: STATE_KEY },
      { "value.key": STATE_KEY },
    ];
    for (const q of qVariants) {
      const doc = await col.findOne(q).catch(() => null);
      if (!doc) continue;
      console.log("state doc in", colName, Object.keys(doc));
      const patch = {
        tieBreakerPollMessageId: String(msg.id),
        tiedMovieTitles: titles,
        repairedTiePollAt: new Date().toISOString(),
      };
      // support nested value/data shapes
      if (doc.value && typeof doc.value === "object") {
        await col.updateOne(q, { $set: Object.fromEntries(Object.entries(patch).map(([k, v]) => [`value.${k}`, v])) });
      } else if (doc.data && typeof doc.data === "object" && !doc.weekKey) {
        await col.updateOne(q, { $set: Object.fromEntries(Object.entries(patch).map(([k, v]) => [`data.${k}`, v])) });
      } else {
        await col.updateOne(q, { $set: patch });
      }
      updated = true;
      console.log("updated state", colName, q);
      break;
    }
    if (updated) break;
  }
  if (!updated) {
    // try SiteDocument-like
    const site = db.collection("sitedocuments");
    const doc = await site.findOne({ dedupeKey: STATE_KEY }).catch(() => null);
    if (doc) {
      await site.updateOne(
        { _id: doc._id },
        {
          $set: {
            "payload.tieBreakerPollMessageId": String(msg.id),
            "payload.tiedMovieTitles": titles,
            "payload.repairedTiePollAt": new Date().toISOString(),
          },
        }
      );
      updated = true;
      console.log("updated sitedocuments");
    }
  }
  // dump search
  if (!updated) {
    for (const colName of await db.listCollections().then((c) => c.map((x) => x.name))) {
      const col = db.collection(colName);
      const hit = await col
        .find({ $or: [{ tieBreakerPollMessageId: { $exists: true } }, { "value.tieBreakerPollMessageId": { $exists: true } }, { weekKey: { $exists: true }, threadId: { $exists: true } }] })
        .limit(3)
        .toArray()
        .catch(() => []);
      if (hit.length) {
        console.log("candidate collection", colName, JSON.stringify(hit[0]).slice(0, 400));
      }
    }
  }

  await mongoose.disconnect().catch(() => null);
  client.destroy();
  console.log("done updated=", updated);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
