/** Boost: annuncio di un boost nuovo e ruolo doppio booster. */
const { PermissionsBitField, AuditLogEvent } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { getAnnouncedBoostSlots, setAnnouncedBoostSlots, deleteAnnouncedBoostSlots, ensureBoostSlotsSynced, persistAnnouncedBoostSlotsToDb } = require("../../Utils/Community/boostSlotAnnounceTracker") as typeof import("../../Utils/Community/boostSlotAnnounceTracker");
const { buildBoostPayload, buildBoostPayloadSecond, buildBoostAnnounceContent } = require("../../Utils/Community/boostAnnounceEmbeds") as typeof import("../../Utils/Community/boostAnnounceEmbeds");
const { boostAnnounceCache, clearBoostAnnounceHandled, noteBoostEmbedsSentRecently, recentBoostEmbedsSentCount, nativeBoostSeenSince, markBoostAnnounceHandled, isBoostAnnounceHandled, countRecentBotBoostAnnouncesForUser, countRecentBotBoostAnnouncesForUserMulti, resolveBoostAnnounceSyncState, markBoostAnnounceHandledIfSynced, rememberBoostAnnounce, resolveBoostSlotTarget, boostAnnouncePeriodSinceMs, syncAnnouncedBoostSlotsFromChannelCount, shouldSkipDuplicateBoostAnnounce } = require("./boostAnnounceState") as typeof import("./boostAnnounceState");
const { NATIVE_BOOST_ACCUMULATE_MS, collectRecentNativeBoosterCandidates } = require("./boostNative") as typeof import("./boostNative");
const { sleep } = require("./memberUpdateLogs") as typeof import("./memberUpdateLogs");
const { addPerkRoleIfPossible } = require("./memberPerks") as typeof import("./memberPerks");
const { boostEmbedsAllowedNow, deferBoostEmbeds, noteBoostEmbedsSentAligned } = require("./boostNativeAlign") as typeof import("./boostNativeAlign");

const BOOST_NATIVE_WAIT_INITIAL_MS = 0;
const BOOST_NATIVE_WAIT_POLL_MS = 150;
const BOOST_NATIVE_WAIT_SINGLE_MS = 1200;
const BOOST_NATIVE_WAIT_MAX_MS = 3500;
const boostCountCache = new Map();
const boostFollowupLocks = new Map();
const boostAnnounceSendLocks = new Set();

async function sendBoostEmbeds(channel?, member?, times?, boostCount?, priorAnnouncedSlots = 0, opts: Record<string, any> = {}) {
  if (!channel?.isTextBased?.()) return 0;
  const safeTimes = Math.max(0, Number(times || 0));
  const start = Math.max(0, Math.floor(Number(priorAnnouncedSlots || 0)));
  if (safeTimes <= 0) return 0;

  const endExclusive = start + safeTimes;
  /* boostFalseDouble3: collapse a un solo DOPPIO SOLO se il nativo è davvero "2 volte"
     (altrimenti start=0+times=2 mandava DOPPIO e bloccava il 2° boost reale). */
  const confirmedDoubleBurst = Boolean(opts.confirmedDoubleBurst);
  if (confirmedDoubleBurst && start < 2 && endExclusive >= 2) {
    const boostPayload = buildBoostPayloadSecond(member, Math.max(1, Number(boostCount || 0)));
    const sent = await channel
      .send({
        ...boostPayload,
        content: buildBoostAnnounceContent(member.user),
      })
      .catch((err?) => {
        global.logger?.warn?.(
          "[guildMemberUpdate] boost embed send failed:",
          member?.id,
          err?.message || err,
        );
        return null;
      });
    if (!sent?.id) return 0;
    return Math.max(0, 2 - start);
  }

  let sentCount = 0;
  for (let i = 0; i < safeTimes; i += 1) {
    const slotIndex = start + i;
    const remainingInBatch = safeTimes - i - 1;
    const countForEmbed = Math.max(1, Number(boostCount || 0) - remainingInBatch);
    const boostPayload =
      slotIndex >= 1
        ? buildBoostPayloadSecond(member, countForEmbed)
        : buildBoostPayload(member, countForEmbed);
    const sent = await channel
      .send({
        ...boostPayload,
        content: buildBoostAnnounceContent(member.user),
      })
      .catch((err?) => {
        global.logger?.warn?.(
          "[guildMemberUpdate] boost embed send failed:",
          member?.id,
          err?.message || err,
        );
        return null;
      });
    if (!sent?.id) break;
    sentCount += 1;
    if (i + 1 < safeTimes) await sleep(350);
  }
  return sentCount;
}

