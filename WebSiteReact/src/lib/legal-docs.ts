// Generato da scripts/_convert_legal.mjs — testi identici a WebSite/{privacy,cookie,terms,copyright}/index.html
// Non editare a mano i testi; rilancia lo script se le policy cambiano.

import type { LegalDoc } from "./legal";

export const LEGAL_PRIVACY: LegalDoc = {
  slug: "privacy",
  h1: "Privacy Policy",
  updatedIso: "2026-09-16",
  updatedLabel: "16 settembre 2026",
  updatedPrefix: "Ultimo aggiornamento:",
  subtitle: null,
  sections: [
    {
      id: "introduzione",
      title: "Introduzione",
      blocks: [
        { type: "p", text: "Questa Privacy Policy descrive come **Vinili & Caffè** raccoglie, utilizza e protegge i dati personali relativi a:" },
        { type: "ul", items: [
            "il sito web e la dashboard;",
            "i bot Discord (incluso Vinili e servizi collegati come Caffè);",
            "il **server Discord ufficiale** della community Vinili & Caffè;",
            "i servizi della community anche su server Discord di terzi dove il bot è stato invitato, nei limiti delle funzioni attivate."
          ] },
        { type: "p", text: "Il trattamento avviene nel rispetto del GDPR, della normativa italiana applicabile e delle policy dei servizi terzi utilizzati (in particolare Discord)." },
      ],
    },
    {
      id: "titolare-del-trattamento",
      title: "Titolare del trattamento",
      blocks: [
        { type: "p", text: "Il **titolare del trattamento** è **Lorenzo Antonio Corvaglia**, gestore del progetto **Vinili & Caffè**, contattabile all’email **supporto@viniliecaffe.it** e tramite il server Discord ufficiale della community." },
        { type: "p", text: "**Server Discord di terzi:** quando il bot opera su un server non ufficiale, l’amministratore di quel server resta responsabile delle scelte di configurazione e dei trattamenti tipici della community ospite; noi trattiamo i dati necessari al funzionamento delle funzioni del bot attivate su quel server." },
      ],
    },
    {
      id: "dati-raccolti",
      title: "Dati raccolti",
      blocks: [
        { type: "label", text: "Login Discord sul sito (OAuth)" },
        { type: "p", text: "OAuth è il sistema di “Accedi con Discord”: Discord ci conferma chi sei senza darci la password." },
        { type: "ul", items: [
            "ID Discord, username, nome visualizzato e avatar (permesso `identify`: chi sei).",
            "Elenco dei server Discord dove hai poteri di gestione, solo se usi la dashboard (permesso `guilds`).",
            "In alcuni flussi dashboard, anche il permesso `applications.commands.permissions.update` per gestire i permessi dei comandi del bot sul server.",
            "Token di accesso e dati di sessione necessari a tenerti loggato sul sito."
          ] },
        { type: "label", text: "Dati trattati sul sito web" },
        { type: "ul", items: [
            "Ticket di supporto live (oggetto, categoria, messaggi, immagini, reazioni, stato e chiusura).",
            "Suggerimenti, recensioni, feedback bot, candidature, appelli e altri moduli inviati volontariamente.",
            "Notifiche in-app e preferenze correlate; eventuali **notifiche push** del browser (iscrizione push, permesso Notification, endpoint tecnico) se le attivi.",
            "Contenuti del **Confessionale** (testi/allegati gestiti dallo staff autorizzato, anche se presentati in forma anonima agli utenti).",
            "Dati operativi delle aree riservate (dashboard/staff) per utenti autorizzati, inclusi strumenti di moderazione e anteprima operativa.",
            "Dati relativi a donazioni/crediti premium quando usi quelle funzioni (stato, riferimenti tecnici; i pagamenti sono gestiti dal provider di pagamento)."
          ] },
        { type: "label", text: "Dati trattati dai bot e dalla community Discord" },
        { type: "ul", items: [
            "Messaggi, comandi, reazioni e metadati per livelli/EXP, ticket Discord, moderazione, minigiochi, eventi, quote/repost/clip e classifiche.",
            "Dati partnership, preferenze vocali (TTS/clip/trascrizioni) e dati di voto da piattaforme esterne.",
            "Metadati di integrazioni live (es. **Twitch** / **Kick**) quando le alert o gli strumenti collegati sono attivi."
          ] },
        { type: "label", text: "Trascrizioni vocali e strumenti automatici" },
        { type: "ul", items: [
            "**Trascrizioni**: l’audio può essere inviato a un servizio speech-to-text (es. Whisper) solo per ottenere il testo. Non usiamo chatbot IA generativa.",
            "**Markov**: modello statistico semplice da messaggi pubblici (non è un LLM e non decide sanzioni)."
          ] },
        { type: "label", text: "Dati tecnici, cookie e misurazione" },
        { type: "ul", items: [
            "Token e cache OAuth, preferenza lingua, conferma banner cookie, chiavi push e altre chiavi tecniche in *localStorage*/*sessionStorage*.",
            "Log tecnici, indirizzi IP e diagnostica nei limiti necessari a sicurezza e affidabilità.",
            "**Google Analytics** (ID `G-KPF6425N60`) per misurare audience e stabilità, caricato su tutte le pagine del sito."
          ] },
      ],
    },
    {
      id: "utilizzo-dei-dati",
      title: "Utilizzo dei dati",
      blocks: [
        { type: "p", text: "Utilizziamo i tuoi dati personali per:" },
        { type: "ul", items: [
            "Autenticare e gestire l’accesso al sito, alla dashboard e alle aree staff autorizzate.",
            "Fornire funzioni di community e bot (profilo, livelli, musica, TTS/voice, partnership, ticket Discord e ticket live sul sito, moderazione, eventi, voto, alert live).",
            "Gestire suggerimenti, recensioni, feedback bot, candidature, confessionale, donazioni/crediti e richieste di supporto.",
            "Inviare notifiche in-app e, se le attivi, notifiche push del browser.",
            "Misurare l’uso del sito (Google Analytics su tutte le pagine) per capire traffico e stabilità.",
            "Configurare il bot su server Discord gestiti da amministratori autorizzati.",
            "Prevenire frodi, abusi, automazioni non autorizzate e comportamenti malevoli.",
            "Proteggere sito, bot, infrastruttura e community.",
            "Adempiere a obblighi legali e gestire richieste di supporto, moderazione o GDPR.",
            "Migliorare stabilità, sicurezza e qualità dei servizi."
          ] },
      ],
    },
    {
      id: "base-giuridica-gdpr",
      title: "Base giuridica (GDPR)",
      blocks: [
        { type: "p", text: "Il trattamento dei dati si basa su:" },
        { type: "ul", items: [
            "**Esecuzione del servizio** per login, gestione account e funzioni che richiedi (ticket, profilo, bot, ecc.).",
            "**Legittimo interesse** per protezione della community, prevenzione abusi, sicurezza, moderazione e misurazione tecnica del sito (analytics).",
            "**Obbligo legale** quando necessario per adempiere a richieste o obblighi normativi.",
            "**Consenso** dove richiesto, ad esempio per notifiche push del browser o altre funzioni opzionali che lo prevedono."
          ] },
      ],
    },
    {
      id: "condivisione-dei-dati",
      title: "Condivisione dei dati",
      blocks: [
        { type: "p", text: "I tuoi dati non vengono venduti. Possono essere condivisi solo con soggetti strettamente necessari al servizio, come:" },
        { type: "ul", items: [
            "Discord Inc., per OAuth, hosting del server e API della piattaforma.",
            "Fornitori di hosting, database e infrastruttura che mantengono online sito e bot.",
            "Google (Google Analytics) per la misurazione del traffico sulle pagine dove lo script è attivo.",
            "Piattaforme di voto/listing (es. top.gg, Discadia) quando usi o ricevi funzioni di voto.",
            "Provider di pagamento (es. PayPal) quando effettui una donazione o un pagamento collegato.",
            "Twitch / Kick e relativi servizi, solo per le funzioni live/alert attivate.",
            "Provider tecnici di trascrizione vocale (speech-to-text), solo se usi clip/trascrizione.",
            "Staff autorizzato, per ticket, confessionale, suggerimenti, moderazione e strumenti operativi.",
            "Amministratori del server Discord in cui sei membro, per dati necessari al funzionamento di quel server.",
            "Autorità competenti, se richiesto dalla legge o per tutelare la sicurezza del servizio."
          ] },
        { type: "p", text: "Non condividiamo dati con inserzionisti per pubblicità personalizzata. Non addestriamo modelli di IA generativa di terzi con i tuoi contenuti." },
      ],
    },
    {
      id: "cookie",
      title: "Cookie",
      blocks: [
        { type: "p", text: "Usiamo cookie e tecnologie simili (incluso *localStorage*, *sessionStorage* e, se attivo, service worker per le push) principalmente per:" },
        { type: "ul", items: [
            "Mantenere la sessione di login Discord (fino a 90 giorni o fino al logout).",
            "Ricordare lingua, preferenze UI, stato push e conferma del banner cookie.",
            "Proteggere il sito con controlli anti-abuso e token tecnici.",
            "Misurare l’audience sulle pagine dove Google Analytics è attivo.",
            "Far funzionare correttamente pagine e aree riservate."
          ] },
        { type: "p", text: "Per l’elenco dettagliato consulta la Cookie Policy." },
      ],
    },
    {
      id: "sicurezza-dei-dati",
      title: "Sicurezza dei dati",
      blocks: [
        { type: "p", text: "Adottiamo misure tecniche e organizzative ragionevoli per proteggere i dati trattati, tra cui:" },
        { type: "ul", items: [
            "Connessioni HTTPS/TLS e protezione delle sessioni.",
            "Controlli OAuth (state anti-CSRF) e verifiche contro accessi non autorizzati.",
            "Limitazioni di accesso ai dati per il personale autorizzato.",
            "Strumenti di logging, monitoraggio e mitigazione abusi ove necessari.",
            "Backup e protezioni infrastrutturali nei limiti dei sistemi utilizzati."
          ] },
      ],
    },
    {
      id: "i-tuoi-diritti-gdpr",
      title: "I tuoi diritti (GDPR)",
      blocks: [
        { type: "p", text: "Nei limiti previsti dal GDPR puoi esercitare i diritti di **accesso**, **rettifica**, **cancellazione**, **limitazione** o **opposizione** al trattamento, **portabilità** e, dove il trattamento si basa sul consenso, **revoca del consenso** in qualsiasi momento." },
        { type: "p", text: "Per i dati gestiti da sito e bot puoi esportarli o richiederne la cancellazione dalla pagina [[I tuoi dati|/dati/]] (accesso con Discord). Puoi anche scriverci sul server Discord ufficiale o all’email **supporto@viniliecaffe.it**." },
        { type: "p", text: "Se ritieni che il trattamento non sia conforme, hai il diritto di proporre reclamo al **Garante per la Protezione dei Dati Personali**." },
        { type: "cta", href: "/dati/", label: "I tuoi dati" },
      ],
    },
    {
      id: "conservazione-dei-dati",
      title: "Conservazione dei dati",
      blocks: [
        { type: "p", text: "Conserviamo i dati per il tempo necessario alle finalità per cui sono trattati. I periodi sotto sono **obiettivi tipici** (salvo obbligo legale o dispute in corso): non tutti i dataset hanno un timer di cancellazione automatica; la rimozione avviene anche tramite strumenti “I tuoi dati”, richieste e operazioni di manutenzione dove tecnicamente fattibile." },
        { type: "ul", items: [
            "**Sessione sito**: fino a 90 giorni, oppure fino a logout / scadenza token.",
            "**Profilo community / punti / progressi**: finché resti membro o usi i servizi; dopo uscita o richiesta di cancellazione, di norma fino a 12 mesi per chiusura tecnica e prevenzione abusi, salvo anonimizzazione prima.",
            "**Ticket web e allegati**: di norma fino a 24 mesi dalla chiusura, poi cancellazione o anonimizzazione.",
            "**Suggerimenti, recensioni, feedback, candidature**: di norma fino a 36 mesi, o prima su richiesta/moderazione.",
            "**Confessionale**: di norma fino a 24 mesi, accessibile allo staff autorizzato; cancellabile prima su richiesta o moderazione.",
            "**Log moderazione (warn/timeout/ban) e partnership**: di norma fino a 36 mesi per sicurezza e dispute.",
            "**Iscrizioni push**: fino a revoca del permesso, logout tecnico o cancellazione dell’iscrizione.",
            "**Trascrizioni vocali**: elaborazione dell’audio in modo transitorio; testo conservato solo se la funzione lo richiede, di norma fino a 90 giorni salvo esigenze di moderazione.",
            "**Corpus Markov**: rotazione/aggiornamento statistico; rimozione o riduzione su richiesta nei limiti tecnici.",
            "**Log tecnici / IP**: di norma 30–90 giorni.",
            "**Google Analytics**: secondo le impostazioni di conservazione di Google Analytics.",
            "**Backup**: cicli tipici fino a circa 90 giorni, con sovrapposizione ai tempi sopra."
          ] },
      ],
    },
    {
      id: "minori",
      title: "Minori",
      blocks: [
        { type: "p", text: "Il servizio è destinato a utenti che rispettano l’età minima richiesta da Discord. In Italia, per i trattamenti digitali basati sul consenso, si applica inoltre la soglia tipica di **14 anni** (salvo diversa previsione normativa)." },
        { type: "p", text: "Non raccogliamo consapevolmente dati di minori al di sotto di tali soglie. Se veniamo informati di una raccolta non conforme, possiamo rimuovere i dati e limitare l’accesso nei limiti tecnici e organizzativi ragionevoli." },
      ],
    },
    {
      id: "trasferimenti-internazionali",
      title: "Trasferimenti internazionali",
      blocks: [
        { type: "p", text: "Alcuni servizi utilizzati dal progetto, come Discord o altri provider tecnici, possono trattare dati anche fuori dallo Spazio Economico Europeo." },
        { type: "p", text: "Quando ciò avviene, il trattamento avviene secondo le garanzie offerte dai provider e nei limiti previsti dal GDPR, incluse eventuali clausole contrattuali standard o misure tecniche equivalenti." },
      ],
    },
    {
      id: "modifiche-alla-policy",
      title: "Modifiche alla policy",
      blocks: [
        { type: "p", text: "Possiamo aggiornare questa Privacy Policy per modifiche normative, tecniche o organizzative. La data di ultimo aggiornamento in alto indica la versione corrente." },
        { type: "p", text: "Continuando a usare il sito o i servizi della community dopo la pubblicazione delle modifiche, dichiari di aver preso visione della versione aggiornata." },
      ],
    },
    {
      id: "contatti-e-reclami",
      title: "Contatti e reclami",
      blocks: [
        { type: "p", text: "Per domande privacy, richieste GDPR o segnalazioni puoi contattarci tramite Discord o email (supporto@viniliecaffe.it)." },
        { type: "p", text: "Hai inoltre diritto di proporre reclamo al Garante per la Protezione dei Dati Personali (www.garanteprivacy.it)." },
      ],
    },
  ],
};

