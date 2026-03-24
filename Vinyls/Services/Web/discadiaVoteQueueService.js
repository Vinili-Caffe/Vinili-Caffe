const DiscadiaVote = require("../../Schemas/Vote/discadiaVoteSchema");
const { processDiscadiaVote } = require("../../Utils/Message/officialMessageAutomationHandlers");
const IDs = require("../../Utils/Config/ids");

let isProcessing = false;

async function processVoteQueue(client) {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const pendingVotes = await DiscadiaVote.find({ processed: false }).sort({ timestamp: 1 }).limit(50);

    if (pendingVotes.length > 0) {
      const guildId = client.config.mainGuildId || IDs.guilds.main;
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);

      if (!guild) {
        isProcessing = false;
        return;
      }

      for (const voteDoc of pendingVotes) {
        await processSingleVote(client, guild, voteDoc);
      }
    }
  } catch (err) {
    global.logger?.error?.("[VOTE QUEUE] Error in queue service:", err);
  } finally {
    isProcessing = false;
  }
}

async function processSingleVote(client, guild, voteDoc) {
  try {
    if (!voteDoc || voteDoc.processed) return;

    const user = await client.users.fetch(voteDoc.userId).catch(() => null);
    if (!user) {
      voteDoc.processed = true;
      voteDoc.processedAt = new Date();
      await voteDoc.save();
      return;
    }

    const handled = await processDiscadiaVote(guild, user, client);
    if (handled) {
      voteDoc.processed = true;
      voteDoc.processedAt = new Date();
      await voteDoc.save();
    } else {
      voteDoc.attempts = (voteDoc.attempts || 0) + 1;
      if (voteDoc.attempts > 5) voteDoc.processed = true;
      await voteDoc.save();
    }
  } catch (err) {
    global.logger?.error?.(`[VOTE QUEUE] Error for ${voteDoc.userId}:`, err);
  }
}

function startVoteQueueLoop(client, intervalMs = 10000) { // Polling ogni 10 secondi (Veloce e sicuro per standalone DB)
  global.logger?.info?.(`[VOTE QUEUE] Starting background processing loop (interval: ${intervalMs}ms)...`);
  
  // Processa residui all'avvio
  processVoteQueue(client);

  // Monitoraggio Change Streams disattivato perché non supportato da DB standalone
  // Verrà usato solo il polling periodico veloce per stabilità massima
  
  const interval = setInterval(() => processVoteQueue(client), intervalMs);
  if (interval.unref) interval.unref();
  
  return interval;
}

module.exports = { processVoteQueue, startVoteQueueLoop };
