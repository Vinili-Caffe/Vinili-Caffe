const { logBootReady, formatDurationMs } = require("../runtime/bootSummary") as typeof import("../runtime/bootSummary");

function logBotReady(client?, startedAt?) {
  /* MultiGuild ready può arrivare subito dopo: prova a includere conteggi già disponibili. */
  try {
    const { isMultiGuildLayerEnabled } = require("../../MultiGuild/core/env") as typeof import("../../MultiGuild/core/env");
    if (isMultiGuildLayerEnabled()) {
      const { listTenantGuildIds } = require("../../MultiGuild/core/guildRegistry") as typeof import("../../MultiGuild/core/guildRegistry");
      const { getProtectedGuildIds } = require("../../MultiGuild/core/viniliProtectedGuilds") as typeof import("../../MultiGuild/core/viniliProtectedGuilds");
      const { noteBoot } = require("../runtime/bootSummary") as typeof import("../runtime/bootSummary");
      noteBoot(client, {
        protectedGuilds: getProtectedGuildIds().length,
        tenants: listTenantGuildIds().length,
      });
    }
  } catch (_) {
    /* Caffè / senza layer */
  }
  logBootReady(client, startedAt);
}

export = { logBotReady, formatDurationMs };