
const BOT_FAQ_SECTIONS = Object.freeze([
  {
    id: "faq_start",
    label: "Inizio",
    description: "Accesso, invito bot e primi passi",
    emoji: "<:VC_Bot:1482526555174604964>",
  },
  {
    id: "faq_dashboard",
    label: "Dashboard",
    description: "Come muoversi nella dashboard",
    emoji: "<:VC_tools:1478862265305272364>",
  },
  {
    id: "faq_settings",
    label: "Impostazioni",
    description: "Identità bot, accessi e avvisi",
    emoji: "<:VC_tools:1478862265305272364>",
  },
  {
    id: "faq_commands",
    label: "Comandi",
    description: "Attivazione e limiti per canale o ruolo",
    emoji: "<:VC_Mention:1482526855289634997>",
  },
  {
    id: "faq_partnership",
    label: "Partnership",
    description: "Configurazione e pubblicazione partner",
    emoji: "<:exp:1470067108543987846>",
  },
  {
    id: "faq_team",
    label: "Team e punti",
    description: "Manager, punti, cronologia e classifiche",
    emoji: "<a:VC_LevelUp:1482527020641419415>",
  },
  {
    id: "faq_premium",
    label: "Premium",
    description: "Cosa sblocca Premium sulla dashboard",
    emoji: "<:VC_Bot:1482526555174604964>",
  },
  {
    id: "faq_data",
    label: "Dati",
    description: "Migrazione, reset e sicurezza",
    emoji: "<:VC_tools:1478862265305272364>",
  },
  {
    id: "faq_help",
    label: "Aiuto",
    description: "Problemi, stato e assistenza",
    emoji: "<:VC_PinkQuestionMark:1471892611026391306>",
  },
]);

const BOT_FAQ_SECTION_IDS = new Set(BOT_FAQ_SECTIONS.map((section) => section.id));