export const LEGAL_COOKIE: LegalDoc = {
  slug: "cookie",
  h1: "Cookie Policy",
  updatedIso: "2026-09-16",
  updatedLabel: "16 settembre 2026",
  updatedPrefix: "Ultimo aggiornamento:",
  subtitle: null,
  sections: [
    {
      id: "cosa-sono-i-cookie",
      title: "Cosa sono i cookie?",
      blocks: [
        { type: "p", text: "I cookie sono piccoli file di testo memorizzati sul dispositivo quando visiti un sito. Usano tecnologie simili anche lo storage del browser (*localStorage*/*sessionStorage*) per login, preferenze e sicurezza." },
        { type: "p", text: "**Ambito:** questa Cookie Policy riguarda il **sito web** Vinili & Caffè (e le pagine collegate). Il server Discord ufficiale e i Bot restano regolati dai Termini di Servizio, dalla Privacy Policy e dalle regole della community; Discord applica inoltre le proprie policy tecniche sulla piattaforma." },
      ],
    },
    {
      id: "cookie-che-utilizziamo",
      title: "Cookie che utilizziamo",
      blocks: [
        { type: "h3", text: "Necessari al funzionamento" },
        { type: "p", text: "Utilizziamo cookie tecnici e storage locale strettamente necessari. Senza di essi login e aree riservate possono non funzionare." },
        { type: "p", text: "**Sessione OAuth Discord** — token e scadenza nel localStorage (fino a 90 giorni / logout / scadenza token). OAuth = “Accedi con Discord”.\n\n**Scope e cache profilo** — ricordano i permessi di login e dati minimi del profilo per ridurre chiamate a Discord.\n\n**Preferenza lingua** — salva la lingua del sito.\n\n**Preferenza banner cookie** — ricorda la conferma del banner (fino a 180 giorni).\n\n**Notifiche push (opzionale)** — se le attivi: chiavi locali di permesso/stato e service worker del browser.\n\n**Stato UI tecnico** — chiavi locali per notifiche in-app, accessi eventi o anteprime, senza pubblicità personalizzata." },
        { type: "h3", text: "Misurazione (analytics)" },
        { type: "p", text: "Usiamo **Google Analytics** (ID `G-KPF6425N60`) per capire traffico e stabilità del sito. Lo script è presente su tutte le pagine. Non usiamo cookie di profilazione pubblicitaria, remarketing o social tracking a fini ads (salvo cookie di Discord durante OAuth)." },
        { type: "fact", title: "Sessione OAuth Discord", badge: "Essenziale", items: [
            { k: "Scopo", v: "mantiene il login attivo e gestisce autenticazione OAuth." },
            { k: "Durata", v: "fino a 90 giorni come sessione locale del sito, oppure fino al logout o alla scadenza/invalida del token Discord." },
            { k: "Tipo", v: "dati tecnici locali del browser (non cookie di marketing)." }
          ] },
        { type: "fact", title: "Cookie di sicurezza", badge: "Essenziale", items: [
            { k: "Scopo", v: "proteggono da attacchi come CSRF (falsificazione di richieste) e accessi automatizzati." },
            { k: "Durata", v: "sessione o temporanea." },
            { k: "Tipo", v: "token temporanei tecnici." }
          ] },
        { type: "fact", title: "Preferenza banner cookie", badge: "Tecnico", items: [
            { k: "Scopo", v: "ricorda che hai chiuso o accettato l'avviso sui cookie." },
            { k: "Durata", v: "fino a 180 giorni." },
            { k: "Tipo", v: "SameSite=Lax, Secure quando disponibile." }
          ] },
        { type: "fact", title: "Google Analytics", badge: "Misurazione", items: [
            { k: "Scopo", v: "statistiche di traffico e uso delle pagine." },
            { k: "Durata", v: "secondo le impostazioni di Google Analytics." },
            { k: "Tipo", v: "cookie/script di Google (terza parte)." }
          ] },
        { type: "h3", text: "Cosa non usiamo" },
        { type: "p", text: "Vinili & Caffè **non utilizza**:" },
        { type: "ul", items: [
            "Cookie di profilazione pubblicitaria o remarketing.",
            "Reti ads di social media per target pubblicitario (salvo cookie Discord durante OAuth).",
            "Vendita di dati a inserzionisti."
          ] },
      ],
    },
    {
      id: "sicurezza-dei-cookie",
      title: "Sicurezza dei cookie",
      blocks: [
        { type: "p", text: "I nostri cookie utilizzano protezioni avanzate:" },
        { type: "ul", items: [
            "**HTTPS/TLS** — comunicazioni cifrate con i servizi API.",
            "**State OAuth anti-CSRF** — verifica dello stato nelle callback di login.",
            "**Scadenza sessione** — la sessione locale termina dopo massimo 90 giorni, logout o invalida/scadenza del token Discord.",
            "**Dati minimizzati** — solo dati tecnici strettamente necessari al funzionamento."
          ] },
      ],
    },
    {
      id: "finalita-dei-cookie",
      title: "Finalità dei cookie",
      blocks: [
        { type: "p", text: "Utilizziamo cookie e storage locale per:" },
        { type: "ul", items: [
            "Mantenerti autenticato sul sito e sulla dashboard.",
            "Proteggere account e API da accessi non autorizzati.",
            "Prevenire abusi automatizzati.",
            "Ricordare lingua, scelte tecniche di interfaccia e stato delle notifiche push (se attive).",
            "Misurare traffico e uso delle pagine (Google Analytics, ove attivo).",
            "Supportare votazioni e aree riservate."
          ] },
      ],
    },
    {
      id: "base-giuridica",
      title: "Base giuridica",
      blocks: [
        { type: "p", text: "I cookie/storage **strettamente necessari** al login, alla sicurezza e al funzionamento del sito non richiedono consenso esplicito (GDPR / ePrivacy)." },
        { type: "p", text: "La misurazione con **Google Analytics** si basa sul legittimo interesse a capire l’uso del sito e migliorarne stabilità e contenuti. Puoi limitarla dalle impostazioni del browser, estensioni anti-tracciamento o strumenti Google ove disponibili. **Non usiamo cookie di profilazione pubblicitaria**." },
        { type: "p", text: "Le **notifiche push** richiedono il permesso del browser (consenso)." },
      ],
    },
    {
      id: "come-gestire-i-cookie",
      title: "Come gestire i cookie",
      blocks: [
        { type: "p", text: "Puoi gestire cookie e storage nelle impostazioni del browser (Chrome, Firefox, Safari, Edge) o cancellando i dati del sito. Disabilitare gli elementi essenziali impedirà il login. Per rimuovere la sessione, effettua il logout dal sito." },
        { type: "p", text: "Per le push: revoca il permesso notifiche del sito dalle impostazioni del browser. Per Analytics puoi usare blocchi cookie/tracker del browser." },
        { type: "label", text: "Logout" },
        { type: "p", text: "Il logout rimuove o invalida i dati di sessione locali collegati al login." },
      ],
    },
    {
      id: "cookie-di-terze-parti",
      title: "Cookie di terze parti",
      blocks: [
        { type: "p", text: "Durante l'autenticazione OAuth con Discord potresti ricevere cookie da discord.com, gestiti da Discord Inc. secondo la loro Privacy Policy." },
        { type: "p", text: "Google Analytics carica script/cookie di Google (googletagmanager.com / google-analytics). Valgono anche le policy di Google." },
        { type: "p", text: "Vinili & Caffè non ha controllo pieno su cookie e trattamenti di queste terze parti." },
      ],
    },
    {
      id: "durata-dei-cookie",
      title: "Durata dei cookie",
      blocks: [
        { type: "table", headers: ["Tipo", "Durata"], rows: [
            ["Sessione autenticazione sito (localStorage)", "Fino a 90 giorni, logout o scadenza token Discord"],
            ["Preferenza lingua / UI tecnica / stato push", "Fino a cancellazione manuale, revoca permesso o logout dove previsto"],
            ["Preferenza banner cookie", "180 giorni"],
            ["Google Analytics", "Secondo impostazioni Google"],
            ["OAuth Discord (cookie di discord.com)", "Gestita da Discord"],
            ["Redirect / state OAuth", "Fino a completamento login"]
          ] },
      ],
    },
    {
      id: "contatti",
      title: "Contatti",
      blocks: [
        { type: "p", text: "Per domande su questa Cookie Policy: Discord o email (supporto@viniliecaffe.it)." },
      ],
    },
  ],
};

