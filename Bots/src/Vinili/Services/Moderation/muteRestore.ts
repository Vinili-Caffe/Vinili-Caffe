/** Mute: ripristino dei ruoli alla fine del timeout. */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getGuildMemberCached, isUnknownDiscordMemberError } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { getUserExpStats, syncLevelRolesForMember } = require("../Community/expService") as typeof import("../Community/expService");
const { registerMuteMirrorRestoreRoleSuppress } = require("../../Utils/Moderation/muteRestoreAnnounceSuppress") as typeof import("../../Utils/Moderation/muteRestoreAnnounceSuppress");
const { setMemberRolesSafe, resolveGuildBotMember } = require("./muteRoleRest") as typeof import("./muteRoleRest");
const { isPostUnmuteReconciliationCurrent, profileResyncMadeChanges, markPostUnmuteReconciliationComplete, markRecentUnmuteProfileRecovery, clearMuteMirrorStaffProtect, loadSnapshot, memberLooksRoleWiped, isCommunicationTimeoutActive } = require("./muteStaffProtect") as typeof import("./muteStaffProtect");
const { upsertSnapshot, recoverSnapshotRoleIdsFallback, clearSnapshot, buildRestoreTargetRoleIds, filterRestorableRoleIds, resolveMutedRoleContext } = require("./muteSnapshot") as typeof import("./muteSnapshot");
const { resyncProfileDerivedRolesForMember } = require("./muteProfileRoles") as typeof import("./muteProfileRoles");

