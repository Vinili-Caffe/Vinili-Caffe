const { clearGuildState } = require("../Services/Moderation/joinRaidService");
const { isMultiGuildLayerEnabled } = require("../MultiGuild/core/env");
const { isViniliProtectedGuild } = require("../MultiGuild/core/viniliProtectedGuilds");
const { handleTenantGuildBotRemoved } = require("../Services/Partner/tenantPartnershipLeaveService");

module.exports = {
  name: "guildDelete",
  async execute(guild) {
    try {
      if (!guild?.id) return;
      clearGuildState(guild.id);

      try {
        const {
          appendBotGuildLifecycleEvent,
          snapshotGuildMeta,
        } = require("../Services/Moderation/botGuildLifecycleLogService");
        await appendBotGuildLifecycleEvent({
          type: "leave",
          guildId: guild.id,
          ...snapshotGuildMeta(guild),
          note: "Bot removed from guild (kick/leave/delete)",
        }).catch(() => null);
      } catch (_) {}

      if (isMultiGuildLayerEnabled() && !isViniliProtectedGuild(guild.id)) {
        await handleTenantGuildBotRemoved(guild.id).catch((err) => {
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
