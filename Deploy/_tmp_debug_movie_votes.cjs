#!/usr/bin/env node
const fs = require("fs");
function env(k) {
  const line = fs.readFileSync("/opt/bot/.env", "utf8").split(/\r?\n/).find((l) => l.startsWith(k + "="));
  if (!line) return "";
  let v = line.slice(k.length + 1);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}

const { Client, GatewayIntentBits, Partials } = require("/opt/bot/node_modules/discord.js");
const VOTE_EMOJI_ID = "1482535223001485473";

(async () => {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });
  await client.login(env("DISCORD_TOKEN_OFFICIAL") || env("DISCORD_TOKEN"));
  await new Promise((r) => client.once("clientReady", r)).catch(() => null);
  if (!client.isReady()) await new Promise((r) => client.once("ready", r));

  // Find SERATA FILM thread under announce channel
  const parent = await client.channels.fetch("1481660281032675510");
  const active = await parent.threads.fetchActive().catch(() => null);
  const archived = await parent.threads.fetchArchived({ fetchAll: true }).catch(() => null);
  const threads = [...(active?.threads?.values?.() || []), ...(archived?.threads?.values?.() || [])];
  const thread = threads.find((t) => String(t.name || "").toUpperCase().includes("SERATA FILM"));
  console.log(
    "thread",
    thread && {
      id: thread.id,
      name: thread.name,
      archived: thread.archived,
      locked: thread.locked,
    }
  );
  if (!thread) {
    client.destroy();
    process.exit(1);
  }

  // unarchive temporarily if needed to fetch
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

  const rows = [];
  for (const m of messages) {
    if (m.author?.bot || m.webhookId || m.system) continue;
    const content = String(m.content || "").trim();
    if (!content || content.length > 120) continue;
    const reactions = [...(m.reactions?.cache?.values?.() || [])].map((r) => ({
      id: String(r.emoji?.id || ""),
      name: String(r.emoji?.name || ""),
      count: r.count,
      me: r.me,
    }));
    const voteRx = m.reactions?.cache?.find(
      (r) => String(r.emoji?.id || "") === VOTE_EMOJI_ID || String(r.emoji?.name || "") === "VC_Vote"
    );
    let fetched = null;
    let fetchErr = null;
    if (voteRx) {
      try {
        const users = await voteRx.users.fetch({ limit: 100 });
        fetched = [...users.values()].map((u) => ({ id: u.id, bot: u.bot, tag: u.username }));
      } catch (e) {
        fetchErr = e?.message || String(e);
      }
    }
    rows.push({
      id: m.id,
      content: content.slice(0, 80),
      reactions,
      hasVoteRx: Boolean(voteRx),
      voteCountField: voteRx?.count ?? null,
      fetchedNonBot: fetched ? fetched.filter((u) => !u.bot).length : null,
      fetchErr,
    });
  }

  rows.sort((a, b) => (b.voteCountField || 0) - (a.voteCountField || 0));
  console.log(JSON.stringify(rows.slice(0, 25), null, 2));

  // announce channel: delete bad spareggio msgs if still present
  const ann = await client.channels.fetch("1481660281032675510");
  const recent = await ann.messages.fetch({ limit: 20 });
  for (const m of recent.values()) {
    const c = String(m.content || "");
    if (/pareggio|Sondaggio di spareggio|SONDAGGIO SERATA/i.test(c)) {
      console.log("found announce", m.id, Boolean(m.poll), c.slice(0, 60).replace(/\n/g, " "));
    }
  }

  client.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
