const { replyDeny, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers");

const DISABLED_MESSAGE = "Il comando `+duel` è riservato all'evento Hogwarts e non fa parte dell'economia Vinili & Caffè.";

module.exports = {
  name: "duel",
  hideFromHelp: true,
  description: "Non disponibile nell'economia server.",
  usage: "+duel",
  examples: ["+duel"],
  async execute(message, args, client) {
    await runEconomyPanelCommand(message, client, "DUEL", async ({ message: msg, replyDeny: deny }) => {
      await deny(msg, DISABLED_MESSAGE);
    });
  },
};