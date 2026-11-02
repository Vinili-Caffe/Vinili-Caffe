const {
  refreshPartnershipConfigCache,
  setPartnershipSkipManager,
  setManagerLeaveAction,
  setManualPartnershipEnabled,
  clearPartnerDesc,
} = require("../../core/tenantPartnershipSettings") as typeof import("../../core/tenantPartnershipSettings");
const {
  PREFIX,
  parseCustomId,
  buildViewPayload,
  buildPingModal,
  buildThankYouEmbedModalPage1,
  buildThankYouEmbedModalPage2,
  buildPartnerDescModal,
} = require("../../../Partner/runtime/partnershipSettingsComponents") as typeof import("../../../Partner/runtime/partnershipSettingsComponents");
const { resolvePartnershipConfigSync } = require("../../../Partner/core/partnershipConfigResolver") as typeof import("../../../Partner/core/partnershipConfigResolver");
const { buildThankYouVariablesHelpPayload } = require("../../../Partner/runtime/partnershipEmbedTemplate") as typeof import("../../../Partner/runtime/partnershipEmbedTemplate");
const { PRIVATE_FLAG, ephemeralNotice } = require("./collectorsHelpers") as typeof import("./collectorsHelpers");
const { applyPanelPayload } = require("./settingsPanelHelpers") as typeof import("./settingsPanelHelpers");
const {
  acknowledgeSelectIfNeeded,
  startChannelCollector,
  startCategoryCollector,
  startRoleCollector,
} = require("./settingsCollectorsHelpers") as typeof import("./settingsCollectorsHelpers");
const { showSettingsModal } = require("./settingsModalsHelpers") as typeof import("./settingsModalsHelpers");

const SETTINGS_MODAL_SELECT_ACTIONS = new Set([
  "open_ping_modal",
  "custom_embed_edit_p1",
  "custom_embed_edit_p2",
  "desc_static_modal",
]);

async function acknowledgeSettingsSelectEarly(interaction?) {
  if (!interaction.isStringSelectMenu?.()) return;
  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.kind !== PREFIX || !String(parsed.action || "").startsWith("select:")) return;
  const selectedAction = String(interaction.values?.[0] || "").trim();
  if (!selectedAction || SETTINGS_MODAL_SELECT_ACTIONS.has(selectedAction)) return;
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
}

async function replyPrivateEmbeds(interaction?, payload?) {
  const body = payload && typeof payload === "object" ? payload : { embeds: payload };
  const replyPayload = { ...body, flags: PRIVATE_FLAG };
  if (interaction.isStringSelectMenu?.()) {
    await acknowledgeSelectIfNeeded(interaction);
    await interaction.followUp(replyPayload).catch(() => {});
    return;
  }
  await interaction.reply(replyPayload).catch(() => {});
}

