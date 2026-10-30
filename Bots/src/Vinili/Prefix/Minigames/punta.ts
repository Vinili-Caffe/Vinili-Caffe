const { tryPuntaCommand } = require("../../Services/Community/starWarsDiscordMinigamesService") as typeof import("../../Services/Community/starWarsDiscordMinigamesService");
const { assertStarWarsPluginOrReply } = require("../../EventPlugins/starwars/assertPlugin") as typeof import("../../EventPlugins/starwars/assertPlugin");

export = {
  name: "punta",
  aliases: ["scommetti"],
  allowEmptyArgs: true,
  description: "Punta crediti su un podracer (minigioco evento).",
  usage: "+punta <corridore> <importo>",
  examples: ["+punta Anakin 9000"],

  async execute(message?) {
    if (!message.guild) return;
    if (!(await assertStarWarsPluginOrReply(message))) return;
    await tryPuntaCommand(message, message.client);
  },
};
