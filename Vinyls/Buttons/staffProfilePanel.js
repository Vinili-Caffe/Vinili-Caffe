const {
  PANEL_PREFIX,
  parseStaffProfileSelectCustomId,
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

function match(interaction) {
  const id = String(interaction?.customId || "");
  return interaction?.isStringSelectMenu?.() && id.startsWith(`${PANEL_PREFIX}:select:`);
}

async function execute(interaction) {
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
  const payload = await buildStaffProfilePayload(
    interaction.guild,
    parsed.targetId,
    parsed.viewerId,
    interaction.client,
    section,
  );
  await safeUpdatePanelInteraction(interaction, payload);
  return true;
}

module.exports = { name: "staffProfilePanel", order: 12, match, execute };