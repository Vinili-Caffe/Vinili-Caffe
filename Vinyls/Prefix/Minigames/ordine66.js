const { tryOrdine66Command } = require("../../Services/Community/starWarsDiscordMinigamesService");

module.exports = {
  name: "ordine66",
  aliases: ["ordine"],
  allowEmptyArgs: true,
  description: "Esegui l'Ordine 66 contro un sospetto Jedi.",
  usage: "+ordine66 @utente",
  examples: ["+ordine66 @Jedi"],

  async execute(message) {
    if (!message.guild) return;
    await tryOrdine66Command(message, message.client);
  },
};
