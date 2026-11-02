const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { partnersChatPartnerCommandDeniedReplyContent } = require("../../runtime/partnersChatChannelUtils") as typeof import("../../runtime/partnersChatChannelUtils");
const {
  isPartnershipOperational,
  memberCanExecutePartnership,
} = require("../../core/partnershipConfigResolver") as typeof import("../../core/partnershipConfigResolver");
const {
  executeTenantPartnership,
} = require("../../services/tenantPartnershipExecuteService") as typeof import("../../services/tenantPartnershipExecuteService");
const { replyInteractionSetupRequired } = require("../../tenant/tenantSetupRequiredReply") as typeof import("../../tenant/tenantSetupRequiredReply");
const { resolvePartnershipDeferOptions } = require("../../tenant/tenantProfileEphemeral") as typeof import("../../tenant/tenantProfileEphemeral");

async function handlePartnerModal(interaction?) {
  if (
    !interaction.isModalSubmit() ||
    !interaction.customId.startsWith("partnershipModal_")
  )
    return false;
  const { openerId, managerId, skipped } = parsePartnershipModalId(interaction.customId);
  if (openerId && String(openerId) !== String(interaction.user?.id || "")) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<a:VC_Alert:1482706673176150077> Non puoi usare questo modulo.",
          ),
      ],
      flags: 1 << 6,
    }).catch(() => { });
    return true;
  }
  const deniedChannel = await partnersChatPartnerCommandDeniedReplyContent(interaction.channel, { allowPartnership: true });
  if (deniedChannel) {
    await interaction.reply({
      content: deniedChannel,
      flags: 1 << 6,
    }).catch(() => {});
    return true;
  }
  const guildId = interaction.guild?.id;
  if (!isPartnershipOperational(guildId)) {
    await replyInteractionSetupRequired(interaction);
    return true;
  }
  if (!memberCanExecutePartnership(interaction.member, guildId)) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(
            "<:vegax:1443934876440068179> Ti serve il **ruolo Partner Manager** (o **Gestisci server**) per usare **Partnership**.",
          )
          .setColor("Red"),
      ],
      flags: 1 << 6,
    }).catch(() => {});
    return true;
  }
  await interaction.deferReply(await resolvePartnershipDeferOptions(guildId, interaction.user?.id)).catch(() => {});
  const rawDescription = interaction.fields.getTextInputValue("serverDescription");
  await executeTenantPartnership(interaction, {
    description: rawDescription,
    managerId,
    skipped,
  });
  return true;
}

function parsePartnershipModalId(customId?) {
  const raw = String(customId || "");
  const skipFormat = raw.match(/^partnershipModal_cmd_(\d{16,20})_skip$/);
  if (skipFormat) {
    return {
      source: "cmd",
      openerId: skipFormat[1],
      managerId: null,
      skipped: true,
    };
  }
  const newFormat = raw.match(/^partnershipModal_cmd_(\d{16,20})_(\d{16,20})$/);
  if (newFormat) {
    return {
      source: "cmd",
      openerId: newFormat[1],
      managerId: newFormat[2],
      skipped: false,
    };
  }

  const legacy = raw.match(/^partnershipModal_(\d{16,20})_(\d{16,20})$/);
  if (legacy) {
    return { source: "legacy", openerId: legacy[1], managerId: legacy[2], skipped: false };
  }

  const legacyShort = raw.match(/^partnershipModal_(\d{16,20})$/);
  if (legacyShort) {
    return { source: "legacy", openerId: null, managerId: legacyShort[1], skipped: false };
  }
  return { source: null, openerId: null, managerId: null, skipped: false };
}

export = { handlePartnerModal };
