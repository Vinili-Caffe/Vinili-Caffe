const { safePanelMessageUpdate } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { refreshPartnershipConfigCache } = require("../../core/tenantPartnershipSettings") as typeof import("../../core/tenantPartnershipSettings");
const { parseCustomId, buildViewPayload } = require("../../../Partner/runtime/partnershipSettingsComponents") as typeof import("../../../Partner/runtime/partnershipSettingsComponents");
const { buildSimpleNoticePayload } = require("../../../../shared/embeds/simpleNoticeEmbed") as typeof import("../../../../shared/embeds/simpleNoticeEmbed");
const { resolvePartnershipConfigSync } = require("../../../Partner/core/partnershipConfigResolver") as typeof import("../../../Partner/core/partnershipConfigResolver");
const { PRIVATE_FLAG } = require("./collectorsHelpers") as typeof import("./collectorsHelpers");

function textEphemeralNotice(text?, guild?) {
  return {
    ...buildSimpleNoticePayload(text, guild, { ephemeral: true }),
    flags: PRIVATE_FLAG,
  };
}

async function applyPanelPayload(interaction?, payload?) {
  await safePanelMessageUpdate(interaction, payload);
}

async function refreshPanel(interaction?, view?, lang?) {
  await refreshPartnershipConfigCache().catch(() => null);
  const config = resolvePartnershipConfigSync(interaction.guild.id);
  const parsed = parseCustomId(interaction.customId);
  const ownerId = parsed?.ownerId || interaction.user.id;
  const payload = buildViewPayload(interaction.guild, ownerId, view, config, lang);
  await safePanelMessageUpdate(interaction, payload);
  return config;
}

export = {
  textEphemeralNotice,
  applyPanelPayload,
  refreshPanel,
};
