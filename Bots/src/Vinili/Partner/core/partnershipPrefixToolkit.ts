const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const {
  shouldApplyMainPartnershipFilters,
  shouldBlockTenantPartnershipPrefixCommands,
} = require("./partnershipConfigResolver") as typeof import("./partnershipConfigResolver");
const { tenantOnlyError } = require("../../Partner/tenant/tenantPartnershipPrefixMessages") as typeof import("../../Partner/tenant/tenantPartnershipPrefixMessages");

/**
 * Gate condiviso main/tenant per i prefix toolkit partnership.
 * Main: se toolkit off → messaggio esplicito (non “solo altri server”).
 * Tenant: messaggio errors_tenantOnly esistente.
 */
async function rejectIfPartnershipToolkitBlocked(message?, commandLabel?, mentions?) {
  const guildId = message?.guild?.id;
  if (!shouldBlockTenantPartnershipPrefixCommands(guildId)) return false;
  const allowedMentions = mentions || { repliedUser: false };
  if (shouldApplyMainPartnershipFilters(guildId)) {
    await safeMessageReply(message, {
      content: `${E.vegax} \`${commandLabel}\` non è disponibile: toolkit partnership disabilitato su questo server.`,
      allowedMentions,
    });
    return true;
  }
  await safeMessageReply(message, {
    ...(await tenantOnlyError(message, `\`${commandLabel}\``)),
    allowedMentions,
  });
  return true;
}

function isMainPartnershipPrefixGuild(guildId?) {
  return shouldApplyMainPartnershipFilters(guildId);
}

export = {
  rejectIfPartnershipToolkitBlocked,
  isMainPartnershipPrefixGuild,
};
