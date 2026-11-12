// Testi legali IT (privacy / cookie / terms / copyright). Modificare qui se le policy cambiano.

import type { LegalDoc } from "./legal";

const UPDATED_ISO = "2026-11-11";
const UPDATED_LABEL = "11 novembre 2026";

export const LEGAL_PRIVACY: LegalDoc = {
  slug: "privacy",
  h1: "Informativa sulla privacy",
  updatedIso: UPDATED_ISO,
  updatedLabel: UPDATED_LABEL,
  updatedPrefix: "Ultimo aggiornamento:",
  subtitle: "Informativa sul trattamento dei dati personali ai sensi del Regolamento (UE) 2016/679 (GDPR) e della normativa italiana applicabile",
  sections: [
    {
      id: "introduzione",
      title: "Premessa",
      blocks: [
        { type: "p", text: "La presente Informativa descrive le modalità con cui **Vinili & Caffè** tratta i dati personali nell’ambito di:" },
        { type: "ul", items: [
            "il sito web e la relativa dashboard;",
            "i bot Discord (tra cui Vinili e i servizi collegati, ivi incluso Caffè);",
            "il **server Discord ufficiale** della community Vinili & Caffè;",
            "i servizi di community resi anche su server Discord di terzi nei quali il bot è stato autorizzato, nei limiti delle funzioni ivi attivate."
          ] },
        { type: "p", text: "Il trattamento è effettuato nel rispetto del GDPR, del Codice Privacy italiano (d.lgs. 196/2003 e successive modifiche) e delle policy dei fornitori terzi utilizzati, in particolare Discord." },
      ],
    },
    {
      id: "titolare-del-trattamento",
      title: "Titolare del trattamento",
      blocks: [
        { type: "p", text: "Il **titolare del trattamento** è **Lorenzo Antonio Corvaglia**, in qualità di gestore del progetto **Vinili & Caffè**. Per esercitare i diritti o formulare richieste in materia di protezione dei dati è possibile contattare il titolare tramite i canali ufficiali della community (server Discord ufficiale e/o ticket sul sito)." },
        { type: "p", text: "**Server Discord di terzi.** Qualora il bot operi su un server non ufficiale, l’amministratore di tale server rimane responsabile delle scelte di configurazione e dei trattamenti tipici della community ospite. Vinili & Caffè tratta i soli dati necessari al funzionamento delle funzioni del bot effettivamente attivate su quel server." },
      ],
    },
    {
      id: "dati-raccolti",
      title: "Categorie di dati trattati",
      blocks: [
        { type: "label", text: "Autenticazione tramite Discord (OAuth 2.0)" },
        { type: "p", text: "L’accesso al sito avviene mediante autenticazione OAuth di Discord. Discord conferma l’identità dell’utente senza trasmettere a Vinili & Caffè la password dell’account Discord." },
        { type: "ul", items: [
            "Identificativo Discord, username, nome visualizzato e avatar (ambito `identify`).",
            "Elenco dei server Discord in cui l’utente dispone di poteri di gestione, esclusivamente in caso di utilizzo della dashboard (ambito `guilds`).",
            "Nei flussi dashboard che lo richiedono, ambito `applications.commands.permissions.update` per la gestione dei permessi dei comandi del bot sul server.",
            "Token di accesso e dati di sessione necessari a mantenere l’autenticazione sul sito."
          ] },
        { type: "label", text: "Dati trattati sul sito web" },
        { type: "ul", items: [
            "Ticket di supporto (oggetto, categoria, messaggi, allegati, reazioni, stato e chiusura).",
            "Contenuti trasmessi volontariamente tramite moduli (suggerimenti, recensioni, feedback, candidature, appelli e analoghi).",
            "Notifiche in-app e relative preferenze; eventuali **notifiche push** del browser (iscrizione, permesso Notification, endpoint tecnico) se attivate dall’utente.",
            "Contenuti del **Confessionale** (testi e allegati accessibili allo staff autorizzato, anche ove presentati in forma anonima agli altri utenti).",
            "Dati operativi delle aree riservate (dashboard e strumenti staff) per utenti autorizzati.",
            "Dati relativi a donazioni e crediti premium, ove tali funzioni siano utilizzate (stato e riferimenti tecnici; i pagamenti sono gestiti dal provider di pagamento)."
          ] },
        { type: "label", text: "Dati trattati dai bot e dalla community Discord" },
        { type: "ul", items: [
            "Messaggi, comandi, reazioni e metadati necessari a livelli/EXP, ticket Discord, moderazione, minigiochi, eventi, quote/repost/clip e classifiche.",
            "Dati di partnership, preferenze vocali (TTS, clip, trascrizioni) e dati di voto provenienti da piattaforme esterne.",
            "Metadati di integrazioni live (ad es. **Twitch**) qualora le relative funzioni siano attive."
          ] },
        { type: "label", text: "Trascrizioni vocali e strumenti automatici" },
        { type: "ul", items: [
            "**Trascrizioni.** L’audio può essere trasmesso a un servizio di speech-to-text (ad es. Whisper) al solo fine di ottenere il testo. Non sono utilizzati chatbot di intelligenza artificiale generativa per tale finalità.",
            "**Markov.** Modello statistico generato a partire da messaggi pubblici; non costituisce un modello linguistico generativo (LLM) e non è impiegato per l’adozione di sanzioni."
          ] },
        { type: "label", text: "Dati tecnici, cookie e misurazione" },
        { type: "ul", items: [
            "Token e cache OAuth, preferenza di lingua, conferma del banner cookie, chiavi push e ulteriori chiavi tecniche memorizzate in *localStorage* e/o *sessionStorage*.",
            "Log tecnici, indirizzi IP e dati di diagnostica nei limiti necessari a sicurezza e affidabilità del servizio.",
            "**Google Analytics** (ID di misurazione `G-KPF6425N60`) per l’analisi di traffico e stabilità del sito.",
            "Autodichiarazione dell’età minima (conferma di avere almeno 13 anni) conservata sul server e associata all’account Discord, ai fini del controllo di accesso al sito; una copia tecnica può essere memorizzata anche in *localStorage* sul dispositivo."
          ] },
      ],
    },
    {
      id: "utilizzo-dei-dati",
      title: "Finalità del trattamento",
      blocks: [
        { type: "p", text: "I dati personali sono trattati per le seguenti finalità:" },
        { type: "ul", items: [
            "autenticazione e gestione dell’accesso al sito, alla dashboard e alle aree riservate autorizzate;",
            "erogazione delle funzioni di community e dei bot (profilo, livelli, musica, TTS/voice, partnership, ticket, moderazione, eventi, voti, alert live);",
            "gestione di suggerimenti, recensioni, feedback, candidature, confessionale, donazioni/crediti e richieste di supporto;",
            "invio di notifiche in-app e, ove attivate, di notifiche push del browser;",
            "misurazione dell’utilizzo del sito (Google Analytics) al fine di comprenderne traffico e stabilità;",
            "configurazione del bot su server Discord gestiti da amministratori autorizzati;",
            "prevenzione di frodi, abusi, automazioni non autorizzate e comportamenti illeciti o dannosi;",
            "tutela del sito, dei bot, dell’infrastruttura e della community;",
            "adempimento di obblighi di legge e gestione di richieste di supporto, moderazione o esercizio dei diritti in materia di protezione dei dati;",
            "miglioramento di stabilità, sicurezza e qualità dei servizi."
          ] },
      ],
    },
    {
      id: "base-giuridica-gdpr",
      title: "Base giuridica",
      blocks: [
        { type: "p", text: "Il trattamento si fonda, a seconda dei casi, su una o più delle seguenti basi giuridiche (art. 6 GDPR):" },
        { type: "ul", items: [
            "**Esecuzione di un contratto** o di misure precontrattuali, per login, gestione dell’account e funzioni richieste dall’utente.",
            "**Legittimo interesse** del titolare, per la tutela della community, la prevenzione degli abusi, la sicurezza, la moderazione e la misurazione tecnica del sito.",
            "**Obbligo legale**, ove il trattamento sia necessario per adempiere a obblighi normativi o a richieste delle autorità competenti.",
            "**Consenso**, ove richiesto (ad esempio per le notifiche push del browser o per ulteriori funzioni opzionali che lo prevedano)."
          ] },
      ],
    },
    {
      id: "condivisione-dei-dati",
      title: "Destinatari e comunicazione dei dati",
      blocks: [
        { type: "p", text: "I dati personali non sono ceduti a terzi a titolo oneroso. Possono essere comunicati esclusivamente a soggetti la cui collaborazione è strettamente necessaria all’erogazione del servizio, tra cui:" },
        { type: "ul", items: [
            "Discord Inc., per OAuth, hosting della piattaforma e API;",
            "fornitori di hosting, database e infrastruttura;",
            "Google (Google Analytics), per la misurazione del traffico;",
            "piattaforme di voto o listing (ad es. top.gg, Discadia), ove utilizzate;",
            "provider di pagamento (ad es. PayPal), in caso di donazioni o pagamenti collegati;",
            "Twitch e servizi correlati, limitatamente alle funzioni live/alert attivate;",
            "provider di trascrizione vocale (speech-to-text), ove utilizzate clip o trascrizioni;",
            "personale autorizzato (staff), per ticket, confessionale, suggerimenti, moderazione e strumenti operativi;",
            "amministratori del server Discord di appartenenza, per i dati necessari al funzionamento di quel server;",
            "autorità competenti, ove imposto dalla legge o necessario a tutelare la sicurezza del servizio."
          ] },
        { type: "p", text: "Non sono effettuate comunicazioni a inserzionisti a fini di pubblicità personalizzata. I contenuti degli utenti non sono impiegati per l’addestramento di modelli di intelligenza artificiale generativa di terzi." },
      ],
    },
    {
      id: "cookie",
      title: "Cookie e tecnologie analoghe",
      blocks: [
        { type: "p", text: "Sono utilizzati cookie e tecnologie analoghe (ivi inclusi *localStorage*, *sessionStorage* e, ove attivo, il service worker per le notifiche push) principalmente per:" },
        { type: "ul", items: [
            "mantenere la sessione di autenticazione Discord (fino a 180 giorni ovvero fino al logout);",
            "memorizzare lingua, preferenze di interfaccia, stato delle push e conferma del banner cookie;",
            "proteggere il sito mediante controlli anti-abuso e token tecnici;",
            "misurare l’audience sulle pagine in cui Google Analytics è attivo;",
            "assicurare il corretto funzionamento delle pagine e delle aree riservate."
          ] },
        { type: "p", text: "Per l’elenco dettagliato si rinvia alla [[Cookie Policy|/cookie/]]." },
      ],
    },
    {
      id: "sicurezza-dei-dati",
      title: "Misure di sicurezza",
      blocks: [
        { type: "p", text: "Il titolare adotta misure tecniche e organizzative adeguate a proteggere i dati trattati, tra cui, a titolo esemplificativo:" },
        { type: "ul", items: [
            "connessioni cifrate HTTPS/TLS e tutela delle sessioni;",
            "controlli OAuth (parametro state anti-CSRF) e verifiche contro accessi non autorizzati;",
            "limitazione dell’accesso ai dati al personale autorizzato;",
            "strumenti di logging, monitoraggio e mitigazione degli abusi, ove necessari;",
            "backup e misure di protezione infrastrutturale nei limiti dei sistemi impiegati."
          ] },
      ],
    },
    {
      id: "i-tuoi-diritti-gdpr",
      title: "Diritti dell’interessato",
      blocks: [
        { type: "p", text: "Nei limiti previsti dal GDPR, l’interessato può esercitare i diritti di **accesso**, **rettifica**, **cancellazione**, **limitazione** del trattamento, **opposizione**, **portabilità** dei dati nonché, ove il trattamento si fondi sul consenso, **revoca del consenso**, senza pregiudicare la liceità del trattamento basato sul consenso prima della revoca." },
        { type: "p", text: "Per i dati gestiti dal sito e dai bot è possibile esportare o richiedere la cancellazione dalla pagina [[I tuoi dati|/dati/]] (accesso con Discord), ovvero contattare il titolare tramite i canali ufficiali della community." },
        { type: "p", text: "Resta fermo il diritto di proporre reclamo all’**Autorità Garante per la protezione dei dati personali**." },
        { type: "cta", href: "/dati/", label: "Gestisci i tuoi dati" },
      ],
    },
    {
      id: "conservazione-dei-dati",
      title: "Periodi di conservazione",
      blocks: [
        { type: "p", text: "I dati sono conservati per il tempo strettamente necessario al perseguimento delle finalità indicate. I termini che seguono costituiscono **obiettivi tipici**, fatti salvi obblighi di legge o controversie in corso. Non tutti i dataset prevedono una cancellazione automatica a scadenza: la rimozione può avvenire anche mediante gli strumenti «I tuoi dati», su richiesta dell’interessato o in occasione di interventi di manutenzione, ove tecnicamente fattibile." },
        { type: "ul", items: [
            "**Sessione sul sito:** fino a 180 giorni, ovvero fino a logout o scadenza del token.",
            "**Autodichiarazione età:** per tutta la durata dell’account o fino a cancellazione dei dati su richiesta; lo stato di blocco underage è conservato per quanto necessario a far valere la preclusione all’accesso.",
            "**Profilo community / punti / progressi:** per tutta la durata dell’appartenenza o dell’uso dei servizi; dopo l’uscita o la richiesta di cancellazione, di norma fino a 12 mesi per chiusura tecnica e prevenzione degli abusi, salvo anonimizzazione anteriore.",
            "**Ticket web e allegati:** di norma fino a 24 mesi dalla chiusura, successivamente cancellazione o anonimizzazione.",
            "**Suggerimenti, recensioni, feedback, candidature:** di norma fino a 36 mesi, o prima su richiesta o a seguito di moderazione.",
            "**Confessionale:** di norma fino a 24 mesi, accessibile allo staff autorizzato; cancellabile in anticipo su richiesta o moderazione.",
            "**Log di moderazione e partnership:** di norma fino a 36 mesi, per esigenze di sicurezza e gestione delle controversie.",
            "**Iscrizioni push:** fino a revoca del permesso, logout tecnico o cancellazione dell’iscrizione.",
            "**Trascrizioni vocali:** elaborazione dell’audio in modo transitorio; il testo è conservato solo se richiesto dalla funzione, di norma fino a 90 giorni salvo esigenze di moderazione.",
            "**Corpus Markov:** aggiornamento periodico; rimozione o riduzione su richiesta nei limiti tecnici.",
            "**Log tecnici / indirizzi IP:** di norma da 30 a 90 giorni.",
            "**Google Analytics:** secondo le impostazioni di conservazione del fornitore.",
            "**Backup:** cicli tipici fino a circa 90 giorni, con eventuale sovrapposizione ai termini sopra indicati."
          ] },
      ],
    },
    {
      id: "minori",
      title: "Minori",
      blocks: [
        { type: "p", text: "I servizi di Vinili & Caffè sono destinati a un pubblico prevalentemente italiano. L’accesso al sito è consentito esclusivamente a persone che abbiano compiuto almeno **13 anni**, in linea con l’età minima globale prevista dai Termini di Discord, fermo restando il rispetto di soglie più elevate ove richieste dalla normativa del Paese di residenza." },
        { type: "p", text: "Al primo accesso autenticato con Discord è richiesta un’**autodichiarazione** di avere compiuto almeno 13 anni, confermata dall’interessato. Tale dichiarazione è conservata sul server e associata all’identificativo Discord dell’account, non è pubblicata sul profilo e, una volta registrata, **non è modificabile** dall’utente. Una copia tecnica può restare sul dispositivo (*localStorage*) ai soli fini operativi dell’interfaccia." },
        { type: "p", text: "In caso di dichiarazione di età inferiore a 13 anni, l’accesso al sito è **precluso** e lo stato di blocco resta associato all’account. Il titolare non raccoglie consapevolmente dati personali di minori di anni 13 oltre a quanto strettamente necessario a registrare e far valere tale preclusione. Dichiarazioni false possono comportare limitazioni o esclusione dai servizi, nei limiti dei Termini di Servizio e della legge applicabile." },
        { type: "p", text: "Gli utenti che accedono da giurisdizioni diverse restano tenuti al rispetto della normativa locale e delle condizioni di Discord. Sul sito Vinili & Caffè si applica in ogni caso il requisito minimo di **13 anni**." },
      ],
    },
    {
      id: "trasferimenti-internazionali",
      title: "Trasferimenti internazionali",
      blocks: [
        { type: "p", text: "Alcuni fornitori impiegati dal progetto (tra cui Discord e altri servizi tecnici) possono trattare dati anche al di fuori dello Spazio Economico Europeo." },
        { type: "p", text: "In tali ipotesi il trattamento avviene secondo le garanzie offerte dai rispettivi fornitori e nei limiti previsti dal GDPR, ivi comprese, ove applicabili, le clausole contrattuali standard o misure equivalenti." },
      ],
    },
    {
      id: "modifiche-alla-policy",
      title: "Modifiche all’informativa",
      blocks: [
        { type: "p", text: "Il titolare si riserva di aggiornare la presente Informativa per adeguamenti normativi, tecnici o organizzativi. La data di ultimo aggiornamento indicata in intestazione identifica la versione vigente." },
        { type: "p", text: "L’uso continuato del sito o dei servizi dopo la pubblicazione delle modifiche comporta presa d’atto della versione aggiornata, nei limiti consentiti dalla legge." },
      ],
    },
    {
      id: "contatti-e-reclami",
      title: "Contatti e reclami",
      blocks: [
        { type: "p", text: "Per richieste in materia di privacy o di esercizio dei diritti GDPR è possibile contattare il titolare tramite i canali ufficiali della community (Discord e/o ticket sul sito)." },
        { type: "p", text: "Resta fermo il diritto di proporre reclamo al **Garante per la protezione dei dati personali** (www.garanteprivacy.it)." },
      ],
    },
  ],
};