const BOT_FAQ_ITEMS = Object.freeze([
    {
    category: "faq_start",
    title: "Cos’è Vinili e a cosa serve la dashboard?",
    icon: "fa-info-circle",
    body: [
      "Vinili è un bot Discord pensato per gestirti il server in modo ordinato: partnership, comandi, personalizzazioni e strumenti di team.",
      "La **dashboard web** è il pannello di controllo ufficiale. Da lì configuri il bot sul server, attivi o limiti i comandi, gestisci le partnership e consulti punti, cronologia e classifiche — senza dover ricordare scorciatoie su Discord.",
    ].join("\n\n"),
  },
  {
    category: "faq_start",
    title: "Perché non vedo un server in elenco?",
    icon: "fa-server",
    body: [
      "Se sei già in dashboard ma un server manca dall’elenco, di solito vale una di queste cose: il bot non è in quel server, il tuo account non ha i permessi richiesti per gestirlo, oppure Discord non ha ancora aggiornato gli scope dopo un nuovo accesso.",
      "Prova a uscire e rientrare con Discord, poi ricarica la pagina. Se il server resta assente, controlla che Vinili sia ancora nel server e che il tuo ruolo abbia i permessi necessari (o sia tra i ruoli abilitati nelle Impostazioni).",
    ].join("\n\n"),
  },
  {
    category: "faq_start",
    title: "Come aggiungo il bot al mio server?",
    icon: "fa-plus-circle",
    body: [
      "Dalla home della dashboard (o dal link di invito ufficiale) invita Vinili nel server scegliendo il server corretto nella schermata Discord.",
      "Il bot ha bisogno di poter **leggere e scrivere** nei canali che userai, gestire messaggi dove pubblica contenuti, e — per le partnership — creare o gestire inviti se la tua procedura lo richiede. Se i permessi sono troppo stretti, alcune azioni falliscono in silenzio o con un errore chiaro: in quel caso alza i permessi del ruolo del bot nel canale interessato.",
      "Dopo l’invito, torna in dashboard, seleziona il server e completa la configurazione iniziale.",
    ].join("\n\n"),
  },
  {
    category: "faq_start",
    title: "Chi può gestire la dashboard di un server?",
    icon: "fa-shield",
    body: [
      "In generale possono aprire e modificare la dashboard chi ha i **permessi di amministrazione** sul server Discord, oppure chi è stato abilitato tramite i **ruoli di accesso dashboard** che imposti nelle Impostazioni del server.",
      "Puoi restringere l’accesso a pochi ruoli di fiducia (staff, owner team, ecc.). Chi non rientra vede il server bloccato o non lo vede affatto nell’elenco.",
      "I membri normali del server non configurano il bot dalla dashboard: usano i comandi e le funzioni che tu hai reso disponibili.",
    ].join("\n\n"),
  },

    {
    category: "faq_dashboard",
    title: "Come è organizzata la dashboard di un server?",
    icon: "fa-th-large",
    body: [
      "Dopo aver scelto un server entri nella **panoramica**: stato generale, accesso rapido ai moduli e indicazioni su Premium se attivo.",
      "Dal menu laterale (o dalle schede moduli) puoi aprire:",
      "• **Impostazioni** — identità del bot sul server, ruoli che possono usare la dashboard, canale aggiornamenti.\n• **Comandi** — elenco comandi, on/off e limiti per canale o ruolo.\n• **Partnership** — setup, canali, filtri, blacklist, team, cronologia, classifiche e strumenti dati.\n• **Team e punti** — manager, punti, cronologia e classifiche.",
      "In alto restano i collegamenti utili del sito (FAQ, Status, Premium, Feedback, Recensioni) e il selettore lingua.",
    ].join("\n\n"),
  },
  {
    category: "faq_dashboard",
    title: "Come passo da un server all’altro?",
    icon: "fa-exchange",
    body: [
      "Dalla home Dashboard torni all’elenco server e ne apri un altro. In molte viste guild è anche disponibile lo **switcher** per cambiare server senza ripartire da zero.",
      "Ogni server ha la propria configurazione: canali, ruoli, comandi e partnership **non** sono condivisi tra server diversi.",
    ].join("\n\n"),
  },
  {
    category: "faq_dashboard",
    title: "Le modifiche si applicano subito?",
    icon: "fa-floppy-o",
    body: [
      "Sì, nella maggior parte dei casi il salvataggio in dashboard aggiorna subito la configurazione usata dal bot.",
      "Eccezioni tipiche: sincronizzazione dei **permessi slash** con Discord (può richiedere qualche secondo), cache del browser (un refresh risolutivo aiuta), oppure azioni in coda come **migrazioni dati** che mostrano uno stato di avanzamento.",
      "Se qualcosa non torna, controlla lo Status del servizio e che il bot sia online nel server.",
    ].join("\n\n"),
  },

    {
    category: "faq_settings",
    title: "Cosa posso cambiare nelle Impostazioni server?",
    icon: "fa-cog",
    body: [
      "Nella sezione Impostazioni gestisci come il bot si presenta e chi può amministrarlo dal web.",
      "**Identità sul server** (alcune voci richiedono Premium): nickname del bot nel server, avatar e banner del bot sul server. Il prefisso dei comandi testuali è configurabile anche senza Premium.",
      "**Accesso dashboard**: scegli uno o più ruoli Discord autorizzati a usare la dashboard di quel server, oltre a chi ha già i permessi di amministrazione.",
      "**Canale aggiornamenti / news**: se impostato, il bot può inoltrare lì comunicazioni utili (novità, avvisi tecnici). Lasciarlo vuoto disattiva l’inoltro.",
    ].join("\n\n"),
  },
  {
    category: "faq_settings",
    title: "Cosa significa personalizzare nickname, avatar o banner?",
    icon: "fa-paint-brush",
    body: [
      "Sono personalizzazioni **del bot su quel server**, non del tuo account Discord. Servono a far riconoscere Vinili nella community (stile, branding, coerenza con il tema del server).",
      "Se una voce è riservata a Premium, in dashboard compare il blocco o il badge corrispondente: senza Premium restano disponibili le impostazioni di base.",
    ].join("\n\n"),
  },

    {
    category: "faq_commands",
    title: "Come funziona la sezione Comandi?",
    icon: "fa-terminal",
    body: [
      "Qui trovi il catalogo dei comandi disponibili, raggruppati per categoria (utility, partnership, musica, moderazione, e così via).",
      "Per ogni comando puoi tipicamente:",
      "• **attivarlo o disattivarlo** sul server;\n• limitarne l’uso a **canali consentiti** oppure escludere canali;\n• limitarne l’uso a **ruoli consentiti** oppure escludere ruoli;\n• aprire l’aiuto del comando per capire a cosa serve.",
      "Regola pratica: se imposti elenchi «consentiti», gli elenchi «ignorati» dello stesso tipo vanno considerati in alternativa — non mescolare logiche opposte senza un motivo chiaro. La dashboard ti guida su questo punto.",
    ].join("\n\n"),
  },
  {
    category: "faq_commands",
    title: "Slash commands e permessi Discord: cosa devo sapere?",
    icon: "fa-link",
    body: [
      "I comandi slash e i menu contestuali (Apps sul messaggio o sull’utente) vivono anche nelle **integrazioni Discord** del server.",
      "Dalla dashboard puoi sincronizzare o allineare i permessi verso Discord. Se un comando appare in dashboard ma in Discord risulta grigio o mancante, controlla: bot online, sincronizzazione eseguita, e permessi del ruolo del bot nel canale.",
      "Alcuni comandi di partnership possono **ereditare** i limiti del comando partnership principale se non hanno regole proprie: utile per tenere tutto coerente senza ripetere la stessa configurazione.",
    ].join("\n\n"),
  },
  {
    category: "faq_commands",
    title: "Cosa fare se un comando non compare o non si può usare?",
    icon: "fa-exclamation-triangle",
    body: [
      "Verifica nell’ordine: comando abilitato in dashboard → limiti canale/ruolo → permessi Discord del membro e del bot → eventuale necessità di Premium per quella funzione.",
      "Se il comando è slash, prova a riaprire Discord o a rieseguire la sincronizzazione permessi. Se resta bloccato, controlla la pagina Status e il Feedback del sito per segnalare il caso.",
    ].join("\n\n"),
  },

    {
    category: "faq_partnership",
    title: "Come configuro le partnership la prima volta?",
    icon: "fa-rocket",
    body: [
      "Apri **Partnership** sul server e segui la procedura guidata di avvio (se il server non è ancora pronto).",
      "In sintesi ti verrà chiesto di impostare:",
      "• il **canale partnership** dove escono i messaggi pubblicati;\n• (facoltativo) un **canale log/attività**;\n• il **ruolo del team** che gestisce le partnership;\n• eventuali **avvisi automatici** con soglie (notifiche di massa o verso un ruolo), più un eventuale ritardo tra un avviso “vero” e l’altro.",
      "Completata la procedura, le modifiche successive si fanno dalle sottosezioni Partnership (Generale, Filtri, Embed, ecc.), sempre dalla dashboard.",
    ].join("\n\n"),
  },
  {
    category: "faq_partnership",
    title: "Cosa imposto in Partnership → Generale?",
    icon: "fa-sliders",
    body: [
      "**Canali**: dove pubblicare, dove registrare l’attività, e (se previsto) in quali canali o categorie il team può usare gli strumenti partnership.",
      "**Team / ruoli**: ruolo che identifica chi gestisce le partner; eventuale ruolo badge assegnato al manager della partner.",
      "**Avvisi automatici**: soglie e ritardi per le notifiche. Se il ritardo è attivo, una menzione può comparire nel messaggio senza rinviare una notifica immediata ogni volta.",
      "**Opzioni**: se il manager è obbligatorio o meno in esecuzione; se è ammessa la partnership manuale nel canale; cosa fare se il manager lascia il server; eventuali limiti di ripetizione sullo stesso server partner.",
      "**Descrizione del tuo server**: puoi farla prendere dall’ultimo messaggio di un canale oppure usare un testo fisso. Se la lasci vuota, quella parte resta disattivata.",
    ].join("\n\n"),
  },
  {
    category: "faq_partnership",
    title: "A cosa servono i Filtri sulle descrizioni?",
    icon: "fa-filter",
    body: [
      "I filtri ripuliscono in automatico i testi delle partnership in ingresso, per tenere i messaggi ordinati e sicuri.",
      "Puoi attivare regole come: rimuovere menzioni a utenti/ruoli/canali, rimuovere menzioni di massa, togliere link esterni (tenendo in genere l’invito Discord), rimuovere emoji personalizzate, caratteri invisibili o spoiler, e mantenere un solo invito utile.",
      "Attivali in base al livello di rigore che vuoi sul canale partnership.",
    ].join("\n\n"),
  },
  {
    category: "faq_partnership",
    title: "Come si pubblica o elimina una partnership su Discord?",
    icon: "fa-handshake-o",
    body: [
      "Dal lato Discord usi gli strumenti partnership del bot (comandi slash o menu Apps sul messaggio), secondo ciò che hai abilitato in dashboard.",
      "In una pubblicazione tipica indichi descrizione e invito del server partner e, se richiesto dalla tua configurazione, il manager. A partner valida viene conteggiato il punto al team.",
      "Per rimuovere una partner già pubblicata, usa l’azione contestuale di eliminazione sul messaggio della partnership (se disponibile e se hai i permessi).",
      "Se i punti non arrivano, di solito la partner non è considerata valida: dati mancanti, server in lista bloccati, oppure un errore mostrato dal bot. Leggi sempre il messaggio di esito.",
    ].join("\n\n"),
  },
  {
    category: "faq_partnership",
    title: "Come funziona la Blacklist partnership?",
    icon: "fa-ban",
    body: [
      "Dalla sottosezione **Blacklist** puoi bloccare server partner (tramite invito o ID) e aggiungere una nota opzionale.",
      "I server in blacklist non devono generare partnership valide. Puoi elencare, aggiornare e rimuovere voci dalla stessa schermata.",
      "Usala per evitare partner ripetute indesiderate, server problematici o accordi che non vuoi accettare.",
    ].join("\n\n"),
  },
  {
    category: "faq_partnership",
    title: "Cosa c’è in Partnership → Embed?",
    icon: "fa-picture-o",
    body: [
      "Qui personalizzi l’**embed di ringraziamento** (o messaggio strutturato) legato alle partnership: colori, titolo, autore, immagini, footer, descrizione e timestamp.",
      "Di norma questa area è **Premium**. Senza Premium restano i valori predefiniti; con Premium puoi allineare lo stile al branding del server e resettare ai default quando serve.",
    ].join("\n\n"),
  },

    {
    category: "faq_team",
    title: "Come funzionano i punti partnership?",
    icon: "fa-trophy",
    body: [
      "I punti contano le **partnership valide** eseguite su **quel server**. In sintesi: una partner valida corrisponde a un punto per chi la porta a termine secondo le regole del server.",
      "I punti sono legati al contesto del server Vinili che stai gestendo: non sono un saldo globale del sito, ma una metrica di attività partnership in quella community.",
    ].join("\n\n"),
  },
  {
    category: "faq_team",
    title: "Cosa posso fare in Partner Manager, Cronologia e Classifiche?",
    icon: "fa-users",
    body: [
      "**Partner Manager**: elenco di chi ha il ruolo team, con viste su punti spendibili/statistiche (giorno, settimana, totale) e strumenti admin per aggiungere o togliere punti quando serve.",
      "**Cronologia**: storico dei server con cui avete partnerizzato, quante volte, ultima data, filtri periodo e paginazione. Dove disponibile puoi anche aprire l’invito.",
      "**Classifiche**: classifiche per server partner, manager e join, con periodi totale/giornaliero/settimanale e la tua posizione quando applicabile.",
      "Queste viste sostituiscono la necessità di “andare a memoria”: tutto è consultabile dalla dashboard.",
    ].join("\n\n"),
  },

    {
    category: "faq_premium",
    title: "Cosa sblocca Premium sulla dashboard?",
    icon: "fa-diamond",
    body: [
      "Premium abilita personalizzazioni avanzate sul server (identità bot, embed partnership personalizzato, e altre voci indicate con badge Premium nelle schede).",
      "Puoi gestire o acquistare crediti/piani dalle pagine **Premium** e **Crediti** del sito. Lo stato Premium del server compare in panoramica.",
      "Se una funzione è Premium e il server non lo è, la dashboard lo segnala chiaramente invece di far fallire l’azione senza spiegazioni.",
    ].join("\n\n"),
  },

    {
    category: "faq_data",
    title: "A cosa serve la sezione Dati (migrazione)?",
    icon: "fa-database",
    body: [
      "Se avevi già uno storico partnership su Discord, puoi **importarlo** nella dashboard per ricostruire conteggi e cronologia.",
      "La migrazione mostra avanzamento, coda, conteggi (messaggi letti, trovati, importati, saltati) e permette retry o annullamento dell’import secondo le opzioni disponibili.",
      "Puoi basarti sulla configurazione attuale oppure indicare manualmente canali/ruoli di origine. È uno strumento potente: leggi le istruzioni in pagina prima di avviarla.",
    ].join("\n\n"),
  },
  {
    category: "faq_data",
    title: "Cosa fa la cancellazione / reset dei dati partnership?",
    icon: "fa-trash",
    body: [
      "L’azione di reset nella sezione Dati azzera la **configurazione partnership** del server (canali, ruoli, ping, opzioni, descrizione, embed, blacklist, notifiche/statistiche collegate alla config).",
      "Di solito **non** cancella lo storico delle partnership già eseguite: serve a ripartire puliti sulla configurazione, non a fingere che non siano mai esistite le partner passate.",
      "È un’azione irreversibile sulla config: usala solo se sei sicuro, idealmente dopo un backup mentale di canali e ruoli che vuoi reimpostare.",
    ].join("\n\n"),
  },

    {
    category: "faq_help",
    title: "Il bot non risponde o l’interazione fallisce: cosa controllo?",
    icon: "fa-heartbeat",
    body: [
      "1) Verifica che Vinili sia **online** nel server e nella pagina **Status** del sito.\n2) Controlla i **permessi** del bot nel canale in cui stai agendo.\n3) Controlla in dashboard che il comando o la funzione sia **abilitata** e non limitata dal tuo ruolo/canale.\n4) Se stai usando menu Apps o slash, riprova dopo qualche secondo o riesegui la sincronizzazione permessi.",
      "Messaggi come «Interazione non riuscita» spesso indicano timeout lato Discord, bot riavviato, o risposta troppo lenta — non sempre un errore di configurazione permanente.",
    ].join("\n\n"),
  },
  {
    category: "faq_help",
    title: "Dove chiedo aiuto o segnalo un problema?",
    icon: "fa-life-ring",
    body: [
      "Per idee e bug sulla dashboard o sul bot usa la sezione **Feedback** del sito.",
      "Per lo stato dei servizi consulta **Status**. Per opinioni sul bot puoi lasciare una **Recensione**.",
      "Se il problema è solo sul tuo server (permessi, canali, ruoli), di solito lo risolve chi amministra quel server dalla dashboard — non serve un intervento globale.",
    ].join("\n\n"),
  },
]);

