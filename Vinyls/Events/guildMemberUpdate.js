const { EmbedBuilder, PermissionsBitField, AuditLogEvent, MessageType, } = require("discord.js");
const { DIVIDER_URL } = require("../../shared/discord/constants");
const IDs = require("../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache");
const { scheduleStaffListRefresh, didStaffMembershipChange, didStaffRolesChange, memberHasStaffRole } = require("../Utils/Community/staffListUtils");
const { memberHasPartnerManagerRole, memberHasAnyStaffPresenceForDepexSync, buildStaffPartnerManagerIdUnsetUpdate } = require("../Utils/Staff/staffPmUtils");
const { deleteStaffPauseRequestChannelMessages, deleteStaffRelatedMessagesFromConfiguredChannels, } = require("../Utils/Staff/staffDocUtils");
const { ActivityUserProfile, CustomRole } = require("../Schemas/Community/communitySchemas");
const { grantBestStaffPauseBonusYear } = require("../Utils/Pause/pauseHandlersUtils");
const { getJoinGateConfigSnapshot, } = require("../Services/Moderation/joinGateService");
const { resolveJoinGateConfiguredExempt, isSponsorJoinGateGuildId, } = require("../Services/Moderation/joinGateExemptUtils");
const { ARROW, formatAuditActor, resolveChannelRolesLogChannel, resolveResponsible, } = require("../Utils/Logging/channelRolesLogUtils");
const { resolveModLogChannel, formatResponsible, nowDiscordTs } = require("../Utils/Logging/modAuditLogUtils");
const { handleMemberRoleAddition: antiNukeHandleMemberRoleAddition } = require("../Services/Moderation/antiNukeService");
const { hasEventWeekWinnerGrant } = require("../Services/Community/weekWinnerGrantsService");
const { hasExtraCustomPerksUnlock } = require("../Utils/Community/customPerksUnlock");
const { createModCase, getModConfig, logModCase } = require("../Utils/Moderation/moderation");
const { setWelcomeContextActive } = require("../Utils/Message/officialMessageCommunityHandlers");
const { syncClanTagRolesForUserEverywhereAfterMemberEvent } = require("../Services/Community/clanTagRoleService");
const { getAnnouncedBoostSlots, setAnnouncedBoostSlots, addAnnouncedBoostSlots, deleteAnnouncedBoostSlots } = require("../Utils/Community/boostSlotAnnounceTracker");
const { shouldSendPublicMemberAnnouncement, normalVerificationCompletedBetween } = require("../Utils/Community/memberPublicAnnouncementGate");
const { runDeferredJoinAnnouncements } = require("./guildMemberAdd");
const { syncPartnerPmThreadForMemberChange } = require("../Services/Partner/partnerPmDailyThreadService");
const { autoUnclaimOpenTicketsClaimedByUser } = require("../Utils/Ticket/ticketAutoUnclaimOnStaffLoss");
const sponsorVerifiedRequiresMain = require("../Services/Community/sponsorVerifiedRequiresMainService");
const { guildMemberDisplayAvatarUrlDynamic } = require("../Utils/Discord/guildDiscordIdentity");
const { maybeAnnounceDonationPackageInSupporters } = require("../Utils/Community/donationPackageSupportersAnnounce");
const {
  buildBoostEmbed,
  buildBoostEmbedSecond,
  buildBoostAnnounceContent,
} = require("../Utils/Community/boostAnnounceEmbeds");
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;
const MAX_UNVERIFIED_ROLE_DIFF = 4;
const ROLE_UPDATE_LOG_DEDUPE = new Map();
const ROLE_UPDATE_LOG_DEDUPE_TTL_MS = 5_000;
const PERK_ROLE_ID = IDs.roles.PicPerms;
const BOOST_FOLLOWUP_DELAY_MS = 5000;
const CUSTOM_ROLE_VOC_ELIGIBLE_ROLE_IDS = [IDs.roles.VIP, IDs.roles.DoubleBooster, IDs.roles.Level50, IDs.roles.Level70, IDs.roles.Donator, IDs.roles.vip, IDs.roles.VIPplus].filter(Boolean);
const PLUS_COLOR_ROLE_IDS = [IDs.roles.redPlus, IDs.roles.orangePlus, IDs.roles.yellowPlus, IDs.roles.greenPlus, IDs.roles.bluePlus, IDs.roles.purplePlus, IDs.roles.pinkPlus, IDs.roles.blackPlus, IDs.roles.grayPlus, IDs.roles.whitePlus,].filter(Boolean);
const boostCountCache = new Map();
const boostAnnounceCache = new Map();
const boostFollowupLocks = new Map();

function isPrimaryShard(client) {
  return !client?.shard || client.shard.ids?.[0] === 0;
}

