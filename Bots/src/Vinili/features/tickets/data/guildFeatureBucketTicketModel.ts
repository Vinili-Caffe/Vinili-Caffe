const mongoose = require("mongoose") as typeof import("mongoose");
const {
  GuildFeatureBucket,
  ensureGuildFeatureBucket,
} = require("../../../Schemas/Guild/guildFeatureBucketSchema") as typeof import("../../../Schemas/Guild/guildFeatureBucketSchema");

let LegacyTicketModel = null;
function getLegacyTicketModel() {
  if (LegacyTicketModel) return LegacyTicketModel;
  if (mongoose.models.LegacyTicketDoc) {
    LegacyTicketModel = mongoose.models.LegacyTicketDoc;
    return LegacyTicketModel;
  }
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

function coerceTicketOpen(value?) {
  if (value === true || value === 1 || value === "true" || value === "1") return true;
  if (value === false || value === 0 || value === "false" || value === "0" || value == null) return false;
  return Boolean(value);
}

function legacyMongoFilter(filter?) {
  if (!filter || typeof filter !== "object") return null;
  const q: Record<string, any> = {};
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

async function findLegacyTickets(filter?, projection?) {
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

async function findLegacyTicketOne(filter?, projection?) {
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

function ticketRowKey(t?) {
  if (!t) return "";
  if (t._id) return `id:${String(t._id)}`;
  if (t.channelId) return `ch:${String(t.channelId)}`;
  if (t.ticketNumber != null) return `n:${String(t.ticketNumber)}`;
  return "";
}

function mergeTicketRows(primary?, secondary?) {
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

function matchesClaimedByOr(t?, filter?) {
  if (!Array.isArray(filter.$or) || !filter.$or.length) return true;
  const onlyClaim = filter.$or.every((c?) => Object.prototype.hasOwnProperty.call(c, "claimedBy"));
  if (!onlyClaim) return true;
  return filter.$or.some((clause?) => {
    if (clause.claimedBy === null || clause.claimedBy === "") {
      return t.claimedBy == null || String(t.claimedBy).trim() === "";
    }
    if (clause.claimedBy?.$exists === false) return t.claimedBy == null;
    return false;
  });
}

function matchesAutoCloseOr(t?, filter?) {
  if (!Array.isArray(filter.$or) || !filter.$or.length) return true;
  const onlyAuto = filter.$or.every((c?) => Object.prototype.hasOwnProperty.call(c, "autoClosePromptSentAt"));
  if (!onlyAuto) return true;
  return filter.$or.some((clause?) => {
    if (clause.autoClosePromptSentAt?.$exists === false) return t.autoClosePromptSentAt == null;
    if (clause.autoClosePromptSentAt === null) return t.autoClosePromptSentAt == null;
    return false;
  });
}

function ticketMatchesFilter(t?, filter?) {
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

function projectTicketFields(row?, projection?) {
  if (!projection) return row;
  const out: Record<string, any> = {};
  for (const k of Object.keys(projection)) {
    if (projection[k]) out[k] = row[k];
  }
  return out;
}

function guildFeatureBucketListProjection() {
      return {
    "tickets.transcript": 0,
    "tickets.transcriptHtmlInline": 0,
    "tickets.descriptionText": 0,
  };
}

function ticketIdMongoQuery(ticketId?) {
  const clause = ticketIdArrayFilterClause(ticketId);
  return clause == null || clause === "" ? ticketId : clause;
}

async function findBucketsForTicketFilter(filter?) {
  const slim = guildFeatureBucketListProjection();
  if (filter._id) {
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

function findTicketSubdocInBucket(bucket?, filter?) {
  if (!bucket?.tickets) return null;
  return bucket.tickets.find((t?) => ticketMatchesFilter(t, filter)) || null;
}

async function resolveTicketRef(filter?) {
  const buckets = await findBucketsForTicketFilter(filter);
  for (const bucket of buckets) {
    const t = findTicketSubdocInBucket(bucket, filter);
    if (!t?._id) continue;
    return { bucketId: bucket._id, ticketId: t._id };
  }
  return null;
}

function toTicketSet(update?) {
  const $set = update?.$set || {};
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries($set)) {
    if (!key) continue;
    out[`tickets.$[t].${key}`] = value;
  }
  return out;
}

function isEmptyClaimedByFilterValue(value?) {
  if (value == null) return true;
  if (value?.$exists === false) return true;
  return String(value).trim() === "";
}

function ticketIdArrayFilterClause(ticketId?) {
  const vals = [];
  const seen = new Set();
  const push = (v?) => {
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
          }
  }
  return vals.length <= 1 ? vals[0] : { $in: vals };
}

function buildTicketArrayFilter(filter?, ticketId?) {
  const arrayFilter: Record<string, any> = { "t._id": ticketIdArrayFilterClause(ticketId) };
  if (Object.prototype.hasOwnProperty.call(filter, "channelId")) {
    arrayFilter["t.channelId"] = String(filter.channelId);
  }
      if (Object.prototype.hasOwnProperty.call(filter, "userId")) {
    arrayFilter["t.userId"] = String(filter.userId);
  }
  if (Object.prototype.hasOwnProperty.call(filter, "ticketNumber")) {
    arrayFilter["t.ticketNumber"] = Number(filter.ticketNumber);
  }
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
    const claimOnly = filter.$or.every((c?) =>
      Object.prototype.hasOwnProperty.call(c, "claimedBy"),
    );
    const autoCloseOnly = filter.$or.every((c?) =>
      Object.prototype.hasOwnProperty.call(c, "autoClosePromptSentAt"),
    );
    if (claimOnly) {
      const hasEmpty = filter.$or.some((clause?) => isEmptyClaimedByFilterValue(clause.claimedBy));
      const nonempty = filter.$or.filter((clause?) => !isEmptyClaimedByFilterValue(clause.claimedBy));
      if (hasEmpty && nonempty.length === 0) {
        arrayFilter["t.claimedBy"] = { $in: [null, ""] };
      } else if (nonempty.length > 0) {
        arrayFilter.$or = [
          ...(hasEmpty ? [{ "t.claimedBy": { $in: [null, ""] } }] : []),
          ...nonempty.map((clause?) => ({ "t.claimedBy": String(clause.claimedBy) })),
        ];
      }
    } else if (autoCloseOnly) {
      arrayFilter.$or = filter.$or.map((clause?) => {
        if (clause.autoClosePromptSentAt?.$exists === false) {
          return { "t.autoClosePromptSentAt": { $exists: false } };
        }
        return { "t.autoClosePromptSentAt": clause.autoClosePromptSentAt };
      });
    }
  }
  return arrayFilter;
}

function ticketFieldFromSetKey(setKey?) {
  const prefix = "tickets.$[t].";
  return String(setKey || "").startsWith(prefix) ? String(setKey).slice(prefix.length) : String(setKey || "");
}

function fieldValueMatches(current?, desired?) {
  if (desired == null) {
    return current == null || String(current).trim() === "";
  }
  if (desired instanceof Date || current instanceof Date) {
    const a = current ? new Date(current).getTime() : NaN;
    const b = new Date(desired).getTime();
    return Number.isFinite(a) && Number.isFinite(b) && a === b;
  }
  if (typeof desired === "boolean" || typeof current === "boolean") {
    return Boolean(current) === Boolean(desired);
  }
  return String(current ?? "") === String(desired);
}

function ticketReflectsDesiredSet(ticket?, $set?) {
  if (!ticket || !$set) return false;
  for (const [setKey, desired] of Object.entries($set)) {
    const field = ticketFieldFromSetKey(setKey);
    if (!field) continue;
    if (!fieldValueMatches(ticket[field], desired)) return false;
  }
  return true;
}

function ticketReflectsTranscriptCloseSet($set?, ticket?) {
  if (!ticket || !$set) return false;
  const desired: Record<string, any> = {};
  for (const [setKey, value] of Object.entries($set)) {
    const field = ticketFieldFromSetKey(setKey);
    if (field) desired[field] = value;
  }
  const transcriptKeys = [
    "transcript",
    "transcriptHtmlPath",
    "transcriptViewToken",
    "transcriptHtmlInline",
    "transcriptViewExpiresAt",
    "hasTranscript",
    "userTag",
  ];
  if (!transcriptKeys.some((k?) => Object.prototype.hasOwnProperty.call(desired, k))) return false;

  for (const field of ["transcriptHtmlPath", "transcriptViewToken", "transcriptViewExpiresAt", "hasTranscript", "userTag"]) {
    if (!Object.prototype.hasOwnProperty.call(desired, field)) continue;
    if (!fieldValueMatches(ticket[field], desired[field])) return false;
  }

  if (Object.prototype.hasOwnProperty.call(desired, "transcriptHtmlInline")) {
    const want = desired.transcriptHtmlInline;
    const got = ticket.transcriptHtmlInline;
    if (want == null || want === "") {
      if (got != null && String(got).trim() !== "") return false;
    } else if (!fieldValueMatches(got, want)) {
      return false;
    }
  }

  if (Object.prototype.hasOwnProperty.call(desired, "transcript")) {
    const want = String(desired.transcript ?? "");
    const got = String(ticket.transcript ?? "");
    if (want && got !== want) {
      const hasFileMeta =
        String(ticket.transcriptHtmlPath || "").trim() &&
        String(desired.transcriptHtmlPath || "").trim() &&
        String(ticket.transcriptHtmlPath) === String(desired.transcriptHtmlPath);
      const hasTokenMeta =
        String(ticket.transcriptViewToken || "").trim() &&
        String(desired.transcriptViewToken || "").trim() &&
        String(ticket.transcriptViewToken).toLowerCase() === String(desired.transcriptViewToken).toLowerCase();
      if (!(hasFileMeta || hasTokenMeta)) return false;
    }
  }

  const wantsTranscript = Boolean(
    String(desired.transcriptHtmlPath || "").trim() ||
      String(desired.transcriptViewToken || "").trim() ||
      String(desired.transcript || "").trim() ||
      desired.hasTranscript,
  );
  if (!wantsTranscript) return false;
  return Boolean(
    String(ticket.transcriptHtmlPath || "").trim() ||
      String(ticket.transcriptViewToken || "").trim() ||
      String(ticket.transcript || "").trim() ||
      ticket.hasTranscript,
  );
}

function ticketUpdateSatisfied(ticket?, $set?) {
  return ticketReflectsDesiredSet(ticket, $set) || ticketReflectsTranscriptCloseSet($set, ticket);
}

async function readTicketByRef(bucketId?, ticketId?) {
  const idQuery = ticketIdMongoQuery(ticketId);
  const raw = await GuildFeatureBucket.collection
    .findOne(
      { _id: bucketId, "tickets._id": idQuery },
      { projection: { guildId: 1, tickets: { $elemMatch: { _id: idQuery } } } },
    )
    .catch(() => null);
  if (raw?.tickets?.length) {
    const hit =
      raw.tickets.find((t?) => String(t?._id) === String(ticketId)) || raw.tickets[0];
    if (hit) {
      const plain = { ...hit };
      plain.guildId = String(plain.guildId || raw.guildId || "").trim();
      return plain;
    }
  }
  const fresh = await GuildFeatureBucket.findById(bucketId).catch(() => null);
  if (!fresh?.tickets) return null;
  return (
    fresh.tickets.id(ticketId) ||
    fresh.tickets.find((t?) => String(t?._id) === String(ticketId)) ||
    null
  );
}

function isBsonDocTooLargeError(err?) {
  const msg = String(err?.message || err || "");
  return /16777216|larger than/i.test(msg);
}

const TRANSCRIPT_TXT_COMPACT_MAX = 2_000;

function compactTicketTranscriptFields(ticket?) {
  if (!ticket || typeof ticket !== "object") return ticket;
  const next = ticket.toObject ? ticket.toObject() : { ...ticket };
  next.transcriptHtmlInline = null;
  if (typeof next.transcript === "string" && next.transcript.length > TRANSCRIPT_TXT_COMPACT_MAX) {
    next.transcript = `${next.transcript.slice(0, TRANSCRIPT_TXT_COMPACT_MAX)}\n…[troncato]`;
  }
    if (typeof next.descriptionText === "string" && next.descriptionText.length > 4_000) {
    next.descriptionText = `${next.descriptionText.slice(0, 4_000)}\n…[troncato]`;
  }
  return next;
}

async function compactBucketTicketBloat(bucketId?) {
  const col = GuildFeatureBucket.collection;
  const raw = await col.findOne(
    { _id: bucketId },
    { projection: { tickets: 1 } },
  ).catch((err?) => {
    global.logger?.warn?.("[Ticket.compactBucket.read]", err?.message || err);
    return null;
  });
  if (!raw || !Array.isArray(raw.tickets) || !raw.tickets.length) return false;

  let changed = false;
  const tickets = raw.tickets.map((t?) => {
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
    .catch((err?) => {
      global.logger?.warn?.("[Ticket.compactBucket.write]", err?.message || err);
      return null;
    });
  if (!res) return false;
  global.logger?.warn?.(
    `[Ticket.compactBucket] bucket=${String(bucketId)} tickets=${tickets.length} modified=${Number(res.modifiedCount || 0)}`,
  );
  return Number(res.modifiedCount || 0) > 0;
}

function slimTicketSetForBsonLimit($set?) {
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

async function updateBucketTicketSet(bucketId?, $set?, arrayFilter?) {
    const tryUpdate = async (payload?) =>
    GuildFeatureBucket.collection
      .updateOne({ _id: bucketId }, { $set: payload }, { arrayFilters: [arrayFilter] })
      .catch((err?) => {
        if (isBsonDocTooLargeError(err)) return { __bsonTooLarge: true, __err: err };
        global.logger?.warn?.("[Ticket.findOneAndUpdate]", err?.message || err);
        return null;
      });

  let result: any = await tryUpdate($set);
  if (!result?.__bsonTooLarge) return result;

  global.logger?.warn?.("[Ticket.findOneAndUpdate]", result.__err?.message || result.__err);

    const slim = slimTicketSetForBsonLimit($set);
  result = await tryUpdate(slim);
  if (!result?.__bsonTooLarge) return result;
  global.logger?.warn?.("[Ticket.findOneAndUpdate.slim]", result.__err?.message || result.__err);

    await compactBucketTicketBloat(bucketId);
  result = await tryUpdate(slim);
  if (!result?.__bsonTooLarge) return result;
  global.logger?.warn?.("[Ticket.findOneAndUpdate.afterCompact]", result.__err?.message || result.__err);

    const metaOnly: Record<string, any> = {};
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

    await compactBucketTicketBloat(bucketId);
  result = await tryUpdate(metaOnly);
  if (result?.__bsonTooLarge) {
    global.logger?.warn?.("[Ticket.findOneAndUpdate.meta.afterCompact]", result.__err?.message || result.__err);
    return null;
  }
  return result;
}

async function execTicketFindAllBuckets(query?) {
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
  declare _lean: any;
  declare _limit: any;
  declare filter: any;
  declare projection: any;
  constructor(filter?, projection?) {
    this.filter = filter;
    this.projection = projection && typeof projection === "object" ? { ...projection } : null;
    this._limit = null;
    this._lean = false;
  }

  select(fields?) {
    if (fields == null) return this;
    const proj: Record<string, any> = {};
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

  limit(n?) {
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
        (legacyRows || []).map((o?) => projectTicketFields(o, this.projection)),
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
      const projectedLegacy = (legacyRows || []).map((o?) =>
        this._lean || this.projection ? projectTicketFields(o, this.projection) : o,
      );
      let merged = mergeTicketRows(rows, projectedLegacy);
      if (Object.prototype.hasOwnProperty.call(f, "open") && f.open === false && merged.length > 1) {
        merged.sort((a?, b?) => {
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

  then(onFulfilled?, onRejected?) {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch(onRejected?) {
    return this.exec().catch(onRejected);
  }
}

class TicketFindOneQuery {
  declare _lean: any;
  declare filter: any;
  declare projection: any;
  constructor(filter?, projection?) {
    this.filter = filter;
    this.projection = projection && typeof projection === "object" ? { ...projection } : null;
    this._lean = false;
  }

  select(fields?) {
    if (fields == null) return this;
    const proj: Record<string, any> = {};
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

  then(onFulfilled?, onRejected?) {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch(onRejected?) {
    return this.exec().catch(onRejected);
  }
}

const Ticket = {
  findById(id?) {
    const idQuery = ticketIdMongoQuery(id);
    if (idQuery == null || idQuery === "") return Promise.resolve(null);
        return GuildFeatureBucket.collection
      .findOne(
        { "tickets._id": idQuery },
        { projection: { guildId: 1, tickets: { $elemMatch: { _id: idQuery } } } },
      )
      .then(async (bucket?) => {
        if (bucket?.tickets?.length) {
          const sid = String(id);
          const hit =
            bucket.tickets.find((t?) => String(t?._id) === sid) || bucket.tickets[0] || null;
          if (hit) {
            hit.guildId = String(hit.guildId || bucket.guildId || "").trim();
            return hit;
          }
        }
                const raw = await GuildFeatureBucket.collection
          .findOne({ "tickets._id": idQuery }, { projection: { guildId: 1, "tickets._id": 1 } })
          .catch(() => null);
        if (raw?.tickets?.length) {
          const sid = String(id);
          const idx = raw.tickets.findIndex((t?) => String(t?._id) === sid);
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

  findOneByTranscriptViewToken(token?) {
    const t = String(token || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(t)) return Promise.resolve(null);
        return GuildFeatureBucket.collection
      .findOne(
        { "tickets.transcriptViewToken": t },
        { projection: { guildId: 1, tickets: { $elemMatch: { transcriptViewToken: t } } } },
      )
      .then(async (bucket?) => {
        if (bucket?.tickets?.length) {
          const sub =
            bucket.tickets.find((x?) => String(x.transcriptViewToken || "").toLowerCase() === t) ||
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

  findOne(filter?, projection?) {
    if (!filter || typeof filter !== "object") return Promise.resolve(null);
    return new TicketFindOneQuery(filter, projection);
  },

  find(filter?, projection?) {
    return new TicketFindQuery(filter, projection);
  },

  async findOneAndUpdate(filter?, update?, opts: Record<string, any> = {}) {
    const ref = await resolveTicketRef(filter);
    if (!ref) {
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
    let result: any = await updateBucketTicketSet(ref.bucketId, $set, arrayFilter);
        if (result && Number(result.modifiedCount || 0) < 1) {
      const current = await readTicketByRef(ref.bucketId, ref.ticketId);
      if (current && ticketUpdateSatisfied(current, $set)) {
                return opts.new !== false ? current : null;
      }
      if (filter.open === true && current && coerceTicketOpen(current.open) !== true) {
                return null;
      }
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
      if (current && ticketUpdateSatisfied(current, $set)) {
        return opts.new !== false ? current : null;
      }
      return null;
    }
    const fresh = opts.new !== false ? await readTicketByRef(ref.bucketId, ref.ticketId) : null;
    if (opts.new !== false) {
      if (!fresh) {
        global.logger?.warn?.(
          `[Ticket.findOneAndUpdate] ticket non leggibile bucket=${String(ref.bucketId)} ticket=${String(ref.ticketId)}`,
        );
        return null;
      }
      if (ticketUpdateSatisfied(fresh, $set)) return fresh;
      let forced: any = await updateBucketTicketSet(ref.bucketId, $set, {
        "t._id": ticketIdArrayFilterClause(ref.ticketId),
      });
      if (forced && Number(forced.modifiedCount || 0) < 1 && filter.channelId) {
        forced = await updateBucketTicketSet(ref.bucketId, $set, {
          "t.channelId": String(filter.channelId),
        });
      }
      const again = await readTicketByRef(ref.bucketId, ref.ticketId);
      if (again && ticketUpdateSatisfied(again, $set)) return again;
      global.logger?.warn?.(
        `[Ticket.findOneAndUpdate] $set non persistito ticket=${String(ref.ticketId)} keys=${Object.keys($set).join(",")} matched=${Number(result?.matchedCount || 0)} modified=${Number(result?.modifiedCount || 0)}`,
      );
      return null;
    }
    return null;
  },

  async updateOne(filter?, update?) {
            const doc = await this.findOneAndUpdate(filter, update, { new: true });
    if (!doc) return { modifiedCount: 0, matchedCount: 0 };
    return { modifiedCount: 1, matchedCount: 1 };
  },

  async create(payload?) {
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