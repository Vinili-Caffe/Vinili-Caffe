const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { isValidGuildUserId } = require("../../../shared/db/validateWriteIds") as typeof import("../../../shared/db/validateWriteIds");
const { getClientGuildCached, getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { ensureMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { getUserExpStats, syncLevelRolesForMember } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
const { applyTenureForMember } = require("../../Community/services/communityOpsService") as typeof import("../../Community/services/communityOpsService");
const { applyZodiacRoleFromBirthday } = require("../../Community/utils/zodiacRoles") as typeof import("../../Community/utils/zodiacRoles");
const { applyAgeBracketRoleFromBirthday } = require("../../Community/utils/ageBracketRoles") as typeof import("../../Community/utils/ageBracketRoles");
const { restorePersistedPersonalityRoles, persistMuteRoleSnapshotToProfile, loadStoredPersonalityRoleIds } = require("../../Community/utils/personalityRolePersistence") as typeof import("../../Community/utils/personalityRolePersistence");
const {
  registerMuteMirrorRestoreRoleSuppress,
  wasRoleRestoredByMuteMirror,
} = require("../utils/muteRestoreAnnounceSuppress") as typeof import("../utils/muteRestoreAnnounceSuppress");
const { syncClanTagRolesForUserEverywhereAfterMemberEvent } = require("../../Community/services/clanTagRoleService") as typeof import("../../Community/services/clanTagRoleService");
const { hasEventWeekWinnerGrant } = require("../../Community/services/weekWinnerGrantsService") as typeof import("../../Community/services/weekWinnerGrantsService");
const { hasExtraCustomPerksUnlock } = require("../../Community/utils/customPerksUnlock") as typeof import("../../Community/utils/customPerksUnlock");
const { setMemberRolesSafe, resolveGuildBotMember } = require("./muteRoleRest") as typeof import("./muteRoleRest");
const { isPostUnmuteReconciliationCurrent, markPostUnmuteReconciliationComplete, wasRecentUnmuteProfileRecoveryDone, markMuteMirrorStaffProtect, memberIsInMuteMirrorState, shouldSuppressStaffDepexForMuteMirror, dbReady, loadProfileMuteSnapshotRoleIds, loadSnapshot, isCommunicationTimeoutActive, hasPendingMuteMirrorSnapshot } = require("./muteStaffProtect") as typeof import("./muteStaffProtect");
const { EMPTY_SNAPSHOT_COOLDOWN_MS, upsertSnapshot, hasSnapshot, isEmptySnapshotOnCooldown, markEmptySnapshotCooldown, clearEmptySnapshotCooldown, recoverSnapshotRoleIdsFallback, clearSnapshot, collectSnapshotRoleIds, buildRolesWhileMuted, resolveMutedRoleContext, shouldDeferRoleRestoreForMuteMirror, captureMuteRoleSnapshot } = require("./muteSnapshot") as typeof import("./muteSnapshot");
const { didCommunicationTimeoutChange, resolveCommunicationTimeoutUntilMs } = require("./muteTimeout") as typeof import("./muteTimeout");
const { resyncProfileDerivedRolesForMember } = require("./muteProfileRoles") as typeof import("./muteProfileRoles");
const { restoreRolesAfterCommunicationTimeoutEnd } = require("./muteRestore") as typeof import("./muteRestore");







const RECENT_UNMUTE_RECOVERY_MS = 7 * 24 * 60 * 60 * 1000;
const SWEEP_DEFAULT_LIMIT = 50;
const ACTIVE_MUTE_RECONCILE_LIMIT = 80;
let muteMirrorSweepInFlight = null;
let activeMuteReconcileInFlight = null;

async function syncMutedMirrorRoleFromMemberUpdate(oldMember?, newMember?) {
  if (!newMember?.guild || newMember.user?.bot) return;
  try {
    const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
    if (!isViniliFullFeatureGuild(newMember.guild.id)) return;
  } catch (_) {}

  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  if (!mutedRoleId) return;

  if (!didCommunicationTimeoutChange(oldMember, newMember)) {
        const nowActive = isCommunicationTimeoutActive(newMember);
    const hasMuted = newMember.roles.cache.has(mutedRoleId);
    if (!(nowActive || hasMuted)) return;
    const oldSize = oldMember?.roles?.cache?.size || 0;
    const newSize = newMember?.roles?.cache?.size || 0;
    if (newSize <= oldSize && hasMuted) {
          }
    await enforceMutedStripIfNeeded(newMember, {
      reason: "Timeout Discord / +mute (ruoli extra)",
    });
    return;
  }

  const guild = newMember.guild;
  const me = await resolveGuildBotMember(guild);
  const ctx = await resolveMutedRoleContext(guild, me, mutedRoleId);
  if (!ctx) return;

  const wasActive = isCommunicationTimeoutActive(oldMember);
  const nowActive = isCommunicationTimeoutActive(newMember);
  const hasMuted = newMember.roles.cache.has(ctx.mutedRoleId);
  const reasonIn = "Timeout Discord / +mute";
  const reasonOut = "Fine timeout / +unmute";

  if (nowActive && !wasActive) {
    const fresh =
      (await getGuildMemberCached(guild, newMember.id, { preferFresh: true }).catch(() => null)) ||
      oldMember ||
      newMember;
    let snapshotIds = collectSnapshotRoleIds(fresh, ctx.mutedRoleId);
    if (!snapshotIds.length) {
      snapshotIds = collectSnapshotRoleIds(oldMember, ctx.mutedRoleId);
    }
    if (!snapshotIds.length) {
      global.logger?.warn?.(
        "[mutedMirrorRole] snapshot vuoto al mute: applico solo Muted, nessuna strip ruoli",
        guild.id,
        newMember.id,
      );
      await newMember.roles.add(ctx.mutedRoleId, reasonIn).catch((err?) => {
        global.logger?.warn?.("[mutedMirrorRole] add failed:", guild.id, newMember.id, err?.message || err);
      });
      return;
    }
    await upsertSnapshot(guild.id, newMember.id, snapshotIds);
    if (!(await hasSnapshot(guild.id, newMember.id))) {
      global.logger?.error?.(
        "[mutedMirrorRole] abort strip: snapshot non disponibile",
        guild.id,
        newMember.id,
        snapshotIds.length,
      );
      await newMember.roles.add(ctx.mutedRoleId, reasonIn).catch((err?) => {
        global.logger?.warn?.("[mutedMirrorRole] add failed:", guild.id, newMember.id, err?.message || err);
      });
      return;
    }
    const stripTarget = buildRolesWhileMuted(fresh, me, ctx.mutedRoleId);
    await setMemberRolesSafe(newMember, stripTarget, reasonIn).catch((err?) => {
      global.logger?.warn?.("[mutedMirrorRole] strip+mirror failed:", guild.id, newMember.id, err?.message || err);
    });
    return;
  }

  if (nowActive && wasActive) {
    await enforceMutedStripIfNeeded(newMember, { me, reason: `${reasonIn} (sync)` });
    return;
  }

  if (!nowActive) {
    const saved = await loadSnapshot(guild.id, newMember.id);
    if (wasActive || hasMuted || saved.length > 0) {
      await restoreRolesAfterCommunicationTimeoutEnd(newMember, {
        me,
        mutedRoleId: ctx.mutedRoleId,
        mutedRole: ctx.mutedRole,
        reason: reasonOut,
        wasUnmuteFlow: true,
        client: newMember.client || guild.client,
      });
    }
  }
}

async function sweepExpiredCommunicationTimeoutMirrors(client?, options: Record<string, any> = {}) {
  if (muteMirrorSweepInFlight) return muteMirrorSweepInFlight;
  muteMirrorSweepInFlight = runSweepExpiredCommunicationTimeoutMirrors(client, options).finally(() => {
    muteMirrorSweepInFlight = null;
  });
  return muteMirrorSweepInFlight;
}

async function runSweepExpiredCommunicationTimeoutMirrors(client?, options: Record<string, any> = {}) {
  if (!client?.guilds || !dbReady()) return { reconciled: 0, scanned: 0 };

  const limit = Math.max(1, Math.min(200, Number(options.limit) || SWEEP_DEFAULT_LIMIT));
  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  let reconciled = 0;
  let scanned = 0;
  const seen = new Set();

  const docs = await ActivityUserProfile.find({ "profile.muteRoleSnapshot.roleIds.0": { $exists: true } })
    .select("guildId userId")
    .limit(limit)
    .lean()
    .catch(() => []);
  for (const doc of docs) {
    const guildId = String(doc.guildId || "");
    const userId = String(doc.userId || "");
    const key = `${guildId}:${userId}`;
    if (!guildId || !userId || seen.has(key)) continue;
    try {
      const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
      if (!isViniliFullFeatureGuild(guildId)) continue;
    } catch (_) {}
    seen.add(key);
    scanned += 1;

    const guild = await getClientGuildCached(client, guildId);
    if (!guild) {
      await clearSnapshot(guildId, userId);
      continue;
    }
    const member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
    if (!member) {
            continue;
    }
    const untilMs = await resolveCommunicationTimeoutUntilMs(member, guild);
        if (untilMs == null || untilMs > Date.now()) continue;

    const result = await restoreRolesAfterCommunicationTimeoutEnd(member, {
      ...options,
      client,
      wasUnmuteFlow: true,
    });
    if (result?.restored && result?.reason !== "already_reconciled") {
      reconciled += 1;
      global.logger?.info?.(
        `[mutedMirrorRole] restored guild=${guildId} user=${userId} reason=${result?.reason || "ok"}`,
      );
    }
  }

  if (mutedRoleId) {
    for (const guildStub of client.guilds.cache.values()) {
      const guildId = String(guildStub?.id || "").trim();
      if (!guildId) continue;
      try {
        const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
        if (!isViniliFullFeatureGuild(guildId)) continue;
      } catch (_) {}

      let guild = guildStub;
            if (guild?.partial === true || !guild?.members || typeof guild.members.fetch !== "function") {
        guild = await getClientGuildCached(client, guildId).catch(() => null);
        if (!guild?.members) continue;
      }

      const me = await resolveGuildBotMember(guild, options);
      if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) continue;
      let mutedRole = guild.roles?.cache?.get(mutedRoleId);
      if (!mutedRole) mutedRole = await guild.roles?.fetch?.(mutedRoleId).catch(() => null);
      if (!mutedRole?.members) continue;

      for (const [, cachedMember] of mutedRole.members) {
        if (cachedMember.user?.bot) continue;
        const key = `${guild.id}:${cachedMember.id}`;
        if (seen.has(key)) continue;

                const member = await getGuildMemberCached(guild, cachedMember.id, { preferFresh: true }).catch(() => null);
        if (!member?.roles?.cache) {
          await clearSnapshot(guild.id, cachedMember.id);
          mutedRole.members?.delete?.(cachedMember.id);
          continue;
        }
        const untilMs = await resolveCommunicationTimeoutUntilMs(member, guild);
        if (untilMs == null || untilMs > Date.now()) continue;

        const saved = await loadSnapshot(guild.id, member.id);
        if (saved.length === 0 && !member.roles.cache.has(mutedRoleId)) {
          mutedRole.members?.delete?.(member.id);
          continue;
        }

        seen.add(key);
        scanned += 1;
        const result = await restoreRolesAfterCommunicationTimeoutEnd(member, {
          ...options,
          client,
          wasUnmuteFlow: true,
        });
        if (result?.restoreOk || (result?.restored && !member.roles.cache.has(mutedRoleId))) {
          mutedRole.members?.delete?.(member.id);
        }
        if (result?.restored && result?.reason !== "already_reconciled") {
          reconciled += 1;
          global.logger?.info?.(
            `[mutedMirrorRole] restored guild=${guild.id} user=${member.id} reason=${result?.reason || "ok"}`,
          );
        }
      }
    }
  }

  const recent = options.includeRecentUnmuteRecovery
    ? await sweepRecentUnmuteProfileRecovery(client, options).catch(() => ({ recovered: 0 }))
    : { recovered: 0 };
  reconciled += Number(recent?.recovered || 0);

  if (reconciled > 0) {
    global.logger?.info?.(`[mutedMirrorRole] sweep reconciled ${reconciled} member(s), scanned=${scanned}`);
  }
  return { reconciled, scanned };
}

async function sweepRecentUnmuteProfileRecovery(client?, options: Record<string, any> = {}) {
  if (!client?.guilds || !dbReady()) return { recovered: 0, scanned: 0 };
  const since = new Date(Date.now() - RECENT_UNMUTE_RECOVERY_MS);
  const limit = Math.max(1, Math.min(100, Number(options.recentUnmuteLimit) || 30));
  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  const profiles = await ActivityUserProfile.find({
    "moderation.modCases": {
      $elemMatch: { action: "UNMUTE", createdAt: { $gte: since } },
    },
  })
    .limit(limit)
    .select("guildId userId moderation.modCases moderation.postUnmuteRolesReconciledAt")
    .lean()
    .maxTimeMS(8000)
    .catch(() => []);

  let recovered = 0;
  let scanned = 0;
  for (const row of profiles) {
    const guildId = String(row.guildId || "");
    const userId = String(row.userId || "");
    if (!guildId || !userId) continue;
    if (isPostUnmuteReconciliationCurrent(row, guildId, userId)) continue;
    if (wasRecentUnmuteProfileRecoveryDone(guildId, userId)) continue;

    const guild = await getClientGuildCached(client, guildId);
    if (!guild) continue;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member || member.user?.bot || isCommunicationTimeoutActive(member)) continue;

    const hasMuted = Boolean(mutedRoleId && member.roles.cache.has(mutedRoleId));
    const saved = await loadSnapshot(guildId, userId);
    if (!hasMuted && saved.length === 0) {
      await markPostUnmuteReconciliationComplete(guildId, userId);
      continue;
    }

    scanned += 1;
    const resync = await restoreRolesAfterCommunicationTimeoutEnd(member, {
      client,
      wasUnmuteFlow: true,
      profileDoc: row,
      reason: String(options.reason || "Recupero automatico post-unmute"),
    }).catch(() => null);
    if (resync?.restored && resync?.reason !== "already_reconciled" && resync?.reason !== "noop") {
      recovered += 1;
    }
  }

  if (recovered > 0) {
    global.logger?.info?.(`[mutedMirrorRole] recent unmute profile recovery: ${recovered} member(s), scanned=${scanned}`);
  }
  return { recovered, scanned };
}

