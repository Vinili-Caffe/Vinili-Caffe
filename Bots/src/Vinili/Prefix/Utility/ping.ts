const { pingDbLatencyMs } = require("../../Utils/Global/globalSettingsBucket") as typeof import("../../Utils/Global/globalSettingsBucket");
const { executePingCommand } = require("../../../shared/discord/pingRuntime") as typeof import("../../../shared/discord/pingRuntime");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope") as typeof import("../../MultiGuild/core/guildFeatureScope");
const { resolveEmbedColorForGuild } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const { t } = require("../../MultiGuild/utils/Partner/tenantPartnershipI18n/index") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipI18n/index");
const { resolveTenantLanguageForMessage } = require("../../MultiGuild/utils/Partner/tenantPartnershipPrefixMessages") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipPrefixMessages");

export = {
  name: "ping",
  allowEmptyArgs: true,
  description: "Verifica la latenza del bot, del database e lo stato della connessione.",
  usage: "+ping",
  examples: ["+ping"],
  async execute(message?) {
    try {
      const guildId = message.guild?.id;
      if (guildId && !isViniliFullFeatureGuild(guildId)) {
        const lang = await resolveTenantLanguageForMessage(message);
        await executePingCommand(message, {
          pingDbLatencyMs,
          color: resolveEmbedColorForGuild(guildId),
          formatLatencyText: (ms?) => t(lang, "ping_latency", { ms }),
          offlineLabel: t(lang, "ping_offline"),
          ndLabel: t(lang, "ping_nd"),
          labels: {
            uptime: t(lang, "ping_label_uptime"),
            database: t(lang, "ping_label_database"),
            api: t(lang, "ping_label_api"),
            shard: t(lang, "ping_label_shard"),
          },
        });
        return;
      }
      await executePingCommand(message, { pingDbLatencyMs });
    } catch (error) {
      global.logger.error(error);
    }
  },
};
