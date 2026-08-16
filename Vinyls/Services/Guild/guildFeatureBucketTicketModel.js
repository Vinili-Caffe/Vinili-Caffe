const mongoose = require("mongoose");
const {
  GuildFeatureBucket,
  ensureGuildFeatureBucket,
} = require("../../Schemas/Guild/guildFeatureBucketSchema");

let LegacyTicketModel = null;
function getLegacyTicketModel() {
  if (LegacyTicketModel) return LegacyTicketModel;
  if (mongoose.models.LegacyTicketDoc) {
    LegacyTicketModel = mongoose.models.LegacyTicketDoc;
    return LegacyTicketModel;
  }
  // Collection storica `tickets` (pre feature-bucket). Lettura/scrittura duale finché non migrata.
  const schema = new mongoose.Schema(
    {
      ticketNumber: Number,
      guildId: String,
      userId: String,
      channelId: String,
      ticketType: String,
      panelId: String,
      userTag: String,
      open: Boolean,
      claimedBy: String,
      createdAt: Date,
      closedAt: Date,
      closeReason: String,
      closedBy: String,
      descriptionSubmitted: Boolean,
      transcriptViewToken: String,
      transcriptViewExpiresAt: Date,
      transcriptHtmlPath: String,
      hasTranscript: Boolean,
      ratingScore: Number,
    },
    { collection: "tickets", strict: false },
  );
  LegacyTicketModel = mongoose.model("LegacyTicketDoc", schema);
  return LegacyTicketModel;
}

function coerceTicketOpen(value) {
  if (value === true || value === 1 || value === "true" || value === "1") return true;
  if (value === false || value === 0 || value === "false" || value === "0" || value == null) return false;
  return Boolean(value);
}

function legacyMongoFilter(filter) {
  if (!filter || typeof filter !== "object") return null;
  const q = {};
  if (filter._id) q._id = filter._id;
  if (filter.channelId != null) q.channelId = String(filter.channelId);
  if (filter.guildId != null) q.guildId = String(filter.guildId);
  if (filter.userId != null) q.userId = String(filter.userId);
  if (filter.ticketType != null) q.ticketType = String(filter.ticketType);
  if (filter.ticketNumber != null) q.ticketNumber = Number(filter.ticketNumber);
  if (Object.prototype.hasOwnProperty.call(filter, "claimedBy") && !Array.isArray(filter.$or)) {
    q.claimedBy = filter.claimedBy;
  }
  if (filter.open !== undefined) {
    // In legacy i flag open sono boolean; accetta anche 1/0 storici.
    if (coerceTicketOpen(filter.open)) {
      q.open = { $in: [true, 1, "1", "true"] };
    } else {
      q.open = { $in: [false, 0, "0", "false", null] };
    }
  }
  if (filter.transcriptViewToken) {
    q.transcriptViewToken = String(filter.transcriptViewToken);
  }
  return q;
}

async function findLegacyTickets(filter, projection) {
  try {
    const Legacy = getLegacyTicketModel();
    const q = legacyMongoFilter(filter);
    if (!q || !Object.keys(q).length) return [];
    let query = Legacy.find(q);
    if (projection && typeof projection === "object") query = query.select(projection);
    const rows = await query.lean().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    return [];
  }
}

async function findLegacyTicketOne(filter, projection) {
  try {
    const Legacy = getLegacyTicketModel();
    const q = legacyMongoFilter(filter);
    if (!q || !Object.keys(q).length) return null;
    let query = Legacy.findOne(q);
    if (projection && typeof projection === "object") query = query.select(projection);
    return await query.lean().catch(() => null);
  } catch (_) {
    return null;
  }
}

function ticketRowKey(t) {
  if (!t) return "";
  if (t._id) return `id:${String(t._id)}`;
  if (t.channelId) return `ch:${String(t.channelId)}`;
  if (t.ticketNumber != null) return `n:${String(t.ticketNumber)}`;
  return "";
}

function mergeTicketRows(primary, secondary) {
  const out = [];
  const seen = new Set();
  for (const list of [primary || [], secondary || []]) {
    for (const row of list) {
      const key = ticketRowKey(row);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      out.push(row);
    }
  }
  return out;
}

