const { EmbedBuilder } = require("discord.js");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding");
const { applyPartnershipPayloadBranding } = require("../../MultiGuild/utils/tenantEmbedBranding");
const { applyDefaultFooterToEmbeds } = require("../Embeds/defaultFooter");
const { t } = require("./tenantPartnershipI18n");

function buildTenantLookupNotFoundPayload(kind, context = {}) {
  const lang = context.lang || "it";
  const labelKey = kind === "user" ? "errors_lookupUser" : "errors_lookupServer";
  const { guild = null, client = null } = context;
  const embed = new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setDescription(t(lang, "errors_lookupNotFound", { label: t(lang, labelKey) }));

  return applyPartnershipPayloadBranding(
    applyDefaultFooterToEmbeds(
      {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      },
      guild,
    ),
    { guildId: guild?.id, guild, client },
  );
}

module.exports = {
  buildTenantLookupNotFoundPayload,
};
