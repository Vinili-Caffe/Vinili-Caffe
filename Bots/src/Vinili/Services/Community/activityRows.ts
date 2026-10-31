/** Attività: lettura delle righe giornaliere e orarie (profilo e server). */
const mongoose = require("mongoose") as typeof import("mongoose");
const { ActivityUserProfile, ActivityGuildHourly } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { expandDateKeysToHourKeys } = require("./activityTime") as typeof import("./activityTime");

const ACTIVITY_GUILD_HOURLY_QUERY_MAX_MS = Math.max(
  0,
  Math.min(120_000, Number(process.env.ACTIVITY_GUILD_HOURLY_QUERY_MAX_MS ?? 45_000)),
);
const OVERVIEW_STATS_CACHE_TTL_MS = Math.max(
  0,
  Math.min(120_000, Number(process.env.OVERVIEW_STATS_CACHE_TTL_MS ?? 45_000)),
);
const guildHourlyRowsCache = new Map();

function buildHourlyRowsCacheKey(guildId?, hourKeys?) {
  const gid = String(guildId || "");
  if (!Array.isArray(hourKeys) || !hourKeys.length) return `${gid}:all`;
  return `${gid}:h:${hourKeys.length}:${hourKeys[0]}:${hourKeys[hourKeys.length - 1]}`;
}

function profileActivityCollection() {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return db.collection("activityuserprofiles");
}

function chunkArray(items = [], size = 500) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function sanitizeChannelsMap(raw: Record<string, any> = {}) {
  const out: Record<string, any> = {};
  for (const [channelId, value] of Object.entries(raw || {})) {
    const amount = Math.max(0, Number(value || 0));
    if (!channelId || amount <= 0) continue;
    out[String(channelId)] = amount;
  }
  return out;
}

function toObjectMap(raw: Record<string, any> = {}) {
  if (!raw) return {};
  if (raw instanceof Map) return Object.fromEntries(raw.entries());
  if (typeof raw === "object") return raw;
  return {};
}

function addNumericMapInto(target?, delta?) {
  const t = target && typeof target === "object" ? target : {};
  for (const [k, v] of Object.entries(delta || {})) {
    const n = Math.max(0, Math.floor(Number(v || 0)));
    if (!k || !n) continue;
    t[String(k)] = (Number(t[String(k)]) || 0) + n;
  }
  return t;
}

function mergeGuildHourlyRowInto(byRowKey?, row?) {
  const gid = String(row?.guildId || "");
  const hk = String(row?.hourKey || "");
  const uid = String(row?.userId || "");
  if (!gid || !hk || !uid) return;
  const k = `${hk}\t${uid}`;
  const prev = byRowKey.get(k);
  if (!prev) {
    byRowKey.set(k, {
      guildId: gid,
      hourKey: hk,
      userId: uid,
      textCount: Math.max(0, Number(row.textCount || 0)),
      voiceSeconds: Math.max(0, Number(row.voiceSeconds || 0)),
      textChannels: { ...toObjectMap(row.textChannels) },
      voiceChannels: { ...toObjectMap(row.voiceChannels) },
    });
    return;
  }
  prev.textCount += Math.max(0, Number(row.textCount || 0));
  prev.voiceSeconds += Math.max(0, Number(row.voiceSeconds || 0));
  addNumericMapInto(prev.textChannels, row.textChannels);
  addNumericMapInto(prev.voiceChannels, row.voiceChannels);
}

function pushRowsFromLegacyGuildHourlyDoc(doc?, gid?, wanted?, byRowKey?) {
  const hk = String(doc?.hourKey || "");
  if (!hk || (wanted && !wanted.has(hk))) return;
  const users = doc?.users && typeof doc.users === "object" && !Array.isArray(doc.users) ? doc.users : {};
  for (const [uidRaw, pack] of Object.entries(users)) {
    const uid = String(uidRaw || "");
    if (!uid) continue;
    const p = pack && typeof pack === "object" ? pack : {};
    const textCh = p.textCh && typeof p.textCh === "object" ? p.textCh : {};
    const voiceCh = p.voiceCh && typeof p.voiceCh === "object" ? p.voiceCh : {};
    mergeGuildHourlyRowInto(byRowKey, {
      guildId: gid,
      hourKey: hk,
      userId: uid,
      textCount: Number(p.text || 0),
      voiceSeconds: Number(p.voice || 0),
      textChannels: toObjectMap(textCh),
      voiceChannels: toObjectMap(voiceCh),
    });
  }
}