async function trackBoostSlotsAnnouncedAndMaybeGrantDoubleBooster(member?, guildId?, nextCount?) {
  const mainId = String(IDs.guilds.main || "");
  if (!mainId || String(member?.guild?.id || "") !== mainId) return;
  if (member.user?.bot) return;
  const next = Math.min(2, Math.max(0, Math.floor(Number(nextCount || 0))));
  setAnnouncedBoostSlots(guildId, member.id, next);
  await persistAnnouncedBoostSlotsToDb(guildId, member.id).catch(() => null);

  const doubleId = IDs?.roles?.DoubleBooster;
  if (!doubleId || !member?.roles?.add) return;
  const me = member.guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;
  const role = member.guild.roles.cache.get(doubleId);
  if (!role || role.position >= me.roles.highest.position) return;
  if (next < 2 || member.roles.cache.has(doubleId)) return;
  /* boostFalseDouble1: ruolo solo se gli slot persistiti sono davvero ≥2 (non solo nextCount di passaggio) */
  const persisted = getAnnouncedBoostSlots(guildId, member.id);
  if (persisted < 2) return;
  const ok = await member.roles.add(doubleId).then(() => true).catch(() => false);
  if (!ok) {
    global.logger?.warn?.("[guildMemberUpdate] Double Booster add failed:", member.guild.id, member.id);
  }
}

function computeBoostDelta(oldMember?, newMember?, guildId?, opts: Record<string, any> = {}) {
  const currentCount = Number(newMember.guild.premiumSubscriptionCount || 0);
  const oldCountFromEvent = Number(oldMember?.guild?.premiumSubscriptionCount || 0);
  const snapshot = opts.prevCachedCount;
  const prevCount =
    typeof snapshot === "number" && Number.isFinite(snapshot)
      ? snapshot
      : typeof boostCountCache.get(guildId) === "number"
        ? boostCountCache.get(guildId)
        : oldCountFromEvent;
      const effectivePrev = Number.isFinite(Number(prevCount)) ? Number(prevCount) : 0;
  const countIncreased = currentCount > effectivePrev;
  const boostDelta = countIncreased ? Math.max(1, currentCount - effectivePrev) : 0;
  const guildBoostDecreased = currentCount < effectivePrev;
  const boostDrop = guildBoostDecreased ? Math.max(0, effectivePrev - currentCount) : 0;

  return { currentCount, countIncreased, boostDelta, effectivePrev, guildBoostDecreased, boostDrop };
}

async function auditShowsRecentPremiumSinceChangeForMember(guild?, memberId?, maxAgeMs = 15000) {
  if (!guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)) return false;
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 25 }).catch(() => null);
  if (!logs?.entries?.size) return false;
  const now = Date.now();
  const mid = String(memberId || "");
  for (const entry of logs.entries.values()) {
    if (String(entry.targetId || "") !== mid) continue;
    const age = now - entry.createdTimestamp;
    if (age > maxAgeMs || age < 0) continue;
    const changes = entry.changes || [];
    if (changes.some((c?) => String(c.key) === "premium_since")) return true;
  }
  return false;
}

