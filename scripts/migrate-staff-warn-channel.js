#!/usr/bin/env node
const path = require("path");

async function main() {
  const root = path.resolve(__dirname, "..");
  const vinylsRoot = path.join(root, "Vinyls");
  process.chdir(root);
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const { loadEnvFiles } = require(path.join(root, "shared", "runtime", "fsRuntime"));
  loadEnvFiles(vinylsRoot);
  const { connectMongo } = require(path.join(root, "Vinyls", "Utils", "Database", "mongoConnect"));
  await connectMongo().catch(() => null);
  const { migrateStaffWarnChannelMessages } = require(path.join(root, "Vinyls", "Services", "Staff", "staffWarnChannelMigrationService"));
  const config = require(path.join(vinylsRoot, "config.json"));
  const { Client, GatewayIntentBits, Partials } = require("discord.js");
  const token =
    process.env.DISCORD_TOKEN ||
    process.env.DISCORD_TOKEN_OFFICIAL ||
    config.token;
  if (!token) {
    console.error(
      "Token mancante. Esegui da /opt/bot e verifica .env con DISCORD_TOKEN o DISCORD_TOKEN_OFFICIAL.",
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
  const result = await migrateStaffWarnChannelMessages(client, { dryRun, force });
  console.log(JSON.stringify(result, null, 2));
  await client.destroy().catch(() => null);
  process.exit(result?.skipped && result?.reason !== "already_completed" ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});