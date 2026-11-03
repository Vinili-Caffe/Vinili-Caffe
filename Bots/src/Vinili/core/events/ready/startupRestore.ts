const { restorePendingVoteReminders, restorePendingDiscadiaReminders, restorePendingReminders, startBumpDueReminderSweepLoop, startDiscadiaVoteReminderLoop, } = require("../../../Community/services/bumpService") as typeof import("../../../Community/services/bumpService");
const { bootstrapSupporter, } = require("../../../Community/events/presenceUpdate") as typeof import("../../../Community/events/presenceUpdate");
const { restoreTtsConnections } = require("../../../../shared/tts/services/ttsService") as typeof import("../../../../shared/tts/services/ttsService");
const { restoreTempBans } = require("../../../Moderation/services/joinRaidService") as typeof import("../../../Moderation/services/joinRaidService");
const { rehydrateAntiNukePanicForGuild } = require("../../../Security/services/antiNukeService") as typeof import("../../../Security/services/antiNukeService");
const { isViniliFullFeatureGuild } = require("../../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../../MultiGuild/core/guildFeatureScope");
const { syncLiveVoiceSessionsFromGateway, } = require("../../../Community/services/activityService") as typeof import("../../../Community/services/activityService");
const { printRecoveryHealthOnce } = require("../../../../shared/recovery/recoveryHealth") as typeof import("../../../../shared/recovery/recoveryHealth");
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { queueIdsCatalogSync } = require("../../../Config/idsAutoSync") as typeof import("../../../Config/idsAutoSync");

function isPrimaryScheduler(client?) {
  return !client.shard || client.shard.ids?.[0] === 0;
}

const INVITE_CACHE_CONCURRENCY = 6;

async function primeInviteCache(client?) {
  client.inviteCache = new Map();
  const guilds = [...client.guilds.cache.values()];
  for (let i = 0; i < guilds.length; i += INVITE_CACHE_CONCURRENCY) {
    const batch = guilds.slice(i, i + INVITE_CACHE_CONCURRENCY);
    const results = await Promise.all(batch.map(async (guild?) => { const invites = await guild.invites.fetch().catch(() => null); if (!invites) return { guildId: guild.id, inviteMap: null }; const inviteMap = new Map(); for (const invite of invites.values()) { inviteMap.set(invite.code, { uses: invite.uses || 0, inviterId: invite.inviter?.id || null, }); } return { guildId: guild.id, inviteMap }; }),);
    for (const { guildId, inviteMap } of results) {
      if (inviteMap) client.inviteCache.set(guildId, inviteMap);
    }
  }
}

async function restoreBumpReminders(client?) {
  const [reminders, discadia, voteReminders] = await Promise.allSettled([restorePendingReminders(client), restorePendingDiscadiaReminders(client), restorePendingVoteReminders(client),]);

  if (reminders.status === "rejected")
    global.logger?.error?.("[DISBOARD REMINDER ERROR]", reminders.reason);
  if (discadia.status === "rejected")
    global.logger?.error?.("[DISCADIA REMINDER ERROR]", discadia.reason);
  if (voteReminders.status === "rejected")
    global.logger?.error?.("[DISCADIA VOTE REMINDER ERROR]", voteReminders.reason);

  startBumpDueReminderSweepLoop(client);
  startDiscadiaVoteReminderLoop(client);

  /* pushHedgeBootRecover1: dopo restart ri-arma hedge per unread senza /push/shown
     (SIGINT alle 12:39 uccideva i timer RAM → Top.gg claimato ma zero banner iOS). */
  try {
    const { recoverUnreadApplePushHedges } = require("../../../site/notifications/siteInAppNotificationsService") as typeof import("../../../site/notifications/siteInAppNotificationsService");
    setTimeout(() => {
      recoverUnreadApplePushHedges({ maxAgeMs: 6 * 60 * 60 * 1000, limitUsers: 50 }).catch((err?) => {
        global.logger?.warn?.("[PUSH HEDGE RECOVER]", err?.message || err);
      });
    }, 12_000).unref?.();
  } catch (err) {
    global.logger?.warn?.("[PUSH HEDGE RECOVER] mount failed:", err?.message || err);
  }
}

