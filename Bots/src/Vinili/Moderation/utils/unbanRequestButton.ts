const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const UNBAN_REQUEST_URL = "https://www.viniliecaffe.it/appelli";

function buildUnbanRequestRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Richiedi unban")
      .setEmoji(E.link)
      .setURL(UNBAN_REQUEST_URL),
  );
}

export = {
  buildUnbanRequestRow,
};