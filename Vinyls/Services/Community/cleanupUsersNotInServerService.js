const { ActivityUserProfile, ACTIVITY_MAIN_GUILD_ID } = require("../../Schemas/Community/communitySchemas");
const { resolveHogwartsCleanupExcludeUserIds } = require("./hogwartsLeaveRetention");
const { automodBadUser } = require("../../Utils/Community/activityUserProfilePaths");
const guildScoped = [ [ActivityUserProfile, "ActivityUserProfile"] ];
const SYSTEM_PROFILE_USERID_REGEX = /^__.*__$/;
const LEAVE_CLEANUP_MIN_INTERVAL_MS = 5 * 60 * 1000;
const MEMBER_FETCH_RETRY_MAX_MS = 60 * 1000;
const leaveCleanupRunningGuildIds = new Set();
const leaveCleanupLastStartedAt = new Map();

function wait(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, Math.max(1, Number(ms) || 1));
    timer.unref?.();
  });
}

function parseRateLimitRetryMs(err) {
  const direct = Number(err?.retryAfter ?? err?.retry_after ?? err?.data?.retry_after ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct > 1000 ? direct : direct * 1000;
  const msg = String(err?.message || "");
  const match = msg.match(/Retry after\s+([\d.]+)\s+seconds/i);
  if (!match) return 0;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

async function fetchCompleteGuildMemberIds(guild, options = {}) {
  if (!guild?.members?.fetch) return null;
  try {
    const fetched = await guild.members.fetch();
    const source = fetched?.values ? fetched.values() : guild.members?.cache?.values?.();
    const ids = Array.from(source ?? []).map((m) => m?.id).filter(Boolean).map(String);
    if (!ids.length) return null;
    return ids;
  } catch (err) {
    const retryMs = Math.min(MEMBER_FETCH_RETRY_MAX_MS, parseRateLimitRetryMs(err));
    if (options.retryRateLimit !== false && retryMs > 0) {
      await wait(retryMs + 1000);
      return fetchCompleteGuildMemberIds(guild, { retryRateLimit: false });
    }
    global.logger?.warn?.("[CLEANUP USERS NOT IN SERVER] member fetch failed, cleanup skipped:", guild?.id, err?.message || err);
    return null;
  }
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
      global.logger?.warn?.("[CLEANUP USERS NOT IN SERVER] Guild cleanup skipped: incomplete member list.", guildId);
      return;
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
      global.logger?.warn?.("[CLEANUP USERS NOT IN SERVER] Leave cleanup skipped: incomplete member list.", guildId);
      return;
    }
    await runCleanupUsersNotInServer(guildId, memberIds, { dryRun: false, includeUserScoped: false, client });
    const allIds = [];
    for (const g of client.guilds.cache.values()) {
      const ids = String(g?.id || "") === guildId ? memberIds : await fetchCompleteGuildMemberIds(g);
      if (!ids) {
        global.logger?.warn?.("[CLEANUP USERS NOT IN SERVER] Global leave cleanup skipped: incomplete member list.", g?.id);
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