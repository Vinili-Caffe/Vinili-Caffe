const {
  refreshPartnershipConfigCache,
  setPartnershipPings,
  setThankYouEmbed,
  setPartnerDescStatic,
} = require("../../core/tenantPartnershipSettings") as typeof import("../../core/tenantPartnershipSettings");
const { parsePingDelayInput, DEFAULT_CUSTOM_ROLE_PING_DELAY_MS, parsePingMemberThresholdInput } = require("../../../Utils/Partner/partnershipPingUtils") as typeof import("../../../Utils/Partner/partnershipPingUtils");
const {
  MODAL_PREFIX,
  parseCustomId,
  buildViewPayload,
  buildThankYouEmbedModalPage1,
  buildThankYouEmbedModalPage2,
} = require("../../../Utils/Partner/partnershipSettingsComponents") as typeof import("../../../Utils/Partner/partnershipSettingsComponents");
const { seedDefaultThankYouEmbedIfEmpty } = require("../../../Utils/Partner/partnershipThankYouEmbed") as typeof import("../../../Utils/Partner/partnershipThankYouEmbed");
const { t } = require("../../utils/Partner/tenantPartnershipI18n/index") as typeof import("../../utils/Partner/tenantPartnershipI18n/index");
const { resolvePartnershipConfigSync } = require("../../../Utils/Partner/partnershipConfigResolver") as typeof import("../../../Utils/Partner/partnershipConfigResolver");
const { setTenantObjectiveFlag } = require("../../services/Partner/tenantObjectiveService") as typeof import("../../services/Partner/tenantObjectiveService");
const {
  parseEmbedColorInput,
  parseEmbedTimestampInput,
  normalizeOptionalUrl,
} = require("../../../Utils/Partner/partnershipEmbedTemplate") as typeof import("../../../Utils/Partner/partnershipEmbedTemplate");
const { ephemeralNotice, parseOptionalInt, parseCustomRoleToken } = require("./collectorsHelpers") as typeof import("./collectorsHelpers");
const { textEphemeralNotice, refreshPanel } = require("./settingsPanelHelpers") as typeof import("./settingsPanelHelpers");

async function showSettingsModal(interaction?, ownerId?, view?, buildModal?, lang?) {
  if (interaction.deferred || interaction.replied) return;
  await refreshPartnershipConfigCache().catch(() => null);
  if (buildModal === buildThankYouEmbedModalPage1 || buildModal === buildThankYouEmbedModalPage2) {
    await seedDefaultThankYouEmbedIfEmpty(interaction.guild.id).catch(() => null);
    await refreshPartnershipConfigCache().catch(() => null);
  }
  const config = resolvePartnershipConfigSync(interaction.guild.id);
  await interaction.showModal(buildModal(ownerId, config, lang)).catch(() => {});
  const payload = buildViewPayload(interaction.guild, ownerId, view, config, lang);
  await interaction.message?.edit?.(payload).catch(() => {});
}

