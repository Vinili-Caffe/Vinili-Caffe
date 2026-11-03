const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");

const build_pause = () =>
    "<:Clock:1330530065133338685> Vinili & Caffè presenta un **sistema** di **`pause`** _sofisticato_, infatti è tutto __organizzato__ per **garantire** al meglio l'__attività__ del server.\n\n" +
    "<a:VC_Arrow:1482706699365257397> **__LIMITI ANNUALI E CONCORRENZA__**\n" +
    "<a:loading:1443934440614264924> In un anno si possono chiedere __massimo__ **`60 giorni`** di pausa che si possono usufruire in __tutti__ i **12 mesi** dell'anno.\n\n" +
    "> Nei giorni **festivi** avrete anche dei giorni in più **ulteriori** al __normale mese__:\n" +
    "<:VC_Dot:1482532364222595303> **24**, **25**, **26**, **31** __Dicembre__\n" +
    "<:VC_Dot:1482532364222595303> **1** Gennaio\n" +
    "<:VC_Dot:1482532364222595303> **Pasqua** e **Pasquetta**\n" +
    "<:VC_Dot:1482532364222595303> **25** __Aprile__\n" +
    "<:VC_Dot:1482532364222595303> **1** __Maggio__\n" +
    "<:VC_Dot:1482532364222595303> **2** __Giugno__\n" +
    "<:VC_Dot:1482532364222595303> **15** __Agosto__\n\n" +
    "> Naturalmente per **garantire** al meglio l'attività del server ci sono dei __limiti__ di staffer che possono essere in pausa nello __stesso periodo__\n" +
    "<:VC_Dot:1482532364222595303> <@&1442568904311570555> <a:VC_Arrow:1482706699365257397> __2__ **staffer**\n" +
    "<:VC_Dot:1482532364222595303> <@&" +
    IDs.roles.Mod +
    "> <a:VC_Arrow:1482706699365257397> __2__ **staffer**\n" +
    "<:VC_Dot:1482532364222595303> <@&" +
    IDs.roles.SeniorModerator +
    "> <a:VC_Arrow:1482706699365257397> __2__ **staffer**\n" +
    "<:VC_Dot:1482532364222595303> <@&" +
    IDs.roles.Director +
    "> <a:VC_Arrow:1482706699365257397> __1__ **staffer**\n" +
    "<:VC_Dot:1482532364222595303> <@&" +
    IDs.roles.Admin +
    "> <a:VC_Arrow:1482706699365257397> __1__ **staffer**\n" +
    "<:VC_Dot:1482532364222595303> <@&" +
    IDs.roles.Manager +
    "> <a:VC_Arrow:1482706699365257397> __1__ **staffer**\n\n" +
    "<:VC_Attention:1482534443632558151> **Pause intere:** puoi chiederne __una__ **ogni mese**. Se cade in `2` **__mesi diversi__**, conta il mese in cui viene **chiesta**, a patto che non superi i primi __`5` giorni__ dell'altro mese. Tra una richiesta e l'altra aspetta almeno **__`1 settimana`__**. Le pause intere partono **da domani** in poi.\n\n" +
    "<a:VC_pixeltime:1482535344103620771> **__MEZZE GIORNATE__**\n" +
    "<:VC_1:1482706338021642333> **Fasce:** **mattina** (fino alle 14) oppure **pomeriggio/sera** (dalle 14). Una fascia vale **0,5 giorni** del budget annuale: due mezze giornate = **1 giorno**.\n" +
    "<:VC_2:1482706376525611090> Si possono chiedere **anche per il giorno corrente**: mattina **entro le 9**, pomeriggio **entro le 14**. Sul form le fasce già iniziate sono **disattivate**.\n" +
    "<:VC_3:1482706404773990460> **Accettazione automatica:** mezza giornata per **oggi** nei limiti → accettata in automatico. Per altri giorni (o oltre i limiti) si può chiedere comunque, ma serve l'accettazione di un superiore. L'<@&1544831228690046976> può **annullare** una pausa accettata in automatico.\n" +
    "<:VC_4:1482706432347344916> **Limiti mezza giornata:** **1** a settimana e **4** al mese.\n" +
    "<:VC_5:1482706459765637272> Le mezze giornate **non contano** per la regola «una pausa al mese».\n" +
    "<:VC_6:1482706490769801327> **Resoconti:** una sola mezza giornata **non** esonera come una pausa intera; solo **due** mezze giornate nella **stessa settimana** contano come un giorno intero e il resoconto viene saltato.\n" +
    "<:VC_7:1482706523330183218> **Non si può chiedere:** la stessa fascia due volte; un giorno già coperto da una pausa intera; una mezza giornata il giorno **subito prima o dopo** una pausa intera.\n\n" +
    "> <:banhammer:1443651875441217639> Se l'<@&1544831228690046976> verrà a conoscenza di uno **staffer** __in pausa__ ma **attivo** in un **altro server** nel periodo di tempo della pausa, **toglierà** la pausa e **sanzionerà** lo staffer.";

export = {
  pause: build_pause,
};
