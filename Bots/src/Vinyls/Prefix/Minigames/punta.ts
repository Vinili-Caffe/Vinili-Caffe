const { tryPuntaCommand } = require("../../Services/Community/starWarsDiscordMinigamesService") as typeof import("../../Services/Community/starWarsDiscordMinigamesService");

export = {
  name: "punta",
  aliases: ["scommetti"],
  allowEmptyArgs: true,
  description: "Punta crediti su un podracer (minigioco evento).",
  usage: "+punta <corridore> <importo>",
  examples: ["+punta Anakin 9000"],

  async execute(message?) {
    if (!message.guild) return;
    await tryPuntaCommand(message, message.client);
  },
};
