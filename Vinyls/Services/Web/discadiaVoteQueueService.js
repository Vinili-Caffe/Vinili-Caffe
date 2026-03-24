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
        global.logger?.error?.("[VOTE QUEUE] Main guild not found.");
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
    if (voteDoc.processed) return;

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

function startVoteQueueLoop(client, intervalMs = 300000) { // Polling lento come backup (5 min)
  global.logger?.info?.("[VOTE QUEUE] Starting real-time monitor (Change Streams)...");
  
  // Processa residui all'avvio
  processVoteQueue(client);

  // Monitoraggio in TEMPO REALE
  try {
    const changeStream = DiscadiaVote.watch();
    changeStream.on("change", async (change) => {
      // Se viene inserito un NUOVO voto
      if (change.operationType === "insert") {
        const voteDoc = change.fullDocument;
        if (!voteDoc || voteDoc.processed) return;
        
        const guildId = client.config.mainGuildId || IDs.guilds.main;
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (guild) {
          await processSingleVote(client, guild, voteDoc);
        }
      }
    });
    
    changeStream.on("error", (err) => {
      global.logger?.error?.("[VOTE QUEUE] Change Stream error, falling back to polling:", err);
    });
  } catch (err) {
    global.logger?.error?.("[VOTE QUEUE] Could not start Change Stream:", err);
  }

  const interval = setInterval(() => processVoteQueue(client), intervalMs);
  if (interval.unref) interval.unref();
  
  return interval;
}

module.exports = { processVoteQueue, startVoteQueueLoop };
