/** Boost: annuncio di un boost nuovo e ruolo doppio booster (orchestrazione memberUpdate). */
const { PermissionsBitField, AuditLogEvent } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { getAnnouncedBoostSlots, setAnnouncedBoostSlots, deleteAnnouncedBoostSlots, ensureBoostSlotsSynced, persistAnnouncedBoostSlotsToDb } = require("../utils/boostSlotAnnounceTracker") as typeof import("../utils/boostSlotAnnounceTracker");
const { boostAnnounceCache, nativeBoostSeenSince, shouldSkipDuplicateBoostAnnounce } = require("./boostAnnounceState") as typeof import("./boostAnnounceState");
const { NATIVE_BOOST_ACCUMULATE_MS } = require("./boostNative") as typeof import("./boostNative");
const { addPerkRoleIfPossible } = require("./memberPerks") as typeof import("./memberPerks");
const { boostCountCache, boostAnnounceSendLocks } = require("./boostAnnounceRuntime") as typeof import("./boostAnnounceRuntime");
const { resolveFreshGuildBoostCount, recoverMissingBoostEmbedsForUser, recoverBoostEmbedsForUserUntilComplete, recoverConcurrentNativeBoosts } = require("./boostAnnounceRecoveryCore") as typeof import("./boostAnnounceRecoveryCore");
const { announceBoostFromMemberUpdate, scheduleBoostFollowup } = require("./boostAnnounceDispatch") as typeof import("./boostAnnounceDispatch");

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

  const { currentCount, countIncreased, guildBoostDecreased, boostDrop } = computeBoostDelta(
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

export = {
  boostCountCache,
  computeBoostDelta,
  handleBoostUpdate,
  recoverBoostEmbedsForUserUntilComplete,
  recoverConcurrentNativeBoosts,
  recoverMissingBoostEmbedsForUser,
};
