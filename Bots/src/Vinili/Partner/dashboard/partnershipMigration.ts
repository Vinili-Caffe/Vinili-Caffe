/** Dashboard partnership: migrazione dello storico. */
const { getPartnershipConfigSync, refreshPartnershipConfigCache } = require("../../Partner/core/tenantPartnershipSettings") as typeof import("../../Partner/core/tenantPartnershipSettings");
const { verifyDashboardGuildAccess } = require("../../../MultiGuild/site/dashboard/siteDashboardApi") as typeof import("../../../MultiGuild/site/dashboard/siteDashboardApi");
const { reasonToMessage, fail } = require("./partnershipSerialize") as typeof import("./partnershipSerialize");
const { parseOptionalId } = require("./partnershipGuildPicker") as typeof import("./partnershipGuildPicker");

async function getDashboardPartnershipMigration(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }

  const {
    getPartnershipHistoryMigrationStatus,
  } = require("../../Partner/services/tenantPartnershipHistoryMigrationService") as typeof import("../../Partner/services/tenantPartnershipHistoryMigrationService");
  const status = await getPartnershipHistoryMigrationStatus(access.guildId);
  await refreshPartnershipConfigCache().catch(() => null);
  const config = getPartnershipConfigSync(access.guildId);
  return {
    ...status,
    guildId: access.guildId,
    defaults: {
      partnershipsChannelId: config?.partnershipsChannelId || null,
      logsChannelId: config?.logsChannelId || null,
      partnerManagerRoleId: config?.partnerManagerRoleId || null,
    },
  };
}

async function startDashboardPartnershipMigration(client?, accessToken?, guildId?, body?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }

  const payload = body && typeof body === "object" ? body : {};
  const mode = String(payload.mode || "configured").trim().toLowerCase() === "custom" ? "custom" : "configured";
  const channelParsed = parseOptionalId(payload.channelId);
  const logsParsed = parseOptionalId(payload.logsChannelId);
  const roleParsed = parseOptionalId(payload.roleId);
  if (channelParsed.invalid || logsParsed.invalid || roleParsed.invalid) {
    return fail(400, "invalid_channel", "Canale o ruolo non valido.");
  }

  const {
    enqueuePartnershipHistoryMigration,
    startPartnershipHistoryMigrationWorker,
  } = require("../../Partner/services/tenantPartnershipHistoryMigrationService") as typeof import("../../Partner/services/tenantPartnershipHistoryMigrationService");

  try {
    startPartnershipHistoryMigrationWorker(client);
  } catch (_) {}

  return enqueuePartnershipHistoryMigration({
    guildId: access.guildId,
    requestedBy: access.userId,
    mode,
    channelId: channelParsed.id,
    logsChannelId: logsParsed.id,
    roleId: roleParsed.id,
    client,
  });
}

async function undoDashboardPartnershipMigration(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }

  const {
    undoPartnershipHistoryMigration,
  } = require("../../Partner/services/tenantPartnershipHistoryMigrationService") as typeof import("../../Partner/services/tenantPartnershipHistoryMigrationService");
  return undoPartnershipHistoryMigration(access.guildId, { requestedBy: access.userId });
}

export = { getDashboardPartnershipMigration, startDashboardPartnershipMigration, undoDashboardPartnershipMigration };