function matchesClaimedByOr(t, filter) {
  if (!Array.isArray(filter.$or) || !filter.$or.length) return true;
  const onlyClaim = filter.$or.every((c) => Object.prototype.hasOwnProperty.call(c, "claimedBy"));
  if (!onlyClaim) return true;
  return filter.$or.some((clause) => {
    if (clause.claimedBy === null || clause.claimedBy === "") {
      return t.claimedBy == null || String(t.claimedBy).trim() === "";
    }
    if (clause.claimedBy?.$exists === false) return t.claimedBy == null;
    return false;
  });
}

function matchesAutoCloseOr(t, filter) {
  if (!Array.isArray(filter.$or) || !filter.$or.length) return true;
  const onlyAuto = filter.$or.every((c) => Object.prototype.hasOwnProperty.call(c, "autoClosePromptSentAt"));
  if (!onlyAuto) return true;
  return filter.$or.some((clause) => {
    if (clause.autoClosePromptSentAt?.$exists === false) return t.autoClosePromptSentAt == null;
    if (clause.autoClosePromptSentAt === null) return t.autoClosePromptSentAt == null;
    return false;
  });
}

function ticketMatchesFilter(t, filter) {
  if (!t || !filter) return false;
  if (filter._id && String(t._id) !== String(filter._id)) return false;
  if (filter.channelId !== undefined && String(t.channelId) !== String(filter.channelId)) return false;
  if (filter.open !== undefined && coerceTicketOpen(t.open) !== coerceTicketOpen(filter.open)) return false;
  if (filter.guildId !== undefined) {
    const docGid = String(t.guildId || "").trim();
    if (docGid && docGid !== String(filter.guildId)) return false;
  }
  if (filter.userId !== undefined && String(t.userId) !== String(filter.userId)) return false;
  if (filter.ticketType !== undefined && String(t.ticketType || "") !== String(filter.ticketType)) return false;
  if (filter.ticketNumber !== undefined && Number(t.ticketNumber) !== Number(filter.ticketNumber)) return false;
  if (Object.prototype.hasOwnProperty.call(filter, "claimedBy") && !Array.isArray(filter.$or)) {
    if (String(t.claimedBy || "") !== String(filter.claimedBy || "")) return false;
  }
  if (Object.prototype.hasOwnProperty.call(filter, "ratingScore")) {
    if (filter.ratingScore === null && t.ratingScore != null) return false;
  }
  if (filter.createdAt?.$lte) {
    const ca = t.createdAt ? new Date(t.createdAt).getTime() : 0;
    if (ca > filter.createdAt.$lte.getTime()) return false;
  }
  if (!matchesClaimedByOr(t, filter)) return false;
  if (!matchesAutoCloseOr(t, filter)) return false;
  return true;
}

function projectTicketFields(row, projection) {
  if (!projection) return row;
  const out = {};
  for (const k of Object.keys(projection)) {
    if (projection[k]) out[k] = row[k];
  }
  return out;
}

function guildFeatureBucketListProjection() {
  // Evita di caricare transcript HTML/testo enormi quando si listano i ticket.
  // NON escludere transcriptHtmlPath: è un path corto e serve ad aprire i transcript in dashboard.
  return {
    "tickets.transcript": 0,
    "tickets.transcriptHtmlInline": 0,
    "tickets.descriptionText": 0,
  };
}

/** Query Mongo su tickets._id: in DB mischiati String e ObjectId. */
function ticketIdMongoQuery(ticketId) {
  const clause = ticketIdArrayFilterClause(ticketId);
  return clause == null || clause === "" ? ticketId : clause;
}

