const { PLB_MODE_PREFIX, PLB_NAV_PREFIX, buildPartnerLeaderboardPayload } = require("../Utils/Partner/partnerLeaderboardRuntime");

function match(interaction) {
  const id = String(interaction?.customId || "");
  return interaction?.isButton?.() && (id.startsWith(PLB_MODE_PREFIX) || id.startsWith(PLB_NAV_PREFIX));
}

async function execute(interaction) {
  const id = String(interaction.customId || "");
  const guild = interaction.guild;
  if (!guild) return false;
  let mode = "totale";
  if (id.startsWith(PLB_MODE_PREFIX)) {
    const raw = id.slice(PLB_MODE_PREFIX.length).trim().toLowerCase();
    mode = raw === "settimanale" ? "settimanale" : "totale";
  } else if (id.startsWith(PLB_NAV_PREFIX)) {
    const body = id.slice(PLB_NAV_PREFIX.length);
    const parts = body.split(":");
    const modeRaw = String(parts[0] || "totale").toLowerCase();
    mode = modeRaw === "settimanale" ? "settimanale" : "totale";
  }
  const payload = await buildPartnerLeaderboardPayload(interaction.client, guild, mode, 1);
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => interaction.followUp({ ...payload, ephemeral: true }).catch(() => {}));
  } else {
    await interaction.update(payload).catch(async () => {
      await interaction.reply(payload).catch(() => {});
    });
  }
  return true;
}

module.exports = { name: "partnerLeaderboardToggle", order: 10, match, execute };