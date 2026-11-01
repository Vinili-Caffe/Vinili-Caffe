/** Voti: stato dei promemoria (ultimo voto, slot, ritentativi sul telefono). */
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");

const DISCADIA_VOTE_ROOT = "profile.totals.exp.bumpVoteRewards.discadia_vote";
const DISCADIA_LAST_VOTE_AT_PATH = `${DISCADIA_VOTE_ROOT}.lastVoteAt`;
const DISCADIA_LAST_REMINDED_AT_PATH = `${DISCADIA_VOTE_ROOT}.lastRemindedAt`;
const DISCADIA_LAST_VOTE_LISTING_PATH = `${DISCADIA_VOTE_ROOT}.lastVoteListing`;
const DISCADIA_LAST_VOTE_AT_TOPGG_PATH = `${DISCADIA_VOTE_ROOT}.lastVoteAtTopgg`;
const DISCADIA_LAST_REMINDED_AT_TOPGG_PATH = `${DISCADIA_VOTE_ROOT}.lastRemindedAtTopgg`;
const DISCADIA_LAST_VOTE_AT_DISCADIA_PATH = `${DISCADIA_VOTE_ROOT}.lastVoteAtDiscadia`;
const DISCADIA_LAST_REMINDED_AT_DISCADIA_PATH = `${DISCADIA_VOTE_ROOT}.lastRemindedAtDiscadia`;

function latestVoteDateFromVoteSub(sub?) {
  const raw = [sub?.lastVoteAtTopgg, sub?.lastVoteAtDiscadia, sub?.lastVoteAt].filter(Boolean);
  let best = 0;
  for (const r of raw) {
    const t = new Date(r).getTime();
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best ? new Date(best) : null;
}

function voteListingKey(voteListing?) {
  return voteListing === "topgg" ? "topgg" : "discadia";
}

function voteLastAtPath(voteListing?) {
  return voteListingKey(voteListing) === "topgg"
    ? DISCADIA_LAST_VOTE_AT_TOPGG_PATH
    : DISCADIA_LAST_VOTE_AT_DISCADIA_PATH;
}

function voteLastRemindedAtPath(voteListing?) {
  return voteListingKey(voteListing) === "topgg"
    ? DISCADIA_LAST_REMINDED_AT_TOPGG_PATH
    : DISCADIA_LAST_REMINDED_AT_DISCADIA_PATH;
}

function voteStateLastAt(state?, voteListing?) {
  const listing = voteListingKey(voteListing);
  const splitValue = listing === "topgg" ? state?.lastVoteAtTopgg : state?.lastVoteAtDiscadia;
  if (splitValue) return splitValue;
  return state?.lastVoteListing === listing ? state?.lastVoteAt : null;
}

function voteStateLastRemindedAt(state?, voteListing?) {
  const listing = voteListingKey(voteListing);
      return listing === "topgg" ? state?.lastRemindedAtTopgg || null : state?.lastRemindedAtDiscadia || null;
}

function shouldSendVoteReminderForListing(state?, voteListing?, cooldownMs?) {
  const lastVoteAtRaw = voteStateLastAt(state, voteListing);
  if (!lastVoteAtRaw) return false;
  const lastVoteAt = new Date(lastVoteAtRaw).getTime();
  if (!Number.isFinite(lastVoteAt)) return false;
  if (Date.now() - lastVoteAt < Math.max(60_000, Number(cooldownMs) || 0)) return false;
  const lastRemindedAtRaw = voteStateLastRemindedAt(state, voteListing);
  if (lastRemindedAtRaw && new Date(lastRemindedAtRaw).getTime() >= lastVoteAt) return false;
  return true;
}

async function claimVoteReminderSlot(guildId?, userId?, voteListing?, lastVoteAtMs?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const listing = voteListingKey(voteListing);
  const atMs = Math.floor(Number(lastVoteAtMs));
  if (!gid || !uid || !Number.isFinite(atMs) || atMs <= 0) return null;

  const lastVoteAt = new Date(atMs);
  const winMs = 5000;
  const voteWindow = { $gte: new Date(atMs - winMs), $lte: new Date(atMs + winMs) };
  const remindedPath = voteLastRemindedAtPath(listing);
  const lastAtPath = voteLastAtPath(listing);
  const claimedAt = new Date();

    const claimed = await ActivityUserProfile.findOneAndUpdate(
    {
      guildId: gid,
      userId: uid,
      $and: [
        {
          $or: [
            { [lastAtPath]: voteWindow },
            {
              [DISCADIA_LAST_VOTE_AT_PATH]: voteWindow,
              [DISCADIA_LAST_VOTE_LISTING_PATH]: listing,
            },
          ],
        },
        {
          $or: [
            { [remindedPath]: { $exists: false } },
            { [remindedPath]: null },
            { [remindedPath]: { $lt: lastVoteAt } },
          ],
        },
      ],
    },
    {
      $set: {
        [DISCADIA_LAST_REMINDED_AT_PATH]: claimedAt,
        [remindedPath]: claimedAt,
      },
    },
    { new: true },
  )
    .select("_id")
    .lean()
    .catch(() => null);

  return claimed?._id ? claimedAt : null;
}

async function releaseVoteReminderSlot(guildId?, userId?, voteListing?) {
  /* votePushTtl1: se enqueue/push fallisce dopo claim, sblocca lo slot listing
     così lo sweep può ritentare (Top.gg e Discadia restano indipendenti). */
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const listing = voteListingKey(voteListing);
  if (!gid || !uid) return false;
  const remindedPath = voteLastRemindedAtPath(listing);
  const res = await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    { $unset: { [remindedPath]: "" } },
  ).catch(() => null);
  return Boolean(res?.modifiedCount || res?.nModified);
}
/* votePushPhoneRetry1: PC ok + telefono fail → ritenta solo mobile (no ri-banner PC) */
/* votePushPhoneZombie2 (storico): hedge su Apple 201 → doppio banner se il primo era reale */
/* votePushPhoneStop3: stop al primo soft-retry con mobileSent>0 */
/* votePushPhoneNoHedge4: Niente apple_zombie_hedge — APNs 201 + mobileSent>0 = ok.
   I Topic :prN unici facevano partire un secondo banner. Zombie veri → catchup PWA. */