export const LEGAL_COOKIE: LegalDoc = {
  slug: "cookie",
  h1: "Cookie Policy",
  updatedIso: UPDATED_ISO,
  updatedLabel: UPDATED_LABEL,
  updatedPrefix: "Ultimo aggiornamento:",
  subtitle: "Informativa sull’uso di cookie e tecnologie di memorizzazione analoghe",
  sections: [
    {
      id: "cosa-sono-i-cookie",
      title: "Definizioni e ambito",
      blocks: [
        { type: "p", text: "I cookie sono piccoli file di testo memorizzati sul dispositivo dell’utente durante la navigazione. Tecnologie analoghe, quali *localStorage* e *sessionStorage*, possono essere impiegate per autenticazione, preferenze e sicurezza." },
        { type: "p", text: "La presente Cookie Policy si applica al **sito web** Vinili & Caffè e alle pagine collegate. Il server Discord ufficiale e i bot sono regolati dai Termini di Servizio, dall’Informativa sulla privacy e dalle regole della community; Discord applica inoltre le proprie policy sulla piattaforma." },
      ],
    },
    {
      id: "cookie-che-utilizziamo",
      title: "Tipologie di cookie e storage impiegati",
      blocks: [
        { type: "h3", text: "Cookie e storage tecnici (necessari)" },
        { type: "p", text: "Sono utilizzati cookie e memorizzazioni locali strettamente necessari al funzionamento del sito. In loro assenza l’autenticazione e le aree riservate potrebbero non essere disponibili." },
        { type: "p", text: "**Sessione OAuth Discord** — token e scadenza in *localStorage* (fino a 180 giorni, ovvero fino a logout o scadenza del token).\n\n**Ambito e cache del profilo** — memorizzazione dei permessi di autenticazione e di dati minimi di profilo, al fine di ridurre le chiamate a Discord.\n\n**Preferenza di lingua** — memorizzazione della lingua selezionata.\n\n**Preferenza del banner cookie** — memorizzazione della scelta espressa sull’avviso (fino a 180 giorni).\n\n**Notifiche push (facoltative)** — ove attivate: chiavi locali di stato e service worker del browser.\n\n**Stato tecnico dell’interfaccia** — chiavi locali relative a notifiche in-app, accessi a eventi o anteprime, senza finalità di profilazione pubblicitaria.\n\n**Verifica dell’età** — autodichiarazione di età minima (almeno 13 anni) conservata sul server e associata all’account Discord; eventuale copia tecnica in *localStorage* ai soli fini operativi dell’interfaccia." },
        { type: "h3", text: "Misurazione (analytics)" },
        { type: "p", text: "È utilizzato **Google Analytics** (ID `G-KPF6425N60`) per l’analisi di traffico e stabilità. Non sono impiegati cookie di profilazione pubblicitaria, remarketing o tracciamento social a fini commerciali, fatti salvi eventuali cookie di Discord durante il flusso OAuth." },
        { type: "fact", title: "Sessione OAuth Discord", badge: "Necessario", items: [
            { k: "Finalità", v: "mantenere l’autenticazione e gestire il flusso OAuth." },
            { k: "Durata", v: "fino a 180 giorni come sessione locale, ovvero fino a logout o invalidazione/scadenza del token Discord." },
            { k: "Natura", v: "dati tecnici locali del browser." }
          ] },
        { type: "fact", title: "Cookie di sicurezza", badge: "Necessario", items: [
            { k: "Finalità", v: "mitigare rischi quali CSRF e accessi automatizzati abusivi." },
            { k: "Durata", v: "sessione o temporanea." },
            { k: "Natura", v: "token tecnici temporanei." }
          ] },
        { type: "fact", title: "Preferenza banner cookie", badge: "Tecnico", items: [
            { k: "Finalità", v: "memorizzare la scelta relativa all’avviso sui cookie." },
            { k: "Durata", v: "fino a 180 giorni." },
            { k: "Natura", v: "SameSite=Lax; attributo Secure ove disponibile." }
          ] },
        { type: "fact", title: "Google Analytics", badge: "Misurazione", items: [
            { k: "Finalità", v: "statistiche di traffico e utilizzo delle pagine." },
            { k: "Durata", v: "secondo le impostazioni di Google Analytics." },
            { k: "Natura", v: "cookie e script di terzi (Google)." }
          ] },
        { type: "h3", text: "Strumenti non utilizzati" },
        { type: "p", text: "Vinili & Caffè **non** impiega:" },
        { type: "ul", items: [
            "cookie di profilazione pubblicitaria o remarketing;",
            "reti pubblicitarie di social media a fini di targeting commerciale (fatti salvi i cookie di Discord durante OAuth);",
            "cessione di dati a inserzionisti;",
            "strumenti di *session replay* o registrazione delle sessioni di navigazione (a titolo esemplificativo: Hotjar, FullStory, PostHog Session Replay, Microsoft Clarity Replay). L’autenticazione avviene esclusivamente tramite Discord OAuth; sul sito non sono raccolte password."
          ] },
      ],
    },
    {
      id: "sicurezza-dei-cookie",
      title: "Misure di protezione",
      blocks: [
        { type: "p", text: "Le tecnologie di memorizzazione impiegate beneficiano, tra l’altro, delle seguenti misure:" },
        { type: "ul", items: [
            "**HTTPS/TLS** — cifratura delle comunicazioni con i servizi API;",
            "**Parametro state OAuth** — protezione contro attacchi CSRF nel flusso di autenticazione;",
            "**Scadenza della sessione** — cessazione della sessione locale al massimo dopo 180 giorni, al logout o all’invalidazione/scadenza del token Discord;",
            "**Minimizzazione** — conservazione dei soli dati tecnici necessari."
          ] },
      ],
    },
    {
      id: "finalita-dei-cookie",
      title: "Finalità",
      blocks: [
        { type: "p", text: "Cookie e storage locale sono utilizzati per:" },
        { type: "ul", items: [
            "mantenere l’autenticazione sul sito e sulla dashboard;",
            "tutelare account e API da accessi non autorizzati;",
            "prevenire abusi automatizzati;",
            "memorizzare lingua, scelte tecniche di interfaccia e stato delle notifiche push (ove attive);",
            "misurare traffico e utilizzo delle pagine (Google Analytics, ove attivo);",
            "consentire il funzionamento di votazioni e aree riservate."
          ] },
      ],
    },
    {
      id: "base-giuridica",
      title: "Base giuridica",
      blocks: [
        { type: "p", text: "I cookie e lo storage **strettamente necessari** all’autenticazione, alla sicurezza e al funzionamento del sito non richiedono consenso preventivo, ai sensi della disciplina GDPR ed ePrivacy applicabile." },
        { type: "p", text: "La misurazione mediante **Google Analytics** è fondata sul legittimo interesse a comprendere l’utilizzo del sito e a migliorarne stabilità e contenuti. L’interessato può limitarla mediante impostazioni del browser, estensioni anti-tracciamento o strumenti messi a disposizione da Google. **Non sono utilizzati cookie di profilazione pubblicitaria.**" },
        { type: "p", text: "Le **notifiche push** richiedono il permesso del browser e, ove previsto, il consenso dell’interessato." },
      ],
    },
    {
      id: "come-gestire-i-cookie",
      title: "Gestione da parte dell’utente",
      blocks: [
        { type: "p", text: "È possibile gestire cookie e storage dalle impostazioni del browser ovvero cancellando i dati del sito. La disabilitazione degli elementi essenziali può impedire l’autenticazione. Per rimuovere la sessione è sufficiente effettuare il logout." },
        { type: "p", text: "Per le notifiche push: revocare il permesso dalle impostazioni del browser. Per Analytics: utilizzare blocchi di cookie o tracker del browser." },
        { type: "label", text: "Logout" },
        { type: "p", text: "Il logout rimuove o invalida i dati di sessione locali collegati all’autenticazione." },
      ],
    },
    {
      id: "cookie-di-terze-parti",
      title: "Cookie di terzi",
      blocks: [
        { type: "p", text: "Durante l’autenticazione OAuth con Discord possono essere impostati cookie da discord.com, regolati da Discord Inc. secondo la propria informativa." },
        { type: "p", text: "Google Analytics carica script e cookie di Google (domini googletagmanager.com / google-analytics). Si applicano altresì le informative di Google." },
        { type: "p", text: "Vinili & Caffè non esercita un controllo pieno su cookie e trattamenti effettuati da tali terzi." },
      ],
    },
    {
      id: "durata-dei-cookie",
      title: "Durata",
      blocks: [
        { type: "table", headers: ["Tipologia", "Durata"], rows: [
            ["Sessione di autenticazione (localStorage)", "Fino a 180 giorni, logout o scadenza del token Discord"],
            ["Preferenza lingua / UI tecnica / stato push", "Fino a cancellazione manuale, revoca del permesso o logout, ove previsto"],
            ["Preferenza banner cookie", "180 giorni"],
            ["Autodichiarazione età (server + cache locale)", "Fino a cancellazione account/dati; cache locale fino a cancellazione manuale"],
            ["Google Analytics", "Secondo le impostazioni di Google"],
            ["OAuth Discord (cookie di discord.com)", "Determinata da Discord"],
            ["Redirect / state OAuth", "Fino al completamento del login"]
          ] },
      ],
    },
    {
      id: "contatti",
      title: "Contatti",
      blocks: [
        { type: "p", text: "Per richieste relative alla presente Cookie Policy è possibile contattare il titolare tramite i canali ufficiali della community (Discord e/o ticket sul sito)." },
      ],
    },
  ],
};

