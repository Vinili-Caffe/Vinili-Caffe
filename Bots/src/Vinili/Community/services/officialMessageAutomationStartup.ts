const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { isVoteListingRecordedAtOrAfter } = require("./bumpService") as typeof import("./bumpService");
const { getMessageTextParts, resolveUserFromMessage } = require("./officialMessageAutomationShared") as typeof import("./officialMessageAutomationShared");
const { handleVoteManagerMessage, processDiscadiaVote, VOTE_CHANNEL_ID } = require("./officialMessageAutomationVotes") as typeof import("./officialMessageAutomationVotes");
const { handleDisboardBump, handleDiscadiaBump } = require("./officialMessageAutomationBumps") as typeof import("./officialMessageAutomationBumps");

const COMMANDS_CHANNEL_ID = IDs.channels.commands;

const RECENT_VOTE_LOOKBACK_MS = 72 * 60 * 60 * 1000;
const RECENT_VOTE_FETCH_LIMIT = 100;
const RECENT_VOTE_MAX_PAGES = 5;

const RECENT_BUMP_LOOKBACK_MS = 24 * 60 * 60 * 1000;

async function fetchRecentChannelMessages(channel, { lookbackMs, pageLimit, maxPages }) {
  if (!channel?.messages?.fetch) return [];
  const cutoff = Date.now() - lookbackMs;
  const byId = new Map();
  let before;
  for (let page = 0; page < maxPages; page += 1) {
    const batch = await channel.messages
      .fetch({ limit: pageLimit, ...(before ? { before } : {}) })
      .catch(() => null);
    if (!batch?.size) break;
    let oldestTs = Number.POSITIVE_INFINITY;
    let oldestId = null;
    for (const msg of batch.values()) {
      byId.set(String(msg.id), msg);
      const ts = Number(msg.createdTimestamp || 0);
      if (ts && ts < oldestTs) {
        oldestTs = ts;
        oldestId = String(msg.id);
      }
    }
    if (!oldestId || oldestTs < cutoff) break;
    before = oldestId;
  }
  return [...byId.values()];
}

function isOurDiscadiaThankYouMessage(message?, client?) {
  if (!message || String(message.author?.id || "") !== String(client?.user?.id || "")) return false;
  const { content, embedText, embedTitle, fieldsText } = getMessageTextParts(message);
  const voteText = `${content}${embedText}${embedTitle}${fieldsText}`;
  if (/top\.gg|\btopgg\b/i.test(voteText)) return false;
  return /votato su\s+\*?\*?Discadia\*?\*?|Un nuovo voto/i.test(voteText) && /Discadia/i.test(voteText);
}

async function tryRecoverVoteFromOurThankYou(message?, client?) {
  if (!isOurDiscadiaThankYouMessage(message, client)) return false;
  let user = await resolveUserFromMessage(message);
  if (user?.bot) user = null;
  if (!user) {
    const mentioned = message.mentions?.users?.first?.();
    if (mentioned && !mentioned.bot) user = mentioned;
  }
  if (!user) return false;
  const voteAtMs = Number(message.createdTimestamp || 0);
  if (await isVoteListingRecordedAtOrAfter(message.guild.id, user.id, "discadia", voteAtMs)) {
    return false;
  }
  return processDiscadiaVote(message.guild, user, client, { voteListing: "discadia" });
}

async function processRecentVoteChannelMessages(client?) {
  if (!client || !VOTE_CHANNEL_ID) return { recovered: 0, scanned: 0 };
  const channel = client.channels.cache.get(VOTE_CHANNEL_ID) || (await client.channels.fetch(VOTE_CHANNEL_ID).catch(() => null));
  if (!channel?.isTextBased?.() || !channel.messages) return { recovered: 0, scanned: 0 };
  const cutoff = Date.now() - RECENT_VOTE_LOOKBACK_MS;
  let messages = [];
  try {
    messages = await fetchRecentChannelMessages(channel, {
      lookbackMs: RECENT_VOTE_LOOKBACK_MS,
      pageLimit: RECENT_VOTE_FETCH_LIMIT,
      maxPages: RECENT_VOTE_MAX_PAGES,
    });
  } catch (err) {
    global.logger?.warn?.("[VOTE EMBED] Failed to fetch recent messages for startup:", err?.message || err);
    return { recovered: 0, scanned: 0 };
  }
  const ourId = String(client.user?.id || "");
  const sorted = [...messages.values()]
    .filter((m?) => (m.createdTimestamp || 0) >= cutoff)
    .sort((a?, b?) => (a.createdTimestamp || 0) - (b.createdTimestamp || 0));
  let recovered = 0;
  for (const message of sorted) {
    try {
      if (String(message.author?.id || "") === ourId) {
        const handledThankYou = await tryRecoverVoteFromOurThankYou(message, client);
        if (handledThankYou) recovered += 1;
        continue;
      }
      const handled = await handleVoteManagerMessage(message, client, {
        skipIfAlreadyRecorded: true,
        voteAtMs: message.createdTimestamp,
        keepSourceMessage: true,
      });
      if (handled) recovered += 1;
    } catch (err) {
      global.logger?.warn?.("[VOTE EMBED] Startup process message error:", err?.message || err);
    }
  }
  if (recovered > 0) {
    global.logger?.info?.(`[VOTE EMBED] Recuperati ${recovered} voti da #supporters (scansionati ${sorted.length} messaggi)`);
  }
  return { recovered, scanned: sorted.length };
}

async function processRecentCommandsChannelMessages(client?) {
  if (!client || !COMMANDS_CHANNEL_ID) return;
  const channel = client.channels.cache.get(COMMANDS_CHANNEL_ID) || (await client.channels.fetch(COMMANDS_CHANNEL_ID).catch(() => null));
  if (!channel?.isTextBased?.() || !channel.messages) return;
  const cutoff = Date.now() - RECENT_BUMP_LOOKBACK_MS;
  let messages = [];
  try {
    messages = await channel.messages.fetch({ limit: RECENT_VOTE_FETCH_LIMIT });
  } catch (err) {
    global.logger?.warn?.("[BUMP] Failed to fetch recent commands channel for startup:", err?.message || err);
    return;
  }
  const ourId = client.user?.id;
  const sorted = [...messages.values()].sort((a?, b?) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0));
  for (const message of sorted) {
    if ((message.createdTimestamp || 0) < cutoff) continue;
    if (message.author?.id === ourId) continue;
    try {
      const handledDiscadia = await handleDiscadiaBump(message, client);
      if (handledDiscadia) continue;
      await handleDisboardBump(message, client);
    } catch (err) {
      global.logger?.warn?.("[BUMP] Startup process message error:", err?.message || err);
    }
  }
}

async function processAllRecentAutomationMessages(client?) {
  await processRecentVoteChannelMessages(client);
  await processRecentCommandsChannelMessages(client);
}

export = {
  processRecentVoteChannelMessages,
  processRecentCommandsChannelMessages,
  processAllRecentAutomationMessages,
};
