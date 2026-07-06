const { listTenantGuildIds } = require("../core/guildRegistry");
const { getProtectedGuildIds } = require("../core/viniliProtectedGuilds");
const { isMultiGuildLayerEnabled, autoRegisterGuildsOnJoin } = require("../core/env");
const { connectMongo, isMongoReady } = require("../../Utils/Database/mongoConnect");
const {
  bootstrapTenantRegistryFromClient,
  refreshDynamicGuildRowsCache,
} = require("../core/tenantRegistryStore");
const { refreshTenantGuildSettingsCache } = require("../core/tenantGuildSettings");

module.exports = {
  name: "ready",
  once: true,
  async execute(client) {
    if (!isMultiGuildLayerEnabled()) return;
    if (!isMongoReady()) {
      const ok = await connectMongo(client);
      if (!ok || !isMongoReady()) {
        global.logger?.warn?.(
          "[MultiGuild] ready: MongoDB non disponibile, tenant registry non caricato",
        );
        return;
      }
    }
    await refreshDynamicGuildRowsCache();
    await refreshTenantGuildSettingsCache();
    if (autoRegisterGuildsOnJoin()) {
      await bootstrapTenantRegistryFromClient(client);
    }
    const protectedIds = getProtectedGuildIds();
    const tenantIds = listTenantGuildIds();
    global.logger?.info?.(
      `[MultiGuild] attivo — protette (main/test/sponsor): ${protectedIds.length} | tenant registry: ${tenantIds.length}`,
    );
    client._multiGuildReadyAt = Date.now();
  },
};