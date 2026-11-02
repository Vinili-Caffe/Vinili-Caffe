/** Recovery embed boost mancanti e conteggio guild fresco. */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { getAnnouncedBoostSlots, ensureBoostSlotsSynced } = require("../../Utils/Community/boostSlotAnnounceTracker") as typeof import("../../Utils/Community/boostSlotAnnounceTracker");
const { noteBoostEmbedsSentRecently, recentBoostEmbedsSentCount, nativeBoostSeenSince, markBoostAnnounceHandled, isBoostAnnounceHandled, countRecentBotBoostAnnouncesForUser, countRecentBotBoostAnnouncesForUserMulti, resolveBoostAnnounceSyncState, markBoostAnnounceHandledIfSynced, rememberBoostAnnounce, resolveBoostSlotTarget, boostAnnouncePeriodSinceMs, syncAnnouncedBoostSlotsFromChannelCount } = require("./boostAnnounceState") as typeof import("./boostAnnounceState");
const { collectRecentNativeBoosterCandidates } = require("./boostNative") as typeof import("./boostNative");
const { sleep } = require("./memberUpdateLogs") as typeof import("./memberUpdateLogs");
const { addPerkRoleIfPossible } = require("./memberPerks") as typeof import("./memberPerks");
const { boostEmbedsAllowedNow, deferBoostEmbeds, noteBoostEmbedsSentAligned } = require("./boostNativeAlign") as typeof import("./boostNativeAlign");
const { sendBoostEmbeds, trackBoostSlotsAnnouncedAndMaybeGrantDoubleBooster } = require("./boostAnnounceSend") as typeof import("./boostAnnounceSend");
const { boostCountCache, boostAnnounceSendLocks } = require("./boostAnnounceRuntime") as typeof import("./boostAnnounceRuntime");

async function resolveFreshGuildBoostCount(guild?, fallbackCount = null) {
  const gid = String(guild?.id || "");
  const freshGuild = await guild?.fetch?.().catch(() => null);
  const fromFresh = Number(freshGuild?.premiumSubscriptionCount);
  if (Number.isFinite(fromFresh) && fromFresh >= 0) {
    if (gid) boostCountCache.set(gid, fromFresh);
    return fromFresh;
  }
  const fromGuild = Number(guild?.premiumSubscriptionCount);
  if (Number.isFinite(fromGuild) && fromGuild >= 0) {
    if (gid) boostCountCache.set(gid, fromGuild);
    return fromGuild;
  }
  const fromFallback = Number(fallbackCount);
  if (Number.isFinite(fromFallback) && fromFallback >= 0) return fromFallback;
  const fromCache = Number(boostCountCache.get(gid));
  return Number.isFinite(fromCache) && fromCache >= 0 ? fromCache : 0;
}

