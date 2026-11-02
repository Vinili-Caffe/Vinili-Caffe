const { ActivityUserProfile, UserLeaveBackup } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { addRolesAndGetMember, getClientGuildCached, getGuildMemberCached, getGuildRoleCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../../Utils/DB/validateWriteIds");
const { deleteStaffPauseRequestChannelMessages, deleteStaffRelatedMessagesFromConfiguredChannels, archiveStaffRolesHistoryThenUnsetStaff } = require("../../Utils/Staff/staffDocUtils") as typeof import("../../Utils/Staff/staffDocUtils");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { isCommunicationTimeoutActive, hasPendingMuteMirrorSnapshot, shouldDeferRoleRestoreForMuteMirror } = require("../Moderation/mutedMirrorRoleService") as typeof import("../Moderation/mutedMirrorRoleService");
const { filterRoleIdsEligibleForRejoinRestore, sanitizeConditionalRolesAfterRejoin, resetBoostSlotsIfNotBoosting } = require("../../Utils/Community/rejoinConditionalRoleEligibility") as typeof import("../../Utils/Community/rejoinConditionalRoleEligibility");
const { applyTenureForMember } = require("./communityOpsService") as typeof import("./communityOpsService");
const TENURE_RESTORE_EXCLUDED_ROLE_IDS = new Set(
  [IDs.roles?.NuovoUtente, IDs.roles?.Veterano, IDs.roles?.OG].filter(Boolean).map((id?) => String(id)),
);
const { REJOIN_EXCLUDED_PERSONALITY_ROLE_IDS } = require("../../Utils/Community/personalityRolePersistence") as typeof import("../../Utils/Community/personalityRolePersistence");
const MUTED_ROLE_ID = String(IDs.roles?.Muted || "").trim();
const RESTORE_ON_REJOIN_ROLE_IDS = ["1463248874725576879", "1463248847768785038", "1443252279477272647"];
const DEFAULT_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const NO_AUTO_RESTORE_STAFF_PM_ROLE_IDS = new Set([IDs.roles?.PartnerManager, IDs.roles?.Staff, IDs.roles?.Helper, IDs.roles?.Mod, IDs.roles?.SeniorModerator, IDs.roles?.HighStaff, IDs.roles?.Director, IDs.roles?.Admin, IDs.roles?.Founder].filter(Boolean).map((id?) => String(id)));

function filterRestoreRoleIdsExcludingStaffPm(roleIds?) {
  return Array.from(new Set((Array.isArray(roleIds) ? roleIds : []).map((id?) => String(id || "").trim()).filter((id?) => id && !NO_AUTO_RESTORE_STAFF_PM_ROLE_IDS.has(id))));
}
function filterRolesExcludedFromRejoinRestore(roleIds?) {
  const withoutStaffPm = filterRestoreRoleIdsExcludingStaffPm(roleIds);
  const withoutMuted = MUTED_ROLE_ID ? withoutStaffPm.filter((id?) => id !== MUTED_ROLE_ID) : withoutStaffPm;
  return withoutMuted.filter(
    (id?) => !REJOIN_EXCLUDED_PERSONALITY_ROLE_IDS.has(id) && !TENURE_RESTORE_EXCLUDED_ROLE_IDS.has(id),
  );
}

async function reconcileTenureRolesAfterRejoin(member?) {
  if (!member?.guild?.id || member.user?.bot) return;
  if (String(member.guild.id) !== String(IDs.guilds?.main || "")) return;
  if (await shouldDeferRoleRestoreForMuteMirror(member).catch(() => false)) return;
  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  if (mutedRoleId && member.roles?.cache?.has?.(mutedRoleId)) return;
  const record = await ActivityUserProfile.findOne({ guildId: member.guild.id, userId: member.id }).catch(() => null);
  if (!record) return;
  await applyTenureForMember(member, record).catch((err?) => {
    global.logger?.warn?.("[USER LEAVE BACKUP] tenure reconcile after rejoin:", member.guild.id, member.id, err?.message || err);
  });
}

function isStaffGraceActive(staffPendingPurgeAt?) {
  if (!staffPendingPurgeAt) return false;
  const ms = new Date(staffPendingPurgeAt).getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

function resolveRestoreRoleIdsForRejoin(roleIds?, staffGraceActive?) {
  const unique = Array.from(
    new Set(
      (Array.isArray(roleIds) ? roleIds : [])
        .map((id?) => String(id || "").trim())
        .filter(Boolean),
    ),
  );
  if (staffGraceActive) {
    const pmId = String(IDs.roles?.PartnerManager || "").trim();
    return filterRolesExcludedFromRejoinRestore(unique.filter((id?) => id !== pmId));
  }
  return filterRolesExcludedFromRejoinRestore(unique);
}

function resolveRetentionDays() {
  const raw = Number(process.env.USER_LEAVE_BACKUP_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_RETENTION_DAYS;
  return Math.max(1, Math.floor(raw));
}

function resolveExpiryDate() {
  return new Date(Date.now() + resolveRetentionDays() * DAY_MS);
}

function getTrackedRolesFromMember(member?) {
  if (!member?.roles?.cache) return [];
  return RESTORE_ON_REJOIN_ROLE_IDS.filter((roleId?) =>
    member.roles.cache.has(String(roleId)),
  );
}

function getRestorableRoleIdsFromMember(member?) {
  const cache = member?.roles?.cache;
  const guildId = String(member?.guild?.id || "");
  if (!cache || !guildId) return [];
  return filterRolesExcludedFromRejoinRestore(
    Array.from(cache.values())
      .filter((role?: any) => {
        if (!role?.id) return false;
        if (String(role.id) === guildId) return false;
        if (role.managed) return false;
        return true;
      })
      .map((role?: any) => String(role.id))
      .filter(Boolean),
  );
}

async function backupUserOnLeave(guildId?, userId?, member = null) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid)) return false;

  const source = await ActivityUserProfile.findOne({ guildId: gid, userId: uid }).lean().catch(() => null);
  const deferRolesForMute =
    member &&
    (isCommunicationTimeoutActive(member) ||
      (await hasPendingMuteMirrorSnapshot(gid, uid).catch(() => false)));
  const restoreRoleIds = deferRolesForMute ? [] : getRestorableRoleIdsFromMember(member);
  const trackedRoleIds = getTrackedRolesFromMember(member);

  // Snapshot Discord completo prima che il membro sparisca dalla cache.
  try {
    const { persistUserFullState } = require("./userFullStatePersistenceService") as typeof import("./userFullStatePersistenceService");
    if (member?.guild) {
      await persistUserFullState(gid, uid, {
        member,
        guild: member.guild,
        reason: "leave_backup",
      }).catch(() => null);
    }
  } catch {
    /* ignore */
  }

  // organicoLeaveRetain2: re-read after discordState persist so career retention from leave depex is included.
  const fresh = await ActivityUserProfile.findOne({ guildId: gid, userId: uid }).lean().catch(() => null);
  const profileSource = fresh || source;
  const discordState =
    fresh?.profile?.discordState || source?.profile?.discordState || null;

  const shouldUpsertBackup =
    Boolean(profileSource) || restoreRoleIds.length > 0 || trackedRoleIds.length > 0 || Boolean(discordState);

  if (!shouldUpsertBackup) {
    await UserLeaveBackup.updateOne(
      { guildId: gid, userId: uid },
      { $set: { rejoinTrackedRoleIds: [] } },
    ).catch(() => null);
    return false;
  }

  const backupDoc = profileSource
    ? {
        ...profileSource,
        profile: {
          ...(profileSource.profile || {}),
          discordState: discordState || profileSource.profile?.discordState || null,
        },
      }
    : discordState
      ? { guildId: gid, userId: uid, profile: { discordState } }
      : null;

  await UserLeaveBackup.updateOne(
    { guildId: gid, userId: uid },
    {
      $set: {
        guildId: gid,
        userId: uid,
        backupDoc,
        restoreRoleIds,
        rejoinTrackedRoleIds: trackedRoleIds,
        leftAt: new Date(),
        expiresAt: resolveExpiryDate(),
      },
    },
    { upsert: true },
  ).catch(() => null);
  return true;
}

