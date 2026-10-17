#!/usr/bin/env node
/**
 * Force-spawn Halloween emoji hunt on the TEST guild (testGuildForceLive).
 * Seeds a chat message if the channel has no candidates.
 */
const fs = require("fs");
const path = require("path");

function loadEnv(p) {
  try {
    for (const line of fs.readFileSync(p, "utf8").split(/\n/)) {
      const t = line.trim();
      if (!t || t[0] === "#" || !t.includes("=")) continue;
      const i = t.indexOf("=");
      let v = t.slice(i + 1).trim();
      if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = v;
    }
  } catch (_) {}
}

async function main() {
  const ROOT = path.resolve(__dirname, "..");
  loadEnv(path.join(ROOT, "..", ".env"));
  const { Client, GatewayIntentBits } = require(path.join(ROOT, "..", "node_modules", "discord.js"));
  const mongoose = require(path.join(ROOT, "..", "node_modules", "mongoose"));
  await mongoose.connect(process.env.MONGO_URL, { serverSelectionTimeoutMS: 12000 });

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
  const config = require("../config.json");
  client.config = config;
  await client.login(process.env.DISCORD_TOKEN_OFFICIAL);

  const IDs = require("../Utils/Config/ids");
  const {
    isHalloweenEventLive,
    resolveHalloweenEventConfig,
  } = require("../Utils/Web/halloweenEventConfig");
  const {
    getHalloweenEmojiHuntConfig,
    spawnHunt,
    resolveHuntChannelIdForGuild,
  } = require("../Services/Community/halloweenEmojiHuntService");

  const testId = String(IDs.guilds?.test || "").trim();
  const cfgEvent = resolveHalloweenEventConfig(client);
  const live = isHalloweenEventLive(client, Date.now(), testId);
  const huntCfg = getHalloweenEmojiHuntConfig(client);
  const channelId = resolveHuntChannelIdForGuild(testId, huntCfg.channelId);

  console.log(
    JSON.stringify(
      {
        testId,
        eventEnabled: cfgEvent.enabled,
        testGuildForceLive: cfgEvent.testGuildForceLive,
        liveOnTest: live,
        mainChat: huntCfg.channelId,
        testChat: channelId,
        remapped: channelId !== huntCfg.channelId,
      },
      null,
      2,
    ),
  );

  if (!live) {
    console.error("Halloween not live on test — set halloweenEvent.testGuildForceLive=true");
    process.exit(2);
  }
  if (!channelId) {
    console.error("No test chat channel (run mirror sync first)");
    process.exit(3);
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    console.error("Test chat not text-based", channelId);
    process.exit(4);
  }

  // Seed a human-looking message so hunt has a candidate (bot msgs are skipped)
  // Use a webhook-free bot message with content — pickRandomChatMessage skips bots.
  // So we need a non-bot message: post as bot won't work. Relax: temporarily add bot-authored seed
  // by patching min age and posting then... better: create message and react on it directly
  // via spawnHunt after injecting a fake path.

  // Post seed then temporarily allow bot messages by using spawnHunt after
  // depositing a message from the bot and lowering filters via direct react path.
  const seed = await channel.send({
    content: "🎃 Seed Halloween test — reagi all'emoji quando compare sulla caccia!",
  });
  // Directly react on seed (bypass pickRandom which skips bots)
  const emojiRaw = String(huntCfg.emoji || "");
  const custom = emojiRaw.match(/^<a?:([\w~]+):(\d+)>$/);
  const reactArg = custom ? { id: custom[2], name: custom[1] } : emojiRaw || "🎃";
  await seed.react(reactArg).catch((e) => console.warn("react", e.message));

  const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../Schemas/Community/communitySchemas");
  const DOC_DEDUPE = "halloween_emoji_hunt_state_v1";
  const endsAt = Date.now() + Number(huntCfg.activeDurationMs || 900000);
  await SiteDocument.findOneAndUpdate(
    { guildId: testId, docType: SITE_DOCUMENT_TYPE.HOGWARTS_REACT_PRESS, dedupeKey: DOC_DEDUPE },
    {
      $set: {
        "rawWebhook.lastSlotKey": `force-${Date.now()}`,
        "rawWebhook.scheduledSlotKey": `force-${Date.now()}`,
        "rawWebhook.scheduledAtMs": Date.now(),
        "rawWebhook.activeMessageId": seed.id,
        "rawWebhook.activeChannelId": channel.id,
        "rawWebhook.activeEndsAtMs": endsAt,
        "rawWebhook.winnerUserId": "",
        updatedAt: new Date(),
      },
      $setOnInsert: {
        guildId: testId,
        docType: SITE_DOCUMENT_TYPE.HOGWARTS_REACT_PRESS,
        userId: "__halloween_emoji_hunt__",
        dedupeKey: DOC_DEDUPE,
      },
    },
    { upsert: true },
  );

  console.log(
    JSON.stringify({
      ok: true,
      messageId: seed.id,
      channelId: channel.id,
      channelName: channel.name,
      endsAt: new Date(endsAt).toISOString(),
      hint: "Clicca la reaction Halloween sul messaggio seed nel canale test",
    }),
  );

  await client.destroy();
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
