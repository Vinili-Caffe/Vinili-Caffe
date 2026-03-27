const { CLASSIFICA_TOGGLE_PREFIX, buildClassificaPayload } = require("../Prefix/Level/classifica");

function match(interaction) {
  const id = String(interaction?.customId || "");
  return interaction?.isButton?.() && id.startsWith(CLASSIFICA_TOGGLE_PREFIX);
}

async function execute(interaction) {
  const id = String(interaction.customId || "");
  const modeRaw = id.slice(CLASSIFICA_TOGGLE_PREFIX.length).trim().toLowerCase();
  const mode = modeRaw === "alltime" ? "alltime" : "weekly";
  const guild = interaction.guild;
  if (!guild) return false;
  const payload = await buildClassificaPayload(guild, mode);
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => interaction.followUp(payload).catch(() => { }));
  } else {
    await interaction.update(payload).catch(async () => {
      await interaction.reply(payload).catch(() => { });
    });
  }
  return true;
}

module.exports = { name: "classificaToggle", order: 9, match, execute };