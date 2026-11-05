const IDs = require("../../../../Config/ids") as typeof import("../../../../Config/ids");

const { E } = require("../../../../../shared/emojis/emojiCatalog") as typeof import("../../../../../shared/emojis/emojiCatalog");
const build_middle_ticket = () =>
    `${E.VC_Ticket} I ticket si gestiscono sul **sito**. Essendo un ruolo superiore non vi è richiesto di rispondere subito a tutti: date supporto al low staff e intervenite quando serve.\n\n` +
    `${E.VC_pixeltime} Se un ticket rimarrà **non claimato** per più di **5 minuti** allora **dovete** claimarlo e gestirlo voi.`;

const build_middle_selfie = () =>
    `${E.VC_Ticket} I ticket **Perks** sono sul sito. Da lì gestite i ruoli <@&` +
    IDs.roles.Verificato +
    "> / <@&" +
    IDs.roles.VerifiedNeo +
    "> / <@&" +
    IDs.roles.Verificata +
    ">.\n\n" +
    `${E.VC_Alert} Quando un utente apre un ticket Perks per la verifica selfie controllate i passaggi richiesti; se siete <@&` +
    IDs.roles.SeniorModerator +
    "> taggate un <@&" +
    IDs.roles.Director +
    "> oppure, da <@&" +
    IDs.roles.Director +
    ">, assegnate direttamente il ruolo.\n" +
    `> PS: Occhio a dare ruoli sbagliati, il bot potrebbe bannarvi ${E.VC_Eye}`;

export = {
  middle_ticket: build_middle_ticket,
  middle_selfie: build_middle_selfie,
};
