// Chiude a mano la serata film (messaggio di fine, permessi del palco, thread recensioni, presenze staff),
// come farebbe il bot quando il palco viene terminato. Da lanciare SULLA VPS:
//   cd /opt/bot/bots-ts/src/Vinili && node /tmp/chiudi-serata.cjs            → chiude se non è già stata chiusa
//   … node /tmp/chiudi-serata.cjs --forza                                     → chiude anche se trova già un messaggio
const BASE = "/opt/bot/bots-ts/src/Vinili";
/* mongoose come lo trova il bot (risale le cartelle fino a /opt/bot/node_modules) */
const mongoose = require("node:module").createRequire(`${BASE}/Services/Web/communityPollWorkerApp.js`)("mongoose");
const boot = require(`${BASE}/Services/Web/workerAppBootstrap`);
const { createSiteApiRestClient } = require(`${BASE}/Services/Web/siteApiRestClient`);
const { getClientGuildCached } = require(`${BASE}/Utils/Interaction/interactionEntityCache`);
const IDs = require(`${BASE}/Utils/Config/ids`);
/* MAI valutazioni da qui: questo processo non ha le presenze del palco (stanno nella memoria del bot),
   le darebbe a tutto lo staff. Va spento PRIMA di caricare la serata film, che lo prende all'avvio. */
const staffAuto = require(`${BASE}/Services/Staff/staffAutoValutazioniService`);
staffAuto.finishSerataFilmSessionsForChannel = async () => ({ ok: false, skipped: true, reason: "script_manuale_senza_presenze" });
const { handleMovieNightStageClose } = require(`${BASE}/Services/Community/movieNightAnnouncementService`);

const MOVIE_NIGHT_EVENT_CHANNEL_ID = "1497535199813042306";

async function main() {
  /* le variabili le passa PM2: si leggono dal processo bots-vinyls che sta girando */
  try {
    const { execSync } = require("node:child_process");
    const pid = execSync("pm2 pid bots-vinyls", { encoding: "utf8" }).trim().split(/\s+/).pop();
    const raw = require("node:fs").readFileSync(`/proc/${pid}/environ`, "utf8");
    for (const row of raw.split("\0")) {
      const eq = row.indexOf("=");
      if (eq > 0 && process.env[row.slice(0, eq)] == null) process.env[row.slice(0, eq)] = row.slice(eq + 1);
    }
    console.log("variabili prese da bots-vinyls (pid " + pid + ")");
  } catch (err) {
    console.log("variabili di bots-vinyls non lette:", err?.message || err);
  }
  /* stessi .env che legge il bot all'avvio (index: loadEnvFiles(cartella Vinili)) */
  require(`${BASE}/../shared/runtime/fsRuntime`).loadEnvFiles(BASE);
  boot.loadDotEnv();
  boot.installConsoleLogger();
  boot.installWorkerEmbedPatches();
  const config = boot.loadVinylsConfig();
  const mongoUrl = require(`${BASE}/Utils/Database/mongoConnect`).buildMongoUrl({ config });
  if (!mongoUrl) throw new Error("indirizzo del database non trovato (.env o config.json)");
  await mongoose.connect(mongoUrl, { maxPoolSize: 2, serverSelectionTimeoutMS: 12_000 });
  console.log("database collegato");
  const token = boot.resolveDiscordToken() || String(config.token || "").trim();
  if (!token) throw new Error("token del bot non trovato");
  const client = await createSiteApiRestClient(config, token, { restTimeoutMs: 12_000, meAttempts: 5 });
  global.botClient = client;
  const guild = await getClientGuildCached(client, String(IDs.guilds.main));
  if (!guild) throw new Error("server principale non trovato");
  console.log("server:", guild.name);
  const result = await handleMovieNightStageClose(
    { guild, channelId: MOVIE_NIGHT_EVENT_CHANNEL_ID, client },
    { force: process.argv.includes("--forza") },
  );
  console.log("RISULTATO:", JSON.stringify(result, null, 2).slice(0, 3000));
}

main()
  .catch((err) => console.error("ERRORE:", err?.stack || err))
  .finally(() => setTimeout(() => process.exit(0), 3000));