async function findBucketsForTicketFilter(filter) {
  const slim = guildFeatureBucketListProjection();
  if (filter._id) {
    // Native + $elemMatch: evita cast ObjectId e non scarica tutto il bucket (OOM).
    const idQuery = ticketIdMongoQuery(filter._id);
    const raw = await GuildFeatureBucket.collection
      .findOne(
        { "tickets._id": idQuery },
        {
          projection: {
            guildId: 1,
            tickets: { $elemMatch: { _id: idQuery } },
          },
        },
      )
      .catch(() => null);
    if (!raw?.tickets?.length) return [];
    if (filter.guildId != null && String(raw.guildId || "") !== String(filter.guildId)) {
      return [];
    }
    // Projection già limitata a 1 ticket; togli solo body enormi se presenti.
    for (const t of raw.tickets) {
      if (!t || typeof t !== "object") continue;
      delete t.transcript;
      delete t.transcriptHtmlInline;
      delete t.descriptionText;
    }
    return [raw];
  }
  if (filter.channelId) {
    const b = await GuildFeatureBucket.findOne({ "tickets.channelId": String(filter.channelId) })
      .select(slim)
      .catch(() => null);
    return b ? [b] : [];
  }
  if (filter.guildId) {
    const b = await GuildFeatureBucket.findOne({ guildId: String(filter.guildId) })
      .select(slim)
      .catch(() => null);
    return b ? [b] : [];
  }
  return GuildFeatureBucket.find({}).select(slim).catch(() => []);
}

function findTicketSubdocInBucket(bucket, filter) {
  if (!bucket?.tickets) return null;
  return bucket.tickets.find((t) => ticketMatchesFilter(t, filter)) || null;
}

async function resolveTicketRef(filter) {
  const buckets = await findBucketsForTicketFilter(filter);
  for (const bucket of buckets) {
    const t = findTicketSubdocInBucket(bucket, filter);
    if (!t?._id) continue;
    return { bucketId: bucket._id, ticketId: t._id };
  }
  return null;
}

function toTicketSet(update) {
  const $set = update?.$set || {};
  const out = {};
  for (const [key, value] of Object.entries($set)) {
    if (!key) continue;
    out[`tickets.$[t].${key}`] = value;
  }
  return out;
}

function isEmptyClaimedByFilterValue(value) {
  if (value == null) return true;
  if (value?.$exists === false) return true;
  return String(value).trim() === "";
}

/**
 * In DB alcuni ticket._id sono String, altri ObjectId; Mongoose li espone spesso come ObjectId.
 * Gli arrayFilters fanno match tipizzato → senza $in l'update risulta matchedCount:1 / modifiedCount:0.
 */
function ticketIdArrayFilterClause(ticketId) {
  const vals = [];
  const seen = new Set();
  const push = (v) => {
    if (v == null) return;
    const key = `${typeof v}:${String(v)}`;
    if (seen.has(key)) return;
    seen.add(key);
    vals.push(v);
  };
  push(ticketId);
  const s = String(ticketId || "").trim();
  if (s) push(s);
  if (s && mongoose.Types.ObjectId.isValid(s)) {
    try {
      const oid = new mongoose.Types.ObjectId(s);
      if (String(oid) === s) push(oid);
    } catch (_) {
      /* ignore */
    }
  }
  return vals.length <= 1 ? vals[0] : { $in: vals };
}

