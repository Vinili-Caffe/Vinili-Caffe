const { isMultiGuildLayerEnabled, autoRegisterGuildsOnJoin } = require("../core/env") as typeof import("../core/env");
const { isViniliProtectedGuild } = require("../core/viniliProtectedGuilds") as typeof import("../core/viniliProtectedGuilds");
const { handleBotJoinedGuild } = require("../services/guildJoinAlertService") as typeof import("../services/guildJoinAlertService");
const { sendGuildJoinWelcomeDm } = require("../services/guildJoinWelcomeDmService") as typeof import("../services/guildJoinWelcomeDmService");
const { registerTenantGuild } = require("../core/tenantRegistryStore") as typeof import("../core/tenantRegistryStore");
const { isTenantFeatureEnabled } = require("../core/accessPolicy") as typeof import("../core/accessPolicy");
const {
  clearTenantGuildApplicationCommands,
  deployGuildApplicationCommands,
} = require("../../shared/discord/applicationCommandDeployScopes") as typeof import("../../shared/discord/applicationCommandDeployScopes");
const { REST } = require("@discordjs/rest") as typeof import("@discordjs/rest");
const {
  isGuildBotUsageBlacklisted,
  leaveGuildIfPresent,
} = require("../../Vinili/Moderation/services/botUsageBlacklistService") as typeof import("../../Vinili/Moderation/services/botUsageBlacklistService");

async function syncTenantGiveawayCommands(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!/^\d{16,20}$/.test(gid) || !client) return false;
  if (!isTenantFeatureEnabled(gid, "giveaway")) {
    return clearTenantGuildApplicationCommands(client, gid);
  }
  const giveawayCmd = Array.isArray(client.commandArray)
    ? client.commandArray.find((cmd?) => String(cmd?.name || "").trim().toLowerCase() === "giveaway")
    : null;
  if (!giveawayCmd) {
    return clearTenantGuildApplicationCommands(client, gid);
  }
  const token =
    process.env.DISCORD_TOKEN ||
    process.env.DISCORD_TOKEN_OFFICIAL ||
    client?.config?.token;
  const clientId =
    process.env.DISCORD_CLIENT_ID ||
    process.env.DISCORD_CLIENT_ID_OFFICIAL ||
    client?.application?.id;
  if (!token || !clientId) return false;
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    await deployGuildApplicationCommands(rest, clientId, gid, [giveawayCmd]);
    return true;
  } catch (err) {
    global.logger?.warn?.(
      "[MultiGuild] tenant giveaway deploy failed:",
      gid,
      err?.message || err,
    );
    return false;
  }
}

export = {
  name: "guildCreate",
  async execute(guild?, client?) {
    if (!guild?.id || !client) return;
    if (isViniliProtectedGuild(guild.id)) return;

    if (await isGuildBotUsageBlacklisted(guild.id).catch(() => false)) {
      global.logger?.info?.(
        `[MultiGuild] guildCreate: leave blacklist guild ${guild.id} (${guild.name || "?"})`,
      );
      await leaveGuildIfPresent(client, guild.id).catch(() => null);
      try {
        const {
          appendBotGuildLifecycleEvent,
          snapshotGuildMeta,
        } = require("../../Vinili/Moderation/services/botGuildLifecycleLogService") as typeof import("../../Vinili/Moderation/services/botGuildLifecycleLogService");
        await appendBotGuildLifecycleEvent({
          type: "botban_leave",
          guildId: guild.id,
          ...snapshotGuildMeta(guild),
          note: "Join rejected: guild blacklisted",
        }).catch(() => null);
      } catch (_) {}
      return;
    }

    if (!isMultiGuildLayerEnabled()) return;
    if (autoRegisterGuildsOnJoin()) {
      await registerTenantGuild(guild.id, guild.name);
    }
    await syncTenantGiveawayCommands(client, guild.id).catch(() => false);
    await handleBotJoinedGuild(client, guild);
    await sendGuildJoinWelcomeDm(client, guild).catch((err?) => {
      global.logger?.warn?.(
        "[MultiGuild welcomeDm] guildCreate failed:",
        err?.code || err?.message || err,
      );
    });

    try {
      const {
        appendBotGuildLifecycleEvent,
        snapshotGuildMeta,
      } = require("../../Vinili/Moderation/services/botGuildLifecycleLogService") as typeof import("../../Vinili/Moderation/services/botGuildLifecycleLogService");
      await appendBotGuildLifecycleEvent({
        type: "join",
        guildId: guild.id,
        ...snapshotGuildMeta(guild),
      }).catch(() => null);
    } catch (_) {}
  },
};
