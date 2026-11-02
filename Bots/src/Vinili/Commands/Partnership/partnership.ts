const { SlashCommandBuilder } = require("discord.js") as typeof import("discord.js");
const { safeReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { partnersChatPartnerCommandDeniedReplyContent } = require("../../Utils/Partner/partnersChatChannelUtils") as typeof import("../../Utils/Partner/partnersChatChannelUtils");
const {
  isPartnershipOperational,
  shouldApplyMainPartnershipFilters,
} = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
const { replyInteractionSetupRequired } = require("../../MultiGuild/utils/Partner/tenantSetupRequiredReply") as typeof import("../../MultiGuild/utils/Partner/tenantSetupRequiredReply");
const { executeMainPartnershipSlash } = require("../../Utils/Partner/partnershipMainSlash") as typeof import("../../Utils/Partner/partnershipMainSlash");
const { executeTenantPartnershipSlash } = require("../../MultiGuild/utils/Partner/tenantPartnershipSlash") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipSlash");
const { EPHEMERAL_FLAG } = require("../../Utils/Partner/partnershipSlashModal") as typeof import("../../Utils/Partner/partnershipSlashModal");

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
