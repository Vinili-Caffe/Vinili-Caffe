const mongoose = require("mongoose");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId, isValidGuildUserIdChannelId } = require("../../Utils/DB/validateWriteIds");
const { addExpWithLevel, MESSAGE_EXP, VOICE_EXP_PER_MINUTE, shouldIgnoreExpForMember, } = require("./expService");
const IDs = require("../../Utils/Config/ids");
const { isChannelInTicketCategory } = require("../../Utils/Ticket/ticketCategoryUtils");
const TIME_ZONE = "Europe/Rome";
const DAY_MS = 24 * 60 * 60 * 1000;
const BACKFILL_HOUR_SUFFIX = "T12";
const HOURLY_BACKFILL_BATCH = 500;
const HOURLY_BACKFILL_PREFIX_MAX_WAIT_MS = Math.max(
  0,
  Math.min(120_000, Number(process.env.HOURLY_BACKFILL_PREFIX_MAX_WAIT_MS ?? 12_000)),
);
const ACTIVITY_GUILD_HOURLY_QUERY_MAX_MS = Math.max(
  0,
  Math.min(120_000, Number(process.env.ACTIVITY_GUILD_HOURLY_QUERY_MAX_MS ?? 45_000)),
);

function shouldSkipBackfillRow(hourKey, hourSet) {
  if (!hourKey || typeof hourKey !== "string") return false;
  if (!hourKey.endsWith(BACKFILL_HOUR_SUFFIX)) return false;
  const dateKey = hourKey.slice(0, -BACKFILL_HOUR_SUFFIX.length);
  return [...hourSet].some((k) => k.startsWith(`${dateKey}T`) && k !== hourKey);
}
const hourlyBackfillByGuild = new Map();
const EXCLUDED_ACTIVITY_CHANNEL_IDS = new Set(
  [IDs.channels?.ticket, IDs.channels?.ticketLogs]
    .filter(Boolean)
    .map((id) => String(id)),
);

function isExcludedActivityChannel(channelLike) {
  const channelId = String(channelLike?.id || channelLike?.channelId || "");
  if (channelId && EXCLUDED_ACTIVITY_CHANNEL_IDS.has(channelId)) return true;
  return isChannelInTicketCategory(channelLike);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getTimeParts(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: map.weekday,
  };
}

function getDayKey(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

function getHourKey(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}T${map.hour}`;
}

function logActivityBumpError(label, err) {
  const msg = err instanceof Error ? err.stack || err.message : String(err);
  const line = `[ACTIVITY] ${label}: ${msg}`;
  try {
    console.error(line);
  } catch {
  }
  try {
    global.logger?.warn?.(`[ACTIVITY] ${label}:`, err?.message || err);
  } catch {
  }
}

function profileActivityCollection() {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return db.collection("activityuserprofiles");
}

function getLastNDaysKeys(days) {
  const safeDays = Math.max(1, Math.min(31, Number(days || 7)));
  const keys = [];
  const now = new Date();
  for (let i = 0; i < safeDays; i += 1) {
    const d = new Date(now.getTime() - i * DAY_MS);
    keys.push(getDayKey(d));
  }
  return keys;
}

function getLastNHourKeys(hours) {
  const safeHours = Math.max(1, Math.min(24 * 31, Number(hours || 24)));
  const keys = [];
  const now = new Date();
  for (let i = 0; i < safeHours; i += 1) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    keys.push(getHourKey(d));
  }
  return keys;
}

function chunkArray(items = [], size = 500) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function sanitizeChannelsMap(raw = {}) {
  const out = {};
  for (const [channelId, value] of Object.entries(raw || {})) {
    const amount = Math.max(0, Number(value || 0));
    if (!channelId || amount <= 0) continue;
    out[String(channelId)] = amount;
  }
  return out;
}

function toObjectMap(raw = {}) {
  if (!raw) return {};
  if (raw instanceof Map) return Object.fromEntries(raw.entries());
  if (typeof raw === "object") return raw;
  return {};
}

function extractCompactRowsByKey(doc = {}, keyField = "dateKey") {
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

function extractProfileRowsByKey(doc = {}, bucketField = "daily", keyField = "dateKey") {
  const guildId = String(doc?.guildId || "");
  const userId = String(doc?.userId || "");
  if (!guildId || !userId) return [];
  const bucket = toObjectMap(
    String(bucketField).includes(".")
      ? String(bucketField).split(".").reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), doc)
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

async function loadDailyRowsFromProfile(guildId, dateKeys = null) {
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

async function loadHourlyRowsFromProfile(guildId, hourKeys = null, userId = null) {
  const filter = { guildId: String(guildId || "") };
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

async function loadDailyRows(guildId, dateKeys = null) {
  return loadDailyRowsFromProfile(guildId, dateKeys);
}

async function loadHourlyRows(guildId, hourKeys = null, userId = null) {
  return loadHourlyRowsFromProfile(guildId, hourKeys, userId);
}

async function ensureHourlyBackfillForGuild(guildId) {
  const safeGuildId = String(guildId || "");
  if (!safeGuildId) return false;

  if (hourlyBackfillByGuild.has(safeGuildId)) {
    return hourlyBackfillByGuild.get(safeGuildId);
  }

  const task = (async () => {
    const dailyRows = await loadDailyRows(safeGuildId);
    if (!dailyRows.length) return false;

    const profileOps = [];

    for (const row of dailyRows) {
      const dateKey = String(row?.dateKey || "");
      const userId = String(row?.userId || "");
      if (!dateKey || !userId) continue;

      const hourKey = `${dateKey}${BACKFILL_HOUR_SUFFIX}`;
      const textChannels = sanitizeChannelsMap(row?.textChannels || {});
      const voiceChannels = sanitizeChannelsMap(row?.voiceChannels || {});
      const textCount = Math.max(0, Number(row?.textCount || 0));
      const voiceSeconds = Math.max(0, Number(row?.voiceSeconds || 0));

      const hourPath = `profile.totals.hourly.${hourKey}`;
      profileOps.push({
        updateOne: {
          filter: {
            guildId: safeGuildId,
            userId,
            [hourPath]: { $exists: false },
          },
          update: {
            $set: {
              [`${hourPath}.textCount`]: textCount,
              [`${hourPath}.voiceSeconds`]: voiceSeconds,
              [`${hourPath}.textChannels`]: textChannels,
              [`${hourPath}.voiceChannels`]: voiceChannels,
            },
            $setOnInsert: { guildId: safeGuildId, userId },
          },
          upsert: true,
        },
      });
    }

    if (!profileOps.length) return false;

    let insertedCount = 0;
    const chunks = chunkArray(profileOps, HOURLY_BACKFILL_BATCH);
    for (const ops of chunks) {
      const result = await ActivityUserProfile.bulkWrite(ops, { ordered: false }).catch(() => null,);
      insertedCount += Number(result?.upsertedCount || 0) + Number(result?.modifiedCount || 0);
    }

    return insertedCount > 0;
  })()
    .catch((error) => {
      global.logger?.warn?.(
        `[ACTIVITY]Hourly backfill failed for guild ${safeGuildId}:`,
        error?.message || error,
      );
      return false;
    })
    .finally(() => {
      hourlyBackfillByGuild.delete(safeGuildId);
    });

  hourlyBackfillByGuild.set(safeGuildId, task);
  return task;
}

async function bumpDailyText(guildId, userId, channelId, amount = 1) {
  const inc = Math.max(0, Number(amount || 0));
  if (!inc || !isValidGuildUserIdChannelId(guildId, userId, channelId)) {
    if (process.env.ACTIVITY_DEBUG === "1") {
      console.error("[ACTIVITY] bumpDailyText skip", { guildId, userId, channelId, typeofChannelId: typeof channelId });
    }
    return;
  }
  const dateKey = getDayKey(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    logActivityBumpError("bumpDailyText invalid dateKey", new Error(String(dateKey)));
    return;
  }
  const gid = String(guildId);
  const uid = String(userId);
  const cid = String(channelId);
  const col = profileActivityCollection();
  if (!col) {
    logActivityBumpError("bumpDailyText", new Error("mongoose.connection.db non disponibile"));
    return;
  }
  try {
    await col.updateOne(
      { guildId: gid, userId: uid },
      {
        $setOnInsert: { guildId: gid, userId: uid },
        $set: { "profile.totals.lastEmbedDailyKey": dateKey },
        $inc: {
          [`profile.totals.daily.${dateKey}.textCount`]: inc,
          [`profile.totals.daily.${dateKey}.textChannels.${cid}`]: inc,
        },
      },
      { upsert: true },
    );
  } catch (err) {
    logActivityBumpError("bumpDailyText", err);
  }
}

async function bumpHourlyText(guildId, userId, channelId, amount = 1) {
  const inc = Math.max(0, Number(amount || 0));
  if (!inc || !isValidGuildUserIdChannelId(guildId, userId, channelId)) {
    if (process.env.ACTIVITY_DEBUG === "1") {
      console.error("[ACTIVITY] bumpHourlyText skip", { guildId, userId, channelId, typeofChannelId: typeof channelId });
    }
    return;
  }
  const hourKey = getHourKey(new Date());
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hourKey)) {
    logActivityBumpError("bumpHourlyText invalid hourKey", new Error(String(hourKey)));
    return;
  }
  const gid = String(guildId);
  const uid = String(userId);
  const cid = String(channelId);
  const col = profileActivityCollection();
  if (!col) {
    logActivityBumpError("bumpHourlyText", new Error("mongoose.connection.db non disponibile"));
    return;
  }
  try {
    await col.updateOne(
      { guildId: gid, userId: uid },
      {
        $setOnInsert: { guildId: gid, userId: uid },
        $set: { "profile.totals.lastEmbedHourlyKey": hourKey },
        $inc: {
          [`profile.totals.hourly.${hourKey}.textCount`]: inc,
          [`profile.totals.hourly.${hourKey}.textChannels.${cid}`]: inc,
        },
      },
      { upsert: true },
    );
  } catch (err) {
    logActivityBumpError("bumpHourlyText", err);
  }
}

async function bumpDailyVoice(guildId, userId, channelId, seconds = 0) {
  const inc = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!inc || !isValidGuildUserIdChannelId(guildId, userId, channelId)) return;
  const dateKey = getDayKey(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    logActivityBumpError("bumpDailyVoice invalid dateKey", new Error(String(dateKey)));
    return;
  }
  const gid = String(guildId);
  const uid = String(userId);
  const cid = String(channelId);
  const col = profileActivityCollection();
  if (!col) {
    logActivityBumpError("bumpDailyVoice", new Error("mongoose.connection.db non disponibile"));
    return;
  }
  try {
    await col.updateOne(
      { guildId: gid, userId: uid },
      {
        $setOnInsert: { guildId: gid, userId: uid },
        $set: { "profile.totals.lastEmbedDailyKey": dateKey },
        $inc: {
          [`profile.totals.daily.${dateKey}.voiceSeconds`]: inc,
          [`profile.totals.daily.${dateKey}.voiceChannels.${cid}`]: inc,
        },
      },
      { upsert: true },
    );
  } catch (err) {
    logActivityBumpError("bumpDailyVoice", err);
  }
}

async function bumpHourlyVoice(guildId, userId, channelId, seconds = 0) {
  const inc = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!inc || !isValidGuildUserIdChannelId(guildId, userId, channelId)) return;
  const hourKey = getHourKey(new Date());
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hourKey)) {
    logActivityBumpError("bumpHourlyVoice invalid hourKey", new Error(String(hourKey)));
    return;
  }
  const gid = String(guildId);
  const uid = String(userId);
  const cid = String(channelId);
  const col = profileActivityCollection();
  if (!col) {
    logActivityBumpError("bumpHourlyVoice", new Error("mongoose.connection.db non disponibile"));
    return;
  }
  try {
    await col.updateOne(
      { guildId: gid, userId: uid },
      {
        $setOnInsert: { guildId: gid, userId: uid },
        $set: { "profile.totals.lastEmbedHourlyKey": hourKey },
        $inc: {
          [`profile.totals.hourly.${hourKey}.voiceSeconds`]: inc,
          [`profile.totals.hourly.${hourKey}.voiceChannels.${cid}`]: inc,
        },
      },
      { upsert: true },
    );
  } catch (err) {
    logActivityBumpError("bumpHourlyVoice", err);
  }
}

function getWeekKey(date) {
  const { year, month, day } = getTimeParts(date);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayNr = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 4));
  const weekNr = 1 + Math.round((utcDate - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${utcDate.getUTCFullYear()}-W${pad2(weekNr)}`;
}

