const { ActivityUserProfile, ACTIVITY_MAIN_GUILD_ID } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { automodBadUser } = require("../../Utils/Community/activityUserProfilePaths") as typeof import("../../Utils/Community/activityUserProfilePaths");
const { resolveGuildMemberIds } = require("../../Utils/Discord/threadRoleMembers") as typeof import("../../Utils/Discord/threadRoleMembers");
const guildScoped = [ [ActivityUserProfile, "ActivityUserProfile"] ];
const SYSTEM_PROFILE_USERID_REGEX = /^__.*__$/;
const LEAVE_CLEANUP_MIN_INTERVAL_MS = 5 * 60 * 1000;
const leaveCleanupRunningGuildIds = new Set();
const leaveCleanupLastStartedAt = new Map();

async function fetchCompleteGuildMemberIds(guild?) {
  return resolveGuildMemberIds(guild, "[CLEANUP USERS NOT IN SERVER]");
}

async function clearGlobalAutomodBadUserForUsersNotIn(memberIds?, dryRun?) {
  const filter = {
    guildId: ACTIVITY_MAIN_GUILD_ID,
    userId: { $nin: memberIds },
    $expr: {
      $not: {
        $regexMatch: {
          input: "$userId",
          regex: SYSTEM_PROFILE_USERID_REGEX.source,
        },
      },
    },
    [automodBadUser()]: { $exists: true },
    $and: [
      { "moderation.modCases": { $exists: true, $size: 0 } },
      { "moderation.automodBadUser.totalTriggers": { $lte: 0 } },
      { "profile.privacy.avatar.views": { $not: { $gt: 0 } } },
      { "profile.privacy.banner.views": { $not: { $gt: 0 } } },
    ],
  };
  if (dryRun) {
    const n = await ActivityUserProfile.countDocuments(filter).catch(() => 0);
    return n;
  }
  const res = await ActivityUserProfile.updateMany(filter, {
    $unset: { [automodBadUser()]: "" },
  }).catch(() => ({ modifiedCount: 0 }));
  return res?.modifiedCount ?? 0;
}

async function unsetStaffForUsersNotInGuild(guildId?, memberIds?, dryRun?, memberCountHint = 0) {
  const keep = [...new Set((Array.isArray(memberIds) ? memberIds : []).map((id?) => String(id || "").trim()).filter(Boolean))];
    if (!dryRun) {
    const reported = Math.max(0, Number(memberCountHint || 0));
    const completeEnough =
      reported > 0
        ? keep.length >= Math.max(1, Math.floor(reported * 0.9))
        : keep.length >= 500;
    if (!completeEnough) {
      global.logger?.warn?.(
        "[CLEANUP USERS NOT IN SERVER] unset staff saltato: memberIds incompleti (",
        keep.length,
        "/",
        reported || "?",
        ") — skip pericoloso.",
      );
      return 0;
    }
  }
  const filter = {
    guildId: String(guildId),
    userId: { $nin: keep },
    $expr: {
      $not: {
        $regexMatch: {
          input: "$userId",
          regex: SYSTEM_PROFILE_USERID_REGEX.source,
        },
      },
    },
    staff: { $exists: true },
  };
  if (dryRun) {
    const n = await ActivityUserProfile.countDocuments(filter).catch(() => 0);
    return n;
  }
  const res = await ActivityUserProfile.updateMany(filter, { $unset: { staff: "" } }).catch(() => ({ modifiedCount: 0 }));
  return res?.modifiedCount ?? 0;
}