async function recoverMissingBoostEmbedsForUser(guild?, userId?, opts: Record<string, any> = {}) {
  const gid = String(guild?.id || "");
  const uid = String(userId || "");
  if (!gid || !uid) return { ok: false, reason: "invalid_input" };
  const boostKey = `${gid}:${uid}`;
  const recentMemSent = recentBoostEmbedsSentCount(boostKey);
  /* boostDedup1: se abbiamo già mandato in questa finestra e non c’è force, stop */
  if (!opts.force && isBoostAnnounceHandled(boostKey) && recentMemSent > 0) {
    const want = Math.max(
      1,
      Number(opts.knownNativeSlots || 0),
      Number(opts.expectedSlots || 0),
      recentMemSent,
    );
    if (recentMemSent >= Math.min(2, want)) {
      return { ok: true, sent: 0, reason: "recently_handled" };
    }
  }
  const boostChannelId = IDs.channels.supporters;
  if (!boostChannelId) return { ok: false, reason: "no_boost_channel" };
  const boostAnnounceChannel =
    guild.channels.cache.get(boostChannelId) ||
    (await getGuildChannelCached(guild, boostChannelId).catch(() => null));
  if (!boostAnnounceChannel?.isTextBased?.()) return { ok: false, reason: "channel_not_text" };
  const member =
    guild.members.cache.get(uid) ||
    (await getGuildMemberCached(guild, uid, { ttlMs: 30_000, preferFresh: true }).catch(() => null));
  if (!member || member.user?.bot) return { ok: false, reason: "member_not_found" };
  const mainId = String(IDs.guilds.main || "");
  if (mainId && gid === mainId) {
    await ensureBoostSlotsSynced(gid, uid).catch(() => null);
  }
  const latestCount = await resolveFreshGuildBoostCount(guild, opts.currentCount);
  const nativeLookbackMs = Math.max(
    60_000,
    Math.min(14 * 24 * 60 * 60 * 1000, Number(opts.nativeLookbackMs ?? 10 * 60 * 1000)),
  );
  const sinceMs = Number.isFinite(Number(opts.startedAt))
    ? Math.max(0, Number(opts.startedAt) - 1000)
    : Date.now() - nativeLookbackMs;
  const sync = await resolveBoostAnnounceSyncState(guild, uid, boostAnnounceChannel, {
    sinceMs,
    nativeLookbackMs,
    knownNativeSlots: Number(opts.knownNativeSlots || 0),
    skipNativeScan: Boolean(opts.skipNativeScan),
  }).catch(() => null);
  const forcedSlots = Math.max(0, Number(opts.knownNativeSlots || 0));
  const announcedSlots = Math.max(0, Number(sync?.announcedSlots || 0));
  let nativeBoostEvents = Math.max(forcedSlots, Number(sync?.nativeBoostEvents || 0));
  const seenNativeSlots = nativeBoostSeenSince(gid, uid, sinceMs);
  nativeBoostEvents = Math.max(nativeBoostEvents, seenNativeSlots);
  if (nativeBoostEvents <= 0) {
    const premiumSince = Number(member.premiumSinceTimestamp || 0);
    const expected = Math.max(0, Number(opts.expectedSlots || opts.knownNativeSlots || 0));
    const announceWindowStart = Number.isFinite(Number(opts.startedAt))
      ? Math.max(0, Number(opts.startedAt) - 120_000)
      : sinceMs - 60_000;
    if (premiumSince > 0 && (premiumSince >= announceWindowStart || expected > 0)) {
      nativeBoostEvents = Math.max(1, Math.min(2, expected || 1));
    } else if (expected > 0) {
      nativeBoostEvents = Math.min(2, expected);
    } else {
      return { ok: true, sent: 0, reason: "no_native_signals" };
    }
  }
  const confirmedDoubleBurst = Boolean(
    opts.confirmedDoubleBurst ||
      (Number(opts.messageSlots || 0) >= 2) ||
      (Number(opts.nativeEventSlots || 0) >= 2 && Boolean(opts.skipNativeScan)),
  );
  const nativeScanVerified = Boolean(
    opts.nativeScanVerified || (!opts.skipNativeScan && Number(sync?.nativeBoostEvents || 0) >= 2),
  );
  const slotTarget = resolveBoostSlotTarget(member, announcedSlots, nativeBoostEvents, forcedSlots, {
    startedAt: opts.startedAt,
    nativeLookbackMs,
    nativeSeenSlots: seenNativeSlots,
    expectedSlots: Number(opts.expectedSlots || 0),
    secondBoostConfirmed: Boolean(opts.secondBoostConfirmed),
    allowSecondRecovery: Boolean(opts.allowSecondRecovery),
    incrementalNativeEvent: Boolean(opts.nativeEventIncrement),
    nativeEventSlots: Number(opts.nativeEventSlots || opts.knownNativeSlots || 0),
    confirmedDoubleBurst,
    nativeScanVerified,
  });
  if (slotTarget <= 0) return { ok: true, sent: 0, reason: "not_boosting" };
  const periodSinceMs = boostAnnouncePeriodSinceMs(member, opts, nativeLookbackMs);
  const embedCounts = await countRecentBotBoostAnnouncesForUserMulti(boostAnnounceChannel, uid, {
    sinceMs,
    periodSinceMs,
    lookbackMs: nativeLookbackMs,
    limit: 100,
  }).catch(() => ({ since: 0, period: 0, lookback: 0 }));
  const channelEmbedsInPeriod = Math.max(0, Number(embedCounts.period || 0));
  const channelSinceStart = Math.max(0, Number(embedCounts.since || 0), recentMemSent);
  const channelInLookback = Math.max(0, Number(embedCounts.lookback || 0), recentMemSent);
  const recoveryStartedAt = Number.isFinite(Number(opts.startedAt)) ? Number(opts.startedAt) : 0;
  const recentRecovery =
    recoveryStartedAt > 0 && Date.now() - recoveryStartedAt <= Math.max(nativeLookbackMs, 6 * 60 * 60 * 1000);
  const freshNativeGap = Boolean(
    recentRecovery &&
      forcedSlots > 0 &&
      channelSinceStart < forcedSlots,
  );
  /* boostDedup1: native fresco → prior = canale + mem recenti (mai ignorare ciò che abbiamo già mandato) */
  const priorSlots = freshNativeGap
    ? Math.max(channelSinceStart, channelInLookback, recentMemSent)
    : Math.max(channelEmbedsInPeriod, announcedSlots, channelSinceStart, recentMemSent);
  if (priorSlots >= slotTarget) {
    await syncAnnouncedBoostSlotsFromChannelCount(gid, uid, Math.max(announcedSlots, priorSlots));
    markBoostAnnounceHandled(boostKey);
    return { ok: true, sent: 0, reason: "already_announced_in_period" };
  }
  /* boostDedup3: niente inflate “recentRecovery” che forzava re-send anche con embed già in canale */
  let extraMissing = Math.max(0, slotTarget - priorSlots);
  if (freshNativeGap) {
    extraMissing = Math.max(extraMissing, Math.max(0, forcedSlots - channelSinceStart));
  }
  const missingCap = freshNativeGap
    ? Math.max(0, Math.min(forcedSlots, slotTarget) - priorSlots)
    : Math.max(0, slotTarget - priorSlots);
  extraMissing = Math.min(extraMissing, Math.max(0, missingCap));
  if (extraMissing <= 0) {
    markBoostAnnounceHandled(boostKey);
    return { ok: true, sent: 0, reason: "already_announced_in_period" };
  }
  if (boostAnnounceSendLocks.has(boostKey)) {
    await new Promise((resolve?) => setTimeout(resolve, 200)).catch(() => { });
    if (boostAnnounceSendLocks.has(boostKey)) return { ok: true, sent: 0, reason: "send_in_progress" };
  }
  boostAnnounceSendLocks.add(boostKey);
  try {
    /* boostDedup3: re-count fresco prima di mandare (recovery/startup spesso partiva con count stale=0) */
    const confirmSince = Math.min(sinceMs, Date.now() - 45 * 60 * 1000);
    const confirmCount = await countRecentBotBoostAnnouncesForUser(boostAnnounceChannel, uid, {
      sinceMs: confirmSince,
      limit: 200,
    }).catch(() => 0);
    if (confirmCount >= slotTarget) {
      await syncAnnouncedBoostSlotsFromChannelCount(gid, uid, Math.max(announcedSlots, confirmCount));
      markBoostAnnounceHandled(boostKey);
      return { ok: true, sent: 0, reason: "channel_confirm_enough" };
    }
    extraMissing = Math.min(extraMissing, Math.max(0, slotTarget - confirmCount));
    if (extraMissing <= 0) {
      markBoostAnnounceHandled(boostKey);
      return { ok: true, sent: 0, reason: "channel_confirm_enough" };
    }
    if (channelSinceStart >= nativeBoostEvents && forcedSlots <= 0 && priorSlots >= slotTarget) {
      await markBoostAnnounceHandledIfSynced(guild, uid, boostAnnounceChannel, {
        sinceMs,
        nativeLookbackMs,
        knownNativeSlots: nativeBoostEvents,
      });
      return { ok: true, sent: 0, reason: "already_in_channel" };
    }
    await addPerkRoleIfPossible(member).catch(() => { });
    const maxSend = Math.max(0, Math.floor(Number(opts.maxSend || 0)));
    const toSend = maxSend > 0 ? Math.min(extraMissing, maxSend) : extraMissing;
    /* boostDedup1: template 2° boost se prior (canale/mem/DB) dice già ≥1 */
    const embedPriorSlots = Math.max(priorSlots, announcedSlots, channelEmbedsInPeriod, recentMemSent);
    /* boostAlign1: niente embed in anticipo sul messaggio di Discord. Con 2 boost comprati insieme
       il conteggio sale subito di 2, ma Discord scrive il 2° messaggio anche un minuto dopo:
       il 2° embed aspetta quel messaggio (o al massimo 3 minuti). Solo per i boost appena fatti. */
    const liveEvent =
      !opts.skipNativeWait && Number(opts.startedAt) > 0 && Date.now() - Number(opts.startedAt) < 5 * 60 * 1000;
    let toSendNow = toSend;
    if (liveEvent) {
      toSendNow = boostEmbedsAllowedNow(boostKey, toSend);
      if (toSendNow < toSend) {
        deferBoostEmbeds(boostKey, (timedOut) => {
          void recoverMissingBoostEmbedsForUser(guild, uid, { ...opts, skipNativeWait: timedOut }).catch(() => null);
        });
      }
      if (toSendNow <= 0) return { ok: true, sent: 0, reason: "waiting_native_message" };
    }
    const sentNow = await sendBoostEmbeds(
      boostAnnounceChannel,
      member,
      toSendNow,
      latestCount,
      embedPriorSlots,
      { confirmedDoubleBurst: confirmedDoubleBurst && embedPriorSlots < 1 && toSendNow >= 2 },
    );
    if (sentNow <= 0) {
      return { ok: true, sent: 0, reason: "send_failed" };
    }
    noteBoostEmbedsSentAligned(boostKey, sentNow);
    await trackBoostSlotsAnnouncedAndMaybeGrantDoubleBooster(member, gid, embedPriorSlots + sentNow);
    rememberBoostAnnounce(boostKey, latestCount, member.premiumSinceTimestamp);
    noteBoostEmbedsSentRecently(boostKey, sentNow);
    return { ok: true, sent: sentNow };
  } finally {
    boostAnnounceSendLocks.delete(boostKey);
  }
}