function ensureMessageKeys(doc, now) {
  if (!doc.profile) doc.profile = {};
  if (!doc.profile.totals) doc.profile.totals = {};
  ensureTimedCounters(doc.profile.totals, now, {
    dailyKey: "messagesDailyKey",
    dailyCount: "messagesDaily",
    weeklyKey: "messagesWeeklyKey",
    weeklyCount: "messagesWeekly",
  });
}

function ensureVoiceKeys(doc, now) {
  if (!doc.profile) doc.profile = {};
  if (!doc.profile.totals) doc.profile.totals = {};
  ensureTimedCounters(doc.profile.totals, now, {
    dailyKey: "voiceDailyKey",
    dailyCount: "voiceDailySeconds",
    weeklyKey: "voiceWeeklyKey",
    weeklyCount: "voiceWeeklySeconds",
  });
}

function ensureTimedCounters(target, now, keys) {
  if (!target) return;
  const dayKey = getDayKey(now);
  const weekKey = getWeekKey(now);
  if (target[keys.dailyKey] !== dayKey) {
    target[keys.dailyKey] = dayKey;
    target[keys.dailyCount] = 0;
  }
  if (target[keys.weeklyKey] !== weekKey) {
    target[keys.weeklyKey] = weekKey;
    target[keys.weeklyCount] = 0;
  }
}

async function getOrCreateActivityUser(guildId, userId) {
  if (!isValidGuildUserId(guildId, userId)) return null;
  const doc = await ActivityUserProfile.findOneAndUpdate(
    { guildId: String(guildId), userId: String(userId) },
    { $setOnInsert: { guildId: String(guildId), userId: String(userId) } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return doc;
}

async function recordMessageActivity(message) {
  if (mongoose.connection?.readyState !== 1) {
    if (process.env.ACTIVITY_DEBUG === "1") {
      console.error("[ACTIVITY] recordMessageActivity skip: mongoose non connesso", mongoose.connection?.readyState);
    }
    return;
  }
  if (!message?.guild || !message.author || message.author.bot) return;
  if (isExcludedActivityChannel(message.channel)) return;
  const now = new Date();
  const channelIdResolved = String(message.channelId ?? message.channel?.id ?? "").trim();
  const doc = await getOrCreateActivityUser(message.guild.id, message.author.id);
  if (!doc) {
    if (process.env.ACTIVITY_DEBUG === "1") {
      logActivityBumpError("recordMessageActivity getOrCreateActivityUser null", new Error(`guild=${message.guild?.id} user=${message.author?.id}`));
    }
    return;
  }
  if (!doc.profile) doc.profile = {};
  if (!doc.profile.totals) doc.profile.totals = {};
  ensureMessageKeys(doc, now);
  doc.profile.totals.messagesTotal = Number(doc.profile.totals.messagesTotal || 0) + 1;
  doc.profile.totals.messagesDaily = Number(doc.profile.totals.messagesDaily || 0) + 1;
  doc.profile.totals.messagesWeekly = Number(doc.profile.totals.messagesWeekly || 0) + 1;
  await doc.save();
  await bumpDailyText(
    message.guild.id,
    message.author.id,
    channelIdResolved,
    1,
  );
  await bumpHourlyText(
    message.guild.id,
    message.author.id,
    channelIdResolved,
    1,
  );
  const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
  const ignored = await shouldIgnoreExpForMember({ guildId: message.guild.id, member, channelId: message.channel?.id || message.channelId || null, });
  if (!ignored) {
    await addExpWithLevel(message.guild, message.author.id, MESSAGE_EXP, true, true, { source: "activity" });
  }
}

async function recordVoiceSessionEnd(doc, now, guild, skipExp = false) {
  if (!doc.profile) doc.profile = {};
  if (!doc.profile.totals) doc.profile.totals = {};
  const startedAt = doc.profile.totals.sessionStartedAt;
  if (!startedAt) return 0;
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000),);
  ensureVoiceKeys(doc, now);
  doc.profile.totals.voiceTotalSeconds = Number(doc.profile.totals.voiceTotalSeconds || 0) + elapsedSeconds;
  doc.profile.totals.voiceDailySeconds = Number(doc.profile.totals.voiceDailySeconds || 0) + elapsedSeconds;
  doc.profile.totals.voiceWeeklySeconds =
    Number(doc.profile.totals.voiceWeeklySeconds || 0) + elapsedSeconds;
  doc.profile.totals.sessionStartedAt = null;
  doc.profile.totals.sessionChannelId = null;
  const alreadyAwardedSeconds = Math.max(0, Number(doc.profile.totals.expAwardedSeconds || 0),);
  const totalAwardableExp = Math.floor((elapsedSeconds * VOICE_EXP_PER_MINUTE) / 60,);
  const alreadyAwardedExp = Math.floor((alreadyAwardedSeconds * VOICE_EXP_PER_MINUTE) / 60,);
  const remainingExp = Math.max(0, totalAwardableExp - alreadyAwardedExp);
  doc.profile.totals.expAwardedSeconds = 0;
  if (!skipExp && remainingExp > 0) {
    await addExpWithLevel(guild, doc.userId, remainingExp, true, true, { source: "activity" });
  }
  return elapsedSeconds;
}

