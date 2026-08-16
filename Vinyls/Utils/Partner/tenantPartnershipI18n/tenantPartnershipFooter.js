const { EmbedBuilder } = require("discord.js");
const { t } = require("./index");

function applyLocalizedTenantFooter(payload, lang = "it") {
  if (!payload?.embeds?.length) return payload;
  return {
    ...payload,
    embeds: payload.embeds.map((embed) => {
      const builder = embed instanceof EmbedBuilder ? embed : EmbedBuilder.from(embed);
      const existing = builder.data?.footer || builder.footer || {};
      return builder.setFooter({
        text: t(lang, "footerCopyright"),
        iconURL: existing.icon_url || existing.iconURL || undefined,
      });
    }),
  };
}

module.exports = { applyLocalizedTenantFooter };
