const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");

const build_valutazioni = () =>
    "<a:1370everythingisstable:1444006799643508778> **__VALUTAZIONI POSITIVE__**\n\n" +
    "<a:questionexclaimanimated:1443660299994533960> Le **valutazioni positive** aumentano la possibilità di essere **pexati** e si possono **ottenere** generando un'__attività__ **superiore** a quella richiesta nei _limiti settimanali_ o facendo qualcosa per dare un **vantaggio** al __server__.\n\n" +
    "> Le **valutazioni positive** si possono **__scambiare__** per dei giorni in più di **pausa**.\n\n" +
    "<a:laydowntorest:1444006796661358673> **__VALUTAZIONI NEGATIVE__**\n\n" +
    "<a:questionexclaimanimated:1443660299994533960> Le **valutazioni negative** diminuiscono la possibilità di essere **pexati** e si ottengono **non completando** i _limiti settimanali_ o facendo qualcosa di _nocivo_ per il **server**.\n\n" +
    "> Le **valutazioni negative** possono essere **__rimosse__** completando compiti extra assegnati dall'<@&1544831228690046976> o rinunciando ad almeno `3 o più valutazioni positive` in base al motivo per cui è stata assegnata la valutazione.\n\n" +
    "<a:VC_NewsExclamation:1471891662786527253> **__VALUTAZIONI AUTOMATICHE__**\n\n" +
    "> Ogni settimana si possono ottenere delle **valutazioni automatiche** in base a tre fattori:\n" +
    "<:VC_1:1482706338021642333> **Completamento dei limiti settimanali superandoli __almeno del doppio__**\n" +
    "<:VC_2:1482706376525611090> **Completamento dei compiti extra o settimanali**\n" +
    "<:VC_3:1482706404773990460> **Completamento dei limiti sanzioni**\n\n" +
    "> Inoltre si possono ottenere delle valutazioni extra in base a alcuni ruoli:\n" +
    "<:VC_1:1482706338021642333> **Mettendo il link vanity o il sito nello status o nella bio, o mettendo la nostra GUILD TAG**\n" +
    "<:VC_2:1482706376525611090> **Seguendo le pagine social**\n" +
    "<:VC_3:1482706404773990460> **Mettendo una recensione sul [nostro sito](https://www.viniliecaffe.it/recensioni)**\n" +
    `<:VC_4:1482706432347344916> **Boostando il server o comprando un ruolo come Donator, VIP o VIP+** \n(<:VC_Attention:1482534443632558151> __Attenzione: per i boost varrà anche solo con un boost, se viene trasferito verrà rimossa anche la valutazione.__ Solo per i ruoli Supporter e Follower bisogna aprire un ticket **perks** sul sito\n\n` +
    "> L'<@&" +
    IDs.roles.HighStaff +
    "> può inoltre decidere di assegnare valutazioni extra a discrezione in base a comportamenti particolarmente virtuosi o dannosi per la community.";

export = {
  valutazioni: build_valutazioni,
};
