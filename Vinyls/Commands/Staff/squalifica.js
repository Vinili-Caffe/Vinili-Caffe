const { ContextMenuCommandBuilder, ApplicationCommandType, MessageFlags } = require("discord.js");
const { safeReply } = require("../../../shared/discord/replyRuntime");
const { handleContestDisegniSqualifica } = require("../../Services/Community/weeklyContestService");

module.exports = {
  category: "founder",
  data: new ContextMenuCommandBuilder().setName("Squalifica").setType(ApplicationCommandType.Message),
  description: "Squalifica una submission del contest outfit.",

  async execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    const out = await handleContestDisegniSqualifica(interaction, client).catch((err) => {
      global.logger?.error?.("[squalifica]", err?.message || err);
      return { ok: false, message: "<:VC_Attention:1482534443632558151> Errore interno durante la squalifica." };
    });
    await safeReply(interaction, {
      content: out.message,
      flags: MessageFlags.Ephemeral,
    });
  },
};