const { runIncomeCommand } = require("../../Utils/Economy/economyCommandHelpers") as typeof import("../../Utils/Economy/economyCommandHelpers");

export = {
  name: "monthly",
  allowEmptyArgs: true,
  description: "Riscuote la ricompensa mensile in Vinili e Caffè.",
  usage: "+monthly",
  examples: ["+monthly"],
  async execute(message?, args?, client?) {
    await runIncomeCommand(client, message, "monthly");
  },
};