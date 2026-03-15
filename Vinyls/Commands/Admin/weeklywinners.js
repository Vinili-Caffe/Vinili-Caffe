const { SlashCommandBuilder } = require("discord.js");
const { safeEditReply } = require("../../../shared/discord/replyRuntime");
const { publishWeeklyActivityWinners, getLastCompletedWeekKey } = require("../../Services/Community/weeklyActivityWinnersService");

const EPHEMERAL_FLAG = 1 << 6;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("weeklywinners")
    .setDescription("Forza l'invio del messaggio vincitori settimanali (top chat/vocale) nel canale dedicato."),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => { });

    const client = interaction.client;
    const weekKey = getLastCompletedWeekKey(new Date());

    try {
      await publishWeeklyActivityWinners(client, { weekKey });
      await safeEditReply(interaction, {
        content: `<:VC_Check:1482532423647363164> Messaggio vincitori settimanali inviato (settimana \`${weekKey}\`).`,
        flags: EPHEMERAL_FLAG,
      });
    } catch (error) {
      global.logger?.error?.("[WEEKLY ACTIVITY] weeklywinners command failed:", error);
      await safeEditReply(interaction, {
        content: `<:VC_Cross:1482532424570376253> Errore durante l'invio: ${error?.message || String(error)}`,
        flags: EPHEMERAL_FLAG,
      });
    }
  },
};