async function recoverBoostEmbedsForUserUntilComplete(guild?, channel?, userId?, opts: Record<string, any> = {}) {
  const uid = String(userId || "");
  if (!uid) return { sent: 0, reason: "invalid_user" };
  const expected = Math.max(1, Math.min(2, Number(opts.expected || 1)));
  const maxPasses = Math.max(1, Math.min(5, Number(opts.maxPasses || 3)));
  const embedSinceMs = Number.isFinite(Number(opts.embedSinceMs))
    ? Math.max(0, Number(opts.embedSinceMs))
    : Math.max(0, Number(opts.startedAt || 0) - 1000);
  const nativeLookbackMs = Math.max(60_000, Number(opts.nativeLookbackMs || 48 * 60 * 60 * 1000));
  const startedAt = Number.isFinite(Number(opts.startedAt)) ? Number(opts.startedAt) : Date.now() - nativeLookbackMs;

  /* boostDedup1: non azzerare handled — altrimenti ogni pass re-invia mentre il canale lagga */
  const boostKeyEarly = `${String(guild?.id || "")}:${uid}`;
  if (isBoostAnnounceHandled(boostKeyEarly) && recentBoostEmbedsSentCount(boostKeyEarly) >= expected) {
    return { sent: 0, reason: "recently_handled", expected };
  }
  let totalSent = 0;
  let lastReason = "";

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const recentMem = recentBoostEmbedsSentCount(boostKeyEarly);
    const embedCount = Math.max(
      recentMem,
      await countRecentBotBoostAnnouncesForUser(channel, uid, {
        sinceMs: embedSinceMs,
        limit: 100,
      }).catch(() => 0),
    );
    if (embedCount >= expected) {
      lastReason = "complete";
      break;
    }
    const result = await recoverMissingBoostEmbedsForUser(guild, uid, {
      knownNativeSlots: expected,
      expectedSlots: expected,
      startedAt,
      nativeLookbackMs,
      allowSecondRecovery: expected >= 2,
      maxSend: Math.max(0, expected - embedCount),
    }).catch(() => ({ ok: false, sent: 0, reason: "exception" }));
    const sent = Math.max(0, Number(result?.sent || 0));
    lastReason = String(result?.reason || (sent > 0 ? "sent" : "no_progress"));
    if (sent <= 0) break;
    totalSent += sent;
    await sleep(500);
  }

  return { sent: totalSent, reason: lastReason, expected };
}

