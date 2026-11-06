#!/usr/bin/env node
const fs = require("fs");
function env(k) {
  const line = fs
    .readFileSync("/opt/bot/.env", "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(k + "="));
  if (!line) return "";
  let v = line.slice(k.length + 1);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}

const { Client, GatewayIntentBits } = require("/opt/bot/node_modules/discord.js");
const TEST_CHANNEL = process.env.TEST_CH || "1559143104139755540"; // known test channel from prior chats
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

(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(env("DISCORD_TOKEN_OFFICIAL") || env("DISCORD_TOKEN"));
  await new Promise((r) => client.once("clientReady", r)).catch(() => null);
  if (!client.isReady()) await new Promise((r) => client.once("ready", r));

  const ch = await client.channels.fetch(TEST_CHANNEL);
  console.log("channel", ch?.id, "type", ch?.type, "name", ch?.name);

  // A) send like production (emoji may be null in payload)
  try {
    const m = await ch.send({
      content: "## TEST POLL A (prod shape)",
      __skipNoticeEmbed: true,
      poll: {
        question: { text: "Quale film guardiamo domani alle 21:00?" },
        answers: titles.map((t) => ({ text: t.slice(0, 55) })),
        duration: 1,
        allowMultiselect: false,
      },
    });
    console.log("A ok", { id: m.id, hasPoll: Boolean(m.poll), answers: m.poll?.answers?.size });
    await m.delete().catch(() => null);
  } catch (e) {
    console.log("A FAIL", e?.rawError || e?.message || e);
  }

  // B) raw REST without null emoji
  try {
    const m = await ch.send({
      content: "## TEST POLL B (raw rest)",
      __skipNoticeEmbed: true,
    });
    // use rest directly
    await m.delete().catch(() => null);
  } catch (_) {}

  try {
    const body = {
      content: "## TEST POLL B raw",
      poll: {
        question: { text: "Quale film?" },
        answers: titles.slice(0, 5).map((t) => ({ poll_media: { text: t } })),
        duration: 1,
        allow_multiselect: false,
      },
    };
    const res = await fetch(`https://discord.com/api/v10/channels/${TEST_CHANNEL}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${env("DISCORD_TOKEN_OFFICIAL") || env("DISCORD_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    console.log("B status", res.status, {
      id: data.id,
      hasPoll: Boolean(data.poll),
      answers: data.poll?.answers?.length,
      err: data.code,
      msg: data.message,
      errors: data.errors,
    });
    if (data.id) {
      await fetch(`https://discord.com/api/v10/channels/${TEST_CHANNEL}/messages/${data.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bot ${env("DISCORD_TOKEN_OFFICIAL") || env("DISCORD_TOKEN")}` },
      });
    }
  } catch (e) {
    console.log("B FAIL", e);
  }

  // C) announcement channel type check + try short poll
  try {
    const ann = await client.channels.fetch("1481660281032675510");
    console.log("announce channel type", ann?.type, ann?.name);
    const res = await fetch(`https://discord.com/api/v10/channels/1481660281032675510/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${env("DISCORD_TOKEN_OFFICIAL") || env("DISCORD_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: "## TEST POLL C (announce, delete subito)",
        poll: {
          question: { text: "Test sondaggio (cancello subito)" },
          answers: [
            { poll_media: { text: "Opzione A" } },
            { poll_media: { text: "Opzione B" } },
          ],
          duration: 1,
          allow_multiselect: false,
        },
      }),
    });
    const data = await res.json();
    console.log("C status", res.status, {
      id: data.id,
      hasPoll: Boolean(data.poll),
      err: data.code,
      msg: data.message,
      errors: JSON.stringify(data.errors || {}).slice(0, 500),
    });
    if (data.id) {
      await fetch(`https://discord.com/api/v10/channels/1481660281032675510/messages/${data.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bot ${env("DISCORD_TOKEN_OFFICIAL") || env("DISCORD_TOKEN")}` },
      });
    }
  } catch (e) {
    console.log("C FAIL", e);
  }

  client.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
