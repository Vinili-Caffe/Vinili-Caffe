const mongoose = require("mongoose");
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
    { $set: { countschemas: [], quotecounts: [], repostcounts: [], clipcounts: [], partnershipBlacklistGuilds: [] } },
  );
  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY, partnershipBlacklistGuilds: { $exists: false } },
    { $set: { partnershipBlacklistGuilds: [] } },
  );
  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY, repostcounts: { $exists: false } },
    { $set: { repostcounts: [] } },
  );
  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY, clipcounts: { $exists: false } },
    { $set: { clipcounts: [] } },
  );
}

async function pingDbLatencyMs() {
  const db = mongoose.connection?.db;
  if (!db || mongoose.connection?.readyState !== 1) return null;
  const startedAt = Date.now();
  try {
    await db.admin().ping();
    return Math.max(0, Date.now() - startedAt);
  } catch {
    const coll = getCollection();
    if (!coll) return null;
    await coll.findOne({ _counterKey: TICKET_COUNTER_KEY }, { projection: { _id: 1 } });
    return Math.max(0, Date.now() - startedAt);
  }
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

async function addPartnershipBlacklistGuildBucket(guildId, addedBy, note = "", meta = {}) {
  const g = String(guildId || "").trim();
  if (!/^\d{16,20}$/.test(g)) return { ok: false, reason: "invalid_id" };
  const arr = await getPartnershipBlacklistEntries();
  const next = arr.filter((x) => String(x?.guildId) !== g);
  const invite = String(meta?.invite || "").trim();
  const guildName = String(meta?.guildName || "").trim();
  const iconUrl = String(meta?.iconUrl || "").trim();
  next.push({
    guildId: g,
    addedBy: String(addedBy || ""),
    note: String(note || "").slice(0, 500),
    addedAt: new Date(),
    ...(invite ? { invite: invite.slice(0, 300) } : {}),
    ...(guildName ? { guildName: guildName.slice(0, 100) } : {}),
    ...(iconUrl ? { iconUrl: iconUrl.slice(0, 500) } : {}),
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

async function getPartnerPmDailyThreadId() {
  const coll = getCollection();
  if (!coll || mongoose.connection?.readyState !== 1) return null;
  await ensureBucketArrays();
  const doc = await coll.findOne({ _counterKey: TICKET_COUNTER_KEY }, { projection: { partnerPmDailyThreadId: 1 } });
  const id = doc?.partnerPmDailyThreadId;
  return id != null && String(id).trim() !== "" ? String(id).trim() : null;
}

async function setPartnerPmDailyThreadId(threadId) {
  const coll = getCollection();
  if (!coll) return;
  await ensureBucketArrays();
  const id = threadId != null && String(threadId).trim() !== "" ? String(threadId).trim() : null;
  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY },
    id ? { $set: { partnerPmDailyThreadId: id } } : { $unset: { partnerPmDailyThreadId: "" } },
  );
}

const STAFF_CHAT_THREAD_DB_FIELDS = {
  pm: "staffChatPmThreadId",
  senior: "staffChatSeniorThreadId",
  highStaff: "staffChatHighStaffThreadId",
};

async function getStaffChatThreadIds() {
  const coll = getCollection();
  if (!coll || mongoose.connection?.readyState !== 1) {
    return { pm: null, senior: null, highStaff: null };
  }
  await ensureBucketArrays();
  const doc = await coll.findOne(
    { _counterKey: TICKET_COUNTER_KEY },
    { projection: { staffChatPmThreadId: 1, staffChatSeniorThreadId: 1, staffChatHighStaffThreadId: 1 } },
  );
  const pick = (v) => (v != null && String(v).trim() !== "" ? String(v).trim() : null);
  return {
    pm: pick(doc?.staffChatPmThreadId),
    senior: pick(doc?.staffChatSeniorThreadId),
    highStaff: pick(doc?.staffChatHighStaffThreadId),
  };
}

async function setStaffChatThreadId(key, threadId) {
  const coll = getCollection();
  const field = STAFF_CHAT_THREAD_DB_FIELDS[String(key || "").trim()];
  if (!coll || !field) return;
  await ensureBucketArrays();
  const id = threadId != null && String(threadId).trim() !== "" ? String(threadId).trim() : null;
  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY },
    id ? { $set: { [field]: id } } : { $unset: { [field]: "" } },
  );
}

async function getStaffChatHubMessageId() {
  const coll = getCollection();
  if (!coll || mongoose.connection?.readyState !== 1) return null;
  await ensureBucketArrays();
  const doc = await coll.findOne({ _counterKey: TICKET_COUNTER_KEY }, { projection: { staffChatHubMessageId: 1 } });
  const id = doc?.staffChatHubMessageId;
  return id != null && String(id).trim() !== "" ? String(id).trim() : null;
}