export const LEGAL_TERMS: LegalDoc = {
  slug: "terms",
  h1: "Termini di Servizio",
  updatedIso: "2026-09-16",
  updatedLabel: "16 settembre 2026",
  updatedPrefix: "Ultimo aggiornamento:",
  subtitle: null,
  sections: [
    {
      id: "accettazione-dei-termini",
      title: "Accettazione dei termini",
      blocks: [
        { type: "p", text: "Utilizzando il sito web **Vinili & Caffè** (\"Sito\"), i bot Discord collegati (\"Bot\") e i server Discord associati o ospiti dove i Bot sono presenti (\"Server\"), accetti i presenti Termini di Servizio. Se non li accetti, non usare Sito, Bot, Server, dashboard o funzioni collegate." },
        { type: "p", text: "Su server Discord di terzi dove è installato il Bot, restano valide anche le regole di quel server: l’amministratore ospite è responsabile delle proprie scelte di configurazione." },
        { type: "p", text: "L’uso continuato dopo la pubblicazione di aggiornamenti costituisce accettazione delle modifiche." },
      ],
    },
    {
      id: "descrizione-del-servizio",
      title: "Descrizione del servizio",
      blocks: [
        { type: "p", text: "Vinili & Caffè offre una community Discord e servizi collegati, tra cui:" },
        { type: "ul", items: [
            "Server Discord per socializzazione, eventi, supporto e attività di community.",
            "Bot pubblici/multi-server (musica, TTS/voice, livelli, ticket, moderazione, partnership, utility) configurabili anche da dashboard web.",
            "Pagine web per voto, profilo, ruoli, wiki, candidature, unban, notifiche, suggerimenti, recensioni, feedback bot, confessionale, donazioni/crediti e ticket di supporto live.",
            "Integrazioni live (es. Twitch/Kick) e alert correlati, dove attivi.",
            "Aree riservate per staff e amministratori (strumenti operativi e configurazione).",
            "Integrazioni con Discord, piattaforme di voto, provider di pagamento e altri servizi tecnici necessari."
          ] },
        { type: "p", text: "Possiamo modificare, sospendere o rimuovere in qualsiasi momento parti del servizio, del sito, dei bot o dei Server." },
      ],
    },
    {
      id: "requisiti-di-accesso",
      title: "Requisiti di accesso",
      blocks: [
        { type: "p", text: "Per usare i nostri servizi devi:" },
        { type: "ul", items: [
            "Avere almeno l’età minima richiesta da Discord e, per l’uso del sito in Italia, di norma almeno **14 anni** (o l’età prevista dalla legge applicabile). Se sei minore, l’uso deve avvenire con il coinvolgimento di chi esercita la responsabilità genitoriale ove richiesto.",
            "Usare un account Discord valido e non compromesso.",
            "Fornire dati corretti quando invii candidature, richieste, recensioni o altri moduli.",
            "Mantenere sicuro il tuo account e non condividerlo per aggirare controlli o limitazioni.",
            "Rispettare questi termini, la Privacy Policy, la Cookie Policy e le regole del server."
          ] },
      ],
    },
    {
      id: "regole-di-comportamento",
      title: "Regole di comportamento",
      blocks: [
        { type: "label", text: "È vietato" },
        { type: "ul", items: [
            "Violare leggi applicabili o le policy Discord.",
            "Pubblicare contenuti offensivi, discriminatori, illegali o dannosi.",
            "Molestare, minacciare, intimidire o impersonare altri utenti o staff.",
            "Usare bot, script, multiaccount o VPN abusive per falsare voti, partnership, livelli, statistiche o accessi.",
            "Abusare della dashboard, delle API, dei webhook di voto, dei ticket live sul sito o dei sistemi di migrazione/configurazione.",
            "Registrare o diffondere audio altrui senza base legittima, o usare TTS/voice per molestie.",
            "Tentare di compromettere sito, bot, pannelli o sicurezza dei server.",
            "Spammare, fare phishing, pubblicità non autorizzata o diffondere dati personali di terzi.",
            "Sfruttare bug invece di segnalarli allo staff, o aggirare ban/timeout/limitazioni."
          ] },
      ],
    },
    {
      id: "sistema-di-voto",
      title: "Sistema di voto",
      blocks: [
        { type: "ul", items: [
            "I voti devono essere reali e conformi alle regole delle piattaforme esterne (es. top.gg, Discadia).",
            "Non è consentito usare bot, multiaccount, VPN abusive o metodi automatici per ottenere ricompense.",
            "I punti/progressi/ricompense possono essere corretti o annullati in caso di abuso.",
            "I webhook di voto possono elaborare il tuo ID Discord per assegnare ricompense; i servizi terzi possono cambiare senza preavviso."
          ] },
      ],
    },
    {
      id: "candidature-staff",
      title: "Candidature staff",
      blocks: [
        { type: "ul", items: [
            "Le candidature sono valutate dallo staff a propria discrezione.",
            "L'invio di una candidatura non garantisce risposta, accettazione o ingresso nello staff.",
            "Informazioni false, spam o abusi nei moduli possono comportare rifiuto o sanzioni.",
            "I ruoli staff possono essere rimossi in qualsiasi momento per organizzazione interna o violazioni.",
            "I ruoli staff non attribuiscono diritti legali, economici o proprietà sul server o sul sito."
          ] },
      ],
    },
    {
      id: "proprieta-intellettuale",
      title: "Proprietà intellettuale",
      blocks: [
        { type: "p", text: "Restano di proprietà di Vinili & Caffè o dei rispettivi titolari, salvo diversa indicazione, i contenuti e gli asset relativi a:" },
        { type: "ul", items: [
            "**Sito**: design, grafica, testi, codice, loghi, wiki, dashboard e materiali correlati.",
            "**Bot**: codice, configurazioni, branding, messaggi di sistema e documentazione operativa.",
            "**Server Discord ufficiale**: nome e brand della community, icone, banner, emoji/sticker personalizzati, layout e materiali grafici o testuali creati dallo staff per il server."
          ] },
        { type: "p", text: "Non puoi copiare, rivendere, distribuire, ripubblicare o riutilizzare tali contenuti senza autorizzazione scritta. I contenuti degli utenti restano regolati dalla sezione “Contenuti utente”; Discord e i provider terzi restano titolari delle rispettive piattaforme." },
      ],
    },
    {
      id: "contenuti-utente",
      title: "Contenuti utente",
      blocks: [
        { type: "p", text: "Pubblicando messaggi, media, recensioni, suggerimenti, feedback, ticket, candidature, confessioni o altri contenuti sul Server o sul Sito:" },
        { type: "ul", items: [
            "Mantieni la titolarità dei tuoi contenuti, salvo limiti di legge o policy Discord.",
            "Ci concedi una licenza limitata al funzionamento del servizio, moderazione, pubblicazione tecnica e, dove attivo, generazione automatica di contenuti (sistema Markov statistico) a partire da messaggi pubblici della community.",
            "Accetti che ticket, confessionale e contenuti di supporto sul sito siano visibili allo staff autorizzato per gestire la richiesta.",
            "Garantisci di avere il diritto di condividere ciò che pubblichi.",
            "Resti responsabile del contenuto che invii."
          ] },
      ],
    },
    {
      id: "donazioni-e-crediti",
      title: "Donazioni e crediti",
      blocks: [
        { type: "ul", items: [
            "Le donazioni sono volontarie e, di norma, non costituiscono acquisto di beni o servizi obbligatori.",
            "I pagamenti sono elaborati da provider terzi (es. PayPal): valgono anche i loro termini e la loro privacy policy.",
            "Eventuali crediti premium o vantaggi virtuali non hanno valore di denaro contante, non sono rimborsabili salvo obbligo di legge, e possono essere modificati o revocati in caso di abuso, errore o modifica del servizio.",
            "Non garantiamo disponibilità continua di campagne, ricompense o vantaggi legati a donazioni."
          ] },
      ],
    },
    {
      id: "moderazione-e-sanzioni",
      title: "Moderazione e sanzioni",
      blocks: [
        { type: "p", text: "Lo staff può moderare o rimuovere contenuti, applicare warn/timeout/kick/ban, bloccare accessi ottenuti abusivamente e decidere sulle dispute interne. Le sanzioni possono essere temporanee o permanenti in base a gravità, contesto e recidiva." },
      ],
    },
    {
      id: "limitazione-di-responsabilita",
      title: "Limitazione di responsabilità",
      blocks: [
        { type: "label", text: "Vinili & Caffè non è responsabile per" },
        { type: "ul", items: [
            "Perdita di dati, statistiche, progressi, livelli, preferenze o contenuti.",
            "Interruzioni del servizio, manutenzioni, downtime o modifiche ai sistemi.",
            "Azioni di altri utenti, contenuti di terze parti o servizi esterni collegati.",
            "Errori o imprecisioni di trascrizioni automatiche, messaggi Markov o altri strumenti automatici.",
            "Danni indiretti, consequenziali o derivanti da uso improprio del servizio.",
            "Limitazioni, modifiche o indisponibilità imposte da Discord o da provider terzi."
          ] },
        { type: "label", text: "Il servizio è fornito \"così com'è\", senza garanzie di disponibilità continua o risultati specifici." },
      ],
    },
    {
      id: "termini-di-servizio-discord",
      title: "Termini di servizio Discord",
      blocks: [
        { type: "p", text: "Il nostro server è ospitato su Discord. Usandolo accetti anche i Termini di servizio di Discord e la loro Privacy Policy. Se una funzione dipende da Discord, prevalgono le loro regole e limitazioni tecniche. La durata della sessione di accesso al sito dipende dal token OAuth rilasciato da Discord." },
      ],
    },
    {
      id: "legge-applicabile",
      title: "Legge applicabile",
      blocks: [
        { type: "p", text: "I presenti Termini sono regolati dalla **legge italiana**, salvo norme inderogabili a tua tutela come consumatore." },
        { type: "p", text: "Per le controversie è competente il **Foro di Lecce**, salvo dove la legge impone un foro inderogabile (ad es. per i consumatori UE, che possono spesso agire anche nel foro del proprio luogo di residenza)." },
      ],
    },
    {
      id: "contatti",
      title: "Contatti",
      blocks: [
        { type: "p", text: "Per domande sui Termini di Servizio puoi contattarci tramite Discord o email (supporto@viniliecaffe.it)." },
      ],
    },
  ],
};

