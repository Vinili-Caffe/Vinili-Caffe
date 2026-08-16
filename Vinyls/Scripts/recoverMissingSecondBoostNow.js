/* eslint-disable no-console */
/**
 * Invia subito gli embed doppio-boost mancanti (native "2 volte" ma solo embed single).
 * Usage: node Vinyls/Scripts/recoverMissingSecondBoostNow.js
 */
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const candidates = ["/opt/bot/.env", path.join(__dirname, "..", "..", ".env")];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
    break;
  }
}

async function main() {
  loadEnv();
  const token =
    process.env.DISCORD_TOKEN ||
    process.env.DISCORD_TOKEN_OFFICIAL ||
    process.env.TOKEN ||
    process.env.VINYLS_TOKEN;
  const mongoUrl =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGO_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  if (!token) throw new Error("missing bot token");
  if (!mongoUrl) throw new Error("missing mongo");

  const mongoose = require("mongoose");
  await mongoose.connect(mongoUrl);

  const { Client, GatewayIntentBits, Partials } = require("discord.js");
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel],
  });

  await client.login(token);
  await new Promise((resolve) => client.once("ready", resolve));

  const {
    recoverMissingSecondBoostEmbedsOnStartup,
    recoverMissingBoostEmbedsForUser,
  } = require("../Events/guildMemberUpdate");
  const IDs = require("../Utils/Config/ids");

  const lookbackMs = 6 * 60 * 60 * 1000;
  console.log("Running recoverMissingSecondBoostEmbedsOnStartup lookback=", lookbackMs);
  const batch = await recoverMissingSecondBoostEmbedsOnStartup(client, {
    lookbackMs,
    maxRecover: 20,
    fetchLimit: 100,
  });
  console.log("batch:", batch);

  // Extra pass: scan native "2 volte" recenti e forza recover.
  const guildId = String(IDs.guilds.main || "");
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId));
  const channelId = String(IDs.channels.supporters || "");
  const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId));
  const recent = await channel.messages.fetch({ limit: 40 });
  const targets = new Map();
  for (const msg of recent.values()) {
    const text = String(msg.content || "");
    if (!/ha\s+appena\s+potenziato\s+il\s+server/i.test(text)) continue;
    const slots =
      /\b2\s+volte\b/i.test(text) || /\bdue\s+volte\b/i.test(text) || /\btwice\b/i.test(text)
        ? 2
        : /\b(\d+)\s+volte\b/i.test(text)
          ? Math.min(2, Number(RegExp.$1) || 1)
          : 1;
    if (slots < 2) continue;
    const uid =
      msg.mentions?.users?.first()?.id ||
      (text.match(/<@!?(\d{5,30})>/) || [])[1] ||
      null;
    if (!uid) continue;
    if (Date.now() - Number(msg.createdTimestamp || 0) > lookbackMs) continue;
    targets.set(String(uid), Math.max(targets.get(String(uid)) || 0, Number(msg.createdTimestamp || Date.now())));
  }

  console.log("native double targets:", [...targets.keys()]);
  for (const [uid, ts] of targets.entries()) {
    const result = await recoverMissingBoostEmbedsForUser(guild, uid, {
      knownNativeSlots: 2,
      expectedSlots: 2,
      startedAt: ts - 1000,
      nativeLookbackMs: lookbackMs,
      allowSecondRecovery: true,
      maxSend: 1,
    });
    console.log("force recover", uid, result);
  }

  await client.destroy();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
