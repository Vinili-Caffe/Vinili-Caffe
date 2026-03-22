/**
 * FASE 2 — Compatta tutto in UN documento (dopo la migrazione verificata)
 *
 * Prerequisito: aver eseguito con successo
 *   node scripts/migrate-domain-states-to-botstate.js --apply
 * così esiste il backup completo su key __domain_states__ (DOMAIN_STATES_BOTSTATE_KEY).
 *
 * Questo script:
 *   - legge tutti i documenti in botstates (inclusi compact, __domain_states__, chiavi value sparse)
 *   - unisce value in valueMap e domains (il backup migrazione ha priorità sui domains)
 *   - scrive UN documento key = __bot_state_compact__
 *   - elimina gli altri documenti (incluso __domain_states__ dopo l’unione)
 *
 * L’ordine di merge sui domains preferisce array più lunghi e applica per ultimo il documento
 * __domain_states__ così l’import completo non viene perso.
 *
 * Uso:
 *   node scripts/compact-botstates.js
 *   node scripts/compact-botstates.js --apply
 *
 * Richiede .env: MONGO_URL_LOCAL | MONGODB_URI_LOCAL | MONGO_URL | MONGODB_URI
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const BotState = require("../Vinyls/Schemas/BotState/botStateSchema");

const {
  COMPACT_BOTSTATE_KEY,
  DOMAIN_STATES_BOTSTATE_KEY,
} = BotState;

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

function pickMergeArrays(a, b) {
  if (b === undefined || b === null) return a;
  if (a === undefined || a === null) return b;
  if (!Array.isArray(a) || !Array.isArray(b)) return b;
  if (b.length > a.length) return b;
  if (a.length > b.length) return a;
  return b;
}

function mergeDomains(a, b) {
  if (!a) return b || undefined;
  if (!b) return a;
  return {
    joinRaidStates: pickMergeArrays(a.joinRaidStates, b.joinRaidStates),
    minigameStates: pickMergeArrays(a.minigameStates, b.minigameStates),
    minigameRotations: pickMergeArrays(a.minigameRotations, b.minigameRotations),
    musicQueueStates: pickMergeArrays(a.musicQueueStates, b.musicQueueStates),
    voiceStates: pickMergeArrays(a.voiceStates, b.voiceStates),
    chatReminderRotations: pickMergeArrays(
      a.chatReminderRotations,
      b.chatReminderRotations,
    ),
    chatReminderSchedules: pickMergeArrays(
      a.chatReminderSchedules,
      b.chatReminderSchedules,
    ),
  };
}

function collectState(docs) {
  const valueMap = {};
  let domains = undefined;
  for (const doc of docs) {
    const docKey = doc.key;
    if (docKey === DOMAIN_STATES_BOTSTATE_KEY) continue;
    if (docKey === COMPACT_BOTSTATE_KEY) {
      Object.assign(
        valueMap,
        doc.value && typeof doc.value === "object" ? doc.value : {},
      );
      domains = mergeDomains(domains, doc.domains);
      continue;
    }
    if (doc.value !== undefined) valueMap[docKey] = doc.value;
    domains = mergeDomains(domains, doc.domains);
  }
  const backup = docs.find((d) => d.key === DOMAIN_STATES_BOTSTATE_KEY);
  if (backup?.domains) {
    domains = mergeDomains(domains, backup.domains);
  }
  return { valueMap, domains };
}

function domainLengths(dom) {
  if (!dom || typeof dom !== "object") return {};
  return {
    joinRaidStates: Array.isArray(dom.joinRaidStates)
      ? dom.joinRaidStates.length
      : 0,
    minigameStates: Array.isArray(dom.minigameStates)
      ? dom.minigameStates.length
      : 0,
    minigameRotations: Array.isArray(dom.minigameRotations)
      ? dom.minigameRotations.length
      : 0,
    musicQueueStates: Array.isArray(dom.musicQueueStates)
      ? dom.musicQueueStates.length
      : 0,
    voiceStates: Array.isArray(dom.voiceStates) ? dom.voiceStates.length : 0,
    chatReminderRotations: Array.isArray(dom.chatReminderRotations)
      ? dom.chatReminderRotations.length
      : 0,
    chatReminderSchedules: Array.isArray(dom.chatReminderSchedules)
      ? dom.chatReminderSchedules.length
      : 0,
  };
}

async function run() {
  const apply = process.argv.includes("--apply");
  if (!MONGO_URL) {
    console.error(
      "[compact-botstates] Manca URI MongoDB (MONGO_URL_LOCAL / MONGODB_URI_LOCAL / MONGO_URL / MONGODB_URI)",
    );
    process.exit(1);
  }

  await mongoose.connect(MONGO_URL);
  try {
    const docs = await BotState.find({}).sort({ updatedAt: 1 }).lean();
    const { valueMap, domains } = collectState(docs);
    const hadDomainBackup = docs.some(
      (d) => d.key === DOMAIN_STATES_BOTSTATE_KEY,
    );
    const report = {
      mode: apply ? "apply" : "dry-run",
      compactKey: COMPACT_BOTSTATE_KEY,
      backupKey: DOMAIN_STATES_BOTSTATE_KEY,
      hadDomainBackupDocument: hadDomainBackup,
      documentsBefore: docs.length,
      keysInValueMap: Object.keys(valueMap).length,
      valueKeys: Object.keys(valueMap),
      hasDomains: Boolean(domains),
      domainLengthsPreview: domains ? domainLengths(domains) : null,
    };

    if (!apply) {
      console.log("[compact-botstates] dry-run (nessuna scrittura)");
      console.log(JSON.stringify(report, null, 2));
      if (!hadDomainBackup) {
        console.warn(
          "[compact-botstates] ATTENZIONE: nessun documento __domain_states__. Esegui prima migrate-domain-states-to-botstate.js --apply.",
        );
      }
      return;
    }

    const update = {
      $set: { value: valueMap },
      $setOnInsert: { key: COMPACT_BOTSTATE_KEY },
    };
    if (domains) update.$set.domains = domains;
    else update.$unset = { domains: 1 };

    await BotState.findOneAndUpdate(
      { key: COMPACT_BOTSTATE_KEY },
      update,
      { upsert: true, new: true, runValidators: false },
    );

    const del = await BotState.deleteMany({ key: { $ne: COMPACT_BOTSTATE_KEY } });
    report.documentsDeleted = del.deletedCount;
    report.documentsAfter = await BotState.countDocuments();

    const finalDoc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
    report.compactDomainLengthsAfterApply = domainLengths(finalDoc?.domains);

    if (report.documentsAfter !== 1) {
      console.error(
        "[compact-botstates] ERRORE: atteso 1 documento in botstates, trovati",
        report.documentsAfter,
      );
      process.exitCode = 1;
    }

    console.log("[compact-botstates] apply completato");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error("[compact-botstates] errore:", err);
  process.exit(1);
});