async function restoreRolesOnJoin(member?, roleIds?) {
  if (!member || !Array.isArray(roleIds) || roleIds.length === 0) {
    return { ok: false, requested: 0, applied: 0, skipped: 0 };
  }
  const me = member.guild?.members?.me || null;
  if (!me?.permissions?.has?.("ManageRoles")) {
    return { ok: false, requested: roleIds.length, applied: 0, skipped: roleIds.length, reason: "no_manage_roles" };
  }
  const candidateRoleIds = Array.from(
    new Set(roleIds.map((id?) => String(id || "").trim()).filter(Boolean)),
  );
  if (!candidateRoleIds.length) return { ok: false, requested: 0, applied: 0, skipped: 0 };

  const addableRoleIds = [];
  let skipped = 0;
  for (const roleId of candidateRoleIds) {
    if (member.roles.cache.has(roleId)) continue;
    const role = await getGuildRoleCached(member.guild, roleId);
    if (!role) {
      skipped += 1;
      continue;
    }
    if (role.position >= me.roles.highest.position) {
      skipped += 1;
      continue;
    }
    addableRoleIds.push(role.id);
  }
  if (!addableRoleIds.length) {
    return { ok: false, requested: candidateRoleIds.length, applied: 0, skipped, reason: "none_addable" };
  }

  const refreshed = await addRolesAndGetMember(member.guild, member.id, addableRoleIds).catch(() => null);
  if (!refreshed?.roles?.cache) {
    return { ok: false, requested: candidateRoleIds.length, applied: 0, skipped, reason: "member_fetch_failed" };
  }
  const applied = addableRoleIds.filter((roleId?) => refreshed.roles.cache.has(roleId)).length;
  const fullyApplied = applied === addableRoleIds.length;
  const alreadyHad = candidateRoleIds.filter((roleId?) => member.roles.cache.has(roleId)).length;
  return {
    ok: fullyApplied,
    requested: candidateRoleIds.length,
    applied,
    skipped,
    alreadyHad,
  };
}

