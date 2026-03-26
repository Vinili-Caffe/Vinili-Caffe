/**
 * Invia in DM il reminder Discadia a tutti gli utenti nel DB con lastVoteAt
 * da più del cooldown (default 24h, come discadiaVoteReminder.cooldownHours in config).
 *
 * Uso (dalla root DiscordBot-1):
 *   node scripts/send-discadia-vote-reminders-dm.js
 *   node scripts/send-discadia-vote-reminders-dm.js --dry-run
 *   node scripts/send-discadia-vote-reminders-dm.js --force
 *
 * Richiede .env: DISCORD_TOKEN (o DISCORD_TOKEN_OFFICIAL) e MONGO_* come il bot.
 * --force: esegue anche se discadiaVoteReminder.enabled è false in config.
 * --dry-run: conta i documenti eleggibili (nessun login Discord, nessun DM).
 */
const path = require("path");
const { createRequire } = require("module");
const { Client, GatewayIntentBits } = require("discord.js");

const ROOT = path.resolve(__dirname, "..");
const VINYLS_ROOT = path.join(ROOT, "Vinyls");
const vinylsRequire = createRequire(path.join(VINYLS_ROOT, "package.json"));
const mongoose = vinylsRequire("mongoose");

const { loadEnvFiles } = require(path.join(ROOT, "shared", "runtime", "fsRuntime"));

loadEnvFiles(ROOT);

global.logger = {
  info: (...a) => console.log("[INFO]", ...a),
  warn: (...a) => console.warn("[WARN]", ...a),
  error: (...a) => console.error("[ERROR]", ...a),
};

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run") || args.has("-n");
const FORCE = args.has("--force") || args.has("-f");

const DISCADIA_VOTE_ROOT = "profile.totals.exp.bumpVoteRewards.discadia_vote";
const DISCADIA_LAST_VOTE_AT_PATH = `${DISCADIA_VOTE_ROOT}.lastVoteAt`;
const DISCADIA_LAST_REMINDED_AT_PATH = `${DISCADIA_VOTE_ROOT}.lastRemindedAt`;

function getVoteCooldownMsFromConfig(config) {
  const raw = config?.discadiaVoteReminder?.cooldownHours;
  const hours = Number(raw);
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 24;
  return safeHours * 60 * 60 * 1000;
}

async function dryRunCount() {
  const IDs = require(path.join(VINYLS_ROOT, "Utils", "Config", "ids.js"));
  const { ActivityUserProfile } = require(path.join(VINYLS_ROOT, "Schemas", "Community", "communitySchemas.js"));
  const config = require(path.join(VINYLS_ROOT, "config.json"));
  const guildId = IDs.guilds.main;
  const cooldownMs = getVoteCooldownMsFromConfig(config);
  const cutoff = new Date(Date.now() - cooldownMs);

  const docs = await ActivityUserProfile.find(
    { guildId, [DISCADIA_LAST_VOTE_AT_PATH]: { $lte: cutoff } },
    { userId: 1, [DISCADIA_LAST_VOTE_AT_PATH]: 1, [DISCADIA_LAST_REMINDED_AT_PATH]: 1 },
  ).lean();

  let eligible = 0;
  const sample = [];
  for (const doc of docs) {
    const userId = String(doc?.userId || "");
    const state = doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote || null;
    if (!userId || !state?.lastVoteAt) continue;
    const lastVoteAt = new Date(state.lastVoteAt).getTime();
    if (Date.now() - lastVoteAt < cooldownMs) continue;
    if (state.lastRemindedAt && new Date(state.lastRemindedAt).getTime() >= lastVoteAt) continue;
    eligible += 1;
    if (sample.length < 15) sample.push(userId);
  }

  console.log(`Cooldown: ${cooldownMs / 3600000}h (cutoff ${cutoff.toISOString()})`);
  console.log(`Documenti con lastVoteAt <= cutoff: ${docs.length}`);
  console.log(`Eleggibili (stessa logica sendDueReminders, senza filtro DM): ${eligible}`);
  if (sample.length) console.log("Esempio userId:", sample.join(", "));
}

async function runSend() {
  const token = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL;
  const mongoUrl =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;

  if (!token) {
    console.error("Manca DISCORD_TOKEN (o DISCORD_TOKEN_OFFICIAL) nel .env.");
    process.exit(1);
  }
  if (!mongoUrl) {
    console.error("Manca MONGO_URL / MONGODB_URI (o *_LOCAL) nel .env.");
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
    ],
  });

  client.config = require(path.join(VINYLS_ROOT, "config.json"));
  client.config.mongoURL = mongoUrl;

  if (FORCE) {
    client.config.discadiaVoteReminder = client.config.discadiaVoteReminder || {};
    client.config.discadiaVoteReminder.enabled = true;
  }

  if (!client.config.discadiaVoteReminder?.enabled) {
    console.error(
      "discadiaVoteReminder.enabled è false in config. Usa --force per inviare comunque.",
    );
    process.exit(1);
  }

  mongoose.set("strictQuery", false);
  mongoose.set("bufferCommands", false);
  await mongoose.connect(mongoUrl, { maxPoolSize: 8 });

  await client.login(token);

  const { sendDueReminders } = require(path.join(VINYLS_ROOT, "Services", "Bump", "bumpService.js"));
  console.log("Esecuzione sendDueReminders (DM + aggiornamento lastRemindedAt)…");
  await sendDueReminders(client);
  console.log("Completato.");

  await mongoose.connection.close().catch(() => {});
  await client.destroy().catch(() => {});
}

async function main() {
  if (DRY) {
    const mongoUrl =
      process.env.MONGO_URL_LOCAL ||
      process.env.MONGODB_URI_LOCAL ||
      process.env.MONGO_URL ||
      process.env.MONGODB_URI;
    if (!mongoUrl) {
      console.error("Manca MONGO_URL / MONGODB_URI nel .env (necessario per --dry-run).");
      process.exit(1);
    }
    mongoose.set("strictQuery", false);
    await mongoose.connect(mongoUrl, { maxPoolSize: 4 });
    try {
      await dryRunCount();
    } finally {
      await mongoose.connection.close().catch(() => {});
    }
    return;
  }

  await runSend();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});