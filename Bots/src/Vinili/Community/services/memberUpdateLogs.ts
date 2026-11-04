/** Aggiornamento membri: log di nickname, timeout e ruoli. */
const { EmbedBuilder, PermissionsBitField, AuditLogEvent } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { formatAuditActor, resolveChannelRolesLogChannel, resolveResponsible } = require("../../Moderation/utils/channelRolesLogUtils") as typeof import("../../Moderation/utils/channelRolesLogUtils");
const { resolveModLogChannel, formatResponsible, nowDiscordTs } = require("../../Moderation/utils/modAuditLogUtils") as typeof import("../../Moderation/utils/modAuditLogUtils");
const { handleMemberRoleAddition: antiNukeHandleMemberRoleAddition } = require("../../Security/services/antiNukeService") as typeof import("../../Security/services/antiNukeService");
const { handleStaffRoleAssignmentGuard } = require("../../Moderation/services/staffRoleAssignmentGuardService") as typeof import("../../Moderation/services/staffRoleAssignmentGuardService");
const { shouldSendPublicMemberAnnouncement, normalVerificationCompletedBetween } = require("../utils/memberPublicAnnouncementGate") as typeof import("../utils/memberPublicAnnouncementGate");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;
const MAX_UNVERIFIED_ROLE_DIFF = 4;
const ROLE_UPDATE_LOG_DEDUPE = new Map();
const ROLE_UPDATE_LOG_DEDUPE_TTL_MS = 5_000;

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function toRelativeDiscordTime(value?) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function cleanupRoleUpdateLogDedupe(now = Date.now()) {
  for (const [key, ts] of ROLE_UPDATE_LOG_DEDUPE.entries()) {
    if (now - Number(ts || 0) > ROLE_UPDATE_LOG_DEDUPE_TTL_MS) {
      ROLE_UPDATE_LOG_DEDUPE.delete(key);
    }
  }
}

function shouldSkipRoleUpdateLog(guildId?, userId?, additions = [], removals = []) {
  const now = Date.now();
  cleanupRoleUpdateLogDedupe(now);
  const signature = [String(guildId || ""), String(userId || ""), additions.map((role?) => String(role?.id || "")).sort().join(","), removals.map((role?) => String(role?.id || "")).sort().join(","),].join(":");
  const lastTs = Number(ROLE_UPDATE_LOG_DEDUPE.get(signature) || 0);
  ROLE_UPDATE_LOG_DEDUPE.set(signature, now);
  return now - lastTs <= ROLE_UPDATE_LOG_DEDUPE_TTL_MS;
}

async function resolveActivityLogChannel(guild?) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
}

function didNickChange(oldMember?, newMember?) {
  return String(oldMember?.nickname || "") !== String(newMember?.nickname || "");
}

function didTimeoutChange(oldMember?, newMember?) {
  const oldTs = oldMember?.communicationDisabledUntilTimestamp || 0;
  const newTs = newMember?.communicationDisabledUntilTimestamp || 0;
  return Number(oldTs) !== Number(newTs);
}

function buildNickChangeLine(oldMember?, newMember?) {
  const oldNick = String(oldMember?.nickname || "").trim() || E.cancel;
  const newNick = String(newMember?.nickname || "").trim() || E.cancel;
  return `${oldNick} ${E.VC_Arrow} ${newNick}`;
}

function buildTimeoutChangeLine(oldMember?, newMember?) {
  const oldTs = oldMember?.communicationDisabledUntilTimestamp || 0;
  const newTs = newMember?.communicationDisabledUntilTimestamp || 0;
  const oldLabel = oldTs ? toRelativeDiscordTime(oldTs) : E.cancel;
  const newLabel = newTs ? toRelativeDiscordTime(newTs) : E.cancel;
  return `${oldLabel} ${E.VC_Arrow} ${newLabel}`;
}

async function resolveMemberUpdateAuditInfo(guild?, targetUserId?) {
  if (
    !guild?.members?.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return { executor: null, reason: null };
  }

  let entry = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: AUDIT_FETCH_LIMIT, }).catch(() => null);

    if (logs?.entries?.size) {
      const nowMs = Date.now();
      entry =
        logs.entries.find((item?) => {
          const createdMs = Number(item?.createdTimestamp || 0);
          const targetId = String(item?.target?.id || "");
          const withinWindow = createdMs > 0 && nowMs - createdMs <= AUDIT_LOOKBACK_MS;
          return withinWindow && targetId === String(targetUserId || "");
        }) || null;
    }

    if (entry) break;
    if (attempt < 2) await sleep(700);
  }

  return {
    executor: entry?.executor || null,
    reason: entry?.reason || null,
  };
}