async function handleMuteMirrorOnMemberLeave(member?) {
        void member;
}

async function syncMutedMirrorOnMemberJoin(member?) {
  if (!member?.guild || member.user?.bot) return;

  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  if (!mutedRoleId) return;

  const guild = member.guild;
  const me = await resolveGuildBotMember(guild);
  const ctx = await resolveMutedRoleContext(guild, me, mutedRoleId);
  if (!ctx) return;

  const timeoutActive = isCommunicationTimeoutActive(member);
  let saved = await loadSnapshot(guild.id, member.id);
  if (!timeoutActive && !saved.length) return;

    if (!timeoutActive && saved.length) {
    await restoreRolesAfterCommunicationTimeoutEnd(member, {
      me,
      mutedRoleId: ctx.mutedRoleId,
      mutedRole: ctx.mutedRole,
      reason: "Rejoin post-mute: ripristino snapshot",
      wasUnmuteFlow: true,
      client: member.client || guild.client,
    });
    return;
  }

  const reasonIn = "Timeout Discord / +mute (rejoin)";
  if (!saved.length && timeoutActive) {
            const fromProfile = await loadProfileMuteSnapshotRoleIds(guild.id, member.id);
    const snapshotIds = fromProfile.length
      ? fromProfile
      : collectSnapshotRoleIds(member, ctx.mutedRoleId);
    if (snapshotIds.length) {
      await upsertSnapshot(guild.id, member.id, snapshotIds);
      saved = snapshotIds;
    }
  }
  if (!(await hasSnapshot(guild.id, member.id))) {
    global.logger?.error?.(
      "[mutedMirrorRole] abort rejoin strip: snapshot non disponibile",
      guild.id,
      member.id,
    );
    await member.roles.add(ctx.mutedRoleId, reasonIn).catch(() => null);
    return;
  }
  const stripTarget = me
    ? buildRolesWhileMuted(member, me, ctx.mutedRoleId)
    : [ctx.mutedRoleId];
  await setMemberRolesSafe(member, stripTarget, reasonIn).catch((err?) => {
    global.logger?.warn?.("[mutedMirrorRole] rejoin strip+mirror failed:", guild.id, member.id, err?.message || err);
  });
}