function isCountableVoiceState(state) {
  if (!state?.channelId) return false;
  const channel = state.channel || state?.guild?.channels?.cache?.get(state.channelId);
  if (isExcludedActivityChannel(channel || state)) return false;

  if (state.selfMute && state.selfDeaf) return false;
  return true;
}

async function handleVoiceActivity(oldState, newState) {
  const member = newState?.member || oldState?.member;
  if (!member || member.user?.bot) return;
  const guildId = newState?.guild?.id || oldState?.guild?.id;
  const userId = member.id;
  if (!guildId || !userId) return;

  const now = new Date();
  const wasInVoice = Boolean(oldState?.channelId);
  const isInVoice = Boolean(newState?.channelId);
  const wasCountable = isCountableVoiceState(oldState);
  const isCountable = isCountableVoiceState(newState);

  let doc = await getOrCreateActivityUser(guildId, userId);
  if (!doc) return;

  if (wasInVoice && !isInVoice) {
    const oldChannel = oldState?.channel || oldState?.guild?.channels?.cache?.get(oldState.channelId);
    const flushedBefore = Math.max(0, Number(doc.profile?.totals?.voiceActivityBucketFlushSeconds || 0));
    let elapsedSeconds = 0;
    if (wasCountable) {
      const ignored = await shouldIgnoreExpForMember({ guildId, member, channelId: oldChannel?.id || null, });
      elapsedSeconds = await recordVoiceSessionEnd(
        doc,
        now,
        member.guild,
        ignored,
      );
    } else {
      if (!doc.profile) doc.profile = {};
      if (!doc.profile.totals) doc.profile.totals = {};
      doc.profile.totals.sessionStartedAt = null;
      doc.profile.totals.sessionChannelId = null;
      doc.profile.totals.expAwardedSeconds = 0;
    }
    const remainingBucket = Math.max(0, elapsedSeconds - flushedBefore);
    if (oldChannel?.id && remainingBucket > 0) {
      await bumpDailyVoice(guildId, userId, oldChannel.id, remainingBucket);
      await bumpHourlyVoice(guildId, userId, oldChannel.id, remainingBucket);
    }
    if (!doc.profile) doc.profile = {};
    if (!doc.profile.totals) doc.profile.totals = {};
    doc.profile.totals.voiceActivityBucketFlushSeconds = 0;
    await doc.save();
    return;
  }

  if (wasInVoice && isInVoice && oldState.channelId !== newState.channelId) {
    const oldChannel = oldState?.channel || oldState?.guild?.channels?.cache?.get(oldState.channelId);
    const flushedBefore = Math.max(0, Number(doc.profile?.totals?.voiceActivityBucketFlushSeconds || 0));
    let elapsedSeconds = 0;
    if (wasCountable) {
      const ignored = await shouldIgnoreExpForMember({ guildId, member, channelId: oldChannel?.id || null, });
      elapsedSeconds = await recordVoiceSessionEnd(
        doc,
        now,
        member.guild,
        ignored,
      );
    } else {
      if (!doc.profile) doc.profile = {};
      if (!doc.profile.totals) doc.profile.totals = {};
      doc.profile.totals.sessionStartedAt = null;
      doc.profile.totals.sessionChannelId = null;
      doc.profile.totals.expAwardedSeconds = 0;
    }
    const remainingMove = Math.max(0, elapsedSeconds - flushedBefore);
    if (oldChannel?.id && remainingMove > 0) {
      await bumpDailyVoice(guildId, userId, oldChannel.id, remainingMove);
      await bumpHourlyVoice(guildId, userId, oldChannel.id, remainingMove);
    }
    if (!doc.profile) doc.profile = {};
    if (!doc.profile.totals) doc.profile.totals = {};
    doc.profile.totals.sessionStartedAt = isCountable ? now : null;
    doc.profile.totals.sessionChannelId = isCountable
      ? String(newState?.channelId || "")
      : null;
    doc.profile.totals.expAwardedSeconds = 0;
    doc.profile.totals.voiceActivityBucketFlushSeconds = 0;
    await doc.save();
    return;
  }

  if (wasInVoice && isInVoice && oldState.channelId === newState.channelId) {
    if (wasCountable && !isCountable) {
      const channel = oldState?.channel || newState?.channel || newState?.guild?.channels?.cache?.get(newState.channelId);
      const flushedBefore = Math.max(0, Number(doc.profile?.totals?.voiceActivityBucketFlushSeconds || 0));
      const ignored = await shouldIgnoreExpForMember({ guildId, member, channelId: channel?.id || null, });
      const elapsedSeconds = await recordVoiceSessionEnd(doc, now, member.guild, ignored,);
      const remainingMute = Math.max(0, elapsedSeconds - flushedBefore);
      if (channel?.id && remainingMute > 0) {
        await bumpDailyVoice(guildId, userId, channel.id, remainingMute);
        await bumpHourlyVoice(guildId, userId, channel.id, remainingMute);
      }
      if (!doc.profile) doc.profile = {};
      if (!doc.profile.totals) doc.profile.totals = {};
      doc.profile.totals.voiceActivityBucketFlushSeconds = 0;
      await doc.save();
      return;
    }

    if (!wasCountable && isCountable) {
      if (!doc.profile) doc.profile = {};
      if (!doc.profile.totals) doc.profile.totals = {};
      doc.profile.totals.sessionStartedAt = now;
      doc.profile.totals.sessionChannelId = String(newState?.channelId || "");
      doc.profile.totals.expAwardedSeconds = 0;
      doc.profile.totals.voiceActivityBucketFlushSeconds = 0;
      await doc.save();
      return;
    }
  }

  if (!wasInVoice && isInVoice) {
    if (!doc.profile) doc.profile = {};
    if (!doc.profile.totals) doc.profile.totals = {};
    doc.profile.totals.sessionStartedAt = isCountable ? now : null;
    doc.profile.totals.sessionChannelId = isCountable
      ? String(newState?.channelId || "")
      : null;
    doc.profile.totals.expAwardedSeconds = 0;
    doc.profile.totals.voiceActivityBucketFlushSeconds = 0;
    await doc.save();
    return;
  }
}

async function getUserActivityStats(guildId, userId) {
  const now = new Date();
  let doc = await getOrCreateActivityUser(guildId, userId);
  if (!doc) {
    return {
      messages: { daily: 0, weekly: 0, total: 0 },
      voice: { dailySeconds: 0, weeklySeconds: 0, totalSeconds: 0 },
    };
  }
  if (!doc.profile) doc.profile = {};
  if (!doc.profile.totals) doc.profile.totals = {};
  ensureMessageKeys(doc, now);
  ensureVoiceKeys(doc, now);

  let liveVoiceSeconds = 0;
  if (doc.profile?.totals?.sessionStartedAt) {
    liveVoiceSeconds = Math.max(
      0,
      Math.floor(
        (now.getTime() - new Date(doc.profile.totals.sessionStartedAt).getTime()) / 1000,
      ),
    );
  }

  await doc.save();

  return {
    messages: {
      daily: Number(doc.profile.totals.messagesDaily || 0),
      weekly: Number(doc.profile.totals.messagesWeekly || 0),
      total: Number(doc.profile.totals.messagesTotal || 0),
    },
    voice: {
      dailySeconds: Number(doc.profile.totals.voiceDailySeconds || 0) + liveVoiceSeconds,
      weeklySeconds: Number(doc.profile.totals.voiceWeeklySeconds || 0) + liveVoiceSeconds,
      totalSeconds: Number(doc.profile.totals.voiceTotalSeconds || 0) + liveVoiceSeconds,
    },
  };
}

function safeTopRank(map, targetId) {
  const rows = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  const index = rows.findIndex(([id]) => String(id) === String(targetId));
  return index >= 0 ? index + 1 : null;
}

function pushMapValue(target, key, amount) {
  if (!key || !Number.isFinite(amount) || amount <= 0) return;
  target.set(key, (target.get(key) || 0) + amount);
}

