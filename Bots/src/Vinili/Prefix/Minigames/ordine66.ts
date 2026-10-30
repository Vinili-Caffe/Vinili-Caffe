const { tryOrdine66Command } = require("../../Services/Community/starWarsDiscordMinigamesService") as typeof import("../../Services/Community/starWarsDiscordMinigamesService");
const { assertStarWarsPluginOrReply } = require("../../EventPlugins/starwars/assertPlugin") as typeof import("../../EventPlugins/starwars/assertPlugin");

export = {
  name: "ordine66",
  aliases: ["ordine"],
  allowEmptyArgs: true,
  description: "Esegui l'Ordine 66 contro un sospetto Jedi.",
  usage: "+ordine66 @utente",
  examples: ["+ordine66 @Jedi"],

  async execute(message?) {
    if (!message.guild) return;
    if (!(await assertStarWarsPluginOrReply(message))) return;
    await tryOrdine66Command(message, message.client);
  },
};