function pushRowsFromRollupHours(hours?, gid?, wanted?, byRowKey?) {
  const h = hours && typeof hours === "object" && !Array.isArray(hours) ? hours : {};
  for (const [hourKey, block] of Object.entries(h)) {
    if (wanted && !wanted.has(String(hourKey || ""))) continue;
    const users = block?.users && typeof block.users === "object" && !Array.isArray(block.users) ? block.users : {};
    for (const [uidRaw, pack] of Object.entries(users)) {
      const uid = String(uidRaw || "");
      if (!uid) continue;
      const p = pack && typeof pack === "object" ? pack : {};
      const textCh = p.textCh && typeof p.textCh === "object" ? p.textCh : {};
      const voiceCh = p.voiceCh && typeof p.voiceCh === "object" ? p.voiceCh : {};
      mergeGuildHourlyRowInto(byRowKey, {
        guildId: gid,
        hourKey: String(hourKey || ""),
        userId: uid,
        textCount: Number(p.text || 0),
        voiceSeconds: Number(p.voice || 0),
        textChannels: toObjectMap(textCh),
        voiceChannels: toObjectMap(voiceCh),
      });
    }
  }
}

function extractCompactRowsByKey(doc: Record<string, any> = {}, keyField = "dateKey") {
  const guildId = String(doc?.guildId || "");
  const bucketKey = String(doc?.[keyField] || "");
  const users = toObjectMap(doc?.users || {});
  const rows = [];
  for (const [userIdRaw, userData] of Object.entries(users)) {
    const userId = String(userIdRaw || "");
    if (!userId) continue;
    const clean = userData && typeof userData === "object" ? userData : {};
    rows.push({
      guildId,
      [keyField]: bucketKey,
      userId,
      textCount: Number(clean?.textCount || 0),
      voiceSeconds: Number(clean?.voiceSeconds || 0),
      textChannels: toObjectMap(clean?.textChannels || {}),
      voiceChannels: toObjectMap(clean?.voiceChannels || {}),
    });
  }
  return rows;
}

function extractProfileRowsByKey(doc: Record<string, any> = {}, bucketField = "daily", keyField = "dateKey") {
  const guildId = String(doc?.guildId || "");
  const userId = String(doc?.userId || "");
  if (!guildId || !userId) return [];
  const bucket = toObjectMap(
    String(bucketField).includes(".")
      ? String(bucketField).split(".").reduce((acc?, key?) => (acc && typeof acc === "object" ? acc[key] : undefined), doc)
      : doc?.[bucketField],
  );
  const rows = [];
  for (const [bucketKey, value] of Object.entries(bucket)) {
    const clean = value && typeof value === "object" ? value : {};
    rows.push({
      guildId,
      [keyField]: String(bucketKey || ""),
      userId,
      textCount: Number(clean?.textCount || 0),
      voiceSeconds: Number(clean?.voiceSeconds || 0),
      textChannels: toObjectMap(clean?.textChannels || {}),
      voiceChannels: toObjectMap(clean?.voiceChannels || {}),
    });
  }
  return rows;
}

async function loadDailyRowsFromProfile(guildId?, dateKeys = null) {
  const filter = { guildId: String(guildId || "") };
  if (!filter.guildId) return [];
  const docs = await ActivityUserProfile.find(filter).select("guildId userId profile.totals.daily").lean().catch(() => []);
  const wanted = Array.isArray(dateKeys) && dateKeys.length ? new Set(dateKeys.map(String)) : null;
  const rows = [];
  for (const doc of docs) {
    const list = extractProfileRowsByKey(doc, "profile.totals.daily", "dateKey");
    for (const row of list) {
      if (wanted && !wanted.has(String(row.dateKey || ""))) continue;
      rows.push(row);
    }
  }
  return rows;
}

async function loadHourlyRowsFromProfile(guildId?, hourKeys = null, userId = null) {
  const filter: Record<string, any> = { guildId: String(guildId || "") };
  if (!filter.guildId) return [];
  if (userId) filter.userId = String(userId);
  let q = ActivityUserProfile.find(filter).select("guildId userId profile.totals.hourly");
  if (!userId && ACTIVITY_GUILD_HOURLY_QUERY_MAX_MS > 0) {
    q = q.maxTimeMS(ACTIVITY_GUILD_HOURLY_QUERY_MAX_MS);
  }
  const docs = await q.lean().catch(() => []);
  const wanted = Array.isArray(hourKeys) && hourKeys.length ? new Set(hourKeys.map(String)) : null;
  const rows = [];
  for (const doc of docs) {
    const list = extractProfileRowsByKey(doc, "profile.totals.hourly", "hourKey");
    for (const row of list) {
      if (wanted && !wanted.has(String(row.hourKey || ""))) continue;
      rows.push(row);
    }
  }
  return rows;
}

function aggregateDailyRowsFromHourly(hourlyRows = [], dateKeys = null) {
  const wanted = Array.isArray(dateKeys) && dateKeys.length ? new Set(dateKeys.map(String)) : null;
  const byKey = new Map();
  for (const r of hourlyRows || []) {
    const hk = String(r?.hourKey || "");
    const dateKey = hk.length >= 10 ? hk.slice(0, 10) : "";
    const uid = String(r?.userId || "");
    const gid = String(r?.guildId || "");
    if (!dateKey || !uid || !gid) continue;
    if (wanted && !wanted.has(dateKey)) continue;
    const k = `${dateKey}\t${uid}`;
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, {
        guildId: gid,
        dateKey,
        userId: uid,
        textCount: Math.max(0, Number(r.textCount || 0)),
        voiceSeconds: Math.max(0, Number(r.voiceSeconds || 0)),
        textChannels: { ...toObjectMap(r.textChannels) },
        voiceChannels: { ...toObjectMap(r.voiceChannels) },
      });
      continue;
    }
    prev.textCount += Math.max(0, Number(r.textCount || 0));
    prev.voiceSeconds += Math.max(0, Number(r.voiceSeconds || 0));
    addNumericMapInto(prev.textChannels, r.textChannels);
    addNumericMapInto(prev.voiceChannels, r.voiceChannels);
  }
  return [...byKey.values()];
}

