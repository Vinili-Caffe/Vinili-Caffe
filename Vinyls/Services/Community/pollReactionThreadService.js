const IDs = require("../../Utils/Config/ids");
const { POLL_VOTE_EMOJI_IDS } = require("../../Commands/Admin/poll");

function isPollVoteReaction(reaction) {
  const emojiId = String(reaction?.emoji?.id || "").trim();
  return Boolean(emojiId && POLL_VOTE_EMOJI_IDS.has(emojiId));
}

async function resolveReactionMessage(reaction) {
  if (reaction?.partial) {
    await reaction.fetch().catch(() => null);
  }
  const message = reaction?.message?.partial
    ? await reaction.message.fetch().catch(() => null)
    : reaction.message;
  return message || null;
}

async function resolvePollDiscussionThread(message) {
  if (!message) return null;
  let thread = message.thread || null;
  if (thread) return thread;
  if (!message.hasThread) return null;
  const full = await message.fetch().catch(() => null);
  return full?.thread || null;
}

/**
 * Chi vota un sondaggio (reazione numerata sul messaggio poll) entra nel thread commenti.
 */
async function handlePollVoteReaction(reaction, user) {
  if (!user?.id || user.bot) return false;

  const pollsChannelId = String(IDs.channels?.polls || "").trim();
  if (!pollsChannelId) return false;
  if (!isPollVoteReaction(reaction)) return false;

  const message = await resolveReactionMessage(reaction);
  if (!message?.guild) return false;
  const channelId = String(message.channelId || message.channel?.id || "").trim();
  if (channelId !== pollsChannelId) return false;

  const thread = await resolvePollDiscussionThread(message);
  if (!thread) return false;

  const added = await thread.members.add(user.id).then(() => true).catch((err) => {
    global.logger?.warn?.("[poll] thread add on vote failed:", user.id, err?.message || err);
    return false;
  });
  return Boolean(added);
}

module.exports = {
  handlePollVoteReaction,
  isPollVoteReaction,
};