function topNFromMap(map, n = 3) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, value]) => ({ id, value }));
}

function toMapFromTopList(list = []) {
  const out = new Map();
  for (const row of Array.isArray(list) ? list : []) {
    const id = String(row?.id || "");
    const value = Number(row?.value || 0);
    if (!id || value <= 0) continue;
    out.set(id, (out.get(id) || 0) + value);
  }
  return out;
}

function secondsInLastNDays(startedAt, days, nowMs = Date.now()) {
  const safeDays = Math.max(1, Math.min(31, Number(days || 1)));
  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return 0;
  const windowStartMs = nowMs - safeDays * DAY_MS;
  const effectiveStartMs = Math.max(startMs, windowStartMs);
  if (effectiveStartMs >= nowMs) return 0;
  return Math.max(0, Math.floor((nowMs - effectiveStartMs) / 1000));
}

function getDayBoundsForDateKey(dateKey) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const baseMs = Date.UTC(y, m, d, 0, 0, 0, 0);
  const hourMs = 60 * 60 * 1000;
  let startMs = null;
  for (let offset = -24; offset <= 48; offset += 1) {
    const ms = baseMs + offset * hourMs;
    if (getDayKey(new Date(ms)) === dateKey) {
      startMs = ms;
      break;
    }
  }
  if (startMs == null) return null;
  let endMs = startMs + DAY_MS;
  for (let offset = 1; offset <= 48; offset += 1) {
    const ms = startMs + offset * hourMs;
    if (getDayKey(new Date(ms)) !== dateKey) {
      endMs = ms;
      break;
    }
  }
  return { startMs, endMs };
}

function secondsInDateKeys(startedAt, dateKeys, nowMs = Date.now()) {
  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs) || startMs >= nowMs) return 0;
  const dateKeySet = new Set(Array.isArray(dateKeys) ? dateKeys : []);
  if (!dateKeySet.size) return 0;
  let total = 0;
  for (const dateKey of dateKeySet) {
    const bounds = getDayBoundsForDateKey(dateKey);
    if (!bounds) continue;
    const overlapStart = Math.max(startMs, bounds.startMs);
    const overlapEnd = Math.min(nowMs, bounds.endMs);
    if (overlapEnd > overlapStart) total += Math.floor((overlapEnd - overlapStart) / 1000);
  }
  return total;
}

async function loadLiveVoiceSessions(guildId) {
  const docs = await ActivityUserProfile.find({ guildId, "profile.totals.sessionStartedAt": { $ne: null } })
    .select("userId profile.totals.sessionStartedAt profile.totals.sessionChannelId")
    .lean()
    .catch(() => []);
  const list = Array.isArray(docs) ? docs : [];
  return list.map((row) => ({
    userId: row.userId,
    voice: {
      sessionStartedAt: row.profile?.totals?.sessionStartedAt,
      sessionChannelId: row.profile?.totals?.sessionChannelId,
    },
  }));
}

async function getLiveVoiceOverlay(guildId, days = null) {
  const userVoice = new Map();
  const channelVoice = new Map();
  let totalVoiceSeconds = 0;
  const rows = await loadLiveVoiceSessions(guildId);
  if (!rows.length) return { userVoice, channelVoice, totalVoiceSeconds };

  const nowMs = Date.now();
  const safeDays = days == null ? null : Math.max(1, Math.min(31, Number(days || 1)));

  for (const row of rows) {
    const userId = String(row?.userId || "");
    const startedAt = row?.voice?.sessionStartedAt;
    const channelId = String(row?.voice?.sessionChannelId || "");
    if (!userId || !startedAt) continue;
    const addSeconds = safeDays == null ? Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000),) : secondsInLastNDays(startedAt, safeDays, nowMs);
    if (!addSeconds) continue;
    pushMapValue(userVoice, userId, addSeconds);
    if (channelId) pushMapValue(channelVoice, channelId, addSeconds);
    totalVoiceSeconds += addSeconds;
  }

  return { userVoice, channelVoice, totalVoiceSeconds };
}

function aggregateFromHourlyRows(rows = [], hourKeys = [], topLimit = 3) {
  const safeTopLimit = Math.max(1, Math.min(500, Number(topLimit || 3)));
  const hourSet = new Set(Array.isArray(hourKeys) ? hourKeys : []);
  const userText = new Map();
  const userVoice = new Map();
  const channelText = new Map();
  const channelVoice = new Map();
  const contributors = new Set();

  for (const row of rows) {
    const hourKey = String(row?.hourKey || "");
    if (!hourSet.has(hourKey)) continue;
    if (shouldSkipBackfillRow(hourKey, hourSet)) continue;

    const userId = String(row?.userId || "");
    const textCount = Number(row?.textCount || 0);
    const voiceSeconds = Number(row?.voiceSeconds || 0);

    if (userId && (textCount > 0 || voiceSeconds > 0)) contributors.add(userId);
    if (userId) {
      pushMapValue(userText, userId, textCount);
      pushMapValue(userVoice, userId, voiceSeconds);
    }

    const textChannels = row?.textChannels || {};
    for (const [channelId, value] of Object.entries(textChannels)) {
      pushMapValue(channelText, String(channelId || ""), Number(value || 0));
    }

    const voiceChannels = row?.voiceChannels || {};
    for (const [channelId, value] of Object.entries(voiceChannels)) {
      pushMapValue(channelVoice, String(channelId || ""), Number(value || 0));
    }
  }

  return {
    totals: {
      text: Array.from(userText.values()).reduce(
        (sum, value) => sum + value,
        0,
      ),
      voiceSeconds: Array.from(userVoice.values()).reduce(
        (sum, value) => sum + value,
        0,
      ),
    },
    contributors: contributors.size,
    topUsersText: topNFromMap(userText, safeTopLimit),
    topUsersVoice: topNFromMap(userVoice, safeTopLimit),
    topChannelsText: topNFromMap(channelText, safeTopLimit),
    topChannelsVoice: topNFromMap(channelVoice, safeTopLimit),
    contributorIds: contributors,
  };
}

function sumVoiceSecondsFromHourRow(row, excludeVoiceChannelIds) {
  const exclude =
    excludeVoiceChannelIds instanceof Set && excludeVoiceChannelIds.size > 0 ? excludeVoiceChannelIds : null;
  if (!exclude) return Number(row?.voiceSeconds || 0);
  const voiceChannels = row?.voiceChannels || {};
  const keys = Object.keys(voiceChannels);
  if (!keys.length) return Number(row?.voiceSeconds || 0);
  let sum = 0;
  for (const [channelId, value] of Object.entries(voiceChannels)) {
    if (exclude.has(String(channelId))) continue;
    sum += Number(value || 0);
  }
  return sum;
}

function sumTextFromHourRow(row, includeTextChannelIds) {
  const include =
    includeTextChannelIds instanceof Set && includeTextChannelIds.size > 0
      ? includeTextChannelIds
      : null;
  if (!include) return Number(row?.textCount || 0);
  const textChannels = row?.textChannels || {};
  const keys = Object.keys(textChannels);
  if (!keys.length) return 0;
  let sum = 0;
  for (const [channelId, value] of Object.entries(textChannels)) {
    if (!include.has(String(channelId))) continue;
    sum += Number(value || 0);
  }
  return sum;
}

function aggregateUserHourlyRows(
  rows = [],
  hourKeys = [],
  excludeVoiceChannelIds = null,
  includeTextChannelIds = null,
  includeVoiceChannelIds = null,
) {
  const exclude =
    excludeVoiceChannelIds instanceof Set && excludeVoiceChannelIds.size > 0 ? excludeVoiceChannelIds : null;
  const includeText =
    includeTextChannelIds instanceof Set && includeTextChannelIds.size > 0
      ? includeTextChannelIds
      : null;
  const includeVoice =
    includeVoiceChannelIds instanceof Set && includeVoiceChannelIds.size > 0
      ? includeVoiceChannelIds
      : null;
  const hourSet = new Set(Array.isArray(hourKeys) ? hourKeys : []);
  const channelText = new Map();
  const channelVoice = new Map();
  let text = 0;
  let voiceSeconds = 0;

  for (const row of rows) {
    const hourKey = String(row?.hourKey || "");
    if (!hourSet.has(hourKey)) continue;
    if (shouldSkipBackfillRow(hourKey, hourSet)) continue;
    const rowText = sumTextFromHourRow(row, includeText);
    const rowVoice = sumVoiceSecondsFromHourRow(row, exclude);
    text += rowText;
    if (includeVoice) {
      const voiceChannels = row?.voiceChannels || {};
      let rowVoiceIncluded = 0;
      for (const [channelId, value] of Object.entries(voiceChannels)) {
        const channelIdStr = String(channelId || "");
        if (exclude && exclude.has(channelIdStr)) continue;
        if (!includeVoice.has(channelIdStr)) continue;
        rowVoiceIncluded += Number(value || 0);
      }
      voiceSeconds += rowVoiceIncluded;
    } else {
      voiceSeconds += rowVoice;
    }

    const textChannels = row?.textChannels || {};
    for (const [channelId, value] of Object.entries(textChannels)) {
      if (includeText && !includeText.has(String(channelId || ""))) continue;
      pushMapValue(channelText, String(channelId || ""), Number(value || 0));
    }

    const voiceChannels = row?.voiceChannels || {};
    for (const [channelId, value] of Object.entries(voiceChannels)) {
      const channelIdStr = String(channelId || "");
      if (exclude && exclude.has(channelIdStr)) continue;
      if (includeVoice && !includeVoice.has(channelIdStr)) continue;
      pushMapValue(channelVoice, String(channelId || ""), Number(value || 0));
    }
  }

  return { text, voiceSeconds, topChannelsText: topNFromMap(channelText, 3), topChannelsVoice: topNFromMap(channelVoice, 3) };
}

