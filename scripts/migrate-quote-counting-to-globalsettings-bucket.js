/**
 * Importa da collection legacy `quotecounts` e `countschemas` nel documento
 * `globalsettings` con `_counterKey: "global_ticket_id"` (campi `quotecounts` e `countschemas`).
 * Non modifica `_counterValue` (contatore ticket).
 * Non elimina le collection legacy.
 *
 * Uso:
 *   node scripts/migrate-quote-counting-to-globalsettings-bucket.js
 *   node scripts/migrate-quote-counting-to-globalsettings-bucket.js --apply
 *   node scripts/migrate-quote-counting-to-globalsettings-bucket.js --apply --skip-verify
 *
 * Richiede .env: MONGO_URL_LOCAL | MONGODB_URI_LOCAL | MONGO_URL | MONGODB_URI
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const {
  TICKET_COUNTER_KEY,
  COUNTER_COLLECTION,
  LEGACY_QUOTECOUNTS_COLLECTION,
  LEGACY_COUNTSCHEMAS_COLLECTION,
} = require("../Vinyls/Utils/Global/globalSettingsBucket");

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

function argHas(flag) {
  return process.argv.includes(flag);
}

function toStringId(v) {
  if (v == null) return "";
  if (typeof v === "object" && v != null && typeof v.toString === "function") {
    return String(v.toString());
  }
  return String(v);
}

function mergeQuoteCounts(current, legacyRows) {
  const map = new Map();
  for (const x of current || []) {
    const g = toStringId(x.guildId);
    if (!g) continue;
    map.set(g, { guildId: g, count: Number(x.count || 0) });
  }
  for (const x of legacyRows || []) {
    const g = toStringId(x.guildId);
    if (!g) continue;
    map.set(g, { guildId: g, count: Number(x.count || 0) });
  }
  return [...map.values()];
}

function mergeCountschemas(current, legacyRows) {
  const map = new Map();
  for (const x of current || []) {
    const g = toStringId(x.Guild);
    if (!g) continue;
    map.set(g, {
      Guild: x.Guild,
      Channel: x.Channel,
      Count: x.Count,
      LastUser: x.LastUser,
    });
  }
  for (const x of legacyRows || []) {
    const g = toStringId(x.Guild);
    if (!g) continue;
    map.set(g, {
      Guild: x.Guild,
      Channel: x.Channel,
      Count: x.Count,
      LastUser: x.LastUser,
    });
  }
  return [...map.values()];
}

async function main() {
  const apply = argHas("--apply");
  const skipVerify = argHas("--skip-verify");

  if (!MONGO_URL) {
    console.error("Missing MONGO_URL_LOCAL|MONGODB_URI_LOCAL|MONGO_URL|MONGODB_URI in .env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URL);
  const db = mongoose.connection.db;
  const coll = db.collection(COUNTER_COLLECTION);
  const legacyQ = db.collection(LEGACY_QUOTECOUNTS_COLLECTION);
  const legacyC = db.collection(LEGACY_COUNTSCHEMAS_COLLECTION);

  const legacyQuoteRows = await legacyQ.find({}).toArray();
  const legacyCountRows = await legacyC.find({}).toArray();

  const strip = (rows) =>
    rows.map((d) => {
      const { _id, __v, ...rest } = d;
      return rest;
    });

  const legacyQuoteClean = strip(legacyQuoteRows);
  const legacyCountClean = strip(legacyCountRows);

  const bucket = await coll.findOne({ _counterKey: TICKET_COUNTER_KEY });
  const curQ = bucket?.quotecounts || [];
  const curC = bucket?.countschemas || [];

  const mergedQ = mergeQuoteCounts(curQ, legacyQuoteClean);
  const mergedC = mergeCountschemas(curC, legacyCountClean);

  const uniqLegacyQ = new Set(
    legacyQuoteClean.map((x) => toStringId(x.guildId)).filter(Boolean),
  ).size;
  const uniqLegacyC = new Set(
    legacyCountClean.map((x) => toStringId(x.Guild)).filter(Boolean),
  ).size;

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        legacyCollection: {
          quotecounts: LEGACY_QUOTECOUNTS_COLLECTION,
          countschemas: LEGACY_COUNTSCHEMAS_COLLECTION,
        },
        legacyRows: { quotecounts: legacyQuoteRows.length, countschemas: legacyCountRows.length },
        legacyUniqueKeys: { quotecounts: uniqLegacyQ, countschemas: uniqLegacyC },
        bucketBefore: {
          quotecounts: curQ.length,
          countschemas: curC.length,
          _counterValue: bucket?._counterValue,
        },
        afterMerge: {
          quotecounts: mergedQ.length,
          countschemas: mergedC.length,
        },
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("Dry-run only. Pass --apply to write.");
    await mongoose.disconnect();
    return;
  }

  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY },
    {
      $set: { quotecounts: mergedQ, countschemas: mergedC },
      $setOnInsert: { _counterKey: TICKET_COUNTER_KEY, _counterValue: 0 },
    },
    { upsert: true },
  );

  const after = await coll.findOne({ _counterKey: TICKET_COUNTER_KEY });
  console.log(
    JSON.stringify(
      {
        bucketAfter: {
          quotecounts: (after?.quotecounts || []).length,
          countschemas: (after?.countschemas || []).length,
          _counterValue: after?._counterValue,
        },
      },
      null,
      2,
    ),
  );

  if (!skipVerify) {
    const qLen = (after?.quotecounts || []).length;
    const cLen = (after?.countschemas || []).length;
    const okQ = uniqLegacyQ <= qLen || legacyQuoteRows.length === 0;
    const okC = uniqLegacyC <= cLen || legacyCountRows.length === 0;
    if (!okQ || !okC) {
      console.error("Verify failed: merged arrays shorter than expected unique keys from legacy.");
      process.exitCode = 1;
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});