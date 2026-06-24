const { runIncomeCommand } = require("../../Utils/Economy/economyCommandHelpers");

module.exports = {
  name: "weekly",
  allowEmptyArgs: true,
  description: "Riscuote la ricompensa settimanale in Vinili e Caffè.",
  usage: "+weekly",
  examples: ["+weekly"],
  async execute(message, args, client) {
    await runIncomeCommand(client, message, "weekly");
  },
};