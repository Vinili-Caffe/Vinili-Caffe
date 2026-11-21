// Domande frequenti. Nei testi, [[Etichetta|/percorso/]] diventa un link.

export type FaqCategory = { id: string; label: string };
export type FaqItem = { id: string; category: string; title: string; body: string };

export const FAQ_CATEGORIES: FaqCategory[] = [
  { id: "server", label: "Il server" },
  { id: "livelli", label: "Livelli" },
  { id: "voce", label: "Musica" },
  { id: "giochi", label: "Giochi" },
  { id: "eventi", label: "Eventi" },
  { id: "staff", label: "Staff" },
  { id: "sito", label: "Sito" },
  { id: "vetrina", label: "Vetrina" },
];

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: "cose-vinili",
    category: "server",
    title: "Che cos’è Vinili & Caffè?",
    body: "È una community italiana su Discord. Ci si trova per parlare di tutto, ascoltare musica insieme nelle stanze vocali, giocare e partecipare agli eventi che organizziamo durante l’anno. Esiste solo online: il server Discord è il punto d’incontro, e questo sito raccoglie regole, guide e le pagine della community.",
  },
  {
    id: "gratis",
    category: "server",
    title: "Bisogna pagare qualcosa?",
    body: "No. Entrare, scrivere, stare in vocale e partecipare agli eventi è gratis. Le [[donazioni|/donazioni/]] e i boost del server sono facoltativi: aiutano a tenere in piedi bot e sito, e chi li fa riceve qualche vantaggio in più, ma nessuna parte del server è chiusa a chi non paga.",
  },
  {
    id: "eta",
    category: "server",
    title: "C’è un’età minima?",
    body: "Sì, quella di Discord: servono almeno 13 anni. Come trattiamo i dati lo trovi nella [[Privacy|/privacy/]].",
  },
  {
    id: "primi-passi",
    category: "server",
    title: "Sono appena entrato: da dove comincio?",
    body: "Leggi le [[regole|/regole/]], scegli i ruoli che ti interessano e presentati nel canale indicato. Poi buttati in una chat o in una stanza vocale: è il modo più veloce per conoscere qualcuno. Se ti perdi, chiedi pure in chat, qualcuno ti risponde.",
  },
  {
    id: "sicurezza",
    category: "server",
    title: "Come tenete il server tranquillo?",
    body: "Con un regolamento breve, uno staff presente e dei bot che bloccano spam, link truffa e account sospetti prima che facciano danni. Se qualcuno ti dà fastidio non serve rispondere: segnalalo allo staff o apri un [[ticket|/tickets/]], e ce ne occupiamo noi.",
  },
  {
    id: "exp",
    category: "livelli",
    title: "Come salgono i livelli?",
    body: "Si guadagna esperienza scrivendo in chat e stando in vocale, e il tempo in vocale vale un po’ di più. Non c’è niente da fare di speciale: basta partecipare. Nei [[Perks|/perks/]] trovi cosa si sblocca salendo di livello, nelle [[classifiche|/classifiche/]] vedi a che punto sono gli altri.",
  },
  {
    id: "minigames",
    category: "livelli",
    title: "Cosa sono i minigiochi in chat?",
    body: "Ogni tanto, durante la giornata, il bot manda in chat un piccolo gioco: una parola da indovinare, una domanda, una sfida veloce. Chi risponde per primo prende un po’ di esperienza. Non è obbligatorio, e il messaggio del bot spiega ogni volta come si gioca.",
  },
  {
    id: "musica",
    category: "voce",
    title: "Si può ascoltare musica insieme?",
    body: "Sì, nelle stanze vocali con i nostri bot. Chiunque può mettere in coda una canzone; l’unica richiesta è tenere il volume ragionevole e non usare brani fatti apposta per dare fastidio. I comandi sono nella [[guida ai comandi|/wiki/]], e se non ti tornano chiedi in stanza.",
  },
  {
    id: "giochi",
    category: "giochi",
    title: "Che giochi ci sono?",
    body: "Ci sono canali dedicati a giochi come Pokétwo, al conteggio e agli abbinamenti, oltre ai minigiochi che il bot lancia in chat. Sul sito c’è anche il [[Wordle|/wordle/]] con una parola nuova ogni giorno. Prendi quello che ti diverte e lascia il resto: nessun gioco è obbligatorio per partecipare agli eventi.",
  },
  {
    id: "season",
    category: "eventi",
    title: "Come funzionano le stagioni?",
    body: "Ogni tanto parte una stagione che dura qualche mese, con un tema, delle sfide e una classifica dedicata. Le regole cambiano da una stagione all’altra, quindi conviene leggere l’annuncio d’apertura prima di cominciare. Gli annunci escono sul server, nel canale apposito.",
  },
  {
    id: "vincere",
    category: "eventi",
    title: "Come si vince agli eventi?",
    body: "Ogni evento ha le sue istruzioni, ed è la prima cosa da leggere. In generale aiuta essere presenti in chat e in vocale; [[votare il server|/vote/]] e fare un boost danno qualche bonus, spiegato nei [[Perks|/perks/]]. Ma a vincere, di solito, è chi partecipa con costanza.",
  },
  {
    id: "staff-pagato",
    category: "staff",
    title: "Lo staff viene premiato?",
    body: "Sì. Ogni mese chi nello staff ha lavorato meglio riceve un premio, e i Partner Manager possono ottenerne in base alle partnership che chiudono. È un modo per dire grazie a chi dedica tempo al server, e non va confuso con uno stipendio.",
  },
  {
    id: "candidatura",
    category: "staff",
    title: "Posso entrare nello staff?",
    body: "Sì, cerchiamo persone nuove abbastanza spesso. Leggi le [[regole|/regole/]] e invia la domanda dalla pagina [[Candidature|/candidature/]]; se hai già fatto esperienza in altri server, scrivilo. Dopo l’invio non serve taggare lo staff o aprire un ticket per chiedere l’esito: ti rispondiamo appena abbiamo letto.",
  },
  {
    id: "join-server",
    category: "sito",
    title: "Come entro nel server?",
    body: "Con il pulsante Discord che trovi in cima a ogni pagina del sito, oppure con un nostro link d’invito. Una volta dentro, leggi le regole e presentati nel canale indicato. Se non hai ancora un account Discord, lo crei gratis in un paio di minuti.",
  },
  {
    id: "sito-discord-login",
    category: "sito",
    title: "Perché a volte il sito chiede di entrare con Discord?",
    body: "Solo quando fai qualcosa a tuo nome: votare o recensire, aprire un [[ticket|/tickets/]], gestire una scheda nella Vetrina. Tutto il resto si legge anche senza accedere. L’accesso usa il login ufficiale di Discord, quindi la tua password non passa mai dal nostro sito.",
  },
  {
    id: "sito-tickets",
    category: "sito",
    title: "Come si apre un ticket?",
    body: "Vai sulla pagina [[Ticket|/tickets/]], entra con Discord e spiega cosa ti serve, con più dettagli possibile. Lo staff risponde nella stessa conversazione. Per le domande veloci conviene prima dare un’occhiata a queste FAQ o chiedere in chat.",
  },
  {
    id: "sito-bot-wiki",
    category: "sito",
    title: "Dove trovo i comandi dei bot?",
    body: "Nella [[guida ai comandi|/wiki/]] e nella sezione «Il bot Vinili» qui sopra. I bot sono pensati per il nostro server, quindi alcuni comandi funzionano solo lì.",
  },
  {
    id: "vetrina-cose",
    category: "vetrina",
    title: "Cos’è la Vetrina?",
    body: "Un elenco pubblico di server e bot Discord, ognuno con la sua scheda, i voti e le recensioni. Serve a scoprire community e bot nuovi, o a far conoscere il proprio. Le conversazioni restano sui rispettivi server: la scheda è solo una presentazione.",
  },
  {
    id: "vetrina-lista",
    category: "vetrina",
    title: "Come metto un server o un bot in elenco?",
    body: "Dalla pagina [[Metti in vetrina|/vetrina/invia/]] compili la scheda con descrizione, categorie e link. Lo staff la controlla prima di pubblicarla; dopo l’approvazione compare nell’elenco e la gestisci da [[Le mie schede|/vetrina/le-mie/]].",
  },
  {
    id: "vetrina-voti",
    category: "vetrina",
    title: "Come si vota una scheda?",
    body: "Entri con Discord e puoi dare un voto al giorno a ogni scheda. Le schede più votate salgono in classifica. Se hai qualcosa da raccontare, oltre al voto puoi lasciare una recensione.",
  },
  {
    id: "vetrina-recensioni",
    category: "vetrina",
    title: "Come si lascia una recensione?",
    body: "Apri la scheda, accedi, scegli le stelle e scrivi qualche riga su com’è andata. Si può lasciare una sola recensione per scheda, che poi puoi modificare. Prima di scrivere dai un’occhiata alle [[linee guida|/vetrina/linee-guida-recensioni/]]: niente spam, insulti o recensioni scambiate per favore.",
  },
  {
    id: "vetrina-segnala",
    category: "vetrina",
    title: "Come segnalo qualcosa che non va?",
    body: "Ogni scheda e ogni recensione hanno il pulsante per segnalarle. Se la questione è lunga o delicata, apri un [[ticket|/tickets/]] e spiega cosa è successo: per i casi gravi è meglio passare dallo staff che lasciare una recensione negativa.",
  },
];