export const LEGAL_TERMS: LegalDoc = {
  slug: "terms",
  h1: "Termini di Servizio",
  updatedIso: UPDATED_ISO,
  updatedLabel: UPDATED_LABEL,
  updatedPrefix: "Ultimo aggiornamento:",
  subtitle: "Condizioni generali di utilizzo del sito, dei bot e dei servizi di community Vinili & Caffè",
  sections: [
    {
      id: "accettazione-dei-termini",
      title: "Accettazione",
      blocks: [
        { type: "p", text: "L’utilizzo del sito web **Vinili & Caffè** («Sito»), dei bot Discord collegati («Bot») e dei server Discord associati ovvero ospiti nei quali i Bot sono presenti («Server») comporta l’integrale accettazione dei presenti Termini di Servizio. In mancanza di accettazione, l’utente è tenuto a non utilizzare Sito, Bot, Server, dashboard o funzioni collegate." },
        { type: "p", text: "Su server Discord di terzi nei quali è installato il Bot restano altresì applicabili le regole di quel server: l’amministratore ospite è responsabile delle proprie scelte di configurazione." },
        { type: "p", text: "L’uso continuato dei servizi dopo la pubblicazione di aggiornamenti costituisce accettazione delle modifiche, nei limiti consentiti dalla legge." },
      ],
    },
    {
      id: "descrizione-del-servizio",
      title: "Descrizione del servizio",
      blocks: [
        { type: "p", text: "Vinili & Caffè fornisce una community Discord e servizi collegati, tra cui:" },
        { type: "ul", items: [
            "server Discord dedicato a socializzazione, eventi, supporto e attività di community;",
            "bot pubblici e multi-server (musica, TTS/voice, livelli, ticket, moderazione, partnership, utility), configurabili anche tramite dashboard web;",
            "pagine web per voto, profilo, ruoli, wiki, candidature, unban, notifiche, suggerimenti, recensioni, feedback, confessionale, donazioni/crediti e ticket di supporto;",
            "integrazioni live (ad es. Twitch) e relativi alert, ove attivi;",
            "aree riservate per staff e amministratori;",
            "integrazioni con Discord, piattaforme di voto, provider di pagamento e ulteriori servizi tecnici necessari."
          ] },
        { type: "p", text: "Il titolare si riserva di modificare, sospendere o cessare, in tutto o in parte, il servizio, il Sito, i Bot o i Server, anche senza preavviso, nei limiti di legge." },
      ],
    },
    {
      id: "requisiti-di-accesso",
      title: "Requisiti di accesso",
      blocks: [
        { type: "p", text: "Per utilizzare i servizi l’utente deve:" },
        { type: "ul", items: [
            "avere compiuto almeno **13 anni** (requisito del Sito, allineato al minimo globale di Discord) e rispettare altresì eventuali soglie più elevate richieste dalla normativa del Paese di residenza. Al primo accesso autenticato con Discord è richiesta un’autodichiarazione di età minima, registrata sul server e non modificabile. Dichiarazioni false possono comportare sanzioni ai sensi dei presenti Termini. Ove la legge richieda il coinvolgimento di chi esercita la responsabilità genitoriale, l’uso dovrà avvenire in tale contesto;",
            "disporre di un account Discord valido e non compromesso;",
            "fornire informazioni veritiere nei moduli e nelle richieste;",
            "custodire le credenziali del proprio account e non condividerle al fine di eludere controlli o limitazioni;",
            "osservare i presenti Termini, l’Informativa sulla privacy, la Cookie Policy e le regole del server."
          ] },
      ],
    },
    {
      id: "regole-di-comportamento",
      title: "Regole di condotta",
      blocks: [
        { type: "label", text: "È fatto divieto di" },
        { type: "ul", items: [
            "violare la legge applicabile o le policy di Discord;",
            "pubblicare contenuti offensivi, discriminatori, illeciti o dannosi;",
            "molestare, minacciare, intimidire o impersonare altri utenti o membri dello staff;",
            "impiegare bot, script, multiaccount o VPN abusive per alterare voti, partnership, livelli, statistiche o accessi;",
            "abusare della dashboard, delle API, dei webhook di voto, dei ticket sul sito o dei sistemi di configurazione;",
            "registrare o diffondere audio altrui senza idonea base giuridica, ovvero utilizzare TTS/voice per finalità illecite o moleste;",
            "compromettere, o tentare di compromettere, la sicurezza di Sito, Bot, pannelli o Server;",
            "effettuare spam, phishing, pubblicità non autorizzata o diffusione di dati personali di terzi;",
            "sfruttare vulnerabilità senza segnalarle allo staff, ovvero eludere ban, timeout o altre limitazioni."
          ] },
      ],
    },
    {
      id: "sistema-di-voto",
      title: "Sistema di voto",
      blocks: [
        { type: "ul", items: [
            "I voti devono essere genuini e conformi alle regole delle piattaforme esterne (ad es. top.gg, Discadia).",
            "Non è consentito l’uso di bot, multiaccount, VPN abusive o metodi automatici per ottenere ricompense indebite.",
            "Punti, progressi e ricompense possono essere corretti o annullati in caso di abuso.",
            "I webhook di voto possono elaborare l’identificativo Discord dell’utente per assegnare ricompense; i servizi terzi possono variare senza preavviso."
          ] },
      ],
    },
    {
      id: "candidature-staff",
      title: "Candidature allo staff",
      blocks: [
        { type: "ul", items: [
            "Le candidature sono valutate dallo staff a proprio insindacabile giudizio.",
            "L’invio di una candidatura non attribuisce diritto a risposta, accettazione o ingresso nello staff.",
            "Informazioni false, spam o abusi nei moduli possono comportare rifiuto e/o sanzioni.",
            "I ruoli di staff possono essere revocati in qualsiasi momento per esigenze organizzative o per violazioni.",
            "I ruoli di staff non attribuiscono diritti patrimoniali, societari o di proprietà sul Server o sul Sito."
          ] },
      ],
    },
    {
      id: "proprieta-intellettuale",
      title: "Proprietà intellettuale",
      blocks: [
        { type: "p", text: "Restano di esclusiva titolarità di Vinili & Caffè o dei rispettivi aventi diritto, salvo diversa indicazione scritta:" },
        { type: "ul", items: [
            "**Sito:** design, grafica, testi, codice, loghi, wiki, dashboard e materiali correlati;",
            "**Bot:** codice, configurazioni, branding, messaggi di sistema e documentazione operativa;",
            "**Server Discord ufficiale:** denominazione e marchio della community, icone, banner, emoji e sticker personalizzati, layout e materiali realizzati dallo staff."
          ] },
        { type: "p", text: "È vietata la riproduzione, rivendita, distribuzione, ripubblicazione o qualsiasi altro riutilizzo non autorizzato. I contenuti degli utenti sono regolati dalla sezione «Contenuti degli utenti». Discord e i fornitori terzi restano titolari delle rispettive piattaforme." },
      ],
    },
    {
      id: "contenuti-utente",
      title: "Contenuti degli utenti",
      blocks: [
        { type: "p", text: "Pubblicando messaggi, media, recensioni, suggerimenti, feedback, ticket, candidature, confessioni o altri contenuti sul Server o sul Sito, l’utente:" },
        { type: "ul", items: [
            "conserva la titolarità dei propri contenuti, nei limiti di legge e delle policy di Discord;",
            "concede a Vinili & Caffè una licenza non esclusiva, limitata a quanto necessario per il funzionamento del servizio, la moderazione, la pubblicazione tecnica e, ove attivo, l’impiego statistico (sistema Markov) di messaggi pubblici della community;",
            "prende atto che ticket, confessionale e contenuti di supporto sul Sito sono accessibili allo staff autorizzato per la gestione della richiesta;",
            "garantisce di disporre dei diritti necessari a pubblicare quanto inviato;",
            "rimane responsabile del contenuto trasmesso."
          ] },
        { type: "p", text: "Per la procedura di segnalazione di contenuti che si ritengono lesivi di diritti di proprietà intellettuale si rinvia alla pagina [[Copyright|/copyright/]]." },
      ],
    },
    {
      id: "donazioni-e-crediti",
      title: "Donazioni e crediti premium",
      blocks: [
        { type: "ul", items: [
            "Le donazioni sono volontarie e, di regola, non costituiscono acquisto di beni o servizi obbligatori.",
            "I pagamenti sono elaborati da fornitori terzi (ad es. PayPal); si applicano altresì i relativi termini e informative.",
            "I crediti premium e gli eventuali vantaggi virtuali non hanno valore di denaro contante, non sono rimborsabili salvo obbligo di legge, e possono essere modificati o revocati in caso di abuso, errore o variazione del servizio.",
            "L’attivazione di Premium mediante crediti ha durata determinata, non prevede rinnovo automatico a pagamento e scade al termine del periodo acquistato; per la rimozione anticipata è necessario contattare lo staff.",
            "Non è garantita la disponibilità continuativa di campagne, ricompense o vantaggi collegati alle donazioni."
          ] },
      ],
    },
    {
      id: "moderazione-e-sanzioni",
      title: "Moderazione e sanzioni",
      blocks: [
        { type: "p", text: "Lo staff può moderare o rimuovere contenuti, applicare ammonimenti, timeout, espulsioni o ban, inibire accessi ottenuti abusivamente e decidere sulle controversie interne. Le sanzioni possono essere temporanee o permanenti in relazione a gravità, contesto e recidiva." },
      ],
    },
    {
      id: "limitazione-di-responsabilita",
      title: "Limitazione di responsabilità",
      blocks: [
        { type: "label", text: "Nei limiti consentiti dalla legge, Vinili & Caffè non risponde di" },
        { type: "ul", items: [
            "perdita di dati, statistiche, progressi, livelli, preferenze o contenuti;",
            "interruzioni del servizio, manutenzioni, indisponibilità o modifiche ai sistemi;",
            "condotte di altri utenti, contenuti di terzi o servizi esterni collegati;",
            "errori o imprecisioni di trascrizioni automatiche, messaggi Markov o altri strumenti automatici;",
            "danni indiretti, consequenziali o derivanti da uso improprio del servizio;",
            "limitazioni, modifiche o indisponibilità imposte da Discord o da fornitori terzi."
          ] },
        { type: "p", text: "Il servizio è fornito «così come è» e «come disponibile», senza garanzie di disponibilità ininterrotta o di risultati specifici, fatti salvi i diritti inderogabili dell’utente." },
      ],
    },
    {
      id: "termini-di-servizio-discord",
      title: "Rapporto con Discord",
      blocks: [
        { type: "p", text: "Il Server ufficiale è ospitato sulla piattaforma Discord. L’utilizzo comporta l’accettazione anche dei Termini di servizio e dell’Informativa privacy di Discord. Ove una funzione dipenda da Discord, prevalgono le relative regole e limitazioni tecniche. La durata della sessione di accesso al Sito dipende dal token OAuth rilasciato da Discord." },
      ],
    },
    {
      id: "legge-applicabile",
      title: "Legge applicabile e foro competente",
      blocks: [
        { type: "p", text: "I presenti Termini sono regolati dalla **legge italiana**, fatte salve le norme inderogabili a tutela del consumatore." },
        { type: "p", text: "Per le controversie è competente il **Foro di Lecce**, salvo i casi in cui la legge imponga un foro inderogabile (ivi compreso, per i consumatori dell’Unione europea, il foro del luogo di residenza o domicilio, ove applicabile)." },
      ],
    },
    {
      id: "contatti",
      title: "Contatti",
      blocks: [
        { type: "p", text: "Per richieste relative ai presenti Termini di Servizio è possibile contattare Vinili & Caffè tramite i canali ufficiali della community (Discord e/o ticket sul sito)." },
      ],
    },
  ],
};

