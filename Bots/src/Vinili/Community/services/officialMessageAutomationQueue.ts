const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const {
  enqueueGatewayOffloadJob,
  startGatewayOffloadDrainLoop,
  OFFLOAD_KINDS,
} = require("../../../shared/runtime/gatewayOffloadQueue") as typeof import("../../../shared/runtime/gatewayOffloadQueue");

const MAX_QUEUE = 400;
const MAX_IN_FLIGHT = 2;
const AUTOMATION_RECHECK_DELAY_MS = 8000;
const VOTE_AUTOMATION_RECHECK_DELAYS_MS = [1500, 3500, 8000];
const VOTE_CHANNEL_ID = IDs.channels?.supporters;

type AutomationRecheckJob = {
  kind: "automation-recheck";
  messageId: string;
  channelId: string;
  voteFastRecheck: boolean;
  attempt: number;
};

type BoostRecoverJob = {
  kind: "boost-recover";
  guildId: string;
  userId: string;
  opts: Record<string, any>;
};

type BoostConcurrentJob = {
  kind: "boost-concurrent";
  guildId: string;
  channelId: string;
  skipUserId: string;
  windowMs: number;
  delayMs: number;
};

type QueueJob = AutomationRecheckJob | BoostRecoverJob | BoostConcurrentJob;

const pending: QueueJob[] = [];
const activeRecheckByMessageId = new Map<string, { cancel: () => void }>();
let inFlight = 0;
let drainScheduled = false;

function cancelAutomationMessageRecheck(messageId?) {
  const key = String(messageId || "");
  if (!key) return;
  const job = activeRecheckByMessageId.get(key);
  if (!job) return;
  job.cancel();
  activeRecheckByMessageId.delete(key);
}

function scheduleDrain() {
  if (drainScheduled) return;
  drainScheduled = true;
  setImmediate(() => {
    drainScheduled = false;
    void pumpQueue();
  });
}

async function pumpQueue() {
  while (inFlight < MAX_IN_FLIGHT && pending.length > 0) {
    const job = pending.shift();
    if (!job) break;
    inFlight += 1;
    void runJob(job)
      .catch((err?) => {
        global.logger?.warn?.("[officialMessageAutomationQueue]", err?.message || err);
      })
      .finally(() => {
        inFlight -= 1;
        scheduleDrain();
      });
  }
}

async function runJob(job: QueueJob) {
  const client = global.botClient;
  if (!client) return;

  if (job.kind === "boost-recover") {
    const delayMs = Number(job.opts?.delayMs || 0);
    if (delayMs > 0) {
      await new Promise((resolve) => {
        const t = setTimeout(resolve, delayMs);
        t.unref?.();
      });
    }
    const recoverOpts = { ...(job.opts || {}) };
    delete recoverOpts.delayMs;
    const guild =
      client.guilds.cache.get(job.guildId) ||
      (await client.guilds.fetch(job.guildId).catch(() => null));
    if (!guild) return;
    const guildMemberUpdateExtras = require("./boostAnnounceRecoveryService") as typeof import("./boostAnnounceRecoveryService");
    await guildMemberUpdateExtras.recoverMissingBoostEmbedsForUser(guild, job.userId, recoverOpts);
    return;
  }

  if (job.kind === "boost-concurrent") {
    await new Promise((resolve) => {
      const t = setTimeout(resolve, Math.max(0, job.delayMs || 0));
      t.unref?.();
    });
    const guild =
      client.guilds.cache.get(job.guildId) ||
      (await client.guilds.fetch(job.guildId).catch(() => null));
    if (!guild) return;
    const channel =
      client.channels.cache.get(job.channelId) ||
      (await client.channels.fetch(job.channelId).catch(() => null));
    if (!channel) return;
    const guildMemberUpdateExtras = require("./boostAnnounceRecoveryService") as typeof import("./boostAnnounceRecoveryService");
    await guildMemberUpdateExtras.recoverConcurrentNativeBoosts(guild, channel, {
      windowMs: job.windowMs,
      skipUserId: job.skipUserId,
    });
    return;
  }

  const isVoteChannel = VOTE_CHANNEL_ID && String(job.channelId) === String(VOTE_CHANNEL_ID);
  const delays =
    job.voteFastRecheck && isVoteChannel
      ? VOTE_AUTOMATION_RECHECK_DELAYS_MS
      : [AUTOMATION_RECHECK_DELAY_MS];
  const delay = delays[job.attempt];
  if (delay == null) {
    activeRecheckByMessageId.delete(job.messageId);
    return;
  }

  let cancelled = false;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => resolve(), delay);
    timeout.unref?.();
    activeRecheckByMessageId.set(job.messageId, {
      cancel: () => {
        cancelled = true;
        clearTimeout(timeout);
        resolve();
      },
    });
  });

  if (cancelled) return;

  try {
    const channel =
      client.channels.cache.get(job.channelId) ||
      (await client.channels.fetch(job.channelId).catch(() => null));
    if (!channel?.messages?.fetch) {
      activeRecheckByMessageId.delete(job.messageId);
      return;
    }
    const fresh = await channel.messages.fetch(job.messageId).catch(() => null);
    if (!fresh) {
      activeRecheckByMessageId.delete(job.messageId);
      return;
    }

    const {
      handleVoteManagerMessage,
      handleDisboardBump,
      handleDiscadiaBump,
    } = require("./officialMessageAutomationHandlers") as typeof import("./officialMessageAutomationHandlers");
    const { logEventError } = require("./officialMessageCommunityHandlers") as typeof import("./officialMessageCommunityHandlers");

    if (await handleVoteManagerMessage(fresh, client)) {
      activeRecheckByMessageId.delete(job.messageId);
      return;
    }
    if (await handleDisboardBump(fresh, client)) {
      activeRecheckByMessageId.delete(job.messageId);
      return;
    }
    if (await handleDiscadiaBump(fresh, client)) {
      activeRecheckByMessageId.delete(job.messageId);
      return;
    }

    const nextAttempt = job.attempt + 1;
    if (nextAttempt < delays.length) {
      if (pending.length < MAX_QUEUE) {
        pending.push({ ...job, attempt: nextAttempt });
        scheduleDrain();
      }
      return;
    }
    activeRecheckByMessageId.delete(job.messageId);
  } catch (error) {
    activeRecheckByMessageId.delete(job.messageId);
    const { logEventError } = require("./officialMessageCommunityHandlers") as typeof import("./officialMessageCommunityHandlers");
    logEventError(client, "AUTOMATION RECHECK ERROR", error);
  }
}