async function maybeRevokeDoubleBoosterAfterSlotLoss({ oldMember, newMember, guildId, drop }) {
  const mainId = String(IDs.guilds.main || "");
  const doubleBoosterId = IDs?.roles?.DoubleBooster || null;
  if (!doubleBoosterId || mainId !== String(guildId) || !newMember?.roles?.cache) return;
  await ensureBoostSlotsSynced(guildId, newMember.id);
  if (!newMember.roles.cache.has(doubleBoosterId)) return;
  const newBoostTs = newMember.premiumSinceTimestamp || 0;
  if (!newBoostTs) return;
  const d = Math.max(0, Math.floor(Number(drop || 0)));
  if (d < 1) return;

  const oldBoostTs = oldMember.premiumSinceTimestamp || 0;
  const premiumChanged = (oldBoostTs || 0) !== (newBoostTs || 0);
  let treatAsThisMemberBoostChange = premiumChanged;
  if (!treatAsThisMemberBoostChange) {
    treatAsThisMemberBoostChange = await auditShowsRecentPremiumSinceChangeForMember(newMember.guild, newMember.id);
  }
  if (!treatAsThisMemberBoostChange) return;

  let slots = getAnnouncedBoostSlots(guildId, newMember.id);
  if (slots < 2) slots = 2;
  slots = Math.max(0, slots - d);
  setAnnouncedBoostSlots(guildId, newMember.id, slots);
  await persistAnnouncedBoostSlotsToDb(guildId, newMember.id);

  if (slots < 2) {
    const me = newMember.guild.members.me;
    const role = newMember.guild.roles.cache.get(doubleBoosterId);
    if (
      me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) &&
      role &&
      role.position < me.roles.highest.position
    ) {
      await newMember.roles.remove(doubleBoosterId).catch(() => { });
    }
  }
  if (slots <= 0) await deleteAnnouncedBoostSlots(guildId, newMember.id);
}

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

