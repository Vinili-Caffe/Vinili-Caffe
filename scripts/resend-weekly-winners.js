/**
 * Riesegue il calcolo e (opzionale) l'invio dei vincitori settimanali + annuncio evento,
 * ancorato all'ultima domenica 21:00 Europe/Rome (o a --at), così dopo la fascia oraria
 * i dati coincidono con quelli che avrebbe usato il cron.
 *
 * IMPORTANTE: stesso token del bot in esecuzione = sessione Discord in conflitto.
 * Ferma il processo del bot oppure usa un token diverso.
 *
 * Uso (da root DiscordBot-1):
 *   node scripts/resend-weekly-winners.js
 *   node scripts/resend-weekly-winners.js --send
 *   node scripts/resend-weekly-winners.js --at 2026-03-23T20:05:00.000Z --send
 *   node scripts/resend-weekly-winners.js --send --apply-grants --assign-weekly-roles
 *   node scripts/resend-weekly-winners.js --force-event-payout-week 3 --send
 *
 * Default: nessun messaggio Discord, nessun premio DB, nessun ruolo weekly (solo calcolo interno).
 * Aggiungi --send per pubblicare weekly + news evento; --apply-grants per premi evento in DB;
 * --assign-weekly-roles per riassegnare ruoli top weekly.
 */
const path = require("path");
const mongoose = require("mongoose");
const discord = require("discord.js");
const { loadEnvFiles } = require("../shared/runtime/fsRuntime");

const APP_ROOT = path.resolve(__dirname, "..", "Vinyls");
loadEnvFiles(APP_ROOT);

global.logger = {
  info: (...args) => console.log("[resend-weekly-winners]", ...args),
  error: (...args) => console.error("[resend-weekly-winners]", ...args),
  warn: (...args) => console.warn("[resend-weekly-winners]", ...args),
};

const config = require("../Vinyls/config.json");
const { getLastSunday21BoundaryMsAtOrBefore } = require("../Vinyls/Services/Community/activityEventRewardsService");
const { publishWeeklyActivityWinners } = require("../Vinyls/Services/Community/weeklyActivityWinnersService");
const { invalidateSettingsCache } = require("../Vinyls/Services/Community/expService");
const IDs = require("../Vinyls/Utils/Config/ids");

const MONGO_CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 8000,
  connectTimeoutMS: 8000,
  socketTimeoutMS: 20000,
  maxPoolSize: 10,
  minPoolSize: 1,
  maxIdleTimeMS: 60_000,
};

function getOptLongForm(longName) {
  const prefix = `${longName}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length).trim() || null;
  const i = process.argv.indexOf(longName);
  if (i >= 0) return process.argv[i + 1] ?? null;
  return null;
}

function getMongoUrl() {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    config.mongoURL ||
    null
  );
}

function buildClient() {
  const GatewayIntentBits = discord.GatewayIntentBits || {};
  const Partials = discord.Partials || {};
  const intents = [...new Set(Object.values(GatewayIntentBits).filter((x) => typeof x === "number" && x > 0))];
  const partials = [...new Set(Object.values(Partials).filter((x) => typeof x === "number"))];
  if (intents.length === 0) intents.push(1);
  return new discord.Client({
    intents,
    partials,
    rest: { timeout: 30_000, offset: 50, retries: 3 },
  });
}

async function main() {
  const send = process.argv.includes("--send");
  const applyGrants = process.argv.includes("--apply-grants");
  const assignWeeklyRoles = process.argv.includes("--assign-weekly-roles");
  const skipEvent = process.argv.includes("--skip-event");

  const atRaw = getOptLongForm("--at");
  let anchorDate;
  if (atRaw) {
    anchorDate = new Date(atRaw);
    if (Number.isNaN(anchorDate.getTime())) {
      console.error("[resend-weekly-winners] --at non è una data valida.");
      process.exitCode = 1;
      return;
    }
  } else {
    const boundaryMs = getLastSunday21BoundaryMsAtOrBefore(new Date());
    anchorDate = new Date(boundaryMs + 5000);
  }

  const forceRaw = getOptLongForm("--force-event-payout-week");
  let forceEventPayoutWeek = null;
  if (forceRaw != null && String(forceRaw).trim() !== "") {
    forceEventPayoutWeek = Number(forceRaw);
    if (!Number.isFinite(forceEventPayoutWeek) || forceEventPayoutWeek < 1 || forceEventPayoutWeek > 4) {
      console.error("[resend-weekly-winners] --force-event-payout-week deve essere tra 1 e 4.");
      process.exitCode = 1;
      return;
    }
  }

  const mongoUrl = getMongoUrl();
  if (!mongoUrl) {
    console.error("[resend-weekly-winners] Mongo URL mancante (MONGO_URL / MONGO_URL_LOCAL / config).");
    process.exitCode = 1;
    return;
  }

  const token = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL || config.token;
  if (!token) {
    console.error("[resend-weekly-winners] Token Discord mancante (DISCORD_TOKEN / config).");
    process.exitCode = 1;
    return;
  }

  mongoose.set("strictQuery", false);
  await mongoose.connect(mongoUrl, MONGO_CONNECT_OPTIONS);

  const client = buildClient();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout in attesa di client.ready (60s)")), 60_000);
    client.once("ready", () => {
      clearTimeout(timer);
      resolve();
    });
    client.login(token).catch(reject);
  });

  const mainGuildId = String(IDs.guilds.main || "");
  invalidateSettingsCache(mainGuildId);

  console.log("[resend-weekly-winners] Anchor ISO:", anchorDate.toISOString());
  console.log("[resend-weekly-winners] Opzioni:", {
    send,
    applyGrants,
    assignWeeklyRoles,
    skipEvent,
    forceEventPayoutWeek,
  });

  try {
    await publishWeeklyActivityWinners(client, {
      anchorDate,
      skipDiscordSends: !send,
      skipEventDbGrants: !applyGrants,
      skipWeeklyRoles: !assignWeeklyRoles,
      skipEvent,
      forceEventPayoutWeek,
    });
    console.log("[resend-weekly-winners] publishWeeklyActivityWinners completato.");
  } finally {
    await mongoose.disconnect().catch(() => null);
    client.destroy();
  }
}

main().catch((err) => {
  console.error("[resend-weekly-winners] Errore:", err?.message || err);
  process.exitCode = 1;
});