function buildTicketArrayFilter(filter, ticketId) {
  const arrayFilter = { "t._id": ticketIdArrayFilterClause(ticketId) };
  if (Object.prototype.hasOwnProperty.call(filter, "channelId")) {
    arrayFilter["t.channelId"] = String(filter.channelId);
  }
  // Non mettere `open` nell'arrayFilter: resolveTicketRef già filtra con coerceTicketOpen.
  // Un mismatch di tipo (true vs 1/"true") faceva fallire l'update con modifiedCount:0.
  if (Object.prototype.hasOwnProperty.call(filter, "userId")) {
    arrayFilter["t.userId"] = String(filter.userId);
  }
  if (Object.prototype.hasOwnProperty.call(filter, "ticketNumber")) {
    arrayFilter["t.ticketNumber"] = Number(filter.ticketNumber);
  }
  // claimedBy null/"": usa $in (uguaglianza a null negli arrayFilters è inaffidabile).
  // Claimer Id non vuoto resta uguaglianza stretta (unclaim / takeover condizionale).
  if (Object.prototype.hasOwnProperty.call(filter, "claimedBy")) {
    if (isEmptyClaimedByFilterValue(filter.claimedBy)) {
      arrayFilter["t.claimedBy"] = { $in: [null, ""] };
    } else {
      arrayFilter["t.claimedBy"] = String(filter.claimedBy);
    }
  }
  if (Object.prototype.hasOwnProperty.call(filter, "ratingScore")) {
    arrayFilter["t.ratingScore"] = filter.ratingScore;
  }
  if (Object.prototype.hasOwnProperty.call(filter, "autoClosePromptSentAt")) {
    arrayFilter["t.autoClosePromptSentAt"] = filter.autoClosePromptSentAt;
  }
  if (Array.isArray(filter.$or) && filter.$or.length > 0) {
    const claimOnly = filter.$or.every((c) =>
      Object.prototype.hasOwnProperty.call(c, "claimedBy"),
    );
    const autoCloseOnly = filter.$or.every((c) =>
      Object.prototype.hasOwnProperty.call(c, "autoClosePromptSentAt"),
    );
    if (claimOnly) {
      const hasEmpty = filter.$or.some((clause) => isEmptyClaimedByFilterValue(clause.claimedBy));
      const nonempty = filter.$or.filter((clause) => !isEmptyClaimedByFilterValue(clause.claimedBy));
      if (hasEmpty && nonempty.length === 0) {
        arrayFilter["t.claimedBy"] = { $in: [null, ""] };
      } else if (nonempty.length > 0) {
        arrayFilter.$or = [
          ...(hasEmpty ? [{ "t.claimedBy": { $in: [null, ""] } }] : []),
          ...nonempty.map((clause) => ({ "t.claimedBy": String(clause.claimedBy) })),
        ];
      }
    } else if (autoCloseOnly) {
      arrayFilter.$or = filter.$or.map((clause) => {
        if (clause.autoClosePromptSentAt?.$exists === false) {
          return { "t.autoClosePromptSentAt": { $exists: false } };
        }
        return { "t.autoClosePromptSentAt": clause.autoClosePromptSentAt };
      });
    }
  }
  return arrayFilter;
}

function ticketFieldFromSetKey(setKey) {
  const prefix = "tickets.$[t].";
  return String(setKey || "").startsWith(prefix) ? String(setKey).slice(prefix.length) : String(setKey || "");
}

function ticketReflectsDesiredSet(ticket, $set) {
  if (!ticket || !$set) return false;
  for (const [setKey, desired] of Object.entries($set)) {
    const field = ticketFieldFromSetKey(setKey);
    if (!field) continue;
    const current = ticket[field];
    if (desired == null) {
      if (current != null && String(current).trim() !== "") return false;
      continue;
    }
    if (desired instanceof Date || current instanceof Date) {
      const a = current ? new Date(current).getTime() : NaN;
      const b = new Date(desired).getTime();
      if (!(Number.isFinite(a) && Number.isFinite(b) && a === b)) return false;
      continue;
    }
    if (typeof desired === "boolean" || typeof current === "boolean") {
      if (Boolean(current) !== Boolean(desired)) return false;
      continue;
    }
    if (String(current ?? "") !== String(desired)) return false;
  }
  return true;
}

async function readTicketByRef(bucketId, ticketId) {
  const fresh = await GuildFeatureBucket.findById(bucketId).catch(() => null);
  if (!fresh?.tickets) return null;
  return (
    fresh.tickets.id(ticketId) ||
    fresh.tickets.find((t) => String(t?._id) === String(ticketId)) ||
    null
  );
}

function isBsonDocTooLargeError(err) {
  const msg = String(err?.message || err || "");
  return /16777216|larger than/i.test(msg);
}

/** Cap aggressivo: i ticket condividono un solo documento Mongo da max 16MB. */
const TRANSCRIPT_TXT_COMPACT_MAX = 2_000;

function compactTicketTranscriptFields(ticket) {
  if (!ticket || typeof ticket !== "object") return ticket;
  const next = ticket.toObject ? ticket.toObject() : { ...ticket };
  next.transcriptHtmlInline = null;
  if (typeof next.transcript === "string" && next.transcript.length > TRANSCRIPT_TXT_COMPACT_MAX) {
    next.transcript = `${next.transcript.slice(0, TRANSCRIPT_TXT_COMPACT_MAX)}\n…[troncato]`;
  }
  // descriptionText può gonfiare: tieni un tetto ragionevole.
  if (typeof next.descriptionText === "string" && next.descriptionText.length > 4_000) {
    next.descriptionText = `${next.descriptionText.slice(0, 4_000)}\n…[troncato]`;
  }
  return next;
}