function buildJoinGateTriggeredEmbed(member, reason) {
  return new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle(`${member.user.username} has triggered the joingate!`)
    .setDescription(
      [
        `${ARROW} **Member:** ${member.user.username} [\`${member.user.id}\`]`,
        `${ARROW} **Reason:** ${reason}`,
      ].join("\n"),
    )
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(member, { size: 256 }) || null);
}

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function toRelativeDiscordTime(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

function sleep(ms) {
  return new Promise((resolve) => {
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

function shouldSkipRoleUpdateLog(guildId, userId, additions = [], removals = []) {
  const now = Date.now();
  cleanupRoleUpdateLogDedupe(now);
  const signature = [String(guildId || ""), String(userId || ""), additions.map((role) => String(role?.id || "")).sort().join(","), removals.map((role) => String(role?.id || "")).sort().join(","),].join(":");
  const lastTs = Number(ROLE_UPDATE_LOG_DEDUPE.get(signature) || 0);
  ROLE_UPDATE_LOG_DEDUPE.set(signature, now);
  return now - lastTs <= ROLE_UPDATE_LOG_DEDUPE_TTL_MS;
}

async function resolveActivityLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
}

function didNickChange(oldMember, newMember) {
  return String(oldMember?.nickname || "") !== String(newMember?.nickname || "");
}

function didTimeoutChange(oldMember, newMember) {
  const oldTs = oldMember?.communicationDisabledUntilTimestamp || 0;
  const newTs = newMember?.communicationDisabledUntilTimestamp || 0;
  return Number(oldTs) !== Number(newTs);
}

function buildNickChangeLine(oldMember, newMember) {
  const oldNick = String(oldMember?.nickname || "").trim() || "<:cancel:1461730653677551691>";
  const newNick = String(newMember?.nickname || "").trim() || "<:cancel:1461730653677551691>";
  return `${oldNick} <:VC_right_arrow:1482459908245815296> ${newNick}`;
}

function buildTimeoutChangeLine(oldMember, newMember) {
  const oldTs = oldMember?.communicationDisabledUntilTimestamp || 0;
  const newTs = newMember?.communicationDisabledUntilTimestamp || 0;
  const oldLabel = oldTs ? toRelativeDiscordTime(oldTs) : "<:cancel:1461730653677551691>";
  const newLabel = newTs ? toRelativeDiscordTime(newTs) : "<:cancel:1461730653677551691> (Reset)";
  return `${oldLabel} <:VC_right_arrow:1482459908245815296> ${newLabel}`;
}

async function resolveMemberUpdateAuditInfo(guild, targetUserId) {
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
        logs.entries.find((item) => {
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

async function sendTimeoutRemovedModLog(oldMember, newMember) {
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
    .setTitle("Timeout Removed")
    .setDescription(
      [
        `${ARROW} **Timeout for** ${newMember.user} **has been removed**`,
        `${ARROW} **Responsible:** ${responsible}`,
        `${ARROW} ${nowDiscordTs()}`,
        audit.reason ? `${ARROW} **Reason:** ${audit.reason}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setFooter({ text: `ID: ${newMember.user.id}` })
    .setTimestamp();

  await modLogChannel.send({ embeds: [embed] }).catch(() => null);
}

async function sendMemberUpdateLog(oldMember, newMember) {
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
    `<:VC_right_arrow:1482459908245815296> **Responsible:** ${responsibleText}`,
    `<:VC_right_arrow:1482459908245815296> **Target:** ${newMember.user} \`${newMember.user.id}\``,
    `<:VC_right_arrow:1482459908245815296> ${toDiscordTimestamp(new Date(), "F")}`,
  ];

  if (audit.reason) {
    lines.push(`<:VC_right_arrow:1482459908245815296> **Reason:** ${audit.reason}`);
  }

  lines.push("", "**Changes**");

  if (timeoutChanged) {
    lines.push("<:VC_right_arrow:1482459908245815296> **Communication Disabled Until**");
    lines.push(`  ${buildTimeoutChangeLine(oldMember, newMember)}`);
  }

  if (nickChanged) {
    lines.push("<:VC_right_arrow:1482459908245815296> **Nick**");
    lines.push(`  ${buildNickChangeLine(oldMember, newMember)}`);
  }

  const embed = new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle("Member Update")
    .setDescription(lines.join("\n"));

  await logChannel.send({ embeds: [embed] }).catch(() => null);
}

async function sendMemberRoleUpdateLog(oldMember, newMember) {
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

  const expectedAddedIds = new Set(cacheAdditions.map((role) => String(role?.id || "")).filter(Boolean));
  const expectedRemovedIds = new Set(cacheRemovals.map((role) => String(role?.id || "")).filter(Boolean));
  const audit = await resolveResponsible(guild, actionType, (entry) => { if (String(entry?.target?.id || "") !== String(newMember?.id || "")) return 0; let score = 3; const changes = Array.isArray(entry?.changes) ? entry.changes : []; const auditAddedIds = new Set(); const auditRemovedIds = new Set(); for (const change of changes) { const key = String(change?.key || ""); const raw = Array.isArray(change?.new) ? change.new : Array.isArray(change?.old) ? change.old : []; if (key !== "$add" && key !== "$remove") continue; for (const item of raw) { const id = String(item?.id || item?.role_id || "").trim(); if (!id) continue; if (key === "$add") auditAddedIds.add(id); if (key === "$remove") auditRemovedIds.add(id); } } if (!auditAddedIds.size && !auditRemovedIds.size) return score; for (const id of auditAddedIds) { if (expectedAddedIds.has(id)) score += 4; } for (const id of auditRemovedIds) { if (expectedRemovedIds.has(id)) score += 4; } if (auditAddedIds.size === expectedAddedIds.size && auditRemovedIds.size === expectedRemovedIds.size) { score += 6; } return score; },); const auditAdditions = []; const auditRemovals = [];
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
      `${ARROW} **Responsible:** ${responsible}`,
      `${ARROW} **Target:** ${newMember.user} \`${newMember.user.id}\``,
      `${ARROW} ${toDiscordTimestamp(new Date(), "F")}`,
      "",
      "**Changes**",
    ];

    if (additions.length) {
      lines.push("<:success:1461731530333229226> **Additions:**");
      for (const role of additions.slice(0, 15)) {
        lines.push(`  ${ARROW} ${role}`);
      }
    }

    if (removals.length) {
      lines.push("<:cancel:1461730653677551691> **Removals:**");
      for (const role of removals.slice(0, 15)) {
        lines.push(`  ${ARROW} ${role}`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor("#F59E0B")
      .setTitle("Member Role Update")
      .setDescription(lines.join("\n"));

    await logChannel.send({ embeds: [embed] }).catch(() => null);
  }

  if (additions.length && hasTrustedAuditDiff) {
    await antiNukeHandleMemberRoleAddition({
      guild,
      targetMember: newMember,
      addedRoles: additions,
      executorId,
    });
  }
}

function hasManageRolesPermission(member) {
  const me = member.guild.members.me;
  return Boolean(me?.permissions?.has(PermissionsBitField.Flags.ManageRoles));
}

async function addPerkRoleIfPossible(member) {
  if (!PERK_ROLE_ID) return;
  const me = member.guild.members.me;
  if (!me) return;
  if (!hasManageRolesPermission(member)) return;

  const role = member.guild.roles.cache.get(PERK_ROLE_ID);
  if (!role) return;
  if (role.position >= me.roles.highest.position) return;
  if (member.roles.cache.has(PERK_ROLE_ID)) return;

  const added = await member.roles.add(role).then(() => true).catch(() => false);
  if (added) return;
  const refreshedMember = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  if (!refreshedMember?.roles?.cache?.has(PERK_ROLE_ID)) {
    global.logger?.warn?.("[guildMemberUpdate] Failed to add perk role:", member.guild.id, member.id, PERK_ROLE_ID);
  }
}

function buildGuildedEmbed(member) {
  const avatarUrl = guildMemberDisplayAvatarUrlDynamic(member, { size: 256 });
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({ name: member.user.username, iconURL: avatarUrl || undefined })
    .setTitle("Nuovx Guilded <a:VC_StarPink:1330194976440848500>")
    .setDescription(
      [
        `<@${member.id}>, \`hai sbloccato:\``,
        `<:VC_Reply:1482532158080942191> Ti è stato assegnato il ruolo <@&${IDs.roles.Guilded}>!`,
        "<a:VC_Coffe:1448695567244066827> - Accesso ai vantaggi esclusivi **Guilded**",
        "",
        "<a:VC_Arrow:1482706699365257397> Grazie per aver unito il tuo account!",
      ].join("\n"),
    )
    .setThumbnail(avatarUrl || null)
    .setFooter({ text: "Grazie per il tuo supporto!" })
    .setImage(DIVIDER_URL);
}

async function removePlusColorsIfNotEligible(member) {
  const me = member.guild.members.me;
  if (!me) return;
  if (!hasManageRolesPermission(member)) return;

  const { memberHasPlusColorFullEligibilityAsync } = require("../Utils/Community/personalityColorUnlocks");
  if (await memberHasPlusColorFullEligibilityAsync(member)) return;

  const heldPlusRoles = PLUS_COLOR_ROLE_IDS.filter((roleId) => member.roles.cache.has(roleId),);
  if (!heldPlusRoles.length) return;

  const removableRoleIds = heldPlusRoles.filter((roleId) => { const role = member.guild.roles.cache.get(roleId); return role && role.position < me.roles.highest.position; });
  if (!removableRoleIds.length) return;

  const removed = await member.roles.remove(removableRoleIds).then(() => true).catch(() => false);
  if (removed) return;
  const refreshedMember = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  const stillHeldRoles = removableRoleIds.filter((roleId) => refreshedMember?.roles?.cache?.has(roleId));
  if (stillHeldRoles.length) {
    global.logger?.warn?.("[guildMemberUpdate] Failed to remove plus color roles:", member.guild.id, member.id, stillHeldRoles);
  }
}

async function sendBoostEmbeds(channel, member, times, boostCount, priorAnnouncedSlots = 0) {
  if (!channel?.isTextBased?.()) return;
  const safeTimes = Math.max(0, Number(times || 0));
  const start = Math.max(0, Math.floor(Number(priorAnnouncedSlots || 0)));
  for (let i = 0; i < safeTimes; i += 1) {
    const slotIndex = start + i;
    const embed = slotIndex >= 1 ? buildBoostEmbedSecond(member, boostCount) : buildBoostEmbed(member, boostCount);
    await channel.send({
      content: buildBoostAnnounceContent(member.user),
      embeds: [embed],
    }).catch(() => null);
  }
}

async function trackBoostSlotsAnnouncedAndMaybeGrantDoubleBooster(member, guildId, times) {
  const mainId = String(IDs.guilds.main || "");
  const doubleId = IDs?.roles?.DoubleBooster;
  if (!mainId || String(member?.guild?.id || "") !== mainId || !doubleId) return;
  if (!member?.roles?.add || member.user?.bot) return;
  const me = member.guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;
  const role = member.guild.roles.cache.get(doubleId);
  if (!role || role.position >= me.roles.highest.position) return;

  const add = Math.max(0, Number(times || 0));
  if (!add) return;
  const next = addAnnouncedBoostSlots(guildId, member.id, add);
  if (next < 2 || member.roles.cache.has(doubleId)) return;
  const ok = await member.roles.add(doubleId).then(() => true).catch(() => false);
  if (!ok) {
    global.logger?.warn?.("[guildMemberUpdate] Double Booster add failed:", member.guild.id, member.id);
  }
}

function rolesChanged(oldMember, newMember) {
  const oldRoles = oldMember?.roles?.cache;
  const newRoles = newMember?.roles?.cache;
  if (!oldRoles || !newRoles) return false;

  return (
    oldRoles.size !== newRoles.size ||
    oldRoles.some((role) => !newRoles.has(role.id)) ||
    newRoles.some((role) => !oldRoles.has(role.id))
  );
}

function getJoinGateNameCandidate(member) {
  return String(
    member?.user?.globalName ||
    member?.displayName ||
    member?.nickname ||
    member?.user?.username ||
    "",
  );
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function wildcardToRegex(wildcard) {
  const escaped = String(wildcard || "").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function matchUsernameFilters(candidate, rules) {
  if (!rules?.enabled) return null;
  const normalized = normalizeText(candidate);
  if (!normalized) return null;

  const strictWords = Array.isArray(rules?.strictWords) ? rules.strictWords : [];
  for (const word of strictWords) {
    const normalizedWord = normalizeText(word);
    if (!normalizedWord) continue;
    if (normalized.includes(normalizedWord)) {
      return { type: "strict", value: word };
    }
  }

  const wildcardWords = Array.isArray(rules?.wildcardWords) ? rules.wildcardWords : [];
  for (const wildcard of wildcardWords) {
    const regex = wildcardToRegex(normalizeText(wildcard));
    if (regex.test(normalized)) {
      return { type: "wildcard", value: wildcard };
    }
  }

  return null;
}

async function sendJoinGatePostJoinDm(member, reason, extraLines = []) {
  const embed = new EmbedBuilder().setColor("#ED4245").setTitle("Join Gate").setDescription([`${ARROW} **Azione applicata dopo il join**`,
  `${ARROW} **Motivo:** ${reason}`,
  ...extraLines.filter(Boolean),
  ].join("\n"),
  );
  try {
    await member.send({ embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}

async function enforceJoinGatePostJoinUsername(oldMember, newMember) {
  if (!oldMember?.guild || !newMember?.user) return;
  if (newMember.user.bot) return;
  if (isSponsorJoinGateGuildId(newMember.guild.id)) return;
  if (await resolveJoinGateConfiguredExempt(newMember.guild, newMember.id, newMember)) return;

  const cfg = getJoinGateConfigSnapshot();
  if (!cfg?.enabled) return;
  if (!cfg?.usernameFilter?.enabled) return;
  if (!cfg?.usernameFilter?.postJoinEnabled) return;

  const oldCandidate = getJoinGateNameCandidate(oldMember);
  const newCandidate = getJoinGateNameCandidate(newMember);
  if (normalizeText(oldCandidate) === normalizeText(newCandidate)) return;

  const match = matchUsernameFilters(newCandidate, cfg.usernameFilter);
  if (!match) return;

  const action = String(cfg?.usernameFilter?.action || "kick").toLowerCase();
  const me = newMember.guild.members.me;
  const canKick = Boolean(me?.permissions?.has(PermissionsBitField.Flags.KickMembers)) && Boolean(newMember?.kickable);
  const canBan = Boolean(me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) && Boolean(newMember?.bannable);
  const canTimeout = Boolean(me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) && Boolean(newMember?.moderatable);

  let punished = false;
  let appliedAction = action;
  const reason = "JoinGate post-join username filter match.";

  if (action === "kick" && canKick) {
    punished = await newMember.kick(reason).then(() => true).catch(() => false);
  } else if (action === "ban" && canBan) {
    punished = await newMember.guild.members
      .ban(newMember.id, { deleteMessageSeconds: 604800, reason })
      .then(() => true)
      .catch(() => false);
  } else if (action === "timeout" && canTimeout) {
    punished = await newMember
      .timeout(6 * 60 * 60_000, reason)
      .then(() => true)
      .catch(() => false);
  } else {
    appliedAction = "log";
  }

  if (!punished && appliedAction !== "log" && canTimeout) {
    punished = await newMember
      .timeout(6 * 60 * 60_000, "JoinGate post-join fallback timeout.")
      .then(() => true)
      .catch(() => false);
    if (punished) appliedAction = "timeout";
  }
  if (!punished && appliedAction !== "log") {
    appliedAction = "log";
  }

  let dmSent = false;
  if (punished && appliedAction !== "log" && cfg?.dmPunishedMembers !== false) {
    dmSent = await sendJoinGatePostJoinDm(newMember, reason, [
      `${ARROW} **Rule:** Username Filter (Post Join)`,
      `${ARROW} **Match Type:** ${match.type}`,
      `${ARROW} **Match:** ${match.value}`,
      `${ARROW} **Name:** ${newCandidate || "N/A"}`,
    ]);
  }

  if (punished && appliedAction !== "log" && newMember.guild?.client) {
    const modAction = appliedAction === "timeout" ? "MUTE" : appliedAction === "ban" ? "BAN" : "KICK";
    const durationMs = appliedAction === "timeout" ? 6 * 60 * 60_000 : null;
    const caseReason = `JoinGate post-join: ${reason}`;
    try {
      const config = await getModConfig(newMember.guild.id);
      const { doc, created } = await createModCase({ guildId: newMember.guild.id, action: modAction, userId: newMember.id, modId: newMember.client.user.id, reason: caseReason, durationMs, context: {}, dedupe: { enabled: true, windowMs: 15_000, matchReason: true }, });
      if (created) {
        await logModCase({ client: newMember.client, guild: newMember.guild, modCase: doc, config });
      }
    } catch (e) {
      global.logger?.warn?.("[JoinGate post-join] ModCase creation failed:", newMember.guild.id, newMember.id, e?.message || e);
    }
  }

  const modLogId = IDs.channels?.modLogs;
  const logChannel = modLogId ? (newMember.guild.channels.cache.get(modLogId) || (await getGuildChannelCached(newMember.guild, modLogId))) : null;
  if (!logChannel?.isTextBased?.()) return;

  const embed = punished ? new EmbedBuilder().setColor("#A97142").setTitle(`${newMember.user.username} has been ${String(appliedAction || "kick").toLowerCase() === "timeout" ? "timed out" : String(appliedAction || "kick").toLowerCase() === "ban" ? "banned" : "kicked"}!!`,
  )
    .setDescription(
      [
        `${ARROW} **Member:** ${newMember.user.username} [\`${newMember.user.id}\`]`, `${ARROW} **Reason:** Username matches blocked pattern (post-join filter).`,
        `${ARROW} **Rule:** Username Filter (Post Join)`,
        `${ARROW} **Action:** ${String(appliedAction || "log").toUpperCase()}`,
        `${ARROW} **Match Type:** ${match.type}`,
        `${ARROW} **Match:** ${match.value}`,
        `${ARROW} **Old Name:** ${oldCandidate || "N/A"}`,
        `${ARROW} **New Name:** ${newCandidate || "N/A"}`,
        "",
        "**More Details:**",
        `${ARROW} **Member Direct Messaged?** ${dmSent ? "Yes" : "No"}`,
        `${ARROW} **Member Punished?** ${punished ? "Yes" : "No"}`,
      ].join("\n"),
    )
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(newMember, { size: 256 }) || null)
    .setFooter({ text: "© 2026 Vinili & Caffè. Tutti i diritti riservati." })
    : buildJoinGateTriggeredEmbed(
      newMember,
      "Username matches blocked pattern (post-join filter).",
    );

  await logChannel.send({ embeds: [embed] }).catch(() => { });
}

function computeBoostDelta(oldMember, newMember, guildId) {
  const currentCount = Number(newMember.guild.premiumSubscriptionCount || 0);
  const oldCountFromEvent = Number(oldMember?.guild?.premiumSubscriptionCount || 0);
  const prevCount =
    typeof boostCountCache.get(guildId) === "number"
      ? boostCountCache.get(guildId)
      : oldCountFromEvent;
  const effectivePrev = Math.min(
    prevCount,
    oldCountFromEvent > 0 ? oldCountFromEvent : prevCount,
  );
  const countIncreased = currentCount > effectivePrev;
  const boostDelta = countIncreased ? Math.max(1, currentCount - effectivePrev) : 0;
  const guildBoostDecreased = currentCount < effectivePrev;
  const boostDrop = guildBoostDecreased ? Math.max(0, effectivePrev - currentCount) : 0;

  return { currentCount, countIncreased, boostDelta, effectivePrev, guildBoostDecreased, boostDrop };
}

async function auditShowsRecentPremiumSinceChangeForMember(guild, memberId, maxAgeMs = 15000) {
  if (!guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)) return false;
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 25 }).catch(() => null);
  if (!logs?.entries?.size) return false;
  const now = Date.now();
  const mid = String(memberId || "");
  for (const entry of logs.entries.values()) {
    if (String(entry.targetId || "") !== mid) continue;
    const age = now - entry.createdTimestamp;
    if (age > maxAgeMs || age < 0) continue;
    const changes = entry.changes || [];
    if (changes.some((c) => String(c.key) === "premium_since")) return true;
  }
  return false;
}

async function maybeRevokeDoubleBoosterAfterSlotLoss({ oldMember, newMember, guildId, drop }) {
  const mainId = String(IDs.guilds.main || "");
  const doubleBoosterId = IDs?.roles?.DoubleBooster || null;
  if (!doubleBoosterId || mainId !== String(guildId) || !newMember?.roles?.cache) return;
  if (!newMember.roles.cache.has(doubleBoosterId)) return;
  const newBoostTs = newMember.premiumSinceTimestamp || 0;
  if (!newBoostTs) return;
  const d = Math.max(0, Math.floor(Number(drop || 0)));
  if (d < 1) return;

  const oldBoostTs = oldMember.premiumSinceTimestamp || 0;
  const premiumChanged = (oldBoostTs || 0) !== (newBoostTs || 0);
  let treatAsThisMemberBoostChange = premiumChanged;
  if (!treatAsThisMemberBoostChange) {
    treatAsThisMemberBoostChange = await auditShowsRecentPremiumSinceChangeForMember(newMember.guild, newMember.id);
  }
  if (!treatAsThisMemberBoostChange) return;

  let slots = getAnnouncedBoostSlots(guildId, newMember.id);
  if (slots < 2) slots = 2;
  slots = Math.max(0, slots - d);
  setAnnouncedBoostSlots(guildId, newMember.id, slots);

  if (slots < 2) {
    const me = newMember.guild.members.me;
    const role = newMember.guild.roles.cache.get(doubleBoosterId);
    if (
      me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) &&
      role &&
      role.position < me.roles.highest.position
    ) {
      await newMember.roles.remove(doubleBoosterId).catch(() => { });
    }
  }
  if (slots <= 0) deleteAnnouncedBoostSlots(guildId, newMember.id);
}

function scheduleBoostFollowup(
  boostAnnounceChannel,
  newMember,
  guildId,
  boostKey,
  currentCount,
) {
  if (boostFollowupLocks.get(boostKey)) return;

  boostFollowupLocks.set(boostKey, true);
  const boostFollowupTimer = setTimeout(async () => {
    try {
      const freshGuild = await newMember.guild.fetch().catch(() => null);
      const latestCount = Number(freshGuild?.premiumSubscriptionCount || newMember.guild.premiumSubscriptionCount || 0,);
      const knownCount = Number(boostCountCache.get(guildId) || currentCount);
      const missing = Math.max(0, latestCount - knownCount);

      if (missing > 0) {
        const priorSlots = getAnnouncedBoostSlots(guildId, newMember.id);
        await sendBoostEmbeds(
          boostAnnounceChannel,
          newMember,
          missing,
          latestCount,
          priorSlots,
        );
        await trackBoostSlotsAnnouncedAndMaybeGrantDoubleBooster(newMember, guildId, missing);
        boostAnnounceCache.set(boostKey, latestCount);
        boostCountCache.set(guildId, latestCount);
      }
    } catch {
      global.logger?.error?.("[guildMemberUpdate] boost followup failed");
    } finally {
      boostFollowupLocks.delete(boostKey);
    }
  }, BOOST_FOLLOWUP_DELAY_MS);
  boostFollowupTimer.unref?.();
}

async function handleBoostUpdate(oldMember, newMember) {
  const boostChannelId = IDs.channels.supporters;
  if (!boostChannelId) return;
  const boostAnnounceChannel = newMember.guild.channels.cache.get(boostChannelId) || (await getGuildChannelCached(newMember.guild, boostChannelId));
  if (!boostAnnounceChannel?.isTextBased?.()) return;

  const oldBoostTs = oldMember.premiumSinceTimestamp || 0;
  const newBoostTs = newMember.premiumSinceTimestamp || 0;
  const guildId = newMember.guild.id;
  const boostKey = `${guildId}:${newMember.id}`;
  const mainId = String(IDs.guilds.main || "");
  const doubleBoosterId = IDs?.roles?.DoubleBooster || null;
  if (
    doubleBoosterId &&
    mainId &&
    String(guildId) === mainId &&
    oldBoostTs > 0 &&
    !newBoostTs &&
    newMember.roles.cache.has(doubleBoosterId)
  ) {
    deleteAnnouncedBoostSlots(guildId, newMember.id);
    const me = newMember.guild.members.me;
    const role = newMember.guild.roles.cache.get(doubleBoosterId);
    if (
      me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) &&
      role &&
      role.position < me.roles.highest.position
    ) {
      await newMember.roles.remove(doubleBoosterId).catch(() => { });
    }
  }

  const { currentCount, countIncreased, boostDelta, guildBoostDecreased, boostDrop } = computeBoostDelta(oldMember, newMember, guildId);
  if (guildBoostDecreased && boostDrop > 0) {
    await maybeRevokeDoubleBoosterAfterSlotLoss({ oldMember, newMember, guildId, drop: boostDrop }).catch((err) => {
      global.logger?.warn?.("[guildMemberUpdate] Double Booster partial revoke:", newMember?.id, err?.message || err);
    });
  }

  const alreadyBoostingBefore = oldBoostTs > 0;
  const startedBoostingNow = !alreadyBoostingBefore && newBoostTs > 0;
  const boosterRoleId = IDs?.roles?.ServerBooster || null;
  const boosterRoleAdded = Boolean(
    boosterRoleId &&
    oldMember?.roles?.cache &&
    newMember?.roles?.cache &&
    !oldMember.roles.cache.has(boosterRoleId) &&
    newMember.roles.cache.has(boosterRoleId),
  );
  const premiumSinceChanged =
    alreadyBoostingBefore && newBoostTs > 0 && newBoostTs !== oldBoostTs;
  const realNewBoost = newBoostTs > 0 && countIncreased;
  const shouldAnnounce = Boolean(
    (newBoostTs || boosterRoleAdded) &&
    (startedBoostingNow || realNewBoost || premiumSinceChanged || boosterRoleAdded),
  );
  if (!shouldAnnounce) {
    boostCountCache.set(guildId, currentCount);
    if (newBoostTs > 0 || boosterRoleAdded) {
      scheduleBoostFollowup(
        boostAnnounceChannel,
        newMember,
        guildId,
        boostKey,
        currentCount,
      );
    }
    return;
  }

  const lastAnnouncedCount = boostAnnounceCache.get(boostKey);
  if (countIncreased && lastAnnouncedCount === currentCount) {
    boostCountCache.set(guildId, currentCount);
    return;
  }

  await addPerkRoleIfPossible(newMember);
  const sendTimes = countIncreased ? boostDelta : 1;
  const priorSlots = getAnnouncedBoostSlots(guildId, newMember.id);
  await sendBoostEmbeds(
    boostAnnounceChannel,
    newMember,
    sendTimes,
    currentCount,
    priorSlots,
  );
  await trackBoostSlotsAnnouncedAndMaybeGrantDoubleBooster(newMember, guildId, sendTimes);
  boostAnnounceCache.set(boostKey, currentCount);

  scheduleBoostFollowup(
    boostAnnounceChannel,
    newMember,
    guildId,
    boostKey,
    currentCount,
  );
  boostCountCache.set(guildId, currentCount);
}

async function recoverRecentBoostEmbedsOnStartup(client, opts = {}) {
  if (!isPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  const guildId = String(IDs.guilds.main || "");
  if (!guildId) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };

  const boostChannelId = IDs.channels.supporters;
  if (!boostChannelId) return { ok: false, reason: "no_boost_channel" };
  const boostAnnounceChannel = guild.channels.cache.get(boostChannelId) || (await getGuildChannelCached(guild, boostChannelId));
  if (!boostAnnounceChannel?.isTextBased?.()) return { ok: false, reason: "channel_not_text" };

  const limit = Math.max(1, Math.min(5, Number(opts.limit || 2)));
  const lookbackMs = Math.max(5 * 60 * 1000, Math.min(24 * 60 * 60 * 1000, Number(opts.lookbackMs || 2 * 60 * 60 * 1000)));
  const now = Date.now();
  const fallbackMemberScan = opts?.fallbackMemberScan !== false;
  const fallbackChannelScan = opts?.fallbackChannelScan !== false;
  const debugEnabled =
    opts?.debug === true || String(process.env.BOOST_RECOVERY_DEBUG || "").trim() === "1";

  const me = guild.members?.me || null;
  const perms = me && boostAnnounceChannel?.permissionsFor ? boostAnnounceChannel.permissionsFor(me) : null;
  const canViewChannel = Boolean(perms?.has?.(PermissionsBitField.Flags.ViewChannel));
  const canReadHistory = Boolean(perms?.has?.(PermissionsBitField.Flags.ReadMessageHistory));
  const canSend = Boolean(perms?.has?.(PermissionsBitField.Flags.SendMessages));

  let candidates = [];
  const canReadAudit = Boolean(
    guild.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog),
  );
  let auditCandidates = 0;
  let memberCandidates = 0;
  let channelCandidates = 0;
  let channelFetchOk = null;
  let memberFetchOk = null;
  let candidateCounts = null;
  if (canReadAudit) {
    const audits = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 50 }).catch(() => null);
    const entries = audits?.entries ? Array.from(audits.entries.values()) : [];
    for (const entry of entries) {
      const createdMs = Number(entry?.createdTimestamp || 0);
      if (!createdMs || now - createdMs > lookbackMs) continue;
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      const hasPremiumSinceChange = changes.some((c) => String(c?.key || "").toLowerCase() === "premium_since");
      if (!hasPremiumSinceChange) continue;
      const targetId = String(entry?.target?.id || "");
      if (!targetId) continue;
      candidates.push({ targetId, createdMs });
    }
    auditCandidates = candidates.length;
  }

  if (!candidates.length && fallbackMemberScan) {
    const members = await guild.members.fetch().catch(() => null);
    memberFetchOk = Boolean(members);
    const rows = members ? Array.from(members.values()) : [];
    const minTs = now - lookbackMs;
    const fromMembers = [];
    for (const member of rows) {
      const ts = Number(member?.premiumSinceTimestamp || 0);
      if (!ts || ts < minTs) continue;
      fromMembers.push({ targetId: String(member.id), createdMs: ts });
    }
    candidates = fromMembers;
    memberCandidates = candidates.length;
  }

  if (!candidates.length && fallbackChannelScan) {
    const recentBoostMessages = await boostAnnounceChannel.messages.fetch({ limit: 80 }).catch(() => null);
    channelFetchOk = Boolean(recentBoostMessages);
    const recent = recentBoostMessages ? Array.from(recentBoostMessages.values()) : [];
    const minTs = now - lookbackMs;
    const boostTypes = new Set(
      [
        MessageType?.UserPremiumGuildSubscription,
        MessageType?.UserPremiumGuildSubscriptionTier1,
        MessageType?.UserPremiumGuildSubscriptionTier2,
        MessageType?.UserPremiumGuildSubscriptionTier3,
        8,
      ].filter((x) => typeof x === "number"),
    );
    const boostTextRe = /(ha\s+appena\s+potenziato\s+il\s+server|just\s+boosted\s+the\s+server)/i;
    const typeCounts = {};
    const samples = [];
    const fromChannel = [];
    for (const m of recent) {
      if (!m?.author?.id) continue;
      const createdMs = Number(m.createdTimestamp || 0);
      if (!createdMs || createdMs < minTs) continue;
      const t = Number(m.type);
      typeCounts[String(Number.isFinite(t) ? t : "NaN")] = Number(typeCounts[String(t)] || 0) + 1;
      if (samples.length < 6) {
        samples.push({
          id: String(m.id || ""),
          type: Number.isFinite(t) ? t : null,
          system: Boolean(m.system),
          authorId: String(m.author?.id || ""),
          contentLen: Number(String(m.content || "").length),
          hasEmbeds: Array.isArray(m.embeds) && m.embeds.length > 0,
          createdTimestamp: createdMs,
        });
      }
      const isBoostType = boostTypes.has(Number(m.type));
      const isBoostText = boostTextRe.test(String(m.content || ""));
      if (!isBoostType && !isBoostText) continue;
      fromChannel.push({ targetId: String(m.author.id), createdMs });
    }
    candidates = fromChannel;
    channelCandidates = candidates.length;
    if (candidates.length) {
      candidateCounts = candidates.reduce((acc, c) => {
        const id = String(c?.targetId || "");
        if (!id) return acc;
        acc[id] = Number(acc[id] || 0) + 1;
        return acc;
      }, {});
    }
    if (debugEnabled) {
      global.logger?.info?.("[BOOST RECOVERY DEBUG] channel scan:", {
        boostTypes: Array.from(boostTypes.values()),
        typeCounts,
        samples,
      });
    }
  }

  const counts = candidateCounts || candidates.reduce((acc, c) => {
    const id = String(c?.targetId || "");
    if (!id) return acc;
    acc[id] = Number(acc[id] || 0) + 1;
    return acc;
  }, {});
  const orderedUserIds = Object.entries(counts)
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, limit)
    .map(([id]) => id);

  if (!orderedUserIds.length) {
    const debug = {
      canReadAudit,
      auditCandidates,
      memberFetchOk,
      memberCandidates,
      channelFetchOk,
      channelCandidates,
      canViewChannel,
      canReadHistory,
      canSend,
      lookbackMs,
      limit,
    };
    if (debugEnabled) global.logger?.info?.("[BOOST RECOVERY DEBUG] no candidates:", debug);
    return { ok: true, recovered: 0, debug };
  }

  const recentMessages = await boostAnnounceChannel.messages.fetch({ limit: 80 }).catch(() => null);
  const recent = recentMessages ? Array.from(recentMessages.values()) : [];
  const countAlreadyAnnounced = (userId) => {
    const needle = `<@${String(userId)}>`;
    let n = 0;
    for (const m of recent) {
      if (!m) return false;
      if (String(m.author?.id || "") !== String(client.user?.id || "")) return false;
      const embeds = Array.isArray(m.embeds) ? m.embeds : [];
      const embedTexts = embeds.map((e) =>
        [e?.title || "", e?.description || "", e?.footer?.text || ""].join("\n"),
      );
      const text = [m.content || "", ...embedTexts].join("\n");
      if (!text.includes(needle)) continue;
      const looksLikeBoost = (
        /grazie\s+per\s+il\s+boost/i.test(text) ||
        /ora\s+siamo\s+a\s+\d+\s+boost/i.test(text)
      );
      if (looksLikeBoost) n += 1;
    }
    return n;
  };

  const freshGuild = await guild.fetch().catch(() => null);
  const currentCount = Number(freshGuild?.premiumSubscriptionCount || guild.premiumSubscriptionCount || 0);
  boostCountCache.set(guild.id, currentCount);

  let recovered = 0;
  for (const targetId of orderedUserIds) {
    const want = Math.max(1, Number(counts[String(targetId)] || 1));
    const already = countAlreadyAnnounced(targetId);
    const missing = Math.max(0, want - already);
    if (missing <= 0) continue;

    const member = await getGuildMemberCached(guild, targetId, { preferFresh: true }).catch(() => null);
    const user = member?.user || (await client.users.fetch(String(targetId)).catch(() => null));
    if (!user) continue;
    if (member && !Number(member.premiumSinceTimestamp || 0)) continue;

    if (member) await addPerkRoleIfPossible(member).catch(() => { });
    const priorSlots = getAnnouncedBoostSlots(guild.id, targetId);
    await sendBoostEmbeds(boostAnnounceChannel, { user, guild }, missing, currentCount, priorSlots).catch(() => { });
    if (member) await trackBoostSlotsAnnouncedAndMaybeGrantDoubleBooster(member, guild.id, missing);

    const boostKey = `${guild.id}:${String(targetId)}`;
    boostAnnounceCache.set(boostKey, currentCount);
    recovered += missing;

    if (member) {
      scheduleBoostFollowup(boostAnnounceChannel, member, guild.id, boostKey, currentCount);
    }
    await sleep(900);
  }

  const debug = debugEnabled ? {
    canReadAudit,
    auditCandidates,
    memberFetchOk,
    memberCandidates,
    channelFetchOk,
    channelCandidates,
    canViewChannel,
    canReadHistory,
    canSend,
    lookbackMs,
    limit,
  } : undefined;
  if (debugEnabled) global.logger?.info?.("[BOOST RECOVERY DEBUG] done:", { recovered, debug });
  return { ok: true, recovered, debug };
}

async function ensureCustomVocAccess(newMember) {
  const guild = newMember?.guild;
  if (!guild || !newMember?.id) return;
  const me = guild.members?.me;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels)) return;

  const doc = await CustomRole.findOne({ guildId: String(guild.id), userId: String(newMember.id) })
    .lean()
    .catch(() => null);
  const channelId = String(doc?.customVocChannelId || "");
  const roleId = String(doc?.roleId || "");
  if (!channelId || !roleId) return;

  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel || channel.type !== 2) return; // GuildVoice

  await channel.permissionOverwrites
    .edit(guild.roles.everyone.id, {
      ViewChannel: false,
      Connect: false,
      Speak: false,
    })
    .catch(() => { });
  await channel.permissionOverwrites
    .edit(roleId, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
    })
    .catch(() => { });
  await channel.permissionOverwrites
    .edit(me.id, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      ManageChannels: true,
      MoveMembers: true,
    })
    .catch(() => { });
}

