const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const mongoose = require("mongoose") as typeof import("mongoose");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const {
  ActivityUserProfile,
  SiteDocument,
  SITE_DOCUMENT_TYPE,
  UserLeaveBackup,
  UserFullDiscordStateHistory,
  ModCase,
} = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");

const COUNTING_RESTORE_DOC_TYPE = SITE_DOCUMENT_TYPE.COUNTING_RESTORE_TOKEN;
const { GuildFeatureBucket } = require("../../Schemas/Guild/guildFeatureBucketSchema") as typeof import("../../Schemas/Guild/guildFeatureBucketSchema");
const { GuildRepost } = require("../../Schemas/Community/repostSchema") as typeof import("../../Schemas/Community/repostSchema");
const {
  attachHogwartsRetentionMarkers,
  extractHogwartsProfileSlice,
  isHogwartsEventRetentionActive,
  shouldRetainHogwartsProfileOnLeave,
} = require("./hogwartsLeaveRetention") as typeof import("./hogwartsLeaveRetention");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { revokeHouseSortingAnnouncesForMember } = require("./hogwartsSortingLogService") as typeof import("./hogwartsSortingLogService");

const HOGWARTS_LOG_DIR = path.resolve(__dirname, "../../Data/Hogwarts");
const SORTING_LOG_FILE = path.join(HOGWARTS_LOG_DIR, "sorting-log.jsonl");
const HOUSE_ANNOUNCE_LOG_FILE = path.join(HOGWARTS_LOG_DIR, "house-sorting-announce.jsonl");
const SHOP_LOG_FILE = path.join(HOGWARTS_LOG_DIR, "shop-log.jsonl");
const HOGWARTS_JSONL_FILES = [SORTING_LOG_FILE, HOUSE_ANNOUNCE_LOG_FILE, SHOP_LOG_FILE];

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

const RETAINED_SITE_DOC_TYPES = new Set([SITE_DOCUMENT_TYPE.PAYMENT]);
const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;

function countRows(rows?) {
  return Number(rows?.deletedCount ?? rows?.modifiedCount ?? rows?.matchedCount ?? rows ?? 0);
}

function rewriteJsonlRemovingUser(filePath?, userId?) {
  const uid = String(userId || "").trim();
  if (!uid || !fs.existsSync(filePath)) return 0;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const kept = [];
    let removed = 0;
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed);
        if (String(row?.userId || "").trim() === uid) {
          removed += 1;
          continue;
        }
      } catch {
        kept.push(trimmed);
        continue;
      }
      kept.push(trimmed);
    }
    if (!removed) return 0;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, kept.length ? `${kept.join("\n")}\n` : "", "utf8");
    return removed;
  } catch (err) {
    global.logger?.warn?.("[gdpr-erase] jsonl:", filePath, err?.message || err);
    return 0;
  }
}

async function deleteLegacyUserRows(userId?, guildId?, dryRun?) {
  const db = mongoose.connection?.db;
  if (!db) return {};
  const uid = String(userId || "").trim();
  const gid = String(guildId || "").trim();
  const out: Record<string, any> = {};
  for (const name of LEGACY_USER_COLLECTIONS) {
    const exists = await db.listCollections({ name }).hasNext().catch(() => false);
    if (!exists) continue;
    const filter = gid ? { guildId: gid, userId: uid } : { userId: uid };
    if (dryRun) {
      const n = await db.collection(name).countDocuments(filter).catch(() => 0);
      if (n) out[name] = n;
      continue;
    }
    const res = await db.collection(name).deleteMany(filter).catch(() => ({ deletedCount: 0 }));
    const n = Number(res?.deletedCount || 0);
    if (n) out[name] = n;
  }
  return out;
}

