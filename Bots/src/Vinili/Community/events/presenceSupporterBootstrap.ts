const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { shouldSendPublicMemberAnnouncement } = require("../../Community/utils/memberPublicAnnouncementGate") as typeof import("../../Community/utils/memberPublicAnnouncementGate");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const {
  MAIN_GUILD_ID,
  ROLE_ID,
  isBotMember,
  hasInvite,
  isOfflinePresence,
  readInvitePresence,
  computeSupporterLinkState,
} = require("./presenceSupporterInviteState") as typeof import("./presenceSupporterInviteState");
const {
  statusCache,
  isDbReady,
  makeStateKey,
  getCachedState,
  setCachedState,
  hasPendingState,
  clearPending,
  resolveSupportersChannel,
} = require("./presenceSupporterStateCache") as typeof import("./presenceSupporterStateCache");
const { executeFanRemoval, scheduleRemovalConfirm, clearRemovalDue } = require("./presenceSupporterRemoval") as typeof import("./presenceSupporterRemoval");
const { startPendingFlow, scheduleSupporterRoleGrantWithoutChannelEmbed } = require("./presenceSupporterPending") as typeof import("./presenceSupporterPending");

const bootstrappedUsers = new Set();
const CLEANUP_MS = 60 * 1000;
const LINK_WARMUP_MS = 2 * 60 * 1000;
let bootstrapRan = false;
const cleanupIntervalsByGuild = new Map();