async function syncCustomVocEligibilityWindow(newMember) {
  const guild = newMember?.guild;
  if (!guild || !newMember?.id) return;
  const guildId = String(guild.id);
  const userId = String(newMember.id);

  const doc = await CustomRole.findOne({ guildId, userId }).lean().catch(() => null);
  if (!doc?.customVocChannelId) return;

  const hasRequiredRole = CUSTOM_ROLE_VOC_ELIGIBLE_ROLE_IDS.some((roleId) => newMember.roles.cache.has(roleId));
  const hasEventWeek2Grant = await hasEventWeekWinnerGrant(guildId, userId, 2).catch(() => false);
  const hasEventWeek3Grant = await hasEventWeekWinnerGrant(guildId, userId, 3).catch(() => false);
  const hasContestExtraUnlock = await hasExtraCustomPerksUnlock(guildId, userId).catch(() => false);
  const eligible = hasRequiredRole || hasEventWeek2Grant || hasEventWeek3Grant || hasContestExtraUnlock;

  if (eligible) {
    if (doc.customVocEligibilityLostAt) {
      await CustomRole.updateOne(
        { guildId, userId },
        { $set: { customVocEligibilityLostAt: null } },
      ).catch(() => { });
    }
    return;
  }

  if (!doc.customVocEligibilityLostAt) {
    await CustomRole.updateOne(
      { guildId, userId },
      { $set: { customVocEligibilityLostAt: new Date() } },
    ).catch(() => { });
  }
}