const voteReminderPhoneRetryTimers = new Map();
const VOTE_PHONE_RETRY_MISS_DELAYS_MS = Object.freeze([
  25_000,
  90_000,
  3 * 60_000,
  15 * 60_000,
  45 * 60_000,
]);

function voteReminderLockKey(guildId?, userId?, voteListing?, lastVoteAtMs?) {
  const atMin = Math.floor(Math.max(0, Number(lastVoteAtMs) || 0) / 60_000);
  return `${String(guildId || "").trim()}:${String(userId || "").trim()}:${voteListingKey(voteListing)}:${atMin}`;
}

function clearVoteReminderPhoneRetries(userId?, voteListing?) {
  const uid = String(userId || "").trim();
  const listing = voteListingKey(voteListing);
  if (!uid) return;
  const prefix = `phone:${listing}:${uid}:`;
  for (const [key, timer] of voteReminderPhoneRetryTimers) {
    if (!String(key).startsWith(prefix)) continue;
    clearTimeout(timer);
    voteReminderPhoneRetryTimers.delete(key);
  }
}

/* pushSkipRead1: mark-read → stop tutti i soft-retry vote di quell'user */
function clearVoteReminderPhoneRetriesForUser(userId?) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  const needle = `:${uid}:`;
  for (const [key, timer] of voteReminderPhoneRetryTimers) {
    if (String(key).indexOf(needle) === -1) continue;
    clearTimeout(timer);
    voteReminderPhoneRetryTimers.delete(key);
  }
}

function extractDiscadiaVoteState(doc?) {
  return doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote || null;
}

async function isVoteListingRecordedAtOrAfter(guildId?, userId?, voteListing?, voteAtMs?, slackMs = 60_000) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const atMs = Number(voteAtMs);
  if (!gid || !uid || !Number.isFinite(atMs)) return false;
  const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select(DISCADIA_VOTE_ROOT)
    .lean()
    .catch(() => null);
  const lastRaw = voteStateLastAt(extractDiscadiaVoteState(doc) || {}, voteListing);
  if (!lastRaw) return false;
  const lastMs = new Date(lastRaw).getTime();
  if (!Number.isFinite(lastMs)) return false;
  return lastMs + Math.max(0, Number(slackMs) || 0) >= atMs;
}

async function resolveLean(queryOrValue?) {
  if (queryOrValue && typeof queryOrValue.lean === "function") {
    return queryOrValue.lean();
  }
  return queryOrValue;
}

export = { DISCADIA_VOTE_ROOT, DISCADIA_LAST_VOTE_AT_PATH, DISCADIA_LAST_REMINDED_AT_PATH, DISCADIA_LAST_VOTE_LISTING_PATH, DISCADIA_LAST_VOTE_AT_TOPGG_PATH, DISCADIA_LAST_VOTE_AT_DISCADIA_PATH, latestVoteDateFromVoteSub, voteListingKey, voteLastAtPath, voteLastRemindedAtPath, voteStateLastAt, shouldSendVoteReminderForListing, claimVoteReminderSlot, releaseVoteReminderSlot, voteReminderLockKey, clearVoteReminderPhoneRetries, clearVoteReminderPhoneRetriesForUser, extractDiscadiaVoteState, isVoteListingRecordedAtOrAfter, resolveLean };