async function runCleanupUsersNotInServer(guildId?, memberIds?, { dryRun = false, includeUserScoped = true, client = null, memberCount = 0 } = {}) {
  let total = 0;
  const details = [];
  const excludeUserIds = [...new Set((Array.isArray(memberIds) ? memberIds : []).map((id?) => String(id).trim()).filter(Boolean))];

  for (const [Model, name] of guildScoped) {
    if (!(Model as any)?.countDocuments) continue;
    const filterGuild: Record<string, any> = {
      guildId: String(guildId),
      userId: { $nin: excludeUserIds },
      $expr: {
        $not: {
          $regexMatch: {
            input: "$userId",
            regex: SYSTEM_PROFILE_USERID_REGEX.source,
          },
        },
      },
    };
    
    if (name === "ActivityUserProfile") {
      filterGuild.$and = [
        { "moderation.modCases": { $exists: true, $size: 0 } },
        { "moderation.automodBadUser.totalTriggers": { $lte: 0 } },
        { "profile.privacy.avatar.views": { $not: { $gt: 0 } } },
        { "profile.privacy.banner.views": { $not: { $gt: 0 } } },
      ];
    }
    
    const n = dryRun
      ? await (Model as any).countDocuments(filterGuild).catch(() => 0)
      : (await (Model as any).deleteMany(filterGuild).catch(() => ({ deletedCount: 0 })))?.deletedCount ?? 0;
    if (n > 0) {
      total += n;
      details.push({ name, count: n });
    }
  }
  const staffUnset = await unsetStaffForUsersNotInGuild(guildId, memberIds, dryRun, memberCount);
  if (staffUnset > 0) {
    total += staffUnset;
    details.push({ name: "ActivityUserProfile.staff", count: staffUnset });
  }
  if (includeUserScoped) {
    const n = await clearGlobalAutomodBadUserForUsersNotIn(memberIds, dryRun);
    if (n > 0) {
      total += n;
      details.push({ name: `ActivityUserProfile.${automodBadUser()}(${ACTIVITY_MAIN_GUILD_ID})`, count: n });
    }
  }
  return { total, details };
}

async function runCleanupUserScopedNotInAnyServer(memberIds?, { dryRun = false } = {}) {
  const keep = Array.from(new Set((Array.isArray(memberIds) ? memberIds : []).map((id?) => String(id).trim()).filter(Boolean)));
  const n = await clearGlobalAutomodBadUserForUsersNotIn(keep, dryRun);
  const total = n;
  const details = n > 0 ? [{ name: `ActivityUserProfile.${automodBadUser()}(flag ripuliti)`, count: n }] : [];
  return { total, details };
}

async function runFullCleanupUsersNotInServer(client?) {
  const guilds = Array.from(client.guilds?.cache?.values() ?? []);
  if (!guilds.length) return;
  const allMemberIds = new Set();
  for (const guild of guilds) {
    const guildId = (guild as any)?.id;
    if (!guildId) continue;
    const memberIds = await fetchCompleteGuildMemberIds(guild);
    if (!memberIds) {
      global.logger?.info?.("[CLEANUP USERS NOT IN SERVER] Guild cleanup skipped: member list unavailable.", guildId);
      continue;
    }
    for (const memberId of memberIds) allMemberIds.add(memberId);
    await runCleanupUsersNotInServer(guildId, memberIds, {
      dryRun: false,
      includeUserScoped: false,
      client,
      memberCount: (guild as any).memberCount,
    });
  }
  await runCleanupUserScopedNotInAnyServer(Array.from(allMemberIds), { dryRun: false });
}

async function runCleanupAfterMemberLeave(client?, guild?) {
  if (!client?.guilds || !guild?.id) return;
  const guildId = String(guild.id);
  const now = Date.now();
  const lastStartedAt = Number(leaveCleanupLastStartedAt.get(guildId) || 0);
  if (leaveCleanupRunningGuildIds.has(guildId) || now - lastStartedAt < LEAVE_CLEANUP_MIN_INTERVAL_MS) return;
  leaveCleanupRunningGuildIds.add(guildId);
  leaveCleanupLastStartedAt.set(guildId, now);
  try {
    const memberIds = await fetchCompleteGuildMemberIds(guild);
    if (!memberIds) {
      global.logger?.info?.("[CLEANUP USERS NOT IN SERVER] Leave cleanup skipped: member list unavailable.", guildId);
      return;
    }
    await runCleanupUsersNotInServer(guildId, memberIds, {
      dryRun: false,
      includeUserScoped: false,
      client,
      memberCount: guild.memberCount,
    });
    const allIds = [];
    for (const g of client.guilds.cache.values()) {
      const ids = String(g?.id || "") === guildId ? memberIds : await fetchCompleteGuildMemberIds(g);
      if (!ids) {
        global.logger?.info?.("[CLEANUP USERS NOT IN SERVER] Global leave cleanup skipped: member list unavailable.", g?.id);
        return;
      }
      allIds.push(...ids);
    }
    await runCleanupUserScopedNotInAnyServer(allIds, { dryRun: false });
  } finally {
    leaveCleanupRunningGuildIds.delete(guildId);
  }
}

export = {
  runCleanupUsersNotInServer,
  runCleanupUserScopedNotInAnyServer,
  runFullCleanupUsersNotInServer,
  runCleanupAfterMemberLeave,
};