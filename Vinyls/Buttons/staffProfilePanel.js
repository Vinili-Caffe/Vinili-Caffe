const IDs = require("../Utils/Config/ids");
const { isPartnerPmDailyCommandsThread } = require("../Utils/Partner/partnersChatChannelUtils");
const {
  PANEL_PREFIX,
  parseStaffProfileSelectCustomId,
  parseStaffProfileCloseCustomId,
  buildStaffProfilePayload,
  SECTION_HOME,
} = require("../Utils/Staff/staffProfilePanelRuntime");

const PRIVATE_FLAG = 1 << 6;

async function safeUpdatePanelInteraction(interaction, payload) {
  const updated = await interaction.update(payload).then(() => true).catch(() => false);
  if (updated) return true;
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  if (interaction.message?.edit) {
    await interaction.message.edit(payload).catch(() => {});
  }
  return true;
}

async function deleteMessageInSameChannel(channel, messageId) {
  const mid = String(messageId || "").trim();
  if (!/^\d{16,20}$/.test(mid)) return false;
  if (!channel?.messages?.fetch) return false;
  const msg = await channel.messages.fetch(mid).catch(() => null);
  if (!msg) return false;
  return msg.delete().then(() => true).catch(() => false);
}

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (interaction?.isStringSelectMenu?.() && id.startsWith(`${PANEL_PREFIX}:select:`)) return true;
  if (interaction?.isButton?.() && id.startsWith(`${PANEL_PREFIX}:close:`)) return true;
  return false;
}

async function execute(interaction) {
  if (interaction.isButton()) {
    if (!String(interaction.customId || "").startsWith(`${PANEL_PREFIX}:close:`)) return false;
    const close = parseStaffProfileCloseCustomId(interaction.customId);
    if (!close) return false;
    if (String(interaction.user.id) !== String(close.viewerId)) {
      await interaction
        .reply({
          content: "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può chiuderlo.",
          flags: PRIVATE_FLAG,
        })
        .catch(() => {});
      return true;
    }
    await interaction.deferUpdate().catch(() => {});
    await interaction.message?.delete?.().catch(() => {});
    if (close.sourceMessageId) {
      await deleteMessageInSameChannel(interaction.channel, close.sourceMessageId);
    }
    return true;
  }

  if (!interaction.isStringSelectMenu()) return false;
  const parsed = parseStaffProfileSelectCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user.id) !== String(parsed.viewerId)) {
    await interaction
      .reply({
        content: "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può usare il menu.",
        flags: PRIVATE_FLAG,
      })
      .catch(() => {});
    return true;
  }
  const section = String(interaction.values?.[0] || SECTION_HOME);
  const deferred = await interaction.deferUpdate().then(() => true).catch(() => false);
  const partnersChatPanel = await isPartnerPmDailyCommandsThread(interaction.channel);
  const payload = await buildStaffProfilePayload(
    interaction.guild,
    parsed.targetId,
    parsed.viewerId,
    interaction.client,
    section,
    { sourceMessageId: parsed.sourceMessageId, partnersChatPanel },
  );
  if (deferred && interaction.message) {
    await interaction.message.edit(payload).catch(() => {});
  } else {
    await safeUpdatePanelInteraction(interaction, payload);
  }
  return true;
}

module.exports = { name: "staffProfilePanel", order: 12, match, execute };