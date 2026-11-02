const { SlashCommandBuilder } = require("discord.js") as typeof import("discord.js");
const { safeReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { partnersChatPartnerCommandDeniedReplyContent } = require("../../runtime/partnersChatChannelUtils") as typeof import("../../runtime/partnersChatChannelUtils");
const {
  isPartnershipOperational,
  shouldApplyMainPartnershipFilters,
} = require("../../core/partnershipConfigResolver") as typeof import("../../core/partnershipConfigResolver");
const { replyInteractionSetupRequired } = require("../../tenant/tenantSetupRequiredReply") as typeof import("../../tenant/tenantSetupRequiredReply");
const { executeMainPartnershipSlash } = require("../../runtime/partnershipMainSlash") as typeof import("../../runtime/partnershipMainSlash");
const { executeTenantPartnershipSlash } = require("../../tenant/tenantPartnershipSlash") as typeof import("../../tenant/tenantPartnershipSlash");
const { EPHEMERAL_FLAG } = require("../../runtime/partnershipSlashModal") as typeof import("../../runtime/partnershipSlashModal");

/** Un solo `/partnership` in deploy (main + tenant). */
export = {
  expectsModal: true,
  data: new SlashCommandBuilder()
    .setName("partnership")
    .setDescription("Invia una partnership.")
    .addUserOption((option?) =>
      option
        .setName("manager")
        .setDescription("L'utente con cui stai facendo la partnership.")
        .setRequired(false),
    ),

  async execute(interaction?) {
    if (!isPartnershipOperational(interaction.guild?.id)) {
      await replyInteractionSetupRequired(interaction);
      return;
    }
    const denied = await partnersChatPartnerCommandDeniedReplyContent(interaction.channel, {
      allowPartnership: true,
    });
    if (denied) {
      await safeReply(interaction, {
        content: denied,
        flags: EPHEMERAL_FLAG,
      });
      return;
    }

    if (shouldApplyMainPartnershipFilters(interaction.guild?.id)) {
      await executeMainPartnershipSlash(interaction);
      return;
    }
    await executeTenantPartnershipSlash(interaction);
  },
};
