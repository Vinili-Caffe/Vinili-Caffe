#!/usr/bin/env node
/**
 * Patch Channel send to log whether poll survives the outgoing embed patch,
 * then recreate the real spareggio poll on the announcement channel.
 */
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

const path = require("path");
// Load same boot patches as bot if possible
try {
  require("/opt/bot/bots-ts/src/shared/embeds/defaultFooter.js");
} catch (_) {}

const discord = require("/opt/bot/node_modules/discord.js");
const { Client, GatewayIntentBits } = discord;

const ANNOUNCEMENT_CHANNEL_ID = "1481660281032675510";
const EXISTING_MSG = "1568339188498170001";
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
  // Install the same outgoing patch the bot uses
  try {
    const mod = require("/opt/bot/bots-ts/src/shared/embeds/defaultFooter.js");
    mod.installOutgoingMessageEmbedPatch?.(discord);
    console.log("patch installed", Boolean(discord.__viniliOutgoingEmbedPatchInstalled));
  } catch (e) {
    console.log("patch install fail", e.message);
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(env("DISCORD_TOKEN_OFFICIAL") || env("DISCORD_TOKEN"));
  await new Promise((r) => client.once("clientReady", r)).catch(() => null);
  if (!client.isReady()) await new Promise((r) => client.once("ready", r));

  const ch = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);

  // Monkey-patch REST to see body
  const orig = client.rest.post.bind(client.rest);
  client.rest.post = async (url, options) => {
    const body = options?.body;
    console.log("REST POST", String(url), {
      hasPoll: Boolean(body?.poll),
      pollAnswers: body?.poll?.answers?.length,
      contentHead: String(body?.content || "").slice(0, 80),
    });
    return orig(url, options);
  };

  const threadIdMatch = (await ch.messages.fetch(EXISTING_MSG)).content.match(/<#(\d+)>/);
  const threadId = threadIdMatch?.[1] || "unknown";
  const E_announce = "<a:VC_Announce:1482534613568979007>";
  // Keep content short-ish; reply under the original with the actual poll
  const msg = await ch.send({
    content: [
      `## ${E_announce} **SERATA FILM — SONDAGGIO**`,
      "",
      `> Il sondaggio di spareggio non era partito: votate qui sotto quale film guardare.`,
      "",
      `<@&1481660281032675510>`.replace("1481660281032675510", "need-events-role"),
    ].join("\n"),
    reply: { messageReference: EXISTING_MSG, failIfNotExists: false },
    allowedMentions: { parse: [] },
    __skipNoticeEmbed: true,
    poll: {
      question: { text: "Quale film guardiamo domani alle 21:00?" },
      answers: titles.map((t) => ({ text: t.slice(0, 55) })),
      duration: 4,
      allowMultiselect: false,
    },
  });
  console.log("sent", { id: msg.id, hasPoll: Boolean(msg.poll), answers: msg.poll?.answers?.size });

  // Fix content with proper Events role from original message
  const original = await ch.messages.fetch(EXISTING_MSG);
  const eventsMention = (original.content.match(/<@&\d+>/) || [])[0] || "";
  if (eventsMention) {
    await msg.edit({
      content: [
        `## ${E_announce} **SERATA FILM — SONDAGGIO**`,
        "",
        `> Il sondaggio di spareggio non era partito col messaggio precedente: votate qui sotto!`,
        "",
        `<:VC_Ping:0>︲${eventsMention}`.replace("<:VC_Ping:0>︲", ""),
        eventsMention,
      ].join("\n"),
      allowedMentions: { roles: [eventsMention.replace(/[<@&>]/g, "")] },
      __skipNoticeEmbed: true,
    }).catch((e) => console.log("edit fail", e.message));
  }

  client.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
