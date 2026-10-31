// Annulla le valutazioni negative automatiche "serata film" date per errore (chiave serata_film:<eventId>).
// Toglie la voce, il motivo e i contatori come fa removeAutoValutazione del bot. Da lanciare SULLA VPS:
//   node /tmp/annulla-valutazioni-serata.cjs 1497535662445039646            → mostra chi verrebbe sistemato
//   node /tmp/annulla-valutazioni-serata.cjs 1497535662445039646 --applica  → le toglie davvero
const BASE = "/opt/bot/bots-ts/src/Vinili";
const req = require("node:module").createRequire(`${BASE}/Services/Web/communityPollWorkerApp.js`);
const mongoose = req("mongoose");

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

async function main() {
  const eventId = String(process.argv[2] || "").trim();
  if (!/^\d{5,}$/.test(eventId)) throw new Error("manca l'id dell'evento");
  const apply = process.argv.includes("--applica");
  const key = `serata_film:${eventId}`;
  loadEnvFromBot();
  const boot = require(`${BASE}/Services/Web/workerAppBootstrap`);
  const config = boot.loadVinylsConfig();
  const mongoUrl = require(`${BASE}/Utils/Database/mongoConnect`).buildMongoUrl({ config });
  await mongoose.connect(mongoUrl, { maxPoolSize: 2, serverSelectionTimeoutMS: 12_000 });
  const { ActivityUserProfile } = require(`${BASE}/Schemas/Community/communitySchemas`);
  const docs = await ActivityUserProfile.find({ "staff.autoValutazioni.key": key });
  console.log(`${docs.length} staffer con la valutazione ${key}${apply ? "" : " (prova: niente viene cambiato)"}`);
  let fixed = 0;
  for (const doc of docs) {
    const staff = doc.staff;
    const list = Array.isArray(staff.autoValutazioni) ? staff.autoValutazioni : [];
    const index = list.findIndex((e) => String(e?.key || "") === key);
    if (index < 0) continue;
    const entry = list[index];
    console.log(`- ${doc.userId} ${entry.type} "${entry.reason}" (negative ${staff.negativeCount} → ${Math.max(0, Number(staff.negativeCount || 0) - 1)})`);
    if (!apply) continue;
    list.splice(index, 1);
    const reasons = entry.type === "negative" ? staff.negativeReasons : staff.positiveReasons;
    if (Array.isArray(reasons)) {
      const r = reasons.lastIndexOf(String(entry.reason || ""));
      if (r >= 0) reasons.splice(r, 1);
    }
    if (entry.type === "negative") staff.negativeCount = Math.max(0, Number(staff.negativeCount || 0) - 1);
    else staff.positiveCount = Math.max(0, Number(staff.positiveCount || 0) - 1);
    staff.valutazioniCount = Math.max(0, Number(staff.valutazioniCount || 0) - 1);
    doc.markModified("staff");
    await doc.save();
    fixed += 1;
  }
  if (apply) console.log(`tolte ${fixed} valutazioni`);
}

main()
  .catch((err) => console.error("ERRORE:", err?.stack || err))
  .finally(() => setTimeout(() => process.exit(0), 1000));
