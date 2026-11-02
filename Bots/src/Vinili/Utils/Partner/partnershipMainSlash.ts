const { safeReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const {
  showPartnershipSlashModal,
  EPHEMERAL_FLAG,
} = require("./partnershipSlashModal") as typeof import("./partnershipSlashModal");

/** `/partnership` sul server principale: manager obbligatorio. */
async function executeMainPartnershipSlash(interaction?) {
  const manager = interaction.options.getUser("manager");
  if (!manager?.id) {
    await safeReply(interaction, {
      content: "<:vegax:1443934876440068179> Devi indicare un **manager** valido.",
      flags: EPHEMERAL_FLAG,
    });
    return;
  }
  await showPartnershipSlashModal(interaction, { managerId: manager.id, skipped: false });
}

export = { executeMainPartnershipSlash };
