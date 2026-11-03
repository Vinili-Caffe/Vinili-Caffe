const { isBotMember, isOfflinePresence, readInvitePresence } = require("./presenceSupporterInviteState") as typeof import("./presenceSupporterInviteState");
const {
  REMOVE_CONFIRM_MS,
  isDbReady,
  getCachedState,
  setCachedState,
  getRemovalState,
  setRemovalState,
  deleteRemovalState,
  hasRemovalState,
  cancelScheduledRemoval,
  resolveSupportersChannel,
  refreshMember,
  persistStatus,
  clearPersistedStatus,
} = require("./presenceSupporterStateCache") as typeof import("./presenceSupporterStateCache");
const { removeRoleIfPossible, hasFanRole } = require("./presenceSupporterRoles") as typeof import("./presenceSupporterRoles");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");

function isExpectedSupporterDmFailure(err?) {
  const code = Number(err?.code);
  const msg = String(err?.message || err || "").toLowerCase();
  if (code === 50007) return true;
  if (msg.includes("cannot send messages to this user")) return true;
  if (msg.includes("no mutual guilds")) return true;
  return false;
}

async function clearRemovalDue(guildId?, userId?) {
  cancelScheduledRemoval(guildId, userId);
  const info = getCachedState(guildId, userId);
  if (info && info.removalDueAt != null) {
    setCachedState(guildId, userId, { ...info, removalDueAt: null });
  }
  if (!isDbReady()) return;
  await ActivityUserProfile.updateOne(
    { guildId, userId },
    { $set: { "profile.supporterStatus.removalDueAt": null } },
  ).catch(() => null);
}

async function ensureRemovalDueAt(guildId?, userId?, existingDueAt = null) {
  const fromCache = getCachedState(guildId, userId)?.removalDueAt;
  let dueAt = Number(existingDueAt || fromCache || 0) || 0;
  if (dueAt > 0) return dueAt;
  dueAt = Date.now() + REMOVE_CONFIRM_MS;
  const info = getCachedState(guildId, userId) || {};
  setCachedState(guildId, userId, { ...info, hasLink: false, removalDueAt: dueAt });
  await persistStatus(guildId, userId, {
    hasLink: false,
    lastMessageId: info.lastMessageId || null,
    removalDueAt: dueAt,
  });
  return dueAt;
}

async function executeFanRemoval(member?, channel?) {
  if (!member || isBotMember(member)) return false;
  const guildId = member.guild.id;
  const userId = member.id;
  cancelScheduledRemoval(guildId, userId);

  const liveChannel = channel?.isTextBased?.() ? channel : await resolveSupportersChannel(member.guild);
  const cached = getCachedState(guildId, userId);
    if (!isOfflinePresence(member.presence)) {
    const inviteState = readInvitePresence(member.presence, true);
    if (inviteState === true) {
      const info = cached || {};
      setCachedState(guildId, userId, {
        hasLink: true,
        lastAnnounced: info.lastAnnounced || 0,
        lastMessageId: info.lastMessageId || null,
        lastSeenOnlineAt: info.lastSeenOnlineAt || Date.now(),
        inviteMissSince: null,
        removalDueAt: null,
      });
      await clearRemovalDue(guildId, userId);
      await persistStatus(guildId, userId, { hasLink: true, lastMessageId: info.lastMessageId || null });
      return false;
    }
    if (inviteState === null) {
            const dueAt = Date.now() + REMOVE_CONFIRM_MS;
      const info = cached || getCachedState(guildId, userId) || {};
      setCachedState(guildId, userId, {
        ...info,
        hasLink: true,
        inviteMissSince: null,
        removalDueAt: dueAt,
      });
      await persistStatus(guildId, userId, {
        hasLink: true,
        lastMessageId: info.lastMessageId || null,
        removalDueAt: dueAt,
      });
      scheduleRemovalConfirm(member, liveChannel, { forceReschedule: true, removalDueAt: dueAt });
      return false;
    }
  }

  const removed = await removeRoleIfPossible(member);
  if (!removed && !(await hasFanRole(member))) {
      } else if (!removed) {
    return false;
  }

  try {
    const { tryRevokePicPermsIfIneligible } = require("../../Community/utils/manualSocialRoleAnnounceAndPicPerms") as typeof import("../../Community/utils/manualSocialRoleAnnounceAndPicPerms");
    const freshAfterFan = (await refreshMember(member.guild, member.id)) || member;
    await tryRevokePicPermsIfIneligible(freshAfterFan);
  } catch (err) {
    global.logger?.warn?.("[presenceUpdate] picPerms revoke after fan removal:", err?.message || err);
  }

  try {
    await member.send(
      "Hai rimosso il link dallo status: hai perso i tuoi perks. Per riaverli, rimetti il link nel tuo status.",
    );
  } catch (err) {
    if (!isExpectedSupporterDmFailure(err)) {
      global.logger?.warn?.("[presenceUpdate] dm send:", err?.message || err);
    }
  }
  const info = cached || getCachedState(guildId, userId);
  if (info?.lastMessageId && liveChannel?.isTextBased?.()) {
    await liveChannel.messages.delete(info.lastMessageId).catch(() => { });
  }
  setCachedState(guildId, userId, {
    hasLink: false,
    lastAnnounced: info?.lastAnnounced || 0,
    lastMessageId: null,
    lastSeenOnlineAt: info?.lastSeenOnlineAt || 0,
    inviteMissSince: null,
    removalDueAt: null,
  });
  await clearPersistedStatus(guildId, userId);
  return true;
}

function scheduleRemovalConfirm(member?, channel?, opts: Record<string, any> = {}) {
  const guildId = member.guild.id;
  const userId = member.id;
  if (hasRemovalState(guildId, userId) && !opts.forceReschedule) return;

  void (async () => {
    const dueAt = await ensureRemovalDueAt(guildId, userId, opts.removalDueAt);
    const waitMs = Math.max(0, dueAt - Date.now());

    if (hasRemovalState(guildId, userId) && !opts.forceReschedule) return;

    const run = async () => {
      deleteRemovalState(guildId, userId);
      const freshMember = await refreshMember(member.guild, userId);
      if (!freshMember) return;
      await executeFanRemoval(freshMember, channel);
    };

        if (waitMs <= 0) {
      await run();
      return;
    }

    const timeout = setTimeout(() => {
      void run();
    }, waitMs);
    timeout.unref?.();
    setRemovalState(guildId, userId, { timeout, dueAt });
  })();
}

export = {
  clearRemovalDue,
  ensureRemovalDueAt,
  executeFanRemoval,
  scheduleRemovalConfirm,
};