async function syncCustomRoleEligibilityWindow(newMember) {
  const guild = newMember?.guild;
  if (!guild || !newMember?.id) return;
  const guildId = String(guild.id);
  const userId = String(newMember.id);

  const doc = await CustomRole.findOne({ guildId, userId }).lean().catch(() => null);
  if (!doc?.roleId && !doc?.secondaryRoleId) return;

  const hasRequiredRole = CUSTOM_ROLE_VOC_ELIGIBLE_ROLE_IDS.some((roleId) => newMember.roles.cache.has(roleId));
  const hasEventWeek2Grant = await hasEventWeekWinnerGrant(guildId, userId, 2).catch(() => false);
  const hasEventWeek3Grant = await hasEventWeekWinnerGrant(guildId, userId, 3).catch(() => false);
  const hasContestExtraUnlock = await hasExtraCustomPerksUnlock(guildId, userId).catch(() => false);
  const eligible = hasRequiredRole || hasEventWeek2Grant || hasEventWeek3Grant || hasContestExtraUnlock;

  if (eligible) {
    if (doc.customRoleEligibilityLostAt) {
      await CustomRole.updateOne(
        { guildId, userId },
        { $set: { customRoleEligibilityLostAt: null } },
      ).catch(() => { });
    }
    return;
  }

  if (!doc.customRoleEligibilityLostAt) {
    await CustomRole.updateOne(
      { guildId, userId },
      { $set: { customRoleEligibilityLostAt: new Date() } },
    ).catch(() => { });
  }
}

