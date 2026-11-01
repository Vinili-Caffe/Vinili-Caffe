const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");

const UNBAN_REQUEST_URL = "https://www.viniliecaffe.it/appelli";

function buildUnbanRequestRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Richiedi unban")
      .setEmoji("<:link:1470064815899803668>")
      .setURL(UNBAN_REQUEST_URL),
  );
}

export = {
  buildUnbanRequestRow,
};