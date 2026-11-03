const { shouldSendPublicMemberAnnouncement } = require("../../Community/utils/memberPublicAnnouncementGate") as typeof import("../../Community/utils/memberPublicAnnouncementGate");
const { ROLE_ID, isBotMember, computeSupporterLinkState } = require("./presenceSupporterInviteState") as typeof import("./presenceSupporterInviteState");
const {
  getCachedState,
  setCachedState,
  hasPendingState,
  clearPending,
  resolveSupportersChannel,
  persistStatus,
} = require("./presenceSupporterStateCache") as typeof import("./presenceSupporterStateCache");
const { addPerkRoleIfPossible, hasFanRole } = require("./presenceSupporterRoles") as typeof import("./presenceSupporterRoles");
const { clearRemovalDue, scheduleRemovalConfirm } = require("./presenceSupporterRemoval") as typeof import("./presenceSupporterRemoval");
const { ANNOUNCE_COOLDOWN_MS, startPendingFlow, scheduleSupporterRoleGrantWithoutChannelEmbed } = require("./presenceSupporterPending") as typeof import("./presenceSupporterPending");

async function applyOnlineState(member?, userId?, prev?, prevHas?, presenceFresh?) {
  if (!member || isBotMember(member)) return;
  const guildId = member.guild.id;
  const presence = presenceFresh || member.presence;
  const effectivePrev = prev != null ? prev : { hasLink: Boolean(prevHas) };
    const linkPrev = {
    ...effectivePrev,
    hasLink:
      Boolean(effectivePrev?.hasLink) ||
      Boolean(prevHas) ||
      Boolean(member.roles?.cache?.has(ROLE_ID)),
  };
  const { newHas, inviteMissSince } = computeSupporterLinkState(linkPrev, presence);
  const lastSeenOnlineAt = Date.now();

  if (newHas) {
    await clearRemovalDue(guildId, userId);
  }

  if (newHas && member.roles.cache.has(ROLE_ID)) {
    setCachedState(guildId, userId, { hasLink: true, lastAnnounced: prev?.lastAnnounced || 0, lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt, inviteMissSince: null });
    await persistStatus(guildId, userId, { hasLink: true, lastMessageId: prev?.lastMessageId || null });
    await addPerkRoleIfPossible(member);
    return;
  }

  if (newHas && (await hasFanRole(member))) {
    setCachedState(guildId, userId, { hasLink: true, lastAnnounced: prev?.lastAnnounced || 0, lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt, inviteMissSince: null });
    await persistStatus(guildId, userId, { hasLink: true, lastMessageId: prev?.lastMessageId || null });
    await addPerkRoleIfPossible(member);
    return;
  }

  if (!prevHas && newHas) {
    if (hasPendingState(guildId, userId)) return;
    if (prev?.lastMessageId) return;
    if (prev?.lastAnnounced && Date.now() - prev.lastAnnounced < ANNOUNCE_COOLDOWN_MS) {
      return;
    }

    if (await hasFanRole(member)) {
      setCachedState(guildId, userId, { hasLink: true, lastAnnounced: prev?.lastAnnounced || 0, lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt, inviteMissSince: null });
      await persistStatus(guildId, userId, { hasLink: true, lastMessageId: prev?.lastMessageId || null });
      await addPerkRoleIfPossible(member);
      return;
    }

    setCachedState(guildId, userId, { hasLink: true, lastAnnounced: Date.now(), lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt, inviteMissSince: null });

    const channel = await resolveSupportersChannel(member.guild);
    if (!channel) return;
    if (await shouldSendPublicMemberAnnouncement(member)) {
      await startPendingFlow(member, channel);
    } else {
      await scheduleSupporterRoleGrantWithoutChannelEmbed(member);
    }
    await addPerkRoleIfPossible(member);
    return;
  }

  if (prevHas && !newHas) {
    const channel = await resolveSupportersChannel(member.guild);
    await clearPending(guildId, userId, channel);

    setCachedState(guildId, userId, { hasLink: false, lastAnnounced: prev?.lastAnnounced || 0, lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt, inviteMissSince: null });
    await persistStatus(guildId, userId, { hasLink: false, lastMessageId: prev?.lastMessageId || null });
    scheduleRemovalConfirm(member, channel);
    return;
  }

    if (!newHas && (member.roles.cache.has(ROLE_ID) || (await hasFanRole(member)))) {
    const channel = await resolveSupportersChannel(member.guild);
    await clearPending(guildId, userId, channel);
    setCachedState(guildId, userId, {
      hasLink: false,
      lastAnnounced: prev?.lastAnnounced || 0,
      lastMessageId: prev?.lastMessageId || null,
      lastSeenOnlineAt,
      inviteMissSince: inviteMissSince != null ? inviteMissSince : Date.now(),
    });
    await persistStatus(guildId, userId, { hasLink: false, lastMessageId: prev?.lastMessageId || null });
    scheduleRemovalConfirm(member, channel);
    return;
  }

  setCachedState(guildId, userId, { hasLink: newHas, lastAnnounced: prev?.lastAnnounced || 0, lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt, inviteMissSince: inviteMissSince != null ? inviteMissSince : null });
  await persistStatus(guildId, userId, { hasLink: newHas, lastMessageId: prev?.lastMessageId || null });
}

export = { applyOnlineState };