async function setStaffChatHubMessageId(messageId) {
  const coll = getCollection();
  if (!coll) return;
  await ensureBucketArrays();
  const id = messageId != null && String(messageId).trim() !== "" ? String(messageId).trim() : null;
  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY },
    id ? { $set: { staffChatHubMessageId: id } } : { $unset: { staffChatHubMessageId: "" } },
  );
}

const STAFF_CMDS_THREAD_DB_FIELDS = {
  pm: "staffCmdsPmThreadId",
  high: "staffCmdsHighThreadId",
};

async function getStaffCmdsThreadIds() {
  const coll = getCollection();
  if (!coll || mongoose.connection?.readyState !== 1) {
    return { pm: null, high: null };
  }
  await ensureBucketArrays();
  const doc = await coll.findOne(
    { _counterKey: TICKET_COUNTER_KEY },
    { projection: { staffCmdsPmThreadId: 1, staffCmdsHighThreadId: 1 } },
  );
  const pick = (v) => (v != null && String(v).trim() !== "" ? String(v).trim() : null);
  return {
    pm: pick(doc?.staffCmdsPmThreadId),
    high: pick(doc?.staffCmdsHighThreadId),
  };
}

async function setStaffCmdsThreadId(key, threadId) {
  const coll = getCollection();
  const field = STAFF_CMDS_THREAD_DB_FIELDS[String(key || "").trim()];
  if (!coll || !field) return;
  await ensureBucketArrays();
  const id = threadId != null && String(threadId).trim() !== "" ? String(threadId).trim() : null;
  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY },
    id ? { $set: { [field]: id } } : { $unset: { [field]: "" } },
  );
}

async function getStaffCmdsHubMessageId() {
  const coll = getCollection();
  if (!coll || mongoose.connection?.readyState !== 1) return null;
  await ensureBucketArrays();
  const doc = await coll.findOne({ _counterKey: TICKET_COUNTER_KEY }, { projection: { staffCmdsHubMessageId: 1 } });
  const id = doc?.staffCmdsHubMessageId;
  return id != null && String(id).trim() !== "" ? String(id).trim() : null;
}

async function setStaffCmdsHubMessageId(messageId) {
  const coll = getCollection();
  if (!coll) return;
  await ensureBucketArrays();
  const id = messageId != null && String(messageId).trim() !== "" ? String(messageId).trim() : null;
  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY },
    id ? { $set: { staffCmdsHubMessageId: id } } : { $unset: { staffCmdsHubMessageId: "" } },
  );
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
  const payload = {
    Guild: row.Guild,
    Channel: row.Channel,
    Count: row.Count,
    LastUser: row.LastUser,
  };
  // Update posizionale: evita di riscrivere tutto l'array (race tra guild / save concorrenti).
  const updated = await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY, "countschemas.Guild": g },
    { $set: { "countschemas.$": payload } },
  );
  if ((updated?.matchedCount || 0) > 0) return;
  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY },
    { $push: { countschemas: payload } },
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

function readGuildCounterFromDoc(doc, arrayKey, guildId) {
  const g = String(guildId || "");
  const row = (doc?.[arrayKey] || []).find((x) => String(x.guildId) === g);
  return Math.max(0, Number(row?.count || 0));
}

async function seedQuoteCounter(guildId) {
  const legacy = await pullQuoteFromLegacy(guildId);
  if (legacy != null) return legacy;
  return 0;
}

async function seedRepostCounter(guildId) {
  try {
    const { GuildRepost } = require("../../Schemas/Community/repostSchema");
    return Math.max(0, await GuildRepost.countDocuments({ guildId: String(guildId || "") }).maxTimeMS(8000));
  } catch {
    return 0;
  }
}

async function bumpGuildPostCounter(guildId, arrayKey, seedFn, retry = true) {
  const g = String(guildId || "").trim();
  if (!g) throw new Error("invalid guildId");
  const coll = getCollection();
  if (!coll || mongoose.connection?.readyState !== 1) throw new Error("mongodb unavailable");
  await ensureBucketArrays();
  const inc = await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY, [`${arrayKey}.guildId`]: g },
    { $inc: { [`${arrayKey}.$[elem].count`]: 1 } },
    { arrayFilters: [{ "elem.guildId": g }], maxTimeMS: 12000 },
  );
  if (inc.modifiedCount > 0) {
    const doc = await coll.findOne(
      { _counterKey: TICKET_COUNTER_KEY },
      { projection: { [arrayKey]: 1 }, maxTimeMS: 8000 },
    );
    return readGuildCounterFromDoc(doc, arrayKey, g);
  }
  let seed = 0;
  if (typeof seedFn === "function") seed = Math.max(0, Number(await seedFn(g)) || 0);
  const next = seed + 1;
  const inserted = await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY, [`${arrayKey}.guildId`]: { $ne: g } },
    { $push: { [arrayKey]: { guildId: g, count: next } } },
    { maxTimeMS: 12000 },
  );
  if (inserted.modifiedCount > 0) return next;
  if (retry) return bumpGuildPostCounter(guildId, arrayKey, seedFn, false);
  const doc = await coll.findOne(
    { _counterKey: TICKET_COUNTER_KEY },
    { projection: { [arrayKey]: 1 }, maxTimeMS: 8000 },
  );
  return readGuildCounterFromDoc(doc, arrayKey, g) || next;
}

