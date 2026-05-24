const { runIncomeCommand } = require("../../Utils/Economy/economyCommandHelpers");

module.exports = {
  name: "weekly",
  allowEmptyArgs: true,
  description: "Riscuote la ricompensa settimanale con pannello interattivo.",
  usage: "+weekly",
  examples: ["+weekly"],
  async execute(message, args, client) {
    await runIncomeCommand(client, message, "weekly");
  },
};