async function eraseSiteDocuments({ guildId, userId, client, dryRun }) {
  const uid = String(userId || "").trim();
  const gid = String(guildId || "").trim();
  const cfg = client ? resolveHogwartsEventConfig(client) : null;
  const retainHogwartsSorting =
    Boolean(gid && cfg && isHogwartsEventRetentionActive(cfg)) &&
    (await SiteDocument.exists({
      docType: SORTING_DOC,
      guildId: gid,
      userId: uid,
      dedupeKey: String(cfg.eventKey || "").trim(),
    }).catch(() => null));

  const retainDocTypes = [...RETAINED_SITE_DOC_TYPES];
  if (retainHogwartsSorting) retainDocTypes.push(SORTING_DOC);

  const guildScope = gid
    ? { $or: [{ guildId: gid }, { guildId: "" }, { guildId: null }, { guildId: { $exists: false } }] }
    : null;

  const userFilter = {
    userId: uid,
    docType: { $nin: retainDocTypes },
    ...(guildScope || {}),
  };

  const requesterFilter = {
    requesterId: uid,
    docType: SITE_DOCUMENT_TYPE.ROLE_REQUEST_COOLDOWN,
    ...(guildScope || {}),
  };

  let deletedUserDocs = 0;
  let deletedRequesterDocs = 0;
  let anonymizedStaffReviews = 0;

  if (dryRun) {
    deletedUserDocs = await SiteDocument.countDocuments(userFilter).catch(() => 0);
    deletedRequesterDocs = await SiteDocument.countDocuments(requesterFilter).catch(() => 0);
    anonymizedStaffReviews = await SiteDocument.countDocuments({
      docType: SITE_DOCUMENT_TYPE.REVIEW,
      staffUserId: uid,
    }).catch(() => 0);
  } else {
    const userRes = await SiteDocument.deleteMany(userFilter).catch(() => ({ deletedCount: 0 }));
    deletedUserDocs = Number(userRes?.deletedCount || 0);
    const requesterRes = await SiteDocument.deleteMany(requesterFilter).catch(() => ({ deletedCount: 0 }));
    deletedRequesterDocs = Number(requesterRes?.deletedCount || 0);
    const reviewRes = await SiteDocument.updateMany(
      { docType: SITE_DOCUMENT_TYPE.REVIEW, staffUserId: uid },
      {
        $set: {
          staffUserId: null,
          staffName: "",
          staffAvatarUrl: "",
        },
      },
    ).catch(() => ({ modifiedCount: 0 }));
    anonymizedStaffReviews = Number(reviewRes?.modifiedCount || 0);
    if (!retainHogwartsSorting && gid && cfg?.eventKey) {
      revokeHouseSortingAnnouncesForMember({ guildId: gid, userId: uid, eventKey: cfg.eventKey });
    }
  }

  return {
    deletedUserDocs,
    deletedRequesterDocs,
    anonymizedStaffReviews,
    retainedHogwartsSorting: retainHogwartsSorting ? 1 : 0,
    retainedPayments: await SiteDocument.countDocuments({ userId: uid, docType: SITE_DOCUMENT_TYPE.PAYMENT }).catch(() => 0),
  };
}

async function scrubGuildFeatureBucketUser(guildId?, userId?, dryRun?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return { suggestionsRemoved: 0, ticketsRedacted: 0, giveawayParticipationsRemoved: 0 };
  const bucket = await GuildFeatureBucket.findOne({ guildId: gid });
  if (!bucket) return { suggestionsRemoved: 0, ticketsRedacted: 0, giveawayParticipationsRemoved: 0 };

  let suggestionsRemoved = 0;
  let ticketsRedacted = 0;
  let giveawayParticipationsRemoved = 0;

  const beforeSuggestions = Array.isArray(bucket.suggestions) ? bucket.suggestions.length : 0;
  bucket.suggestions = (Array.isArray(bucket.suggestions) ? bucket.suggestions : []).filter((row?) => {
    const authorId = String(row?.AuthorID || row?.authorId || "").trim();
    return authorId !== uid;
  });
  suggestionsRemoved = beforeSuggestions - bucket.suggestions.length;

  for (const ticket of Array.isArray(bucket.tickets) ? bucket.tickets : []) {
    if (String(ticket?.userId || "").trim() !== uid) continue;
    if (ticket.descriptionText) {
      ticketsRedacted += 1;
      if (!dryRun) ticket.descriptionText = "[gdpr redacted]";
    }
  }

  for (const giveaway of Array.isArray(bucket.giveaways) ? bucket.giveaways : []) {
    const participants = Array.isArray(giveaway?.participants) ? giveaway.participants.map(String) : [];
    const next = participants.filter((id?) => id !== uid);
    giveawayParticipationsRemoved += participants.length - next.length;
    if (!dryRun) giveaway.participants = next;
  }

  if (!dryRun && (suggestionsRemoved || ticketsRedacted || giveawayParticipationsRemoved)) {
    await bucket.save().catch(() => null);
  }

  return { suggestionsRemoved, ticketsRedacted, giveawayParticipationsRemoved };
}

