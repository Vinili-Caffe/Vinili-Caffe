/**
 * Rinvia solo l'embed annuncio bonus top-3 (stesso testo del cron 21:00).
 * Non modifica il DB se ometti --sync-db (consigliato se il bonus è già stato accreditato).
 *
 * Richiede .env con MONGO_* / DISCORD_TOKEN e WEEKLY_CONTEST_* allineati al bot in produzione.
 *
 * IMPORTANTE: con lo stesso token del bot in PM2, un secondo login disconnette il processo live.
 *   Ferma il bot (pm2 stop …), esegui lo script, poi riavvia.
 *
 * Uso (dalla root del repo):
 *   node scripts/replay-contest-bonus-announce.js 2026-04-20
 *
 * Con ricalcolo slot su Mongo (solo se sai cosa stai facendo):
 *   node scripts/replay-contest-bonus-announce.js 2026-04-20 --sync-db
 */
const path = require("path");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { replayContestDailyBonusAnnounce } = require("../Vinyls/Services/Community/weeklyContestService");

async function main() {
  const day = String(process.argv[2] || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    console.error("Uso: node scripts/replay-contest-bonus-announce.js YYYY-MM-DD [--sync-db]");
    process.exit(1);
  }
  const syncDb = process.argv.includes("--sync-db");
  const mongoUrl =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  if (!mongoUrl) {
    console.error("Manca stringa Mongo in .env (MONGO_URL / MONGODB_URI / …).");
    process.exit(1);
  }
  const token = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL;
  if (!token) {
    console.error("Manca DISCORD_TOKEN (o DISCORD_TOKEN_OFFICIAL).");
    process.exit(1);
  }

  global.logger = { info: console.log, warn: console.warn, error: console.error };

  await mongoose.connect(mongoUrl);
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });
  await client.login(token);

  const res = await replayContestDailyBonusAnnounce(client, {
    activityDayKey: day,
    accreditDayKey: day,
    syncDb,
  });
  console.log(JSON.stringify(res, null, 2));

  await mongoose.disconnect();
  await client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});