async function enforceMutedStripIfNeeded(member?, options: Record<string, any> = {}) {
  if (!member?.guild || member.user?.bot) return false;
  try {
    const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
    if (!isViniliFullFeatureGuild(member.guild.id)) return false;
  } catch (_) {}

  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  if (!mutedRoleId) return false;

  const timeoutActive = isCommunicationTimeoutActive(member);
  const hasMuted = member.roles.cache.has(mutedRoleId);
  const hasPending = timeoutActive ? true : await hasPendingMuteMirrorSnapshot(member.guild.id, member.id);
  if (!timeoutActive && !hasMuted && !hasPending) return false;
  if (!timeoutActive && !hasMuted) return false;

  const guild = member.guild;
  const me = options.me || (await resolveGuildBotMember(guild));
  const ctx = await resolveMutedRoleContext(guild, me, mutedRoleId);
  if (!ctx) return false;

    if (timeoutActive && !(await hasSnapshot(guild.id, member.id))) {
    if (isEmptySnapshotOnCooldown(guild.id, member.id)) {
            if (!member.roles.cache.has(ctx.mutedRoleId)) {
        await member.roles.add(ctx.mutedRoleId, String(options.reason || "Timeout Discord / +mute")).catch(() => null);
      }
      return false;
    }
    const fromProfile = await loadProfileMuteSnapshotRoleIds(guild.id, member.id);
    let snapshotIds = fromProfile.length
      ? fromProfile
      : collectSnapshotRoleIds(member, ctx.mutedRoleId);
    if (!snapshotIds.length) {
      snapshotIds = await recoverSnapshotRoleIdsFallback(guild.id, member.id, ctx.mutedRoleId);
    }
    if (snapshotIds.length) {
      await upsertSnapshot(guild.id, member.id, snapshotIds);
      clearEmptySnapshotCooldown(guild.id, member.id);
    }
  }

  const stripTarget = me
    ? buildRolesWhileMuted(member, me, ctx.mutedRoleId)
    : [ctx.mutedRoleId];
  const allowed = new Set(stripTarget.map(String));
  let needsStrip = !member.roles.cache.has(ctx.mutedRoleId);
  if (!needsStrip) {
    for (const [id] of member.roles.cache) {
      const rid = String(id || "").trim();
      if (!rid || rid === String(guild.id)) continue;
      if (!allowed.has(rid)) {
        needsStrip = true;
        break;
      }
    }
  }
    if (!needsStrip) {
    if (timeoutActive && !(await hasSnapshot(guild.id, member.id))) {
      markEmptySnapshotCooldown(guild.id, member.id);
    }
    return false;
  }

    if (timeoutActive && !(await hasSnapshot(guild.id, member.id))) {
    markEmptySnapshotCooldown(guild.id, member.id);
    global.logger?.warn?.(
      "[mutedMirrorRole] enforce strip abortito: snapshot vuoto con ruoli extra",
      guild.id,
      member.id,
      `(cooldown ${Math.round(EMPTY_SNAPSHOT_COOLDOWN_MS / 60000)}m)`,
    );
    if (!member.roles.cache.has(ctx.mutedRoleId)) {
      await member.roles.add(ctx.mutedRoleId, String(options.reason || "Timeout Discord / +mute")).catch(() => null);
    }
    return false;
  }

  const reason = String(options.reason || "Timeout Discord / +mute (enforce strip)").trim();
  await setMemberRolesSafe(member, stripTarget, reason).catch((err?) => {
    global.logger?.warn?.("[mutedMirrorRole] enforce strip failed:", guild.id, member.id, err?.message || err);
  });
  return true;
}

