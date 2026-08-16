const { isMultiGuildLayerEnabled, autoRegisterGuildsOnJoin } = require("../core/env");
const { isViniliProtectedGuild } = require("../core/viniliProtectedGuilds");
const { handleBotJoinedGuild } = require("../services/guildJoinAlertService");
const { sendGuildJoinWelcomeDm } = require("../services/guildJoinWelcomeDmService");
const { registerTenantGuild } = require("../core/tenantRegistryStore");
const { isTenantFeatureEnabled } = require("../core/accessPolicy");
const {
  clearTenantGuildApplicationCommands,
  deployGuildApplicationCommands,
} = require("../../../shared/discord/applicationCommandDeployScopes");
const { REST } = require("@discordjs/rest");
const {
  isGuildBotUsageBlacklisted,
  leaveGuildIfPresent,
} = require("../../Services/Moderation/botUsageBlacklistService");

async function syncTenantGiveawayCommands(client, guildId) {
  const gid = String(guildId || "").trim();
  if (!/^\d{16,20}$/.test(gid) || !client) return false;
  if (!isTenantFeatureEnabled(gid, "giveaway")) {
    return clearTenantGuildApplicationCommands(client, gid);
  }
  const giveawayCmd = Array.isArray(client.commandArray)
    ? client.commandArray.find((cmd) => String(cmd?.name || "").trim().toLowerCase() === "giveaway")
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

module.exports = {
  name: "guildCreate",
  async execute(guild, client) {
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
        } = require("../../Services/Moderation/botGuildLifecycleLogService");
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
    await sendGuildJoinWelcomeDm(client, guild).catch((err) => {
      global.logger?.warn?.(
        "[MultiGuild welcomeDm] guildCreate failed:",
        err?.code || err?.message || err,
      );
    });

    try {
      const {
        appendBotGuildLifecycleEvent,
        snapshotGuildMeta,
      } = require("../../Services/Moderation/botGuildLifecycleLogService");
      await appendBotGuildLifecycleEvent({
        type: "join",
        guildId: guild.id,
        ...snapshotGuildMeta(guild),
      }).catch(() => null);
    } catch (_) {}
  },
};
