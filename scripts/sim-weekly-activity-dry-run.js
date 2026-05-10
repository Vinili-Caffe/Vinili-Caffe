"use strict";
const path = require("path");
const { loadEnvFiles } = require("../shared/runtime/fsRuntime");
loadEnvFiles(path.join(__dirname, "..", "Vinyls"));

global.logger = {
  info: (...args) => console.log("[info]", ...args),
  warn: (...args) => console.warn("[warn]", ...args),
  error: (...args) => console.error("[error]", ...args),
};

const mongoose = require("mongoose");
const discord = require("discord.js");
const { publishWeeklyActivityWinners } = require("../Vinyls/Services/Community/weeklyActivityWinnersService");

async function main() {
  const uri =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  const token = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL;
  if (!uri || !token) {
    console.error("Manca MONGO_* o DISCORD_TOKEN nel .env (Vinyls/ o root progetto).");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const GatewayIntentBits = discord.GatewayIntentBits;
  const client = new discord.Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  await client.login(token);

  const snap = {};
  await publishWeeklyActivityWinners(client, {
    skipDiscordSends: true,
    skipWeeklyRoles: true,
    mode: "weekly",
    dryRunLogger: (payload) => {
      Object.assign(snap, payload);
    },
  });

  console.log("--- SIMULAZIONE WEEKLY (nessun messaggio inviato/modificato) ---\n");
  console.log(JSON.stringify(snap, null, 2));

  await mongoose.disconnect();
  client.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});