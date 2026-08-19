const { runIncomeCommand } = require("../../Utils/Economy/economyCommandHelpers");

module.exports = {
  name: "work",
  allowEmptyArgs: true,
  description: "Lavora per guadagnare Vinili e Caffè (cooldown 1h).",
  usage: "+work",
  examples: ["+work"],
  async execute(message, args, client) {
    await runIncomeCommand(client, message, "work");
  },
};