async function eraseActivityUserProfiles({ guildId, userId, client, dryRun }) {
  const uid = String(userId || "").trim();
  const scopeGuildId = String(guildId || "").trim();
  const profileQuery: Record<string, any> = { userId: uid };
    if (scopeGuildId) profileQuery.guildId = scopeGuildId;
  const profiles = await ActivityUserProfile.find(profileQuery).lean().catch(() => []);
  let deleted = 0;
  let trimmed = 0;
  let retainedModeration = 0;
  let retainedStaff = 0;
  let retainedHogwarts = 0;
  let retainedTenantPartnership = 0;

  for (const doc of Array.isArray(profiles) ? profiles : []) {
    const gid = String(doc?.guildId || guildId || "").trim();
    const staffBlock = doc.staff;
    const staffPendingPurgeAt = doc.staffPendingPurgeAt;
    const rolesHistoryRetention = Array.isArray(doc.staffRolesHistoryRetention)
      ? doc.staffRolesHistoryRetention.filter(Boolean)
      : [];
    const keepRolesHistoryRetention = rolesHistoryRetention.length > 0;
    const tenantPartnership =
      doc?.profile?.tenantPartnership && typeof doc.profile.tenantPartnership === "object"
        ? doc.profile.tenantPartnership
        : null;
    const keepTenantPartnership = Boolean(tenantPartnership && Object.keys(tenantPartnership).length > 0);
    const keepStaffGrace =
      Boolean(staffPendingPurgeAt) ||
      (staffBlock != null && typeof staffBlock === "object" && Object.keys(staffBlock).length > 0);
    const keepModeration = doc.moderation != null && typeof doc.moderation === "object";
    const keepEventWeekWinners =
      Array.isArray(doc?.profile?.totals?.exp?.event?.weekWinners) &&
      doc.profile.totals.exp.event.weekWinners.length > 0;
    const keepHogwarts = client
      ? await shouldRetainHogwartsProfileOnLeave(client, doc, { guildId: gid, userId: uid })
      : false;

    if (
      !keepModeration &&
      !keepEventWeekWinners &&
      !keepStaffGrace &&
      !keepHogwarts &&
      !keepTenantPartnership &&
      !keepRolesHistoryRetention
    ) {
      deleted += 1;
      if (!dryRun) await ActivityUserProfile.deleteOne({ _id: doc._id }).catch(() => null);
      continue;
    }

    trimmed += 1;
    if (keepModeration) retainedModeration += 1;
    if (keepStaffGrace) retainedStaff += 1;
    if (keepHogwarts) retainedHogwarts += 1;
    if (keepTenantPartnership) retainedTenantPartnership += 1;
    if (dryRun) continue;

    const payload: Record<string, any> = {
      _id: doc._id,
      guildId: gid,
      userId: uid,
      updatedAt: new Date(),
    };
    if (doc.createdAt) payload.createdAt = doc.createdAt;
    if (keepModeration) payload.moderation = doc.moderation;
    if (keepStaffGrace && staffBlock) payload.staff = staffBlock;
    if (staffPendingPurgeAt) payload.staffPendingPurgeAt = staffPendingPurgeAt;
    // organicoLeaveRetain2: GDPR trim must not erase organico career history
    if (keepRolesHistoryRetention) payload.staffRolesHistoryRetention = rolesHistoryRetention;

    const profile: Record<string, any> = {};
    if (keepEventWeekWinners) {
      profile.totals = { exp: { event: { weekWinners: doc.profile.totals.exp.event.weekWinners } } };
    }
    if (keepHogwarts) {
      const hogwartsSlice = extractHogwartsProfileSlice(doc);
      if (hogwartsSlice) {
        const cfg = client ? resolveHogwartsEventConfig(client) : null;
        profile.events = { hogwarts: attachHogwartsRetentionMarkers(hogwartsSlice, cfg) };
      }
    }
        if (keepTenantPartnership) profile.tenantPartnership = tenantPartnership;
    if (Object.keys(profile).length) payload.profile = profile;
    await ActivityUserProfile.collection.replaceOne({ _id: doc._id }, payload).catch(() => null);
    if (keepRolesHistoryRetention) {
      await ActivityUserProfile.updateOne(
        { _id: doc._id },
        { $set: { staffRolesHistoryRetention: rolesHistoryRetention } },
      ).catch(() => null);
    }
  }

  return {
    deleted,
    trimmed,
    retainedModeration,
    retainedStaff,
    retainedHogwarts,
    retainedTenantPartnership,
  };
}

