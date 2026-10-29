const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { processDiscadiaVote } = require("../../Utils/Message/officialMessageAutomationHandlers") as typeof import("../../Utils/Message/officialMessageAutomationHandlers");
const { isVoteListingRecordedAtOrAfter } = require("../Bump/bumpService") as typeof import("../Bump/bumpService");
const {
  listUsersWithPendingDiscadiaVotes,
  setPendingDiscadiaVotes,
  DISCADIA_PENDING_VOTES_PATH,
  normalizeVoteListing,
} = require("./discadiaVoteInboxService") as typeof import("./discadiaVoteInboxService");

let isProcessing = false;

async function processVoteQueue(client?) {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const guildId = String(client?.config?.mainGuildId || IDs.guilds.main || "").trim();
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return;

    const profiles = await listUsersWithPendingDiscadiaVotes(guildId, 25);
    for (const profile of profiles) {
      const userId = String(profile.userId || "").trim();
      if (!userId) continue;
      const votes = profile?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote?.pendingVotes || [];
      if (!Array.isArray(votes) || !votes.length) {
        await setPendingDiscadiaVotes(guildId, userId, []);
        continue;
      }

      const user = await client.users.fetch(userId).catch(() => null);
      if (!user) {
        await setPendingDiscadiaVotes(guildId, userId, []);
        continue;
      }

      const remaining = [];
      for (const vote of votes) {
        if (vote?.processed) continue;
        const listing = normalizeVoteListing(vote.listing);
        const receivedAtMs = new Date(vote.receivedAt || 0).getTime();
        const voteAtMs = Number.isFinite(receivedAtMs) ? receivedAtMs : Date.now();
                if (
          await isVoteListingRecordedAtOrAfter(
            guildId,
            userId,
            listing,
            voteAtMs - 5 * 60 * 1000,
            10 * 60 * 1000,
          )
        ) {
          continue;
        }
        const handled = await processDiscadiaVote(guild, user, client, { voteListing: listing });
        if (handled) continue;
        const attempts = (Number(vote.attempts) || 0) + 1;
        if (attempts <= 8) {
          remaining.push({ ...vote, listing, attempts, updatedAt: new Date() });
        }
      }
      await setPendingDiscadiaVotes(guildId, userId, remaining);
    }
  } catch (err) {
    global.logger?.error?.("[VOTE QUEUE] Error in queue service:", err);
  } finally {
    isProcessing = false;
  }
}

function startVoteQueueLoop(client?, intervalMs = 15000) {
  const dedicated = String(process.env.VOTE_QUEUE_WORKER || "").trim() === "1";
  const external = String(process.env.VOTE_QUEUE_EXTERNAL || "").trim() === "1";
  if (external && !dedicated) {
    return null;
  }

  global.logger?.info?.(
    `[VOTE QUEUE] Starting inbox drain (interval: ${intervalMs}ms, ${dedicated ? "pm2 dedicato" : "gateway"})...`,
  );
  processVoteQueue(client).catch(() => {});
  const interval = setInterval(() => {
    processVoteQueue(client).catch(() => {});
  }, intervalMs);
  if (typeof interval.unref === "function") interval.unref();
  return interval;
}

export = {
  processVoteQueue,
  startVoteQueueLoop,
  DISCADIA_PENDING_VOTES_PATH,
};
