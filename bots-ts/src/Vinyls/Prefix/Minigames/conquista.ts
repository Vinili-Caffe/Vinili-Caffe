const { tryConquistaCommand } = require("../../Services/Community/starWarsDiscordMinigamesService") as typeof import("../../Services/Community/starWarsDiscordMinigamesService");

export = {
  name: "conquista",
  allowEmptyArgs: true,
  description: "Conquista il canale corrente (minigioco evento).",
  usage: "+conquista",
  examples: ["+conquista"],

  async execute(message?) {
    if (!message.guild) return;
    await tryConquistaCommand(message, message.client);
  },
};