async function decrementGuildPostCounter(guildId, arrayKey) {
  const g = String(guildId || "").trim();
  if (!g) return 0;
  const coll = getCollection();
  if (!coll || mongoose.connection?.readyState !== 1) return 0;
  await ensureBucketArrays();
  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY, [`${arrayKey}.guildId`]: g },
    { $inc: { [`${arrayKey}.$[elem].count`]: -1 } },
    { arrayFilters: [{ "elem.guildId": g }], maxTimeMS: 12000 },
  );
  const doc = await coll.findOne(
    { _counterKey: TICKET_COUNTER_KEY },
    { projection: { [arrayKey]: 1 }, maxTimeMS: 8000 },
  );
  const count = readGuildCounterFromDoc(doc, arrayKey, g);
  if (count < 0) {
    await coll.updateOne(
      { _counterKey: TICKET_COUNTER_KEY, [`${arrayKey}.guildId`]: g },
      { $set: { [`${arrayKey}.$[elem].count`]: 0 } },
      { arrayFilters: [{ "elem.guildId": g }] },
    );
    return 0;
  }
  return count;
}

async function nextQuoteCount(guildId) {
  return bumpGuildPostCounter(guildId, "quotecounts", seedQuoteCounter);
}

async function nextRepostCount(guildId) {
  return bumpGuildPostCounter(guildId, "repostcounts", seedRepostCounter);
}

async function nextClipCount(guildId) {
  return bumpGuildPostCounter(guildId, "clipcounts", async () => 0);
}

async function decrementQuoteCount(guildId) {
  return decrementGuildPostCounter(guildId, "quotecounts");
}

async function decrementRepostCount(guildId) {
  return decrementGuildPostCounter(guildId, "repostcounts");
}

async function decrementClipCount(guildId) {
  return decrementGuildPostCounter(guildId, "clipcounts");
}

async function setGuildPostCounter(guildId, arrayKey, count) {
  const g = String(guildId || "").trim();
  if (!g) throw new Error("invalid guildId");
  const c = Math.max(0, Math.floor(Number(count) || 0));
  const coll = getCollection();
  if (!coll || mongoose.connection?.readyState !== 1) throw new Error("mongodb unavailable");
  await ensureBucketArrays();
  const updated = await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY, [`${arrayKey}.guildId`]: g },
    { $set: { [`${arrayKey}.$[elem].count`]: c } },
    { arrayFilters: [{ "elem.guildId": g }], maxTimeMS: 12000 },
  );
  if (updated.modifiedCount > 0) return c;
  await coll.updateOne(
    { _counterKey: TICKET_COUNTER_KEY, [`${arrayKey}.guildId`]: { $ne: g } },
    { $push: { [arrayKey]: { guildId: g, count: c } } },
    { maxTimeMS: 12000 },
  );
  return c;
}

module.exports = { TICKET_COUNTER_KEY, COUNTER_COLLECTION, LEGACY_QUOTECOUNTS_COLLECTION, LEGACY_COUNTSCHEMAS_COLLECTION, ensureBucketArrays, getCountingConfigFromBucket, nextQuoteCount, nextRepostCount, nextClipCount, decrementQuoteCount, decrementRepostCount, decrementClipCount, setGuildPostCounter, readGuildCounterFromDoc, pingDbLatencyMs, getPartnershipBlacklistEntries, setPartnershipBlacklistEntries, isPartnershipGuildBlacklistedBucket, addPartnershipBlacklistGuildBucket, removePartnershipBlacklistGuildBucket, listPartnershipBlacklistGuildsBucket, getPartnerPmDailyThreadId, setPartnerPmDailyThreadId, getStaffChatThreadIds, setStaffChatThreadId, getStaffChatHubMessageId, setStaffChatHubMessageId, getStaffCmdsThreadIds, setStaffCmdsThreadId, getStaffCmdsHubMessageId, setStaffCmdsHubMessageId };