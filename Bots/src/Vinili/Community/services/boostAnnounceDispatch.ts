/** Scheduling annuncio boost dopo attesa messaggi nativi Discord. */
const { getAnnouncedBoostSlots } = require("../utils/boostSlotAnnounceTracker") as typeof import("../utils/boostSlotAnnounceTracker");
const { clearBoostAnnounceHandled, nativeBoostSeenSince, resolveBoostAnnounceSyncState, markBoostAnnounceHandledIfSynced } = require("./boostAnnounceState") as typeof import("./boostAnnounceState");
const { recoverMissingBoostEmbedsForUser } = require("./boostAnnounceRecoveryCore") as typeof import("./boostAnnounceRecoveryCore");
const { boostFollowupLocks } = require("./boostAnnounceRuntime") as typeof import("./boostAnnounceRuntime");

const BOOST_NATIVE_WAIT_INITIAL_MS = 0;
const BOOST_NATIVE_WAIT_POLL_MS = 150;
const BOOST_NATIVE_WAIT_SINGLE_MS = 1200;
const BOOST_NATIVE_WAIT_MAX_MS = 3500;

async function announceBoostEmbedsAfterNativeWait({
  boostAnnounceChannel,
  member,
  guildId,
  boostKey,
  expectedSlots = 1,
  currentCount = 0,
  premiumSinceTs = 0,
  startedAt = Date.now(),
}) {
  const expectedNew = Math.max(1, Number(expectedSlots || 1));
  const lookbackMs = Math.max(120_000, Date.now() - startedAt + 30_000);
  const tryRecover = async (knownNativeSlots = expectedNew) =>
    recoverMissingBoostEmbedsForUser(member.guild, member.id, {
      nativeLookbackMs: lookbackMs,
      startedAt,
      knownNativeSlots,
      expectedSlots: Math.max(expectedNew, knownNativeSlots),
    }).catch(() => ({ ok: false, sent: 0 }));

  const sync = await resolveBoostAnnounceSyncState(member.guild, member.id, boostAnnounceChannel, {
    sinceMs: startedAt - 1000,
    nativeLookbackMs: lookbackMs,
    knownNativeSlots: expectedNew,
  }).catch(() => null);
  let nativeSinceStart = Math.max(
    Number(sync?.nativeBoostEvents || 0),
    nativeBoostSeenSince(guildId, member.id, startedAt),
    expectedNew,
  );

  if (nativeSinceStart > 0 || Date.now() - startedAt >= 400) {
    const recovered = await tryRecover(Math.max(expectedNew, nativeSinceStart));
    if (Math.max(0, Number(recovered?.sent || 0)) > 0) {
      nativeSinceStart = Math.max(
        nativeSinceStart,
        nativeBoostSeenSince(guildId, member.id, startedAt),
      );
      if (nativeSinceStart >= 2 && Number(recovered.sent || 0) >= 2) {
        await markBoostAnnounceHandledIfSynced(member.guild, member.id, boostAnnounceChannel, {
          sinceMs: startedAt - 1000,
          nativeLookbackMs: lookbackMs,
          knownNativeSlots: Math.max(expectedNew, nativeSinceStart),
        });
        return true;
      }
    }
    const syncAfter = await resolveBoostAnnounceSyncState(member.guild, member.id, boostAnnounceChannel, {
      sinceMs: startedAt - 1000,
      nativeLookbackMs: lookbackMs,
      knownNativeSlots: Math.max(expectedNew, nativeSinceStart),
    }).catch(() => null);
    const announcedAfter = Number(syncAfter?.announcedSlots || 0);
    const nativeAfter = Math.max(nativeSinceStart, Number(syncAfter?.nativeBoostEvents || 0));
    if (syncAfter && syncAfter.missing <= 0 && (announcedAfter >= 2 || nativeAfter >= 2)) {
      await markBoostAnnounceHandledIfSynced(member.guild, member.id, boostAnnounceChannel, {
        sinceMs: startedAt - 1000,
        nativeLookbackMs: lookbackMs,
        knownNativeSlots: Math.max(expectedNew, nativeAfter),
      });
      return true;
    }
    nativeSinceStart = Math.max(nativeSinceStart, nativeAfter);
  }

  const announcedSoFar = Math.max(
    getAnnouncedBoostSlots(guildId, member.id),
    Number(sync?.announcedSlots || 0),
  );
  const maxWaitMs =
    expectedNew >= 2 || nativeSinceStart >= 2 || announcedSoFar >= 1
      ? BOOST_NATIVE_WAIT_MAX_MS
      : BOOST_NATIVE_WAIT_SINGLE_MS;
  if (Date.now() - startedAt < maxWaitMs) return false;

  const finalSync = await resolveBoostAnnounceSyncState(member.guild, member.id, boostAnnounceChannel, {
    sinceMs: startedAt - 1000,
    nativeLookbackMs: lookbackMs,
    knownNativeSlots: Math.max(expectedNew, nativeSinceStart),
    skipNativeScan: false,
  }).catch(() => null);
  const finalNative = Math.max(
    expectedNew,
    nativeSinceStart,
    Number(finalSync?.nativeBoostEvents || 0),
    nativeBoostSeenSince(guildId, member.id, startedAt),
  );
  await tryRecover(finalNative);
  await markBoostAnnounceHandledIfSynced(member.guild, member.id, boostAnnounceChannel, {
    sinceMs: startedAt - 1000,
    nativeLookbackMs: lookbackMs,
    knownNativeSlots: finalNative,
    skipNativeScan: false,
  });
  let missingAfter = Number((await resolveBoostAnnounceSyncState(member.guild, member.id, boostAnnounceChannel, {
    sinceMs: startedAt - 1000,
    nativeLookbackMs: lookbackMs,
    knownNativeSlots: finalNative,
    skipNativeScan: false,
  }).catch(() => null))?.missing || 0);
  if (missingAfter > 0) {
    clearBoostAnnounceHandled(boostKey);
    /* boostFalseDouble1: NON forzare mai a 2 se i nativi sono 1 —
       prima Math.max(2, finalNative) + allowSecondRecovery dava Double Booster a chi boostava una sola volta. */
    const confirmedSlots = Math.min(2, Math.max(1, Number(finalNative || 0) || expectedNew || 1));
    const allowSecond = confirmedSlots >= 2;
    const forced = await recoverMissingBoostEmbedsForUser(member.guild, member.id, {
      knownNativeSlots: confirmedSlots,
      expectedSlots: confirmedSlots,
      startedAt,
      nativeLookbackMs: Math.max(lookbackMs, 30 * 60 * 1000),
      allowSecondRecovery: allowSecond,
      secondBoostConfirmed: allowSecond,
      skipNativeScan: false,
      currentCount,
      maxSend: Math.min(missingAfter, confirmedSlots),
    }).catch(() => ({ ok: false, sent: 0 }));
    const forcedSent = Math.max(0, Number(forced?.sent || 0));
    if (forcedSent > 0) {
      missingAfter = Math.max(0, missingAfter - forcedSent);
    }
    if (missingAfter > 0 && allowSecond) {
      scheduleBoostFollowup(boostAnnounceChannel, member, guildId, boostKey, {
        expectedSlots: confirmedSlots,
        currentCount,
        premiumSinceTs,
      });
    }
  }
  return true;
}

