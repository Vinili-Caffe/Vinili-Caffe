const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const BLACKLIST_FOUND_ERROR = "È stato **trovato** un server in **blacklist**!";

function buildPartnershipBlacklistCancelledPayload(errorDetail = BLACKLIST_FOUND_ERROR) {
  const detail = String(errorDetail || BLACKLIST_FOUND_ERROR).trim() || BLACKLIST_FOUND_ERROR;
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("<a:VC_Alert:1482706673176150077> __Azione Cancellata!__")
    .setDescription(
      [
        "Si è verificato un **errore** durante l'esecuzione del **comando**.",
        "",
        "**! Error:**",
        `\`\`\`\n${detail}\n\`\`\``,
      ].join("\n"),
    );


  return {
    embeds: [embed],
    __skipDefaultEmbedFooter: true,
  };
}

module.exports = { BLACKLIST_FOUND_ERROR, buildPartnershipBlacklistCancelledPayload };