function schedulePendingRoleRestoreRetry(guildId?, userId?, client?) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!client || !isValidGuildUserId(gid, uid)) return;
  const delays = [2500, 12000];
  for (const delayMs of delays) {
    const timer = setTimeout(() => {
      retryRestoreRolesFromBackup(gid, uid, client).catch((err?) => {
        global.logger?.warn?.("[USER LEAVE BACKUP] role restore retry:", gid, uid, err?.message || err);
      });
    }, delayMs);
    if (typeof timer.unref === "function") timer.unref();
  }
}

async function retryRestoreRolesFromBackup(guildId?, userId?, client?) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid)) return false;
  const backup = await UserLeaveBackup.findOne({ guildId: gid, userId: uid }).lean().catch(() => null);
  if (!backup?._id) return false;
  const guild = await getClientGuildCached(client, gid).catch(() => null);
  if (!guild) return false;
  const member = await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
  if (!member) return false;

  const roleIdsFromMemory = Array.isArray(backup.rejoinTrackedRoleIds) ? backup.rejoinTrackedRoleIds : [];
  const roleIdsFallback = Array.isArray(backup.restoreRoleIds) ? backup.restoreRoleIds : [];
  const current = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("staffPendingPurgeAt")
    .lean()
    .catch(() => null);
  const staffGraceActive = isStaffGraceActive(current?.staffPendingPurgeAt || backup?.backupDoc?.staffPendingPurgeAt);
  if (await shouldDeferRoleRestoreForMuteMirror(member).catch(() => isCommunicationTimeoutActive(member))) return false;
  const restoreRoleIds = resolveRestoreRoleIdsForRejoin(
    [...roleIdsFromMemory, ...roleIdsFallback],
    staffGraceActive,
  );
  if (!restoreRoleIds.length) return false;

  await resetBoostSlotsIfNotBoosting(member).catch(() => null);
  const eligibleRoleIds = await filterRoleIdsEligibleForRejoinRestore(member, restoreRoleIds);
  if (!eligibleRoleIds.length) return false;

  const outcome = await restoreRolesOnJoin(member, eligibleRoleIds).catch(() => null);
  if (!outcome?.ok) return false;
  await sanitizeConditionalRolesAfterRejoin(member).catch(() => null);
  await reconcileTenureRolesAfterRejoin(member);
  await UserLeaveBackup.deleteOne({ _id: backup._id }).catch(() => null);
  return true;
}