async function restoreRolesAfterCommunicationTimeoutEnd(member?, options: Record<string, any> = {}) {
  if (!member?.guild || member.user?.bot) return { ok: false, reason: "invalid_member" };
  if (isCommunicationTimeoutActive(member)) return { ok: false, reason: "timeout_active" };

  const mutedRoleId = String(options.mutedRoleId || IDs.roles?.Muted || "").trim();
  const guild = member.guild;
  const me = await resolveGuildBotMember(guild, options);
  const ctx = await resolveMutedRoleContext(guild, me, mutedRoleId, options.mutedRole);
  if (!ctx) return { ok: false, reason: "muted_role_unusable" };

  const reasonOut = String(options.reason || "Fine timeout / +unmute");
  const hasMuted = member.roles.cache.has(ctx.mutedRoleId);
  let saved = await loadSnapshot(guild.id, member.id);
  const wasUnmuteFlow = Boolean(options.wasUnmuteFlow);
  const wiped = memberLooksRoleWiped(member, ctx.mutedRoleId);

  if ((!saved || saved.length === 0) && (wasUnmuteFlow || hasMuted || wiped)) {
    const fallback = await recoverSnapshotRoleIdsFallback(guild.id, member.id, ctx.mutedRoleId);
    if (fallback.length > 0) {
      saved = fallback;
      await upsertSnapshot(guild.id, member.id, fallback).catch(() => null);
      global.logger?.warn?.(
        "[mutedMirrorRole] snapshot vuoto: fallback discordState/personality",
        guild.id,
        member.id,
        fallback.length,
      );
    }
  }

  if (!hasMuted && saved.length === 0 && !wasUnmuteFlow && !wiped) {
    return { ok: true, restored: false, reason: "noop" };
  }

  let profileDoc = options.profileDoc || null;
  if (wasUnmuteFlow && !hasMuted) {
    if (!profileDoc) {
      profileDoc = await ActivityUserProfile.findOne({ guildId: guild.id, userId: member.id })
        .select("moderation.modCases moderation.postUnmuteRolesReconciledAt")
        .lean()
        .catch(() => null);
    }
    if (isPostUnmuteReconciliationCurrent(profileDoc, guild.id, member.id)) {
      const memberRoleId = String(IDs.roles?.Member || "").trim();
      const missingCoreMember = Boolean(memberRoleId && !member.roles.cache.has(memberRoleId));
      if (!missingCoreMember && !wiped && saved.length === 0) {
        markRecentUnmuteProfileRecovery(guild.id, member.id);
        return { ok: true, restored: false, restoreOk: true, reason: "already_reconciled" };
      }
      if (!missingCoreMember && !wiped && saved.length > 0) {
        markRecentUnmuteProfileRecovery(guild.id, member.id);
        await clearSnapshot(guild.id, member.id);
        return { ok: true, restored: false, restoreOk: true, reason: "already_reconciled" };
      }
      global.logger?.warn?.(
        "[mutedMirrorRole] already_reconciled ma ruoli incompleti: riprovo restore",
        guild.id,
        member.id,
        `wiped=${wiped} saved=${saved.length}`,
      );
    }
  }

  const allowed = await filterRestorableRoleIds(guild, me, saved, ctx.mutedRoleId);
  let restored = false;
  let restoreOk = false;

  if (allowed.length > 0) {
    registerMuteMirrorRestoreRoleSuppress(guild.id, member.id, allowed);
  }

  try {
    if (saved.length > 0) {
      const targetIds = buildRestoreTargetRoleIds(member, me, allowed, ctx.mutedRoleId);
      await setMemberRolesSafe(member, targetIds, reasonOut);
      restored = true;
      restoreOk = true;
      if (allowed.length < saved.length) {
        global.logger?.warn?.(
          "[mutedMirrorRole] restore parziale:",
          guild.id,
          member.id,
          `${allowed.length}/${saved.length} ruoli`,
        );
      }
    } else if (hasMuted) {
      await member.roles.remove(ctx.mutedRoleId, reasonOut);
      restored = true;
      // Non marcare restoreOk se i ruoli sono ancora wipeati: tiene aperto il retry.
      restoreOk = !memberLooksRoleWiped(member, ctx.mutedRoleId);
    }
  } catch (err) {
    if (isUnknownDiscordMemberError(err)) {
      await clearSnapshot(guild.id, member.id);
      try {
        guild.members?.cache?.delete?.(member.id);
      } catch (_) {}
      return { ok: true, restored: false, restoreOk: true, reason: "unknown_member" };
    }
    global.logger?.warn?.("[mutedMirrorRole] restore failed:", guild.id, member.id, err?.message || err);
    if (hasMuted) {
      const removed = await member.roles.remove(ctx.mutedRoleId, reasonOut).then(() => true).catch((err2?) => {
        if (isUnknownDiscordMemberError(err2)) return true;
        global.logger?.warn?.("[mutedMirrorRole] remove after restore fail:", guild.id, member.id, err2?.message || err2);
        return false;
      });
      if (removed) {
        restored = true;
        restoreOk = saved.length === 0 && !memberLooksRoleWiped(member, ctx.mutedRoleId);
      }
    }
  }

  if (member.roles.cache.has(ctx.mutedRoleId)) {
    const removedStale = await member.roles.remove(ctx.mutedRoleId, reasonOut).then(() => true).catch((err?) => {
      if (isUnknownDiscordMemberError(err)) {
        clearSnapshot(guild.id, member.id).catch(() => {});
        try {
          guild.members?.cache?.delete?.(member.id);
        } catch (_) {}
        return true;
      }
      global.logger?.warn?.("[mutedMirrorRole] remove stale muted:", guild.id, member.id, err?.message || err);
      return false;
    });
    if (removedStale) {
      restored = true;
      if (!restoreOk && saved.length === 0) restoreOk = true;
    }
  }

  if (restoreOk) {
    await clearSnapshot(guild.id, member.id);
  } else if (saved.length > 0) {
    global.logger?.warn?.("[mutedMirrorRole] snapshot kept for retry:", guild.id, member.id, saved.length);
  }

    const muteWorkDone = Boolean(restored || restoreOk);

  let profileResync = null;
  const shouldProfileResync =
    options.runProfileResync !== false &&
    (muteWorkDone || saved.length > 0 || hasMuted || wasUnmuteFlow);
  if (shouldProfileResync) {
    const freshMember = (await getGuildMemberCached(guild, member.id, { preferFresh: true }).catch(() => null)) || member;
    profileResync = await resyncProfileDerivedRolesForMember(freshMember, options.client || guild.client, {
      reason: reasonOut,
      skipMutedRemove: true,
    }).catch((err?) => {
      global.logger?.warn?.("[mutedMirrorRole] profile resync failed:", guild.id, member.id, err?.message || err);
      return null;
    });
            if (profileResync?.ok) {
      try {
        const { getUserExpStats, syncLevelRolesForMember } = require("../Community/expService") as typeof import("../Community/expService");
        const stats = await getUserExpStats(guild.id, member.id).catch(() => null);
        if (stats?.level != null) {
          const again = await getGuildMemberCached(guild, member.id, { preferFresh: true }).catch(() => null);
          if (again) {
            const extra = await syncLevelRolesForMember(guild, member.id, stats.level).catch(() => []);
            if (Array.isArray(extra) && extra.length) {
              profileResync.levelRoles = [...new Set([...(profileResync.levelRoles || []), ...extra])];
            }
          }
        }
      } catch (err) {
        global.logger?.warn?.("[mutedMirrorRole] level roles retry failed:", guild.id, member.id, err?.message || err);
      }
    }
  }

  const pendingSnapshot = await loadSnapshot(guild.id, member.id);
  const stillMuted = member.roles.cache.has(ctx.mutedRoleId);
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  const hasCoreMember = !memberRoleId || member.roles.cache.has(memberRoleId);
  const stillWiped = memberLooksRoleWiped(member, ctx.mutedRoleId);
  if (
    wasUnmuteFlow &&
    !isCommunicationTimeoutActive(member) &&
    !stillMuted &&
    pendingSnapshot.length === 0 &&
    hasCoreMember &&
    !stillWiped
  ) {
    await markPostUnmuteReconciliationComplete(guild.id, member.id);
    clearMuteMirrorStaffProtect(guild.id, member.id);
  }

  return {
    ok: true,
    restored: muteWorkDone,
    restoreOk,
    profileResync,
    reason: muteWorkDone ? undefined : profileResyncMadeChanges(profileResync) ? "profile_only" : "noop",
  };
}

export = { restoreRolesAfterCommunicationTimeoutEnd };
