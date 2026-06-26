#!/usr/bin/env node
const path = require("path");

function resolveBotToken(config) {
  return (
    process.env.DISCORD_TOKEN ||
    process.env.DISCORD_TOKEN_OFFICIAL ||
    config?.token ||
    null
  );
}

async function main() {
  const userId = String(process.argv[2] || "").trim();
  if (!/^\d{16,20}$/.test(userId)) {
    console.error("Uso: node scripts/purge-staff-channel-messages.js <userId>");
    process.exit(1);
  }
  const root = path.resolve(__dirname, "..");
  const vinylsRoot = path.join(root, "Vinyls");
  process.chdir(root);
  const { loadEnvFiles } = require(path.join(root, "shared", "runtime", "fsRuntime"));
  loadEnvFiles(vinylsRoot);
  const { connectMongo } = require(path.join(root, "Vinyls", "Utils", "Database", "mongoConnect"));
  await connectMongo().catch(() => null);
  const config = require(path.join(vinylsRoot, "config.json"));
  const IDs = require(path.join(vinylsRoot, "Utils", "Config", "ids"));
  const { purgeStaffChannelMessagesForUser } = require(path.join(root, "Vinyls", "Utils", "Staff", "staffDocUtils"));
  const { Client, GatewayIntentBits, Partials } = require("discord.js");
  const token = resolveBotToken(config);
  if (!token) {
    console.error(
      "Token mancante. Esegui da /opt/bot e verifica .env con DISCORD_TOKEN o DISCORD_TOKEN_OFFICIAL (come il bot PM2).",
    );
    process.exit(1);
  }
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Channel],
  });
  await new Promise((resolve, reject) => {
    client.once("ready", resolve);
    client.login(token).catch(reject);
  });
  const guildId = String(IDs.guilds?.main || "");
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    console.error("Guild non trovata");
    process.exit(1);
  }
  const result = await purgeStaffChannelMessagesForUser(guild, userId);
  console.log(JSON.stringify({ ok: true, userId, ...result }, null, 2));
  await client.destroy().catch(() => null);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});