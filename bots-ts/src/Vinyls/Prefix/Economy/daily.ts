const { runIncomeCommand } = require("../../Utils/Economy/economyCommandHelpers") as typeof import("../../Utils/Economy/economyCommandHelpers");

export = {
  name: "daily",
  allowEmptyArgs: true,
  description: "Riscuote la ricompensa giornaliera in Vinili e Caffè.",
  usage: "+daily",
  examples: ["+daily"],
  async execute(message?, args?, client?) {
    await runIncomeCommand(client, message, "daily");
  },
};