const { getGuildChannelCached, getClientGuildCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { findLifecycleCandidates, closeCaseByRef } = require("../../Utils/Moderation/modCaseStore");
const {
  restoreRolesAfterCommunicationTimeoutEnd,
  sweepExpiredCommunicationTimeoutMirrors,
  reconcileIncompleteActiveMuteMirrors,
} = require("./mutedMirrorRoleService");
const LOOP_MS = 60 * 1000;
const BATCH_SIZE = 50;
let loopHandle = null;
let lifecycleTickInFlight = false;

function isUnknownBanError(error) {
  const code = Number(error?.code || 0);
  if (code === 10026) return true;
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("unknown ban");
}

async function tryUnban(guild, userId, reason) {
  if (!guild || !userId) return false;
  try {
    await guild.bans.remove(String(userId), reason);
    return true;
  } catch (error) {
    if (isUnknownBanError(error)) return true;
    return false;
  }
}

async function tryUnlockChannel(guild, channelId) {
  if (!guild || !channelId) return false;
  const channel = await getGuildChannelCached(guild, String(channelId));
  if (!channel?.permissionOverwrites?.edit) return false;
  try {
    await channel.permissionOverwrites.edit(
      guild.roles.everyone,
      { SendMessages: null, SendMessagesInThreads: null },
      { reason: "<:cancel:1461730653677551691> Auto unlock: timed lock expired" },
    );
    return true;
  } catch {
    return false;
  }
}

async function closeExpiredMuteCases(client, now) {
  const rows = await findLifecycleCandidates("MUTE", now, BATCH_SIZE);

  for (const item of rows) {
    const row = item._virtual;
    if (!row) continue;
    const guildId = String(row.guildId || "");
    const userId = String(row.userId || "");
    const caseId = Number(row.caseId);
    const guild =
      client.guilds.cache.get(guildId) ||
      (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      await closeCaseByRef(guildId, userId, caseId, "<:cancel:1461730653677551691> Mute scaduto").catch(() => null);
      continue;
    }
    const member =
      (await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null)) ||
      (await guild.members.fetch(userId).catch(() => null));
    if (!member) {
      await closeCaseByRef(guildId, userId, caseId, "Mute scaduto automaticamente").catch(() => null);
      continue;
    }
    const untilTs = Number(member.communicationDisabledUntilTimestamp || 0);
    if (untilTs > Date.now()) {
      await closeCaseByRef(
        guildId,
        userId,
        caseId,
        `<:cancel:1461730653677551691> Mute case scaduto: utente ancora in timeout fino a ${new Date(untilTs).toISOString()}`,
      ).catch(() => null);
      continue;
    }
    await restoreRolesAfterCommunicationTimeoutEnd(member, {
      reason: `Mute scaduto automaticamente (case #${caseId})`,
      client,
      wasUnmuteFlow: true,
    }).catch(() => null);
    await closeCaseByRef(guildId, userId, caseId, "Mute scaduto automaticamente").catch(() => null);
  }
}

async function closeExpiredBanCases(client, now) {
  const rows = await findLifecycleCandidates("BAN", now, BATCH_SIZE);

  for (const item of rows) {
    const row = item._virtual;
    if (!row) continue;
    const guildId = String(row.guildId || "");
    const userId = String(row.userId || "");
    const caseId = Number(row.caseId);
    const guild = await getClientGuildCached(client, guildId);
    if (!guild) {
      await closeCaseByRef(guildId, userId, caseId, "<:cancel:1461730653677551691> Ban temporaneo scaduto").catch(() => null);
      continue;
    }
    const unbanned = await tryUnban(guild, userId, `Timed ban expired (case #${caseId})`);
    if (!unbanned) continue;
    await closeCaseByRef(
      guildId,
      userId,
      caseId,
      "<:cancel:1461730653677551691> Ban temporaneo scaduto: utente sbannato automaticamente",
    ).catch(() => null);
  }
}

async function closeExpiredLockCases(client, now) {
  const channelLockExtra = { userId: { $regex: /^CHANNEL:/ } };
  const rows = await findLifecycleCandidates("LOCK", now, BATCH_SIZE, channelLockExtra);

  for (const item of rows) {
    const row = item._virtual;
    if (!row) continue;
    const guildId = String(row.guildId || "");
    const userId = String(row.userId || "");
    const caseId = Number(row.caseId);
    const guild = await getClientGuildCached(client, guildId);
    if (!guild) {
      await closeCaseByRef(guildId, userId, caseId, "<:cancel:1461730653677551691> Lock temporaneo scaduto").catch(() => null);
      continue;
    }
    const channelId = userId.replace(/^CHANNEL:/, "");
    const unlocked = await tryUnlockChannel(guild, channelId);
    if (!unlocked) continue;
    await closeCaseByRef(
      guildId,
      userId,
      caseId,
      "<:cancel:1461730653677551691> Lock temporaneo scaduto: canale sbloccato automaticamente",
    ).catch(() => null);
  }
}

async function runModCaseLifecycleTick(client) {
  if (!client?.guilds) return;
  if (lifecycleTickInFlight) return;
  lifecycleTickInFlight = true;
  try {
    const now = new Date();
    await closeExpiredMuteCases(client, now);
    await closeExpiredBanCases(client, now);
    await closeExpiredLockCases(client, now);
    await sweepExpiredCommunicationTimeoutMirrors(client, {
      limit: 25,
      includeRecentUnmuteRecovery: false,
    }).catch((err) => {
      global.logger?.warn?.("[mutedMirrorRole] lifecycle sweep failed:", err?.message || err);
    });
    await reconcileIncompleteActiveMuteMirrors(client, {
      limit: 25,
    }).catch((err) => {
      global.logger?.warn?.("[mutedMirrorRole] active mute reconcile failed:", err?.message || err);
    });
  } finally {
    lifecycleTickInFlight = false;
  }
}

function startModCaseLifecycleLoop(client) {
  const dedicated = String(process.env.BOT_SCHEDULER_WORKER || "").trim() === "1";
  const external = String(process.env.BOT_SCHEDULER_EXTERNAL || "").trim() === "1";
  if (external && !dedicated) {
    return null;
  }
  if (loopHandle) return loopHandle;
  const runner = async () => {
    await runModCaseLifecycleTick(client).catch((error) => {
      const isMongoNetwork = error?.name === "MongoNetworkTimeoutError" || error?.name === "MongoServerSelectionError";
      if (isMongoNetwork) {
        global.logger?.warn?.("[MOD CASE LIFECYCLE] Tick skipped (MongoDB timeout), next run in " + LOOP_MS / 1000 + "s.");
      } else {
        global.logger?.error?.("[MOD CASE LIFECYCLE] Tick failed", error);
      }
    });
  };
  runner().catch(() => {});
  loopHandle = setInterval(runner, LOOP_MS);
  if (typeof loopHandle.unref === "function") loopHandle.unref();
  return loopHandle;
}

module.exports = { startModCaseLifecycleLoop, runModCaseLifecycleTick };