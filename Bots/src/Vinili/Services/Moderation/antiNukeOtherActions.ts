/** Antinuke: modifiche a ruoli, permessi dei canali, vanity, prune e thread. */
const { PermissionsBitField, OverwriteType } = require("discord.js") as typeof import("discord.js");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { getMainRoleIds, isWhitelistedExecutorAsync } = require("./antiNukeWhitelist") as typeof import("./antiNukeWhitelist");
const { isUnknownExecutorId, formatExecutorLine, formatAuditStatusLine, logAuditMissingSkip, sendAntiNukeLog } = require("./antiNukeLog") as typeof import("./antiNukeLog");
const { DANGEROUS_PERMS } = require("./antiNukePanicLock") as typeof import("./antiNukePanicLock");
const { isAntiNukeScopeGuild, quarantineOutcomeLabel, quarantineExecutor } = require("./antiNukeQuarantine") as typeof import("./antiNukeQuarantine");
const { normalizeExecutorId, enableAntiNukePanic, handleChannelCreationAction, handleChannelDeletionAction } = require("./antiNukeRoleChannelActions") as typeof import("./antiNukeRoleChannelActions");

const DANGEROUS_CHANNEL_PERMS = [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.ManageWebhooks, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.MentionEveryone,];

function containsDangerousBits(bitfield?, dangerList = DANGEROUS_PERMS) {
  const bits = BigInt(bitfield || 0n);
  return dangerList.some((flag?) => (bits & BigInt(flag)) !== 0n);
}

function dangerousAddedBits(beforeBits?, afterBits?, dangerList = DANGEROUS_PERMS) {
  const before = BigInt(beforeBits || 0n);
  const after = BigInt(afterBits || 0n);
  const added = after & ~before;
  return dangerList.filter((flag?) => (added & BigInt(flag)) !== 0n);
}