async function handleSettingsModal(interaction?, lang?) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.kind !== MODAL_PREFIX) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await interaction.reply(ephemeralNotice(lang, "admin_notYourPanel", interaction.guild)).catch(() => {});
    return true;
  }

  if (parsed.action === "thank_you_p1") {
    const saved = await setThankYouEmbed(interaction.guild.id, {
      color: parseEmbedColorInput(interaction.fields.getTextInputValue("embed_color")),
      authorIconUrl: normalizeOptionalUrl(interaction.fields.getTextInputValue("embed_author_icon")),
      authorName: String(interaction.fields.getTextInputValue("embed_author_name") || "").trim() || null,
      title: String(interaction.fields.getTextInputValue("embed_title") || "").trim() || null,
      thumbnailUrl: normalizeOptionalUrl(interaction.fields.getTextInputValue("embed_thumbnail")),
    });
    if (!saved.ok) {
      await interaction
        .reply(ephemeralNotice(lang, "admin_saveFailed", interaction.guild))
        .catch(() => {});
      return true;
    }
    await refreshPartnershipConfigCache().catch(() => null);
    void setTenantObjectiveFlag(interaction.client, interaction.guild.id, interaction.user.id, "thankYouSet", {
      discordLocale: interaction.locale,
    }).catch(() => null);
    await refreshPanel(interaction, "custom_embed", lang);
    await interaction
      .reply(ephemeralNotice(lang, "settings_embedP1Saved", interaction.guild))
      .catch(() => {});
    return true;
  }

  if (parsed.action === "thank_you_p2") {
    const description = String(interaction.fields.getTextInputValue("embed_description") || "").trim() || null;
    const saved = await setThankYouEmbed(interaction.guild.id, {
      description,
      imageUrl: normalizeOptionalUrl(interaction.fields.getTextInputValue("embed_image")),
      footerText: String(interaction.fields.getTextInputValue("embed_footer") || "").trim() || null,
      footerIconUrl: normalizeOptionalUrl(interaction.fields.getTextInputValue("embed_footer_icon")),
      timestampEnabled: parseEmbedTimestampInput(interaction.fields.getTextInputValue("embed_timestamp")),
    });
    if (!saved.ok) {
      await interaction
        .reply(ephemeralNotice(lang, "admin_saveFailed", interaction.guild))
        .catch(() => {});
      return true;
    }
    await refreshPartnershipConfigCache().catch(() => null);
    void setTenantObjectiveFlag(interaction.client, interaction.guild.id, interaction.user.id, "thankYouSet", {
      discordLocale: interaction.locale,
    }).catch(() => null);
    await refreshPanel(interaction, "custom_embed", lang);
    await interaction
      .reply(ephemeralNotice(lang, "settings_embedSaved", interaction.guild))
      .catch(() => {});
    return true;
  }

  if (parsed.action === "partner_desc_static") {
    const staticText = String(interaction.fields.getTextInputValue("partner_desc_text") || "").trim();
    if (!staticText) {
      await interaction
        .reply(ephemeralNotice(lang, "settings_descEmpty", interaction.guild))
        .catch(() => {});
      return true;
    }
    const saved = await setPartnerDescStatic(interaction.guild.id, staticText);
    if (!saved.ok) {
      const err =
        saved.reason === "too_long" ? t(lang, "settings_descTooLong") : t(lang, "admin_saveFailed");
      await interaction.reply(textEphemeralNotice(err, interaction.guild)).catch(() => {});
      return true;
    }
    await refreshPartnershipConfigCache().catch(() => null);
    void setTenantObjectiveFlag(interaction.client, interaction.guild.id, interaction.user.id, "descSet", {
      discordLocale: interaction.locale,
    }).catch(() => null);
    await refreshPanel(interaction, "partner_desc", lang);
    await interaction.reply(ephemeralNotice(lang, "settings_descSaved", interaction.guild)).catch(() => {});
    return true;
  }

  if (parsed.action !== "ping") return false;

  const hereMembers = parsePingMemberThresholdInput(interaction.fields.getTextInputValue("here_members"));
  const everyoneMembers = parsePingMemberThresholdInput(interaction.fields.getTextInputValue("everyone_members"));
  const customRoleRaw = String(interaction.fields.getTextInputValue("custom_role_id") || "").trim();
  const customRoleMembers = parseOptionalInt(interaction.fields.getTextInputValue("custom_role_members"));
  const delayRaw = String(interaction.fields.getTextInputValue("custom_role_delay") || "").trim();
  const customRoleDelayMs = delayRaw
    ? parsePingDelayInput(delayRaw)
    : DEFAULT_CUSTOM_ROLE_PING_DELAY_MS;

  if (
    Number.isNaN(hereMembers) ||
    Number.isNaN(everyoneMembers) ||
    Number.isNaN(customRoleMembers) ||
    Number.isNaN(customRoleDelayMs)
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
    customRoleDelayMs,
  });
  if (!saved.ok) {
    await interaction
      .reply(ephemeralNotice(lang, "admin_saveFailed", interaction.guild))
      .catch(() => {});
    return true;
  }

  await refreshPartnershipConfigCache().catch(() => null);
  await refreshPanel(interaction, "home", lang);
  await interaction.reply(ephemeralNotice(lang, "admin_pingSaved", interaction.guild)).catch(() => {});
  return true;
}

export = {
  showSettingsModal,
  handleSettingsModal,
};
