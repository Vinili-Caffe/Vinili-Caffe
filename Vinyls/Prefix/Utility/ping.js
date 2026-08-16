const { pingDbLatencyMs } = require("../../Utils/Global/globalSettingsBucket");
const { executePingCommand } = require("../../../shared/discord/pingRuntime");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
const { resolveEmbedColorForGuild } = require("../../MultiGuild/utils/tenantEmbedBranding");
const { t } = require("../../Utils/Partner/tenantPartnershipI18n");
const { resolveTenantLanguageForMessage } = require("../../Utils/Partner/tenantPartnershipPrefixMessages");

module.exports = {
  name: "ping",
  allowEmptyArgs: true,
  description: "Verifica la latenza del bot, del database e lo stato della connessione.",
  usage: "+ping",
  examples: ["+ping"],
  async execute(message) {
    try {
      const guildId = message.guild?.id;
      if (guildId && !isViniliFullFeatureGuild(guildId)) {
        const lang = await resolveTenantLanguageForMessage(message);
        await executePingCommand(message, {
          pingDbLatencyMs,
          color: resolveEmbedColorForGuild(guildId),
          formatLatencyText: (ms) => t(lang, "ping_latency", { ms }),
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
