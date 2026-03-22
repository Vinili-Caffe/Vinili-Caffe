/**
 * Documento unico in collection `globalsettings` con _counterKey === global_ticket_id:
 * - _counterValue: contatore ticket
 * - countschemas: array { Guild, Channel, Count, LastUser }
 * - quotecounts: array { guildId, count }
 */
const mongoose = require("mongoose");

/** Collection legacy (solo lettura opzionale se esistono ancora nel DB). */
const LEGACY_QUOTECOUNTS_COLLECTION = "quotecounts";
const LEGACY_COUNTSCHEMAS_COLLECTION = "countschemas";

const TICKET_COUNTER_KEY = "global_ticket_id";
const COUNTER_COLLECTION = "globalsettings";

function getCollection() {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return db.collection(COUNTER_COLLECTION);
}

async function ensureBucketArrays() {
  const coll = getCollection();
  if (!coll) return;
  await coll.updateOne(
    {
      _counterKey: TICKET_COUNTER_KEY,
      countschemas: { $exists: false },
    },
    { $set: { countschemas: [], quotecounts: [], partnershipBlacklistGuilds: [] } },
  );
  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY, partnershipBlacklistGuilds: { $exists: false } },
    { $set: { partnershipBlacklistGuilds: [] } },
  );
}

async function pingDbLatencyMs() {
  const coll = getCollection();
  if (!coll || mongoose.connection?.readyState !== 1) return null;
  const t = Date.now();
  await coll.findOne({ _counterKey: TICKET_COUNTER_KEY }, { projection: { _id: 1 } });
  return Math.max(0, Date.now() - t);
}

async function getPartnershipBlacklistEntries() {
  const coll = getCollection();
  if (!coll || mongoose.connection?.readyState !== 1) return [];
  await ensureBucketArrays();
  const doc = await coll.findOne({ _counterKey: TICKET_COUNTER_KEY });
  return Array.isArray(doc?.partnershipBlacklistGuilds) ? doc.partnershipBlacklistGuilds : [];
}

async function setPartnershipBlacklistEntries(rows) {
  const coll = getCollection();
  if (!coll) return;
  await ensureBucketArrays();
  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY },
    { $set: { partnershipBlacklistGuilds: Array.isArray(rows) ? rows : [] } },
  );
}

async function isPartnershipGuildBlacklistedBucket(guildId) {
  const g = String(guildId || "").trim();
  if (!/^\d{16,20}$/.test(g)) return false;
  const arr = await getPartnershipBlacklistEntries();
  return arr.some((x) => String(x?.guildId) === g);
}

async function addPartnershipBlacklistGuildBucket(guildId, addedBy, note = "") {
  const g = String(guildId || "").trim();
  if (!/^\d{16,20}$/.test(g)) return { ok: false, reason: "invalid_id" };
  const arr = await getPartnershipBlacklistEntries();
  const next = arr.filter((x) => String(x?.guildId) !== g);
  next.push({
    guildId: g,
    addedBy: String(addedBy || ""),
    note: String(note || "").slice(0, 500),
    addedAt: new Date(),
  });
  await setPartnershipBlacklistEntries(next);
  return { ok: true, guildId: g };
}

async function removePartnershipBlacklistGuildBucket(guildId) {
  const g = String(guildId || "").trim();
  if (!/^\d{16,20}$/.test(g)) return { ok: false, reason: "invalid_id" };
  const arr = await getPartnershipBlacklistEntries();
  const before = arr.length;
  const next = arr.filter((x) => String(x?.guildId) !== g);
  await setPartnershipBlacklistEntries(next);
  return { ok: true, deleted: before > next.length, guildId: g };
}

async function listPartnershipBlacklistGuildsBucket(limit = 50) {
  const safe = Math.max(1, Math.min(100, Number(limit) || 50));
  const arr = await getPartnershipBlacklistEntries();
  return [...arr]
    .sort((a, b) => new Date(b?.addedAt || 0) - new Date(a?.addedAt || 0))
    .slice(0, safe);
}

async function pullQuoteFromLegacy(guildId) {
  const g = String(guildId || "");
  const db = mongoose.connection?.db;
  if (!g || !db || mongoose.connection?.readyState !== 1) return null;
  try {
    const doc = await db
      .collection(LEGACY_QUOTECOUNTS_COLLECTION)
      .findOne({ guildId: g });
    if (!doc) return null;
    return Math.max(0, Number(doc.count || 0));
  } catch {
    return null;
  }
}

