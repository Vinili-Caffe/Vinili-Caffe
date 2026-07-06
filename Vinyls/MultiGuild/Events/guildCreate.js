const { isMultiGuildLayerEnabled, autoRegisterGuildsOnJoin } = require("../core/env");
const { isViniliProtectedGuild } = require("../core/viniliProtectedGuilds");
const { handleBotJoinedGuild } = require("../services/guildJoinAlertService");
const { registerTenantGuild } = require("../core/tenantRegistryStore");

module.exports = {
  name: "guildCreate",
  async execute(guild, client) {
    if (!guild?.id || !client) return;
    if (!isMultiGuildLayerEnabled()) return;
    if (isViniliProtectedGuild(guild.id)) return;
    if (autoRegisterGuildsOnJoin()) {
      await registerTenantGuild(guild.id, guild.name);
    }
    await handleBotJoinedGuild(client, guild);
  },
};