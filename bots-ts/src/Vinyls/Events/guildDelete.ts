const { clearGuildState } = require("../Services/Moderation/joinRaidService") as typeof import("../Services/Moderation/joinRaidService");
const { isMultiGuildLayerEnabled } = require("../MultiGuild/core/env") as typeof import("../MultiGuild/core/env");
const { isViniliProtectedGuild } = require("../MultiGuild/core/viniliProtectedGuilds") as typeof import("../MultiGuild/core/viniliProtectedGuilds");
const { handleTenantGuildBotRemoved } = require("../Services/Partner/tenantPartnershipLeaveService") as typeof import("../Services/Partner/tenantPartnershipLeaveService");

export = {
  name: "guildDelete",
  async execute(guild?) {
    try {
      if (!guild?.id) return;
      clearGuildState(guild.id);

      try {
        const {
          appendBotGuildLifecycleEvent,
          snapshotGuildMeta,
        } = require("../Services/Moderation/botGuildLifecycleLogService") as typeof import("../Services/Moderation/botGuildLifecycleLogService");
        await appendBotGuildLifecycleEvent({
          type: "leave",
          guildId: guild.id,
          ...snapshotGuildMeta(guild),
          note: "Bot removed from guild (kick/leave/delete)",
        }).catch(() => null);
      } catch (_) {}

      /* boardsBotLeftPurge1: se il server era in bacheca, cancella scheda + dati */
      try {
        const { deleteServerListingsForLeftGuild } = require("../Utils/Web/siteBoardsApi") as typeof import("../Utils/Web/siteBoardsApi");
        const client = guild.client || global.botClient || null;
        await deleteServerListingsForLeftGuild(client, guild.id, {
          reason: "bot_left_guild",
        }).catch((err?) => {
          global.logger?.warn?.(
            "[guildDelete] boards listing purge failed:",
            guild.id,
            err?.message || err,
          );
          return null;
        });
      } catch (err) {
        global.logger?.warn?.(
          "[guildDelete] boards listing purge require failed:",
          guild.id,
          err?.message || err,
        );
      }

      if (isMultiGuildLayerEnabled() && !isViniliProtectedGuild(guild.id)) {
        await handleTenantGuildBotRemoved(guild.id).catch((err?) => {
          global.logger?.warn?.(
            "[guildDelete] tenant partnership cleanup failed:",
            guild.id,
            err?.message || err,
          );
          return null;
        });
      }
    } catch (err) {
      global.logger?.error?.("[guildDelete] clear Join Raid state failed:", err);
    }
  },
};
