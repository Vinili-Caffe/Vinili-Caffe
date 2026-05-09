const path = require("path");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");

const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const BOT_ROOT = path.join(WORKSPACE_ROOT, "Vinyls");

const { loadEnvFiles } = require(path.join(WORKSPACE_ROOT, "shared", "runtime", "fsRuntime"));
const { getToken } = require(path.join(WORKSPACE_ROOT, "shared", "config", "env"));

loadEnvFiles(BOT_ROOT);

const IDs = require(path.join(BOT_ROOT, "Utils", "Config", "ids"));
const config = require(path.join(BOT_ROOT, "config.json"));
const {
  DEFAULT_DELAY_MS,
  resolveUnbanUrl,
  sendBannedUnbanLinkDms,
} = require(path.join(BOT_ROOT, "Services", "Moderation", "bannedUnbanDmService"));

function parseArgs(argv) {
  const rawArgs = argv.slice(2);
  const flags = new Set(rawArgs);
  const valueOf = (name) => {
    const hit = rawArgs.find((arg) => String(arg || "").startsWith(`${name}=`));
    return hit ? hit.slice(name.length + 1).trim() : "";
  };
  return {
    dryRun: !flags.has("--send"),
    force: flags.has("--force"),
    once: !flags.has("--no-once"),
    guildId: valueOf("--guild-id") || String(IDs.guilds?.main || ""),
    limit: Math.max(0, Number(valueOf("--limit") || 0) || 0),
    delayMs: Math.max(0, Number(valueOf("--delay-ms") || DEFAULT_DELAY_MS) || DEFAULT_DELAY_MS),
    token: valueOf("--token") || getToken(config, "DISCORD_TOKEN_OFFICIAL"),
    unbanUrl: resolveUnbanUrl(valueOf("--url")),
  };
}

function resolveMongoUrl() {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    config.mongoURL
  );
}

async function connectMongoIfNeeded(args) {
  if (!args.once || args.dryRun) return false;
  const mongoUrl = resolveMongoUrl();
  if (!mongoUrl) {
    throw new Error("Mongo URL mancante: serve per ricordare che lo script e stato già eseguito. Usa --no-once solo se vuoi ignorare la guardia.");
  }
  if (mongoose.connection.readyState === 1) return true;
  mongoose.set("strictQuery", false);
  mongoose.set("bufferCommands", false);
  await mongoose.connect(mongoUrl);
  return true;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.token) {
    throw new Error("Token mancante. Imposta DISCORD_TOKEN_OFFICIAL/DISCORD_TOKEN oppure usa --token=...");
  }
  if (!args.guildId) {
    throw new Error("Guild ID mancante. Usa --guild-id=...");
  }

  const mongoConnected = await connectMongoIfNeeded(args);
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(args.token);
  try {
    const result = await sendBannedUnbanLinkDms(client, args);
    console.log(
      `[dm-banned-unban] result=${JSON.stringify(result)} once=${args.once} force=${args.force}`,
    );
    if (args.dryRun) {
      console.log("[dm-banned-unban] Per inviare davvero: node scripts/dm-banned-unban-link.js --send");
    } else if (result?.skipped && ["already_completed", "already_started"].includes(result?.reason)) {
      console.log("[dm-banned-unban] già avviato/completato: usa --force per rilanciarlo volontariamente.");
    }
  } finally {
    client.destroy();
    if (mongoConnected) await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[dm-banned-unban] errore:", err?.stack || err?.message || err);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
};