async function tryDispatchBoostAnnounceImmediately(boostAnnounceChannel?, member?, guildId?, boostKey?, opts: Record<string, any> = {}) {
  const expectedSlots = Math.max(1, Number(opts.expectedSlots || 1));
  return recoverMissingBoostEmbedsForUser(member.guild, member.id, {
    knownNativeSlots: expectedSlots,
    expectedSlots,
    startedAt: Date.now(),
    nativeLookbackMs: 180_000,
    skipNativeScan: expectedSlots >= 2,
    currentCount: opts.currentCount,
    nativeEventIncrement: Boolean(opts.nativeEventIncrement),
    nativeEventSlots: Number(opts.nativeEventSlots || 0) || undefined,
    secondBoostConfirmed: Boolean(opts.secondBoostConfirmed),
    allowSecondRecovery: Boolean(opts.allowSecondRecovery) || Boolean(opts.secondBoostConfirmed),
  }).catch(() => ({ ok: false, sent: 0 }));
}

async function announceBoostFromMemberUpdate(boostAnnounceChannel?, member?, guildId?, boostKey?, opts: Record<string, any> = {}) {
  const result = await tryDispatchBoostAnnounceImmediately(boostAnnounceChannel, member, guildId, boostKey, opts);
  const sent = Math.max(0, Number(result?.sent || 0));
  if (sent >= 2) return;
  scheduleBoostFollowup(boostAnnounceChannel, member, guildId, boostKey, opts);
}