async function recoverConcurrentNativeBoosts(guild?, primaryChannel?, opts: Record<string, any> = {}) {
  const gid = String(guild?.id || "");
  const mainId = String(IDs.guilds?.main || "");
  if (!gid || !mainId || gid !== mainId) return { ok: false, reason: "not_main_guild" };
  const skipUserId = String(opts.skipUserId || "").trim();
  const { byUser, windowMs } = await collectRecentNativeBoosterCandidates(guild, primaryChannel, opts);
  let embedsSent = 0;
  for (const [uid, row] of byUser.entries()) {
    if (skipUserId && uid === skipUserId) continue;
    const slots = Math.max(1, Math.min(2, Number(row?.slots || 1)));
    const result = await recoverBoostEmbedsForUserUntilComplete(guild, primaryChannel, uid, {
      expected: slots,
      startedAt: Number(row?.firstTs || Date.now() - windowMs),
      embedSinceMs: Math.max(0, Number(row?.firstTs || 0) - 10 * 60 * 1000),
      nativeLookbackMs: windowMs,
    }).catch(() => ({ sent: 0 }));
    embedsSent += Math.max(0, Number(result?.sent || 0));
    if (byUser.size > 1) await sleep(400);
  }
  return { ok: true, users: byUser.size, embedsSent };
}

export = {
  resolveFreshGuildBoostCount,
  recoverMissingBoostEmbedsForUser,
  recoverBoostEmbedsForUserUntilComplete,
  recoverConcurrentNativeBoosts,
};
