const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");

const { E } = require("../../../../../shared/emojis/emojiCatalog") as typeof import("../../../../../shared/emojis/emojiCatalog");
const build_valutazioni = () =>
    `${E["1370everythingisstable"]} **__VALUTAZIONI POSITIVE__**\n\n` +
    `${E.questionexclaimanimated} Le **valutazioni positive** aumentano la possibilità di essere **pexati** e si possono **ottenere** generando un'__attività__ **superiore** a quella richiesta nei _limiti settimanali_ o facendo qualcosa per dare un **vantaggio** al __server__.\n\n` +
    "> Le **valutazioni positive** si possono **__scambiare__** per dei giorni in più di **pausa**.\n\n" +
    `${E.laydowntorest} **__VALUTAZIONI NEGATIVE__**\n\n` +
    `${E.questionexclaimanimated} Le **valutazioni negative** diminuiscono la possibilità di essere **pexati** e si ottengono **non completando** i _limiti settimanali_ o facendo qualcosa di _nocivo_ per il **server**.\n\n` +
    "> Le **valutazioni negative** possono essere **__rimosse__** completando compiti extra assegnati dall'<@&1544831228690046976> o rinunciando ad almeno `3 o più valutazioni positive` in base al motivo per cui è stata assegnata la valutazione.\n\n" +
    `${E.VC_NewsExclamation} **__VALUTAZIONI AUTOMATICHE__**\n\n` +
    "> Ogni settimana si possono ottenere delle **valutazioni automatiche** in base a tre fattori:\n" +
    `${E.VC_1} **Completamento dei limiti settimanali superandoli __almeno del doppio__**\n` +
    `${E.VC_2} **Completamento dei compiti extra o settimanali**\n` +
    `${E.VC_3} **Completamento dei limiti sanzioni**\n\n` +
    "> Inoltre si possono ottenere delle valutazioni extra in base a alcuni ruoli:\n" +
    `${E.VC_1} **Mettendo il link vanity o il sito nello status o nella bio, o mettendo la nostra GUILD TAG**\n` +
    `${E.VC_2} **Seguendo le pagine social**\n` +
    `${E.VC_3} **Mettendo una recensione sul [nostro sito](https://www.viniliecaffe.it/recensioni)**\n` +
    `${E.VC_4} **Boostando il server o comprando un ruolo come Donator, VIP o VIP+** \n(${E.VC_Attention} __Attenzione: per i boost varrà anche solo con un boost, se viene trasferito verrà rimossa anche la valutazione.__ Solo per i ruoli Supporter e Follower bisogna aprire un ticket **perks** sul sito\n\n` +
    "> L'<@&" +
    IDs.roles.HighStaff +
    "> può inoltre decidere di assegnare valutazioni extra a discrezione in base a comportamenti particolarmente virtuosi o dannosi per la community.";

export = {
  valutazioni: build_valutazioni,
};
