const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js") as typeof import("discord.js");
const { getPartnershipConfigSync } = require("../../MultiGuild/core/tenantPartnershipSettings") as typeof import("../../MultiGuild/core/tenantPartnershipSettings");
const { formatPingMemberThresholdForInput } = require("./partnershipPingUtils") as typeof import("./partnershipPingUtils");
const { applyPartnershipPayloadBranding } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const { t } = require("./tenantPartnershipI18n") as typeof import("./tenantPartnershipI18n");
const { TENANT_PARTNERSHIP_ARROWS } = require("./tenantPartnershipArrows") as typeof import("./tenantPartnershipArrows");
const { formatPingsSummary, channelLine, roleLine } = require("./tenantPartnershipAdminRuntime") as typeof import("./tenantPartnershipAdminRuntime");
const { applyLocalizedTenantFooter } = require("./tenantPartnershipI18n/tenantPartnershipFooter") as typeof import("./tenantPartnershipI18n/tenantPartnershipFooter");

const PREFIX = "psetup";
const MODAL_PREFIX = "psetup_modal";
const SETUP_COLOR = 0xeb459e;
const COMPLETE_COLOR = 0x57f287;
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

function buildChannelsEmbed(guild?, config?, lang = "it") {
  return new EmbedBuilder()
    .setColor(SETUP_COLOR)
    .setDescription(
      [
        t(lang, "setup_channels_intro"),
        "",
        `<a:VC_Announce:1482534613568979007> **${t(lang, "setup_channels_partner")}:** ${
          config?.partnershipsChannelId
            ? channelLine(config.partnershipsChannelId, guild)
            : t(lang, "common_notSet")
        }`,
        `<:VC_Quest:1482534879257165865> **${t(lang, "setup_channels_logs")}:** ${
          config?.logsChannelId ? channelLine(config.logsChannelId, guild) : t(lang, "common_notSetOptional")
        }`,
      ].join("\n"),
    );
}

function buildRolesEmbed(guild?, config?, lang = "it") {
  return new EmbedBuilder()
    .setColor(SETUP_COLOR)
    .setDescription(
      [
        t(lang, "setup_roles_intro"),
        "",
        `**${t(lang, "setup_roles_manager")}:** ${
          config?.partnerManagerRoleId ? roleLine(config.partnerManagerRoleId, guild) : t(lang, "common_notSet")
        }`,
      ].join("\n"),
    );
}

function buildPingsEmbed(guild?, config?, lang = "it") {
  return new EmbedBuilder()
    .setColor(SETUP_COLOR)
    .setDescription(
      [
        t(lang, "setup_pings_intro"),
        "",
        `**${t(lang, "setup_pings_current")}:** ${formatPingsSummary(config?.pings, lang)}`,
      ].join("\n"),
    );
}

function buildCompleteEmbed(guild?, config?, lang = "it") {
  const channelsValue = [
    config?.partnershipsChannelId ? `<#${config.partnershipsChannelId}>` : "—",
    config?.logsChannelId ? `<#${config.logsChannelId}>` : null,
  ]
    .filter(Boolean)
    .join(" , ");

  return new EmbedBuilder()
    .setColor(COMPLETE_COLOR)
    .setTitle(t(lang, "setup_complete_title"))
    .setDescription(t(lang, "setup_complete_desc"))
    .addFields(
      {
        name: `<:VC_page2:1482459724657201387> ${t(lang, "setup_complete_field_channels")}`,
        value: channelsValue || "—",
        inline: false,
      },
      {
        name: `<:861752staff:1524730539129438258> ${t(lang, "setup_complete_field_roles")}`,
        value: config?.partnerManagerRoleId ? `<@&${config.partnerManagerRoleId}>` : "—",
        inline: false,
      },
      {
        name: `<:VC_Mention:1482526855289634997> ${t(lang, "setup_complete_field_pings")}`,
        value: formatPingsSummary(config?.pings, lang),
        inline: false,
      },
    );
}

function buildChannelsComponents(ownerId?, config?) {
  const canContinue = Boolean(config?.partnershipsChannelId);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildCustomId(ownerId, "ch_partner"))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<a:VC_Announce:1482534613568979007>"),
      new ButtonBuilder()
        .setCustomId(buildCustomId(ownerId, "ch_logs"))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:VC_Quest:1482534879257165865>"),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildCustomId(ownerId, "ch_next"))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(TENANT_PARTNERSHIP_ARROWS.right)
        .setDisabled(!canContinue),
    ),
  ];
}

function buildRolesComponents(ownerId?, config?) {
  const canContinue = Boolean(config?.partnerManagerRoleId);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildCustomId(ownerId, "role_manager"))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:VC_PartnerManager:1494286911286808576>"),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildCustomId(ownerId, "role_next"))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(TENANT_PARTNERSHIP_ARROWS.right)
        .setDisabled(!canContinue),
    ),
  ];
}

function buildPingsComponents(ownerId?) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildCustomId(ownerId, "ping_config"))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:VC_Mention:1482526855289634997>"),
      new ButtonBuilder()
        .setCustomId(buildCustomId(ownerId, "ping_done"))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<a:VC_Verified:1482532479637127188>"),
    ),
  ];
}

function buildCompleteComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("psetup:done:completed")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<a:VC_Verified:1482532479637127188>")
        .setDisabled(true),
    ),
  ];
}

function buildSetupAlreadyCompletedEmbed(lang = "it") {
  return new EmbedBuilder().setColor(0xed4245).setDescription(t(lang, "setup_alreadyComplete"));
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
  );
  return modal;
}

function buildStepPayload(guild?, ownerId?, step?, config?, lang = "it") {
  const cfg = config || getPartnershipConfigSync(guild.id) || {};
  let payload;
  if (step === "channels") {
    payload = {
      embeds: [buildChannelsEmbed(guild, cfg, lang)],
      components: buildChannelsComponents(ownerId, cfg),
    };
  } else if (step === "roles") {
    payload = {
      embeds: [buildRolesEmbed(guild, cfg, lang)],
      components: buildRolesComponents(ownerId, cfg),
    };
  } else if (step === "pings") {
    payload = {
      embeds: [buildPingsEmbed(guild, cfg, lang)],
      components: buildPingsComponents(ownerId),
    };
  } else if (step === "complete") {
    payload = {
      embeds: [buildCompleteEmbed(guild, cfg, lang)],
      components: buildCompleteComponents(),
    };
  } else {
    payload = {
      embeds: [buildChannelsEmbed(guild, cfg, lang)],
      components: buildChannelsComponents(ownerId, cfg),
    };
  }
  return applyLocalizedTenantFooter(
    applyPartnershipPayloadBranding(payload, { guildId: guild?.id, guild, client: guild?.client }),
    lang,
  );
}

export = {
  PREFIX,
  MODAL_PREFIX,
  SETUP_COLOR,
  COMPLETE_COLOR,
  PROMPT_TTL_MS,
  buildCustomId,
  parseCustomId,
  buildStepPayload,
  buildPingModal,
  buildSetupAlreadyCompletedEmbed,
};
