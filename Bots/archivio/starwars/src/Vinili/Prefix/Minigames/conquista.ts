const { tryConquistaCommand } = require("../../Services/Community/starWarsDiscordMinigamesService") as typeof import("../../Services/Community/starWarsDiscordMinigamesService");
const { assertStarWarsPluginOrReply } = require("../../EventPlugins/starwars/assertPlugin") as typeof import("../../EventPlugins/starwars/assertPlugin");

export = {
  name: "conquista",
  allowEmptyArgs: true,
  description: "Conquista il canale corrente (minigioco evento).",
  usage: "+conquista",
  examples: ["+conquista"],

  async execute(message?) {
    if (!message.guild) return;
    if (!(await assertStarWarsPluginOrReply(message))) return;
    await tryConquistaCommand(message, message.client);
  },
};
