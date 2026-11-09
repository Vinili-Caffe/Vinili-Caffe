/**
 * Backup / ripristino configurazione dashboard di un server.
 * Include: impostazioni (prefisso, canali, bacheca), ACL comandi, partnership (config), ticket (impostazioni).
 * Esclude: ticket aperti/chiusi, transcript, storia partnership, punti manager, audit, media bot.
 */
const { verifyDashboardGuildAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const {
  getTenantSettingsSnapshotSync,
  refreshTenantGuildSettingsCache,
  ensureTenantGuildSettingsCacheFresh,
} = require("../../core/tenantGuildSettings") as typeof import("../../core/tenantGuildSettings");
const { patchDashboardGuildSettings } = require("./siteDashboardGuildSettingsApi") as typeof import("./siteDashboardGuildSettingsApi");
const { patchDashboardGuildCommands } = require("./siteDashboardGuildCommandsApi") as typeof import("./siteDashboardGuildCommandsApi");
const {
  getDashboardPartnership,
  patchDashboardPartnership,
} = require("../../../Vinili/Partner/dashboard/siteDashboardPartnershipApi") as typeof import("../../../Vinili/Partner/dashboard/siteDashboardPartnershipApi");
const {
  getDashboardTickets,
  patchDashboardTickets,
} = require("../../tickets/dashboard/siteDashboardTicketsApi") as typeof import("../../tickets/dashboard/siteDashboardTicketsApi");

const CONFIG_VERSION = 1;

function fail(status?, error?, message?) {
  return { ok: false, status: status || 400, error: error || "bad_request", message: message || "Operazione non riuscita." };
}

function pickTicketSettings(settings?) {
  if (!settings || typeof settings !== "object") return null;
  const {
    defaultDiscordCategoryName: _d,
    categoryNameLive: _c,
    ...rest
  } = settings;
  return rest;
}

function pickPartnershipConfig(partnership?) {
  if (!partnership || typeof partnership !== "object") return null;
  const {
    setupCompleted: _sc,
    setupCompletedAt: _sca,
    invite: _inv,
    ...rest
  } = partnership;
  return rest;
}

async function exportDashboardGuildConfig(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  if (!access.botPresent) {
    return fail(400, "bot_missing", "Il bot non è presente in questo server.");
  }

  await Promise.all([
    ensureTenantGuildSettingsCacheFresh().catch(() => null),
    refreshTenantGuildSettingsCache().catch(() => null),
  ]);

  const snapshot = getTenantSettingsSnapshotSync(access.guildId);
  const [partnershipRes, ticketsRes] = await Promise.all([
    getDashboardPartnership(client, accessToken, access.guildId).catch(() => null),
    getDashboardTickets(client, accessToken, access.guildId).catch(() => null),
  ]);

  const partnership =
    partnershipRes?.ok === true ? pickPartnershipConfig(partnershipRes.partnership) : null;
  const tickets = ticketsRes?.ok === true ? pickTicketSettings(ticketsRes.settings) : null;

  return {
    ok: true,
    status: 200,
    filename: `vinili-config-${access.guildId}.json`,
    config: {
      version: CONFIG_VERSION,
      exportedAt: new Date().toISOString(),
      guildId: access.guildId,
      settings: {
        prefix: snapshot.prefix,
        updatesChannelId: snapshot.updatesChannelId,
        dashboardRoleIds: Array.isArray(snapshot.dashboardRoleIds) ? snapshot.dashboardRoleIds : [],
        dashboardUserIds: Array.isArray(snapshot.dashboardUserIds) ? snapshot.dashboardUserIds : [],
        boards: snapshot.boards || null,
      },
      commands: snapshot.commands && typeof snapshot.commands === "object" ? snapshot.commands : {},
      partnership,
      tickets,
    },
  };
}

async function importDashboardGuildConfig(client?, accessToken?, guildId?, body?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  if (!access.botPresent) {
    return fail(400, "bot_missing", "Il bot non è presente in questo server.");
  }

  const raw = body && typeof body === "object" ? body : {};
  const config = raw.config && typeof raw.config === "object" ? raw.config : raw;
  const version = Number(config.version);
  if (!Number.isFinite(version) || version < 1 || version > CONFIG_VERSION) {
    return fail(400, "invalid_config", "Backup non valido o versione non supportata.");
  }

  const applied = { settings: false, commands: false, partnership: false, tickets: false };
  const errors = [];

  if (config.settings && typeof config.settings === "object") {
    const settingsBody: Record<string, any> = {};
    if (Object.prototype.hasOwnProperty.call(config.settings, "prefix")) {
      settingsBody.prefix = config.settings.prefix;
    }
    if (Object.prototype.hasOwnProperty.call(config.settings, "updatesChannelId")) {
      settingsBody.updatesChannelId = config.settings.updatesChannelId;
    }
    if (Object.prototype.hasOwnProperty.call(config.settings, "dashboardRoleIds")) {
      settingsBody.dashboardRoleIds = config.settings.dashboardRoleIds;
    }
    if (Object.prototype.hasOwnProperty.call(config.settings, "dashboardUserIds")) {
      settingsBody.dashboardUserIds = config.settings.dashboardUserIds;
    }
    if (Object.prototype.hasOwnProperty.call(config.settings, "boards")) {
      settingsBody.boards = config.settings.boards;
    }
    if (Object.keys(settingsBody).length) {
      const out = await patchDashboardGuildSettings(client, accessToken, access.guildId, settingsBody);
      if (out?.ok === true) applied.settings = true;
      else errors.push(out?.message || "Impostazioni non ripristinate.");
    }
  }

  if (config.commands && typeof config.commands === "object" && !Array.isArray(config.commands)) {
    const out = await patchDashboardGuildCommands(client, accessToken, access.guildId, {
      commands: config.commands,
    });
    if (out?.ok === true) applied.commands = true;
    else if (Object.keys(config.commands).length) errors.push(out?.message || "Comandi non ripristinati.");
  }

  if (config.partnership && typeof config.partnership === "object") {
    const out = await patchDashboardPartnership(
      client,
      accessToken,
      access.guildId,
      pickPartnershipConfig(config.partnership),
    );
    if (out?.ok === true) applied.partnership = true;
    else errors.push(out?.message || "Partnership non ripristinata.");
  }

  if (config.tickets && typeof config.tickets === "object") {
    const out: any = await patchDashboardTickets(
      client,
      accessToken,
      access.guildId,
      pickTicketSettings(config.tickets),
    );
    if (out?.ok === true) applied.tickets = true;
    else errors.push(out?.message || "Ticket non ripristinati.");
  }

  if (!applied.settings && !applied.commands && !applied.partnership && !applied.tickets) {
    return fail(400, "nothing_applied", errors[0] || "Nessuna sezione da ripristinare nel backup.");
  }

  return {
    ok: true,
    status: 200,
    guildId: access.guildId,
    applied,
    warnings: errors,
    message: errors.length
      ? `Ripristino parziale: ${errors.join(" ")}`
      : "Configurazione ripristinata dal backup.",
  };
}

export = {
  exportDashboardGuildConfig,
  importDashboardGuildConfig,
  CONFIG_VERSION,
};
