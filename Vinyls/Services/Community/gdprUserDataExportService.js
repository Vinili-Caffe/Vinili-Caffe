const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const IDs = require("../../Utils/Config/ids");
const {
  ActivityUserProfile,
  SiteDocument,
  SITE_DOCUMENT_TYPE,
  UserLeaveBackup,
  ModCase,
} = require("../../Schemas/Community/communitySchemas");

const COUNTING_RESTORE_DOC_TYPE = SITE_DOCUMENT_TYPE.COUNTING_RESTORE_TOKEN;
const { GuildFeatureBucket } = require("../../Schemas/Guild/guildFeatureBucketSchema");
const { GuildRepost } = require("../../Schemas/Community/repostSchema");

const BOT_ROOT = path.resolve(__dirname, "../..");
const HOGWARTS_LOG_DIR = path.resolve(__dirname, "../../Data/Hogwarts");
const SORTING_LOG_FILE = path.join(HOGWARTS_LOG_DIR, "sorting-log.jsonl");
const HOUSE_ANNOUNCE_LOG_FILE = path.join(HOGWARTS_LOG_DIR, "house-sorting-announce.jsonl");
const SHOP_LOG_FILE = path.join(HOGWARTS_LOG_DIR, "shop-log.jsonl");
const MAX_ATTACHMENT_BYTES = 7.5 * 1024 * 1024;

const LEGACY_USER_COLLECTIONS = Object.freeze([
  "activityusers",
  "expusers",
  "activitydailies",
  "activityhourlies",
  "activitydailycompacts",
  "activityhourlycompacts",
  "levelhistories",
  "levelhistoryusers",
  "mentionreactions",
  "mentionresponses",
  "birthdayprofiles",
]);

function serializeValue(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, val) => {
      if (val instanceof Date) return val.toISOString();
      if (val && typeof val === "object" && typeof val.toHexString === "function") return String(val);
      return val;
    }),
  );
}

function readJsonlRowsForUser(filePath, userId) {
  const uid = String(userId || "").trim();
  if (!uid || !fs.existsSync(filePath)) return [];
  const rows = [];
  try {
    for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed);
        if (String(row?.userId || "").trim() === uid) rows.push(row);
      } catch {
              }
    }
  } catch {
    return [];
  }
  return rows;
}

async function queryLegacyCollection(collectionName, userId, guildId) {
  const db = mongoose.connection?.db;
  if (!db) return [];
  const exists = await db.listCollections({ name: collectionName }).hasNext().catch(() => false);
  if (!exists) return [];
  const uid = String(userId || "").trim();
  const gid = String(guildId || "").trim();
  const filters = [{ userId: uid }];
  if (gid) filters.push({ guildId: gid, userId: uid });
  const seen = new Set();
  const docs = [];
  for (const filter of filters) {
    const key = JSON.stringify(filter);
    if (seen.has(key)) continue;
    seen.add(key);
    const batch = await db.collection(collectionName).find(filter).limit(500).toArray().catch(() => []);
    for (const doc of batch) docs.push(doc);
  }
  return docs;
}

function pickGuildFeatureBucketSlices(bucket, userId) {
  if (!bucket || typeof bucket !== "object") return null;
  const uid = String(userId || "").trim();
  const tickets = (Array.isArray(bucket.tickets) ? bucket.tickets : []).filter(
    (row) => String(row?.userId || "").trim() === uid,
  );
  const giveawaysHosted = (Array.isArray(bucket.giveaways) ? bucket.giveaways : []).filter(
    (row) => String(row?.hostId || "").trim() === uid,
  );
  const giveawaysJoined = (Array.isArray(bucket.giveaways) ? bucket.giveaways : [])
    .map((row) => {
      const participants = Array.isArray(row?.participants) ? row.participants.map(String) : [];
      if (!participants.includes(uid)) return null;
      return {
        ...row,
        participationOnly: String(row?.hostId || "").trim() !== uid,
      };
    })
    .filter(Boolean);
  const suggestionsAuthored = (Array.isArray(bucket.suggestions) ? bucket.suggestions : []).filter(
    (row) => String(row?.AuthorID || row?.authorId || "").trim() === uid,
  );
  const suggestionsVoted = (Array.isArray(bucket.suggestions) ? bucket.suggestions : [])
    .map((row) => {
      const up = Array.isArray(row?.Upmembers) ? row.Upmembers.map(String) : [];
      const down = Array.isArray(row?.Downmembers) ? row.Downmembers.map(String) : [];
      if (!up.includes(uid) && !down.includes(uid)) return null;
      return {
        sID: row?.sID || null,
        vote: up.includes(uid) ? "up" : "down",
        Msg: row?.Msg || "",
      };
    })
    .filter(Boolean);
  if (!tickets.length && !giveawaysHosted.length && !giveawaysJoined.length && !suggestionsAuthored.length && !suggestionsVoted.length) {
    return null;
  }
  return {
    guildId: bucket.guildId,
    tickets,
    giveawaysHosted,
    giveawaysJoined,
    suggestionsAuthored,
    suggestionsVoted,
  };
}

