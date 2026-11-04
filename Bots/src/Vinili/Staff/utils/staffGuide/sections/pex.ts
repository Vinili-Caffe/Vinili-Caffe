const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");

const { E } = require("../../../../../shared/emojis/emojiCatalog") as typeof import("../../../../../shared/emojis/emojiCatalog");
const build_pex = () =>
    `> ${E.VC_Clock} Ogni ruolo, per essere assegnato, richiede un certo tempo per essere ottenuto, ma non è detto che al raggiungimento di questo tempo venga assegnato il ruolo.\n` +
    `${E.VC_Dot} Il ruolo <@&` +
    IDs.roles.Helper +
    "> è un ruolo di prova, **con un periodo variabile di 1-2 settimane**.\n" +
    `${E.VC_Dot} Il ruolo <@&` +
    IDs.roles.Mod +
    "> **richiede un periodo variabile di 1-2 mesi**.\n" +
    `${E.VC_Dot} Il ruolo <@&` +
    IDs.roles.SeniorModerator +
    "> **richiede un periodo variabile di 2-3 mesi**.\n" +
    `${E.VC_Dot} Il ruolo <@&` +
    IDs.roles.Director +
    "> **richiede un periodo variabile di 3-4 mesi**, essendo esso un ruolo di prova per entrare a tutti gli effetti nell'<@&" +
    IDs.roles.HighStaff +
    ">.\n\n" +
    `> ${E.VC_Attention} Il **pex** viene assegnato quando uno staffer dimostra __costanza__, **qualità** nel lavoro e un comportamento utile alla community.\n` +
    `${E.VC_1} **Limiti settimanali** completati con continuità.\n` +
    `${E.VC_2} **Presenza vocale** reale e utile, soprattutto nelle vocali pubbliche.\n` +
    `${E.VC_3} **Moderazione corretta**, con prove, articoli giusti e buon criterio.\n` +
    `${E.VC_4} **Valutazioni positive** e contributi extra al server.\n` +
    `${E.VC_5} **Comportamento maturo**, nessun abuso di potere e rispetto della guida staff.\n\n`;

export = {
  pex: build_pex,
};
