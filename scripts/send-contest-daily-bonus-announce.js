/**
 * Ricalcola la Top 3 bonus (00–21 Europe/Rome, messaggi+voce, exp da storico), **allinea i bonus voto su MongoDB**
 * (`voters.*.bonusSlots.<slotDayKey>`: toglie a chi non è più in classifica, mette ai nuovi; clamp voti se serve)
 * e invia l’embed nel canale annuncio. Non modifica `dailyBonusGrantLog`.
 *
 * Opzione `--announce-only`: solo messaggio Discord, nessun aggiornamento bundle.
 *
 * Bot principale fermo consigliato (stesso token = stessa sessione).
 *
 * Uso (da root DiscordBot-1):
 *   node scripts/send-contest-daily-bonus-announce.js <activityDayKey> [accreditDayKey] [--announce-only]
 *
 * Esempio (stessa data attività e chiave slot bonus nel DB):
 *   node scripts/send-contest-daily-bonus-announce.js 2026-04-09
 */

const path = require("path");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");
const { loadEnvFiles } = require("../shared/runtime/fsRuntime");

const ROOT = path.join(__dirname, "..");
loadEnvFiles(ROOT);
loadEnvFiles(path.join(ROOT, "Vinyls"));

function mongoUrlFromEnv() {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    ""
  ).trim();
}

async function main() {
  const argv = process.argv.slice(2);
  const announceOnly = argv.includes("--announce-only");
  const pos = argv.filter((a) => !String(a).startsWith("--"));
  const activityDayKey = String(pos[0] || "").trim();
  const accreditDayKey = String(pos[1] || "").trim() || activityDayKey;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(activityDayKey)) {
    console.error(
      "Uso: node scripts/send-contest-daily-bonus-announce.js <activityDayKey> [accreditDayKey] [--announce-only]",
    );
    console.error("  activityDayKey   giorno attività 00–21 (Europe/Rome)");
    console.error("  accreditDayKey   testo «accreditato …» nell’embed (= chiave slot DB se non usi --slot-day)");
    console.error("  --announce-only  non modificare bonusSlots / voti su MongoDB");
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(accreditDayKey)) {
    console.error("accreditDayKey non valido (YYYY-MM-DD).");
    process.exit(1);
  }

  let slotDayKey = accreditDayKey;
  const slotArg = argv.find((a) => String(a).startsWith("--slot-day="));
  if (slotArg) {
    const v = String(slotArg.split("=").slice(1).join("=") || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      console.error("--slot-day= deve essere YYYY-MM-DD.");
      process.exit(1);
    }
    slotDayKey = v;
  }

  const url = mongoUrlFromEnv();
  if (!url) {
    console.error("Imposta MONGO_URL / MONGODB_URI (o *_LOCAL) in .env.");
    process.exit(1);
  }
  const token = (process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL || "").trim();
  if (!token) {
    console.error("Imposta DISCORD_TOKEN (o DISCORD_TOKEN_OFFICIAL) in .env.");
    process.exit(1);
  }

  global.logger = {
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
    info: (...args) => console.log(...args),
  };

  mongoose.set("strictQuery", false);
  await mongoose.connect(url);

  const { replayContestDailyBonusAnnounce } = require("../Vinyls/Services/Community/weeklyContestService");

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });
  await client.login(token);

  const out = await replayContestDailyBonusAnnounce(client, {
    activityDayKey,
    accreditDayKey,
    slotDayKey,
    syncDb: !announceOnly,
  });
  console.log(JSON.stringify(out, null, 2));

  await client.destroy();
  await mongoose.disconnect();
  process.exit(out.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});