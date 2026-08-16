const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const UNMUTE_REQUEST_URL = "https://www.viniliecaffe.it/appelli?tipo=unmute";

function buildUnmuteRequestRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Richiedi unmute")
      .setEmoji("<:link:1470064815899803668>")
      .setURL(UNMUTE_REQUEST_URL),
  );
}

module.exports = {
  UNMUTE_REQUEST_URL,
  buildUnmuteRequestRow,
};
