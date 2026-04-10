const { handleWeeklyContestVoteButton } = require("../Services/Community/weeklyContestService");

function match(interaction) {
  if (!interaction?.isButton?.()) return false;
  const id = String(interaction?.customId || "");
  return id.startsWith("wcVote:");
}

async function execute(interaction) {
  const ok = await handleWeeklyContestVoteButton(interaction).catch(() => false);
  return Boolean(ok);
}

module.exports = { name: "weeklyContestVote", order: 44, match, execute };