async function applyActiveMuteMirror(member?, options: Record<string, any> = {}) {
  if (!member?.guild || member.user?.bot) return { ok: false, reason: "bad_member" };
  if (!isCommunicationTimeoutActive(member)) return { ok: false, reason: "no_timeout" };
  const reason = String(options.reason || "Timeout Discord / +mute (reconcile)").trim();
  const changed = await enforceMutedStripIfNeeded(member, {
    me: options.me,
    reason,
  });
  if (changed) return { ok: true, reason: "enforced" };
    const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  if (mutedRoleId && !member.roles.cache.has(mutedRoleId)) {
    await syncMutedMirrorOnMemberJoin(member);
    return { ok: true, reason: "rejoin_apply" };
  }
  return { ok: true, reason: "already_ok" };
}

async function reconcileIncompleteActiveMuteMirrors(client?, options: Record<string, any> = {}) {
  if (activeMuteReconcileInFlight) return activeMuteReconcileInFlight;
  activeMuteReconcileInFlight = runReconcileIncompleteActiveMuteMirrors(client, options).finally(() => {
    activeMuteReconcileInFlight = null;
  });
  return activeMuteReconcileInFlight;
}

async function runReconcileIncompleteActiveMuteMirrors(client?, options: Record<string, any> = {}) {
  if (!client?.guilds) return { scanned: 0, fixed: 0 };
  await ensureMongoReady({ maxWaitMs: 5000 }).catch(() => null);
  if (!dbReady()) return { scanned: 0, fixed: 0 };

  const limit = Math.max(1, Math.min(200, Number(options.limit) || ACTIVE_MUTE_RECONCILE_LIMIT));
  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  const seen = new Set();
  let scanned = 0;
  let fixed = 0;
  let skippedNoTimeout = 0;

  const queueByIds = async (guildId?, userId?, reason?) => {
    const uid = String(userId || "").trim();
    const gid = String(guildId || "").trim();
    if (!gid || !uid) return;
    const key = `${gid}:${uid}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (isEmptySnapshotOnCooldown(gid, uid)) return;
    try {
      const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
      if (!isViniliFullFeatureGuild(gid)) return;
    } catch (_) {}
    scanned += 1;

    const guild = await getClientGuildCached(client, gid).catch(() => null);
    if (!guild?.members) return;
    const member = await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
    if (!member || member.user?.bot) return;

        const untilMs = await resolveCommunicationTimeoutUntilMs(member, guild);
    const timeoutActive =
      untilMs == null
        ? isCommunicationTimeoutActive(member)
        : Number.isFinite(untilMs) && untilMs > Date.now();
    if (!timeoutActive) {
      skippedNoTimeout += 1;
      return;
    }
        if (
      Number.isFinite(untilMs) &&
      untilMs > Date.now() &&
      !isCommunicationTimeoutActive(member)
    ) {
      try {
        member.communicationDisabledUntilTimestamp = untilMs;
        member.communicationDisabledUntil = new Date(untilMs);
      } catch (_) {}
    }

    const beforeMuted = mutedRoleId ? member.roles.cache.has(mutedRoleId) : true;
    const result = await applyActiveMuteMirror(member, { reason }).catch((err?) => {
      global.logger?.warn?.("[mutedMirrorRole] active reconcile failed:", gid, uid, err?.message || err);
      return null;
    });
    if (!result?.ok) return;
    const after =
      (await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null)) || member;
    const afterMuted = mutedRoleId ? after.roles.cache.has(mutedRoleId) : true;
    if (!beforeMuted || result.reason === "enforced" || result.reason === "rejoin_apply") {
      if (afterMuted || result.reason === "enforced") {
        fixed += 1;
        global.logger?.info?.(
          `[mutedMirrorRole] active mute reconciled guild=${gid} user=${uid} via=${result.reason}`,
        );
      }
    }
  };

    const snapshotDocs = await ActivityUserProfile.find({ "profile.muteRoleSnapshot.roleIds.0": { $exists: true } })
    .select("guildId userId")
    .limit(limit)
    .lean()
    .catch(() => []);
  for (const doc of snapshotDocs) {
    if (scanned >= limit) break;
    await queueByIds(doc.guildId, doc.userId, "Timeout Discord / +mute (reconcile snapshot)");
  }

  const caseDocs = await ActivityUserProfile.find({
    "moderation.modCases": {
      $elemMatch: {
        action: "MUTE",
        active: { $ne: false },
        expiresAt: { $gt: new Date() },
      },
    },
  })
    .select("guildId userId")
    .limit(limit)
    .lean()
    .catch(() => []);
  for (const doc of caseDocs) {
    if (scanned >= limit) break;
    await queueByIds(doc.guildId, doc.userId, "Timeout Discord / +mute (reconcile case)");
  }

    if (options.scanTimedOutMembers !== false) {
    for (const guildStub of client.guilds.cache.values()) {
      if (scanned >= limit) break;
      const guildId = String(guildStub?.id || "").trim();
      if (!guildId) continue;
      try {
        const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
        if (!isViniliFullFeatureGuild(guildId)) continue;
      } catch (_) {}
      if (guildStub?.partial === true || !guildStub?.members?.cache?.size) continue;
      for (const [, cachedMember] of guildStub.members.cache) {
        if (scanned >= limit) break;
        if (!cachedMember || cachedMember.user?.bot) continue;
        if (!isCommunicationTimeoutActive(cachedMember)) continue;
        await queueByIds(guildId, cachedMember.id, "Timeout Discord / +mute (reconcile timed-out)");
      }
    }
  }

  if (fixed > 0) {
    global.logger?.info?.(
      `[mutedMirrorRole] active mute reconcile scanned=${scanned} fixed=${fixed} skippedNoTimeout=${skippedNoTimeout}`,
    );
  }
  return { scanned, fixed, skippedNoTimeout };
}

export = {
  syncMutedMirrorRoleFromMemberUpdate,
  syncMutedMirrorOnMemberJoin,
  handleMuteMirrorOnMemberLeave,
  applyActiveMuteMirror,
  captureMuteRoleSnapshot,
  reconcileIncompleteActiveMuteMirrors,
  hasPendingMuteMirrorSnapshot,
  shouldDeferRoleRestoreForMuteMirror,
  restoreRolesAfterCommunicationTimeoutEnd,
  resyncProfileDerivedRolesForMember,
  registerMuteMirrorRestoreRoleSuppress,
  wasRoleRestoredByMuteMirror,
  sweepExpiredCommunicationTimeoutMirrors,
  isCommunicationTimeoutActive,
  memberIsInMuteMirrorState,
  shouldSuppressStaffDepexForMuteMirror,
  markMuteMirrorStaffProtect,
};