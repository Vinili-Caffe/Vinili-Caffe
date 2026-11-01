const mongoose = require("mongoose") as typeof import("mongoose");

const { Schema, model, models } = mongoose;

const DAILY_STATS_COLLECTION = "dailystats";
const MIGRATION_SCOPE = "migration";
const MIGRATION_GUILD_ID = "global";
const LEGACY_MIGRATION_KEY = "legacyDailyStats.v1";

const dailyStatsSchema = new Schema(
  {
    scope: { type: String, required: true, index: true },
    guildId: { type: String, required: true, index: true },
    dateKey: { type: String, default: "", index: true },
    value: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);
dailyStatsSchema.index({ scope: 1, guildId: 1, dateKey: 1 }, { unique: true });

const DailyStats: import("mongoose").Model<import("mongoose").InferSchemaType<typeof dailyStatsSchema>> =
  models.DailyStats ||
  model("DailyStats", dailyStatsSchema, DAILY_STATS_COLLECTION);

let migrationPromise = null;

function isMongoReady() {
  return mongoose.connection?.readyState === 1;
}

function cleanObject(value?) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanString(value?) {
  return String(value || "").trim();
}

function numberOrZero(value?) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function toDateOrNull(value?) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function findDailyStats(scope?, guildId?, dateKey = "") {
  return DailyStats.findOne({
    scope: String(scope || ""),
    guildId: String(guildId || ""),
    dateKey: String(dateKey || ""),
  }).catch(() => null);
}

async function getOrCreateDailyStats(scope?, guildId?, dateKey = "", defaultValue: Record<string, any> = {}) {
  if (!isMongoReady()) return null;
  return DailyStats.findOneAndUpdate(
    {
      scope: String(scope || ""),
      guildId: String(guildId || ""),
      dateKey: String(dateKey || ""),
    },
    {
      $setOnInsert: {
        scope: String(scope || ""),
        guildId: String(guildId || ""),
        dateKey: String(dateKey || ""),
        value: defaultValue,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((err?) => {
    global.logger?.warn?.("[DAILY STATS STORE] get/create failed:", err?.message || err);
    return null;
  });
}

async function incrementDailyStatsValue(scope?, guildId?, dateKey?, increment: Record<string, any> = {}, defaultValue: Record<string, any> = {}) {
  if (!isMongoReady()) return null;
  const inc: Record<string, any> = {};
  for (const [key, value] of Object.entries(increment || {})) {
    const n = numberOrZero(value);
    if (n !== 0) inc[`value.${key}`] = n;
  }
  if (!Object.keys(inc).length) return null;
  return DailyStats.updateOne(
    { scope, guildId, dateKey },
    {
      $setOnInsert: { scope, guildId, dateKey },
      $inc: inc,
    },
    { upsert: true },
  ).catch((err?) => {
    global.logger?.warn?.("[DAILY STATS STORE] increment failed:", err?.message || err);
    return null;
  });
}

async function addToSetDailyStatsValue(scope?, guildId?, dateKey?, addToSet: Record<string, any> = {}, defaultValue: Record<string, any> = {}) {
  if (!isMongoReady()) return null;
  const set: Record<string, any> = {};
  for (const [key, value] of Object.entries(addToSet || {})) {
    if (value == null || value === "") continue;
    set[`value.${key}`] = String(value);
  }
  if (!Object.keys(set).length) return null;
  return DailyStats.updateOne(
    { scope, guildId, dateKey },
    {
      $setOnInsert: { scope, guildId, dateKey },
      $addToSet: set,
    },
    { upsert: true },
  ).catch((err?) => {
    global.logger?.warn?.("[DAILY STATS STORE] addToSet failed:", err?.message || err);
    return null;
  });
}

async function getSeenUser(scope?, guildId?, userId?, bucket = "users") {
  const uid = cleanString(userId);
  if (!uid) return null;
  const doc = await findDailyStats(scope, guildId, "");
  return cleanObject(cleanObject(doc?.value)[bucket])[uid] || null;
}

async function setSeenUser(scope?, guildId?, userId?, payload: Record<string, any> = {}, bucket = "users") {
  const uid = cleanString(userId);
  if (!uid || !isMongoReady()) return null;
  return DailyStats.updateOne(
    { scope, guildId, dateKey: "" },
    {
      $setOnInsert: { scope, guildId, dateKey: "" },
      $set: { [`value.${bucket}.${uid}`]: payload },
    },
    { upsert: true },
  ).catch((err?) => {
    global.logger?.warn?.("[DAILY STATS STORE] seen set failed:", err?.message || err);
    return null;
  });
}

async function collectionExists(db?, name?) {
  if (!db || !name) return false;
  return db.listCollections({ name }).hasNext().catch(() => false);
}

async function migrateMemberStats(db?) {
  if (await collectionExists(db, "dailymemberstats")) {
    const rows = await db.collection("dailymemberstats").find({}).toArray();
    for (const row of rows) {
      const guildId = cleanString(row.guildId);
      const dateKey = cleanString(row.dateKey);
      if (!guildId || !dateKey) continue;
      await DailyStats.updateOne(
        { scope: "memberDaily", guildId, dateKey },
        {
          $setOnInsert: { scope: "memberDaily", guildId, dateKey },
          $max: {
            "value.newUsers": numberOrZero(row.newUsers),
            "value.joinedUsers": numberOrZero(row.joinedUsers),
            "value.leftUsers": numberOrZero(row.leftUsers),
          },
          ...(row.reportMessageId || row.reportedAt
            ? {
                $set: {
                  ...(row.reportMessageId ? { "value.reportMessageId": cleanString(row.reportMessageId) } : {}),
                  ...(row.reportedAt ? { "value.reportedAt": row.reportedAt } : {}),
                },
              }
            : {}),
        },
        { upsert: true },
      );
    }
  }

  if (await collectionExists(db, "dailymemberstatsseenusers")) {
    const rows = await db.collection("dailymemberstatsseenusers").find({}).toArray();
    for (const row of rows) {
      const guildId = cleanString(row.guildId);
      const userId = cleanString(row.userId);
      if (!guildId || !userId) continue;
      await setSeenUser("memberSeen", guildId, userId, {
        firstJoinedAt: toDateOrNull(row.firstJoinedAt) || toDateOrNull(row.createdAt) || new Date(),
        lastJoinedAt: toDateOrNull(row.lastJoinedAt) || toDateOrNull(row.updatedAt) || new Date(),
      });
    }
  }
}

async function migrateEngagementStats(db?) {
  if (await collectionExists(db, "dailyengagementstats")) {
    const rows = await db.collection("dailyengagementstats").find({}).toArray();
    for (const row of rows) {
      const guildId = cleanString(row.guildId);
      const dateKey = cleanString(row.dateKey);
      if (!guildId || !dateKey) continue;
      await DailyStats.updateOne(
        { scope: "engagementDaily", guildId, dateKey },
        {
          $setOnInsert: { scope: "engagementDaily", guildId, dateKey },
          $addToSet: {
            "value.chatUserIds": { $each: Array.isArray(row.chatUserIds) ? row.chatUserIds.map(String) : [] },
            "value.newChatUserIds": { $each: Array.isArray(row.newChatUserIds) ? row.newChatUserIds.map(String) : [] },
            "value.voiceUserIds": { $each: Array.isArray(row.voiceUserIds) ? row.voiceUserIds.map(String) : [] },
            "value.newVoiceUserIds": { $each: Array.isArray(row.newVoiceUserIds) ? row.newVoiceUserIds.map(String) : [] },
          },
          ...(row.reportMessageId || row.reportedAt
            ? {
                $set: {
                  ...(row.reportMessageId ? { "value.reportMessageId": cleanString(row.reportMessageId) } : {}),
                  ...(row.reportedAt ? { "value.reportedAt": row.reportedAt } : {}),
                },
              }
            : {}),
        },
        { upsert: true },
      );
    }
  }

  if (await collectionExists(db, "dailyengagementseen")) {
    const rows = await db.collection("dailyengagementseen").find({}).toArray();
    for (const row of rows) {
      const guildId = cleanString(row.guildId);
      const userId = cleanString(row.userId);
      const kind = cleanString(row.kind);
      if (!guildId || !userId || !["chat", "voice"].includes(kind)) continue;
      await setSeenUser("engagementSeen", guildId, userId, {
        firstSeenAt: toDateOrNull(row.firstSeenAt) || toDateOrNull(row.createdAt) || new Date(),
        lastSeenAt: toDateOrNull(row.lastSeenAt) || toDateOrNull(row.updatedAt) || new Date(),
      }, `${kind}Users`);
    }
  }
}

async function migrateChannelMessageStats(db?) {
  if (!(await collectionExists(db, "dailychannelmessagestats"))) return;
  const rows = await db.collection("dailychannelmessagestats").find({}).toArray();
  for (const row of rows) {
    const guildId = cleanString(row.guildId);
    const dateKey = cleanString(row.dateKey);
    if (!guildId || !dateKey) continue;
    await DailyStats.updateOne(
      { scope: "channelMessagesDaily", guildId, dateKey },
      {
        $setOnInsert: { scope: "channelMessagesDaily", guildId, dateKey },
        $max: {
          "value.countingMessages": numberOrZero(row.countingMessages),
          "value.mudaeMessages": numberOrZero(row.mudaeMessages),
          "value.poketwoMessages": numberOrZero(row.poketwoMessages),
          "value.shipMessages": numberOrZero(row.shipMessages),
        },
        ...(row.reportMessageId || row.reportedAt
          ? {
              $set: {
                ...(row.reportMessageId ? { "value.reportMessageId": cleanString(row.reportMessageId) } : {}),
                ...(row.reportedAt ? { "value.reportedAt": row.reportedAt } : {}),
              },
            }
          : {}),
      },
      { upsert: true },
    );
  }
}

async function dropLegacyCollections(db?) {
  const names = [
    "dailychannelmessagestats",
    "dailyengagementseen",
    "dailyengagementstats",
    "dailymemberstats",
    "dailymemberstatsseenusers",
  ];
  for (const name of names) {
    if (!(await collectionExists(db, name))) continue;
    await db.collection(name).drop().catch((err?) => {
      global.logger?.warn?.("[DAILY STATS MIGRATION] drop failed:", name, err?.message || err);
    });
  }
}

async function migrateLegacyDailyStatsCollections(opts: Record<string, any> = {}) {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      return { skipped: true, reason: "mongo_not_ready" };
    }
    const db = mongoose.connection.db;
    const marker = await findDailyStats(MIGRATION_SCOPE, MIGRATION_GUILD_ID, LEGACY_MIGRATION_KEY);
    if (marker?.value?.completedAt) {
      if (opts.dropOld !== false) await dropLegacyCollections(db);
      return { skipped: true, reason: "already_completed" };
    }

    await migrateMemberStats(db);
    await migrateEngagementStats(db);
    await migrateChannelMessageStats(db);

    await DailyStats.updateOne(
      { scope: MIGRATION_SCOPE, guildId: MIGRATION_GUILD_ID, dateKey: LEGACY_MIGRATION_KEY },
      {
        $set: {
          scope: MIGRATION_SCOPE,
          guildId: MIGRATION_GUILD_ID,
          dateKey: LEGACY_MIGRATION_KEY,
          value: {
            completedAt: new Date(),
            fromCollections: [
              "dailychannelmessagestats",
              "dailyengagementseen",
              "dailyengagementstats",
              "dailymemberstats",
              "dailymemberstatsseenusers",
            ],
          },
        },
      },
      { upsert: true },
    );

    if (opts.dropOld !== false) await dropLegacyCollections(db);
    return { skipped: false, completed: true };
  })().finally(() => {
    migrationPromise = null;
  });
  return migrationPromise;
}

export = {
  addToSetDailyStatsValue,
  findDailyStats,
  getOrCreateDailyStats,
  getSeenUser,
  incrementDailyStatsValue,
  migrateLegacyDailyStatsCollections,
  setSeenUser,
};