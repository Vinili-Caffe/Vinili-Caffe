const { replyDeny, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers");

const DISABLED_MESSAGE = "Il comando `+pay` non fa parte dell'economia Vinili & Caffè del server.";

module.exports = {
  name: "pay",
  aliases: ["paga", "invia", "send"],
  hideFromHelp: true,
  description: "Non disponibile nell'economia server.",
  usage: "+pay @utente <importo>",
  examples: ["+pay @Mario 50"],
  async execute(message, args, client) {
    await runEconomyPanelCommand(message, client, "PAY", async ({ message: msg, replyDeny: deny }) => {
      await deny(msg, DISABLED_MESSAGE);
    });
  },
};