async function exportUserGdprData({ guildId, userId, requestedByUserId }) {
  const uid = String(userId || "").trim();
  const gid = String(guildId || IDs.guilds?.main || "").trim();
  const requestedBy = String(requestedByUserId || "").trim();
  if (!/^\d{16,22}$/.test(uid)) return { ok: false, reason: "invalid_user" };

  const [
    activityProfiles,
    siteDocumentsAsUser,
    siteDocumentsAsRequester,
    siteDocumentsAsStaff,
    siteDocumentsAsOwner,
    leaveBackups,
    modCasesAsSubject,
    modCasesAsModerator,
    guildReposts,
    countingTokens,
    guildFeatureBucket,
    legacyCollections,
  ] = await Promise.all([
    ActivityUserProfile.find({ userId: uid }).lean().catch(() => []),
    SiteDocument.find({ userId: uid }).lean().catch(() => []),
    SiteDocument.find({ requesterId: uid }).lean().catch(() => []),
    SiteDocument.find({ staffUserId: uid }).lean().catch(() => []),
    SiteDocument.find({ ownerId: uid }).lean().catch(() => []),
    UserLeaveBackup.find({ userId: uid }).lean().catch(() => []),
    ModCase ? ModCase.find({ userId: uid }).limit(500).lean().catch(() => []) : Promise.resolve([]),
    ModCase ? ModCase.find({ modId: uid }).limit(500).lean().catch(() => []) : Promise.resolve([]),
    GuildRepost.find({ reposterUserId: uid }).limit(500).lean().catch(() => []),
    SiteDocument.find({ docType: COUNTING_RESTORE_DOC_TYPE, "rawOrder.lostLastUser": uid }).limit(100).lean().catch(() => []),
    gid ? GuildFeatureBucket.findOne({ guildId: gid }).lean().catch(() => null) : Promise.resolve(null),
    Promise.all(LEGACY_USER_COLLECTIONS.map(async (name) => [name, await queryLegacyCollection(name, uid, gid)])),
  ]);

    const comTimeoutSnapshots = (Array.isArray(activityProfiles) ? activityProfiles : [])
    .filter((doc) => Array.isArray(doc?.profile?.muteRoleSnapshot?.roleIds) && doc.profile.muteRoleSnapshot.roleIds.length)
    .map((doc) => ({ guildId: doc.guildId, userId: doc.userId, ...doc.profile.muteRoleSnapshot }));
  const customPerksQueue = (Array.isArray(activityProfiles) ? activityProfiles : [])
    .filter((doc) => doc?.profile?.customPerksDiscordCleanup?.runAt)
    .map((doc) => ({ guildId: doc.guildId, userId: doc.userId, ...doc.profile.customPerksDiscordCleanup }));

  const siteDocuments = [];
  const siteDocIds = new Set();
  for (const batch of [siteDocumentsAsUser, siteDocumentsAsRequester, siteDocumentsAsStaff, siteDocumentsAsOwner]) {
    for (const doc of Array.isArray(batch) ? batch : []) {
      const id = String(doc?._id || "");
      if (!id || siteDocIds.has(id)) continue;
      siteDocIds.add(id);
      siteDocuments.push(doc);
    }
  }

  const hogwartsLogs = {
    sortingLog: readJsonlRowsForUser(SORTING_LOG_FILE, uid),
    houseAnnounceLog: readJsonlRowsForUser(HOUSE_ANNOUNCE_LOG_FILE, uid),
    shopLog: readJsonlRowsForUser(SHOP_LOG_FILE, uid),
  };

  const guildFeatureSlices = pickGuildFeatureBucketSlices(guildFeatureBucket, uid);
  const legacy = Object.fromEntries(
    (Array.isArray(legacyCollections) ? legacyCollections : []).filter(([, rows]) => Array.isArray(rows) && rows.length > 0),
  );

  const payload = serializeValue({
    schemaVersion: 1,
    exportKind: "gdpr_access",
    exportedAt: new Date().toISOString(),
    requestedByUserId: requestedBy || null,
    subject: { userId: uid, guildId: gid || null },
    data: {
      activityUserProfiles: activityProfiles,
      siteDocuments,
      userLeaveBackups: leaveBackups,
      communicationTimeoutRoleSnapshots: comTimeoutSnapshots,
      customPerksDiscordCleanupQueue: customPerksQueue,
      moderationCasesAsSubject: modCasesAsSubject,
      moderationCasesAsModerator: modCasesAsModerator,
      guildReposts,
      countingRestoreTokens: countingTokens,
      guildFeatureBucket: guildFeatureSlices,
      hogwartsLocalLogs: hogwartsLogs,
      legacyCollections: legacy,
    },
    summary: {
      activityUserProfiles: activityProfiles.length,
      siteDocuments: siteDocuments.length,
      userLeaveBackups: leaveBackups.length,
      moderationCasesAsSubject: modCasesAsSubject.length,
      moderationCasesAsModerator: modCasesAsModerator.length,
      guildReposts: guildReposts.length,
      hogwartsLocalLogRows:
        hogwartsLogs.sortingLog.length + hogwartsLogs.houseAnnounceLog.length + hogwartsLogs.shopLog.length,
      legacyCollectionKeys: Object.keys(legacy),
    },
    notes: [
      "Export generato dai database del bot Vinili (MongoDB) e da log locali Hogwarts.",
      "Messaggi Discord, avatar e dati account gestiti da Discord non sono inclusi.",
      "Transcript ticket: se presenti, i path sono in guildFeatureBucket.tickets[].transcriptHtmlPath.",
      "Alcuni dati di moderazione o audit possono essere conservati per obblighi legali anche dopo richiesta di cancellazione.",
    ],
  });

  const jsonText = `${JSON.stringify(payload, null, 2)}\n`;
  const byteSize = Buffer.byteLength(jsonText, "utf8");
  return {
    ok: true,
    payload,
    jsonText,
    byteSize,
    tooLarge: byteSize > MAX_ATTACHMENT_BYTES,
    filename: `gdpr-export-${uid}-${Date.now()}.json`,
    summary: payload.summary,
  };
}

module.exports = {
  exportUserGdprData,
  MAX_ATTACHMENT_BYTES,
};