async function processSettingsAction(interaction?, ownerId?, action?, lang?) {
  const guildId = interaction.guild.id;

  if (action === "open_channels") {
    const payload = buildViewPayload(interaction.guild, ownerId, "channels", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "open_roles") {
    const payload = buildViewPayload(interaction.guild, ownerId, "roles", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "toggle_skip") {
    await refreshPartnershipConfigCache().catch(() => null);
    const config = resolvePartnershipConfigSync(guildId);
    await setPartnershipSkipManager(guildId, !config?.skipManager);
    const payload = buildViewPayload(interaction.guild, ownerId, "home", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "back_home") {
    const payload = buildViewPayload(interaction.guild, ownerId, "home", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "open_ping_modal") {
    await showSettingsModal(interaction, ownerId, "home", buildPingModal, lang);
    return true;
  }
  if (action === "open_custom_embed") {
    const payload = buildViewPayload(interaction.guild, ownerId, "custom_embed", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "custom_embed_edit_p1") {
    await showSettingsModal(interaction, ownerId, "custom_embed", buildThankYouEmbedModalPage1, lang);
    return true;
  }
  if (action === "custom_embed_edit_p2") {
    await showSettingsModal(interaction, ownerId, "custom_embed", buildThankYouEmbedModalPage2, lang);
    return true;
  }
  if (action === "custom_embed_vars") {
    const payload = await buildThankYouVariablesHelpPayload(interaction, lang);
    await replyPrivateEmbeds(interaction, payload);
    return true;
  }
  if (action === "custom_embed_toggle_manual") {
    await refreshPartnershipConfigCache().catch(() => null);
    const config = resolvePartnershipConfigSync(guildId);
    await setManualPartnershipEnabled(guildId, !config?.manualPartnershipEnabled);
    const payload = buildViewPayload(interaction.guild, ownerId, "custom_embed", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "open_partner_desc") {
    const payload = buildViewPayload(interaction.guild, ownerId, "partner_desc", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "desc_channel") {
    await startChannelCollector(interaction, ownerId, "desc", lang);
    return true;
  }
  if (action === "desc_static_modal") {
    await showSettingsModal(interaction, ownerId, "partner_desc", buildPartnerDescModal, lang);
    return true;
  }
  if (action === "desc_clear") {
    await clearPartnerDesc(guildId);
    const payload = buildViewPayload(interaction.guild, ownerId, "partner_desc", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "open_behaviors") {
    const payload = buildViewPayload(interaction.guild, ownerId, "behaviors", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "behavior_create_role") {
    await startRoleCollector(interaction, ownerId, "badge", lang);
    return true;
  }
  if (action === "open_leave") {
    const payload = buildViewPayload(interaction.guild, ownerId, "leave", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "leave_back") {
    const payload = buildViewPayload(interaction.guild, ownerId, "behaviors", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "leave_delete_5m") {
    await setManagerLeaveAction(guildId, "delete");
    await refreshPartnershipConfigCache().catch(() => null);
    const config = resolvePartnershipConfigSync(guildId);
    const payload = buildViewPayload(interaction.guild, ownerId, "leave", config, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "leave_warn") {
    await setManagerLeaveAction(guildId, "warn");
    await refreshPartnershipConfigCache().catch(() => null);
    const config = resolvePartnershipConfigSync(guildId);
    const payload = buildViewPayload(interaction.guild, ownerId, "leave", config, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "leave_null") {
    await setManagerLeaveAction(guildId, null);
    await refreshPartnershipConfigCache().catch(() => null);
    const config = resolvePartnershipConfigSync(guildId);
    const payload = buildViewPayload(interaction.guild, ownerId, "leave", config, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "ch_partner") {
    await startChannelCollector(interaction, ownerId, "partner", lang);
    return true;
  }
  if (action === "ch_logs") {
    await startChannelCollector(interaction, ownerId, "logs", lang);
    return true;
  }
  if (action === "ch_pm_commands") {
    await startChannelCollector(interaction, ownerId, "pm_commands", lang);
    return true;
  }
  if (action === "ch_pm_categories") {
    await startCategoryCollector(interaction, ownerId, lang);
    return true;
  }
  if (action === "role_manager") {
    await startRoleCollector(interaction, ownerId, "manager", lang);
    return true;
  }

  return false;
}

async function handleSettingsSelect(interaction?, lang?) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.kind !== PREFIX || !String(parsed.action || "").startsWith("select:")) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await interaction.reply(ephemeralNotice(lang, "admin_notYourPanel", interaction.guild)).catch(() => {});
    return true;
  }
  const selectedAction = String(interaction.values?.[0] || "").trim();
  if (!selectedAction) return false;

  if (
    !SETTINGS_MODAL_SELECT_ACTIONS.has(selectedAction) &&
    !interaction.deferred &&
    !interaction.replied
  ) {
    await interaction.deferUpdate().catch(() => {});
  }

  return processSettingsAction(interaction, parsed.ownerId, selectedAction, lang);
}

async function handleSettingsButton(interaction?, lang?) {
  if (!interaction.isButton?.()) return false;

  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.kind !== PREFIX) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await interaction.reply(ephemeralNotice(lang, "admin_notYourPanel", interaction.guild)).catch(() => {});
    return true;
  }

  return processSettingsAction(interaction, parsed.ownerId, parsed.action, lang);
}

export = {
  acknowledgeSettingsSelectEarly,
  handleSettingsSelect,
  handleSettingsButton,
  processSettingsAction,
};
