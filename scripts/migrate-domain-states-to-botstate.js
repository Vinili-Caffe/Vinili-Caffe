/**
 * FASE 1 — Import completo (sicurezza)
 *
 * Legge TUTTE le righe dalle collection legacy e le scrive in UN SOLO documento
 * botstates con key = DOMAIN_STATES_BOTSTATE_KEY (__domain_states__).
 * Non scrive mai su __bot_state_compact__: il compact è solo per lo script compact-botstates.js.
 * Non elimina le collection legacy.
 *
 * Dopo --apply verifica che ogni array in domains abbia la stessa lunghezza dei dati
 * importati (exit code 1 se mismatch). Opzione --skip-verify solo emergenze.
 *
 * FASE 2 — Dopo aver verificato l’import, esegui:
 *   node scripts/compact-botstates.js --apply
 *
 * Collection legacy: joinraidstates, minigamestates, minigamerotations,
 * musicqueuestates, voicestates, chatreminderrotations, chatreminderschedules
 *
 * Uso:
 *   node scripts/migrate-domain-states-to-botstate.js
 *   node scripts/migrate-domain-states-to-botstate.js --apply
 *   node scripts/migrate-domain-states-to-botstate.js --apply --skip-verify
 *
 * Richiede .env: MONGO_URL_LOCAL | MONGODB_URI_LOCAL | MONGO_URL | MONGODB_URI
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const BotState = require("../Vinyls/Schemas/BotState/botStateSchema");

const { DOMAIN_STATES_BOTSTATE_KEY } = BotState;

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

const LEGACY = {
  joinRaidStates: "joinraidstates",
  minigameStates: "minigamestates",
  minigameRotations: "minigamerotations",
  musicQueueStates: "musicqueuestates",
  voiceStates: "voicestates",
  chatReminderRotations: "chatreminderrotations",
  chatReminderSchedules: "chatreminderschedules",
};

function stripV(x) {
  if (x == null) return x;
  if (Array.isArray(x)) return x.map(stripV);
  if (typeof x !== "object") return x;
  if (x instanceof Date) return x;
  const o = {};
  for (const [k, v] of Object.entries(x)) {
    if (k === "__v") continue;
    o[k] =
      v != null && typeof v === "object" && !(v instanceof Date)
        ? stripV(v)
        : v;
  }
  return o;
}

function normalizeChatReminderScheduleDoc(d) {
  const base = stripV(d);
  const scheduleId =
    base.scheduleId || (base._id != null ? String(base._id) : "");
  if (!scheduleId) return null;
  const o = {
    scheduleId,
    guildId: String(base.guildId || ""),
    fireAt:
      base.fireAt instanceof Date ? base.fireAt : new Date(base.fireAt),
    kind: base.kind || "first",
  };
  if (base.createdAt) o.createdAt = base.createdAt;
  if (base.updatedAt) o.updatedAt = base.updatedAt;
  return o;
}

async function loadDomains(db) {
  const [
    joinRaidStates,
    minigameStates,
    minigameRotations,
    musicQueueStates,
    voiceStates,
    chatReminderRotations,
    rawChatReminderSchedules,
  ] = await Promise.all([
    db.collection(LEGACY.joinRaidStates).find({}).toArray(),
    db.collection(LEGACY.minigameStates).find({}).toArray(),
    db.collection(LEGACY.minigameRotations).find({}).toArray(),
    db.collection(LEGACY.musicQueueStates).find({}).toArray(),
    db.collection(LEGACY.voiceStates).find({}).toArray(),
    db.collection(LEGACY.chatReminderRotations).find({}).toArray(),
    db.collection(LEGACY.chatReminderSchedules).find({}).toArray(),
  ]);
  const chatReminderSchedules = rawChatReminderSchedules
    .map(normalizeChatReminderScheduleDoc)
    .filter(Boolean);
  const droppedSchedules =
    rawChatReminderSchedules.length - chatReminderSchedules.length;
  return {
    domains: {
      joinRaidStates: stripV(joinRaidStates),
      minigameStates: stripV(minigameStates),
      minigameRotations: stripV(minigameRotations),
      musicQueueStates: stripV(musicQueueStates),
      voiceStates: stripV(voiceStates),
      chatReminderRotations: stripV(chatReminderRotations),
      chatReminderSchedules,
    },
    meta: {
      rawChatReminderScheduleRows: rawChatReminderSchedules.length,
      droppedInvalidChatReminderSchedules: droppedSchedules,
    },
  };
}

function verifyStoredMatchesExpected(storedDomains, expectedDomains) {
  const keys = [
    "joinRaidStates",
    "minigameStates",
    "minigameRotations",
    "musicQueueStates",
    "voiceStates",
    "chatReminderRotations",
    "chatReminderSchedules",
  ];
  const mismatches = [];
  for (const k of keys) {
    const got = Array.isArray(storedDomains?.[k])
      ? storedDomains[k].length
      : -1;
    const exp = Array.isArray(expectedDomains[k])
      ? expectedDomains[k].length
      : -1;
    if (got !== exp) mismatches.push({ key: k, expected: exp, stored: got });
  }
  return mismatches;
}

async function run() {
  const apply = process.argv.includes("--apply");
  const skipVerify = process.argv.includes("--skip-verify");
  if (!MONGO_URL) {
    console.error(
      "[migrate-domain-states] Manca URI MongoDB (MONGO_URL_LOCAL / MONGODB_URI_LOCAL / MONGO_URL / MONGODB_URI)",
    );
    process.exit(1);
  }

  await mongoose.connect(MONGO_URL);
  try {
    const db = mongoose.connection.db;
    const { domains, meta } = await loadDomains(db);
    const report = {
      mode: apply ? "apply" : "dry-run",
      backupDocumentKey: DOMAIN_STATES_BOTSTATE_KEY,
      note:
        "Import sempre su __domain_states__. Il compact (fase 2) è compact-botstates.js --apply.",
      sourceCollections: {
        joinraidstates: domains.joinRaidStates.length,
        minigamestates: domains.minigameStates.length,
        minigamerotations: domains.minigameRotations.length,
        musicqueuestates: domains.musicQueueStates.length,
        voicestates: domains.voiceStates.length,
        chatreminderrotations: domains.chatReminderRotations.length,
        chatreminderschedules_raw: meta.rawChatReminderScheduleRows,
        chatreminderschedules_imported:
          domains.chatReminderSchedules.length,
        chatreminderschedules_dropped_invalid:
          meta.droppedInvalidChatReminderSchedules,
      },
    };

    if (!apply) {
      console.log("[migrate-domain-states] dry-run (nessuna scrittura)");
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const res = await BotState.findOneAndUpdate(
      { key: DOMAIN_STATES_BOTSTATE_KEY },
      {
        $set: {
          "domains.joinRaidStates": domains.joinRaidStates,
          "domains.minigameStates": domains.minigameStates,
          "domains.minigameRotations": domains.minigameRotations,
          "domains.musicQueueStates": domains.musicQueueStates,
          "domains.voiceStates": domains.voiceStates,
          "domains.chatReminderRotations": domains.chatReminderRotations,
          "domains.chatReminderSchedules": domains.chatReminderSchedules,
        },
        $setOnInsert: { key: DOMAIN_STATES_BOTSTATE_KEY },
      },
      { upsert: true, new: true, runValidators: false },
    ).lean();

    const stored = res?.domains || {};
    report.botstateCountsAfterWrite = {
      joinRaidStates: Array.isArray(stored.joinRaidStates)
        ? stored.joinRaidStates.length
        : 0,
      minigameStates: Array.isArray(stored.minigameStates)
        ? stored.minigameStates.length
        : 0,
      minigameRotations: Array.isArray(stored.minigameRotations)
        ? stored.minigameRotations.length
        : 0,
      musicQueueStates: Array.isArray(stored.musicQueueStates)
        ? stored.musicQueueStates.length
        : 0,
      voiceStates: Array.isArray(stored.voiceStates)
        ? stored.voiceStates.length
        : 0,
      chatReminderRotations: Array.isArray(stored.chatReminderRotations)
        ? stored.chatReminderRotations.length
        : 0,
      chatReminderSchedules: Array.isArray(stored.chatReminderSchedules)
        ? stored.chatReminderSchedules.length
        : 0,
    };

    if (!skipVerify) {
      const fresh = await BotState.findOne({
        key: DOMAIN_STATES_BOTSTATE_KEY,
      }).lean();
      const d = fresh?.domains || {};
      const mismatches = verifyStoredMatchesExpected(d, domains);
      report.verify = {
        ok: mismatches.length === 0,
        mismatches,
        rereadFromDb: true,
      };
      if (mismatches.length) {
        console.error(
          "[migrate-domain-states] VERIFICA FALLITA:",
          JSON.stringify(report, null, 2),
        );
        process.exitCode = 1;
        return;
      }
    } else {
      report.verify = { skipped: true };
    }

    console.log("[migrate-domain-states] apply completato e verificato");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error("[migrate-domain-states] errore:", err);
  process.exit(1);
});