const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const { applyPartnershipPayloadBranding } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const { applyDefaultFooterToEmbeds } = require("../../../shared/embeds/defaultFooter") as typeof import("../../../shared/embeds/defaultFooter");
const { t } = require("../i18n/tenantPartnershipI18n/index") as typeof import("../i18n/tenantPartnershipI18n/index");

function buildTenantLookupNotFoundPayload(kind?, context: Record<string, any> = {}) {
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

export = {
  buildTenantLookupNotFoundPayload,
};
