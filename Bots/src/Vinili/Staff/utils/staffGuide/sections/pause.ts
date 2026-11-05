const IDs = require("../../../../Config/ids") as typeof import("../../../../Config/ids");

const { E } = require("../../../../../shared/emojis/emojiCatalog") as typeof import("../../../../../shared/emojis/emojiCatalog");
const build_pause = () =>
    `${E.Clock} Vinili & Caffè presenta un **sistema** di **\`pause\`** _sofisticato_, infatti è tutto __organizzato__ per **garantire** al meglio l'__attività__ del server.\n\n` +
    `${E.VC_Arrow} **__LIMITI ANNUALI E CONCORRENZA__**\n` +
    `${E.loading} In un anno si possono chiedere __massimo__ **\`60 giorni\`** di pausa che si possono usufruire in __tutti__ i **12 mesi** dell'anno.\n\n` +
    "> Nei giorni **festivi** avrete anche dei giorni in più **ulteriori** al __normale mese__:\n" +
    `${E.VC_Dot} **24**, **25**, **26**, **31** __Dicembre__\n` +
    `${E.VC_Dot} **1** Gennaio\n` +
    `${E.VC_Dot} **Pasqua** e **Pasquetta**\n` +
    `${E.VC_Dot} **25** __Aprile__\n` +
    `${E.VC_Dot} **1** __Maggio__\n` +
    `${E.VC_Dot} **2** __Giugno__\n` +
    `${E.VC_Dot} **15** __Agosto__\n\n` +
    "> Naturalmente per **garantire** al meglio l'attività del server ci sono dei __limiti__ di staffer che possono essere in pausa nello __stesso periodo__\n" +
    `${E.VC_Dot} <@&1442568904311570555> ${E.VC_Arrow} __2__ **staffer**\n` +
    `${E.VC_Dot} <@&` +
    IDs.roles.Mod +
    `> ${E.VC_Arrow} __2__ **staffer**\n` +
    `${E.VC_Dot} <@&` +
    IDs.roles.SeniorModerator +
    `> ${E.VC_Arrow} __2__ **staffer**\n` +
    `${E.VC_Dot} <@&` +
    IDs.roles.Director +
    `> ${E.VC_Arrow} __1__ **staffer**\n` +
    `${E.VC_Dot} <@&` +
    IDs.roles.Admin +
    `> ${E.VC_Arrow} __1__ **staffer**\n` +
    `${E.VC_Dot} <@&` +
    IDs.roles.Manager +
    `> ${E.VC_Arrow} __1__ **staffer**\n\n` +
    `${E.VC_Attention} **Pause intere:** puoi chiederne __una__ **ogni mese**. Se cade in \`2\` **__mesi diversi__**, conta il mese in cui viene **chiesta**, a patto che non superi i primi __\`5\` giorni__ dell'altro mese. Tra una richiesta e l'altra aspetta almeno **__\`1 settimana\`__**. Le pause intere partono **da domani** in poi.\n\n` +
    `${E.VC_pixeltime} **__MEZZE GIORNATE__**\n` +
    `${E.VC_1} **Fasce:** **mattina** (fino alle 14) oppure **pomeriggio/sera** (dalle 14). Una fascia vale **0,5 giorni** del budget annuale: due mezze giornate = **1 giorno**.\n` +
    `${E.VC_2} Si possono chiedere **anche per il giorno corrente**: mattina **entro le 9**, pomeriggio **entro le 14**. Sul form le fasce già iniziate sono **disattivate**.\n` +
    `${E.VC_3} **Accettazione automatica:** mezza giornata per **oggi** nei limiti → accettata in automatico. Per altri giorni (o oltre i limiti) si può chiedere comunque, ma serve l'accettazione di un superiore. L'<@&1544831228690046976> può **annullare** una pausa accettata in automatico.\n` +
    `${E.VC_4} **Limiti mezza giornata:** **1** a settimana e **4** al mese.\n` +
    `${E.VC_5} Le mezze giornate **non contano** per la regola «una pausa al mese».\n` +
    `${E.VC_6} **Resoconti:** una sola mezza giornata **non** esonera come una pausa intera; solo **due** mezze giornate nella **stessa settimana** contano come un giorno intero e il resoconto viene saltato.\n` +
    `${E.VC_7} **Non si può chiedere:** la stessa fascia due volte; un giorno già coperto da una pausa intera; una mezza giornata il giorno **subito prima o dopo** una pausa intera.\n\n` +
    `> ${E.banhammer} Se l'<@&1544831228690046976> verrà a conoscenza di uno **staffer** __in pausa__ ma **attivo** in un **altro server** nel periodo di tempo della pausa, **toglierà** la pausa e **sanzionerà** lo staffer.`;

export = {
  pause: build_pause,
};
