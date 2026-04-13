const {
  EVENTO_SFONDI_CLASSIFICA_BTN_PREFIX,
  buildSfondiClassificaPayload,
} = require("../Services/Community/weeklyContestService");

function match(interaction) {
  const id = String(interaction?.customId || "");
  return interaction?.isButton?.() && id.startsWith(EVENTO_SFONDI_CLASSIFICA_BTN_PREFIX);
}

async function execute(interaction) {
  const id = String(interaction.customId || "");
  const raw = id.slice(EVENTO_SFONDI_CLASSIFICA_BTN_PREFIX.length).trim().toLowerCase();
  const mode = raw === "pc" ? "pc" : "mobile";
  const guild = interaction.guild;
  if (!guild) return false;
  const payload = await buildSfondiClassificaPayload(guild, mode);
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => interaction.followUp(payload).catch(() => {}));
  } else {
    await interaction.update(payload).catch(async () => {
      await interaction.reply(payload).catch(() => {});
    });
  }
  return true;
}

module.exports = { name: "eventSfondiClassifica", order: 11, match, execute };