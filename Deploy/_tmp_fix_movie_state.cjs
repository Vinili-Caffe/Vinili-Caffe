#!/usr/bin/env node
/**
 * 1) Cancella messaggi spareggio errati
 * 2) Ricalcola voti reali dal thread
 * 3) Aggiorna bot state (niente poll, winner Perfetti)
 * 4) Chiude/archivia il thread votazioni
 */
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
  return "";
}

const mongoose = require("/opt/bot/node_modules/mongoose");
const { Client, GatewayIntentBits, Partials } = require("/opt/bot/node_modules/discord.js");

const ANNOUNCEMENT_CHANNEL_ID = "1481660281032675510";
const THREAD_ID = "1566814140423602237";
const VOTE_EMOJI_ID = "1482535223001485473";
const STATE_KEY = "movieNightAnnouncement.v1";

function mongoUri() {
  return (env("MONGO_URI") || env("MONGODB_URI") || env("MONGO_URL") || "").replace(/^["']|["']$/g, "");
}

(async () => {
  const token = env("DISCORD_TOKEN_OFFICIAL") || env("DISCORD_TOKEN");
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.MessageContent],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });
  await client.login(token);
  await new Promise((r) => client.once("clientReady", r)).catch(() => null);
  if (!client.isReady()) await new Promise((r) => client.once("ready", r));

  const ann = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);
  const recent = await ann.messages.fetch({ limit: 30 });
  for (const m of recent.values()) {
    const c = String(m.content || "");
    if (/pareggio|Sondaggio di spareggio|SONDAGGIO SERATA|sondaggio per decidere/i.test(c)) {
      console.log("delete announce", m.id, Boolean(m.poll));
      await m.delete().catch((e) => console.log("del fail", e.message));
    }
  }

  const thread = await client.channels.fetch(THREAD_ID);
  if (thread.archived) await thread.setArchived(false).catch(() => null);

  const messages = [];
  let before;
  while (messages.length < 500) {
    const batch = await thread.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    messages.push(...batch.values());
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }

  const byTitle = new Map();
  for (const m of messages) {
    if (m.author?.bot || m.webhookId || m.system) continue;
    const title = String(m.content || "").trim();
    if (!title || title.length > 120 || title.includes("\n")) continue;
    const rx = m.reactions.cache.find(
      (r) => String(r.emoji?.id || "") === VOTE_EMOJI_ID || String(r.emoji?.name || "") === "VC_Vote"
    );
    if (!rx) continue;
    const users = await rx.users.fetch({ limit: 100 }).catch(() => null);
    let votes = 0;
    if (users?.size) {
      for (const u of users.values()) {
        if (!u.bot && u.id !== client.user.id) votes += 1;
      }
    } else {
      votes = Math.max(0, (rx.count || 0) - (rx.me ? 1 : 0));
    }
    const key = title.toLowerCase().replace(/\s+/g, " ");
    const prev = byTitle.get(key);
    if (prev) prev.votes += votes;
    else byTitle.set(key, { messageId: m.id, title, votes });
  }

  const voteResults = [...byTitle.values()].sort((a, b) => b.votes - a.votes || a.title.localeCompare(b.title));
  console.log("top results", voteResults.slice(0, 8));
  const winner = voteResults[0] || null;
  const topVotes = winner ? winner.votes : 0;
  const tied = voteResults.filter((r) => r.votes === topVotes);
  console.log("winner", winner, "tiedCount", tied.length);

  if (!thread.locked) await thread.setLocked(true, "Chiusura votazioni Serata Film (repair)").catch((e) => console.log("lock", e.message));
  if (!thread.archived) await thread.setArchived(true, "Chiusura votazioni Serata Film (repair)").catch((e) => console.log("arch", e.message));

  await mongoose.connect(mongoUri());
  const col = mongoose.connection.db.collection("botstates");
  const doc = await col.findOne({ key: STATE_KEY });
  console.log("state before", doc?.value && {
    weekKey: doc.value.weekKey,
    tieBreakerPollMessageId: doc.value.tieBreakerPollMessageId,
    closedAt: doc.value.closedAt,
  });
  await col.updateOne(
    { key: STATE_KEY },
    {
      $set: {
        "value.voteResults": voteResults,
        "value.tieBreakerPollMessageId": "",
        "value.tiedMovieTitles": [],
        "value.topTieVotes": topVotes,
        "value.closedAt": doc?.value?.closedAt || new Date().toISOString(),
        "value.repairedFalseTieAt": new Date().toISOString(),
        "value.repairedWinnerTitle": winner?.title || "",
      },
    }
  );
  console.log("state updated winner=", winner?.title);
  await mongoose.disconnect();
  client.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