async function restoreUserOnJoin(guildId?, userId?, member = null) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid)) return false;

  const backup = await UserLeaveBackup.findOne({ guildId: gid, userId: uid }).lean().catch(() => null);
  const roleIdsFromMemory = Array.isArray(backup?.rejoinTrackedRoleIds) ? backup.rejoinTrackedRoleIds : [];
  const roleIdsFallback = Array.isArray(backup?.restoreRoleIds) ? backup.restoreRoleIds : [];
  const currentBeforeRestore = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("staffPendingPurgeAt")
    .lean()
    .catch(() => null);
  const staffGraceActive = isStaffGraceActive(
    currentBeforeRestore?.staffPendingPurgeAt || backup?.backupDoc?.staffPendingPurgeAt,
  );
  const skipRoleRestore = Boolean(
    member && (await shouldDeferRoleRestoreForMuteMirror(member).catch(() => false)),
  );
  const restoreRoleIds = skipRoleRestore
    ? []
    : resolveRestoreRoleIdsForRejoin(
        [...roleIdsFromMemory, ...roleIdsFallback].map((id?) => String(id || "").trim()).filter(Boolean),
        staffGraceActive,
      );
  let payload = backup?.backupDoc || null;
  if (backup?.expiresAt && new Date(backup.expiresAt).getTime() <= Date.now()) {
    await UserLeaveBackup.deleteOne({ guildId: gid, userId: uid }).catch(() => null);
    payload = null;
  }
  if ((!payload || typeof payload !== "object") && restoreRoleIds.length === 0) return false;

  let restoredProfile = false;
  if (payload && typeof payload === "object") {
    const current = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
      .select("profile moderation staff staffPendingPurgeAt")
      .lean()
      .catch(() => null);
    const nextProfile =
      payload?.profile && typeof payload.profile === "object"
        ? { ...payload.profile }
        : current?.profile && typeof current.profile === "object"
          ? { ...current.profile }
          : null;
    if (nextProfile) {
                  delete nextProfile.joinAnnounceSentAt;
      delete nextProfile.joinAnnouncePending;
      if (member && !member.premiumSinceTimestamp) {
        delete nextProfile.serverBoostAnnouncedSlotCount;
      }
    }
    const nextModeration =
      payload?.moderation && typeof payload.moderation === "object"
        ? payload.moderation
        : current?.moderation && typeof current.moderation === "object"
          ? current.moderation
          : null;
    const staffFromCurrent = current?.staff && typeof current.staff === "object" ? current.staff : null;
    const staffFromPayload = payload?.staff && typeof payload.staff === "object" ? payload.staff : null;
    const nextStaff = staffFromCurrent || staffFromPayload;

    const setPayload = {
      ...(nextProfile ? { profile: nextProfile } : {}),
      ...(nextModeration ? { moderation: nextModeration } : {}),
      ...(nextStaff ? { staff: nextStaff } : {}),
      updatedAt: new Date(),
    };
    const setOnInsert = {
      guildId: gid,
      userId: uid,
      ...(payload?.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
    };
    await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      { $setOnInsert: setOnInsert, $set: setPayload, $unset: { staffPendingPurgeAt: "" } },
      { upsert: true },
    ).catch(() => null);
    restoredProfile = true;
  }

  if (member) {
    await resetBoostSlotsIfNotBoosting(member).catch(() => null);
  }

  let filteredRestoreRoleIds = restoreRoleIds;
  if (member && filteredRestoreRoleIds.length > 0) {
    filteredRestoreRoleIds = await filterRoleIdsEligibleForRejoinRestore(member, filteredRestoreRoleIds);
  }

  let restoredRoles = false;
  let roleOutcome = null;
  if (member && filteredRestoreRoleIds.length > 0) {
    roleOutcome = await restoreRolesOnJoin(member, filteredRestoreRoleIds).catch(() => null);
    restoredRoles = Boolean(roleOutcome?.ok);
  }
  if (member) {
    await sanitizeConditionalRolesAfterRejoin(member).catch(() => null);
    if (!skipRoleRestore) {
      await reconcileTenureRolesAfterRejoin(member);
    }
  }

  const hasPendingRoleRestore = filteredRestoreRoleIds.length > 0 && !restoredRoles;
  if (hasPendingRoleRestore && member?.client) {
    schedulePendingRoleRestoreRetry(gid, uid, member.client);
  }
    if (backup?._id && !hasPendingRoleRestore && !skipRoleRestore) {
    await UserLeaveBackup.deleteOne({ _id: backup._id }).catch(() => null);
  }
  return restoredProfile || restoredRoles;
}

