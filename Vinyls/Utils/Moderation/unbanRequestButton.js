const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const UNBAN_REQUEST_URL = "https://www.viniliecaffe.it/unban";

function buildUnbanRequestRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Richiedi unban")
      .setEmoji("<:link:1470064815899803668>")
      .setURL(UNBAN_REQUEST_URL),
  );
}

module.exports = {
  UNBAN_REQUEST_URL,
  buildUnbanRequestRow,
};
