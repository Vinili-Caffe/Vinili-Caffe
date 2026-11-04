const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js") as typeof import("discord.js");
const { resolvePartnershipConfigSync } = require("../core/partnershipConfigResolver") as typeof import("../core/partnershipConfigResolver");
const { formatPingDelayDisplay, formatPingDelayForInput, formatPingMemberThresholdForInput } = require("./partnershipPingUtils") as typeof import("./partnershipPingUtils");
const { hasThankYouEmbedContent, resolveThankYouEmbedEditorValues, truncateModalValue, formatThankYouEmbedValueForModal } = require("./partnershipThankYouEmbed") as typeof import("./partnershipThankYouEmbed");
const { applyPartnershipPayloadBranding, TENANT_EMBED_COLOR } = require("../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../MultiGuild/utils/tenantEmbedBranding");
const { applyLocalizedTenantFooter } = require("../../Partner/i18n/tenantPartnershipI18n/tenantPartnershipFooter") as typeof import("../../Partner/i18n/tenantPartnershipI18n/tenantPartnershipFooter");
const { t } = require("../../Partner/i18n/tenantPartnershipI18n/index") as typeof import("../../Partner/i18n/tenantPartnershipI18n/index");
const { TENANT_PARTNERSHIP_ARROWS } = require("../../Partner/tenant/tenantPartnershipArrows") as typeof import("../../Partner/tenant/tenantPartnershipArrows");
const { formatLeaveAction, channelLine, roleLine, formatPmCommandsZone } = require("../../Partner/tenant/tenantPartnershipAdminRuntime") as typeof import("../../Partner/tenant/tenantPartnershipAdminRuntime");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const PREFIX = "psettings";
const MODAL_PREFIX = "psettings_modal";
const SETTINGS_COLOR = TENANT_EMBED_COLOR;
const PROMPT_TTL_MS = 60_000;

function buildCustomId(ownerId?, action?) {
  return `${PREFIX}:${String(ownerId)}:${action}`;
}

function parseCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts.length < 3) return null;
  if (parts[0] !== PREFIX && parts[0] !== MODAL_PREFIX) return null;
  const ownerId = parts[1];
  const action = parts.slice(2).join(":");
  if (!/^\d{16,20}$/.test(ownerId)) return null;
  return { kind: parts[0], ownerId, action };
}

