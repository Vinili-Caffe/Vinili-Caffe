const {
  GIVEAWAY_ENTER_PREFIX,
  GIVEAWAY_LEAVE_PREFIX,
  GIVEAWAY_COUNT_PREFIX,
  GIVEAWAY_REROLL_PREFIX,
  enterGiveaway,
  leaveGiveaway,
  showGiveawayJoinCount,
  rerollGiveaway,
} = require("../Services/Giveaway/giveawayService") as typeof import("../Services/Giveaway/giveawayService");

function match(interaction?) {
  if (!interaction?.isButton?.()) return false;
  const id = String(interaction.customId || "");
  return (
    id.startsWith(GIVEAWAY_ENTER_PREFIX) ||
    id.startsWith(GIVEAWAY_LEAVE_PREFIX) ||
    id.startsWith(GIVEAWAY_COUNT_PREFIX) ||
    id.startsWith(GIVEAWAY_REROLL_PREFIX)
  );
}

async function execute(interaction?, client?) {
  const id = String(interaction.customId || "");
  if (id.startsWith(GIVEAWAY_ENTER_PREFIX)) {
    return (await enterGiveaway(interaction, client)) === true;
  }
  if (id.startsWith(GIVEAWAY_LEAVE_PREFIX)) {
    return (await leaveGiveaway(interaction, client)) === true;
  }
  if (id.startsWith(GIVEAWAY_COUNT_PREFIX)) {
    return (await showGiveawayJoinCount(interaction, client)) === true;
  }
  if (id.startsWith(GIVEAWAY_REROLL_PREFIX)) {
    return (await rerollGiveaway(interaction, client)) === true;
  }
  return false;
}

export = { name: "giveaway", order: 40, match, execute };