/**
 * Sgonfia TUTTI i ticket del bucket (HTML inline storici + transcript enormi).
 * Necessario quando il documento è già vicino/oltre i 16MB: lo slim sul singolo ticket non basta.
 */
async function compactBucketTicketBloat(bucketId) {
  const col = GuildFeatureBucket.collection;
  const raw = await col.findOne(
    { _id: bucketId },
    { projection: { tickets: 1 } },
  ).catch((err) => {
    global.logger?.warn?.("[Ticket.compactBucket.read]", err?.message || err);
    return null;
  });
  if (!raw || !Array.isArray(raw.tickets) || !raw.tickets.length) return false;

  let changed = false;
  const tickets = raw.tickets.map((t) => {
    const beforeInline = typeof t.transcriptHtmlInline === "string" ? t.transcriptHtmlInline.length : 0;
    const beforeTxt = typeof t.transcript === "string" ? t.transcript.length : 0;
    const next = compactTicketTranscriptFields(t);
    if (
      beforeInline > 0 ||
      beforeTxt > TRANSCRIPT_TXT_COMPACT_MAX ||
      (typeof t.descriptionText === "string" && t.descriptionText.length > 4_000)
    ) {
      changed = true;
    }
    return next;
  });
  if (!changed) return false;

  const res = await col
    .updateOne({ _id: bucketId }, { $set: { tickets } })
    .catch((err) => {
      global.logger?.warn?.("[Ticket.compactBucket.write]", err?.message || err);
      return null;
    });
  if (!res) return false;
  global.logger?.warn?.(
    `[Ticket.compactBucket] bucket=${String(bucketId)} tickets=${tickets.length} modified=${Number(res.modifiedCount || 0)}`,
  );
  return Number(res.modifiedCount || 0) > 0;
}

function slimTicketSetForBsonLimit($set) {
  const out = { ...$set };
  for (const key of Object.keys(out)) {
    if (key.endsWith(".transcriptHtmlInline")) out[key] = null;
    if (key.endsWith(".transcript") && typeof out[key] === "string" && out[key].length > TRANSCRIPT_TXT_COMPACT_MAX) {
      out[key] = `${out[key].slice(0, TRANSCRIPT_TXT_COMPACT_MAX)}\n…[troncato]`;
    }
    if (key.endsWith(".descriptionText") && typeof out[key] === "string" && out[key].length > 4_000) {
      out[key] = `${out[key].slice(0, 4_000)}\n…[troncato]`;
    }
  }
  return out;
}

async function updateBucketTicketSet(bucketId, $set, arrayFilter) {
  // Native collection: evita casting Mongoose su arrayFilters (es. claimedBy:null).
  const tryUpdate = async (payload) =>
    GuildFeatureBucket.collection
      .updateOne({ _id: bucketId }, { $set: payload }, { arrayFilters: [arrayFilter] })
      .catch((err) => {
        if (isBsonDocTooLargeError(err)) return { __bsonTooLarge: true, __err: err };
        global.logger?.warn?.("[Ticket.findOneAndUpdate]", err?.message || err);
        return null;
      });

  let result = await tryUpdate($set);
  if (!result?.__bsonTooLarge) return result;

  global.logger?.warn?.("[Ticket.findOneAndUpdate]", result.__err?.message || result.__err);

  // 1) Slim solo i campi di questo update
  const slim = slimTicketSetForBsonLimit($set);
  result = await tryUpdate(slim);
  if (!result?.__bsonTooLarge) return result;
  global.logger?.warn?.("[Ticket.findOneAndUpdate.slim]", result.__err?.message || result.__err);

  // 2) Compattazione bucket-wide (HTML inline storici) poi retry
  await compactBucketTicketBloat(bucketId);
  result = await tryUpdate(slim);
  if (!result?.__bsonTooLarge) return result;
  global.logger?.warn?.("[Ticket.findOneAndUpdate.afterCompact]", result.__err?.message || result.__err);

  // 3) Solo metadati (niente transcript body)
  const metaOnly = {};
  for (const [k, v] of Object.entries(slim)) {
    if (k.endsWith(".transcript") || k.endsWith(".transcriptHtmlInline")) {
      metaOnly[k] = k.endsWith(".transcriptHtmlInline") ? null : "";
      continue;
    }
    metaOnly[k] = v;
  }
  result = await tryUpdate(metaOnly);
  if (!result?.__bsonTooLarge) return result;
  global.logger?.warn?.("[Ticket.findOneAndUpdate.meta]", result.__err?.message || result.__err);

  // 4) Ultimo tentativo: ricompact + meta
  await compactBucketTicketBloat(bucketId);
  result = await tryUpdate(metaOnly);
  if (result?.__bsonTooLarge) {
    global.logger?.warn?.("[Ticket.findOneAndUpdate.meta.afterCompact]", result.__err?.message || result.__err);
    return null;
  }
  return result;
}

