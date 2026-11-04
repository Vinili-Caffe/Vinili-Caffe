const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const TICKET_UX_COLOR = "#6f4e37";
const TICKET_ALERT = E.VC_Alert;
const TICKET_X = E.vegax;
const TICKET_ATTENTION = E.VC_Attention;
const { siteTicketsPageDiscordRef } = require("../../../shared/web/siteTicketsPageRef") as typeof import("../../../shared/web/siteTicketsPageRef");

const DAY_IT = Object.freeze({
  monday: "Lunedì",
  tuesday: "Martedì",
  wednesday: "Mercoledì",
  thursday: "Giovedì",
  friday: "Venerdì",
  saturday: "Sabato",
  sunday: "Domenica",
});

function makeTicketErrorEmbed(title?, description?) {
  const rawTitle = String(title || "Errore").trim() || "Errore";
  const withAlert = rawTitle.includes("VC_Alert") ? rawTitle : `${TICKET_ALERT} ${rawTitle}`;
  return new EmbedBuilder()
    .setTitle(withAlert)
    .setDescription(String(description || "").trim() || `${TICKET_X} Operazione non riuscita.`)
    .setColor(TICKET_UX_COLOR);
}

function closeDmFailedNote() {
  return (
    `\n\n${TICKET_ATTENTION} Non è stato possibile inviare il messaggio di chiusura in DM all'utente ` +
    `(DM chiusi o privacy).`
  );
}

export = {
  TICKET_UX_COLOR,
  makeTicketErrorEmbed,
  closeDmFailedNote,
};
