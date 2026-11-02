const { listTenantGuildIds } = require("../core/guildRegistry") as typeof import("../core/guildRegistry");
const { getProtectedGuildIds } = require("../core/viniliProtectedGuilds") as typeof import("../core/viniliProtectedGuilds");
const { isMultiGuildLayerEnabled, autoRegisterGuildsOnJoin } = require("../core/env") as typeof import("../core/env");
const { connectMongo, isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { bootstrapTenantRegistryFromClient, refreshDynamicGuildRowsCache } = require("../core/tenantRegistryStore") as typeof import("../core/tenantRegistryStore");
const { refreshTenantGuildSettingsCache } = require("../core/tenantGuildSettings") as typeof import("../core/tenantGuildSettings");
const { refreshPartnershipConfigCache } = require("../../Partner/core/tenantPartnershipSettings") as typeof import("../../Partner/core/tenantPartnershipSettings");
const { refreshTicketConfigCache } = require("../../MultiGuild/tickets/tenant/tenantTicketSettings") as typeof import("../../MultiGuild/tickets/tenant/tenantTicketSettings");
const { leaveAllBlacklistedGuilds } = require("../../Moderation/services/botUsageBlacklistService") as typeof import("../../Moderation/services/botUsageBlacklistService");

export = {
  name: "ready",
  once: true,
  async execute(client?) {
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
    await Promise.all([
      refreshDynamicGuildRowsCache(),
      refreshTenantGuildSettingsCache(),
      refreshPartnershipConfigCache().catch(() => null),
      refreshTicketConfigCache().catch(() => null),
    ]);
    if (!client.__tenantSettingsCacheRefreshTimer) {
      client.__tenantSettingsCacheRefreshTimer = setInterval(() => {
        refreshTenantGuildSettingsCache().catch(() => null);
        refreshPartnershipConfigCache().catch(() => null);
        refreshTicketConfigCache().catch(() => null);
      }, 10_000);
      client.__tenantSettingsCacheRefreshTimer.unref?.();
    }
    if (autoRegisterGuildsOnJoin()) {
      await bootstrapTenantRegistryFromClient(client);
    }
    const leaveSweep = await leaveAllBlacklistedGuilds(client).catch((err?) => {
      global.logger?.warn?.("[MultiGuild] blacklist leave sweep:", err?.message || err);
      return null;
    });
    if (leaveSweep?.left?.length) {
      global.logger?.info?.(
        `[MultiGuild] leave blacklist all’avvio: ${leaveSweep.left.length} server`,
      );
    }
    const protectedIds = getProtectedGuildIds();
    const tenantIds = listTenantGuildIds();
    global.logger?.info?.(
      `[MultiGuild] protette=${protectedIds.length} tenant=${tenantIds.length}`,
    );
    client._multiGuildReadyAt = Date.now();

            setTimeout(() => {
      try {
        const { runTenantOfflineRecoveryTick } = require("../../Partner/services/tenantOfflineRecoveryService") as typeof import("../../Partner/services/tenantOfflineRecoveryService");
        void runTenantOfflineRecoveryTick(client, {
          minIntervalMs: 60_000,
          force: false,
        }).catch((err?) => {
          global.logger?.warn?.("[MultiGuild] tenant offline recovery:", err?.message || err);
        });
      } catch (err) {
        global.logger?.warn?.("[MultiGuild] tenant offline recovery load:", err?.message || err);
      }
    }, 15_000).unref?.();
  },
};