const { safePanelMessageUpdate } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const {
  refreshPartnershipConfigCache,
  getPartnershipConfigSync,
  setPartnershipPings,
  completePartnershipSetup,
} = require("../../core/tenantPartnershipSettings") as typeof import("../../core/tenantPartnershipSettings");
const { parsePingMemberThresholdInput } = require("../../../Utils/Partner/partnershipPingUtils") as typeof import("../../../Utils/Partner/partnershipPingUtils");
const { ensurePartnershipChannelInvite } = require("../../../Services/Partner/partnershipInviteService") as typeof import("../../../Services/Partner/partnershipInviteService");
const {
  PREFIX,
  MODAL_PREFIX,
  parseCustomId,
  buildStepPayload,
  buildPingModal,
} = require("../../../Utils/Partner/partnershipSetupComponents") as typeof import("../../../Utils/Partner/partnershipSetupComponents");
const { setTenantObjectiveFlag } = require("../../services/Partner/tenantObjectiveService") as typeof import("../../services/Partner/tenantObjectiveService");
const { ephemeralNotice, parseOptionalInt, parseCustomRoleToken } = require("./collectorsHelpers") as typeof import("./collectorsHelpers");
const { startChannelCollector, startRoleCollector } = require("./setupCollectorsHelpers") as typeof import("./setupCollectorsHelpers");

async function applyPanelPayload(interaction?, payload?) {
  await safePanelMessageUpdate(interaction, payload);
}

async function handleSetupModal(interaction?, lang?) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.kind !== MODAL_PREFIX || parsed.action !== "ping") return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await interaction.reply(ephemeralNotice(lang, "admin_notYourPanel", interaction.guild)).catch(() => {});
    return true;
  }

  const hereMembers = parsePingMemberThresholdInput(interaction.fields.getTextInputValue("here_members"));
  const everyoneMembers = parsePingMemberThresholdInput(interaction.fields.getTextInputValue("everyone_members"));
  const customRoleRaw = String(interaction.fields.getTextInputValue("custom_role_id") || "").trim();
  const customRoleMembers = parseOptionalInt(interaction.fields.getTextInputValue("custom_role_members"));

  if (
    Number.isNaN(hereMembers) ||
    Number.isNaN(everyoneMembers) ||
    Number.isNaN(customRoleMembers)
  ) {
    await interaction
      .reply(ephemeralNotice(lang, "admin_invalidNumbers", interaction.guild))
      .catch(() => {});
    return true;
  }

  let customRoleId = null;
  if (customRoleRaw) {
    customRoleId = parseCustomRoleToken(customRoleRaw);
    if (!customRoleId || !interaction.guild.roles.cache.has(customRoleId)) {
      await interaction
        .reply(ephemeralNotice(lang, "admin_invalidCustomRole", interaction.guild))
        .catch(() => {});
      return true;
    }
  }

  if ((customRoleId && customRoleMembers === null) || (!customRoleId && customRoleMembers !== null)) {
    await interaction
      .reply(ephemeralNotice(lang, "admin_customPingIncomplete", interaction.guild))
      .catch(() => {});
    return true;
  }

  const saved = await setPartnershipPings(interaction.guild.id, {
    hereMembers,
    everyoneMembers,
    customRoleId,
    customRoleMembers,
  });
  if (!saved.ok) {
    await interaction
      .reply(ephemeralNotice(lang, "admin_saveFailed", interaction.guild))
      .catch(() => {});
    return true;
  }

  await refreshPartnershipConfigCache().catch(() => null);
  const config = getPartnershipConfigSync(interaction.guild.id);
  const payload = buildStepPayload(interaction.guild, parsed.ownerId, "pings", config, lang);
  await interaction.message?.edit?.(payload).catch(() => null);
  await interaction
    .reply(ephemeralNotice(lang, "admin_pingSaved", interaction.guild))
    .catch(() => {});
  return true;
}

async function handleSetupButton(interaction?, lang?) {
  if (!interaction.isButton?.()) return false;

  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.kind !== PREFIX) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await interaction.reply(ephemeralNotice(lang, "admin_notYourPanel", interaction.guild)).catch(() => {});
    return true;
  }

  const { action, ownerId } = parsed;

  if (action === "ch_partner") {
    await startChannelCollector(interaction, ownerId, "partner", lang);
    return true;
  }
  if (action === "ch_logs") {
    await startChannelCollector(interaction, ownerId, "logs", lang);
    return true;
  }
  if (action === "ch_next") {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    await refreshPartnershipConfigCache().catch(() => null);
    const config = getPartnershipConfigSync(interaction.guild.id);
    if (!config?.partnershipsChannelId) {
      await interaction
        .reply(ephemeralNotice(lang, "admin_setup_needPartnerChannel", interaction.guild))
        .catch(() => {});
      return true;
    }
    const payload = buildStepPayload(interaction.guild, ownerId, "roles", config, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }

  if (action === "role_manager") {
    await startRoleCollector(interaction, ownerId, lang);
    return true;
  }
  if (action === "role_next") {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    await refreshPartnershipConfigCache().catch(() => null);
    const config = getPartnershipConfigSync(interaction.guild.id);
    if (!config?.partnerManagerRoleId) {
      await interaction
        .reply(ephemeralNotice(lang, "admin_setup_needPartnerRole", interaction.guild))
        .catch(() => {});
      return true;
    }
    const payload = buildStepPayload(interaction.guild, ownerId, "pings", config, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }

  if (action === "ping_config") {
    await refreshPartnershipConfigCache().catch(() => null);
    const config = getPartnershipConfigSync(interaction.guild.id);
    await interaction.showModal(buildPingModal(ownerId, config, lang)).catch(() => {});
    return true;
  }

  if (action === "ping_done") {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    await refreshPartnershipConfigCache().catch(() => null);
    const config = getPartnershipConfigSync(interaction.guild.id);
    if (!config?.partnershipsChannelId || !config?.partnerManagerRoleId) {
      await interaction
        .reply(ephemeralNotice(lang, "admin_setup_needRequired", interaction.guild))
        .catch(() => {});
      return true;
    }
    if (config.partnershipsChannelId) {
      await ensurePartnershipChannelInvite(interaction.guild, config.partnershipsChannelId);
      await refreshPartnershipConfigCache().catch(() => null);
    }
    await completePartnershipSetup(interaction.guild.id, ownerId);
    void setTenantObjectiveFlag(interaction.client, interaction.guild.id, ownerId, "setupDone", {
      discordLocale: interaction.locale,
    }).catch(() => null);
    await refreshPartnershipConfigCache().catch(() => null);
    const fresh = getPartnershipConfigSync(interaction.guild.id);
    const payload = buildStepPayload(interaction.guild, ownerId, "complete", fresh, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }

  return false;
}

export = {
  handleSetupModal,
  handleSetupButton,
};