function buildChartByDayFromHourlyRows(
  rows = [],
  hourKeys = [],
  excludeVoiceChannelIds = null,
  includeTextChannelIds = null,
  includeVoiceChannelIds = null,
) {
  const exclude =
    excludeVoiceChannelIds instanceof Set && excludeVoiceChannelIds.size > 0 ? excludeVoiceChannelIds : null;
  const includeText =
    includeTextChannelIds instanceof Set && includeTextChannelIds.size > 0
      ? includeTextChannelIds
      : null;
  const includeVoice =
    includeVoiceChannelIds instanceof Set && includeVoiceChannelIds.size > 0
      ? includeVoiceChannelIds
      : null;
  const hourSet = new Set(Array.isArray(hourKeys) ? hourKeys : []);
  const byDay = new Map();

  for (const row of rows) {
    const hourKey = String(row?.hourKey || "");
    if (!hourSet.has(hourKey)) continue;
    if (shouldSkipBackfillRow(hourKey, hourSet)) continue;
    const dayKey = hourKey.split("T")[0] || "";
    if (!dayKey) continue;
    const current = byDay.get(dayKey) || { text: 0, voiceSeconds: 0 };
    current.text += sumTextFromHourRow(row, includeText);
    if (includeVoice) {
      const voiceChannels = row?.voiceChannels || {};
      for (const [channelId, value] of Object.entries(voiceChannels)) {
        const channelIdStr = String(channelId || "");
        if (exclude && exclude.has(channelIdStr)) continue;
        if (!includeVoice.has(channelIdStr)) continue;
        current.voiceSeconds += Number(value || 0);
      }
    } else {
      current.voiceSeconds += sumVoiceSecondsFromHourRow(row, exclude);
    }
    byDay.set(dayKey, current);
  }

  return byDay;
}

async function getServerActivityStats(guildId, days = 7) {
  const dateKeys = getLastNDaysKeys(days);
  const rows = await loadDailyRows(guildId, dateKeys);

  const userText = new Map();
  const userVoice = new Map();
  const channelText = new Map();
  const channelVoice = new Map();

  for (const row of rows) {
    const textCount = Number(row?.textCount || 0);
    const voiceSeconds = Number(row?.voiceSeconds || 0);
    pushMapValue(userText, String(row.userId || ""), textCount);
    pushMapValue(userVoice, String(row.userId || ""), voiceSeconds);

    const textChannels = row?.textChannels || {};
    for (const [channelId, value] of Object.entries(textChannels)) {
      pushMapValue(channelText, String(channelId || ""), Number(value || 0));
    }

    const voiceChannels = row?.voiceChannels || {};
    for (const [channelId, value] of Object.entries(voiceChannels)) {
      pushMapValue(channelVoice, String(channelId || ""), Number(value || 0));
    }
  }
  const liveOverlay = await getLiveVoiceOverlay(guildId, days);
  for (const [userId, value] of liveOverlay.userVoice.entries()) {
    pushMapValue(userVoice, userId, value);
  }
  for (const [channelId, value] of liveOverlay.channelVoice.entries()) {
    pushMapValue(channelVoice, channelId, value);
  }

  if (rows.length === 0) {
    const users = await ActivityUserProfile.find({ guildId })
      .select("userId profile.totals.messagesWeekly profile.totals.messagesTotal profile.totals.voiceWeeklySeconds profile.totals.voiceTotalSeconds")
      .lean()
      .catch(() => []);

    const retroUserText = new Map();
    const retroUserVoice = new Map();
    let retroTextTotal = 0;
    let retroVoiceTotal = 0;
    const useWeekly = Number(days || 7) <= 7;

    for (const row of users) {
      const t = row?.profile?.totals || {};
      const textValue = Number(useWeekly ? t.messagesWeekly : t.messagesTotal) || 0;
      const voiceValue = Number(useWeekly ? t.voiceWeeklySeconds : t.voiceTotalSeconds) || 0;
      pushMapValue(retroUserText, String(row?.userId || ""), textValue);
      pushMapValue(retroUserVoice, String(row?.userId || ""), voiceValue);
      retroTextTotal += textValue;
      retroVoiceTotal += voiceValue;
    }
    for (const [userId, value] of liveOverlay.userVoice.entries()) {
      pushMapValue(retroUserVoice, userId, value);
    }
    retroVoiceTotal += Number(liveOverlay.totalVoiceSeconds || 0);

    return {
      days: Math.max(1, Math.min(31, Number(days || 7))),
      totals: {
        text: retroTextTotal,
        voiceSeconds: retroVoiceTotal,
      },
      topUsersText: topNFromMap(retroUserText, 3),
      topUsersVoice: topNFromMap(retroUserVoice, 3),
      topChannelsText: [],
      topChannelsVoice: [],
      approximate: true,
    };
  }

  return {
    days: Math.max(1, Math.min(31, Number(days || 7))),
    totals: {
      text: Array.from(userText.values()).reduce(
        (sum, value) => sum + value,
        0,
      ),
      voiceSeconds: Array.from(userVoice.values()).reduce(
        (sum, value) => sum + value,
        0,
      ),
    },
    topUsersText: topNFromMap(userText, 3),
    topUsersVoice: topNFromMap(userVoice, 3),
    topChannelsText: topNFromMap(channelText, 3),
    topChannelsVoice: topNFromMap(channelVoice, 3),
    approximate: false,
  };
}

