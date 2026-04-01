const { ActivityUserProfile, ACTIVITY_MAIN_GUILD_ID } = require("../../Schemas/Community/communitySchemas");
const { automodBadUser } = require("../../Utils/Community/activityUserProfilePaths");
const guildScoped = [ [ActivityUserProfile, "ActivityUserProfile"] ];

async function clearGlobalAutomodBadUserForUsersNotIn(memberIds, dryRun) {
  const filter = {
    guildId: ACTIVITY_MAIN_GUILD_ID,
    userId: { $nin: memberIds },
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
    staff: { $exists: true },
  };
  if (dryRun) {
    const n = await ActivityUserProfile.countDocuments(filter).catch(() => 0);
    return n;
  }
  const res = await ActivityUserProfile.updateMany(filter, { $unset: { staff: "" } }).catch(() => ({ modifiedCount: 0 }));
  return res?.modifiedCount ?? 0;
}

async function runCleanupUsersNotInServer(guildId, memberIds, { dryRun = false, includeUserScoped = true } = {}) {
  let total = 0;
  const details = [];

  for (const [Model, name] of guildScoped) {
    if (!Model?.countDocuments) continue;
    const filterGuild = { guildId: String(guildId), userId: { $nin: memberIds } };
    
    if (name === "ActivityUserProfile") {
      filterGuild.$and = [
        { "moderation.modCases": { $exists: true, $size: 0 } },
        { "moderation.automodBadUser.totalTriggers": { $lte: 0 } },
        { "profile.privacy.avatar.views": { $not: { $gt: 0 } } },
        { "profile.privacy.banner.views": { $not: { $gt: 0 } } },
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

function collectAllMemberUserIdsFromClient(client) {
  const set = new Set();
  for (const g of client.guilds?.cache?.values() ?? []) {
    for (const m of g.members?.cache?.values() ?? []) {
      if (m?.id) set.add(String(m.id));
    }
  }
  return Array.from(set);
}

/**
 * Stessa logica del cleanup post-ready: tutte le guild del client, fetch membri, poi user-scoped globale.
 */
async function runFullCleanupUsersNotInServer(client) {
  const guilds = Array.from(client.guilds?.cache?.values() ?? []);
  if (!guilds.length) return;
  let grandTotal = 0;
  const allMemberIds = new Set();
  for (const guild of guilds) {
    const guildId = guild?.id;
    if (!guildId) continue;
    await guild.members.fetch().catch(() => null);
    const memberIds = Array.from(guild.members?.cache?.values() ?? []).map((m) => m?.id).filter(Boolean).map(String);
    for (const memberId of memberIds) allMemberIds.add(memberId);
    const { total, details } = await runCleanupUsersNotInServer(guildId, memberIds, { dryRun: false, includeUserScoped: false });
    if (total > 0) {
      grandTotal += total;
      const guildLabel = guild.name ? `${guild.name} (${guildId})` : guildId;
      global.logger?.info?.("[CLEANUP USERS NOT IN SERVER] " + guildLabel + ": rimossi " + total + " documenti. " + details.map((d) => d.name + " " + d.count).join(", "));
    }
  }
  const userScopedCleanup = await runCleanupUserScopedNotInAnyServer(Array.from(allMemberIds), { dryRun: false });
  if (userScopedCleanup.total > 0) {
    grandTotal += userScopedCleanup.total;
    global.logger?.info?.("[CLEANUP USERS NOT IN SERVER] User-scoped global cleanup: rimossi " + userScopedCleanup.total + " documenti. " + userScopedCleanup.details.map((d) => d.name + " " + d.count).join(", "));
  }
  if (grandTotal > 0) {
    global.logger?.info?.("[CLEANUP USERS NOT IN SERVER] Totale rimossi: " + grandTotal + " documenti in " + guilds.length + " server.");
  }
}

/**
 * Dopo guildMemberRemove: cache membri già senza chi chiude; ripulitura guild + user-scoped su tutti i server dello shard.
 */
async function runCleanupAfterMemberLeave(client, guild) {
  if (!client?.guilds || !guild?.id) return;
  const guildId = String(guild.id);
  const memberIds = Array.from(guild.members?.cache?.values() ?? []).map((m) => m?.id).filter(Boolean).map(String);
  await runCleanupUsersNotInServer(guildId, memberIds, { dryRun: false, includeUserScoped: false });
  const allIds = collectAllMemberUserIdsFromClient(client);
  await runCleanupUserScopedNotInAnyServer(allIds, { dryRun: false });
}

module.exports = {
  runCleanupUsersNotInServer,
  runCleanupUserScopedNotInAnyServer,
  runFullCleanupUsersNotInServer,
  runCleanupAfterMemberLeave,
};