function sectionLabel(sectionId) {
  const id = String(sectionId || "").trim();
  const section = BOT_FAQ_SECTIONS.find((s) => s.id === id);
  return section ? String(section.label || id) : id;
}

function sectionTabIcon(sectionId) {
  const icons = {
    faq_start: "fa-rocket",
    faq_dashboard: "fa-th-large",
    faq_settings: "fa-cog",
    faq_commands: "fa-terminal",
    faq_partnership: "fa-handshake-o",
    faq_team: "fa-trophy",
    faq_premium: "fa-diamond",
    faq_data: "fa-database",
    faq_help: "fa-heartbeat",
  };
  return icons[String(sectionId || "").trim()] || "fa-question-circle";
}

function itemsForSection(sectionId) {
  const id = String(sectionId || "").trim();
  return BOT_FAQ_ITEMS.filter((item) => String(item.category || "") === id);
}

function sectionBody(sectionId) {
  const items = itemsForSection(sectionId);
  if (!items.length) return "";
  return items
    .map((item) => {
      const title = String(item.title || "").trim();
      const body = String(item.body || "").trim();
      if (!title) return body;
      return `**${title}**\n${body}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

const BOT_FAQ_SECTION_BODIES = Object.freeze(
  Object.fromEntries(BOT_FAQ_SECTIONS.map((section) => [section.id, sectionBody(section.id)])),
);

const BOT_FAQ_WEB_META = Object.freeze(
  Object.fromEntries(
    BOT_FAQ_SECTIONS.map((section) => [
      section.id,
      {
        title: section.label,
        icon: sectionTabIcon(section.id),
        tabIcon: sectionTabIcon(section.id),
      },
    ]),
  ),
);

function stripDiscordDecorations(text) {
  return String(text || "")
    .replace(/<a?:[\w~]+:\d+>/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getBotFaqWebPayload(opts = {}) {
  const sections = Array.isArray(opts.sections) && opts.sections.length ? opts.sections : BOT_FAQ_SECTIONS;
  const allowed = new Set(sections.map((s) => String(s.id || "").trim()).filter(Boolean));
  const categories = sections.map((section) => {
    const id = String(section.id || "").trim();
    return {
      id,
      label: String(section.label || id),
      description: String(section.description || ""),
      tabIcon: sectionTabIcon(id),
    };
  });
  const items = BOT_FAQ_ITEMS.filter((item) => allowed.has(String(item.category || "").trim()))
    .map((item) => {
      const category = String(item.category || "").trim();
      const body = stripDiscordDecorations(item.body);
      if (!body) return null;
      return {
        category,
        title: String(item.title || sectionLabel(category)),
        tag: sectionLabel(category),
        icon: String(item.icon || sectionTabIcon(category) || "fa-question-circle"),
        body,
      };
    })
    .filter(Boolean);
  return { categories, items };
}

module.exports = {
  BOT_FAQ_SECTIONS,
  BOT_FAQ_SECTION_IDS,
  BOT_FAQ_ITEMS,
  BOT_FAQ_SECTION_BODIES,
  BOT_FAQ_WEB_META,
  sectionBody,
  stripDiscordDecorations,
  getBotFaqWebPayload,
};