async function execTicketFindAllBuckets(query) {
  const all = await GuildFeatureBucket.find({}).select(guildFeatureBucketListProjection()).catch(() => []);
  const rows = [];
  for (const bucket of all) {
    for (const t of bucket.tickets || []) {
      if (!ticketMatchesFilter(t, query.filter)) continue;
      if (query._lean) {
        const o = t.toObject ? t.toObject() : { ...t };
        rows.push(projectTicketFields(o, query.projection));
      } else {
        rows.push(t);
      }
      if (query._limit != null && rows.length >= query._limit) return rows;
    }
  }
  return rows;
}

class TicketFindQuery {
  constructor(filter, projection) {
    this.filter = filter;
    this.projection = projection && typeof projection === "object" ? { ...projection } : null;
    this._limit = null;
    this._lean = false;
  }

  select(fields) {
    if (fields == null) return this;
    const proj = {};
    if (typeof fields === "string") {
      for (const k of String(fields).split(/\s+/)) {
        const key = k.trim();
        if (key) proj[key] = 1;
      }
    } else if (typeof fields === "object" && !Array.isArray(fields)) {
      Object.assign(proj, fields);
    }
    this.projection = { ...(this.projection || {}), ...proj };
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  async exec() {
    const f = this.filter || {};
    if (f && typeof f === "object" && Array.isArray(f.$or) && f.$or.length) {
      const bucketRows = await execTicketFindAllBuckets(this);
      const legacyRows = await findLegacyTickets(f, this.projection);
      const merged = mergeTicketRows(
        Array.isArray(bucketRows) ? bucketRows : [],
        (legacyRows || []).map((o) => projectTicketFields(o, this.projection)),
      );
      if (this._limit != null && merged.length > this._limit) return merged.slice(0, this._limit);
      return merged;
    }
    const gid = f.guildId != null ? String(f.guildId) : "";
    if (gid) {
      const bucket = await GuildFeatureBucket.findOne({ guildId: gid })
        .select(guildFeatureBucketListProjection())
        .catch(() => null);
      const rows = [];
      for (const t of bucket?.tickets || []) {
        if (!ticketMatchesFilter(t, f)) continue;
        if (this._lean) {
          const o = t.toObject ? t.toObject() : { ...t };
          rows.push(projectTicketFields(o, this.projection));
        } else {
          rows.push(t);
        }
      }
      const legacyRows = await findLegacyTickets(f, this.projection);
      const projectedLegacy = (legacyRows || []).map((o) =>
        this._lean || this.projection ? projectTicketFields(o, this.projection) : o,
      );
      let merged = mergeTicketRows(rows, projectedLegacy);
      if (Object.prototype.hasOwnProperty.call(f, "open") && f.open === false && merged.length > 1) {
        merged.sort((a, b) => {
          const ta = a.closedAt ? new Date(a.closedAt).getTime() : a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const tb = b.closedAt ? new Date(b.closedAt).getTime() : b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return tb - ta;
        });
      }
      if (this._limit != null && merged.length > this._limit) {
        return merged.slice(0, this._limit);
      }
      return merged;
    }
    return execTicketFindAllBuckets(this);
  }

  then(onFulfilled, onRejected) {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.exec().catch(onRejected);
  }
}

class TicketFindOneQuery {
  constructor(filter, projection) {
    this.filter = filter;
    this.projection = projection && typeof projection === "object" ? { ...projection } : null;
    this._lean = false;
  }

