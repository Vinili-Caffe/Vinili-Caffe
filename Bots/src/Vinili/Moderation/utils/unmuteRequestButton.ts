const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const UNMUTE_REQUEST_URL = "https://www.viniliecaffe.it/appelli?tipo=unmute";

function buildUnmuteRequestRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Richiedi unmute")
      .setEmoji(E.link)
      .setURL(UNMUTE_REQUEST_URL),
  );
}

export = {
  buildUnmuteRequestRow,
};