async function getServerOverviewStats(guildId, lookbackDays = 14, topLimit = 3) {
  const safeTopLimit = Math.max(1, Math.min(500, Number(topLimit || 3)));
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  await ensureHourlyBackfillForGuild(guildId);
  const hourKeys1 = getLastNHourKeys(24);
  const hourKeys7 = getLastNHourKeys(24 * 7);
  const hourKeys14 = getLastNHourKeys(24 * 14);
  const hourKeys21 = getLastNHourKeys(24 * 21);
  const hourKeys30 = getLastNHourKeys(24 * 30);
  const hourKeysLookback = getLastNHourKeys(24 * safeLookback);
  const allHourKeys = Array.from(new Set([...hourKeys1, ...hourKeys7, ...hourKeys14, ...hourKeys21, ...hourKeys30, ...hourKeysLookback,]),);
  const dayKeysLookback = getLastNDaysKeys(safeLookback);
  const hourlyRows = await loadHourlyRows(guildId, allHourKeys);
  const agg1 = aggregateFromHourlyRows(hourlyRows, hourKeys1, safeTopLimit);
  const agg7 = aggregateFromHourlyRows(hourlyRows, hourKeys7, safeTopLimit);
  const agg14 = aggregateFromHourlyRows(hourlyRows, hourKeys14, safeTopLimit);
  const agg21 = aggregateFromHourlyRows(hourlyRows, hourKeys21, safeTopLimit);
  const agg30 = aggregateFromHourlyRows(hourlyRows, hourKeys30, safeTopLimit);
  const aggLookback = aggregateFromHourlyRows(hourlyRows, hourKeysLookback, safeTopLimit,);
  const chartByDay = buildChartByDayFromHourlyRows(hourlyRows, hourKeysLookback,);

  const chartPoints = dayKeysLookback.slice().reverse().map((dayKey) => { const point = chartByDay.get(dayKey) || { text: 0, voiceSeconds: 0, }; return { dayKey, text: Number(point.text || 0), voiceSeconds: Number(point.voiceSeconds || 0), }; }); const liveOverlayLookback = await getLiveVoiceOverlay(guildId, safeLookback);
  if (liveOverlayLookback.totalVoiceSeconds > 0) {
    const liveSessions = await loadLiveVoiceSessions(guildId);
    const nowMs = Date.now();
    const byUserLookback = toMapFromTopList(aggLookback.topUsersVoice);
    const byChannelLookback = toMapFromTopList(aggLookback.topChannelsVoice);
    const contributorSets = { d1: new Set(agg1?.contributorIds || []), d7: new Set(agg7?.contributorIds || []), d14: new Set(agg14?.contributorIds || []), d21: new Set(agg21?.contributorIds || []), d30: new Set(agg30?.contributorIds || []), };
    const windowsAgg = { d1: agg1, d7: agg7, d14: agg14, d21: agg21, d30: agg30, };

    for (const row of liveSessions) {
      const userId = String(row?.userId || "");
      const startedAt = row?.voice?.sessionStartedAt;
      const channelId = String(row?.voice?.sessionChannelId || "");
      if (!userId || !startedAt) continue;

      for (const days of [1, 7, 14, 21, 30]) {
        const key = `d${days}`;
        const addSeconds = secondsInLastNDays(startedAt, days, nowMs);
        if (!addSeconds) continue;
        windowsAgg[key].totals.voiceSeconds += addSeconds;
        contributorSets[key].add(userId);
      }

      const addLookback = Number(liveOverlayLookback.userVoice.get(userId) || 0) || 0;
      if (addLookback > 0) {
        byUserLookback.set(userId, (byUserLookback.get(userId) || 0) + addLookback);
        if (channelId) {
          byChannelLookback.set(
            channelId,
            (byChannelLookback.get(channelId) || 0) + addLookback,
          );
        }
        const lastPoint = chartPoints[chartPoints.length - 1];
        if (lastPoint) lastPoint.voiceSeconds += addLookback;
      }
    }

    agg1.contributors = contributorSets.d1.size;
    agg7.contributors = contributorSets.d7.size;
    agg14.contributors = contributorSets.d14.size;
    agg21.contributors = contributorSets.d21.size;
    agg30.contributors = contributorSets.d30.size;
    aggLookback.topUsersVoice = topNFromMap(byUserLookback, safeTopLimit);
    aggLookback.topChannelsVoice = topNFromMap(byChannelLookback, safeTopLimit);
  }

  const hasTrackedRows = hourlyRows.length > 0;
  if (!hasTrackedRows) {
    const users = await ActivityUserProfile.find({ guildId })
      .select("userId profile.totals.messagesWeekly profile.totals.messagesTotal profile.totals.voiceWeeklySeconds profile.totals.voiceTotalSeconds")
      .lean()
      .catch(() => []);
    const userText = new Map();
    const userVoice = new Map();
    let totalText7 = 0;
    let totalVoice7 = 0;
    let totalText14 = 0;
    let totalVoice14 = 0;
    let totalText21 = 0;
    let totalVoice21 = 0;
    let totalText30 = 0;
    let totalVoice30 = 0;

    for (const row of users) {
      const id = String(row?.userId || "");
      const t = row?.profile?.totals || {};
      const textWeekly = Number(t.messagesWeekly || 0);
      const textTotal = Number(t.messagesTotal || 0);
      const voiceWeekly = Number(t.voiceWeeklySeconds || 0);
      const voiceTotal = Number(t.voiceTotalSeconds || 0);
      totalText7 += textWeekly;
      totalVoice7 += voiceWeekly;
      totalText14 += textTotal;
      totalVoice14 += voiceTotal;
      totalText21 += textTotal;
      totalVoice21 += voiceTotal;
      totalText30 += textTotal;
      totalVoice30 += voiceTotal;
      pushMapValue(userText, id, textTotal);
      pushMapValue(userVoice, id, voiceTotal);
    }

    const live1 = await getLiveVoiceOverlay(guildId, 1);
    const liveContrib1 = new Set(
      [...(live1.userVoice?.keys?.() || [])].map(String).filter(Boolean),
    );
    const fallbackWindows = {
      d1: {
        text: 0,
        voiceSeconds: Number(live1.totalVoiceSeconds || 0),
        contributors: liveContrib1.size,
      },
      d7: { text: totalText7, voiceSeconds: totalVoice7, contributors: 0 },
      d14: { text: totalText14, voiceSeconds: totalVoice14, contributors: 0 },
      d21: { text: totalText21, voiceSeconds: totalVoice21, contributors: 0 },
      d30: { text: totalText30, voiceSeconds: totalVoice30, contributors: 0 },
    };

    return {
      approximate: true,
      lookbackDays: safeLookback,
      windows: fallbackWindows,
      topUsersText: topNFromMap(userText, safeTopLimit),
      topUsersVoice: topNFromMap(userVoice, safeTopLimit),
      topChannelsText: [],
      topChannelsVoice: [],
      chart: chartPoints,
    };
  }

  return {
    approximate: false,
    lookbackDays: safeLookback,
    windows: {
      d1: {
        text: agg1.totals.text,
        voiceSeconds: agg1.totals.voiceSeconds,
        contributors: agg1.contributors,
      },
      d7: {
        text: agg7.totals.text,
        voiceSeconds: agg7.totals.voiceSeconds,
        contributors: agg7.contributors,
      },
      d14: {
        text: agg14.totals.text,
        voiceSeconds: agg14.totals.voiceSeconds,
        contributors: agg14.contributors,
      },
      d21: {
        text: agg21.totals.text,
        voiceSeconds: agg21.totals.voiceSeconds,
        contributors: agg21.contributors,
      },
      d30: {
        text: agg30.totals.text,
        voiceSeconds: agg30.totals.voiceSeconds,
        contributors: agg30.contributors,
      },
    },
    topUsersText: aggLookback.topUsersText,
    topUsersVoice: aggLookback.topUsersVoice,
    topChannelsText: aggLookback.topChannelsText,
    topChannelsVoice: aggLookback.topChannelsVoice,
    chart: chartPoints,
  };
}