function formatChannelsSummary(guild?, config?) {
  const parts = [
    config?.partnershipsChannelId ? channelLine(config.partnershipsChannelId, guild) : null,
    config?.logsChannelId ? channelLine(config.logsChannelId, guild) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

function formatPartnerManagerSummary(guild?, config?, lang = "it") {
  const roleId = String(config?.partnerManagerRoleId || "").trim();
  if (!roleId) return t(lang, "common_null");
  return roleLine(roleId, guild);
}

function formatDelaySummaryLine(guild?, config?, lang = "it") {
  const pings = config?.pings || {};
  const delayValue = formatPingDelayDisplay(pings.customRoleDelayMs);
  return `> ${E.VC_Clock} **${t(lang, "settings_home_delay")}**: \`${delayValue}\``;
}

function resolveSettingsConfig(guild?, config?) {
  if (config) return config;
  return resolvePartnershipConfigSync(guild?.id) || {};
}

function buildHomeEmbed(guild?, config?, lang = "it") {
  const cfg = resolveSettingsConfig(guild, config);

  return new EmbedBuilder()
    .setColor(SETTINGS_COLOR)
    .setDescription(
      [
        t(lang, "settings_home_intro"),
        "",
        `${E.VC_page2} **${t(lang, "settings_home_channels")}:** ${formatChannelsSummary(guild, cfg)}`,
        `${E["981353partner"]} **${t(lang, "settings_home_pmRole")}:** ${formatPartnerManagerSummary(guild, cfg, lang)}`,
        `${E.VC_page3} **${t(lang, "settings_home_skipManager")}:** ${cfg.skipManager ? `\`${t(lang, "true")}\`` : `\`${t(lang, "false")}\``}`,
        `${E.VC_Mention} **${t(lang, "settings_home_pings")}:** ${cfg.pings?.configured ? `\`${t(lang, "true")}\`` : `\`${t(lang, "false")}\``}`,
        formatDelaySummaryLine(guild, cfg, lang),
      ].join("\n"),
    );
}

function buildSelectRow(ownerId?, menuKey?, placeholder?, options?) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(buildCustomId(ownerId, `select:${menuKey}`))
    .setPlaceholder(placeholder)
    .addOptions(
      options.map((option?) => {
        const row = new StringSelectMenuOptionBuilder()
          .setLabel(option.label)
          .setValue(option.value);
        if (option.description) row.setDescription(option.description.slice(0, 100));
        if (option.emoji) row.setEmoji(option.emoji);
        return row;
      }),
    );
  return new ActionRowBuilder().addComponents(menu);
}

function buildHomeComponents(ownerId?, lang = "it") {
  return [
    buildSelectRow(ownerId, "home", t(lang, "settings_select_home"), [
      { label: t(lang, "settings_sel_channels_label"), value: "open_channels", emoji: E.VC_page2, description: t(lang, "settings_sel_channels_desc") },
      { label: t(lang, "settings_sel_roles_label"), value: "open_roles", emoji: E["981353partner"], description: t(lang, "settings_sel_roles_desc") },
      { label: t(lang, "settings_sel_skip_label"), value: "toggle_skip", emoji: E.VC_page3, description: t(lang, "settings_sel_skip_desc") },
      { label: t(lang, "settings_sel_ping_label"), value: "open_ping_modal", emoji: E.VC_Mention, description: t(lang, "settings_sel_ping_desc") },
      { label: t(lang, "settings_sel_custom_label"), value: "open_custom_embed", emoji: E["709897bolt"], description: t(lang, "settings_sel_custom_desc") },
      { label: t(lang, "settings_sel_desc_label"), value: "open_partner_desc", emoji: E["373988mail"], description: t(lang, "settings_sel_desc_desc") },
      { label: t(lang, "settings_sel_behaviors_label"), value: "open_behaviors", emoji: E["294025staff"], description: t(lang, "settings_sel_behaviors_desc") },
    ]),
  ];
}

function buildSettingsChannelsEmbed(guild?, config?, lang = "it") {
  return new EmbedBuilder()
    .setColor(SETTINGS_COLOR)
    .setDescription(
      [
        t(lang, "settings_channels_intro"),
        "",
        `${E.VC_Announce} **${t(lang, "settings_channels_partner")}:** ${config?.partnershipsChannelId ? channelLine(config.partnershipsChannelId, guild) : t(lang, "common_notSet")}`,
        `${E.VC_Quest} **${t(lang, "settings_channels_logs")}:** ${config?.logsChannelId ? channelLine(config.logsChannelId, guild) : t(lang, "common_notSetOptional")}`,
        `${E["981353partner"]} **${t(lang, "settings_channels_pm")}:** ${formatPmCommandsZone(guild, config, lang)}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
}

function buildSettingsChannelsComponents(ownerId?, lang = "it") {
  return [
    buildSelectRow(ownerId, "channels", t(lang, "settings_select_channels"), [
      { label: t(lang, "settings_sel_ch_partner_label"), value: "ch_partner", emoji: E.VC_Announce, description: t(lang, "settings_sel_ch_partner_desc") },
      { label: t(lang, "settings_sel_ch_logs_label"), value: "ch_logs", emoji: E.VC_Quest, description: t(lang, "settings_sel_ch_logs_desc") },
      { label: t(lang, "settings_sel_ch_pm_label"), value: "ch_pm_commands", emoji: E["981353partner"], description: t(lang, "settings_sel_ch_pm_desc") },
      { label: t(lang, "settings_sel_ch_pm_cat_label"), value: "ch_pm_categories", emoji: E.VC_page2, description: t(lang, "settings_sel_ch_pm_cat_desc") },
      { label: t(lang, "common_backHome"), value: "back_home", emoji: TENANT_PARTNERSHIP_ARROWS.left, description: t(lang, "common_backHome") },
    ]),
  ];
}

function buildSettingsRolesEmbed(guild?, config?, lang = "it") {
  return new EmbedBuilder()
    .setColor(SETTINGS_COLOR)
    .setDescription(
      [
        t(lang, "settings_roles_intro"),
        "",
        `**${t(lang, "settings_roles_manager")}:** ${config?.partnerManagerRoleId ? roleLine(config.partnerManagerRoleId, guild) : t(lang, "common_notSet")}`,
      ].join("\n"),
    );
}

function buildSettingsRolesComponents(ownerId?, lang = "it") {
  return [
    buildSelectRow(ownerId, "roles", t(lang, "settings_select_roles"), [
      { label: t(lang, "settings_sel_role_manager_label"), value: "role_manager", emoji: E["981353partner"], description: t(lang, "settings_sel_role_manager_desc") },
      { label: t(lang, "common_backHome"), value: "back_home", emoji: TENANT_PARTNERSHIP_ARROWS.left, description: t(lang, "common_backHome") },
    ]),
  ];
}

function buildBehaviorsEmbed(config?, lang = "it") {
  const cfg = config || {};
  return new EmbedBuilder()
    .setColor(SETTINGS_COLOR)
    .setDescription(
      [
        t(lang, "settings_behaviors_intro"),
        "",
        `${E["510611star"]} **${t(lang, "settings_behaviors_badgeRole")}:** ${cfg.managerBadgeRoleId ? `<@&${cfg.managerBadgeRoleId}>` : t(lang, "common_null")}`,
        `${E["11781warning"]} **${t(lang, "settings_behaviors_leave")}:** ${formatLeaveAction(cfg.managerLeaveAction, lang)}`,
      ].join("\n"),
    );
}

function buildBehaviorsComponents(ownerId?, lang = "it") {
  return [
    buildSelectRow(ownerId, "behaviors", t(lang, "settings_select_behaviors"), [
      { label: t(lang, "settings_sel_behavior_role_label"), value: "behavior_create_role", emoji: E["510611star"], description: t(lang, "settings_sel_behavior_role_desc") },
      { label: t(lang, "settings_sel_behavior_leave_label"), value: "open_leave", emoji: E["11781warning"], description: t(lang, "settings_sel_behavior_leave_desc") },
      { label: t(lang, "common_backHome"), value: "back_home", emoji: TENANT_PARTNERSHIP_ARROWS.left, description: t(lang, "common_backHome") },
    ]),
  ];
}

function buildLeaveBehaviorEmbed(config?, lang = "it") {
  return new EmbedBuilder()
    .setColor(SETTINGS_COLOR)
    .setDescription(
      [
        t(lang, "settings_leave_intro"),
        "",
        `${E["11781warning"]} **${t(lang, "settings_behaviors_leave")}:** ${formatLeaveAction(config?.managerLeaveAction, lang)}`,
      ].join("\n"),
    );
}

function buildPartnerDescEmbed(guild?, config?, lang = "it") {
  const desc = config?.partnerDesc || {};
  const modeLine =
    desc.mode === "channel"
      ? `${E.VC_page2} ${t(lang, "settings_partnerDesc_modeChannel", { channel: channelLine(desc.channelId, guild) })}`
      : desc.mode === "static"
        ? `${E["373988mail"]} ${t(lang, "settings_partnerDesc_modeStatic")}`
        : `${E.vegax} ${t(lang, "settings_partnerDesc_modeNone")}`;
  const detailLine =
    desc.mode === "static" && desc.staticText
      ? `\n> ${String(desc.staticText).replace(/\n/g, "\n> ").slice(0, 900)}${desc.staticText.length > 900 ? "…" : ""}`
      : desc.mode === "channel"
        ? `\n${t(lang, "settings_partnerDesc_channelHint")}`
        : "";
  return new EmbedBuilder()
    .setColor(SETTINGS_COLOR)
    .setDescription(
      [
        t(lang, "settings_partnerDesc_intro"),
        "",
        modeLine,
        detailLine,
      ].join("\n"),
    );
}

function buildPartnerDescComponents(ownerId?, lang = "it") {
  return [
    buildSelectRow(ownerId, "partner_desc", t(lang, "settings_select_partnerDesc"), [
      {
        label: t(lang, "settings_sel_desc_channel_label"),
        value: "desc_channel",
        emoji: E.VC_page2,
        description: t(lang, "settings_sel_desc_channel_desc"),
      },
      {
        label: t(lang, "settings_sel_desc_static_label"),
        value: "desc_static_modal",
        emoji: E["373988mail"],
        description: t(lang, "settings_sel_desc_static_desc"),
      },
      {
        label: t(lang, "settings_sel_desc_clear_label"),
        value: "desc_clear",
        emoji: E["75661closelogo"],
        description: t(lang, "settings_sel_desc_clear_desc"),
      },
      { label: t(lang, "common_backHome"), value: "back_home", emoji: TENANT_PARTNERSHIP_ARROWS.left, description: t(lang, "common_backHome") },
    ]),
  ];
}

function buildPartnerDescModal(ownerId?, config?, lang = "it") {
  const desc = config?.partnerDesc || {};
  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}:${ownerId}:partner_desc_static`)
    .setTitle(t(lang, "settings_partnerDesc_modalTitle").slice(0, 45));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("partner_desc_text")
        .setLabel(t(lang, "settings_partnerDesc_modalLabel").slice(0, 45))
        .setPlaceholder(t(lang, "settings_partnerDesc_modalPh"))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(4000)
        .setValue(truncateModalValue(desc.mode === "static" ? desc.staticText || "" : "", 4000)),
    ),
  );
  return modal;
}

function buildLeaveBehaviorComponents(ownerId?, lang = "it") {
  return [
    buildSelectRow(ownerId, "leave", t(lang, "settings_select_leave"), [
      { label: t(lang, "settings_sel_leave_back_label"), value: "leave_back", emoji: TENANT_PARTNERSHIP_ARROWS.left },
      { label: t(lang, "settings_sel_leave_delete_label"), value: "leave_delete_5m", emoji: E.VC_Clock, description: t(lang, "settings_sel_leave_delete_desc") },
      { label: t(lang, "settings_sel_leave_warn_label"), value: "leave_warn", emoji: E["11781warning"], description: t(lang, "settings_sel_leave_warn_desc") },
      { label: t(lang, "settings_sel_leave_null_label"), value: "leave_null", emoji: E["75661closelogo"], description: t(lang, "settings_sel_leave_null_desc") },
    ]),
  ];
}

function buildCustomEmbedPanelEmbed(config?, lang = "it") {
  const cfg = config || {};
  const thankYouEnabled = hasThankYouEmbedContent(cfg.thankYouEmbed) ? `\`${t(lang, "true")}\`` : `\`${t(lang, "false")}\``;
  const manualEnabled = cfg.manualPartnershipEnabled ? `\`${t(lang, "true")}\`` : `\`${t(lang, "false")}\``;
  return new EmbedBuilder()
    .setColor(SETTINGS_COLOR)
    .setDescription(
      [
        t(lang, "settings_custom_intro"),
        "",
        `${E["373988mail"]} **${t(lang, "settings_custom_message")}:** ${thankYouEnabled}`,
        `${E["116444unlocked"]} **${t(lang, "settings_custom_manual")}:** ${manualEnabled}`,
      ].join("\n"),
    );
}

function buildCustomEmbedComponents(ownerId?, lang = "it") {
  return [
    buildSelectRow(ownerId, "custom_embed", t(lang, "settings_select_custom"), [
      {
        label: t(lang, "settings_sel_custom_p1_label"),
        value: "custom_embed_edit_p1",
        emoji: E.VC_page2,
        description: t(lang, "settings_sel_custom_p1_desc"),
      },
      {
        label: t(lang, "settings_sel_custom_p2_label"),
        value: "custom_embed_edit_p2",
        emoji: E["709897bolt"],
        description: t(lang, "settings_sel_custom_p2_desc"),
      },
      {
        label: t(lang, "settings_sel_custom_vars_label"),
        value: "custom_embed_vars",
        emoji: E.VC_Quest,
        description: t(lang, "settings_sel_custom_vars_desc"),
      },
      {
        label: t(lang, "settings_sel_custom_manual_label"),
        value: "custom_embed_toggle_manual",
        emoji: E["981353partner"],
        description: t(lang, "settings_sel_custom_manual_desc"),
      },
      { label: t(lang, "common_backHome"), value: "back_home", emoji: TENANT_PARTNERSHIP_ARROWS.left, description: t(lang, "common_backHome") },
    ]),
  ];
}

function modalPrefill(value?, max?) {
  return truncateModalValue(formatThankYouEmbedValueForModal(value), max);
}

function buildThankYouEmbedModalPage1(ownerId?, config?, lang = "it") {
  const custom = resolveThankYouEmbedEditorValues(config?.thankYouEmbed, config?.guildId);
  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}:${ownerId}:thank_you_p1`)
    .setTitle(t(lang, "settings_embedModal_title").slice(0, 45));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("embed_color")
        .setLabel(t(lang, "settings_embedModal_color").slice(0, 45))
        .setPlaceholder(t(lang, "ph_default"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(modalPrefill(custom.color || "", 100)),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("embed_author_icon")
        .setLabel(t(lang, "settings_embedModal_authorIcon").slice(0, 45))
        .setPlaceholder(t(lang, "ph_url"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(modalPrefill(custom.authorIconUrl || "", 1000)),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("embed_author_name")
        .setLabel(t(lang, "settings_embedModal_authorName").slice(0, 45))
        .setPlaceholder("{user.username}")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(modalPrefill(custom.authorName || "", 256)),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("embed_title")
        .setLabel(t(lang, "settings_embedModal_titleField").slice(0, 45))
        .setPlaceholder(t(lang, "ph_embedTitle"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(modalPrefill(custom.title || "", 256)),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("embed_thumbnail")
        .setLabel(t(lang, "settings_embedModal_thumbnail").slice(0, 45))
        .setPlaceholder(t(lang, "ph_url"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(modalPrefill(custom.thumbnailUrl || "", 1000)),
    ),
  );
  return modal;
}

function buildThankYouEmbedModalPage2(ownerId?, config?, lang = "it") {
  const custom = resolveThankYouEmbedEditorValues(config?.thankYouEmbed, config?.guildId);
  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}:${ownerId}:thank_you_p2`)
    .setTitle(t(lang, "settings_embedModal_title").slice(0, 45));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("embed_description")
        .setLabel(t(lang, "settings_embedModal_description").slice(0, 45))
        .setPlaceholder(t(lang, "ph_embedDescription"))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(4000)
        .setValue(modalPrefill(custom.description || "", 4000)),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("embed_image")
        .setLabel(t(lang, "settings_embedModal_image").slice(0, 45))
        .setPlaceholder(t(lang, "ph_url"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(modalPrefill(custom.imageUrl || "", 1000)),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("embed_footer")
        .setLabel(t(lang, "settings_embedModal_footer").slice(0, 45))
        .setPlaceholder("{partner.name}")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(modalPrefill(custom.footerText || "", 2048)),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("embed_footer_icon")
        .setLabel(t(lang, "settings_embedModal_footerIcon").slice(0, 45))
        .setPlaceholder(t(lang, "ph_url"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(modalPrefill(custom.footerIconUrl || "", 1000)),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("embed_timestamp")
        .setLabel(t(lang, "settings_embedModal_timestamp").slice(0, 45))
        .setPlaceholder(t(lang, "ph_timestamp"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(custom.timestampEnabled === false ? "false" : "true"),
    ),
  );
  return modal;
}

function buildSettingsNotReadyEmbed(lang = "it") {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(t(lang, "settings_notReady_title"))
    .setDescription(t(lang, "settings_notReady"));
}

function buildPingModal(ownerId?, config?, lang = "it") {
  const pings = config?.pings || {};
  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}:${ownerId}:ping`)
    .setTitle(t(lang, "setup_pingModal_title").slice(0, 45));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("here_members")
        .setLabel(t(lang, "setup_pingModal_here").slice(0, 45))
        .setPlaceholder(t(lang, "ph_null"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(formatPingMemberThresholdForInput(pings.hereMembers)),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("everyone_members")
        .setLabel(t(lang, "setup_pingModal_everyone").slice(0, 45))
        .setPlaceholder(t(lang, "ph_null"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(formatPingMemberThresholdForInput(pings.everyoneMembers)),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("custom_role_id")
        .setLabel(t(lang, "setup_pingModal_customRole").slice(0, 45))
        .setPlaceholder(t(lang, "setup_pingModal_customRolePh"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(pings.customRoleId ? String(pings.customRoleId) : ""),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("custom_role_members")
        .setLabel(t(lang, "setup_pingModal_customMembers").slice(0, 45))
        .setPlaceholder(t(lang, "setup_pingModal_customMembersPh"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(
          pings.customRoleMembers !== null && pings.customRoleMembers !== undefined
            ? String(pings.customRoleMembers)
            : "",
        ),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("custom_role_delay")
        .setLabel(t(lang, "settings_pingModal_delay").slice(0, 45))
        .setPlaceholder(t(lang, "ph_pingDelay"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(formatPingDelayForInput(pings.customRoleDelayMs)),
    ),
  );
  return modal;
}

function buildViewPayload(guild?, ownerId?, view?, config?, lang = "it") {
  const cfg = resolveSettingsConfig(guild, config);
  let payload;
  if (view === "channels") {
    payload = { embeds: [buildSettingsChannelsEmbed(guild, cfg, lang)], components: buildSettingsChannelsComponents(ownerId, lang) };
  } else if (view === "roles") {
    payload = { embeds: [buildSettingsRolesEmbed(guild, cfg, lang)], components: buildSettingsRolesComponents(ownerId, lang) };
  } else if (view === "behaviors") {
    payload = { embeds: [buildBehaviorsEmbed(cfg, lang)], components: buildBehaviorsComponents(ownerId, lang) };
  } else if (view === "leave") {
    payload = { embeds: [buildLeaveBehaviorEmbed(cfg, lang)], components: buildLeaveBehaviorComponents(ownerId, lang) };
  } else if (view === "custom_embed") {
    payload = { embeds: [buildCustomEmbedPanelEmbed(cfg, lang)], components: buildCustomEmbedComponents(ownerId, lang) };
  } else if (view === "partner_desc") {
    payload = { embeds: [buildPartnerDescEmbed(guild, cfg, lang)], components: buildPartnerDescComponents(ownerId, lang) };
  } else {
    payload = { embeds: [buildHomeEmbed(guild, cfg, lang)], components: buildHomeComponents(ownerId, lang) };
  }
  return applyLocalizedTenantFooter(
    applyPartnershipPayloadBranding(payload, { guildId: guild?.id, guild, client: guild?.client }),
    lang,
  );
}

export = {
  PREFIX,
  MODAL_PREFIX,
  PROMPT_TTL_MS,
  buildCustomId,
  parseCustomId,
  buildViewPayload,
  buildHomeEmbed,
  buildPingModal,
  buildThankYouEmbedModalPage1,
  buildThankYouEmbedModalPage2,
  buildPartnerDescModal,
  buildSettingsNotReadyEmbed,
};
