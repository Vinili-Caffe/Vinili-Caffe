/** Voti Discadia: registrazione del voto e promemoria. */
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { voteCountMonthKeyRome } = require("../../Utils/romeVoteMonthKey") as typeof import("../../Utils/romeVoteMonthKey");
const { DISCADIA_VOTE_ROOT, DISCADIA_LAST_VOTE_AT_PATH, DISCADIA_LAST_REMINDED_AT_PATH, DISCADIA_LAST_VOTE_LISTING_PATH, DISCADIA_LAST_VOTE_AT_TOPGG_PATH, DISCADIA_LAST_VOTE_AT_DISCADIA_PATH, latestVoteDateFromVoteSub, voteListingKey, voteLastAtPath, voteLastRemindedAtPath, voteStateLastAt, shouldSendVoteReminderForListing, clearVoteReminderPhoneRetries, extractDiscadiaVoteState } = require("./voteReminderState") as typeof import("./voteReminderState");
const { discadiaVoteTimers, getVoteCooldownMs, dispatchVoteReminder, enqueueVoteCompletedSiteNotification } = require("./voteReminderMessages") as typeof import("./voteReminderMessages");

const DISCADIA_VOTE_COUNT_LEGACY_PATH = `${DISCADIA_VOTE_ROOT}.voteCount`;
const DISCADIA_VOTE_COUNT_TOPGG_PATH = `${DISCADIA_VOTE_ROOT}.voteCountTopgg`;
const DISCADIA_VOTE_COUNT_DISCADIA_PATH = `${DISCADIA_VOTE_ROOT}.voteCountDiscadia`;
const DISCADIA_VOTE_COUNT_MONTH_KEY_PATH = `${DISCADIA_VOTE_ROOT}.voteCountMonthKey`;
const DISCADIA_PREV_VOTE_COUNT_MONTH_KEY_PATH = `${DISCADIA_VOTE_ROOT}.prevVoteCountMonthKey`;
const DISCADIA_PREV_VOTE_COUNT_TOPGG_PATH = `${DISCADIA_VOTE_ROOT}.prevVoteCountTopgg`;
const DISCADIA_PREV_VOTE_COUNT_DISCADIA_PATH = `${DISCADIA_VOTE_ROOT}.prevVoteCountDiscadia`;