  select(fields) {
    if (fields == null) return this;
    const proj = {};
    if (typeof fields === "string") {
      for (const k of String(fields).split(/\s+/)) {
        const key = k.trim();
        if (key) proj[key] = 1;
      }
    } else if (typeof fields === "object" && !Array.isArray(fields)) {
      Object.assign(proj, fields);
    }
    this.projection = { ...(this.projection || {}), ...proj };
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  async exec() {
    const buckets = await findBucketsForTicketFilter(this.filter);
    for (const bucket of buckets) {
      const t = findTicketSubdocInBucket(bucket, this.filter);
      if (!t) continue;
      if (this._lean) {
        const o = t.toObject ? t.toObject() : { ...t };
        return projectTicketFields(o, this.projection);
      }
      return t;
    }
    const legacy = await findLegacyTicketOne(this.filter, this.projection);
    if (!legacy) return null;
    return this._lean || this.projection ? projectTicketFields(legacy, this.projection) : legacy;
  }

  then(onFulfilled, onRejected) {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.exec().catch(onRejected);
  }
}

const Ticket = {
  findById(id) {
    const idQuery = ticketIdMongoQuery(id);
    if (idQuery == null || idQuery === "") return Promise.resolve(null);
    // Native + $elemMatch: non caricare l'intero bucket (OOM / 16MB).
    return GuildFeatureBucket.collection
      .findOne(
        { "tickets._id": idQuery },
        { projection: { guildId: 1, tickets: { $elemMatch: { _id: idQuery } } } },
      )
      .then(async (bucket) => {
        if (bucket?.tickets?.length) {
          const sid = String(id);
          const hit =
            bucket.tickets.find((t) => String(t?._id) === sid) || bucket.tickets[0] || null;
          if (hit) {
            hit.guildId = String(hit.guildId || bucket.guildId || "").trim();
            return hit;
          }
        }
        // Fallback: $elemMatch con ObjectId puro a volte non matcha String _id (e viceversa).
        const raw = await GuildFeatureBucket.collection
          .findOne({ "tickets._id": idQuery }, { projection: { guildId: 1, "tickets._id": 1 } })
          .catch(() => null);
        if (raw?.tickets?.length) {
          const sid = String(id);
          const idx = raw.tickets.findIndex((t) => String(t?._id) === sid);
          if (idx >= 0) {
            const full = await GuildFeatureBucket.collection
              .findOne(
                { _id: raw._id },
                { projection: { guildId: 1, [`tickets.${idx}`]: 1 } },
              )
              .catch(() => null);
            const hit2 = full?.tickets?.[idx] || null;
            if (hit2) {
              hit2.guildId = String(hit2.guildId || full.guildId || "").trim();
              return hit2;
            }
          }
        }
        try {
          const Legacy = getLegacyTicketModel();
          return await Legacy.findById(id).lean().catch(() => null);
        } catch (_) {
          return null;
        }
      })
      .catch(() => null);
  },

  findOneByTranscriptViewToken(token) {
    const t = String(token || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(t)) return Promise.resolve(null);
    // Native + $elemMatch: solo il ticket col token (il bucket intero fa OOM → 404).
    return GuildFeatureBucket.collection
      .findOne(
        { "tickets.transcriptViewToken": t },
        { projection: { guildId: 1, tickets: { $elemMatch: { transcriptViewToken: t } } } },
      )
      .then(async (bucket) => {
        if (bucket?.tickets?.length) {
          const sub =
            bucket.tickets.find((x) => String(x.transcriptViewToken || "").toLowerCase() === t) ||
            bucket.tickets[0];
          if (sub) {
            const plain = { ...sub };
            plain.guildId = String(plain.guildId || bucket.guildId || "").trim();
            return plain;
          }
        }
        return findLegacyTicketOne({ transcriptViewToken: t });
      })
      .catch(() => findLegacyTicketOne({ transcriptViewToken: t }));
  },

  findOne(filter, projection) {
    if (!filter || typeof filter !== "object") return Promise.resolve(null);
    return new TicketFindOneQuery(filter, projection);
  },

  find(filter, projection) {
    return new TicketFindQuery(filter, projection);
  },

  async findOneAndUpdate(filter, update, opts = {}) {
    const ref = await resolveTicketRef(filter);
    if (!ref) {
      // Fallback collection legacy `tickets`.
      try {
        const Legacy = getLegacyTicketModel();
        const doc = await Legacy.findOneAndUpdate(filter, update, {
          new: opts.new !== false,
          lean: true,
        }).catch(() => null);
        return doc;
      } catch (_) {
        return null;
      }
    }
    const $set = toTicketSet(update);
    if (!Object.keys($set).length) {
      return opts.new !== false ? readTicketByRef(ref.bucketId, ref.ticketId) : null;
    }
    const arrayFilter = buildTicketArrayFilter(filter, ref.ticketId);
    let result = await updateBucketTicketSet(ref.bucketId, $set, arrayFilter);
    // matchedCount può essere 1 anche se arrayFilters non hanno matchato nulla.
    if (result && Number(result.modifiedCount || 0) < 1) {
      const current = await readTicketByRef(ref.bucketId, ref.ticketId);
      if (current && ticketReflectsDesiredSet(current, $set)) {
        // Idempotente: valore già allineato.
        return opts.new !== false ? current : null;
      }
      if (filter.open === true && current && coerceTicketOpen(current.open) !== true) {
        // Condizione open:true non più vera (race): fallisce come un update condizionale.
        return null;
      }
      // Retry forzato sull'_id (string|ObjectId) + fallback channelId.
      result = await updateBucketTicketSet(ref.bucketId, $set, {
        "t._id": ticketIdArrayFilterClause(ref.ticketId),
      });
      if (result && Number(result.modifiedCount || 0) < 1 && filter.channelId) {
        result = await updateBucketTicketSet(ref.bucketId, $set, {
          "t.channelId": String(filter.channelId),
        });
      }
    }
    if (!result || (Number(result.modifiedCount || 0) < 1 && Number(result.matchedCount || 0) < 1)) {
      const current = await readTicketByRef(ref.bucketId, ref.ticketId);
      if (current && ticketReflectsDesiredSet(current, $set)) {
        return opts.new !== false ? current : null;
      }
      return null;
    }
    const fresh = opts.new !== false ? await readTicketByRef(ref.bucketId, ref.ticketId) : null;
    if (opts.new !== false) {
      if (!fresh) return null;
      // matchedCount parent ≠ update applicato: non restituire doc stale come successo.
      if (!ticketReflectsDesiredSet(fresh, $set)) {
        let forced = await updateBucketTicketSet(ref.bucketId, $set, {
          "t._id": ticketIdArrayFilterClause(ref.ticketId),
        });
        if (forced && Number(forced.modifiedCount || 0) < 1 && filter.channelId) {
          forced = await updateBucketTicketSet(ref.bucketId, $set, {
            "t.channelId": String(filter.channelId),
          });
        }
        const again = await readTicketByRef(ref.bucketId, ref.ticketId);
        if (again && ticketReflectsDesiredSet(again, $set)) return again;
        if (forced && Number(forced.modifiedCount || 0) > 0 && again) return again;
        global.logger?.warn?.(
          `[Ticket.findOneAndUpdate] $set non persistito ticket=${String(ref.ticketId)} keys=${Object.keys($set).join(",")}`,
        );
        return null;
      }
      return fresh;
    }
    return null;
  },

  async updateOne(filter, update) {
    // Stesso path resilient di findOneAndUpdate (retry id string|ObjectId, slim BSON).
    // Prima era un update "thin" → matchedCount:1/modifiedCount:0 silenzioso (es. auto-close spam).
    const doc = await this.findOneAndUpdate(filter, update, { new: true });
    if (!doc) return { modifiedCount: 0, matchedCount: 0 };
    return { modifiedCount: 1, matchedCount: 1 };
  },

  async create(payload) {
    const guildId = String(payload.guildId || "");
    if (!guildId) throw new Error("Ticket.create: guildId required");
    await ensureGuildFeatureBucket(guildId);
    const { guildId: _g, ...rest } = payload;
    const ticketId = new mongoose.Types.ObjectId();
    await GuildFeatureBucket.updateOne(
      { guildId },
      { $push: { tickets: { ...rest, _id: ticketId } } },
    );
    return Ticket.findById(ticketId);
  },
};

module.exports = Ticket;
module.exports.Ticket = Ticket;