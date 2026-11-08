#!/usr/bin/env node
/*
 * Segna SUBITO "non completato" il compito automatico della settimana di uno staffer,
 * come farebbero i resoconti: valutazione negativa (salvo periodo di prova / settimane senza penalità)
 * e notifica "Compito non raggiunto". Usa il codice del bot già pubblicato sulla VPS.
 * Funziona solo se il compito della settimana è proprio quello indicato ed è ancora "da fare".
 *
 * Uso sulla VPS:
 *   node compito-non-completato.cjs <ID_STAFFER> [limits_triple]
 */
const { createRequire } = require("module");

const BOTS = "/opt/bot/bots-ts";
const SRC = `${BOTS}/src`;
const userId = String(process.argv[2] || "").trim();
const taskId = String(process.argv[3] || "limits_triple").trim();
if (!/^\d{17,20}$/.test(userId)) {
  console.error("Uso: node compito-non-completato.cjs <ID_STAFFER> [limits_triple]");
  process.exit(1);
}

process.chdir(SRC);
const req = createRequire(`${BOTS}/package.json`);
const mongoose = req("mongoose");
const boot = req(`${SRC}/Vinili/site/workers/workerAppBootstrap.js`);
const { createSiteApiRestClient } = req(`${SRC}/Vinili/site/http/siteApiRestClient.js`);

(async () => {
  boot.loadDotEnv();
  try {
    boot.installConsoleLogger();
  } catch {}
  const mongo = boot.resolveMongoUrl();
  const token = boot.resolveDiscordToken();
  if (!mongo || !token) throw new Error("MONGO_URL o DISCORD_TOKEN mancanti nel .env");
  await mongoose.connect(mongo, { maxPoolSize: 2, serverSelectionTimeoutMS: 12000 });
  const client = await createSiteApiRestClient(boot.loadVinylsConfig(), token);
  global.botClient = client;

  const { tryAutoFailCompito } = req(`${SRC}/Vinili/site/staff/compitiTicks.js`);
  if (typeof tryAutoFailCompito !== "function") {
    throw new Error("Sulla VPS manca la versione nuova di compitiTicks: lancia prima pubblica.sh");
  }
  const out = await tryAutoFailCompito(client, {
    userId,
    taskId,
    reason: "obiettivo non raggiunto ai resoconti",
  });
  console.log("Risultato:", JSON.stringify(out));
  if (!out?.ok) {
    const why = {
      not_selected_this_week: "questa settimana lo staffer non ha scelto questo compito",
      already_locked: `il compito è già chiuso (stato: ${out?.status})`,
      invalid: "ID o compito non validi",
      not_auto: "non è un compito automatico",
    }[out?.error] || out?.error;
    console.log("Niente da fare:", why);
  }
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
})().catch(async (err) => {
  console.error("Errore:", err?.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