function mergeGuildPreferDailyRows(profileRows?, guildRows?) {
  const byKey = new Map();
  for (const r of guildRows || []) {
    const dk = String(r?.dateKey || "");
    const uid = String(r?.userId || "");
    if (!dk || !uid) continue;
    byKey.set(`${dk}\t${uid}`, r);
  }
  const out = [...byKey.values()];
  for (const r of profileRows || []) {
    const dk = String(r?.dateKey || "");
    const uid = String(r?.userId || "");
    if (!dk || !uid) continue;
    const k = `${dk}\t${uid}`;
    if (byKey.has(k)) continue;
    out.push(r);
  }
  return out;
}

async function loadDailyRows(guildId?, dateKeys = null) {
  const hourKeys =
    Array.isArray(dateKeys) && dateKeys.length ? expandDateKeysToHourKeys(dateKeys) : null;
  const [profileRows, guildHourly] = await Promise.all([
    loadDailyRowsFromProfile(guildId, dateKeys),
    loadGuildHourlyRows(guildId, hourKeys),
  ]);
  const guildDaily = aggregateDailyRowsFromHourly(guildHourly, dateKeys);
  return mergeGuildPreferDailyRows(profileRows, guildDaily);
}

function mergeGuildPreferHourlyRows(profileRows?, guildRows?) {
  const byKey = new Map();
  for (const r of guildRows || []) {
    const hk = String(r?.hourKey || "");
    const uid = String(r?.userId || "");
    if (!hk || !uid) continue;
    byKey.set(`${hk}\t${uid}`, r);
  }
  const out = [...byKey.values()];
  for (const r of profileRows || []) {
    const hk = String(r?.hourKey || "");
    const uid = String(r?.userId || "");
    if (!hk || !uid) continue;
    const k = `${hk}\t${uid}`;
    if (byKey.has(k)) continue;
    out.push(r);
  }
  return out;
}

async function loadGuildHourlyRows(guildId?, hourKeys = null) {
  const gid = String(guildId || "");
  if (!gid) return [];
  const wanted = Array.isArray(hourKeys) && hourKeys.length ? new Set(hourKeys.map(String)) : null;
  let q = ActivityGuildHourly.find({ guildId: gid }).lean();
  if (ACTIVITY_GUILD_HOURLY_QUERY_MAX_MS > 0) {
    q = q.maxTimeMS(ACTIVITY_GUILD_HOURLY_QUERY_MAX_MS);
  }
  const docs = await q.catch(() => []);
  const byRowKey = new Map();
  for (const doc of docs) {
    const legacyHourKey = typeof doc?.hourKey === "string" && String(doc.hourKey).trim() !== "";
    if (legacyHourKey) {
      pushRowsFromLegacyGuildHourlyDoc(doc, gid, wanted, byRowKey);
    } else if (doc?.hours && typeof doc.hours === "object" && !Array.isArray(doc.hours)) {
      pushRowsFromRollupHours(doc.hours, gid, wanted, byRowKey);
    }
  }
  return [...byRowKey.values()];
}

async function loadHourlyRows(guildId?, hourKeys = null, userId = null) {
  const uid = userId ? String(userId) : null;
  const cacheKey = uid
    ? `${buildHourlyRowsCacheKey(guildId, hourKeys)}:u:${uid}`
    : buildHourlyRowsCacheKey(guildId, hourKeys);
  if (!uid && OVERVIEW_STATS_CACHE_TTL_MS > 0) {
    const cached = guildHourlyRowsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
  }
  const [guildRowsAll, profileRows] = await Promise.all([
    loadGuildHourlyRows(guildId, hourKeys),
    loadHourlyRowsFromProfile(guildId, hourKeys, uid),
  ]);
  const guildRows = uid
    ? guildRowsAll.filter((r?) => String(r?.userId || "") === uid)
    : guildRowsAll;
  const merged = mergeGuildPreferHourlyRows(profileRows, guildRows);
  if (!uid && OVERVIEW_STATS_CACHE_TTL_MS > 0) {
    guildHourlyRowsCache.set(cacheKey, {
      value: merged,
      expiresAt: Date.now() + OVERVIEW_STATS_CACHE_TTL_MS,
    });
  }
  return merged;
}

export = { OVERVIEW_STATS_CACHE_TTL_MS, profileActivityCollection, chunkArray, sanitizeChannelsMap, toObjectMap, addNumericMapInto, loadDailyRows, loadHourlyRows };