async function recordDiscadiaVote(client?, guildId?, userId?, options: Record<string, any> = {}) {
  const voteListing = voteListingKey(options?.voteListing);
  const now = new Date();
  const currentMonthKey = voteCountMonthKeyRome(now);
  const mainGuildId = IDs.guilds.main;
  guildId = mainGuildId;
  let previousLastVoteAt = null;
  const before = await ActivityUserProfile.findOne({ guildId: IDs.guilds.main, userId })
    .select(`${DISCADIA_LAST_VOTE_AT_PATH} ${voteLastAtPath(voteListing)} ${DISCADIA_VOTE_ROOT}`)
    .lean()
    .catch(() => null);
  const previousLastVoteAtRaw = voteStateLastAt(
    before?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote || {},
    voteListing,
  );
  if (previousLastVoteAtRaw) previousLastVoteAt = new Date(previousLastVoteAtRaw);

  const sub = before?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote || {};
  const legacy = Number(sub.voteCount) || 0;
  const storedMonthKey = String(sub.voteCountMonthKey || "").trim();
  const topggC = Math.max(0, Math.floor(Number(sub.voteCountTopgg) || 0));
  const discadiaC = Math.max(0, Math.floor(Number(sub.voteCountDiscadia) || 0));
  const hasAnyCounter = legacy > 0 || topggC > 0 || discadiaC > 0;
  const lastVoteMonthKey = (() => {
    const d = latestVoteDateFromVoteSub(sub);
    return d ? voteCountMonthKeyRome(d) : "";
  })();
  const staleWithoutMonthKey =
    !storedMonthKey && hasAnyCounter && (!lastVoteMonthKey || lastVoteMonthKey !== currentMonthKey);
  const monthChanged =
    (Boolean(storedMonthKey) && storedMonthKey !== currentMonthKey) || staleWithoutMonthKey;
  const hasSplitCounters =
    Object.prototype.hasOwnProperty.call(sub, "voteCountTopgg") ||
    Object.prototype.hasOwnProperty.call(sub, "voteCountDiscadia");
  const needsMigrate = legacy > 0 && !hasSplitCounters;
  const previousMonthKey = storedMonthKey || lastVoteMonthKey;
  const shouldSnapshotPreviousMonth =
    monthChanged && hasAnyCounter && previousMonthKey && previousMonthKey !== currentMonthKey;

  const update: Record<string, any> = {
    $setOnInsert: { guildId: IDs.guilds.main, userId },
    $set: {
      [DISCADIA_LAST_VOTE_AT_PATH]: now,
      [DISCADIA_LAST_VOTE_LISTING_PATH]: voteListing,
      [voteLastAtPath(voteListing)]: now,
    },
    $unset: {
      [voteLastRemindedAtPath(voteListing)]: "",
      [DISCADIA_LAST_REMINDED_AT_PATH]: "",
    },
  };

  if (monthChanged) {
    if (shouldSnapshotPreviousMonth) {
      update.$set[DISCADIA_PREV_VOTE_COUNT_MONTH_KEY_PATH] = previousMonthKey;
      update.$set[DISCADIA_PREV_VOTE_COUNT_TOPGG_PATH] = hasSplitCounters ? topggC : 0;
      update.$set[DISCADIA_PREV_VOTE_COUNT_DISCADIA_PATH] = hasSplitCounters ? discadiaC : legacy;
    }
    update.$set[DISCADIA_VOTE_COUNT_MONTH_KEY_PATH] = currentMonthKey;
    if (voteListing === "topgg") {
      update.$set[DISCADIA_VOTE_COUNT_TOPGG_PATH] = 1;
      update.$set[DISCADIA_VOTE_COUNT_DISCADIA_PATH] = 0;
    } else {
      update.$set[DISCADIA_VOTE_COUNT_DISCADIA_PATH] = 1;
      update.$set[DISCADIA_VOTE_COUNT_TOPGG_PATH] = 0;
    }
    update.$unset = {
      ...update.$unset,
      [DISCADIA_VOTE_COUNT_LEGACY_PATH]: "",
    };
  } else if (needsMigrate) {
    update.$set[DISCADIA_VOTE_COUNT_MONTH_KEY_PATH] = currentMonthKey;
    if (voteListing === "topgg") {
      update.$set[DISCADIA_VOTE_COUNT_TOPGG_PATH] = legacy + 1;
      update.$set[DISCADIA_VOTE_COUNT_DISCADIA_PATH] = 0;
    } else {
      update.$set[DISCADIA_VOTE_COUNT_DISCADIA_PATH] = legacy + 1;
      update.$set[DISCADIA_VOTE_COUNT_TOPGG_PATH] = 0;
    }
    update.$unset = {
      ...update.$unset,
      [DISCADIA_VOTE_COUNT_LEGACY_PATH]: "",
    };
  } else {
    if (!storedMonthKey) {
      update.$set[DISCADIA_VOTE_COUNT_MONTH_KEY_PATH] = currentMonthKey;
    }
    const incKey = voteListing === "topgg" ? DISCADIA_VOTE_COUNT_TOPGG_PATH : DISCADIA_VOTE_COUNT_DISCADIA_PATH;
    update.$inc = { [incKey]: 1 };
  }

  const doc = await ActivityUserProfile.findOneAndUpdate(
    { guildId: IDs.guilds.main, userId },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  const outSub = doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote || {};
  const voteCountForListing =
    voteListing === "topgg"
      ? Math.max(0, Number(outSub.voteCountTopgg ?? 0))
      : Math.max(0, Number(outSub.voteCountDiscadia ?? 0));

  scheduleDiscadiaVoteReminder(client, mainGuildId, userId, now, voteListing);

  // notifCats1: intentionally skip voto-registrato site notif (reminders still scheduled above).
  void enqueueVoteCompletedSiteNotification(client, userId, voteListing, {
    voteAtMs: now.getTime(),
  });

  /* voteWsLive1: invalida cache /vote/ + ping WS subito (anche se ancora sulla pagina o in PWA). */
  try {
    const { invalidateSiteVoteCache } = require("../../Web/siteVoteApi") as typeof import("../../Web/siteVoteApi");
    invalidateSiteVoteCache(mainGuildId, userId);
  } catch (_) {}
  try {
    const { broadcastSiteVotesChanged } = require("../../features/suggestions/siteSuggestionsBroadcast") as typeof import("../../features/suggestions/siteSuggestionsBroadcast");
    broadcastSiteVotesChanged({ userId: String(userId || "").trim(), platform: voteListing });
  } catch (_) {}

  /* smartNotifLifecycle1: al voto → via reminder inbox+OS di quella piattaforma */
  try {
    clearVoteReminderPhoneRetries(userId, voteListing);
    const { removeSiteInAppNotificationsMatching } = require("../../features/notifications/siteInAppNotificationsService") as typeof import("../../features/notifications/siteInAppNotificationsService");
    void removeSiteInAppNotificationsMatching({
      userId: String(userId || "").trim(),
      prefixes: [`vote_reminder_${voteListing}_`],
      kinds: ["vote_reminder"],
      forceDismiss: true,
    }).catch(() => null);
  } catch (_) {}

  return { voteCount: voteCountForListing, previousLastVoteAt, voteListing };
}

function scheduleDiscadiaVoteReminder(client?, guildId?, userId?, lastVoteAt?, voteListing = "discadia") {
  const enabled = client?.config?.discadiaVoteReminder?.enabled;
  if (!enabled) return;

  const uid = String(userId || "");
  if (!uid) return;
  const gid = String(guildId || "");
  if (!gid) return;
  const listingForDelay = voteListingKey(voteListing);
  const key = `vote:${listingForDelay}:${uid}`;
  const existing = discadiaVoteTimers.get(key);
  if (existing) clearTimeout(existing);

  const cooldownMs = getVoteCooldownMs(client, listingForDelay);
  const targetTime = new Date(lastVoteAt).getTime() + cooldownMs;
  const delay = targetTime - Date.now();

  const run = async () => {
    try {
      const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
        .select(DISCADIA_VOTE_ROOT)
        .lean();
      const state = extractDiscadiaVoteState(doc);
      const lastVoteAtForListing = voteStateLastAt(state, listingForDelay);
      if (!lastVoteAtForListing) return;
      const cooldownMsRun = getVoteCooldownMs(client, listingForDelay);
      const lastVoteAtMs = new Date(lastVoteAtForListing).getTime();
      if (!shouldSendVoteReminderForListing(state, listingForDelay, cooldownMsRun)) return;
      await dispatchVoteReminder(client, {
        guildId: gid,
        userId: uid,
        voteListing: listingForDelay,
        lastVoteAtMs,
        cooldownMs: cooldownMsRun,
      });
    } finally {
      discadiaVoteTimers.delete(key);
    }
  };

  if (delay <= 0) {
    void run();
    return;
  }

  const timer = setTimeout(() => run().catch(() => { }), delay);
  discadiaVoteTimers.set(key, timer);
}

async function restorePendingVoteReminders(client?) {
  const enabled = client?.config?.discadiaVoteReminder?.enabled;
  if (!enabled) return;

  const SEND_IMMEDIATELY_IF_LATE_MS = 2 * 60 * 60 * 1000;
  const SKIP_IF_TOO_OLD_MS = 24 * 60 * 60 * 1000;
  let docs = [];
  const mainGuildId = String(IDs.guilds.main || "").trim();
  if (!mainGuildId) return;
  try {
    docs = await ActivityUserProfile.find({
      guildId: mainGuildId,
      $or: [
        { [DISCADIA_LAST_VOTE_AT_PATH]: { $exists: true, $ne: null } },
        { [DISCADIA_LAST_VOTE_AT_TOPGG_PATH]: { $exists: true, $ne: null } },
        { [DISCADIA_LAST_VOTE_AT_DISCADIA_PATH]: { $exists: true, $ne: null } },
      ],
    })
      .select(`guildId userId ${DISCADIA_VOTE_ROOT}`)
      .lean();
  } catch (err) {
    global.logger?.error?.("[DISCADIA] Failed fetching vote docs:", err);
    return;
  }

  if (!docs.length) {
    return;
  }

  for (const doc of docs) {
    const userId = String(doc.userId);
    const guildId = String(doc.guildId);
    const state = extractDiscadiaVoteState(doc) || {};
    if (!userId || !guildId) continue;

    for (const listing of ["topgg", "discadia"]) {
      const lastVoteAtRaw = voteStateLastAt(state, listing);
      if (!lastVoteAtRaw) continue;
      const lastVoteAt = new Date(lastVoteAtRaw);
      if (!Number.isFinite(lastVoteAt.getTime())) continue;
      const cooldownMs = getVoteCooldownMs(client, listing);

      const targetTime = lastVoteAt.getTime() + cooldownMs;
      const lateBy = Date.now() - targetTime;

      if (lateBy <= 0) {
        scheduleDiscadiaVoteReminder(client, guildId, userId, lastVoteAt, listing);
        continue;
      }

      if (lateBy > SKIP_IF_TOO_OLD_MS) {
        continue;
      }

      if (lateBy <= SEND_IMMEDIATELY_IF_LATE_MS) {
        scheduleDiscadiaVoteReminder(client, guildId, userId, lastVoteAt, listing);
        continue;
      }
      const jitter = 5 * 60 * 1000 + Math.floor(Math.random() * 10 * 60 * 1000);
      const syntheticLastVote = new Date(Date.now() - cooldownMs + jitter);
      scheduleDiscadiaVoteReminder(client, guildId, userId, syntheticLastVote, listing);
    }
  }
}

async function sendDueDiscadiaVoteReminders(client?) {
  const enabled = client?.config?.discadiaVoteReminder?.enabled;
  if (!enabled) return;

  const guildId = String(IDs.guilds.main || "").trim();
  if (!guildId) return;
  const minCooldownMs = Math.min(getVoteCooldownMs(client, "topgg"), getVoteCooldownMs(client, "discadia"));
  const cutoff = new Date(Date.now() - minCooldownMs);

  let docs = [];
  try {
    docs = await ActivityUserProfile.find({
      guildId,
      $or: [
        { [DISCADIA_LAST_VOTE_AT_PATH]: { $lte: cutoff } },
        { [DISCADIA_LAST_VOTE_AT_TOPGG_PATH]: { $lte: cutoff } },
        { [DISCADIA_LAST_VOTE_AT_DISCADIA_PATH]: { $lte: cutoff } },
      ],
    })
      .select(`userId ${DISCADIA_VOTE_ROOT}`)
      .lean();
  } catch (err) {
    global.logger?.error?.("[DISCADIA VOTE REMINDER] Failed to fetch voters:", err);
    return;
  }

  for (const doc of docs) {
    const userId = String(doc?.userId);
    const state = extractDiscadiaVoteState(doc);
    if (!userId || !state) continue;

    let userHadVotePushThisTick = false;
    for (const voteListing of ["topgg", "discadia"]) {
      const lastVoteAtRaw = voteStateLastAt(state, voteListing);
      if (!lastVoteAtRaw) continue;
      const lastVoteAt = new Date(lastVoteAtRaw).getTime();
      if (!Number.isFinite(lastVoteAt)) continue;
      const cooldownMs = getVoteCooldownMs(client, voteListing);
      if (!shouldSendVoteReminderForListing(state, voteListing, cooldownMs)) continue;

      /* votePushPairPhone1: non sparare Top.gg+Discadia nello stesso istante —
         su FCM/Android la seconda push collassa e sul telefono ne arriva una sola. */
      if (userHadVotePushThisTick) {
        await new Promise((r?) => setTimeout(r, 3200));
      }

      const result = await dispatchVoteReminder(client, {
        guildId,
        userId,
        voteListing,
        lastVoteAtMs: lastVoteAt,
        cooldownMs,
      });
      if (result.ok) {
        userHadVotePushThisTick = true;
        const remindedAt = new Date();
        state[voteListing === "topgg" ? "lastRemindedAtTopgg" : "lastRemindedAtDiscadia"] = remindedAt;
        state.lastRemindedAt = remindedAt;
      }
    }
  }
}

export = { recordDiscadiaVote, restorePendingVoteReminders, sendDueDiscadiaVoteReminders };
