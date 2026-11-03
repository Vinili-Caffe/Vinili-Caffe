const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");

const build_pex = () =>
    "> <:VC_Clock:1473359204189474886> Ogni ruolo, per essere assegnato, richiede un certo tempo per essere ottenuto, ma non è detto che al raggiungimento di questo tempo venga assegnato il ruolo.\n" +
    "<:VC_Dot:1482532364222595303> Il ruolo <@&" +
    IDs.roles.Helper +
    "> è un ruolo di prova, **con un periodo variabile di 1-2 settimane**.\n" +
    "<:VC_Dot:1482532364222595303> Il ruolo <@&" +
    IDs.roles.Mod +
    "> **richiede un periodo variabile di 1-2 mesi**.\n" +
    "<:VC_Dot:1482532364222595303> Il ruolo <@&" +
    IDs.roles.SeniorModerator +
    "> **richiede un periodo variabile di 2-3 mesi**.\n" +
    "<:VC_Dot:1482532364222595303> Il ruolo <@&" +
    IDs.roles.Director +
    "> **richiede un periodo variabile di 3-4 mesi**, essendo esso un ruolo di prova per entrare a tutti gli effetti nell'<@&" +
    IDs.roles.HighStaff +
    ">.\n\n" +
    "> <:VC_Attention:1482534443632558151> Il **pex** viene assegnato quando uno staffer dimostra __costanza__, **qualità** nel lavoro e un comportamento utile alla community.\n" +
    "<:VC_1:1482706338021642333> **Limiti settimanali** completati con continuità.\n" +
    "<:VC_2:1482706376525611090> **Presenza vocale** reale e utile, soprattutto nelle vocali pubbliche.\n" +
    "<:VC_3:1482706404773990460> **Moderazione corretta**, con prove, articoli giusti e buon criterio.\n" +
    "<:VC_4:1482706432347344916> **Valutazioni positive** e contributi extra al server.\n" +
    "<:VC_5:1482706459765637272> **Comportamento maturo**, nessun abuso di potere e rispetto della guida staff.\n\n";

export = {
  pex: build_pex,
};
