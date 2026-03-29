const {
  PANEL_PREFIX,
  parseStaffProfileSelectCustomId,
  parseStaffProfilePlbCustomId,
  buildStaffProfilePayload,
  SECTION_HOME,
  SECTION_PARTNER_LB,
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
  if (interaction?.isStringSelectMenu?.() && id.startsWith(`${PANEL_PREFIX}:select:`)) return true;
  if (interaction?.isButton?.() && id.startsWith(`${PANEL_PREFIX}:plb:`)) return true;
  return false;
}

async function execute(interaction) {
  if (interaction.isButton()) {
    const plb = parseStaffProfilePlbCustomId(interaction.customId);
    if (!plb) return false;
    if (String(interaction.user.id) !== String(plb.viewerId)) {
      await interaction
        .reply({
          content: "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può usare questi pulsanti.",
          flags: PRIVATE_FLAG,
        })
        .catch(() => {});
      return true;
    }
    const payload = await buildStaffProfilePayload(
      interaction.guild,
      plb.targetId,
      plb.viewerId,
      interaction.client,
      SECTION_PARTNER_LB,
      { partnerLbMode: plb.mode },
    );
    await safeUpdatePanelInteraction(interaction, payload);
    return true;
  }

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