const { ActivityUserProfile, ACTIVITY_MAIN_GUILD_ID } = require("../../Schemas/Community/communitySchemas");
const { resolveHogwartsCleanupExcludeUserIds } = require("./hogwartsLeaveRetention");
const { automodBadUser } = require("../../Utils/Community/activityUserProfilePaths");
const { resolveGuildMemberIds } = require("../../Utils/Discord/threadRoleMembers");
const guildScoped = [ [ActivityUserProfile, "ActivityUserProfile"] ];
const SYSTEM_PROFILE_USERID_REGEX = /^__.*__$/;
const LEAVE_CLEANUP_MIN_INTERVAL_MS = 5 * 60 * 1000;
const leaveCleanupRunningGuildIds = new Set();
const leaveCleanupLastStartedAt = new Map();

async function fetchCompleteGuildMemberIds(guild) {
  return resolveGuildMemberIds(guild, "[CLEANUP USERS NOT IN SERVER]");
}

async function clearGlobalAutomodBadUserForUsersNotIn(memberIds, dryRun) {
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

/**
 * Elimina (o conta in dryRun) i documenti di utenti non presenti in memberIds per la guild indicata.
 * @param {string} guildId - ID della guild (server principale)
 * @param {string[]} memberIds - array di user ID attualmente nel server
 * @param {{ dryRun?: boolean, includeUserScoped?: boolean }} options - dryRun: true solo conta, false esegue deleteMany
 * @returns {{ total: number, details: Array<{ name: string, count: number }> }}
 */
async function unsetStaffForUsersNotInGuild(guildId, memberIds, dryRun) {
  const filter = {
    guildId: String(guildId),
    userId: { $nin: memberIds },
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

async function runCleanupUsersNotInServer(guildId, memberIds, { dryRun = false, includeUserScoped = true, client = null } = {}) {
  let total = 0;
  const details = [];
  const keepUserIds = await resolveHogwartsCleanupExcludeUserIds(client, guildId);
  const excludeUserIds = [...new Set([...(Array.isArray(memberIds) ? memberIds : []).map((id) => String(id).trim()).filter(Boolean), ...keepUserIds])];

  for (const [Model, name] of guildScoped) {
    if (!Model?.countDocuments) continue;
    const filterGuild = {
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
        {
          $or: [
            { "profile.events.hogwarts.retainUntil": { $exists: false } },
            { "profile.events.hogwarts.retainUntil": { $lte: new Date() } },
          ],
        },
      ];
    }
    
    const n = dryRun
      ? await Model.countDocuments(filterGuild).catch(() => 0)
      : (await Model.deleteMany(filterGuild).catch(() => ({ deletedCount: 0 })))?.deletedCount ?? 0;
    if (n > 0) {
      total += n;
      details.push({ name, count: n });
    }
  }
  const staffUnset = await unsetStaffForUsersNotInGuild(guildId, memberIds, dryRun);
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

async function runCleanupUserScopedNotInAnyServer(memberIds, { dryRun = false } = {}) {
  const keep = Array.from(new Set((Array.isArray(memberIds) ? memberIds : []).map((id) => String(id).trim()).filter(Boolean)));
  const n = await clearGlobalAutomodBadUserForUsersNotIn(keep, dryRun);
  const total = n;
  const details = n > 0 ? [{ name: `ActivityUserProfile.${automodBadUser()}(flag ripuliti)`, count: n }] : [];
  return { total, details };
}

/**
 * Stessa logica del cleanup post-ready: tutte le guild del client, fetch membri, poi user-scoped globale.
 */
async function runFullCleanupUsersNotInServer(client) {
  const guilds = Array.from(client.guilds?.cache?.values() ?? []);
  if (!guilds.length) return;
  const allMemberIds = new Set();
  for (const guild of guilds) {
    const guildId = guild?.id;
    if (!guildId) continue;
    const memberIds = await fetchCompleteGuildMemberIds(guild);
    if (!memberIds) {
      global.logger?.info?.("[CLEANUP USERS NOT IN SERVER] Guild cleanup skipped: member list unavailable.", guildId);
      continue;
    }
    for (const memberId of memberIds) allMemberIds.add(memberId);
    await runCleanupUsersNotInServer(guildId, memberIds, { dryRun: false, includeUserScoped: false, client });
  }
  await runCleanupUserScopedNotInAnyServer(Array.from(allMemberIds), { dryRun: false });
}

/**
 * Dopo guildMemberRemove: cache membri già senza chi chiude; ripulitura guild + user-scoped su tutti i server dello shard.
 */
async function runCleanupAfterMemberLeave(client, guild) {
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
    await runCleanupUsersNotInServer(guildId, memberIds, { dryRun: false, includeUserScoped: false, client });
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

module.exports = {
  runCleanupUsersNotInServer,
  runCleanupUserScopedNotInAnyServer,
  runFullCleanupUsersNotInServer,
  runCleanupAfterMemberLeave,
};