async function getUserOverviewStats(guildId, userId, lookbackDays = 14, excludeVoiceChannelIds = null, options = null) {
  const exclude =
    excludeVoiceChannelIds instanceof Set && excludeVoiceChannelIds.size > 0 ? excludeVoiceChannelIds : null;
  const includeText =
    options?.includeTextChannelIds instanceof Set && options.includeTextChannelIds.size > 0
      ? options.includeTextChannelIds
      : null;
  const includeVoice =
    options?.includeVoiceChannelIds instanceof Set && options.includeVoiceChannelIds.size > 0
      ? options.includeVoiceChannelIds
      : null;
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  if (HOURLY_BACKFILL_PREFIX_MAX_WAIT_MS > 0) {
    let timer;
    try {
      const timeoutP = new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), HOURLY_BACKFILL_PREFIX_MAX_WAIT_MS);
        if (typeof timer.unref === "function") timer.unref();
      });
      await Promise.race([ensureHourlyBackfillForGuild(guildId), timeoutP]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  } else {
    await ensureHourlyBackfillForGuild(guildId);
  }
  const lookbackKey = `d${safeLookback}`;
  const hourKeys1 = getLastNHourKeys(24);
  const hourKeys7 = getLastNHourKeys(24 * 7);
  const hourKeys14 = getLastNHourKeys(24 * 14);
  const hourKeys21 = getLastNHourKeys(24 * 21);
  const hourKeys30 = getLastNHourKeys(24 * 30);
  const hourKeysLookback = getLastNHourKeys(24 * safeLookback);
  const allHourKeys = Array.from(new Set([...hourKeys1, ...hourKeys7, ...hourKeys14, ...hourKeys21, ...hourKeys30, ...hourKeysLookback,]),);
  const dayKeysLookback = getLastNDaysKeys(safeLookback);

  const userRows = await loadHourlyRows(guildId, allHourKeys, userId);

  const agg1 = aggregateUserHourlyRows(userRows, hourKeys1, exclude, includeText, includeVoice);
  const agg7 = aggregateUserHourlyRows(userRows, hourKeys7, exclude, includeText, includeVoice);
  const agg14 = aggregateUserHourlyRows(userRows, hourKeys14, exclude, includeText, includeVoice);
  const agg21 = aggregateUserHourlyRows(userRows, hourKeys21, exclude, includeText, includeVoice);
  const agg30 = aggregateUserHourlyRows(userRows, hourKeys30, exclude, includeText, includeVoice);
  const aggLookback = aggregateUserHourlyRows(userRows, hourKeysLookback, exclude, includeText, includeVoice);
  const userChartByDay = buildChartByDayFromHourlyRows(userRows, hourKeysLookback, exclude, includeText, includeVoice);

  const chart = dayKeysLookback.slice().reverse().map((dayKey) => {
    const point = userChartByDay.get(dayKey) || { text: 0, voiceSeconds: 0 };
    return { dayKey, text: Number(point.text || 0), voiceSeconds: Number(point.voiceSeconds || 0) };
  });
  const liveDoc = await ActivityUserProfile.findOne({ guildId, userId, "profile.totals.sessionStartedAt": { $ne: null } })
    .select("profile.totals.sessionStartedAt profile.totals.sessionChannelId")
    .lean()
    .catch(() => null);

  if (liveDoc?.profile?.totals?.sessionStartedAt) {
    const nowMs = Date.now();
    const startedAt = liveDoc.profile?.totals?.sessionStartedAt;
    const channelId = String(liveDoc?.profile?.totals?.sessionChannelId || "");
    const skipLiveVoice = Boolean(
      (exclude && channelId && exclude.has(channelId)) ||
      (includeVoice && channelId && !includeVoice.has(channelId)),
    );
    if (!skipLiveVoice) {
      const add1 = secondsInLastNDays(startedAt, 1, nowMs);
      const add7 = secondsInLastNDays(startedAt, 7, nowMs);
      const add14 = secondsInLastNDays(startedAt, 14, nowMs);
      const add21 = secondsInLastNDays(startedAt, 21, nowMs);
      const add30 = secondsInLastNDays(startedAt, 30, nowMs);
      const addLookback = secondsInLastNDays(startedAt, safeLookback, nowMs);
      agg1.voiceSeconds += add1;
      agg7.voiceSeconds += add7;
      agg14.voiceSeconds += add14;
      agg21.voiceSeconds += add21;
      agg30.voiceSeconds += add30;
      if (addLookback > 0) {
        if (channelId) {
          const byChannel = toMapFromTopList(aggLookback.topChannelsVoice);
          byChannel.set(channelId, (byChannel.get(channelId) || 0) + addLookback);
          aggLookback.topChannelsVoice = topNFromMap(byChannel, 3);
        }
        const lastPoint = chart[chart.length - 1];
        if (lastPoint) lastPoint.voiceSeconds += addLookback;
      }
    }
  }

  const guildRows14 = await loadHourlyRows(guildId, hourKeysLookback);

  const rankTextMap = new Map();
  const rankVoiceMap = new Map();
  for (const row of guildRows14) {
    const id = String(row?.userId || "");
    pushMapValue(rankTextMap, id, sumTextFromHourRow(row, includeText));
    if (includeVoice) {
      const voiceChannels = row?.voiceChannels || {};
      let voiceIncluded = 0;
      for (const [channelId, value] of Object.entries(voiceChannels)) {
        const channelIdStr = String(channelId || "");
        if (exclude && exclude.has(channelIdStr)) continue;
        if (!includeVoice.has(channelIdStr)) continue;
        voiceIncluded += Number(value || 0);
      }
      pushMapValue(rankVoiceMap, id, voiceIncluded);
    } else {
      pushMapValue(rankVoiceMap, id, sumVoiceSecondsFromHourRow(row, exclude));
    }
  }

  const liveGuildSessions = await loadLiveVoiceSessions(guildId);
  if (liveGuildSessions.length) {
    const nowMs = Date.now();
    for (const row of liveGuildSessions) {
      const id = String(row?.userId || "");
      const startedAt = row?.voice?.sessionStartedAt;
      if (!id || !startedAt) continue;
      const add = secondsInLastNDays(startedAt, safeLookback, nowMs);
      if (!add) continue;
      const channelId = String(row?.voice?.sessionChannelId || "");
      if (exclude && channelId && exclude.has(channelId)) continue;
      if (includeVoice && channelId && !includeVoice.has(channelId)) continue;
      pushMapValue(rankVoiceMap, id, add);
    }
  }

  let rankText = safeTopRank(rankTextMap, userId);
  let rankVoice = safeTopRank(rankVoiceMap, userId);

  if (!userRows.length) {
    const doc = await ActivityUserProfile.findOne({ guildId, userId }).select("profile.totals").lean().catch(() => null);
    const t = doc?.profile?.totals || {};
    const fallback = {
      d1: { text: Number(t.messagesDaily || 0), voiceSeconds: Number(t.voiceDailySeconds || 0) },
      d7: { text: Number(t.messagesWeekly || 0), voiceSeconds: Number(t.voiceWeeklySeconds || 0) },
      d14: { text: Number(t.messagesTotal || 0), voiceSeconds: Number(t.voiceTotalSeconds || 0) },
      d21: { text: Number(t.messagesTotal || 0), voiceSeconds: Number(t.voiceTotalSeconds || 0) },
      d30: { text: Number(t.messagesTotal || 0), voiceSeconds: Number(t.voiceTotalSeconds || 0) },
    };
    return {
      approximate: true,
      lookbackDays: safeLookback,
      windows: fallback,
      ranks: { text: rankText, voice: rankVoice },
      topChannelsText: [],
      topChannelsVoice: [],
      chart,
    };
  }

  return {
    approximate: false,
    lookbackDays: safeLookback,
    windows: {
      d1: {
        text: agg1.text,
        voiceSeconds: agg1.voiceSeconds,
      },
      d7: { text: agg7.text, voiceSeconds: agg7.voiceSeconds },
      d14: { text: agg14.text, voiceSeconds: agg14.voiceSeconds },
      d21: { text: agg21.text, voiceSeconds: agg21.voiceSeconds },
      d30: { text: agg30.text, voiceSeconds: agg30.voiceSeconds },
    },
    ranks: { text: rankText, voice: rankVoice },
    topChannelsText: aggLookback.topChannelsText,
    topChannelsVoice: aggLookback.topChannelsVoice,
    chart,
  };
}

async function syncLiveVoiceSessionsFromGateway(client) {
  if (!client?.guilds?.cache) return;
  const now = new Date();

  for (const guild of client.guilds.cache.values()) {
    const guildId = String(guild?.id || "");
    if (!guildId) continue;

    const activeUserIds = new Set();
    for (const state of guild.voiceStates?.cache?.values?.() || []) {
      const member = state?.member;
      if (!member || member.user?.bot) continue;
      if (!isCountableVoiceState(state)) continue;
      const userId = String(member.id || "");
      if (!userId) continue;
      activeUserIds.add(userId);

      await ActivityUserProfile.updateOne(
        { guildId, userId, "profile.totals.sessionStartedAt": { $eq: null } },
        {
          $set: {
            "profile.totals.sessionStartedAt": now,
            "profile.totals.sessionChannelId": String(state.channelId || ""),
            "profile.totals.expAwardedSeconds": 0,
            "profile.totals.voiceActivityBucketFlushSeconds": 0,
          },
          $setOnInsert: { guildId, userId },
        },
        { upsert: true },
      ).catch(() => { });

      await ActivityUserProfile.updateOne(
        { guildId, userId, "profile.totals.sessionStartedAt": { $ne: null } },
        {
          $set: {
            "profile.totals.sessionChannelId": String(state.channelId || ""),
          },
        },
      ).catch(() => { });
    }

    const openSessions = await ActivityUserProfile.find({ guildId, "profile.totals.sessionStartedAt": { $ne: null } })
      .select("userId")
      .lean()
      .catch(() => []);

    for (const row of openSessions) {
      const userId = String(row?.userId || "");
      if (!userId || activeUserIds.has(userId)) continue;
      await ActivityUserProfile.updateOne(
        { guildId, userId },
        {
          $set: {
            "profile.totals.sessionStartedAt": null,
            "profile.totals.sessionChannelId": null,
            "profile.totals.expAwardedSeconds": 0,
            "profile.totals.voiceActivityBucketFlushSeconds": 0,
          },
        },
      ).catch(() => { });
    }
  }
}

const LIVE_VOICE_EXP_BATCH_SIZE = Math.max(10, Math.min(200, Number(process.env.LIVE_VOICE_EXP_BATCH_SIZE) || 80));
/** Minimo secondi “live” prima di scrivere daily/hourly mentre sei ancora in vocale (default 15). */
const VOICE_ACTIVITY_BUCKET_FLUSH_SEC = Math.max(5, Math.min(120, Number(process.env.VOICE_ACTIVITY_BUCKET_FLUSH_SEC) || 15));