async function handleRoleUpdate({ oldRole, newRole, executorId }) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.autoQuarantine.strictMode) return;
  if (!ANTINUKE_CONFIG.autoQuarantine.monitorPublicRoles) return;
  const guild = newRole?.guild || oldRole?.guild;
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!guild) return;
  const monitoredRoleIds = getMainRoleIds(guild);
  if (!monitoredRoleIds.has(String(newRole?.id || oldRole?.id || ""))) return;
  const actorId = normalizeExecutorId(executorId);
  const addedDanger = dangerousAddedBits(oldRole?.permissions?.bitfield || 0n, newRole?.permissions?.bitfield || 0n, DANGEROUS_PERMS,);
  if (!addedDanger.length) return;
  if (isUnknownExecutorId(actorId)) {
    await logAuditMissingSkip(guild, "<a:VC_Alert:1482706673176150077> AntiNuke: Role Quarantine", [
      `<a:VC_Alert:1482706673176150077> **Role:** ${newRole} \`${newRole.id}\``,
      `<a:VC_Alert:1482706673176150077> **Action:** Dangerous permissions detected`,
    ]);
    return;
  }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  await enableAntiNukePanic(guild, "<a:VC_Alert:1482706673176150077> Dangerous role permission update", 100);

  const myMember = guild.members.me;
  if (!myMember?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;
  if (newRole.position >= myMember.roles.highest.position) return;

  await newRole.setPermissions(oldRole.permissions.bitfield, "<:VC_Lock:1482526739044368476> AntiNuke: revert dangerous role perms").catch(() => { });
  const quarantine = await quarantineExecutor(guild, actorId, "<:VC_Lock:1482526739044368476> AntiNuke: dangerous role permission update",);
  await sendAntiNukeLog(
    guild,
    "<a:VC_Alert:1482706673176150077> AntiNuke: Role Quarantine",
    [
      formatExecutorLine(actorId),
      `<a:VC_Alert:1482706673176150077> **Role:** ${newRole} \`${newRole.id}\``,
      `<a:VC_Alert:1482706673176150077> **Action:** Dangerous permissions reverted`,
      `<a:VC_Alert:1482706673176150077> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ],
  );
}

async function handleMemberRoleAddition({ guild, targetMember, addedRoles, executorId }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.autoQuarantine.strictMemberRoleAddition) return;
  if (!guild || !targetMember || !Array.isArray(addedRoles) || !addedRoles.length) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) {
    global.logger?.warn?.(
      "<a:VC_Alert:1482706673176150077> [AntiNuke] Skipping dangerous member role rollback because audit executor is missing:",
      guild.id,
      targetMember.id,
      addedRoles.map((role?) => String(role?.id || "")).filter(Boolean),
    );
    await sendAntiNukeLog(
      guild,
      "<a:VC_Alert:1482706673176150077> AntiNuke: Member Role Quarantine",
      [
        formatExecutorLine(actorId),
        formatAuditStatusLine(actorId),
        `<a:VC_Alert:1482706673176150077> **Target:** ${targetMember.user} \`${targetMember.id}\``,
        `<a:VC_Alert:1482706673176150077> **Action:** Dangerous granted role(s) detected`,
        `<:VC_reason:1478517122929004544> **Technical Reason:** Audit log entry not available in time, automatic rollback skipped to avoid false positives`,
        `<:VC_reason:1478517122929004544> **Result:** No rollback performed`,
      ],
      "#FEE75C",
    );
    return;
  }
  const dangerousRoles = addedRoles.filter((role?) => containsDangerousBits(role?.permissions?.bitfield || 0n, DANGEROUS_PERMS),);
  if (!dangerousRoles.length) return;
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  await enableAntiNukePanic(guild, "<a:VC_Alert:1482706673176150077> Dangerous role added to member", 100);

  const myMember = guild.members.me;
  if (!myMember?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;

  const removable = dangerousRoles.filter((role?) => role.position < myMember.roles.highest.position);
  if (!removable.length) return;
  await targetMember.roles.remove(removable, "<:VC_Lock:1482526739044368476> AntiNuke: remove dangerous role grants").catch(() => { });
  const refreshedTarget = await getGuildMemberCached(guild, String(targetMember.id), { ttlMs: 1 });
  if (removable.some((role?) => refreshedTarget?.roles?.cache?.has?.(role.id))) return;
  const quarantine = await quarantineExecutor(guild, actorId, "<:VC_Lock:1482526739044368476> AntiNuke: dangerous role granted to member",);
  await sendAntiNukeLog(
    guild,
    "<a:VC_Alert:1482706673176150077> AntiNuke: Member Role Quarantine",
    [
      formatExecutorLine(actorId),
      formatAuditStatusLine(actorId),
      `<a:VC_Alert:1482706673176150077> **Target:** ${targetMember.user} \`${targetMember.id}\``,
      `<a:VC_Alert:1482706673176150077> **Action:** Dangerous granted role(s) removed`,
      `<a:VC_Alert:1482706673176150077> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ],
  );
}

async function handleChannelOverwrite({ guild, channel, overwrite, beforeAllow = 0n, afterAllow = 0n, executorId }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.autoQuarantine.monitorChannelPermissions) return;
  if (!guild || !channel || !overwrite) return;
  const actorId = normalizeExecutorId(executorId);
  if (Number(overwrite.type) !== OverwriteType.Role) return;

  const mainRoleIds = getMainRoleIds(guild);
  if (!mainRoleIds.has(String(overwrite.id || ""))) return;

  const addedDanger = dangerousAddedBits(beforeAllow, afterAllow, DANGEROUS_CHANNEL_PERMS);
  if (!addedDanger.length) return;
  if (isUnknownExecutorId(actorId)) {
    await logAuditMissingSkip(guild, "<a:VC_Alert:1482706673176150077> AntiNuke: Channel Overwrite Quarantine", [
      `<a:VC_Alert:1482706673176150077> **Channel:** ${channel} \`${channel.id}\``,
      `<a:VC_Alert:1482706673176150077> **Overwrite Role:** <@&${overwrite.id}> \`${overwrite.id}\``,
      `<a:VC_Alert:1482706673176150077> **Action:** Dangerous channel perms detected`,
    ]);
    return;
  }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  await enableAntiNukePanic(guild, "<a:VC_Alert:1482706673176150077> Dangerous channel overwrite", 100);

  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) return;

  await channel.permissionOverwrites.edit(
    overwrite.id,
    { allow: beforeAllow, deny: overwrite.deny?.bitfield ?? 0n },
    { reason: "<:VC_Lock:1482526739044368476> AntiNuke: revert dangerous channel overwrite permissions" },
  ).catch(() => { });

  const quarantine = await quarantineExecutor(guild, actorId, "<:VC_Lock:1482526739044368476> AntiNuke: dangerous channel overwrite",);
  await sendAntiNukeLog(
    guild,
    "<a:VC_Alert:1482706673176150077> AntiNuke: Channel Overwrite Quarantine",
    [
      formatExecutorLine(actorId),
      `<a:VC_Alert:1482706673176150077> **Channel:** ${channel} \`${channel.id}\``,
      `<a:VC_Alert:1482706673176150077> **Overwrite Role:** <@&${overwrite.id}> \`${overwrite.id}\``,
      `<a:VC_Alert:1482706673176150077> **Action:** Dangerous channel perms reverted`,
      `<a:VC_Alert:1482706673176150077> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ],
  );
}

async function handleVanityGuard({ oldGuild, newGuild, executorId }) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.vanityGuard) return;
  const guild = newGuild || oldGuild;
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  const oldVanity = String(oldGuild?.vanityURLCode || "");
  const newVanity = String(newGuild?.vanityURLCode || "");
  if (oldVanity === newVanity) return;
  if (isUnknownExecutorId(actorId)) {
    await logAuditMissingSkip(guild, "<a:VC_Alert:1482706673176150077> AntiNuke: Vanity Guard", [
      oldVanity
        ? `<a:VC_Alert:1482706673176150077> **Action:** Unauthorized vanity change detected for \`${oldVanity}\``
        : `<a:VC_Alert:1482706673176150077> **Action:** Unauthorized vanity set detected`,
    ]);
    return;
  }
  if (!newGuild?.setVanityCode) return;
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  await enableAntiNukePanic(guild, "<a:VC_Alert:1482706673176150077> Vanity URL unauthorized update", 100);

  if (oldVanity) {
    await newGuild.setVanityCode(oldVanity, "<:VC_Lock:1482526739044368476> AntiNuke: restore vanity url").catch(() => { });
  } else {
    await newGuild.setVanityCode(null, "<:VC_Lock:1482526739044368476> AntiNuke: clear unauthorized vanity url").catch(() => { });
  }
  const quarantine = await quarantineExecutor(guild, actorId, "<:VC_Lock:1482526739044368476> AntiNuke: unauthorized vanity update",);
  await sendAntiNukeLog(
    guild,
    "<a:VC_Alert:1482706673176150077> AntiNuke: Vanity Guard",
    [
      formatExecutorLine(actorId),
      oldVanity
        ? `<a:VC_Alert:1482706673176150077> **Action:** Vanity restored to \`${oldVanity}\``
        : `<a:VC_Alert:1482706673176150077> **Action:** Unauthorized vanity removed`,
      `<a:VC_Alert:1482706673176150077> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ],
  );
}

async function handlePruneAction({ guild, executorId, removedCount = 0 }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.detectPrune) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) {
    await logAuditMissingSkip(guild, "<a:VC_Alert:1482706673176150077> AntiNuke: Member Prune", [
      `<a:VC_Alert:1482706673176150077> **Action:** Member prune detected`,
      `<a:VC_Alert:1482706673176150077> **Rimossi:** ${Number(removedCount || 0)}`,
    ]);
    return;
  }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  await enableAntiNukePanic(guild, "<a:VC_Alert:1482706673176150077> Member prune detected", 100);
  const quarantine = await quarantineExecutor(guild, actorId, "<:VC_Lock:1482526739044368476> AntiNuke: member prune detected",);
  await sendAntiNukeLog(
    guild,
    "<a:VC_Alert:1482706673176150077> AntiNuke: Member Prune",
    [
      formatExecutorLine(actorId),
      `<a:VC_Alert:1482706673176150077> **Action:** Member prune`,
      `<a:VC_Alert:1482706673176150077> **Rimossi:** ${Number(removedCount || 0)}`,
      `<a:VC_Alert:1482706673176150077> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ],
  );
}

async function handleThreadCreationAction({ guild, executorId, threadId = "", thread = null }) {
  return handleChannelCreationAction({
    guild,
    executorId,
    channelId: threadId,
    channel: thread,
  });
}

async function handleThreadDeletionAction({ guild, executorId, threadName = "", threadId = "", thread = null }) {
  return handleChannelDeletionAction({
    guild,
    executorId,
    channelName: threadName,
    channelId: threadId,
    channel: thread,
  });
}

export = { handleRoleUpdate, handleMemberRoleAddition, handleChannelOverwrite, handleVanityGuard, handlePruneAction, handleThreadCreationAction, handleThreadDeletionAction };
