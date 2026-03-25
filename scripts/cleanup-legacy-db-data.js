/**
 * Pulizia dati DB non più usati dal bot (legacy): report, $unset su BotState compact,
 * drop opzionale di collezioni storiche (mod_case, discadia_votes, ecc.).
 *
 * Per default è in modalità SICURA: solo lettura / anteprima. Le modifiche richiedono --apply.
 *
 * Uso (dalla root del repo):
 *   node scripts/cleanup-legacy-db-data.js
 *   node scripts/cleanup-legacy-db-data.js --apply --unset-music-queue-domains
 *   node scripts/cleanup-legacy-db-data.js --apply --drop-legacy-collections
 *   node scripts/cleanup-legacy-db-data.js --apply --all-legacy
 *   LEGACY_DROP_COLLECTIONS=mod_case,discadia_votes node scripts/cleanup-legacy-db-data.js --apply --drop-legacy-collections
 *
 * Richiede in .env: MONGO_URL (o MONGODB_URI, MONGO_URL_LOCAL, … come negli altri script).
 */
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

const argv = new Set(process.argv.slice(2));
const APPLY = argv.has("--apply");
const NO_REPORT = argv.has("--no-report");

const DEFAULT_LEGACY_COLLECTIONS = ["mod_case", "discadia_votes"];

function parseLegacyCollectionsEnv() {
  const raw = String(process.env.LEGACY_DROP_COLLECTIONS || "").trim();
  if (!raw) return [...DEFAULT_LEGACY_COLLECTIONS];
  return raw
    .split(/[,;]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getModCaseStorageMode() {
  return String(process.env.MOD_CASE_STORAGE_MODE || "compact").trim().toLowerCase();
}

async function reportCollections(db) {
  const cols = await db.listCollections().toArray();
  const names = cols.map((c) => c.name).sort((a, b) => a.localeCompare(b));
  console.log("[report] Collezioni nel database (" + names.length + "):\n");
  for (const name of names) {
    const n = await db.collection(name).estimatedDocumentCount();
    console.log(`  ${name}: ${n} doc (stima)`);
  }
  console.log("");
}

async function unsetMusicQueueDomains(BotState, COMPACT_BOTSTATE_KEY) {
  const label = "$unset domains.musicQueueStates su BotState compact";
  if (!APPLY) {
    const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY })
      .select("domains.musicQueueStates")
      .lean();
    const has = Boolean(doc?.domains?.musicQueueStates?.length);
    console.log(`[dry-run] ${label}: ${has ? "presente (verrebbe rimosso)" : "assente o già vuoto"}`);
    return { skipped: !has };
  }
  const res = await BotState.updateOne(
    { key: COMPACT_BOTSTATE_KEY },
    { $unset: { "domains.musicQueueStates": "" } },
  ).catch((err) => {
    console.error("[error] unset music queue domains:", err?.message || err);
    return { modifiedCount: 0 };
  });
  console.log(`[apply] ${label}: matched=${res.matchedCount ?? "?"} modified=${res.modifiedCount ?? "?"}`);
  return res;
}

async function dropLegacyCollections(db) {
  const names = parseLegacyCollectionsEnv();
  const mode = getModCaseStorageMode();
  if (names.includes("mod_case") && (mode === "legacy" || mode === "dual")) {
    console.warn(
      "[warn] MOD_CASE_STORAGE_MODE è `" + mode + "`: non elimino `mod_case` (rimuovi dal set o usa MOD_CASE_STORAGE_MODE=compact e verifica backup).",
    );
  }
  const toDrop = names.filter((n) => {
    if (n === "mod_case" && (mode === "legacy" || mode === "dual")) return false;
    return true;
  });

  for (const name of toDrop) {
    const exists = (await db.listCollections({ name }).toArray()).length > 0;
    if (!exists) {
      console.log(`[info] Collezione \`${name}\`: non esiste, skip.`);
      continue;
    }
    const n = await db.collection(name).estimatedDocumentCount();
    if (!APPLY) {
      console.log(`[dry-run] dropCollection \`${name}\` (${n} doc stimati)`);
      continue;
    }
    await db.collection(name).drop();
    console.log(`[apply] dropCollection \`${name}\` OK (erano ~${n} doc)`);
  }
}

async function main() {
  if (!MONGO_URL) {
    console.error("Imposta MONGO_URL (o variante *_LOCAL / MONGODB_URI) in .env");
    process.exit(1);
  }

  const wantsReport = !NO_REPORT;
  const wantsUnsetMusic = argv.has("--unset-music-queue-domains") || argv.has("--all-legacy");
  const wantsDrop = argv.has("--drop-legacy-collections") || argv.has("--all-legacy");

  if (!wantsReport && !wantsUnsetMusic && !wantsDrop) {
    console.log(`Uso:
  node scripts/cleanup-legacy-db-data.js
  node scripts/cleanup-legacy-db-data.js --apply --unset-music-queue-domains
  node scripts/cleanup-legacy-db-data.js --apply --drop-legacy-collections
  node scripts/cleanup-legacy-db-data.js --apply --all-legacy
Opzioni: --no-report  --unset-music-queue-domains  --drop-legacy-collections  --all-legacy  --apply
Env: LEGACY_DROP_COLLECTIONS=mod_case,discadia_votes  MOD_CASE_STORAGE_MODE=compact`);
    process.exit(0);
  }

  await mongoose.connect(MONGO_URL);
  const db = mongoose.connection.db;

  if (wantsReport) await reportCollections(db);

  if (wantsUnsetMusic || wantsDrop) {
    const BotState = require("../Vinyls/Schemas/BotState/botStateSchema");
    const { COMPACT_BOTSTATE_KEY } = BotState;
    if (wantsUnsetMusic) await unsetMusicQueueDomains(BotState, COMPACT_BOTSTATE_KEY);
    if (wantsDrop) await dropLegacyCollections(db);
  }

  if (!APPLY && (wantsUnsetMusic || wantsDrop)) {
    console.log("\n[hint] Nessuna modifica applicata: aggiungi --apply per eseguire.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});