async function runLiveVoiceExpTick(client) {
  if (!client?.guilds?.cache) return;
  const nowMs = Date.now();
  const rows = await ActivityUserProfile.find({ "profile.totals.sessionStartedAt": { $ne: null } })
    .select("guildId userId profile.totals.sessionStartedAt profile.totals.sessionChannelId profile.totals.expAwardedSeconds profile.totals.voiceActivityBucketFlushSeconds")
    .sort({ "profile.totals.sessionStartedAt": 1 })
    .limit(LIVE_VOICE_EXP_BATCH_SIZE)
    .lean()
    .catch(() => []);

  for (const row of rows) {
    const guildId = String(row?.guildId || "");
    const userId = String(row?.userId || "");
    const startedAt = row?.profile?.totals?.sessionStartedAt;
    const channelId = String(row?.profile?.totals?.sessionChannelId || "");
    if (!guildId || !userId || !startedAt || !channelId) continue;

    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) continue;

    const member = guild.members?.cache?.get(userId) || (await guild.members?.fetch(userId).catch(() => null));
    if (!member || member.user?.bot) continue;

    const elapsedSeconds = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000),);
    const flushed = Math.max(0, Math.floor(Number(row?.profile?.totals?.voiceActivityBucketFlushSeconds || 0)));
    const pendingBucket = Math.max(0, elapsedSeconds - flushed);
    if (pendingBucket >= VOICE_ACTIVITY_BUCKET_FLUSH_SEC && isValidGuildUserIdChannelId(guildId, userId, channelId)) {
      await bumpDailyVoice(guildId, userId, channelId, pendingBucket);
      await bumpHourlyVoice(guildId, userId, channelId, pendingBucket);
      const rowId = row?._id;
      if (rowId) {
        await ActivityUserProfile.updateOne(
          { _id: rowId },
          { $inc: { "profile.totals.voiceActivityBucketFlushSeconds": pendingBucket } },
        ).catch(() => { });
      }
    }

    const alreadyAwardedSeconds = Math.max(0, Number(row?.profile?.totals?.expAwardedSeconds || 0),);
    const totalAwardableExp = Math.floor((elapsedSeconds * VOICE_EXP_PER_MINUTE) / 60,);
    const alreadyAwardedExp = Math.floor((alreadyAwardedSeconds * VOICE_EXP_PER_MINUTE) / 60,);
    const grantableExp = Math.max(0, totalAwardableExp - alreadyAwardedExp);
    if (grantableExp <= 0) continue;
    const ignored = await shouldIgnoreExpForMember({ guildId, member, channelId, });

    if (!ignored) {
      await addExpWithLevel(guild, userId, grantableExp, true, true, { source: "activity" }).catch(() => { });
    }

    await ActivityUserProfile.updateOne(
      {
        guildId,
        userId,
        "profile.totals.sessionStartedAt": row?.profile?.totals?.sessionStartedAt || null,
      },
      { $set: { "profile.totals.expAwardedSeconds": elapsedSeconds } },
    ).catch(() => { });
  }
}

const LIVE_VOICE_EXP_DEFAULT_INTERVAL_MS = Number(process.env.LIVE_VOICE_EXP_INTERVAL_MS) || 30_000;

function startLiveVoiceExpLoop(client, intervalMs) {
  const resolved = Number(intervalMs ?? LIVE_VOICE_EXP_DEFAULT_INTERVAL_MS) || LIVE_VOICE_EXP_DEFAULT_INTERVAL_MS;
  const safeInterval = Math.max(10_000, Math.min(300_000, resolved));
  if (client?._liveVoiceExpInterval) return client._liveVoiceExpInterval;
  const runner = () => runLiveVoiceExpTick(client).catch((error) => { global.logger?.warn?.("[LIVE VOICE EXP] Tick failed:", error?.message || error,); });
  runner();
  client._liveVoiceExpInterval = setInterval(runner, safeInterval);
  client._liveVoiceExpInterval.unref?.();
  return client._liveVoiceExpInterval;
}

async function getChannelOverviewStats(guildId, channelId, lookbackDays = 14) {
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  const channelIdStr = String(channelId || "");
  if (!guildId || !channelIdStr) {
    return {
      lookbackDays: safeLookback,
      windows: { d1: {}, d7: {}, d14: {}, d21: {}, d30: {} },
      topUsersText: [],
      topUsersVoice: [],
      chart: [],
    };
  }
  const dayKeys1 = getLastNDaysKeys(1);
  const dayKeys7 = getLastNDaysKeys(7);
  const dayKeys14 = getLastNDaysKeys(14);
  const dayKeys21 = getLastNDaysKeys(21);
  const dayKeys30 = getLastNDaysKeys(30);
  const dayKeysLookback = getLastNDaysKeys(safeLookback);
  const allKeys = Array.from(new Set([...dayKeys1, ...dayKeys7, ...dayKeys14, ...dayKeys21, ...dayKeys30, ...dayKeysLookback]));
  const rows = await loadDailyRows(guildId, allKeys);

  const getChannelVal = (row, key) => {
    const map = row?.[key];
    if (!map) return 0;
    const v = typeof map.get === "function" ? map.get(channelIdStr) : map[channelIdStr];
    return Math.max(0, Number(v || 0));
  };

  const byDay = new Map();
  const userTextAll = new Map();
  const userVoiceAll = new Map();
  const contrib1 = new Set();
  const contrib7 = new Set();
  const contrib14 = new Set();
  const contrib21 = new Set();
  const contrib30 = new Set();

  for (const row of rows) {
    const dateKey = String(row?.dateKey || "");
    const userId = String(row?.userId || "");
    const textVal = getChannelVal(row, "textChannels");
    const voiceVal = getChannelVal(row, "voiceChannels");
    if (textVal <= 0 && voiceVal <= 0) continue;

    if (dateKey) {
      const cur = byDay.get(dateKey) || { text: 0, voiceSeconds: 0 };
      cur.text += textVal;
      cur.voiceSeconds += voiceVal;
      byDay.set(dateKey, cur);
    }
    pushMapValue(userTextAll, userId, textVal);
    pushMapValue(userVoiceAll, userId, voiceVal);
    if (dayKeys1.includes(dateKey)) contrib1.add(userId);
    if (dayKeys7.includes(dateKey)) contrib7.add(userId);
    if (dayKeys14.includes(dateKey)) contrib14.add(userId);
    if (dayKeys21.includes(dateKey)) contrib21.add(userId);
    if (dayKeys30.includes(dateKey)) contrib30.add(userId);
  }

  const sumForKeys = (keys) => {
    let text = 0;
    let voice = 0;
    for (const key of keys) {
      const cur = byDay.get(key);
      if (cur) {
        text += cur.text;
        voice += cur.voiceSeconds;
      }
    }
    return { text, voiceSeconds: voice };
  };

  const liveOverlay = await getLiveVoiceOverlay(guildId, safeLookback);
  const liveForChannel = Number(liveOverlay.channelVoice?.get?.(channelIdStr) || 0);
  if (liveForChannel > 0) {
    const lastKey = dayKeysLookback[dayKeysLookback.length - 1];
    if (lastKey) {
      const cur = byDay.get(lastKey) || { text: 0, voiceSeconds: 0 };
      cur.voiceSeconds += liveForChannel;
      byDay.set(lastKey, cur);
    }
  }

  const d1 = sumForKeys(dayKeys1);
  const d7 = sumForKeys(dayKeys7);
  const d14 = sumForKeys(dayKeys14);
  const d21 = sumForKeys(dayKeys21);
  const d30 = sumForKeys(dayKeys30);

  const chart = dayKeysLookback.slice().reverse().map((dayKey) => {
    const point = byDay.get(dayKey) || { text: 0, voiceSeconds: 0 };
    return {
      dayKey,
      text: Number(point.text || 0),
      voiceSeconds: Number(point.voiceSeconds || 0),
    };
  });

  return {
    lookbackDays: safeLookback,
    windows: {
      d1: { ...d1, contributors: contrib1.size },
      d7: { ...d7, contributors: contrib7.size },
      d14: { ...d14, contributors: contrib14.size },
      d21: { ...d21, contributors: contrib21.size },
      d30: { ...d30, contributors: contrib30.size },
    },
    topUsersText: topNFromMap(userTextAll, 3),
    topUsersVoice: topNFromMap(userVoiceAll, 3),
    chart,
  };
}

module.exports = {
  recordMessageActivity,
  handleVoiceActivity,
  getUserActivityStats,
  getServerActivityStats,
  getServerOverviewStats,
  getUserOverviewStats,
  getChannelOverviewStats,
  getLiveVoiceOverlay,
  loadLiveVoiceSessions,
  loadDailyRows,
  secondsInDateKeys,
  syncLiveVoiceSessionsFromGateway,
  runLiveVoiceExpTick,
  startLiveVoiceExpLoop,
};