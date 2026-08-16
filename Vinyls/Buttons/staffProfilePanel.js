const { isPartnerPmDailyCommandsThread } = require("../Utils/Partner/partnersChatChannelUtils");
const { PANEL_PREFIX, parseStaffProfileSelectCustomId, parseStaffProfileCloseCustomId, parseStaffProfileNextCustomId, buildStaffProfilePayload, SECTION_HOME, resolveNextStaffPanelTargetId } = require("../Utils/Staff/staffProfilePanelRuntime");
const { parseSerataFilmAttendanceCustomId, setSerataFilmWillAttend } = require("../Utils/Staff/serataFilmAttendanceUtils");
const { safePanelMessageUpdate } = require("../../shared/discord/replyRuntime");
const PRIVATE_FLAG = 1 << 6;

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
  if (interaction?.isButton?.() && id.startsWith(`${PANEL_PREFIX}:next:`)) return true;
  if (interaction?.isButton?.() && id.startsWith(`${PANEL_PREFIX}:sf_att:`)) return true;
  return false;
}

async function execute(interaction) {
  if (interaction.isButton()) {
    if (String(interaction.customId || "").startsWith(`${PANEL_PREFIX}:sf_att:`)) {
      const parsed = parseSerataFilmAttendanceCustomId(interaction.customId);
      if (!parsed) return false;
      if (String(interaction.user.id) !== String(parsed.viewerId)) {
        await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo chi ha aperto il pannello può modificarlo.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      if (String(parsed.viewerId) !== String(parsed.targetId)) {
        await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Puoi segnalare l'assenza solo sul tuo profilo.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      const result = await setSerataFilmWillAttend(interaction.guild.id, parsed.targetId, parsed.willAttend);
      if (!result?.ok) {
        const msg = result?.code === "closed"
          ? "<a:VC_Cross:1482532424570376253> Il termine per segnalare l'assenza è scaduto."
          : "<a:VC_Cross:1482532424570376253> Impossibile aggiornare la presenza.";
        await interaction.reply({ content: msg, flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      const partnersChatPanel = await isPartnerPmDailyCommandsThread(interaction.channel);
      const payload = await buildStaffProfilePayload(
        interaction.guild,
        parsed.targetId,
        parsed.viewerId,
        interaction.client,
        SECTION_HOME,
        { sourceMessageId: parsed.sourceMessageId, partnersChatPanel, sourceChannel: interaction.channel },
      );
      await safePanelMessageUpdate(interaction, payload);
      return true;
    }
    if (String(interaction.customId || "").startsWith(`${PANEL_PREFIX}:next:`)) {
      const nextParsed = parseStaffProfileNextCustomId(interaction.customId);
      if (!nextParsed) return false;
      if (String(interaction.user.id) !== String(nextParsed.viewerId)) {
        await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo chi ha aperto il pannello può cambiarlo.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      const partnersChatPanel = await isPartnerPmDailyCommandsThread(interaction.channel);
      const nextTargetId = resolveNextStaffPanelTargetId(interaction.guild, nextParsed.targetId, { partnersChatPanel });
      if (!nextTargetId) {
        await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Nessun altro staffer disponibile in questo pannello.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      const payload = await buildStaffProfilePayload(
        interaction.guild,
        nextTargetId,
        nextParsed.viewerId,
        interaction.client,
        nextParsed.section || SECTION_HOME,
        { sourceMessageId: nextParsed.sourceMessageId, partnersChatPanel, sourceChannel: interaction.channel },
      );
      await safePanelMessageUpdate(interaction, payload);
      return true;
    }
    if (!String(interaction.customId || "").startsWith(`${PANEL_PREFIX}:close:`)) return false;
    const close = parseStaffProfileCloseCustomId(interaction.customId);
    if (!close) return false;
    if (String(interaction.user.id) !== String(close.viewerId)) {
      await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo chi ha aperto il pannello può chiuderlo.", flags: PRIVATE_FLAG }).catch(() => {});
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
    await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Solo chi ha aperto il pannello può usare il menu.", flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }
  const section = String(interaction.values?.[0] || SECTION_HOME);
  const partnersChatPanel = await isPartnerPmDailyCommandsThread(interaction.channel);
  const payload = await buildStaffProfilePayload( interaction.guild, parsed.targetId, parsed.viewerId, interaction.client, section, { sourceMessageId: parsed.sourceMessageId, partnersChatPanel, sourceChannel: interaction.channel });
  await safePanelMessageUpdate(interaction, payload);
  return true;
}

module.exports = { name: "staffProfilePanel", order: 12, match, execute };