const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { getBotState, setBotState } = require("../../../Utils/BotState/botStateStore") as typeof import("../../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../../Utils/Database/mongoConnect") as typeof import("../../../Utils/Database/mongoConnect");
const {
  refreshPartnershipConfigCache,
  getPartnershipConfigSync,
  removePartnershipConfig,
  isPartnershipSetupComplete,
} = require("../../../MultiGuild/core/tenantPartnershipSettings") as typeof import("../../../MultiGuild/core/tenantPartnershipSettings");
const { invalidateLeaderboardCache } = require("./tenantLeaderboardService") as typeof import("./tenantLeaderboardService");

const JOIN_STATS_KEY = "tenantPartnershipJoinStats.v1";
const STAFF_NOTIFICATIONS_KEY = "tenantStaffNotifications.v1";

async function clearGuildJoinStats(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || !isMongoReady()) return false;
  const raw = await getBotState(JOIN_STATS_KEY, null);
  const map = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  if (!Object.prototype.hasOwnProperty.call(map, gid)) return false;
  delete map[gid];
  return Boolean(await setBotState(JOIN_STATS_KEY, map));
}

async function clearGuildStaffNotifications(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || !isMongoReady()) return false;
  const raw = await getBotState(STAFF_NOTIFICATIONS_KEY, null);
  const byGuild =
    raw?.byGuild && typeof raw.byGuild === "object" ? { ...raw.byGuild } : {};
  if (!Object.prototype.hasOwnProperty.call(byGuild, gid)) return false;
  delete byGuild[gid];
  return Boolean(await setBotState(STAFF_NOTIFICATIONS_KEY, { byGuild }));
}

async function clearTenantPartnershipGuildData(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return { ok: false, reason: "invalid_guild" };

  const hadConfig = Boolean(getPartnershipConfigSync(gid));
  const configResult = await removePartnershipConfig(gid);
  if (!configResult.ok && configResult.reason !== "not_configured") {
    return configResult;
  }

  const [joinStatsCleared, notificationsCleared, blacklistCleared] = await Promise.all([
    clearGuildJoinStats(gid),
    clearGuildStaffNotifications(gid),
    require("./tenantPartnershipBlacklistService")
      .clearTenantPartnershipBlacklist(gid)
      .then((row?) => Boolean(row?.deleted))
      .catch(() => false),
  ]);

  invalidateLeaderboardCache();
  await refreshPartnershipConfigCache().catch(() => null);

  return {
    ok: true,
    hadConfig,
    configRemoved: configResult.ok,
    joinStatsCleared,
    notificationsCleared,
    blacklistCleared,
  };
}

function buildLeavePartnershipDoneEmbed(lang?, guildName?) {
  const isIt = lang === "it";
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(isIt ? "Configurazione partnership rimossa" : "Partnership configuration removed")
    .setDescription(
      isIt
        ? [
            `La configurazione partnership di **${guildName}** è stata azzerata.`,
            "",
            "Puoi ricominciare da zero con `+setup`.",
          ].join("\n")
        : [
            `Partnership configuration for **${guildName}** has been cleared.`,
            "",
            "You can start over with `+setup`.",
          ].join("\n"),
    );
}

function buildLeavePartnershipNothingEmbed(lang?) {
  const isIt = lang === "it";
  return new EmbedBuilder()
    .setColor("#826bc2")
    .setDescription(
      isIt
        ? "<:vegax:1443934876440068179> Questo server **non ha** una configurazione partnership da rimuovere."
        : "<:vegax:1443934876440068179> This server has **no** partnership configuration to remove.",
    );
}

function hasPartnershipConfigToClear(guildId?) {
  const cfg = getPartnershipConfigSync(guildId);
  if (!cfg) return false;
  return Boolean(
    isPartnershipSetupComplete(cfg) ||
      cfg.partnershipsChannelId ||
      cfg.logsChannelId ||
      cfg.partnerManagerRoleId ||
      cfg.pmCommandsChannelId ||
      (Array.isArray(cfg.pmCommandsCategoryIds) && cfg.pmCommandsCategoryIds.length) ||
      cfg.partnerDesc?.configured ||
      cfg.pings?.configured ||
      cfg.thankYouEmbed?.description ||
      cfg.manualPartnershipEnabled ||
      cfg.managerBadgeRoleId ||
      cfg.managerLeaveAction ||
      cfg.behaviorDeleteAction,
  );
}

async function hasPartnershipLeaveWork(guildId?) {
  return hasPartnershipConfigToClear(guildId);
}

async function handleTenantGuildBotRemoved(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return { ok: false, reason: "invalid_guild" };

  const partnership = await clearTenantPartnershipGuildData(gid);

  let managedInviteRemoved = false;
  try {
    const { removeManagedInvite } = require("../../../MultiGuild/services/guildJoinAlertService") as typeof import("../../../MultiGuild/services/guildJoinAlertService");
    managedInviteRemoved = Boolean(await removeManagedInvite(gid));
  } catch (_) {}

  let registryRemoved = false;
  try {
    const { unregisterTenantGuild } = require("../../../MultiGuild/core/tenantRegistryStore") as typeof import("../../../MultiGuild/core/tenantRegistryStore");
    registryRemoved = Boolean(await unregisterTenantGuild(gid));
  } catch (_) {}

  try {
    const { clearTenantDescriptionCache } = require("./tenantPartnerDescriptionService") as typeof import("./tenantPartnerDescriptionService");
    clearTenantDescriptionCache(gid);
  } catch (_) {}

  return {
    ok: Boolean(partnership?.ok),
    partnership,
    managedInviteRemoved,
    registryRemoved,
  };
}

export = {
  clearTenantPartnershipGuildData,
  handleTenantGuildBotRemoved,
  hasPartnershipLeaveWork,
  buildLeavePartnershipDoneEmbed,
  buildLeavePartnershipNothingEmbed,
};