export const LEGAL_COPYRIGHT: LegalDoc = {
  slug: "copyright",
  h1: "Copyright e Licenza",
  updatedIso: null,
  updatedLabel: null,
  updatedPrefix: "Ultimo aggiornamento:",
  subtitle: "Avvisi ufficiali di proprietà intellettuale di Vinili & Caffè",
  sections: [
    {
      id: "copyright",
      title: "Copyright",
      blocks: [
        { type: "p", text: "Copyright (c) 2024–2026 **Vinili & Caffè**. Tutti i diritti riservati." },
        { type: "p", text: "Sono protetti, tra gli altri:" },
        { type: "ul", items: [
            "**Sito** web, dashboard e materiali grafici/testuali correlati;",
            "**Bot** Discord (Vinili, Caffè e servizi collegati), codice e branding;",
            "**Server Discord ufficiale** (nome/brand, icone, banner, emoji/sticker personalizzati, layout e materiali creati dallo staff)."
          ] },
        { type: "p", text: "È vietato usare, copiare, modificare, ripubblicare o distribuire tali contenuti senza autorizzazione scritta dei titolari." },
        { type: "p", text: "I contenuti pubblicati dagli utenti restano dei rispettivi autori, nei limiti di legge, delle policy Discord e dei Termini di Servizio." },
      ],
    },
    {
      id: "license",
      title: "Licenza proprietaria",
      blocks: [
        { type: "label", text: "In sintesi" },
        { type: "ul", items: [
            "Non viene concessa alcuna licenza a terzi su codice, sito, bot o asset ufficiali senza autorizzazione scritta.",
            "È vietato copiare, modificare, distribuire, rieseguire in ambienti non autorizzati o fare reverse engineering (salvo limiti inderogabili di legge).",
            "L’uso della community da parte degli utenti è regolato dai Termini di Servizio e non trasferisce proprietà su brand, codice o asset.",
            "Librerie di terzi e la piattaforma Discord restano soggette alle rispettive licenze/policy.",
            "Software e servizi sono forniti “così come sono”, senza garanzie."
          ] },
        { type: "p", text: "Testo completo della licenza:" },
        { type: "pre", text: "LICENZA PROPRIETARIA — VINILI & CAFFÈ\n=====================================\n\nCopyright (c) 2024–2026 Vinili & Caffè. Tutti i diritti riservati.\n\nIl presente avviso copre l'ecosistema Vinili & Caffè, incluso:\n\n  • repository, codice sorgente, script, configurazioni, asset e documentazione;\n  • sito web, dashboard e materiali correlati;\n  • bot Discord e relativi asset/branding;\n  • server Discord ufficiale della community (brand, icone, banner,\n    emoji/sticker personalizzati e materiali creati dallo staff).\n\nCONCESSIONE\n-----------\n\nNon viene concessa alcuna licenza, esplicita o implicita, a terzi per l'uso di\nquesto software, dei contenuti del sito/bot o degli asset del server ufficiale,\nsalvo autorizzazione scritta dei titolari.\n\nÈ espressamente vietato, senza previa autorizzazione scritta dei titolari:\n\n  • copiare, riprodurre o duplicare codice, file, brand o asset protetti;\n  • modificare, adattare, tradurre o creare opere derivate;\n  • distribuire, pubblicare, sublicenziare o mettere a disposizione di terzi;\n  • eseguire, installare o far girare il software in ambienti non autorizzati;\n  • decompilare, disassemblare o effettuare reverse engineering, salvo dove la legge applicabile lo imponga in modo inderogabile;\n  • rimuovere o alterare avvisi di copyright o di licenza;\n  • ripubblicare o rivendere emoji, sticker, banner, loghi o materiali del server ufficiale come propri.\n\nUSO AUTORIZZATO\n---------------\n\nL'uso del codice e degli asset protetti è consentito esclusivamente al\npersonale autorizzato di Vinili & Caffè, per finalità interne e operative\nconcordate dai titolari. L'uso della community (sito/bot/server) da parte\ndegli utenti è regolato dai Termini di Servizio e non trasferisce proprietà\nsu brand, codice o asset ufficiali.\n\nTERZE PARTI\n-----------\n\nComponenti di terze parti (librerie npm, script vendor, tool in deploy/tools)\ne la piattaforma Discord restano soggetti alle rispettive licenze/policy.\nIl presente documento non estende diritti su tali componenti.\n\nCONTENUTI UTENTE\n----------------\n\nI messaggi, media e altri contenuti pubblicati dagli utenti restano dei\nrispettivi autori, nei limiti di legge, delle policy Discord e dei Termini\ndi Servizio di Vinili & Caffè.\n\nGARANZIE E RESPONSABILITÀ\n-------------------------\n\nIl software e i servizi sono forniti \"così come sono\", senza garanzie di alcun\ntipo. In nessun caso i titolari saranno responsabili per danni derivanti\ndall'uso non autorizzato o da qualsiasi utilizzo del materiale coperto da\nquesta licenza.\n\nCONTATTI\n--------\n\nPer richieste di autorizzazione: contattare i titolari di Vinili & Caffè\nattraverso i canali ufficiali della community (email supporto@viniliecaffe.it o Discord)." },
      ],
    },
  ],
};

export const LEGAL_DOCS = {
  privacy: LEGAL_PRIVACY,
  cookie: LEGAL_COOKIE,
  terms: LEGAL_TERMS,
  copyright: LEGAL_COPYRIGHT,
} as const;
