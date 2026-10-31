// Seconda parte dell'annullamento delle negative "serata film" del 31/10 date per errore:
// le toglie anche dall'elenco delle valutazioni (staff.negativeValutazioni) e dallo storico (staff.trackHistory).
// Contatori e motivi li ha già sistemati annulla-valutazioni-serata.cjs. Da lanciare SULLA VPS:
//   node /tmp/annulla-valutazioni-serata-2.cjs             → mostra cosa toglierebbe
//   node /tmp/annulla-valutazioni-serata-2.cjs --applica   → le toglie
const BASE = "/opt/bot/bots-ts/src/Vinili";
const req = require("node:module").createRequire(`${BASE}/Services/Web/communityPollWorkerApp.js`);
const mongoose = req("mongoose");

const USER_IDS = ["778934882671656972", "1312812791253700669", "1288599167001821238", "989054923163439104"];
const REASON = "Non si presenta durante la serata film o rimane per meno di 30 minuti.";
/* solo quelle date stanotte dallo script (31/10 sera, ora italiana) */
const FROM = Date.parse("2026-10-31T20:00:00Z");
const TO = Date.parse("2026-11-01T04:00:00Z");

function loadEnvFromBot() {
  try {
    const { execSync } = require("node:child_process");
    const pid = execSync("pm2 pid bots-vinyls", { encoding: "utf8" }).trim().split(/\s+/).pop();
    const raw = require("node:fs").readFileSync(`/proc/${pid}/environ`, "utf8");
    for (const row of raw.split("\0")) {
      const eq = row.indexOf("=");
      if (eq > 0 && process.env[row.slice(0, eq)] == null) process.env[row.slice(0, eq)] = row.slice(eq + 1);
    }
  } catch (err) {
    console.log("variabili di bots-vinyls non lette:", err?.message || err);
  }
}

const inWindow = (d) => {
  const t = Date.parse(String(d || ""));
  return Number.isFinite(t) && t >= FROM && t <= TO;
};

async function main() {
  const apply = process.argv.includes("--applica");
  loadEnvFromBot();
  const boot = require(`${BASE}/Services/Web/workerAppBootstrap`);
  const mongoUrl = require(`${BASE}/Utils/Database/mongoConnect`).buildMongoUrl({ config: boot.loadVinylsConfig() });
  await mongoose.connect(mongoUrl, { maxPoolSize: 2, serverSelectionTimeoutMS: 12_000 });
  const { ActivityUserProfile } = require(`${BASE}/Schemas/Community/communitySchemas`);
  for (const userId of USER_IDS) {
    const docs = await ActivityUserProfile.find({ userId, staff: { $exists: true } });
    for (const doc of docs) {
      const staff = doc.staff || {};
      const list = Array.isArray(staff.negativeValutazioni) ? staff.negativeValutazioni : [];
      const history = Array.isArray(staff.trackHistory) ? staff.trackHistory : [];
      const badList = list.filter((e) => String(e?.reason || "") === REASON && inWindow(e?.createdAt));
      const badHistory = history.filter((e) => String(e?.kind || "") === "val_neg" && String(e?.reason || "") === REASON && inWindow(e?.date));
      console.log(`- ${userId} (server ${doc.guildId}): elenco ${badList.length}, storico ${badHistory.length}; negative ora ${staff.negativeCount}, nell'elenco ${list.length}`);
      if (!apply || (!badList.length && !badHistory.length)) continue;
      staff.negativeValutazioni = list.filter((e) => !badList.includes(e));
      staff.trackHistory = history.filter((e) => !badHistory.includes(e));
      doc.markModified("staff");
      await doc.save();
      console.log(`  tolte: elenco ${badList.length}, storico ${badHistory.length}`);
    }
  }
  if (!apply) console.log("prova: niente cambiato. Rilancia con --applica");
}

main()
  .catch((err) => console.error("ERRORE:", err?.stack || err))
  .finally(() => setTimeout(() => process.exit(0), 1000));
