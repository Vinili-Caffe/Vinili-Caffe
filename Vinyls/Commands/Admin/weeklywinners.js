const { SlashCommandBuilder } = require("discord.js");
const { safeEditReply } = require("../../../shared/discord/replyRuntime");
const { publishWeeklyActivityWinners, getLastCompletedWeekKey } = require("../../Services/Community/weeklyActivityWinnersService");
const IDs = require("../../Utils/Config/ids");

const EPHEMERAL_FLAG = 1 << 6;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("weeklywinners")
    .setDescription("Forza l'invio del messaggio vincitori settimanali (top chat/vocale) nel canale dedicato."),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => { });

    const guild = interaction.guild;
    const mainGuildId = IDs.guilds?.main != null ? String(IDs.guilds.main) : null;
    if (!guild) {
      await safeEditReply(interaction, {
        content: "<:VC_InactiveStatus:1482526984234860574> Comando utilizzabile solo in un server.",
        flags: EPHEMERAL_FLAG,
      });
      return;
    }
    if (mainGuildId && String(guild.id) !== mainGuildId) {
      await safeEditReply(interaction, {
        content: "<:VC_InactiveStatus:1482526984234860574> Comando utilizzabile solo nel server principale.",
        flags: EPHEMERAL_FLAG,
      });
      return;
    }

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