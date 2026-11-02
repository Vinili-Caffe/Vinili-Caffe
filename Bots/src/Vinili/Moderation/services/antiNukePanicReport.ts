const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { sendAntiNukeLog } = require("./antiNukeLog") as typeof import("./antiNukeLog");

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
  const backupLabel = backupEnabled ? report.backup.loaded ? "<:success:1461731530333229226> Backup/restore completato." : "<:cancel:1461730653677551691> Backup abilitato ma senza modifiche applicate." : "<:cancel:1461730653677551691> Backup disabilitato.";

  const lines = [
    `<a:VC_Alert:1482706673176150077> **Panic Mode Triggered! [Anti Nuke]**`,
    `<:VC_reason:1478517122929004544> Attivato monitoraggio anomalo e lockdown.`,
    "",
    `<a:VC_Alert:1482706673176150077> **Panic Mode Report**`,
    `<a:VC_Alert:1482706673176150077> **CASE:**\`${caseId}\``,
    `<:VC_reason:1478517122929004544> **Reason:** ${String(reason || "panic_end")}`,
    `<:member_role_icon:1330530086792728618> **Members Quarantined:** ${quarantinedCount}`,
    "",
    `<a:VC_Alert:1482706673176150077> **Backup System Report**`,
    `<:VC_reason:1478517122929004544>${backupLabel}`,
    "",
    `<:VC_Mention:1482526855289634997> **Roles**`,
    `<:cancel:1461730653677551691> Deleted: ${Number(report.roles.deleted || 0)}`,
    `<:success:1461731530333229226> Recovered: ${Number(report.roles.recovered || 0)}`,
    `Edited: ${Number(report.roles.edited || 0)}`,
    `<:channeltext:1443247599752470551> **Channels**`,
    `<:cancel:1461730653677551691> Deleted: ${Number(report.channels.deleted || 0)}`,
    `<:success:1461731530333229226> Recovered: ${Number(report.channels.recovered || 0)}`,
    `<:VC_right_arrow:1482459908245815296> Edited: ${Number(report.channels.edited || 0)}`,
    `<:VC_category:1478836096669581505> **Categories**`,
    `<:cancel:1461730653677551691> Deleted: ${Number(report.categories.deleted || 0)}`,
    `<:success:1461731530333229226> Recovered: ${Number(report.categories.recovered || 0)}`,
    `<:VC_right_arrow:1482459908245815296> Edited: ${Number(report.categories.edited || 0)}`,
    `<:VC_webhooks:1478515450769047704> **Webhooks**`,
    `<:cancel:1461730653677551691> Deleted: ${Number(report.webhooks.deleted || 0)}`,
    `<:VC_tools:1478862265305272364> **Settings**`,
    `<:VC_tools:1478862265305272364> Server: ${report.settings.server ? "ON" : "OFF"}`,
    `Bot: ${report.settings.wick ? "ON" : "OFF"}`,
  ];

  await sendAntiNukeLog(guild, "<a:VC_Alert:1482706673176150077> AntiNuke Panic Mode Report", lines, "#57F287");
}

export = {
  createPanicCaseId,
  ensurePanicReport,
  incrementPanicMetric,
  sendPanicModeDetailedReport,
};