module.exports = {
  name: "guildMemberUpdate",
  async execute(oldMember, newMember, client) {
    try {
      if (!oldMember || !newMember?.guild || !newMember?.user) return;
      if (String(newMember.guild.id) === String(IDs.guilds?.main || "")) {
        const canAnnNow = await shouldSendPublicMemberAnnouncement(newMember);
        const couldAnnBefore = await shouldSendPublicMemberAnnouncement(oldMember);
        if (canAnnNow && !couldAnnBefore) {
          await runDeferredJoinAnnouncements(newMember).catch((err) => {
            global.logger?.warn?.("[guildMemberUpdate] deferred join announce:", newMember.guild.id, newMember.id, err?.message || err);
          });
        }
      }
      await syncPartnerPmThreadForMemberChange(oldMember, newMember).catch(() => { });
      await sponsorVerifiedRequiresMain
        .handleGuildMemberUpdate(oldMember, newMember, client)
        .catch((err) => {
          global.logger?.warn?.("[guildMemberUpdate] sponsorVerifiedRequiresMain:", err?.message || err);
        });
      await sendMemberUpdateLog(oldMember, newMember);
      await sendMemberRoleUpdateLog(oldMember, newMember);
      await enforceJoinGatePostJoinUsername(oldMember, newMember);
      const resolvedClientForClan = client || newMember.client;
      if (resolvedClientForClan) {
        await syncClanTagRolesForUserEverywhereAfterMemberEvent(resolvedClientForClan, newMember.user);
      }

      const botClient = client || newMember.client;
      if (newMember?.guild?.id === IDs.guilds.main && botClient) {
        const stafferDelMeseId = String(IDs.roles?.StafferDelMese || "").trim();
        if (
          stafferDelMeseId &&
          !oldMember.roles.cache.has(stafferDelMeseId) &&
          newMember.roles.cache.has(stafferDelMeseId)
        ) {
          await grantBestStaffPauseBonusYear(newMember.guild.id, newMember.id).catch((err) => {
            global.logger?.warn?.("[guildMemberUpdate] bestStaffPauseBonusYear:", newMember.id, err?.message || err);
          });
        }
        if (didStaffMembershipChange(oldMember, newMember) || didStaffRolesChange(oldMember, newMember)) {
          scheduleStaffListRefresh(botClient, newMember.guild.id);
          if (!memberHasStaffRole(oldMember) && memberHasStaffRole(newMember)) {
            setWelcomeContextActive(newMember.guild.id, client);
          }
          if (memberHasAnyStaffPresenceForDepexSync(oldMember) && !memberHasAnyStaffPresenceForDepexSync(newMember)) {
            await deleteStaffPauseRequestChannelMessages(newMember.guild, newMember.id);
            await deleteStaffRelatedMessagesFromConfiguredChannels(newMember.guild, newMember.id).catch((err) => {
              global.logger?.warn?.("[guildMemberUpdate] staff channels scan delete:", newMember.id, err?.message || err);
            });
            await ActivityUserProfile.updateOne(
              { guildId: newMember.guild.id, userId: newMember.id, staff: { $exists: true } },
              { $unset: { staff: "" } },
            ).catch(() => { });
            await autoUnclaimOpenTicketsClaimedByUser(newMember.guild, newMember.id).catch((err) => {
              global.logger?.warn?.("[guildMemberUpdate] ticket auto-unclaim on depex:", newMember.id, err?.message || err);
            });
          }
          if (memberHasStaffRole(newMember) && !memberHasPartnerManagerRole(newMember)) {
            await ActivityUserProfile.updateOne(
              { guildId: newMember.guild.id, userId: newMember.id },
              buildStaffPartnerManagerIdUnsetUpdate(),
            ).catch(() => { });
          }
        }
      }

      await removePlusColorsIfNotEligible(newMember);
      await ensureCustomVocAccess(newMember);
      await syncCustomVocEligibilityWindow(newMember);
      await syncCustomRoleEligibilityWindow(newMember);
      await handleBoostUpdate(oldMember, newMember);
      await maybeAnnounceDonationPackageInSupporters(oldMember, newMember);
    } catch (error) {
      global.logger?.error?.("[guildMemberUpdate] failed:", error);
    }
  },
};