async function purgeDueStaffGraceProfiles(client = null) {
  const now = new Date();
  const rows = await ActivityUserProfile.find({ staffPendingPurgeAt: { $lte: now } })
    .select("guildId userId")
    .limit(100)
    .lean()
    .catch(() => []);
  for (const row of rows || []) {
    const gid = String(row?.guildId || "").trim();
    const uid = String(row?.userId || "").trim();
    if (!isValidGuildUserId(gid, uid)) continue;
    const guild = client ? await getClientGuildCached(client, gid).catch(() => null) : null;
    if (guild) {
      await deleteStaffPauseRequestChannelMessages(guild, uid).catch((err?) => {
        global.logger?.warn?.("[STAFF GRACE PURGE] pause cleanup:", uid, err?.message || err);
      });
      await deleteStaffRelatedMessagesFromConfiguredChannels(guild, uid).catch((err?) => {
        global.logger?.warn?.("[STAFF GRACE PURGE] staff channel cleanup:", uid, err?.message || err);
      });
      try {
        const { cancelPendingResocontiWorkflowForUser } = require("../../site/workflow/siteStaffWorkflowStore") as typeof import("../../site/workflow/siteStaffWorkflowStore");
        await cancelPendingResocontiWorkflowForUser(gid, uid, {
          statusLabel: "Annullato (depex)",
          decidedBy: "system",
        });
      } catch (err) {
        global.logger?.warn?.("[STAFF GRACE PURGE] cancel pending resoconti:", uid, err?.message || err);
      }
    }
    await archiveStaffRolesHistoryThenUnsetStaff(gid, uid);
    await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      { $unset: { staffPendingPurgeAt: "" } },
    ).catch(() => null);
  }
}

function startStaffGracePurgeLoop(client?) {
  if (!client || client._staffGracePurgeInterval) return;
  const tick = () => purgeDueStaffGraceProfiles(client).catch(() => null);
  tick();
  const timer = setInterval(tick, 60 * 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
  client._staffGracePurgeInterval = timer;
}

async function clearStaffPendingPurgeAt(guildId?, userId?) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid)) return;
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    { $unset: { staffPendingPurgeAt: "" } },
  ).catch(() => null);
}

async function resolveNextLeaveBackupExpiryClock(guildId?, userId?) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!isValidGuildUserId(gid, uid)) return resolveExpiryDate();
  const b = await UserLeaveBackup.findOne({ guildId: gid, userId: uid }).select("expiresAt").lean().catch(() => null);
  if (b?.expiresAt) return new Date(b.expiresAt);
  return resolveExpiryDate();
}

export = { backupUserOnLeave, restoreUserOnJoin, startStaffGracePurgeLoop, clearStaffPendingPurgeAt, resolveNextLeaveBackupExpiryClock };