async function eraseUserGdprData({ guildId, userId, client, dryRun = false }) {
  const uid = String(userId || "").trim();
  const gid = String(guildId || IDs.guilds?.main || "").trim();
  if (!/^\d{16,22}$/.test(uid)) return { ok: false, reason: "invalid_user" };

  const deleted = {
    userLeaveBackups: 0,
    userFullDiscordStateHistories: 0,
    muteRoleSnapshotProfiles: 0,
    customPerksDiscordCleanupProfiles: 0,
    guildReposts: 0,
    countingRestoreTokens: 0,
    hogwartsJsonlRows: 0,
    activityUserProfiles: 0,
    siteDocuments: 0,
    legacyCollections: {},
    guildFeatureBucket: {
      suggestionsRemoved: 0,
      ticketsRedacted: 0,
      giveawayParticipationsRemoved: 0,
    },
  };
  const retained = {
    moderationProfiles: 0,
    staffProfiles: 0,
    hogwartsProfiles: 0,
    tenantPartnershipProfiles: 0,
    hogwartsSortingDoc: 0,
    payments: 0,
    moderationCasesAsSubject: 0,
  };
  const trimmedProfiles = { count: 0 };

  if (dryRun) {
    deleted.userLeaveBackups = await UserLeaveBackup.countDocuments({ userId: uid }).catch(() => 0);
    deleted.userFullDiscordStateHistories = await UserFullDiscordStateHistory.countDocuments({ userId: uid }).catch(() => 0);
    deleted.muteRoleSnapshotProfiles = await ActivityUserProfile.countDocuments({
      userId: uid,
      "profile.muteRoleSnapshot.roleIds.0": { $exists: true },
    }).catch(() => 0);
    deleted.customPerksDiscordCleanupProfiles = await ActivityUserProfile.countDocuments({
      userId: uid,
      "profile.customPerksDiscordCleanup.runAt": { $ne: null },
    }).catch(() => 0);
    deleted.guildReposts = await GuildRepost.countDocuments({ reposterUserId: uid }).catch(() => 0);
    deleted.countingRestoreTokens = await SiteDocument.countDocuments({
      docType: COUNTING_RESTORE_DOC_TYPE,
      "rawOrder.lostLastUser": uid,
    }).catch(() => 0);
    for (const file of HOGWARTS_JSONL_FILES) {
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const row = JSON.parse(trimmed);
          if (String(row?.userId || "").trim() === uid) deleted.hogwartsJsonlRows += 1;
        } catch {
                  }
      }
    }
  } else {
    deleted.userLeaveBackups = countRows(await UserLeaveBackup.deleteMany({ userId: uid }).catch(() => null));
    deleted.userFullDiscordStateHistories = countRows(
      await UserFullDiscordStateHistory.deleteMany({ userId: uid }).catch(() => null),
    );
                deleted.muteRoleSnapshotProfiles = countRows(
      await ActivityUserProfile.updateMany(
        { userId: uid, "profile.muteRoleSnapshot.roleIds.0": { $exists: true } },
        { $set: { "profile.muteRoleSnapshot.roleIds": [], "profile.muteRoleSnapshot.at": null } },
      ).catch(() => null),
    );
    deleted.customPerksDiscordCleanupProfiles = countRows(
      await ActivityUserProfile.updateMany(
        { userId: uid, "profile.customPerksDiscordCleanup.runAt": { $ne: null } },
        { $unset: { "profile.customPerksDiscordCleanup": "" } },
      ).catch(() => null),
    );
    deleted.guildReposts = countRows(await GuildRepost.deleteMany({ reposterUserId: uid }).catch(() => null));
    deleted.countingRestoreTokens = countRows(
      await SiteDocument.deleteMany({ docType: COUNTING_RESTORE_DOC_TYPE, "rawOrder.lostLastUser": uid }).catch(() => null),
    );
    for (const file of HOGWARTS_JSONL_FILES) {
      deleted.hogwartsJsonlRows += rewriteJsonlRemovingUser(file, uid);
    }
  }

  const site = await eraseSiteDocuments({ guildId: gid, userId: uid, client, dryRun });
  deleted.siteDocuments = Number(site.deletedUserDocs || 0) + Number(site.deletedRequesterDocs || 0);
  retained.hogwartsSortingDoc = Number(site.retainedHogwartsSorting || 0);
  retained.payments = Number(site.retainedPayments || 0);

  const profileResult = await eraseActivityUserProfiles({ guildId: gid, userId: uid, client, dryRun });
  deleted.activityUserProfiles = Number(profileResult.deleted || 0);
  trimmedProfiles.count = Number(profileResult.trimmed || 0);
  retained.moderationProfiles = Number(profileResult.retainedModeration || 0);
  retained.staffProfiles = Number(profileResult.retainedStaff || 0);
  retained.hogwartsProfiles = Number(profileResult.retainedHogwarts || 0);
  retained.tenantPartnershipProfiles = Number(profileResult.retainedTenantPartnership || 0);

  deleted.legacyCollections = await deleteLegacyUserRows(uid, gid, dryRun);
  deleted.guildFeatureBucket = await scrubGuildFeatureBucketUser(gid, uid, dryRun);

  if (ModCase) {
    retained.moderationCasesAsSubject = await ModCase.countDocuments({ userId: uid }).catch(() => 0);
  } else {
    const modCases = await ActivityUserProfile.find({
      userId: uid,
      "moderation.modCases.0": { $exists: true },
    })
      .select("_id moderation.modCases")
      .lean()
      .catch(() => []);
    retained.moderationCasesAsSubject = (modCases || []).reduce(
      (sum?, doc?) => sum + (Array.isArray(doc?.moderation?.modCases) ? doc.moderation.modCases.length : 0),
      0,
    );
  }

  return {
    ok: true,
    dryRun,
    deleted,
    retained,
    trimmedProfiles,
    site,
    notes: [
      "I casi moderazione e i pagamenti non vengono cancellati automaticamente.",
      "Storico partnership (staff.partnerActions) e progressi [Personalizza](https://www.viniliecaffe.it/personalizza/) pm restano conservati.",
      "Con guildId impostato, i profili ActivityUser degli altri server non vengono toccati.",
      "Durante l'evento Hogwarts attivo, smistamento e profilo evento possono restare conservati.",
      "I transcript ticket su disco non vengono eliminati: solo il testo descrizione nel DB viene oscurato.",
      "Messaggi Discord e dati account Discord restano su Discord.",
    ],
  };
}

export = {
  eraseUserGdprData,
};