async function restoreCoreStartupState(client?) {
  const [bootstrap, inviteCache, liveVoiceSync, joinRaidRestore] = await Promise.allSettled([
    bootstrapSupporter(client),
    primeInviteCache(client),
    syncLiveVoiceSessionsFromGateway(client),
    Promise.allSettled(
      [...client.guilds.cache.values()]
        .filter((guild?) => isViniliFullFeatureGuild(guild.id))
        .map((guild?) => restoreTempBans(guild, { force: true })),
    ),
  ]);

  if (bootstrap.status === "rejected")
    global.logger?.error?.("[PRESENCE BOOTSTRAP ERROR]", bootstrap.reason);
  if (inviteCache.status === "rejected")
    global.logger?.error?.("[INVITE CACHE] Failed to prime:", inviteCache.reason);
  if (liveVoiceSync.status === "rejected")
    global.logger?.error?.("[VOICE LIVE SYNC ERROR]", liveVoiceSync.reason);
  if (joinRaidRestore.status === "rejected")
    global.logger?.error?.("[JOIN RAID RESTORE ERROR]", joinRaidRestore.reason);

  await restoreTtsConnections(client);
  for (const guild of client.guilds.cache.values()) {
    if (!isViniliFullFeatureGuild(guild.id)) continue;
    rehydrateAntiNukePanicForGuild(guild);
  }
  try {
    const { restorePartnerManagerLeaveGraceOnStartup } = require("../../../Partner/services/partnerManagerLeaveService") as typeof import("../../../Partner/services/partnerManagerLeaveService");
    restorePartnerManagerLeaveGraceOnStartup(client);
  } catch (err) {
    global.logger?.warn?.("[partnerManagerLeave] grace restore failed:", err?.message || err);
  }
  try {
    const { restoreAntiNukeQuarantineTimersOnStartup } = require("../../../Security/services/antiNukeService") as typeof import("../../../Security/services/antiNukeService");
    if (typeof restoreAntiNukeQuarantineTimersOnStartup === "function") {
      restoreAntiNukeQuarantineTimersOnStartup(client);
    }
  } catch (err) {
    global.logger?.warn?.("[antiNuke] quarantine restore failed:", err?.message || err);
  }
  try {
    const { restoreChatDmFallbacksOnStartup } = require("../../../site/http/siteChatDmFallback") as typeof import("../../../site/http/siteChatDmFallback");
    if (typeof restoreChatDmFallbacksOnStartup === "function") {
      await restoreChatDmFallbacksOnStartup(client);
    }
  } catch (err) {
    global.logger?.warn?.("[siteChatDmFallback] restore failed:", err?.message || err);
  }
  printRecoveryHealthOnce("VINYLS_RECOVERY_HEALTH");
  const { applyBotPresence, schedulePresenceStabilization, installBotPresenceKeeper } = require("../../../../shared/discord/botPresenceActivity") as typeof import("../../../../shared/discord/botPresenceActivity");
  await applyBotPresence(client);
  installBotPresenceKeeper(client);
  schedulePresenceStabilization(client);
}

async function queueStartupSync(client?) {
  try {
    const mainGuildId = IDs.guilds.main || client.guilds.cache.first()?.id;
    if (!mainGuildId) return;

    queueIdsCatalogSync(client, mainGuildId, "startup", { delayMs: 5000 });

  } catch (err) {
    global.logger?.error?.("[IDS AUTO SYNC] Startup queue failed", err);
  }
}

export = {
  isPrimaryScheduler,
  primeInviteCache,
  restoreBumpReminders,
  restoreCoreStartupState,
  queueStartupSync,
};
