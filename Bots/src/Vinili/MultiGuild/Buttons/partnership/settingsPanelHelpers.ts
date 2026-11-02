const { safePanelMessageUpdate } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { refreshPartnershipConfigCache } = require("../../core/tenantPartnershipSettings") as typeof import("../../core/tenantPartnershipSettings");
const { parseCustomId, buildViewPayload } = require("../../../Utils/Partner/partnershipSettingsComponents") as typeof import("../../../Utils/Partner/partnershipSettingsComponents");
const { buildSimpleNoticePayload } = require("../../../Utils/Embeds/simpleNoticeEmbed") as typeof import("../../../Utils/Embeds/simpleNoticeEmbed");
const { resolvePartnershipConfigSync } = require("../../../Utils/Partner/partnershipConfigResolver") as typeof import("../../../Utils/Partner/partnershipConfigResolver");
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