async function sendTimeoutRemovedModLog(oldMember?, newMember?) {
  const guild = newMember?.guild || oldMember?.guild;
  if (!guild || !newMember?.user) return;
  const hadTimeout = Number(oldMember?.communicationDisabledUntilTimestamp || 0) > 0;
  const hasTimeout = Number(newMember?.communicationDisabledUntilTimestamp || 0) > 0;
  if (!hadTimeout || hasTimeout) return;

  const modLogChannel = await resolveModLogChannel(guild);
  if (!modLogChannel?.isTextBased?.()) return;

  const audit = await resolveMemberUpdateAuditInfo(guild, newMember.user.id);
  const responsible = formatResponsible(audit.executor);

  const embed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle(`${E.VC_User} Timeout Rimosso`)
    .setDescription(
      [
        `${E.VC_User} **Timeout per** ${newMember.user} **è stato rimosso**`,
        `${E.VC_Staff} **Responsabile:** ${responsible}`,
        `${E.VC_Clock} ${nowDiscordTs()}`,
        audit.reason ? `${E.VC_reason} **Motivo:** ${audit.reason}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setFooter({ text: `ID: ${newMember.user.id}` })
    .setTimestamp();

  await modLogChannel.send({ embeds: [embed] }).catch(() => null);
}

async function sendMemberUpdateLog(oldMember?, newMember?) {
  const guild = newMember?.guild || oldMember?.guild;
  if (!guild || !newMember?.user) return;

  const nickChanged = didNickChange(oldMember, newMember);
  const timeoutChanged = didTimeoutChange(oldMember, newMember);
  if (!nickChanged && !timeoutChanged) return;

  if (timeoutChanged) {
    const hadTimeout = Number(oldMember?.communicationDisabledUntilTimestamp || 0) > 0;
    const hasTimeout = Number(newMember?.communicationDisabledUntilTimestamp || 0) > 0;
    if (hadTimeout && !hasTimeout) await sendTimeoutRemovedModLog(oldMember, newMember);
  }

  if (!(await shouldSendPublicMemberAnnouncement(newMember))) return;

  const logChannel = await resolveActivityLogChannel(guild);
  if (!logChannel?.isTextBased?.()) return;

  const audit = await resolveMemberUpdateAuditInfo(guild, newMember.user.id);
  const responsibleText = formatAuditActor(audit.executor);

  const lines = [
    `${E.VC_Staff} **Responsabile:** ${responsibleText}`,
    `${E.VC_User} **Utente:** ${newMember.user} \`${newMember.user.id}\``,
    `${E.VC_Clock} ${toDiscordTimestamp(new Date(), "F")}`,
  ];

  if (audit.reason) {
    lines.push(`${E.VC_reason} **Motivo:** ${audit.reason}`);
  }

  lines.push("", `**${E.VC_tools} Cambiamenti**`);

  if (timeoutChanged) {
    lines.push(`${E.VC_Info} **Disabilitazione comunicazione fino a**`);
    lines.push(`  ${buildTimeoutChangeLine(oldMember, newMember)}`);
  }

  if (nickChanged) {
    lines.push(`${E.VC_Modifica} **Nick**`);
    lines.push(`  ${buildNickChangeLine(oldMember, newMember)}`);
  }

  const embed = new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle(`${E.VC_User} Membro Aggiornato`)
    .setDescription(lines.join("\n"));

  await logChannel.send({ embeds: [embed] }).catch((err?) => {
    global.logger.error("[guildMemberUpdate] Failed to send member update log:", err);
  });
}

async function sendMemberRoleUpdateLog(oldMember?, newMember?) {
  const guild = newMember?.guild || oldMember?.guild;
  if (!guild) return;
  if (!rolesChanged(oldMember, newMember)) return;

  const actionType = AuditLogEvent?.MemberRoleUpdate ?? AuditLogEvent?.MemberUpdate;
  const oldRoles = oldMember?.roles?.cache || new Map();
  const newRoles = newMember?.roles?.cache || new Map();
  const cacheAdditions = [];
  const cacheRemovals = [];

  for (const role of newRoles.values()) {
    if (role?.id === guild.id) continue;
    if (!oldRoles.has(role.id)) cacheAdditions.push(role);
  }
  for (const role of oldRoles.values()) {
    if (role?.id === guild.id) continue;
    if (!newRoles.has(role.id)) cacheRemovals.push(role);
  }
  if (!cacheAdditions.length && !cacheRemovals.length) return;

  const expectedAddedIds = new Set(cacheAdditions.map((role?) => String(role?.id || "")).filter(Boolean));
  const expectedRemovedIds = new Set(cacheRemovals.map((role?) => String(role?.id || "")).filter(Boolean));
  const audit = await resolveResponsible(guild, actionType, (entry?) => { if (String(entry?.target?.id || "") !== String(newMember?.id || "")) return 0; let score = 3; const changes = Array.isArray(entry?.changes) ? entry.changes : []; const auditAddedIds = new Set(); const auditRemovedIds = new Set(); for (const change of changes) { const key = String(change?.key || ""); const raw = Array.isArray(change?.new) ? change.new : Array.isArray(change?.old) ? change.old : []; if (key !== "$add" && key !== "$remove") continue; for (const item of raw) { const id = String(item?.id || item?.role_id || "").trim(); if (!id) continue; if (key === "$add") auditAddedIds.add(id); if (key === "$remove") auditRemovedIds.add(id); } } if (!auditAddedIds.size && !auditRemovedIds.size) return score; for (const id of auditAddedIds) { if (expectedAddedIds.has((id as any))) score += 4; } for (const id of auditRemovedIds) { if (expectedRemovedIds.has((id as any))) score += 4; } if (auditAddedIds.size === expectedAddedIds.size && auditRemovedIds.size === expectedRemovedIds.size) { score += 6; } return score; },); const auditAdditions = []; const auditRemovals = [];
  const auditChanges = Array.isArray(audit?.entry?.changes) ? audit.entry.changes : [];
  for (const change of auditChanges) {
    const key = String(change?.key || "");
    const raw = Array.isArray(change?.new) ? change.new : Array.isArray(change?.old) ? change.old : [];
    if (key !== "$add" && key !== "$remove") continue;

    for (const item of raw) {
      const roleId = String(item?.id || item?.role_id || "").trim();
      if (!roleId || roleId === guild.id) continue;
      const role = guild.roles.cache.get(roleId);
      const fallback = {
        id: roleId, toString: () => `<@&${roleId}>`,
      };
      if (key === "$add") auditAdditions.push(role || fallback);
      if (key === "$remove") auditRemovals.push(role || fallback);
    }
  }

  const hasTrustedAuditDiff = auditAdditions.length > 0 || auditRemovals.length > 0;
  const usingFallbackDiff = !hasTrustedAuditDiff;
  const additions = hasTrustedAuditDiff ? auditAdditions : cacheAdditions;
  const removals = hasTrustedAuditDiff ? auditRemovals : cacheRemovals;
  if (!additions.length && !removals.length) return;
  const unverifiedDiffSize = additions.length + removals.length;
  if (usingFallbackDiff && unverifiedDiffSize > MAX_UNVERIFIED_ROLE_DIFF) return;

  const responsible = formatAuditActor(audit.executor);
  const executorId = String(audit?.executor?.id || "");
  if (shouldSkipRoleUpdateLog(guild.id, newMember.id, additions, removals)) return;

  const allowPublicAnn = await shouldSendPublicMemberAnnouncement(newMember);
  const gainingNormalVerification = normalVerificationCompletedBetween(oldMember, newMember);

  const logChannel = await resolveChannelRolesLogChannel(guild);
  if (logChannel?.isTextBased?.() && (allowPublicAnn || gainingNormalVerification)) {
    const lines = [
      `${E.VC_Staff} **Responsabile:** ${responsible}`,
      `${E.VC_User} **Utente:** ${newMember.user} \`${newMember.user.id}\``,
      `${E.VC_Clock} ${toDiscordTimestamp(new Date(), "F")}`,
      "",
      `**${E.VC_tools} Cambiamenti**`,
    ];

    if (additions.length) {
      lines.push(`${E.success} **Additions:**`);
      for (const role of additions.slice(0, 15)) {
        lines.push(`${E.VC_Arrow} ${role}`);
      }
    }

    if (removals.length) {
      lines.push(`${E.cancel} **Removals:**`);
      for (const role of removals.slice(0, 15)) {
        lines.push(`${E.VC_Arrow} ${role}`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor("#F59E0B")
      .setTitle(`${E.VC_User} Ruolo Membro Aggiornato`)
      .setDescription(lines.join("\n"));

    await logChannel.send({ embeds: [embed] }).catch((err?) => {
      global.logger.error("[guildMemberUpdate] Failed to send member role update log:", err);
    });
  }

  if (additions.length && hasTrustedAuditDiff) {
    await handleStaffRoleAssignmentGuard({
      guild,
      targetMember: newMember,
      addedRoles: additions,
      executorId,
      executor: audit.executor,
      client: guild.client,
    }).catch((err?) => {
      global.logger?.warn?.("[guildMemberUpdate] staff role assignment guard:", newMember.id, err?.message || err);
    });
    await antiNukeHandleMemberRoleAddition({
      guild,
      targetMember: newMember,
      addedRoles: additions,
      executorId,
    });
  }
}

function rolesChanged(oldMember?, newMember?) {
  const oldRoles = oldMember?.roles?.cache;
  const newRoles = newMember?.roles?.cache;
  if (!oldRoles || !newRoles) return false;

  return (
    oldRoles.size !== newRoles.size ||
    oldRoles.some((role?) => !newRoles.has(role.id)) ||
    newRoles.some((role?) => !oldRoles.has(role.id))
  );
}

export = { sleep, sendMemberUpdateLog, sendMemberRoleUpdateLog };