async function pullCountingFromLegacy(guildId) {
  const key = String(guildId || "");
  const db = mongoose.connection?.db;
  if (!key || !db || mongoose.connection?.readyState !== 1) return null;
  try {
    const doc = await db
      .collection(LEGACY_COUNTSCHEMAS_COLLECTION)
      .findOne({ Guild: key });
    if (!doc) return null;
    return {
      Guild: doc.Guild,
      Channel: doc.Channel,
      Count: doc.Count,
      LastUser: doc.LastUser,
    };
  } catch {
    return null;
  }
}

function wrapCountingRow(row) {
  if (!row) return null;
  const self = {
    Guild: row.Guild,
    Channel: row.Channel,
    Count: row.Count,
    LastUser: row.LastUser,
    async save() {
      await saveCountingRow({
        Guild: self.Guild,
        Channel: self.Channel,
        Count: self.Count,
        LastUser: self.LastUser,
      });
    },
  };
  return self;
}

async function saveCountingRow(row) {
  const g = String(row.Guild || "");
  const coll = getCollection();
  if (!coll) return;
  await ensureBucketArrays();
  const doc = await coll.findOne({ _counterKey: TICKET_COUNTER_KEY });
  const arr = [...(doc?.countschemas || [])];
  const i = arr.findIndex((x) => String(x.Guild) === g);
  const payload = {
    Guild: row.Guild,
    Channel: row.Channel,
    Count: row.Count,
    LastUser: row.LastUser,
  };
  if (i >= 0) arr[i] = payload;
  else arr.push(payload);
  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY },
    { $set: { countschemas: arr } },
  );
}

async function getCountingConfigFromBucket(guildId) {
  const key = String(guildId || "");
  if (!key) return null;
  const coll = getCollection();
  if (!coll || mongoose.connection?.readyState !== 1) return null;
  await ensureBucketArrays();
  let doc = await coll.findOne({ _counterKey: TICKET_COUNTER_KEY });
  let row = (doc?.countschemas || []).find((x) => String(x.Guild) === key);
  if (!row) {
    const legacy = await pullCountingFromLegacy(key);
    if (legacy) {
      await saveCountingRow(legacy);
      doc = await coll.findOne({ _counterKey: TICKET_COUNTER_KEY });
      row = (doc?.countschemas || []).find((x) => String(x.Guild) === key);
    }
  }
  return wrapCountingRow(row);
}

async function nextQuoteCount(guildId) {
  const g = String(guildId || "");
  if (!g) return 1;
  const coll = getCollection();
  if (!coll || mongoose.connection?.readyState !== 1) return 1;
  await ensureBucketArrays();
  let doc = await coll.findOne({ _counterKey: TICKET_COUNTER_KEY });
  let arr = [...(doc?.quotecounts || [])];
  let i = arr.findIndex((x) => String(x.guildId) === g);
  if (i < 0) {
    const legacy = await pullQuoteFromLegacy(g);
    if (legacy != null) {
      arr.push({ guildId: g, count: legacy });
      i = arr.length - 1;
    }
  }
  let next;
  if (i >= 0) {
    const c = Number(arr[i].count || 0) + 1;
    arr[i] = { guildId: g, count: c };
    next = c;
  } else {
    arr.push({ guildId: g, count: 1 });
    next = 1;
  }
  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY },
    { $set: { quotecounts: arr } },
  );
  return next;
}

async function decrementQuoteCount(guildId) {
  const g = String(guildId || "");
  if (!g) return 0;
  const coll = getCollection();
  if (!coll || mongoose.connection?.readyState !== 1) return 0;
  await ensureBucketArrays();
  let doc = await coll.findOne({ _counterKey: TICKET_COUNTER_KEY });
  let arr = [...(doc?.quotecounts || [])];
  let i = arr.findIndex((x) => String(x.guildId) === g);
  if (i < 0) {
    const legacy = await pullQuoteFromLegacy(g);
    if (legacy != null) {
      arr.push({ guildId: g, count: legacy });
      i = arr.length - 1;
    }
  }
  if (i < 0) return 0;
  let c = Number(arr[i].count || 0) - 1;
  if (c < 0) c = 0;
  arr[i] = { guildId: g, count: c };
  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY },
    { $set: { quotecounts: arr } },
  );
  return c;
}

module.exports = {
  TICKET_COUNTER_KEY,
  COUNTER_COLLECTION,
  LEGACY_QUOTECOUNTS_COLLECTION,
  LEGACY_COUNTSCHEMAS_COLLECTION,
  ensureBucketArrays,
  getCountingConfigFromBucket,
  nextQuoteCount,
  decrementQuoteCount,
  pingDbLatencyMs,
  getPartnershipBlacklistEntries,
  setPartnershipBlacklistEntries,
  isPartnershipGuildBlacklistedBucket,
  addPartnershipBlacklistGuildBucket,
  removePartnershipBlacklistGuildBucket,
  listPartnershipBlacklistGuildsBucket,
};