function enqueueOfficialMessageAutomationRecheck(message?, options: Record<string, any> = {}) {
  const messageId = String(message?.id || "");
  const channelId = String(message?.channelId || "");
  if (!messageId || !channelId) return;
  if (activeRecheckByMessageId.has(messageId)) return;
  if (pending.length >= MAX_QUEUE) return;

  activeRecheckByMessageId.set(messageId, {
    cancel: () => {
      activeRecheckByMessageId.delete(messageId);
    },
  });

  pending.push({
    kind: "automation-recheck",
    messageId,
    channelId,
    voteFastRecheck: Boolean(options.voteFastRecheck),
    attempt: 0,
  });
  scheduleDrain();
}

function enqueueBoostRecovery(guildId?, userId?, opts: Record<string, any> = {}) {
  if (!guildId || !userId) return;
  /* Thin gateway: persist → bot-workers drain (niente pump in-process sul gateway). */
  if (isGatewayThinOfficialAutomationMode() && !isOfficialAutomationWorkerProcess()) {
    void enqueueGatewayOffloadJob(OFFLOAD_KINDS.BOOST_RECOVER, {
      guildId: String(guildId),
      userId: String(userId),
      opts,
    });
    return;
  }
  if (pending.length >= MAX_QUEUE) return;
  pending.push({
    kind: "boost-recover",
    guildId: String(guildId),
    userId: String(userId),
    opts,
  });
  scheduleDrain();
}

function enqueueBoostConcurrentRecovery(guildId?, channelId?, skipUserId?, opts: Record<string, any> = {}) {
  if (!guildId || !channelId) return;
  if (isGatewayThinOfficialAutomationMode() && !isOfficialAutomationWorkerProcess()) {
    void enqueueGatewayOffloadJob(OFFLOAD_KINDS.BOOST_CONCURRENT, {
      guildId: String(guildId),
      channelId: String(channelId),
      skipUserId: String(skipUserId || ""),
      windowMs: Number(opts.windowMs || 3 * 60 * 1000),
      delayMs: Number(opts.delayMs || 4000),
    });
    return;
  }
  if (pending.length >= MAX_QUEUE) return;
  pending.push({
    kind: "boost-concurrent",
    guildId: String(guildId),
    channelId: String(channelId),
    skipUserId: String(skipUserId || ""),
    windowMs: Number(opts.windowMs || 3 * 60 * 1000),
    delayMs: Number(opts.delayMs || 4000),
  });
  scheduleDrain();
}

function isGatewayThinOfficialAutomationMode() {
  return (
    String(process.env.COMMUNITY_POLL_EXTERNAL || "").trim() === "1" ||
    String(process.env.BOT_SCHEDULER_EXTERNAL || "").trim() === "1"
  );
}

function isOfficialAutomationWorkerProcess() {
  return (
    String(process.env.BOT_SCHEDULER_WORKER || "").trim() === "1" ||
    String(process.env.COMMUNITY_POLL_WORKER || "").trim() === "1"
  );
}

function startOfficialAutomationBoostDrainLoop(client?) {
  if (!isOfficialAutomationWorkerProcess()) return null;
  if (!isGatewayThinOfficialAutomationMode()) return null;
  if (client?._officialBoostDrainStarted) return client._officialBoostDrainTimer || null;
  client._officialBoostDrainStarted = true;
  global.botClient = client || global.botClient;
  const timer = startGatewayOffloadDrainLoop(
    "boost-drain",
    [OFFLOAD_KINDS.BOOST_RECOVER, OFFLOAD_KINDS.BOOST_CONCURRENT],
    async (job?) => {
      const payload = job?.payload || {};
      if (job.kind === OFFLOAD_KINDS.BOOST_RECOVER) {
        await runJob({
          kind: "boost-recover",
          guildId: String(payload.guildId || ""),
          userId: String(payload.userId || ""),
          opts: payload.opts && typeof payload.opts === "object" ? payload.opts : {},
        });
        return;
      }
      if (job.kind === OFFLOAD_KINDS.BOOST_CONCURRENT) {
        await runJob({
          kind: "boost-concurrent",
          guildId: String(payload.guildId || ""),
          channelId: String(payload.channelId || ""),
          skipUserId: String(payload.skipUserId || ""),
          windowMs: Number(payload.windowMs || 3 * 60 * 1000),
          delayMs: Number(payload.delayMs || 4000),
        });
      }
    },
    Math.max(1000, Number(process.env.VC_BOOST_DRAIN_MS || 2000) || 2000),
  );
  client._officialBoostDrainTimer = timer;
  console.log("[BOT-SCHEDULER] boost recovery drain loop started");
  return timer;
}

export = {
  cancelAutomationMessageRecheck,
  enqueueOfficialMessageAutomationRecheck,
  enqueueBoostRecovery,
  enqueueBoostConcurrentRecovery,
  isGatewayThinOfficialAutomationMode,
  startOfficialAutomationBoostDrainLoop,
};
