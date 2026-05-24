const { runIncomeCommand } = require("../../Utils/Economy/economyCommandHelpers");

module.exports = {
  name: "daily",
  allowEmptyArgs: true,
  description: "Riscuote la ricompensa giornaliera con pannello interattivo.",
  usage: "+daily",
  examples: ["+daily"],
  async execute(message, args, client) {
    await runIncomeCommand(client, message, "daily");
  },
};