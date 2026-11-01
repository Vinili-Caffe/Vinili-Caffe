const { CustomRole, ActivityUserProfile, UserLeaveBackup } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../../Utils/DB/validateWriteIds");
const { getClientGuildCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { deleteDiscordCustomPerkArtifacts } = require("./customRoleExpiryService") as typeof import("./customRoleExpiryService");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { isCustomRolePurgeDryRun } = require("../../Utils/Community/userCustomRoleFilter") as typeof import("../../Utils/Community/userCustomRoleFilter");

const ORPHAN_SWEEP_MAX_DETAILS = 40;

async function loadCustomPerkIdsForUser(guildId?, userId?) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  const [customRoleDoc, profileDoc] = await Promise.all([
    CustomRole.findOne(
      { guildId: gid, userId: uid },
      "roleId secondaryRoleId customVocChannelId customVocEmoji userId guildId",
    ).lean(),
    ActivityUserProfile.findOne({ guildId: gid, userId: uid })
      .select("profile.customRole")
      .lean()
      .catch(() => null),
  ]);
  const cr = profileDoc?.profile?.customRole || {};
  return {
    guildId: gid,
    userId: uid,
    roleId: String(customRoleDoc?.roleId || cr.roleId || "").trim() || null,
    secondaryRoleId: String(customRoleDoc?.secondaryRoleId || cr.secondaryRoleId || "").trim() || null,
    customVocChannelId: String(customRoleDoc?.customVocChannelId || cr.customVocChannelId || "").trim() || null,
    customVocEmoji: customRoleDoc?.customVocEmoji || cr.customVocEmoji || null,
    customRoleDoc,
  };
}

async function isOwnerStillInGuild(guild?, userId?) {
  const uid = String(userId || "").trim();
  if (!guild || !uid) return false;
  if (guild.members.cache.has(uid)) return true;
  const fetched = await guild.members.fetch({ user: uid, force: false }).catch(() => null);
  return Boolean(fetched && !fetched.user?.bot);
}

async function purgeLeftMemberCustomPerksFromDiscord(guild?, userId?, opts: Record<string, any> = {}) {
  const gid = String(guild?.id || "");
  const uid = String(userId || "");
  const dryRun = opts.dryRun === true || isCustomRolePurgeDryRun();
  if (!isValidGuildUserId(gid, uid) || !guild) {
    return { ok: false, reason: "invalid_ids" };
  }
  if (await isOwnerStillInGuild(guild, uid)) {
    return { ok: false, reason: "still_in_guild" };
  }

  const row = await loadCustomPerkIdsForUser(gid, uid);
  const hasArtifacts = Boolean(row.roleId || row.secondaryRoleId || row.customVocChannelId);
  if (!hasArtifacts) {
    return { ok: true, deleted: false, reason: "nothing_to_delete" };
  }

  const { roleHandled, channelHandled, skippedRoles } = await deleteDiscordCustomPerkArtifacts(guild, row, {
    dryRun,
  }).catch(() => ({
    roleHandled: false,
    channelHandled: false,
    skippedRoles: [],
  }));

  const wouldDelete = hasArtifacts;
  const deleted = !dryRun && wouldDelete;

  if (!dryRun && opts.deleteMongoIfNoBackup && roleHandled && channelHandled) {
    const backup = await UserLeaveBackup.findOne({ guildId: gid, userId: uid }).select("expiresAt").lean().catch(() => null);
    const backupActive = backup?.expiresAt && new Date(backup.expiresAt).getTime() > Date.now();
    if (!backupActive) {
      await CustomRole.deleteOne({ guildId: gid, userId: uid }).catch(() => null);
    }
  }

  return {
    ok: true,
    deleted,
    dryRun,
    wouldDelete,
    userId: uid,
    roleId: row.roleId,
    secondaryRoleId: row.secondaryRoleId,
    customVocChannelId: row.customVocChannelId,
    roleHandled,
    channelHandled,
    skippedRoles: skippedRoles || [],
    source: String(opts.source || "leave"),
  };
}

/**
 * Orphan sweep: only CustomRole Mongo rows whose owner is no longer in guild.
 * Never scans guild roles by name — that deleted system roles (༄ Unverified, level roles, etc.).
 */
async function runOrphanCustomRolesDiscordSweep(client?, opts: Record<string, any> = {}) {
  if (!client) return { ok: false, processed: 0, deleted: 0, wouldDelete: 0, details: [] };
  const guildId = String(client.config?.mainGuildId || IDs.guilds?.main || "").trim();
  if (!guildId) return { ok: false, processed: 0, deleted: 0, wouldDelete: 0, details: [] };

  const dryRun = opts.dryRun === true || isCustomRolePurgeDryRun();
  const guild = client.guilds.cache.get(guildId) || (await getClientGuildCached(client, guildId));
  if (!guild) return { ok: false, processed: 0, deleted: 0, wouldDelete: 0, details: [] };

  const deleteMongoIfNoBackup = opts.deleteMongoIfNoBackup !== false;
  const docs = await CustomRole.find(
    { guildId: guild.id },
    "guildId userId roleId secondaryRoleId customVocChannelId customVocEmoji",
  ).lean().catch(() => []);

  const details = [];
  let deleted = 0;
  let wouldDelete = 0;
  for (const doc of docs) {
    const uid = String(doc.userId || "").trim();
    if (!uid) continue;
    if (await isOwnerStillInGuild(guild, uid)) continue;
    const result = await purgeLeftMemberCustomPerksFromDiscord(guild, uid, {
      deleteMongoIfNoBackup: dryRun ? false : deleteMongoIfNoBackup,
      dryRun,
      source: "orphan_sweep",
    }).catch(() => null);
    if (!result?.wouldDelete && !result?.deleted) continue;
    if (result.wouldDelete) wouldDelete += 1;
    if (result.deleted) deleted += 1;
    details.push(result);
  }

  return {
    ok: true,
    dryRun,
    processed: docs.length,
    deleted,
    wouldDelete,
    details: details.slice(0, ORPHAN_SWEEP_MAX_DETAILS),
  };
}

export = {
  purgeLeftMemberCustomPerksFromDiscord,
  runOrphanCustomRolesDiscordSweep,
};
