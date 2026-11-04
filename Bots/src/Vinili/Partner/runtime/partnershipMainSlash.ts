const { safeReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const {
  showPartnershipSlashModal,
  EPHEMERAL_FLAG,
} = require("./partnershipSlashModal") as typeof import("./partnershipSlashModal");

/** `/partnership` sul server principale: manager obbligatorio. */
async function executeMainPartnershipSlash(interaction?) {
  const manager = interaction.options.getUser("manager");
  if (!manager?.id) {
    await safeReply(interaction, {
      content: `${E.vegax} Devi indicare un **manager** valido.`,
      flags: EPHEMERAL_FLAG,
    });
    return;
  }
  await showPartnershipSlashModal(interaction, { managerId: manager.id, skipped: false });
}

export = { executeMainPartnershipSlash };
