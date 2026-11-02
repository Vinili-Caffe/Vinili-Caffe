const { safeReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const {
  isPartnershipSkipManagerAllowed,
  buildSkipDeniedEmbed,
} = require("../core/partnershipConfigResolver") as typeof import("../core/partnershipConfigResolver");
const {
  showPartnershipSlashModal,
  EPHEMERAL_FLAG,
} = require("../runtime/partnershipSlashModal") as typeof import("../runtime/partnershipSlashModal");

/** `/partnership` sui tenant MultiGuild: manager opzionale se lo skip è abilitato. */
async function executeTenantPartnershipSlash(interaction?) {
  const guildId = interaction.guild?.id;
  const skipAllowed = isPartnershipSkipManagerAllowed(guildId);
  const manager = interaction.options.getUser("manager");
  const skipped = Boolean(skipAllowed && !manager?.id);

  if (!skipped && !manager?.id) {
    await safeReply(interaction, {
      embeds: [buildSkipDeniedEmbed()],
      flags: EPHEMERAL_FLAG,
    });
    return;
  }

  await showPartnershipSlashModal(interaction, {
    managerId: manager?.id || null,
    skipped,
  });
}

export = { executeTenantPartnershipSlash };