async function handleBoostUpdate(oldMember?, newMember?) {
  const boostChannelId = IDs.channels.supporters;
  if (!boostChannelId) return;
  const boostAnnounceChannel = newMember.guild.channels.cache.get(boostChannelId) || (await getGuildChannelCached(newMember.guild, boostChannelId));
  if (!boostAnnounceChannel?.isTextBased?.()) return;

  const guildId = newMember.guild.id;
  const mainIdForBoost = String(IDs.guilds.main || "");
  if (mainIdForBoost && String(guildId) === mainIdForBoost) {
    await ensureBoostSlotsSynced(guildId, newMember.id);
  }

  const oldBoostTs = oldMember.premiumSinceTimestamp || 0;
  const newBoostTs = newMember.premiumSinceTimestamp || 0;
  const boostKey = `${guildId}:${newMember.id}`;
  const mainId = String(IDs.guilds.main || "");
  const doubleBoosterId = IDs?.roles?.DoubleBooster || null;
  if (mainIdForBoost && String(guildId) === mainIdForBoost && oldBoostTs > 0 && !newBoostTs) {
    boostAnnounceCache.delete(boostKey);
    await deleteAnnouncedBoostSlots(guildId, newMember.id);
    if (
      doubleBoosterId &&
      newMember.roles.cache.has(doubleBoosterId)
    ) {
      const me = newMember.guild.members.me;
      const role = newMember.guild.roles.cache.get(doubleBoosterId);
      if (
        me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) &&
        role &&
        role.position < me.roles.highest.position
      ) {
        await newMember.roles.remove(doubleBoosterId).catch(() => { });
      }
    }
  }

  const prevCachedBoostCount =
    typeof boostCountCache.get(guildId) === "number"
      ? boostCountCache.get(guildId)
      : Number(oldMember?.guild?.premiumSubscriptionCount || 0);

  if (mainIdForBoost && String(guildId) === mainIdForBoost && oldBoostTs > 0 && newBoostTs > 0) {
    await newMember.guild.fetch().catch(() => {});
  }

      const freshBoostCount = await resolveFreshGuildBoostCount(newMember.guild).catch(() => null);
  if (Number.isFinite(Number(freshBoostCount))) {
    try {
      newMember.guild.premiumSubscriptionCount = Number(freshBoostCount);
    } catch (ePc) {}
  }

  const { currentCount, countIncreased, boostDelta, guildBoostDecreased, boostDrop } = computeBoostDelta(
    oldMember,
    newMember,
    guildId,
    { prevCachedCount: prevCachedBoostCount },
  );
  if (guildBoostDecreased && boostDrop > 0) {
    await maybeRevokeDoubleBoosterAfterSlotLoss({ oldMember, newMember, guildId, drop: boostDrop }).catch((err?) => {
      global.logger?.warn?.("[guildMemberUpdate] Double Booster partial revoke:", newMember?.id, err?.message || err);
    });
  }

  const alreadyBoostingBefore = oldBoostTs > 0;
  const startedBoostingNow = !alreadyBoostingBefore && newBoostTs > 0;
  const boosterRoleId = IDs?.roles?.ServerBooster || null;
  const boosterRoleAdded = Boolean(boosterRoleId && oldMember?.roles?.cache && newMember?.roles?.cache && !oldMember.roles.cache.has(boosterRoleId) && newMember.roles.cache.has(boosterRoleId));
  const boosterRoleAddedWithoutPremiumSince = boosterRoleAdded && !oldBoostTs && !newBoostTs;
  const premiumSinceChanged = alreadyBoostingBefore && newBoostTs > 0 && newBoostTs !== oldBoostTs;
  const realNewBoost = newBoostTs > 0 && countIncreased;
  const recentNativeSlots = nativeBoostSeenSince(guildId, newMember.id, Date.now() - NATIVE_BOOST_ACCUMULATE_MS);
  /* boostMiss1: secondo/N boost mentre già booster — premiumSince NON cambia,
     quindi senza segnale nativo + countIncrease lo skippavamo del tutto. */
  const additionalBoostWhileActive = Boolean(
    alreadyBoostingBefore &&
      newBoostTs > 0 &&
      (countIncreased || recentNativeSlots > 0 || boosterRoleAdded),
  );
  const shouldAnnounce = Boolean(
    startedBoostingNow ||
    realNewBoost ||
    additionalBoostWhileActive ||
    (premiumSinceChanged && (countIncreased || recentNativeSlots > 0)) ||
    (boosterRoleAddedWithoutPremiumSince && (countIncreased || recentNativeSlots > 0)),
  );
  if (!shouldAnnounce) {
    boostCountCache.set(guildId, currentCount);
    return;
  }

  if (shouldSkipDuplicateBoostAnnounce(boostKey, countIncreased, currentCount, newBoostTs)) {
    boostCountCache.set(guildId, currentCount);
    return;
  }

  if (boostAnnounceSendLocks.has(boostKey)) {
    boostCountCache.set(guildId, currentCount);
    scheduleBoostFollowup(boostAnnounceChannel, newMember, guildId, boostKey, {
      expectedSlots: Math.min(2, Math.max(1, recentNativeSlots || 1)),
      currentCount,
      premiumSinceTs: newBoostTs,
    });
    return;
  }

  boostCountCache.set(guildId, currentCount);
  void addPerkRoleIfPossible(newMember).catch(() => null);
  let alreadyAnnouncedSlots = getAnnouncedBoostSlots(guildId, newMember.id);
  if (startedBoostingNow && alreadyAnnouncedSlots > 0) {
    setAnnouncedBoostSlots(guildId, newMember.id, 0);
    await persistAnnouncedBoostSlotsToDb(guildId, newMember.id).catch(() => null);
    alreadyAnnouncedSlots = 0;
  }
  let expectedSlots;
  if (startedBoostingNow) {
    expectedSlots = Math.min(2, Math.max(1, recentNativeSlots || 1));
  } else {
    expectedSlots = Math.min(
      2,
      Math.max(alreadyAnnouncedSlots + 1, recentNativeSlots || 0, 1),
    );
  }
  expectedSlots = Math.max(1, expectedSlots);
  /* boostFalseDouble2: 2° boost reale = countIncreased (o nativi ≥2), non il race del 1° messaggio system */
  const secondBoostConfirmed = Boolean(
    additionalBoostWhileActive && (countIncreased || recentNativeSlots >= 2),
  );
  await announceBoostFromMemberUpdate(boostAnnounceChannel, newMember, guildId, boostKey, {
    expectedSlots,
    currentCount,
    premiumSinceTs: newBoostTs,
    nativeEventIncrement: !startedBoostingNow,
    nativeEventSlots: Math.max(1, recentNativeSlots >= 2 ? 2 : 1),
    secondBoostConfirmed,
    allowSecondRecovery: secondBoostConfirmed,
  });
  recoverConcurrentNativeBoosts(newMember.guild, boostAnnounceChannel, { windowMs: 3 * 60 * 1000 }).catch(() => null);
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

export = { boostCountCache, computeBoostDelta, handleBoostUpdate, recoverBoostEmbedsForUserUntilComplete, recoverConcurrentNativeBoosts, recoverMissingBoostEmbedsForUser };
