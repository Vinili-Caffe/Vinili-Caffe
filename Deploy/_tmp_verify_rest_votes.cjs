#!/usr/bin/env node
const fs = require("fs");
function env(k) {
  const line = fs.readFileSync("/opt/bot/.env", "utf8").split(/\r?\n/).find((l) => l.startsWith(k + "="));
  if (!line) return "";
  let v = line.slice(k.length + 1);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}
const { createSiteApiRestClient } = require("/opt/bot/bots-ts/src/Vinili/site/http/siteApiRestClient.js");
const VOTE_EMOJI_ID = "1482535223001485473";

async function countReactionVotes(reaction, botUserId) {
  if (!reaction) return 0;
  const voterIds = new Set();
  let fetchedAny = false;
  let after;
  while (true) {
    const users = await reaction.users?.fetch?.({ limit: 100, ...(after ? { after } : {}) }).catch(() => null);
    if (!users?.size) break;
    fetchedAny = true;
    for (const user of users.values()) {
      if (!user?.bot && String(user.id || "") !== String(botUserId || "")) voterIds.add(String(user.id));
    }
    after = users.last()?.id;
    if (users.size < 100) break;
  }
  if (fetchedAny) return voterIds.size;
  let n = Math.max(0, Number(reaction.count) || 0);
  if (reaction.me) n = Math.max(0, n - 1);
  return n;
}

(async () => {
  const token = env("DISCORD_TOKEN_OFFICIAL") || env("DISCORD_TOKEN");
  const client = await createSiteApiRestClient({}, token, { restTimeoutMs: 12000, meAttempts: 3 });
  const thread = await client.channels.fetch("1566814140423602237");
  const batch = await thread.messages.fetch({ limit: 100 });
  const rows = [];
  for (const m of batch.values()) {
    if (m.author?.bot) continue;
    const title = String(m.content || "").trim();
    if (!title || title.length > 80) continue;
    const rx =
      m.reactions?.cache?.find?.(
        (r) => String(r.emoji?.id || "") === VOTE_EMOJI_ID || String(r.emoji?.name || "") === "VC_Vote"
      ) || null;
    const votes = await countReactionVotes(rx, client.user.id);
    if (rx || title.length < 60) rows.push({ title, hasRx: Boolean(rx), count: rx?.count ?? null, votes });
  }
  rows.sort((a, b) => b.votes - a.votes);
  console.log(rows.slice(0, 8));
  const top = Math.max(0, ...rows.map((r) => r.votes));
  console.log({ top, tied: rows.filter((r) => r.votes === top).map((r) => r.title) });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