function scheduleBoostAnnounceAfterNative(boostAnnounceChannel?, member?, guildId?, boostKey?, opts: Record<string, any> = {}) {
  const startedAt = Date.now();
  const expectedSlots = Math.max(1, Number(opts.expectedSlots || 1));
  const currentCount = Number(opts.currentCount || 0);
  const premiumSinceTs = Number(opts.premiumSinceTs || member.premiumSinceTimestamp || 0);
  const recoverOpts = {
    knownNativeSlots: expectedSlots,
    expectedSlots,
    startedAt,
    nativeLookbackMs: 180_000,
    nativeEventIncrement: Boolean(opts.nativeEventIncrement),
    nativeEventSlots: Number(opts.nativeEventSlots || 0) || undefined,
    secondBoostConfirmed: Boolean(opts.secondBoostConfirmed),
    allowSecondRecovery: Boolean(opts.allowSecondRecovery) || Boolean(opts.secondBoostConfirmed),
  };

  recoverMissingBoostEmbedsForUser(member.guild, member.id, recoverOpts).catch(() => null);

  boostFollowupLocks.delete(boostKey);
  boostFollowupLocks.set(boostKey, true);

  const release = () => {
    boostFollowupLocks.delete(boostKey);
  };

  const poll = async () => {
    try {
      const sync = await resolveBoostAnnounceSyncState(member.guild, member.id, boostAnnounceChannel, {
        sinceMs: startedAt - 1000,
        knownNativeSlots: expectedSlots,
      }).catch(() => null);
      if (sync && Number(sync.announcedSlots || 0) >= 2) {
        release();
        return;
      }
      const seenNative = nativeBoostSeenSince(guildId, member.id, startedAt);
      const maxWaitMs =
        expectedSlots >= 2 || seenNative >= 2 || Number(sync?.announcedSlots || 0) >= 1
          ? BOOST_NATIVE_WAIT_MAX_MS
          : BOOST_NATIVE_WAIT_SINGLE_MS;
      const done = await announceBoostEmbedsAfterNativeWait({
        boostAnnounceChannel,
        member,
        guildId,
        boostKey,
        expectedSlots,
        currentCount,
        premiumSinceTs,
        startedAt,
      });
      if (done) {
        release();
        return;
      }
      if (Date.now() - startedAt >= maxWaitMs) {
        release();
        return;
      }
      setTimeout(poll, BOOST_NATIVE_WAIT_POLL_MS).unref?.();
    } catch (err) {
      global.logger?.warn?.("[guildMemberUpdate] boost native wait failed:", member?.id, err?.message || err);
      release();
    }
  };

  setTimeout(poll, BOOST_NATIVE_WAIT_INITIAL_MS).unref?.();
}

function scheduleBoostFollowup(boostAnnounceChannel?, newMember?, guildId?, boostKey?, opts: Record<string, any> = {}) {
  scheduleBoostAnnounceAfterNative(boostAnnounceChannel, newMember, guildId, boostKey, opts);
}

export = {
  announceBoostFromMemberUpdate,
  scheduleBoostFollowup,
};
