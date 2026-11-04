const { E } = require("../../../../../shared/emojis/emojiCatalog") as typeof import("../../../../../shared/emojis/emojiCatalog");
const build_compiti_fissi = () =>
    `${E.VC_Calendar} **Come funziona**\n` +
    `${E.VC_Dot} All'inizio di ogni **mese** ricevi un **set** di **4 o 5** compiti (uno per ogni settimana del mese).\n` +
    `${E.VC_Dot} Nel set c'è **sempre e obbligatoriamente 1** compito **difficile**; gli altri sono **facili** o **medi**.\n` +
    `${E.VC_Dot} Ogni **settimana** scegli **1 compito** dal set (non puoi ripetere lo stesso compito nello stesso mese).\n` +
    `${E.VC_Dot} Gli **scambi** ti danno un compito della **stessa difficoltà** di quello che stai scambiando.\n` +
    `${E.VC_Dot} Compiti **manuali**: scrivi cosa hai fatto e/o allega le prove → **Invia prove**.\n` +
    `${E.VC_Dot} Compiti **automatici**: li selezioni e si completano da soli.\n` +
    `${E.VC_bluthumbsup} Compito **approvato** → **valutazione positiva**. Compito **rifiutato** → **riprova fino alla scadenza**\n` +
    `${E.VC_bluthumbsdown} Compito **non inviato** entro domenica 18 / compito **rifiutato** definitivamente → **valutazione negativa**.\n\n` +
    `${E.VC_Money} **Provvigione su donazioni e sponsor**\n` +
    "Se porti tu l'acquisto, ricevi una percentuale **progressiva** sul pacchetto o sulla sponsor:\n" +
    `${E.VC_Dot} **5%** → pacchetto **Donator** oppure sponsor **7 giorni** / sponsor **durante un evento**\n` +
    `${E.VC_Dot} **10%** → pacchetto **VIP** oppure sponsor **14 giorni**\n` +
    `${E.VC_Dot} **15%** → pacchetto **VIP+** oppure sponsor **30 giorni**\n` +
    `> ${E.VC_Alert} Per i **canali privati** la percentuale resta quella del pacchetto anche con 1 o 2 ping. **Ping aggiuntivi** o **rinnovi collaterali** non aumentano e non generano una nuova percentuale.\n\n` +
    `${E.VC_Arrow} **Catalogo compiti**\n\n` +
    "**Facile**\n" +
    `${E.VC_Dot} Completare i limiti del triplo\n` +
    `${E.VC_Dot} Ottenere una recensione di se stessi da almeno 4 stelle\n` +
    `${E.VC_Dot} Ottenere una recensione per il server da almeno 4 stelle\n` +
    `${E.VC_Dot} Dare un'idea per il server/staff/sito/evento e non farsela rifiutare\n\n` +
    "**Medio**\n" +
    `${E.VC_Dot} Trovare un nuovo staffer\n` +
    `${E.VC_Dot} Invitare almeno 1 utente e fargli scrivere 100 messaggi o 2 ore in vocale\n` +
    `${E.VC_Dot} Far boostare il server da un utente\n` +
    `${E.VC_Dot} Far aggiungere il bot in un server e fargli fare il setup\n\n` +
    "**Difficile**\n" +
    `${E.VC_Dot} Trovare un server che compri una sponsor\n` +
    `${E.VC_Dot} Trovare un server che faccia trasferimento da noi\n` +
    `${E.VC_Dot} Convincere un utente a comprare un pacchetto Donator/VIP/VIP+\n\n`;

export = {
  compiti_fissi: build_compiti_fissi,
};