function isGatewayPresenceSweepEnabled() {
  const raw = String(process.env.PRESENCE_SUPPORTER_SWEEP_ON_GATEWAY ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

function getBootstrapKey(guildId?, userId?) {
  return makeStateKey(guildId, userId);
}

function recentlyOnline(info?) {
  if (!info?.lastSeenOnlineAt) return false;
  return Date.now() - info.lastSeenOnlineAt < LINK_WARMUP_MS;
}

async function recoverSupporterStatusAnnouncesOnStartup(client?, opts: Record<string, any> = {}) {
  const { isRecoveryPrimaryShard, recoverySleep } = require("../../Community/utils/supportersChannelEmbedRecoveryUtils") as typeof import("../../Community/utils/supportersChannelEmbedRecoveryUtils");
  if (!isRecoveryPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  if (!MAIN_GUILD_ID) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  const channel = await resolveSupportersChannel(guild);
  if (!channel?.isTextBased?.()) return { ok: false, reason: "no_channel" };
  const limit = Math.max(1, Math.min(30, Number(opts.limit || 15)));
  const botId = String(client.user?.id || "");
  let docs = [];
  if (isDbReady()) {
    docs = await ActivityUserProfile.find({
      guildId: MAIN_GUILD_ID,
      "profile.supporterStatus.hasLink": true,
    })
      .select("userId profile.supporterStatus")
      .limit(250)
      .lean()
      .catch(() => []);
  }
  let recovered = 0;
  for (const doc of docs) {
    if (recovered >= limit) break;
    const uid = String(doc?.userId || "");
    if (!uid) continue;
    const lastMessageId = doc?.profile?.supporterStatus?.lastMessageId || null;
    let needsRecovery = !lastMessageId;
    if (lastMessageId) {
      try {
        const msg = await channel.messages.fetch(lastMessageId);
        if (!msg || String(msg.author?.id) !== botId) needsRecovery = true;
      } catch {
        needsRecovery = true;
      }
    }
    if (!needsRecovery) continue;
    const { botSupportersEmbedExistsForUser, EMBED_DEDUPE_LOOKBACK_MS } = require("../../Community/utils/supportersChannelEmbedRecoveryUtils") as typeof import("../../Community/utils/supportersChannelEmbedRecoveryUtils");
    const fanEmbedExists = await botSupportersEmbedExistsForUser(
      channel,
      uid,
      botId,
      Date.now() - EMBED_DEDUPE_LOOKBACK_MS,
      (blob?) => /Nuov\w* Fan/i.test(blob),
    );
    if (fanEmbedExists) {
      setCachedState(guild.id, uid, {
        hasLink: true,
        lastAnnounced: doc?.profile?.supporterStatus?.lastSentAt ? new Date(doc.profile.supporterStatus.lastSentAt).getTime() : Date.now(),
        lastMessageId: lastMessageId || null,
        lastSeenOnlineAt: Date.now(),
        inviteMissSince: null,
      });
      continue;
    }
    const member = await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
    if (!member || isBotMember(member)) continue;
    if (isOfflinePresence(member.presence)) continue;
    if (!hasInvite(member.presence)) continue;
    if (hasPendingState(guild.id, uid)) continue;
    setCachedState(guild.id, uid, {
      hasLink: true,
      lastAnnounced: doc?.profile?.supporterStatus?.lastSentAt ? new Date(doc.profile.supporterStatus.lastSentAt).getTime() : 0,
      lastMessageId: needsRecovery && lastMessageId ? null : lastMessageId,
      lastSeenOnlineAt: Date.now(),
      inviteMissSince: null,
    });
    if (await shouldSendPublicMemberAnnouncement(member)) {
      await startPendingFlow(member, channel);
      recovered += 1;
      global.logger?.info?.("[supporter-status-recovery] pending flow:", uid);
      await recoverySleep(450);
    } else {
      await scheduleSupporterRoleGrantWithoutChannelEmbed(member);
    }
  }
  if (recovered > 0) global.logger?.info?.("[supporter-status-recovery] done:", recovered);
  return { ok: true, recovered };
}

async function bootstrapSupporter(client?) {
  if (bootstrapRan) return;
  bootstrapRan = true;
  if (!MAIN_GUILD_ID) return;
  const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return;

  const guildId = guild.id;
  const channel = await resolveSupportersChannel(guild);
  if (!channel) return;

  let persisted = [];
  if (isDbReady()) {
    try {
      persisted = await ActivityUserProfile.find({
        guildId,
        $or: [
          { "profile.supporterStatus.hasLink": true },
          { "profile.supporterStatus.lastMessageId": { $ne: null } },
          { "profile.supporterStatus.removalDueAt": { $ne: null } },
        ],
      })
        .select("userId profile.supporterStatus")
        .lean();
    } catch {
      persisted = [];
    }
  }

  for (const doc of persisted) {
    if (!doc?.userId) continue;
    const userId = String(doc.userId);
    bootstrappedUsers.add(getBootstrapKey(guildId, userId));
    const dueRaw = doc?.profile?.supporterStatus?.removalDueAt;
    const dueMs = dueRaw ? new Date(dueRaw).getTime() : 0;
    setCachedState(guildId, userId, {
      hasLink: Boolean(doc?.profile?.supporterStatus?.hasLink),
      lastAnnounced: doc?.profile?.supporterStatus?.lastSentAt ? new Date(doc.profile.supporterStatus.lastSentAt).getTime() : 0,
      lastMessageId: doc?.profile?.supporterStatus?.lastMessageId || null,
      lastSeenOnlineAt: 0,
      removalDueAt: Number.isFinite(dueMs) && dueMs > 0 ? dueMs : null,
    });
  }

  const hydrateUserIds = new Set<string>();
  for (const doc of persisted) {
    if (doc?.userId) hydrateUserIds.add(String(doc.userId));
  }
  if (ROLE_ID) {
    const fanRole =
      guild.roles.cache.get(ROLE_ID) || (await guild.roles.fetch(ROLE_ID).catch(() => null));
    for (const member of fanRole?.members?.values() || []) {
      if (member?.id) hydrateUserIds.add(String(member.id));
    }
  }

  const idList = [...hydrateUserIds];
  if (idList.length) {
    /* Targeted hydrate: Fan + DB-flagged users only (full guild fetch is fallback). */
    for (let i = 0; i < idList.length; i += 100) {
      const chunk = idList.slice(i, i + 100);
      await guild.members.fetch({ user: chunk, withPresences: true }).catch(() => null);
    }
  } else {
    /* Fallback when no Fan/DB targets — prefer community-poll/bot-scheduler worker sweep. */
    await guild.members.fetch({ withPresences: true }).catch(() => null);
  }

  for (const userId of hydrateUserIds) {
    const freshMember = guild.members.cache.get(userId);
    if (!freshMember || isBotMember(freshMember)) continue;

    const online = !isOfflinePresence(freshMember.presence);
    const inviteState = readInvitePresence(freshMember.presence, true);
    const inviteOk = inviteState === true;
    const inviteMissing = inviteState === false;
    const hasFan = freshMember.roles.cache.has(ROLE_ID);
    const existing = getCachedState(guildId, freshMember.id) || {};
    const dueAt = Number(existing.removalDueAt || 0) || 0;

    if (hasFan && dueAt > 0 && dueAt <= Date.now() && !(online && !inviteMissing)) {
      await executeFanRemoval(freshMember, channel);
      continue;
    }

    if (online && hasFan && inviteMissing) {
      setCachedState(guildId, freshMember.id, {
        hasLink: false,
        lastAnnounced: existing.lastAnnounced || 0,
        lastMessageId: existing.lastMessageId || null,
        lastSeenOnlineAt: existing.lastSeenOnlineAt || Date.now(),
        inviteMissSince: existing.inviteMissSince != null ? existing.inviteMissSince : Date.now(),
        removalDueAt: existing.removalDueAt || null,
      });
      if (!hasPendingState(guildId, freshMember.id)) {
        scheduleRemovalConfirm(freshMember, channel, { removalDueAt: existing.removalDueAt || null });
      }
      continue;
    }

    if (online && inviteOk) {
      await clearRemovalDue(guildId, freshMember.id);
    }

    if (!online || !inviteOk) continue;

    if (hasFan) continue;
    if (hasPendingState(guildId, freshMember.id)) continue;

    if (existing?.lastMessageId) continue;

    if (await shouldSendPublicMemberAnnouncement(freshMember)) {
      await startPendingFlow(freshMember, channel);
    } else {
      await scheduleSupporterRoleGrantWithoutChannelEmbed(freshMember);
    }
  }
  if (isGatewayPresenceSweepEnabled()) {
    startCleanupClock(client, guildId);
  }
}

async function runPresenceSupporterSweep(client?, guildId?) {
  const gid = String(guildId || MAIN_GUILD_ID || "");
  if (!client || !gid) return;
  const guild = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
  if (!guild) return;
  const channel = await resolveSupportersChannel(guild);

  if (ROLE_ID) {
    for (const member of guild.members.cache.values()) {
      if (isBotMember(member)) continue;
      if (!member.roles?.cache?.has(ROLE_ID)) continue;
      if (hasPendingState(gid, member.id)) continue;

      const online = !isOfflinePresence(member.presence);
      const inviteState = readInvitePresence(member.presence, true);
      if (inviteState === true) {
        await clearRemovalDue(gid, member.id);
        continue;
      }
      if (inviteState === null) continue;

      const existing = getCachedState(gid, member.id) || {};
      const dueAt = Number(existing.removalDueAt || 0) || 0;

      if (!online && dueAt > 0 && dueAt <= Date.now()) {
        await executeFanRemoval(member, channel);
        continue;
      }
      if (!online) continue;

      setCachedState(gid, member.id, {
        hasLink: false,
        lastAnnounced: existing.lastAnnounced || 0,
        lastMessageId: existing.lastMessageId || null,
        lastSeenOnlineAt: Date.now(),
        inviteMissSince: existing.inviteMissSince != null ? existing.inviteMissSince : Date.now(),
        removalDueAt: existing.removalDueAt || null,
      });
      await clearPending(gid, member.id, channel);
      scheduleRemovalConfirm(member, channel, { removalDueAt: existing.removalDueAt || null });
    }
  }

  for (const [stateKey, info] of statusCache.entries()) {
    if (!stateKey.startsWith(`${gid}:`)) continue;
    const [, userId] = stateKey.split(":");
    const shouldCheck = info?.hasLink || info?.lastMessageId;
    if (!shouldCheck) continue;

    const member = await getGuildMemberCached(guild, userId);
    if (!member) continue;
    if (isOfflinePresence(member.presence)) continue;
    if (hasPendingState(gid, userId)) continue;

    const { newHas, inviteMissSince: nextMiss } = computeSupporterLinkState(info, member.presence);
    if (nextMiss !== info?.inviteMissSince) {
      setCachedState(gid, userId, {
        hasLink: info.hasLink,
        lastAnnounced: info.lastAnnounced || 0,
        lastMessageId: info.lastMessageId || null,
        lastSeenOnlineAt: info.lastSeenOnlineAt || 0,
        inviteMissSince: nextMiss,
      });
    }
    if (!info?.hasLink || newHas || recentlyOnline(info)) continue;
    await clearPending(gid, userId, channel);
    scheduleRemovalConfirm(member, channel);
  }
}

function startCleanupClock(client?, guildId?) {
  if (!client || !guildId) return;
  if (!isGatewayPresenceSweepEnabled()) return;
  if (cleanupIntervalsByGuild.has(guildId)) return;

  const interval = setInterval(() => {
    void runPresenceSupporterSweep(client, guildId);
  }, CLEANUP_MS);

  if (typeof interval.unref === "function") interval.unref();
  cleanupIntervalsByGuild.set(guildId, interval);
}

let presenceSupporterSweepLoopStarted = false;

function startPresenceSupporterSweepLoop(client?) {
  if (!MAIN_GUILD_ID || !client) return;
  if (presenceSupporterSweepLoopStarted) return;
  presenceSupporterSweepLoopStarted = true;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await runPresenceSupporterSweep(client, MAIN_GUILD_ID);
    } catch (err) {
      global.logger?.warn?.("[presence-supporter-sweep]", err?.message || err);
    } finally {
      busy = false;
    }
  };
  tick();
  const interval = setInterval(() => {
    void tick();
  }, CLEANUP_MS);
  interval.unref?.();
}

export = {
  bootstrapSupporter,
  recoverSupporterStatusAnnouncesOnStartup,
  startCleanupClock,
  runPresenceSupporterSweep,
  startPresenceSupporterSweepLoop,
  isGatewayPresenceSweepEnabled,
};
