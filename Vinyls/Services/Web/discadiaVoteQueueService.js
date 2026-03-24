const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { processDiscadiaVote } = require("../../Utils/Message/officialMessageAutomationHandlers");
const IDs = require("../../Utils/Config/ids");

let isProcessing = false;

async function processVoteQueue(client) {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const guildId = client.config.mainGuildId || IDs.guilds.main;
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
      isProcessing = false;
      return;
    }

    // Cerco utenti con voti pendenti nell'array centralizzato (Struttura: discadiaVote.pendingVotes)
    // Selezioniamo solo i profili che hanno almeno un voto nell'array
    const usersWithVotes = await ActivityUserProfile.find({ 
        guildId: guildId, 
        "discadiaVote.pendingVotes.0": { $exists: true } 
    }).limit(20);

    for (const profile of usersWithVotes) {
        const userId = profile.userId;
        const user = await client.users.fetch(userId).catch(() => null);
        
        if (!user) {
            // Se l'utente non è più su Discord, pulisco la sua coda specifica per evitare loop infiniti
            await ActivityUserProfile.updateOne(
                { guildId: guildId, userId: userId },
                { $set: { "discadiaVote.pendingVotes": [] } }
            );
            continue;
        }

        // Processo i voti nell'array
        const votes = profile.discadiaVote?.pendingVotes || [];
        if (votes.length === 0) continue;

        let hasProcessedAny = false;
        const remainingVotes = [];

        for (const vote of votes) {
            if (vote.processed) continue;

            const handled = await processDiscadiaVote(guild, user, client);
            if (handled) {
                hasProcessedAny = true;
                global.logger?.info?.(`[VOTE QUEUE] Processed recovered vote for ${user.tag} (${userId})`);
                // Non aggiungiamo a remainingVotes = rimosso dalla coda
            } else {
                // Tentativo fallito, incrementiamo attempts o lo conserviamo
                const attempts = (vote.attempts || 0) + 1;
                if (attempts <= 5) {
                    remainingVotes.push({ ...vote, attempts, updatedAt: new Date() });
                }
                // Se > 5 tentativi, viene rimosso implicitamente non aggiungendolo a remainingVotes
            }
        }

        if (hasProcessedAny || remainingVotes.length !== votes.length) {
            await ActivityUserProfile.updateOne(
                { guildId: guildId, userId: userId },
                { $set: { "discadiaVote.pendingVotes": remainingVotes } }
            );
        }
    }
  } catch (err) {
    global.logger?.error?.("[VOTE QUEUE] Error in queue service:", err);
  } finally {
    isProcessing = false;
  }
}

/**
 * Avvia il loop di elaborazione in background.
 * @param {Client} client L'istanza del bot.
 * @param {number} intervalMs Intervallo tra i controlli (default 15s).
 */
function startVoteQueueLoop(client, intervalMs = 15000) {
  global.logger?.info?.(`[VOTE QUEUE] Starting background processing loop (interval: ${intervalMs}ms)...`);
  
  // Esecuzione immediata al boot
  processVoteQueue(client).catch(() => {});

  const interval = setInterval(() => processVoteQueue(client), intervalMs);
  if (interval.unref) interval.unref();
  
  return interval;
}

module.exports = { processVoteQueue, startVoteQueueLoop };
