const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");

const build_middle_ticket = () =>
    `<:VC_Ticket:1482535175283019888> I ticket si gestiscono sul **sito**. Essendo un ruolo superiore non vi è richiesto di rispondere subito a tutti: date supporto al low staff e intervenite quando serve.\n\n` +
    "<a:VC_pixeltime:1482535344103620771> Se un ticket rimarrà **non claimato** per più di **5 minuti** allora **dovete** claimarlo e gestirlo voi.";

const build_middle_selfie = () =>
    `<:VC_Ticket:1482535175283019888> I ticket **Perks** sono sul sito. Da lì gestite i ruoli <@&` +
    IDs.roles.Verificato +
    "> / <@&" +
    IDs.roles.VerifiedNeo +
    "> / <@&" +
    IDs.roles.Verificata +
    ">.\n\n" +
    "<a:VC_Alert:1482706673176150077> Quando un utente apre un ticket Perks per la verifica selfie controllate i passaggi richiesti; se siete <@&" +
    IDs.roles.SeniorModerator +
    "> taggate un <@&" +
    IDs.roles.Director +
    "> oppure, da <@&" +
    IDs.roles.Director +
    ">, assegnate direttamente il ruolo.\n" +
    "> PS: Occhio a dare ruoli sbagliati, il bot potrebbe bannarvi <:VC_Eye:1331619214410383381>";

export = {
  middle_ticket: build_middle_ticket,
  middle_selfie: build_middle_selfie,
};
