const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { sendAntiNukeLog } = require("./antiNukeLog") as typeof import("./antiNukeLog");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
function createPanicCaseId() {
  const base = Date.now().toString(36).slice(-6);
  const rand = Math.floor(Math.random() * 46656).toString(36).padStart(3, "0");
  return `${base}${rand}`;
}

function ensurePanicReport(state?) {
  if (!state.panicReport || typeof state.panicReport !== "object") {
    state.panicReport = {
      quarantinedUserIds: new Set(),
      roles: { deleted: 0, recovered: 0, edited: 0 },
      channels: { deleted: 0, recovered: 0, edited: 0 },
      categories: { deleted: 0, recovered: 0, edited: 0 },
      webhooks: { deleted: 0 },
      backup: {
        enabled: Boolean(ANTINUKE_CONFIG.panicMode.autoBackupSync?.enabled),
        loaded: false,
      },
      settings: {
        server: Boolean(ANTINUKE_CONFIG.panicMode.lockdown?.lockAllCommands),
        wick: Boolean(ANTINUKE_CONFIG.panicMode.lockdown?.lockModerationCommands),
      },
    };
  }
  if (!(state.panicReport.quarantinedUserIds instanceof Set)) {
    state.panicReport.quarantinedUserIds = new Set(
      Array.isArray(state.panicReport.quarantinedUserIds)
        ? state.panicReport.quarantinedUserIds
        : [],
    );
  }
  return state.panicReport;
}

function incrementPanicMetric(state?, bucket?, field?, value = 1) {
  const report = ensurePanicReport(state);
  if (!report?.[bucket] || typeof report[bucket] !== "object") return;
  const prev = Number(report[bucket][field] || 0);
  report[bucket][field] = Math.max(0, prev + Number(value || 0));
}

async function sendPanicModeDetailedReport(
  guild?,
  state?,
  {
    reason = "panic_end",
    backupSummary = null,
  } = {},
) {
  if (!guild || !state) return;
  const report = ensurePanicReport(state);
  if (backupSummary) {
    report.backup.loaded = Boolean(backupSummary.loaded);
    incrementPanicMetric(state, "roles", "deleted", Number(backupSummary.rolesDeleted || 0));
    incrementPanicMetric(state, "roles", "recovered", Number(backupSummary.rolesRecovered || 0));
    incrementPanicMetric(state, "channels", "deleted", Number(backupSummary.channelsDeleted || 0));
    incrementPanicMetric(state, "channels", "recovered", Number(backupSummary.channelsRecovered || 0));
    incrementPanicMetric(state, "categories", "deleted", Number(backupSummary.categoriesDeleted || 0));
    incrementPanicMetric(state, "categories", "recovered", Number(backupSummary.categoriesRecovered || 0));
    incrementPanicMetric(state, "webhooks", "deleted", Number(backupSummary.webhooksDeleted || 0));
  }

  const caseId = String(state.panicCaseId || createPanicCaseId());
  const quarantinedCount = Number(report.quarantinedUserIds?.size || 0);
  const backupEnabled = Boolean(ANTINUKE_CONFIG.panicMode.autoBackupSync?.enabled);
  const backupLabel = backupEnabled ? report.backup.loaded ? `${E.success} Backup/restore completato.` : `${E.cancel} Backup abilitato ma senza modifiche applicate.` : `${E.cancel} Backup disabilitato.`;

  const lines = [
    `${E.VC_Alert} **Panic Mode Triggered! [Anti Nuke]**`,
    `${E.VC_reason} Attivato monitoraggio anomalo e lockdown.`,
    "",
    `${E.VC_Alert} **Panic Mode Report**`,
    `${E.VC_Alert} **CASE:**\`${caseId}\``,
    `${E.VC_reason} **Reason:** ${String(reason || "panic_end")}`,
    `${E.member_role_icon} **Members Quarantined:** ${quarantinedCount}`,
    "",
    `${E.VC_Alert} **Backup System Report**`,
    `${E.VC_reason}${backupLabel}`,
    "",
    `${E.VC_Mention} **Roles**`,
    `${E.cancel} Deleted: ${Number(report.roles.deleted || 0)}`,
    `${E.success} Recovered: ${Number(report.roles.recovered || 0)}`,
    `Edited: ${Number(report.roles.edited || 0)}`,
    `${E.channeltext__470551} **Channels**`,
    `${E.cancel} Deleted: ${Number(report.channels.deleted || 0)}`,
    `${E.success} Recovered: ${Number(report.channels.recovered || 0)}`,
    `${E.VC_right_arrow} Edited: ${Number(report.channels.edited || 0)}`,
    `${E.VC_category} **Categories**`,
    `${E.cancel} Deleted: ${Number(report.categories.deleted || 0)}`,
    `${E.success} Recovered: ${Number(report.categories.recovered || 0)}`,
    `${E.VC_right_arrow} Edited: ${Number(report.categories.edited || 0)}`,
    `${E.VC_webhooks} **Webhooks**`,
    `${E.cancel} Deleted: ${Number(report.webhooks.deleted || 0)}`,
    `${E.VC_tools} **Settings**`,
    `${E.VC_tools} Server: ${report.settings.server ? "ON" : "OFF"}`,
    `Bot: ${report.settings.wick ? "ON" : "OFF"}`,
  ];

  await sendAntiNukeLog(guild, `${E.VC_Alert} AntiNuke Panic Mode Report`, lines, "#57F287");
}

export = {
  createPanicCaseId,
  ensurePanicReport,
  incrementPanicMetric,
  sendPanicModeDetailedReport,
};