export const LEGAL_COPYRIGHT: LegalDoc = {
  slug: "copyright",
  h1: "Copyright e licenza",
  updatedIso: UPDATED_ISO,
  updatedLabel: UPDATED_LABEL,
  updatedPrefix: "Ultimo aggiornamento:",
  subtitle: "Avviso di proprietà intellettuale e procedura di segnalazione e rimozione dei contenuti",
  sections: [
    {
      id: "copyright",
      title: "Titolarità",
      blocks: [
        { type: "p", text: "© 2024–2026 **Vinili & Caffè**. Tutti i diritti sono riservati." },
        { type: "p", text: "Sono oggetto di tutela, a titolo esemplificativo e non esaustivo:" },
        { type: "ul", items: [
            "il **Sito** web, la dashboard e i relativi materiali grafici e testuali;",
            "i **Bot** Discord (Vinili, Caffè e servizi collegati), il codice e il branding;",
            "il **Server Discord ufficiale** (denominazione, marchio, icone, banner, emoji e sticker personalizzati, layout e materiali realizzati dallo staff)."
          ] },
        { type: "p", text: "È vietato l’uso, la riproduzione, la modifica, la ripubblicazione o la distribuzione di tali contenuti senza previa autorizzazione scritta dei titolari." },
        { type: "p", text: "I contenuti pubblicati dagli utenti (immagini, allegati, media in ticket, contest, feedback, bacheca e vetrina, ecc.) restano di titolarità dei rispettivi autori, nei limiti di legge, delle policy di Discord e dei Termini di Servizio. Con il caricamento di un file l’utente dichiara di disporre dei diritti necessari ovvero di idonea autorizzazione." },
      ],
    },
    {
      id: "segnalazioni-e-dmca",
      title: "Segnalazione di violazioni e rimozione",
      blocks: [
        { type: "p", text: "Chi ritenga che un contenuto reso disponibile sul Sito o nei servizi Vinili & Caffè violi diritti d’autore o altri diritti di proprietà intellettuale può richiederne la rimozione secondo la procedura che segue." },
        { type: "label", text: "Modalità di segnalazione" },
        { type: "ul", items: [
            "**1.** Aprire un **ticket** sul Sito (categoria Supporto) indicando come oggetto **«Segnalazione copyright»**, ovvero contattare lo staff tramite i canali ufficiali Discord.",
            "**2.** Fornire: (a) identità e recapito di posta elettronica del segnalante; (b) descrizione dell’opera protetta e, ove disponibile, prova della titolarità o della legittimazione a segnalare; (c) ubicazione del materiale contestato (URL o descrizione inequivoca); (d) motivazione della richiesta di rimozione.",
            "**3.** Una segnalazione completa consente una valutazione più tempestiva."
          ] },
        { type: "label", text: "Esito della segnalazione" },
        { type: "ul", items: [
            "La segnalazione è esaminata in tempi ragionevoli.",
            "Il titolare può **rimuovere o disabilitare** l’accesso al materiale contestato e, ove opportuno, informare chi lo ha pubblicato.",
            "Eventuali controdeduzioni fondate saranno valutate secondo le procedure interne e la legge applicabile.",
            "Segnalazioni abusive ovvero pubblicazioni reiterate di contenuti non autorizzati possono comportare limitazioni o esclusione dall’utilizzo dei servizi."
          ] },
        { type: "label", text: "Referente" },
        { type: "ul", items: [
            "**Titolare / referente:** Lorenzo Antonio Corvaglia — Vinili & Caffè",
            "**Canale:** ticket sul Sito (Supporto) oppure staff del Discord ufficiale",
            "**Pagina di riferimento:** [[viniliecaffe.it/copyright|/copyright/]]"
          ] },
        { type: "p", text: "I servizi sono concepiti principalmente per un pubblico italiano e soggetti alla legge italiana. Gli utenti o i titolari di diritti residenti in altre giurisdizioni possono utilizzare il medesimo canale di segnalazione: la richiesta sarà valutata alla luce della normativa applicabile e delle policy della piattaforma." },
        { type: "cta", href: "/tickets/?dmca=1", label: "Apri un ticket di segnalazione" },
      ],
    },
    {
      id: "license",
      title: "Licenza proprietaria",
      blocks: [
        { type: "label", text: "Sintesi" },
        { type: "ul", items: [
            "Non è concessa alcuna licenza a terzi su codice, Sito, Bot o asset ufficiali in assenza di autorizzazione scritta.",
            "È vietato copiare, modificare, distribuire, rieseguire in ambienti non autorizzati ovvero effettuare reverse engineering, fatti salvi i limiti inderogabili di legge.",
            "L’uso della community da parte degli utenti è regolato dai Termini di Servizio e non trasferisce diritti di proprietà su marchio, codice o asset.",
            "Le librerie di terzi e la piattaforma Discord restano soggette alle rispettive licenze e policy.",
            "Software e servizi sono forniti «così come sono», senza garanzie, nei limiti di legge."
          ] },
        { type: "p", text: "Testo integrale della licenza:" },
        { type: "pre", text: "LICENZA PROPRIETARIA — VINILI & CAFFÈ\n=====================================\n\nCopyright (c) 2024–2026 Vinili & Caffè. Tutti i diritti riservati.\n\nIl presente avviso copre l'ecosistema Vinili & Caffè, incluso:\n\n  • repository, codice sorgente, script, configurazioni, asset e documentazione;\n  • sito web, dashboard e materiali correlati;\n  • bot Discord e relativi asset/branding;\n  • server Discord ufficiale della community (brand, icone, banner,\n    emoji/sticker personalizzati e materiali creati dallo staff).\n\nCONCESSIONE\n-----------\n\nNon viene concessa alcuna licenza, esplicita o implicita, a terzi per l'uso di\nquesto software, dei contenuti del sito/bot o degli asset del server ufficiale,\nsalvo autorizzazione scritta dei titolari.\n\nÈ espressamente vietato, senza previa autorizzazione scritta dei titolari:\n\n  • copiare, riprodurre o duplicare codice, file, brand o asset protetti;\n  • modificare, adattare, tradurre o creare opere derivate;\n  • distribuire, pubblicare, sublicenziare o mettere a disposizione di terzi;\n  • eseguire, installare o far girare il software in ambienti non autorizzati;\n  • decompilare, disassemblare o effettuare reverse engineering, salvo dove la legge applicabile lo imponga in modo inderogabile;\n  • rimuovere o alterare avvisi di copyright o di licenza;\n  • ripubblicare o rivendere emoji, sticker, banner, loghi o materiali del server ufficiale come propri.\n\nUSO AUTORIZZATO\n---------------\n\nL'uso del codice e degli asset protetti è consentito esclusivamente al\npersonale autorizzato di Vinili & Caffè, per finalità interne e operative\nconcordate dai titolari. L'uso della community (sito/bot/server) da parte\ndegli utenti è regolato dai Termini di Servizio e non trasferisce proprietà\nsu brand, codice o asset ufficiali.\n\nTERZE PARTI\n-----------\n\nComponenti di terze parti (librerie npm, script vendor, tool in deploy/tools)\ne la piattaforma Discord restano soggetti alle rispettive licenze/policy.\nIl presente documento non estende diritti su tali componenti.\n\nCONTENUTI UTENTE\n----------------\n\nI messaggi, media e altri contenuti pubblicati dagli utenti restano dei\nrispettivi autori, nei limiti di legge, delle policy Discord e dei Termini\ndi Servizio di Vinili & Caffè.\n\nGARANZIE E RESPONSABILITÀ\n-------------------------\n\nIl software e i servizi sono forniti \"così come sono\", senza garanzie di alcun\ntipo, nei limiti consentiti dalla legge applicabile. In nessun caso i titolari\nsaranno responsabili per danni derivanti dall'uso non autorizzato o da\nqualsiasi utilizzo del materiale coperto da questa licenza, fatti salvi i\ndiritti inderogabili dell'utente.\n\nCONTATTI\n--------\n\nPer richieste di autorizzazione: contattare i titolari di Vinili & Caffè\nattraverso i canali ufficiali della community (Discord e/o ticket sul sito)." },
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
