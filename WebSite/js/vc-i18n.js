(function () {
  var STORAGE_KEY = "vc_site_lang";
    var SUPPORTED = ["it", "en"];
    var LEGACY_AUTO_LANGS = [
    "es",
    "fr",
    "de",
    "pt",
    "ru",
    "zh",
    "ja",
    "ko",
    "ar",
    "nl",
    "pl",
    "tr",
    "hi",
    "id",
    "uk",
    "vi",
    "ro",
    "sv",
  ];
  var LANG_LABEL = {
    it: "Italiano",
    en: "English",
    es: "Español",
    fr: "Français",
    de: "Deutsch",
    pt: "Português",
    ru: "Русский",
    zh: "中文",
    ja: "日本語",
    ko: "한국어",
    ar: "العربية",
    nl: "Nederlands",
    pl: "Polski",
    tr: "Türkçe",
    hi: "हिन्दी",
    id: "Indonesia",
    uk: "Українська",
    vi: "Tiếng Việt",
    ro: "Română",
    sv: "Svenska",
  };
  var LANG_FLAG = {
    it: "it",
    en: "en",
    es: "es",
    fr: "fr",
    de: "de",
    pt: "pt",
    ru: "ru",
    zh: "zh",
    ja: "ja",
    ko: "ko",
    ar: "ar",
    nl: "nl",
    pl: "pl",
    tr: "tr",
    hi: "hi",
    id: "id",
    uk: "uk",
    vi: "vi",
    ro: "ro",
    sv: "sv",
  };
  var LANG_EMOJI = {
    it: "🇮🇹",
    en: "🇬🇧",
    es: "🇪🇸",
    fr: "🇫🇷",
    de: "🇩🇪",
    pt: "🇧🇷",
    ru: "🇷🇺",
    zh: "🇨🇳",
    ja: "🇯🇵",
    ko: "🇰🇷",
    ar: "🇸🇦",
    nl: "🇳🇱",
    pl: "🇵🇱",
    tr: "🇹🇷",
    hi: "🇮🇳",
    id: "🇮🇩",
    uk: "🇺🇦",
    vi: "🇻🇳",
    ro: "🇷🇴",
    sv: "🇸🇪",
  };

  var DICTS = {
    it: {
      "nav.language": "Lingua",
      "nav.languageList": "Scegli lingua",
      "nav.quickLinks": "Collegamenti rapidi",
      "nav.wiki": "Wiki",
      "nav.sponsor": "Sponsor",
      "nav.support": "Supporta",
      "nav.voteServer": "Vota il server",
      "nav.reviews": "Recensioni",
      "nav.botReviews": "Recensioni",
      "nav.donations": "Donazioni",
      "nav.perks": "Perks",
      "nav.community": "Community",
      "nav.users": "Users",
      "nav.roles": "Ruoli",
      "nav.rules": "Regole",
      "nav.faq": "FAQ",
      "nav.requests": "Richieste",
      "nav.unban": "Unban",
      "nav.applications": "Candidature",
      "nav.suggestions": "Feedback",
      "nav.tickets": "Tickets",
      "nav.status": "Status",
      "nav.premium": "Premium",
      "nav.homeAria": "Vai alla homepage",
      "nav.discordAria": "Entra su Discord",
      "header.promo.eventLabel": "Evento",
      "header.promo.appsLabel": "Candidature",
      "header.promo.appsLabelShort": "CAND.",
      "header.promo.eventBadge": "evento attivo",
      "header.promo.eventBadgeShort": "ATTIVO",
      "header.promo.appsBadge": "APERTE",
      "header.promo.appsBadgeLong": "candidature aperte",
      "header.promo.eventAria": "Evento Hogwarts attivo – vai al calendario",
      "header.promo.appsAria": "Candidature staff aperte",
      "kickPip.aria": "Anteprima live Kick",
      "kickPip.hide": "Nascondi anteprima live",
      "kickPip.reopenAria": "Mostra anteprima live Kick",
      "kickPip.reopen": "Live Kick",
      "kickPip.open": "Apri live su Kick",
      "kickPip.playerTitle": "Player live Kick",
      "kickPip.drag": "Trascina anteprima",
      "kickPip.float": "Apri in Picture-in-Picture",
      "kickPip.floatClose": "Chiudi Picture-in-Picture",
      "kickPip.unmute": "Attiva audio",
      "kickPip.mute": "Disattiva audio",
      "kickPip.play": "Riproduci anteprima",
      "kickPip.limitTitle": "Anteprima terminata",
      "kickPip.limitText": "Hai raggiunto i 10 minuti di preview. Continua su Kick.",
      "kickPip.limitCta": "Apri su Kick",
      "kickPip.defaultTitle": "Diretta in corso",
      "kickPip.defaultVodTitle": "Ultimo VOD",
      "kickPip.viewers": "spettatori",
      "kickPip.views": "visualizzazioni",
      "kickPip.badgeVod": "VOD",
      "kickPip.openVod": "Apri VOD su Kick",
      "kickPip.reopenVod": "VOD Kick",
      "kickPip.reopenVodAria": "Mostra ultimo VOD Kick",
      "kickPip.sub": "Collega Kick Sub",
      "kickPip.subLogin": "LOGIN",
      "kickPip.subLoginHint": "Accedi con Discord per collegare Kick Sub",
      "kickPip.subActive": "SUB ✓",
      "kickPip.subActiveHint": "Sub attivo — ruolo Discord sincronizzato",
      "kickPip.subLinked": "LINK",
      "kickPip.subLinkedHint": "Kick collegato — per il ruolo scrivi un messaggio in chat dello streamer su Kick",
      "kickPip.alertTitle": "Kick Sub",
      "kickPip.alertOk": "OK",
      "kickPip.subLinkedTitle": "Quasi fatto",
      "kickPip.subLinkedOk": "Apri Kick",
      "kickPip.subLinkedAlert": "Kick è collegato, ma il ruolo non è ancora assegnato.\n\nPer riceverlo: scrivi almeno un messaggio nella chat dello streamer su Kick (devi essere sub).\n\nIl solo link non assegna il ruolo.",
      "kickPip.subNeedLoginTitle": "Accesso richiesto",
      "kickPip.subNeedLogin": "Accedi con Discord (pulsante LOGIN in alto) e riprova SUB.",
      "kickPip.subErrorTitle": "Collegamento Kick",
      "kickPip.subError": "Non riesco ad aprire il collegamento Kick. Riprova.",
      "auth.login": "Login",
      "auth.loginDiscord": "Accedi con Discord",
      "auth.logout": "Logout",
      "auth.profile": "Vai al profilo",
      "auth.sessionChecking": "Verifica sessione…",
      "auth.dashboard": "Dashboard",
      "auth.dashboardBlacklisted": "Blacklistato",
      "auth.staffArea": "Area Staff",
      "auth.accountMenu": "Menu account",
      "notif.aria": "Notifiche",
      "notif.listAria": "Elenco notifiche",
      "notif.title": "Notifiche",
      "notif.unread": "{n} non lette",
      "notif.unreadZero": "0 non lette",
      "notif.markAll": "Segna tutte come lette",
      "notif.clearAll": "Elimina tutte",
      "notif.emptyTitle": "Nessuna notifica",
      "notif.emptySub": "Sei tutto aggiornato!",
      "notif.seeAll": "Vedi tutte le notifiche",
      "notif.loginOk": "Login effettuato con successo!",
      "notif.itemTitle": "Notifica",
      "notif.tabUnreadOne": "(1 notifica) ",
      "notif.tabUnreadMany": "({n} notifiche) ",
      "notif.unreadDot": "Non letta",
      "notif.close": "Chiudi",
      "notif.justNow": "Ora",
      "notif.minuteAgo": "1 minuto fa",
      "notif.minutesAgo": "{n} minuti fa",
      "notif.hourAgo": "1 ora fa",
      "notif.hoursAgo": "{n} ore fa",
      "notif.dayAgo": "1 giorno fa",
      "notif.daysAgo": "{n} giorni fa",
      "notif.weekPlusAgo": "Più di una settimana fa",
      "footer.aria": "Footer",
      "footer.desc":
        "Community italiana Discord curata nei dettagli: musica, socialità, ruoli personalizzati, eventi e strumenti sviluppati su misura.",
      "footer.dashboardDesc":
        "Da qui configuri Vinili sui tuoi server: identità e prefisso, accesso alla dashboard, partnership, avvisi e le altre impostazioni del bot.",
      "footer.community": "Community",
      "footer.discover": "Esplora",
      "footer.support": "Supporto",
      "footer.requests": "Richieste",
      "footer.dashboard": "Dashboard",
      "footer.resources": "Risorse",
      "footer.legal": "Legale",
      "footer.legalLinks": "Link legali",
      "footer.home": "Home",
      "footer.users": "Users",
      "footer.roles": "Ruoli",
      "footer.wiki": "Wiki",
      "footer.rules": "Regole",
      "footer.faq": "FAQ",
      "footer.sponsor": "Sponsor",
      "footer.perks": "Perks",
      "footer.vote": "Vota",
      "footer.reviews": "Recensioni",
      "footer.botReviews": "Recensioni",
      "footer.donations": "Donazioni",
      "footer.applications": "Candidature",
      "footer.unban": "Unban",
      "footer.suggestions": "Feedback",
      "footer.tickets": "Tickets",
      "footer.feedback": "Feedback",
      "footer.yourServers": "I tuoi server",
      "footer.profile": "Profilo",
      "footer.premium": "Premium",
      "footer.status": "Status",
      "footer.site": "Sito",
      "footer.terms": "Termini di Servizio",
      "footer.privacy": "Privacy Policy",
      "footer.cookies": "Cookie Policy",
      "footer.yourData": "I tuoi dati",
      "footer.social": "Social",
      "home.welcome": "Benvenut* su",
      "home.welcomeM": "Benvenuto su",
      "home.welcomeF": "Benvenuta su",
      "home.scrollMore": "Scorri per continuare",
      "home.joinDiscord": "Entra su Discord",
      "home.exploreCommunity": "Esplora la Community",
      "home.discoverPerks": "Scopri i Perks",
      "home.liveEvent": "Evento Discord in corso",
      "home.liveBadge": "Evento live su Discord",
      "home.liveTitle": "Evento in corso",
      "home.participate": "Partecipa",
      "home.hGrowth": "In Crescita Costante",
      "home.hGrowthDesc": "Espansione continua con pubblico italiano giovane e coinvolto",
      "home.hEvents": "Eventi & Giveaway",
      "home.hEventsDesc": "Eventi e giveaway frequenti per la nostra community",
      "home.hBots": "Bot Personalizzati",
      "home.hBotsDesc": "Bot personalizzati, moderazione avanzata e funzioni esclusive",
      "home.resources": "Risorse",
      "home.wikiStrong": "Wiki",
      "home.wikiSmall": "Guide e documentazione",
      "home.sponsorStrong": "Sponsor",
      "home.sponsorSmall": "Tipologie, durate e prezzi",
      "home.community": "Community",
      "home.usersStrong": "Users",
      "home.usersSmall": "Membri della community",
      "home.rolesStrong": "Ruoli",
      "home.rolesSmall": "Sistema dei ruoli",
      "home.support": "Supporta",
      "home.votesStrong": "Voti",
      "home.votesSmall": "Vota e ottieni ricompense",
      "home.reviewsStrong": "Recensioni",
      "home.reviewsSmall": "Leggi e lascia feedback",
      "home.donationsStrong": "Donazioni",
      "home.donationsSmall": "Supporta il progetto",
      "home.info": "Info",
      "home.rulesStrong": "Regole",
      "home.rulesSmall": "Linee guida della community",
      "home.rulesSmallAlt": "Regolamento del server",
      "home.faqStrong": "FAQ",
      "home.faqSmall": "Domande frequenti",
      "home.perksStrong": "Perks",
      "home.perksSmall": "Benefici e vantaggi supporto",
      "home.requests": "Richieste",
      "home.appsStrong": "Candidature",
      "home.appsSmall": "Unisciti allo staff",
      "home.appsSmallAlt": "Entra nel nostro staff",
      "home.unbanStrong": "Unban",
      "home.unbanSmall": "Richiedi un unban",
      "home.unbanSmallAlt": "Richiedi un appello",
      "home.suggestionsStrong": "Feedback",
      "home.suggestionsSmall": "Idee e problemi",
      "home.suggestionsSmallAlt": "Idee e segnalazioni per la community",
      "home.statMembers": "Membri",
      "home.statBoosts": "Boost",
      "home.statStaff": "Staff",
      "home.statCommunity": "Community",
      "home.about":
        "Vinili & Caffè nasce per unire tutti gli utenti in una community molto chill in cui si può parlare di tutto. Qui troverete un sacco di ruoli, canali, funzioni, bot, tutto ciò che una persona può desiderare.",
      "dash.gateTitle": "Accedi per continuare",
      "dash.gateBody": "Per usare la dashboard accedi con Discord.",
      "dash.gateNeed": "Se non riesci ad entrare, prova ad accedere di nuovo con Discord.",
      "dash.gateLogin": "Accedi con Discord",
      "dash.backHome": "Torna alla Home",
      "dash.lockedTitle": "Non disponibile",
      "dash.lockedBody": "Questa sezione non è disponibile con il tuo account.",
      "dash.status": "Status",
      "dash.botKicker": "Dashboard bot",
      "dash.heroTitleBefore": "I tuoi ",
      "dash.heroTitleAccent": "server",
      "dash.heroBody": "Gestisci configurazione e moduli per ogni server.",
      "dash.canDo": "Aree",
      "dash.canDo1": "Configurazione",
      "dash.canDo2": "Moduli",
      "dash.canDo3": "Installazione",
      "dash.scopeNeed": "Serve un nuovo login.",
      "dash.scopeBody": "Per mostrare i tuoi server serve un nuovo accesso con Discord.",
      "dash.scopeRelogin": "Accedi di nuovo con Discord",
      "dash.loading": "Caricamento",
      "dash.loadingServers": "Sto recuperando i tuoi server…",
      "dash.emptyTitle": "Nessun server trovato",
      "dash.emptyBody": "Non abbiamo trovato server disponibili, oppure Vinili non è ancora presente.",
      "dash.badgeMain": "Server principale",
      "dash.badgeProtected": "Vinili",
      "dash.badgeActive": "Bot attivo",
      "dash.badgeInvite": "Invita il bot",
      "dash.badgePremium": "Premium",
      "dash.badgePremiumTitle": "Vinili Premium attivo",
      "dash.metaMain": "Gestione community Vinili & Caffè",
      "dash.metaProtected": "Apri impostazioni",
      "dash.metaOpen": "Apri impostazioni",
      "dash.metaMissing": "Vinili non è ancora in questo server",
      "dash.metaUnavailable": "Alcune funzioni non sono disponibili su questo server",
      "dash.calloutBotMissingHtml": "<strong>Vinili non è ancora in questo server.</strong> Invitalo per iniziare la configurazione.",
      "dash.calloutMainHtml": "<strong>Server principale.</strong> Le impostazioni di questo server non si gestiscono da qui.",
      "dash.calloutSetupIncompleteHtml": "<strong>Configurazione incompleta.</strong> Apri <em>Partnership</em> dalla sidebar e completa i passaggi iniziali.",
      "dash.errorShort": "Errore",
      "dash.serverFallback": "Server",
      "dash.footerTag": "Dashboard Vinili.",
      "dash.backServers": "Server",
      "dashFaq.kicker": "Guida dashboard",
      "dashFaq.title": "FAQ",
      "dashFaq.lead": "Tutto quello che serve per usare Vinili dalla dashboard: accesso, impostazioni, comandi, partnership, punti, Premium e risoluzione problemi.",
      "dashFaq.elsewhere": "Altrove",
      "dashFaq.elsewhereBody": "Hai un’idea o un bug? Usa",
      "dashFaq.catsAria": "Categorie FAQ dashboard",
      "dashPremium.kicker": "Premium",
      "dashPremium.heroTitleBefore": "Vinili",
      "dashPremium.heroTitleAccent": "Premium",
      "dashPremium.heroLead": "Usa i crediti per attivare Premium sul server che vuoi, quando vuoi.",
      "dashPremium.heroAria": "Aree Premium",
      "dashPremium.pillarIdentity": "Branding",
      "dashPremium.pillarEmbed": "Messaggi",
      "dashPremium.pillarGuild": "Ambito server",
      "dashPremium.plansAria": "Piani Premium",
      "dashPremium.badge": "Novità",
      "dashPremium.planName": "Personalizzazione",
      "dashPremium.priceAria": "{price} euro per {months} mesi",
      "dashPremium.priceAriaOne": "{price} euro per 1 mese",
      "dashPremium.perMonth": "/mese",
      "dashPremium.plusVat": "+ IVA",
      "dashPremium.durationAria": "Scegli durata Premium",
      "dashPremium.duration1Aria": "1 mese",
      "dashPremium.duration3Aria": "3 mesi",
      "dashPremium.duration6Aria": "6 mesi",
      "dashPremium.duration12Aria": "12 mesi",
      "dashPremium.monthShort": "mese",
      "dashPremium.monthsShort": "mesi",
      "dashPremium.bestValue": "Miglior prezzo",
      "dashPremium.creditsAria": "{credits} crediti per {months} mesi",
      "dashPremium.creditsAriaOne": "{credits} crediti per 1 mese",
      "dashPremium.creditsCtaAria": "Attiva Premium con crediti",
      "dashPremium.guildLabel": "Server",
      "dashPremium.pickGuild": "Scegli un server…",
      "dashPremium.buyCredits": "Compra crediti",
      "dashPremium.balance": "Saldo: {credits} crediti",
      "dashPremium.needLogin": "Accedi con Discord per attivare Premium con i crediti.",
      "dashPremium.noGuilds": "Nessun server gestibile trovato. Accedi e invita il bot.",
      "dashPremium.pickGuildFirst": "Seleziona un server.",
      "dashPremium.insufficient": "Crediti insufficienti. Compra un pacchetto e riprova.",
      "dashPremium.activating": "Attivazione in corso…",
      "dashPremium.activated": "Premium attivato sul server selezionato.",
      "dashPremium.errLoad": "Impossibile caricare server e crediti.",
      "dashPremium.errLoadGuilds": "Impossibile caricare i server. Riprova tra poco.",
      "dashPremium.errUpstream": "Servizio temporaneamente non disponibile. Riprova.",
      "dashPremium.errSpend": "Attivazione non riuscita.",
      "dashPremium.errProtected": "Attivazione non riuscita per questo server.",
      "dashPremium.noTenantGuilds": "Nessun server gestibile trovato. Accedi e invita il bot.",
      "dashPremium.noGuilds": "Nessun server gestibile trovato. Accedi e invita il bot.",
      "dashPremium.perkAvatar": "Avatar",
      "dashPremium.perkBanner": "Banner",
      "dashPremium.perkName": "Nome",
      "dashPremium.perkEmbed": "Messaggi personalizzati",
      "dashPremium.perkQuote": "Quote personalizzate",
      "dashPremium.soonCommunityName": "Community",
      "dashPremium.soonCommunityPerk1": "Tutto di Personalizzazione",
      "dashPremium.soonCommunityPerk2": "Moduli moderazione avanzati",
      "dashPremium.soonCommunityPerk3": "Statistiche e report settimanali",
      "dashPremium.soonCommunityPerk4": "Annunci e campagne community",
      "dashPremium.soonBusinessName": "Business",
      "dashPremium.soonBusinessPerk1": "Tutto di Community",
      "dashPremium.soonBusinessPerk2": "Gestione multi-server",
      "dashPremium.soonBusinessPerk3": "Supporto prioritario",
      "dashPremium.soonBusinessPerk4": "Automazioni e integrazioni",
      "dashPremium.soonCta": "IN ARRIVO",
      "dashCredits.aria": "Acquista crediti Premium",
      "dashCredits.title": "Acquista crediti Premium",
      "dashCredits.label": "crediti",
      "dashCreditsShop.kicker": "Crediti",
      "dashCreditsShop.heroTitleBefore": "Pacchetti",
      "dashCreditsShop.heroTitleAccent": "crediti",
      "dashCreditsShop.heroLead": "Scegli un pacchetto e paga con PayPal. Il pagamento non è automatico: apri prima un ticket nel server principale per la conferma, poi i crediti verranno accreditati.",
      "dashCreditsShop.ticketCta": "Apri ticket",
      "dashCreditsShop.ticketAria": "Apri la pagina ticket sul sito",
      "dashCreditsShop.backPremium": "Torna a Premium",
      "dashCreditsShop.packsAria": "Pacchetti crediti",
      "dashCreditsShop.badgePopular": "Più scelto",
      "dashCreditsShop.badgeCheap": "Più economico",
      "dashCreditsShop.badgeCombo": "In combo",
      "dashCreditsShop.pack20Name": "20 crediti",
      "dashCreditsShop.pack30Name": "30 crediti",
      "dashCreditsShop.pack40Name": "40 crediti",
      "dashCreditsShop.pack20Perk": "Ideale per 1 mese di Personalizzazione",
      "dashCreditsShop.pack30Perk": "Ideale per 2 mesi di Personalizzazione",
      "dashCreditsShop.pack40Perk": "Ideale per 3 mesi di Personalizzazione",
      "dashCreditsShop.buy": "ACQUISTA",
      "dashCreditsShop.buy20Aria": "Acquista 20 crediti a 3,35 euro",
      "dashCreditsShop.buy30Aria": "Acquista 30 crediti a 5,00 euro",
      "dashCreditsShop.buy40Aria": "Acquista 40 crediti a 6,67 euro",
      "dashSugg.kicker": "Idee e problemi",
      "dashSugg.heroBefore": "Idee e segnalazioni per ",
      "dashSugg.heroAccent": "Vinili",
      "dashSugg.lead": "Proponi miglioramenti per Vinili o segnala qualcosa che non funziona. Puoi allegare foto.",
      "dashSugg.how": "Come funziona",
      "dashSugg.how1": "Scegli se è un’idea o un problema, descrivilo e allega foto se serve.",
      "dashSugg.how2": "Vota e commenta le proposte ancora in valutazione.",
      "dashSugg.guidelines": "Nota",
      "dashSugg.guidelinesBody": "Qui si parla solo di Vinili. Per idee sulla community usa il Feedback del sito.",
      "dashSugg.sectionEyebrow": "Vinili",
      "dashSugg.sectionTitle": "Bacheca",
      "dashSugg.new": "Nuovo feedback",
      "dashSugg.gateTitle": "Accedi per continuare",
      "dashSugg.gateBody": "Collega Discord per proporre un’idea su Vinili o segnalare un problema.",
      "dashSugg.gateLogin": "Accedi con Discord",
      "dashSugg.backDash": "Torna alla Dashboard",
      "dash.errLoadServers": "Impossibile caricare i server.",
      "dash.errNetworkServers": "Errore di rete durante il caricamento dei server.",
      "dash.menuAria": "Menu server",
      "dash.overview": "Panoramica",
      "dash.partnership": "Partnership",
      "dash.channels": "Canali",
      "dash.roles": "Team",
      "dash.pings": "Ping",
      "dash.basics": "Generale",
      "dash.dataTools": "Dati",
      "dash.options": "Opzioni",
      "dash.description": "Descrizione",
      "dash.embed": "Embed",
      "dash.embedPremiumTitle": "Embed — Vinili Premium",
      "dash.premium.badge": "Premium",
      "dash.blacklist": "Blacklist",
      "dash.soonAria": "Funzioni in arrivo",
      "dash.soon": "SOON",
      "dash.switcherAria": "Cambia server",
      "dash.switcherAll": "Tutti i server",
      "dash.comingSoon": "in arrivo",
      "dash.moderation": "Moderazione",
      "dash.minigames": "Minigames",
      "dash.music": "Musica",
      "dash.tts": "TTS",
      "dash.economy": "Economy",
      "dash.stats": "Stats",
      "dash.classifiche": "Classifiche",
      "dash.classificheKicker": "Partnership",
      "dash.classificheIntro": "Classifiche partnership per server, Partner Manager e nuovi ingressi (totale, giorno o settimana).",
      "dash.classificheDesc": "Classifiche delle partnership: server, Partner Manager e nuovi ingressi.",
      "dash.classificheOpen": "Apri classifiche",
      "dash.lb.categoryAria": "Tipo classifica",
      "dash.lb.periodAria": "Periodo",
      "dash.lb.catServers": "Server",
      "dash.lb.catServersSub": "Partnership",
      "dash.lb.catPartners": "Partner Manager",
      "dash.lb.catPartnersSub": "Questo server",
      "dash.lb.catJoin": "Join",
      "dash.lb.catJoinSub": "Invite",
      "dash.lb.periodTotal": "Totale",
      "dash.lb.periodDaily": "Giornaliero",
      "dash.lb.periodWeekly": "Settimanale",
      "dash.lb.hintServers": "Server ordinati per numero di partnership completate.",
      "dash.lb.hintPartners": "Partner Manager di questo server, ordinati per attività.",
      "dash.lb.hintJoin": "Server ordinati per nuovi membri arrivati dalle partnership.",
      "dash.lb.loading": "Caricamento classifica…",
      "dash.lb.empty": "Nessun risultato per questa classifica.",
      "dash.lb.loadFailed": "Impossibile caricare la classifica.",
      "dash.lb.network": "Errore di rete durante il caricamento.",
      "dash.lb.meta": "{total} risultati · pagina {page}/{pages}",
      "dash.lb.yourRank": "La tua posizione",
      "dash.lb.prev": "Precedente",
      "dash.lb.next": "Successiva",
      "dash.lb.unitJoinOne": "1 join",
      "dash.lb.unitJoinMany": "{n} join",
      "dash.lb.unitPartnerOne": "1 partnership",
      "dash.lb.unitPartnerMany": "{n} partnership",
      "dash.utility": "Utility",
      "dash.other": "Altro",
      "dash.loadingGuild": "Configurazione del server…",
      "dash.configKicker": "Configurazione",
      "dash.configSub": "Impostazioni del bot",
      "dash.members": "Membri",
      "dash.online": "Online",
      "dash.inviteBot": "Invita Vinili",
      "dash.modules": "Moduli",
      "dash.modulesSub": "Moduli disponibili su questo server.",
      "dash.active": "Attivo",
      "dash.inactive": "Disattivo",
      "dash.settings": "Impostazioni",
      "dash.cmds.title": "Comandi",
      "dash.cmds.kicker": "Server",
      "dash.cmds.intro": "Stato dei comandi e limiti per ruolo o canale. Gli slash si sincronizzano con Discord; i prefix partnership senza regole proprie ereditano /partnership.",
      "dash.cmds.permHint": "Consentiti e ignorati sono alternativi: se imposti gli uni, gli altri vengono azzerati.",
      "dash.cmds.allowedChannels": "Canali consentiti",
      "dash.cmds.ignoredChannels": "Canali ignorati",
      "dash.cmds.allowedRoles": "Ruoli consentiti",
      "dash.cmds.ignoredRoles": "Ruoli ignorati",
      "dash.cmds.selectChannel": "Seleziona canale",
      "dash.cmds.selectRole": "Seleziona ruolo",
      "dash.cmds.uncategorized": "Senza categoria",
      "dash.cmds.selectCategory": "Seleziona tutta la categoria",
      "dash.cmds.categoryChip": "Categoria: {name}",
      "dash.cmds.noOptions": "Nessuna opzione disponibile.",
      "dash.cmds.tabAll": "Tutte",
      "dash.cmds.settings": "Impostazioni",
      "dash.cmds.categorySettings": "Canali e ruoli per tutti",
      "dash.cmds.categoryToggle": "Attiva / disattiva tutti i comandi",
      "dash.cmds.help": "Aiuto",
      "dash.cmds.toggle": "Attiva / disattiva",
      "dash.cmds.helpTitle": "Comando: {cmd}",
      "dash.cmds.settingsTitle": "Permessi aggiuntivi ({cmd})",
      "dash.cmds.categorySettingsTitle": "Permessi per tutti i comandi ({cat})",
      "dash.cmds.categoryPermHint": "Le stesse regole di canali e ruoli verranno applicate a tutti i comandi di questa sezione. Per azzerarle, rimuovi i chip e salva.",
      "dash.cmds.categoryPermHintMixed": "I comandi di questa sezione hanno permessi diversi. Imposta qui le regole comuni da applicare a tutti: Salva senza selezioni non cancella quelle già presenti.",
      "dash.cmds.noChanges": "Nessuna modifica ai permessi.",
      "dash.cmds.cooldown": "Tempo di attesa",
      "dash.cmds.cooldownSeconds": "{n} secondi",
      "dash.cmds.cooldownNone": "Nessuno",
      "dash.cmds.description": "Descrizione",
      "dash.cmds.usage": "Utilizzo",
      "dash.cmds.example": "Esempio",
      "dash.cmds.aliases": "Alias",
      "dash.cmds.noDescription": "Nessuna descrizione disponibile.",
      "dash.cmds.emptyCatalog": "Nessun comando disponibile per questo server.",
      "dash.cmds.loading": "Caricamento comandi…",
      "dash.cmds.loadFailed": "Impossibile caricare i comandi.",
      "dash.cmds.saveFailed": "Salvataggio comandi non riuscito.",
      "dash.cmds.saved": "Impostazioni comando salvate.",
      "dash.cmds.saving": "Salvataggio impostazioni…",
      "dash.cmds.network": "Errore di rete durante il caricamento.",
      "dash.cmds.slash": "Slash",
      "dash.cmds.prefix": "Prefix",
      "dash.cmds.prefixLockedMain": "Sul server principale i prefix non si configurano da qui.",
      "dash.cmds.slashType": "Tipo",
      "dash.cmds.slashHelpNote": "I permessi di canali e ruoli di questo comando vengono scritti sull’integrazione Discord del server.",
      "dash.cmds.scopeTitle": "Permesso Discord richiesto",
      "dash.cmds.scopeBody": "Per sincronizzare i permessi slash serve un nuovo login Discord dalla dashboard.",
      "dash.cmds.scopeRelogin": "Esci e autorizza di nuovo (consenti aggiornamento comandi)",
      "dash.cmds.discordTitle": "Permessi comandi slash",
      "dash.cmds.discordBody": "Ruoli e canali degli slash si impostano sull’integrazione Discord del bot, come da Impostazioni server → Integrazioni.",
      "dash.cmds.openDiscord": "Apri integrazioni Discord",
      "dash.cmds.openDiscordWeb": "Apri nel browser",
      "dash.cmds.manageDiscord": "Gestisci su Discord",
      "dash.alwaysOn": "Sempre attivo",
      "dash.psModuleDesc": "Partnership, avvisi, descrizione e messaggio di ringraziamento.",
      "dash.modDesc": "Moderazione e sicurezza.",
      "dash.minigamesDesc": "Giochi e attività interattive.",
      "dash.musicDesc": "Musica nelle stanze vocali.",
      "dash.ttsDesc": "Lettura vocale dei messaggi nelle stanze vocali.",
      "dash.economyDesc": "Economia, negozio e ricompense.",
      "dash.statsDesc": "Statistiche e classifiche del server.",
      "dash.utilityDesc": "Utility.",
      "dash.otherDesc": "Altri moduli (in arrivo).",
      "dash.save": "Salva",
      "dash.selectChannel": "Seleziona canale",
      "dash.selectRole": "Seleziona",
      "dash.none": "— Nessuno —",
      "dash.selectChannelOpt": "— Seleziona canale —",
      "dash.selectRoleOpt": "— Seleziona —",
      "dash.noChanges": "Nessuna modifica da salvare",
      "dash.saved": "Configurazione salvata.",
      "dash.setupDone": "Setup completato.",
      "dash.setupIncomplete": "Configurazione incompleta. Imposta almeno il canale partnership, chi gestisce le partnership e la descrizione.",
      "faq.kicker": "Supporto",
      "faq.lead": "Risposte rapide su livelli, vocali, giochi ed eventi.",
      "faq.how": "Come usarla",
      "faq.how1": "Scegli una categoria con le linguette qui sotto.",
      "faq.how2": "Se ci sono più domande, scegli con lo switcher sotto e leggi la risposta.",
      "faq.subAria": "Domande",
      "faq.elsewhere": "Altrove sul sito",
      "faq.elsewhereBody": "Comandi dei nostri bot: Wiki. Perks di tutti i ruoli: Perks.",
      "faq.elsewhereCommands": "Comandi dei nostri bot:",
      "faq.elsewherePerks": "Perks di tutti i ruoli:",
      "faq.catsAria": "Categorie FAQ",
      "faq.empty": "Nessuna domanda in questa categoria.",
      "faq.answer": "RISPOSTA",
      "faq.cat.livelli": "Livelli",
      "faq.cat.voce": "Musica",
      "faq.cat.giochi": "Giochi",
      "faq.cat.eventi": "Eventi",
      "faq.cat.staff": "Staff",
      "faq.tag.livelli": "Livelli",
      "faq.tag.voce": "Voce",
      "faq.tag.giochi": "Giochi",
      "faq.tag.eventi": "Eventi",
      "faq.tag.staff": "Staff",
      "faq.q1.title": "Come posso accumulare punti EXP?",
      "faq.q1.body": "Ogni messaggio in chat e il tempo passato nelle vocali fanno salire l’EXP (in vocale l'esperienza guadagnata è il doppio). Su PERKS trovi cosa si sblocca con i vari livelli mentre le classifiche sono visibili in COMMUNITY.",
      "faq.q2.title": "Come posso partecipare ai minigames?",
      "faq.q2.body": "Ogni 15 minuti, dalle 8 di mattina fino alle 23:59, potrai divertiti con piccoli giochi in chat che il nostro bot invierà. Non sono obbligatori ma se vuoi divertirti in compagnia concorrendo con gli altri utenti e guadagnare EXP aggiuntiva, questo è quello che fa per te!",
      "faq.q3.title": "È possibile ascoltare musica insieme agli altri?",
      "faq.q3.body": "Certamente! Nelle stanze vocali puoi stare in ascolto o condividere quello che ti piace, rispettando volume e regolamento (niente earrape, niente robe che disturbino), con tramite i nostri bot ufficiali! Se vuoi scoprire tutti i comandi, corri in WIKI.",
      "faq.q4.title": "Quali giochi sono disponibili?",
      "faq.q4.body": "Ci sono molti canali come Pokétwo, Counting, Ship nei rispettivi canali oltre i minigames in chat col bot. Non tutti i giochi sono per tutti i gusti: se uno non ti piace, passa oltre.",
      "faq.q5.title": "Come funzionano gli eventi stagionali?",
      "faq.q5.body": "Durante la tua permanenza nel server, potrai partecipare a delle vere e proprie SEASON dalla durata di circa 3 mesi. Ognuno di questi periodi propone un tema principale attorno al quale si terranno numerosi eventi, contest e sfide così belli da tenerti incollato allo schermo!",
      "faq.q6.title": "Come posso avere più possibilità di vincere gli eventi?",
      "faq.q6.body": "Segui alla lettera le istruzioni dell’evento perché sicuramente ci saranno scritti tutti i modi per poterti avvantaggiare. In linea generale, essere attivo in vocale e in testuale aiuta molto. Se vuoi dei bonus, solitamente votando il server e boostandolo riceverai i vantaggi elencati in VOTA e PERKS. Non esiste una scorciatoia unica: i premi vanno a chi partecipa con costanza ed entusiasmo!",
      "faq.q7.title": "Cosa significa \"staff pagato\"?",
      "faq.q7.body": "Ogni mese verrà premiato il migliore tra tutto lo Staff a cui verrà regalato Nitro Boost per un mese. I Partner Manager, invece, vengono premiati con un Nitro Boost e premi in denaro in base al proprio operato.",
      "faq.q8.title": "Posso diventare un membro dello staff?",
      "faq.q8.body": "Ovviamente! Siamo sempre alla ricerca di nuove figure da inserire nella nostra grande famiglia. Dopo aver letto bene regole, puoi inviare la tua candidatura tramite il modulo che trovi in questa pagina. Ricorda: serietà e costanza sono fondamentali! Se la tua candidatura è accompagnata da esperienza, non esitare a renderlo noto! Dopo l’invio è importante non taggare i membri dello staff o aprire ticket per chiedere l'esito della tua candidatura.",
      "rules.kicker": "Community & moderazione",
      "rules.titleBefore": "Regole di ",
      "rules.lead": "Linee guida e sanzioni per mantenere il server sicuro, chiaro e piacevole per tutti.",
      "rules.disclaimer": "Lo staff si riserva il diritto di cambiare sanzioni e regole in base alla situazione.",
      "rules.how": "Come usarle",
      "rules.how1": "Scegli una categoria qui sotto per filtrare le regole.",
      "rules.how2": "Se ci sono più regole, scegli col secondo switcher e leggi il testo completo.",
      "rules.subAria": "Regole",
      "rules.sanctions": "Sanzioni",
      "rules.sanctionsBody": "Il grado della sanzione dipende dalla gravità e dalla recidiva. In caso di dubbi, chiedi chiarimenti allo staff senza contestare in pubblico.",
      "rules.catsAria": "Categorie regole",
      "rules.empty": "Nessuna regola in questa categoria.",
      "rules.description": "DESCRIZIONE",
      "rules.loading": "Caricamento regole…",
      "rules.errApi": "API regole non configurata.",
      "rules.errLoad": "Impossibile caricare le regole dal bot.",
      "rules.errNetwork": "Errore di rete nel caricamento delle regole.",
      "lang.it": "Italiano",
      "lang.en": "English",
      "lang.es": "Español",
      "lang.fr": "Français",
      "lang.de": "Deutsch",
      "lang.pt": "Português",
      "lang.ru": "Русский",
      "lang.zh": "中文",
      "lang.ja": "日本語",
      "lang.ko": "한국어",
      "lang.ar": "العربية",
      "lang.nl": "Nederlands",
      "lang.pl": "Polski",
      "lang.tr": "Türkçe",
      "lang.hi": "हिन्दी",
      "lang.id": "Indonesia",
      "lang.uk": "Українська",
      "lang.vi": "Tiếng Việt",
      "lang.ro": "Română",
      "lang.sv": "Svenska",
    },
    en: {
      "nav.language": "Language",
      "nav.languageList": "Choose language",
      "nav.quickLinks": "Quick links",
      "nav.wiki": "Wiki",
      "nav.sponsor": "Sponsors",
      "nav.support": "Support",
      "nav.voteServer": "Vote for the server",
      "nav.reviews": "Reviews",
      "nav.botReviews": "Bot reviews",
      "nav.donations": "Donations",
      "nav.perks": "Perks",
      "nav.community": "Community",
      "nav.users": "Users",
      "nav.roles": "Roles",
      "nav.rules": "Rules",
      "nav.faq": "FAQ",
      "nav.requests": "Requests",
      "nav.unban": "Unban",
      "nav.applications": "Applications",
      "nav.suggestions": "Feedback",
      "nav.tickets": "Tickets",
      "nav.status": "Status",
      "nav.premium": "Premium",
      "nav.homeAria": "Go to homepage",
      "nav.discordAria": "Join Discord",
      "header.promo.eventLabel": "Event",
      "header.promo.appsLabel": "Applications",
      "header.promo.appsLabelShort": "CAND.",
      "header.promo.eventBadge": "event live",
      "header.promo.eventBadgeShort": "LIVE",
      "header.promo.appsBadge": "OPEN",
      "header.promo.appsBadgeLong": "applications open",
      "header.promo.eventAria": "Hogwarts event active – go to the calendar",
      "header.promo.appsAria": "Staff applications open",
      "kickPip.aria": "Kick live preview",
      "kickPip.hide": "Hide live preview",
      "kickPip.reopenAria": "Show Kick live preview",
      "kickPip.reopen": "Kick live",
      "kickPip.open": "Open Kick live",
      "kickPip.playerTitle": "Kick live player",
      "kickPip.drag": "Drag preview",
      "kickPip.float": "Open Picture-in-Picture",
      "kickPip.floatClose": "Close Picture-in-Picture",
      "kickPip.unmute": "Unmute",
      "kickPip.mute": "Mute",
      "kickPip.play": "Play preview",
      "kickPip.limitTitle": "Preview ended",
      "kickPip.limitText": "You've reached the 10-minute preview. Continue on Kick.",
      "kickPip.limitCta": "Open on Kick",
      "kickPip.defaultTitle": "Live now",
      "kickPip.defaultVodTitle": "Latest VOD",
      "kickPip.viewers": "viewers",
      "kickPip.views": "views",
      "kickPip.badgeVod": "VOD",
      "kickPip.openVod": "Open VOD on Kick",
      "kickPip.reopenVod": "Kick VOD",
      "kickPip.reopenVodAria": "Show latest Kick VOD",
      "kickPip.sub": "Link Kick Sub",
      "kickPip.subLogin": "LOGIN",
      "kickPip.subLoginHint": "Sign in with Discord to link Kick Sub",
      "kickPip.subActive": "SUB ✓",
      "kickPip.subActiveHint": "Sub active — Discord role synced",
      "kickPip.subLinked": "LINK",
      "kickPip.subLinkedHint": "Kick linked — for the role, send a message in the streamer's Kick chat",
      "kickPip.alertTitle": "Kick Sub",
      "kickPip.alertOk": "OK",
      "kickPip.subLinkedTitle": "Almost there",
      "kickPip.subLinkedOk": "Open Kick",
      "kickPip.subLinkedAlert": "Kick is linked, but the role is not assigned yet.\n\nTo get it: send at least one message in the streamer's Kick chat (you must be a sub).\n\nLinking alone does not grant the role.",
      "kickPip.subNeedLoginTitle": "Sign in required",
      "kickPip.subNeedLogin": "Sign in with Discord (LOGIN button) then tap SUB again.",
      "kickPip.subErrorTitle": "Kick linking",
      "kickPip.subError": "Can't open Kick linking right now. Try again.",
      "auth.login": "Login",
      "auth.loginDiscord": "Sign in with Discord",
      "auth.logout": "Logout",
      "auth.profile": "View profile",
      "auth.sessionChecking": "Checking session…",
      "auth.dashboard": "Dashboard",
      "auth.dashboardBlacklisted": "Blacklisted",
      "auth.staffArea": "Staff area",
      "auth.accountMenu": "Account menu",
      "notif.aria": "Notifications",
      "notif.listAria": "Notification list",
      "notif.title": "Notifications",
      "notif.unread": "{n} unread",
      "notif.unreadZero": "0 unread",
      "notif.markAll": "Mark all as read",
      "notif.clearAll": "Clear all",
      "notif.emptyTitle": "No notifications",
      "notif.emptySub": "You're all caught up!",
      "notif.seeAll": "See all notifications",
      "notif.loginOk": "Signed in successfully!",
      "notif.itemTitle": "Notification",
      "notif.tabUnreadOne": "(1 notification) ",
      "notif.tabUnreadMany": "({n} notifications) ",
      "notif.unreadDot": "Unread",
      "notif.close": "Close",
      "notif.justNow": "Just now",
      "notif.minuteAgo": "1 minute ago",
      "notif.minutesAgo": "{n} minutes ago",
      "notif.hourAgo": "1 hour ago",
      "notif.hoursAgo": "{n} hours ago",
      "notif.dayAgo": "1 day ago",
      "notif.daysAgo": "{n} days ago",
      "notif.weekPlusAgo": "More than a week ago",
      "footer.aria": "Footer",
      "footer.desc":
        "An Italian Discord community crafted in detail: music, social features, custom roles, events, and tools built around the server.",
      "footer.dashboardDesc":
        "Configure Vinili on your servers from here: identity and prefix, dashboard access, partnerships, alerts, and the rest of the bot settings.",
      "footer.community": "Community",
      "footer.discover": "Explore",
      "footer.support": "Support",
      "footer.requests": "Requests",
      "footer.dashboard": "Dashboard",
      "footer.resources": "Resources",
      "footer.legal": "Legal",
      "footer.legalLinks": "Legal links",
      "footer.home": "Home",
      "footer.users": "Users",
      "footer.roles": "Roles",
      "footer.wiki": "Wiki",
      "footer.rules": "Rules",
      "footer.faq": "FAQ",
      "footer.sponsor": "Sponsors",
      "footer.perks": "Perks",
      "footer.vote": "Vote",
      "footer.reviews": "Reviews",
      "footer.botReviews": "Bot reviews",
      "footer.donations": "Donations",
      "footer.applications": "Applications",
      "footer.unban": "Unban",
      "footer.suggestions": "Feedback",
      "footer.tickets": "Tickets",
      "footer.feedback": "Feedback",
      "footer.yourServers": "Your servers",
      "footer.profile": "Profile",
      "footer.premium": "Premium",
      "footer.status": "Status",
      "footer.site": "Website",
      "footer.terms": "Terms of Service",
      "footer.privacy": "Privacy Policy",
      "footer.cookies": "Cookie Policy",
      "footer.yourData": "Your data",
      "footer.social": "Social",
      "home.welcome": "Welcome to",
      "home.welcomeM": "Welcome to",
      "home.welcomeF": "Welcome to",
      "home.scrollMore": "Scroll to keep reading",
      "home.joinDiscord": "Join Discord",
      "home.exploreCommunity": "Explore the Community",
      "home.discoverPerks": "Discover Perks",
      "home.liveEvent": "Live Discord event",
      "home.liveBadge": "Live event on Discord",
      "home.liveTitle": "Event in progress",
      "home.participate": "Join",
      "home.hGrowth": "Constantly Growing",
      "home.hGrowthDesc": "Steady growth with a young, engaged Italian audience",
      "home.hEvents": "Events & Giveaways",
      "home.hEventsDesc": "Frequent events and giveaways for our community",
      "home.hBots": "Custom Bots",
      "home.hBotsDesc": "Custom bots, advanced moderation, and exclusive features",
      "home.resources": "Resources",
      "home.wikiStrong": "Wiki",
      "home.wikiSmall": "Guides and documentation",
      "home.sponsorStrong": "Sponsors",
      "home.sponsorSmall": "Types, duration, and pricing",
      "home.community": "Community",
      "home.usersStrong": "Users",
      "home.usersSmall": "Community members",
      "home.rolesStrong": "Roles",
      "home.rolesSmall": "Role system",
      "home.support": "Support",
      "home.votesStrong": "Votes",
      "home.votesSmall": "Vote and earn rewards",
      "home.reviewsStrong": "Reviews",
      "home.reviewsSmall": "Read and leave feedback",
      "home.donationsStrong": "Donations",
      "home.donationsSmall": "Support the project",
      "home.info": "Info",
      "home.rulesStrong": "Rules",
      "home.rulesSmall": "Community guidelines",
      "home.rulesSmallAlt": "Server rules",
      "home.faqStrong": "FAQ",
      "home.faqSmall": "Frequently asked questions",
      "home.perksStrong": "Perks",
      "home.perksSmall": "Support benefits and perks",
      "home.requests": "Requests",
      "home.appsStrong": "Applications",
      "home.appsSmall": "Join the staff",
      "home.appsSmallAlt": "Join our staff",
      "home.unbanStrong": "Unban",
      "home.unbanSmall": "Request an unban",
      "home.unbanSmallAlt": "Request an appeal",
      "home.suggestionsStrong": "Feedback",
      "home.suggestionsSmall": "Ideas and bugs",
      "home.suggestionsSmallAlt": "Ideas and reports for the community",
      "home.statMembers": "Members",
      "home.statBoosts": "Boosts",
      "home.statStaff": "Staff",
      "home.statCommunity": "Community",
      "home.about":
        "Vinili & Caffè was created to bring everyone together in a chill community where you can talk about anything. Here you'll find plenty of roles, channels, features, and bots — everything you could want.",
      "dash.gateTitle": "Sign in to continue",
      "dash.gateBody": "Sign in with Discord to use the dashboard.",
      "dash.gateNeed": "If you cannot get in, try signing in with Discord again.",
      "dash.gateLogin": "Sign in with Discord",
      "dash.backHome": "Back to Home",
      "dash.lockedTitle": "Unavailable",
      "dash.lockedBody": "This section is not available with your account.",
      "dash.status": "Status",
      "dash.botKicker": "Bot dashboard",
      "dash.heroTitleBefore": "Your ",
      "dash.heroTitleAccent": "servers",
      "dash.heroBody": "Manage configuration and modules for each server.",
      "dash.canDo": "Areas",
      "dash.canDo1": "Configuration",
      "dash.canDo2": "Modules",
      "dash.canDo3": "Installation",
      "dash.scopeNeed": "A new login is required.",
      "dash.scopeBody": "A new Discord sign-in is required to list your servers.",
      "dash.scopeRelogin": "Sign in again with Discord",
      "dash.loading": "Loading",
      "dash.loadingServers": "Fetching your servers…",
      "dash.emptyTitle": "No servers found",
      "dash.emptyBody": "We could not find available servers, or Vinili is not present yet.",
      "dash.badgeMain": "Main server",
      "dash.badgeProtected": "Vinili",
      "dash.badgeActive": "Bot active",
      "dash.badgeInvite": "Invite the bot",
      "dash.badgePremium": "Premium",
      "dash.badgePremiumTitle": "Vinili Premium active",
      "dash.metaMain": "Vinili & Caffè community management",
      "dash.metaProtected": "Open settings",
      "dash.metaOpen": "Open settings",
      "dash.metaMissing": "Vinili is not on this server yet",
      "dash.metaUnavailable": "Some features are not available on this server",
      "dash.calloutBotMissingHtml": "<strong>Vinili is not on this server yet.</strong> Invite it to start setup.",
      "dash.calloutMainHtml": "<strong>Main server.</strong> Settings for this server are not managed here.",
      "dash.calloutSetupIncompleteHtml": "<strong>Setup incomplete.</strong> Open <em>Partnership</em> from the sidebar and finish the first steps.",
      "dash.errorShort": "Error",
      "dash.serverFallback": "Server",
      "dash.footerTag": "Vinili dashboard.",
      "dash.backServers": "Servers",
      "dashFaq.kicker": "Dashboard guide",
      "dashFaq.title": "FAQ",
      "dashFaq.lead": "Everything you need to run Vinili from the dashboard: access, settings, commands, partnerships, points, Premium, and troubleshooting.",
      "dashFaq.elsewhere": "Elsewhere",
      "dashFaq.elsewhereBody": "Got an idea or a bug? Use",
      "dashFaq.catsAria": "Dashboard FAQ categories",
      "dashPremium.kicker": "Premium",
      "dashPremium.heroTitleBefore": "Vinili",
      "dashPremium.heroTitleAccent": "Premium",
      "dashPremium.heroLead": "Use credits to activate Premium on any server you manage, when you want.",
      "dashPremium.heroAria": "Premium areas",
      "dashPremium.pillarIdentity": "Branding",
      "dashPremium.pillarEmbed": "Messages",
      "dashPremium.pillarGuild": "Server scope",
      "dashPremium.plansAria": "Premium plans",
      "dashPremium.badge": "New",
      "dashPremium.planName": "Customization",
      "dashPremium.priceAria": "{price} euros for {months} months",
      "dashPremium.priceAriaOne": "{price} euros for 1 month",
      "dashPremium.perMonth": "/month",
      "dashPremium.plusVat": "+ VAT",
      "dashPremium.durationAria": "Choose Premium duration",
      "dashPremium.duration1Aria": "1 month",
      "dashPremium.duration3Aria": "3 months",
      "dashPremium.duration6Aria": "6 months",
      "dashPremium.duration12Aria": "12 months",
      "dashPremium.monthShort": "month",
      "dashPremium.monthsShort": "months",
      "dashPremium.bestValue": "Best value",
      "dashPremium.creditsAria": "{credits} credits for {months} months",
      "dashPremium.creditsAriaOne": "{credits} credits for 1 month",
      "dashPremium.creditsCtaAria": "Activate Premium with credits",
      "dashPremium.guildLabel": "Server",
      "dashPremium.pickGuild": "Choose a server…",
      "dashPremium.buyCredits": "Buy credits",
      "dashPremium.balance": "Balance: {credits} credits",
      "dashPremium.needLogin": "Sign in with Discord to activate Premium with credits.",
      "dashPremium.noGuilds": "No manageable servers found. Sign in and invite the bot.",
      "dashPremium.pickGuildFirst": "Select a server.",
      "dashPremium.insufficient": "Not enough credits. Buy a pack and try again.",
      "dashPremium.activating": "Activating…",
      "dashPremium.activated": "Premium activated on the selected server.",
      "dashPremium.errLoad": "Could not load servers and credits.",
      "dashPremium.errLoadGuilds": "Could not load servers. Try again shortly.",
      "dashPremium.errUpstream": "Service temporarily unavailable. Try again.",
      "dashPremium.errSpend": "Activation failed.",
      "dashPremium.errProtected": "Could not activate Premium for this server.",
      "dashPremium.noTenantGuilds": "No manageable servers found. Sign in and invite the bot.",
      "dashPremium.noGuilds": "No manageable servers found. Sign in and invite the bot.",
      "dashPremium.perkAvatar": "Avatar",
      "dashPremium.perkBanner": "Banner",
      "dashPremium.perkName": "Name",
      "dashPremium.perkEmbed": "Custom messages",
      "dashPremium.soonCommunityName": "Community",
      "dashPremium.soonCommunityPerk1": "Everything in Customization",
      "dashPremium.soonCommunityPerk2": "Advanced moderation modules",
      "dashPremium.soonCommunityPerk3": "Stats and weekly reports",
      "dashPremium.soonCommunityPerk4": "Community announcements and campaigns",
      "dashPremium.soonBusinessName": "Business",
      "dashPremium.soonBusinessPerk1": "Everything in Community",
      "dashPremium.soonBusinessPerk2": "Multi-server management",
      "dashPremium.soonBusinessPerk3": "Priority support",
      "dashPremium.soonBusinessPerk4": "Automations and integrations",
      "dashPremium.soonCta": "COMING SOON",
      "dashCredits.aria": "Buy Premium credits",
      "dashCredits.title": "Buy Premium credits",
      "dashCredits.label": "credits",
      "dashCreditsShop.kicker": "Credits",
      "dashCreditsShop.heroTitleBefore": "Credit",
      "dashCreditsShop.heroTitleAccent": "packs",
      "dashCreditsShop.heroLead": "Pick a pack and pay with PayPal. Payment is not automatic: open a ticket on the main server first for confirmation, then credits will be added.",
      "dashCreditsShop.ticketCta": "Open ticket",
      "dashCreditsShop.ticketAria": "Open the tickets page on the site",
      "dashCreditsShop.backPremium": "Back to Premium",
      "dashCreditsShop.packsAria": "Credit packs",
      "dashCreditsShop.badgePopular": "Most popular",
      "dashCreditsShop.badgeCheap": "Cheapest",
      "dashCreditsShop.badgeCombo": "Combo",
      "dashCreditsShop.pack20Name": "20 credits",
      "dashCreditsShop.pack30Name": "30 credits",
      "dashCreditsShop.pack40Name": "40 credits",
      "dashCreditsShop.pack20Perk": "Ideal for 1 month of Customization",
      "dashCreditsShop.pack30Perk": "Useful together with the 40-credit pack",
      "dashCreditsShop.pack40Perk": "Ideal for 3 months of Customization",
      "dashCreditsShop.buy": "BUY",
      "dashCreditsShop.buy20Aria": "Buy 20 credits for 3.35 euros",
      "dashCreditsShop.buy30Aria": "Buy 30 credits for 5.00 euros",
      "dashCreditsShop.buy40Aria": "Buy 40 credits for 6.67 euros",
      "dashSugg.kicker": "Ideas and issues",
      "dashSugg.heroBefore": "Ideas and reports for ",
      "dashSugg.heroAccent": "Vinili",
      "dashSugg.lead": "Suggest improvements for Vinili or report something that is not working. You can attach photos.",
      "dashSugg.how": "How it works",
      "dashSugg.how1": "Choose idea or issue, describe it, and attach photos if needed.",
      "dashSugg.how2": "Vote and comment on proposals still under review.",
      "dashSugg.guidelines": "Note",
      "dashSugg.guidelinesBody": "This board is only about Vinili. For community ideas use the main site Feedback page.",
      "dashSugg.sectionEyebrow": "Vinili",
      "dashSugg.sectionTitle": "Board",
      "dashSugg.new": "New feedback",
      "dashSugg.gateTitle": "Sign in to continue",
      "dashSugg.gateBody": "Sign in with Discord to suggest an idea for Vinili or report an issue.",
      "dashSugg.gateLogin": "Sign in with Discord",
      "dashSugg.backDash": "Back to Dashboard",
      "dash.errLoadServers": "Could not load servers.",
      "dash.errNetworkServers": "Network error while loading servers.",
      "dash.menuAria": "Server menu",
      "dash.overview": "Overview",
      "dash.partnership": "Partnership",
      "dash.channels": "Channels",
      "dash.roles": "Team",
      "dash.pings": "Pings",
      "dash.basics": "General",
      "dash.dataTools": "Data",
      "dash.options": "Options",
      "dash.description": "Description",
      "dash.embed": "Embed",
      "dash.embedPremiumTitle": "Embed — Vinili Premium",
      "dash.premium.badge": "Premium",
      "dash.blacklist": "Blacklist",
      "dash.soonAria": "Upcoming features",
      "dash.soon": "SOON",
      "dash.switcherAria": "Switch server",
      "dash.switcherAll": "All servers",
      "dash.comingSoon": "coming soon",
      "dash.moderation": "Moderation",
      "dash.minigames": "Minigames",
      "dash.music": "Music",
      "dash.tts": "TTS",
      "dash.economy": "Economy",
      "dash.stats": "Stats",
      "dash.classifiche": "Leaderboards",
      "dash.classificheKicker": "Partnership",
      "dash.classificheIntro": "Partnership leaderboards by server, Partner Manager, and new joins (all time, day, or week).",
      "dash.classificheDesc": "Partnership rankings: servers, Partner Managers, and new joins.",
      "dash.classificheOpen": "Open leaderboards",
      "dash.lb.categoryAria": "Leaderboard type",
      "dash.lb.periodAria": "Period",
      "dash.lb.catServers": "Servers",
      "dash.lb.catServersSub": "Partnerships",
      "dash.lb.catPartners": "Partner Managers",
      "dash.lb.catPartnersSub": "This server",
      "dash.lb.catJoin": "Joins",
      "dash.lb.catJoinSub": "Invite",
      "dash.lb.periodTotal": "Total",
      "dash.lb.periodDaily": "Daily",
      "dash.lb.periodWeekly": "Weekly",
      "dash.lb.hintServers": "Servers ranked by completed partnerships.",
      "dash.lb.hintPartners": "Partner Managers on this server, ranked by activity.",
      "dash.lb.hintJoin": "Servers ranked by new members from partnerships.",
      "dash.lb.loading": "Loading leaderboard…",
      "dash.lb.empty": "No results for this leaderboard.",
      "dash.lb.loadFailed": "Could not load the leaderboard.",
      "dash.lb.network": "Network error while loading.",
      "dash.lb.meta": "{total} results · page {page}/{pages}",
      "dash.lb.yourRank": "Your rank",
      "dash.lb.prev": "Previous",
      "dash.lb.next": "Next",
      "dash.lb.unitJoinOne": "1 join",
      "dash.lb.unitJoinMany": "{n} joins",
      "dash.lb.unitPartnerOne": "1 partnership",
      "dash.lb.unitPartnerMany": "{n} partnerships",
      "dash.utility": "Utility",
      "dash.other": "Other",
      "dash.loadingGuild": "Loading server settings…",
      "dash.configKicker": "Configuration",
      "dash.configSub": "Bot settings",
      "dash.members": "Members",
      "dash.online": "Online",
      "dash.inviteBot": "Invite Vinili",
      "dash.modules": "Modules",
      "dash.modulesSub": "Modules available on this server.",
      "dash.active": "Active",
      "dash.inactive": "Inactive",
      "dash.settings": "Settings",
      "dash.cmds.title": "Commands",
      "dash.cmds.kicker": "Server",
      "dash.cmds.intro": "Command status and limits by role or channel. Slash rules sync with Discord; partnership prefix without their own rules inherit /partnership.",
      "dash.cmds.permHint": "Allowed and ignored are alternatives: setting one clears the other.",
      "dash.cmds.allowedChannels": "Allowed channels",
      "dash.cmds.ignoredChannels": "Ignored channels",
      "dash.cmds.allowedRoles": "Allowed roles",
      "dash.cmds.ignoredRoles": "Ignored roles",
      "dash.cmds.selectChannel": "Select channel",
      "dash.cmds.selectRole": "Select role",
      "dash.cmds.uncategorized": "Uncategorized",
      "dash.cmds.selectCategory": "Select the whole category",
      "dash.cmds.categoryChip": "Category: {name}",
      "dash.cmds.noOptions": "No options available.",
      "dash.cmds.tabAll": "All",
      "dash.cmds.settings": "Settings",
      "dash.cmds.categorySettings": "Channels & roles for all",
      "dash.cmds.categoryToggle": "Enable / disable all commands",
      "dash.cmds.help": "Help",
      "dash.cmds.toggle": "Enable / disable",
      "dash.cmds.helpTitle": "Command: {cmd}",
      "dash.cmds.settingsTitle": "Extra permissions ({cmd})",
      "dash.cmds.categorySettingsTitle": "Permissions for all commands ({cat})",
      "dash.cmds.categoryPermHint": "The same channel and role rules will be applied to every command in this section. To clear them, remove the chips and save.",
      "dash.cmds.categoryPermHintMixed": "Commands in this section have different permissions. Set shared rules here to apply to all: saving with no selections does not clear existing ones.",
      "dash.cmds.noChanges": "No permission changes.",
      "dash.cmds.cooldown": "Cooldown",
      "dash.cmds.cooldownSeconds": "{n} seconds",
      "dash.cmds.cooldownNone": "None",
      "dash.cmds.description": "Description",
      "dash.cmds.usage": "Usage",
      "dash.cmds.example": "Example",
      "dash.cmds.aliases": "Aliases",
      "dash.cmds.noDescription": "No description available.",
      "dash.cmds.emptyCatalog": "No commands available for this server.",
      "dash.cmds.loading": "Loading commands…",
      "dash.cmds.loadFailed": "Could not load commands.",
      "dash.cmds.saveFailed": "Could not save command settings.",
      "dash.cmds.saved": "Command settings saved.",
      "dash.cmds.saving": "Saving settings…",
      "dash.cmds.network": "Network error while loading.",
      "dash.cmds.slash": "Slash",
      "dash.cmds.prefix": "Prefix",
      "dash.cmds.prefixLockedMain": "On the main server, prefix commands are not configured here.",
      "dash.cmds.slashType": "Type",
      "dash.cmds.slashHelpNote": "This command’s channel and role permissions are written to the Discord server integration.",
      "dash.cmds.scopeTitle": "Discord permission required",
      "dash.cmds.scopeBody": "To sync slash permissions, sign in again with Discord from the dashboard.",
      "dash.cmds.scopeRelogin": "Sign out and authorize again (allow command permission updates)",
      "dash.cmds.discordTitle": "Slash command permissions",
      "dash.cmds.discordBody": "Slash roles and channels are set on the bot’s Discord integration, under Server Settings → Integrations.",
      "dash.cmds.openDiscord": "Open Discord integrations",
      "dash.cmds.openDiscordWeb": "Open in browser",
      "dash.cmds.manageDiscord": "Manage on Discord",
      "dash.alwaysOn": "Always on",
      "dash.psModuleDesc": "Partnerships, notices, description, and thank-you message.",
      "dash.modDesc": "Moderation and safety.",
      "dash.minigamesDesc": "Games and interactive activities.",
      "dash.musicDesc": "Music in voice rooms.",
      "dash.ttsDesc": "Spoken messages in voice rooms.",
      "dash.economyDesc": "Economy, shop, and rewards.",
      "dash.statsDesc": "Server stats and rankings.",
      "dash.utilityDesc": "Utility.",
      "dash.otherDesc": "Other modules (coming soon).",
      "dash.save": "Save",
      "dash.selectChannel": "Select channel",
      "dash.selectRole": "Select",
      "dash.none": "— None —",
      "dash.selectChannelOpt": "— Select channel —",
      "dash.selectRoleOpt": "— Select —",
      "dash.noChanges": "No changes to save",
      "dash.saved": "Settings saved.",
      "dash.setupDone": "Setup complete.",
      "dash.setupIncomplete": "Setup incomplete. Set at least the partnership channel, who manages partnerships, and the description.",
      "faq.kicker": "Support",
      "faq.lead": "Quick answers about levels, voice, games, and events.",
      "faq.how": "How to use it",
      "faq.how1": "Pick a category with the tabs below.",
      "faq.how2": "If there are multiple questions, pick one with the switcher below and read the answer.",
      "faq.subAria": "Questions",
      "faq.elsewhere": "Elsewhere on the site",
      "faq.elsewhereBody": "Our bot commands: Wiki. Perks for all roles: Perks.",
      "faq.elsewhereCommands": "Our bot commands:",
      "faq.elsewherePerks": "Perks for all roles:",
      "faq.catsAria": "FAQ categories",
      "faq.empty": "No questions in this category.",
      "faq.answer": "ANSWER",
      "faq.cat.livelli": "Levels",
      "faq.cat.voce": "Music",
      "faq.cat.giochi": "Games",
      "faq.cat.eventi": "Events",
      "faq.cat.staff": "Staff",
      "faq.tag.livelli": "Levels",
      "faq.tag.voce": "Voice",
      "faq.tag.giochi": "Games",
      "faq.tag.eventi": "Events",
      "faq.tag.staff": "Staff",
      "faq.q1.title": "How can I earn EXP points?",
      "faq.q1.body": "Every chat message and time spent in voice channels raises your EXP (voice EXP is doubled). On PERKS you can see what unlocks at each level, while leaderboards are in COMMUNITY.",
      "faq.q2.title": "How can I join the minigames?",
      "faq.q2.body": "Every 15 minutes, from 8:00 AM to 11:59 PM, you can play small chat games sent by our bot. They are optional — if you want to have fun with others, compete, and earn extra EXP, this is for you!",
      "faq.q3.title": "Can we listen to music together?",
      "faq.q3.body": "Absolutely! In voice rooms you can listen or share what you like, respecting volume and the rules (no earrape, nothing disruptive), using our official bots. To discover every command, check the WIKI.",
      "faq.q4.title": "Which games are available?",
      "faq.q4.body": "There are many channels like Pokétwo, Counting, Ship, plus chat minigames with the bot. Not every game is for every taste — if one is not for you, just skip it.",
      "faq.q5.title": "How do seasonal events work?",
      "faq.q5.body": "While you are on the server you can join full SEASONS lasting about 3 months. Each period has a main theme with many events, contests, and challenges designed to keep you hooked!",
      "faq.q6.title": "How can I improve my chances of winning events?",
      "faq.q6.body": "Follow the event instructions carefully — they list every way to get ahead. Being active in voice and text helps a lot. For bonuses, voting and boosting usually unlock perks listed under VOTE and PERKS. There is no single shortcut: rewards go to people who join with consistency and enthusiasm!",
      "faq.q7.title": "What does \"paid staff\" mean?",
      "faq.q7.body": "Every month the best staff member is rewarded with one month of Nitro Boost. Partner Managers are rewarded with Nitro Boost and cash prizes based on their performance.",
      "faq.q8.title": "Can I become a staff member?",
      "faq.q8.body": "Of course! We are always looking for new people to join our team. After reading the rules carefully, submit your application through the form on this site. Seriousness and consistency matter! If you have experience, say so. After applying, do not ping staff or open tickets to ask about the outcome.",
      "rules.kicker": "Community & moderation",
      "rules.titleBefore": "Rules of ",
      "rules.lead": "Guidelines and sanctions to keep the server safe, clear, and enjoyable for everyone.",
      "rules.disclaimer": "Staff reserves the right to change sanctions and rules depending on the situation.",
      "rules.how": "How to use them",
      "rules.how1": "Pick a category below to filter the rules.",
      "rules.how2": "If there are multiple rules, pick one with the second switcher and read the full text.",
      "rules.subAria": "Rules",
      "rules.sanctions": "Sanctions",
      "rules.sanctionsBody": "Sanction severity depends on seriousness and repeat offenses. If unsure, ask staff privately — do not argue in public.",
      "rules.catsAria": "Rule categories",
      "rules.empty": "No rules in this category.",
      "rules.description": "DESCRIPTION",
      "rules.loading": "Loading rules…",
      "rules.errApi": "Rules API is not configured.",
      "rules.errLoad": "Could not load rules from the bot.",
      "rules.errNetwork": "Network error while loading rules.",
      "lang.it": "Italiano",
      "lang.en": "English",
      "lang.es": "Español",
      "lang.fr": "Français",
      "lang.de": "Deutsch",
      "lang.pt": "Português",
      "lang.ru": "Русский",
      "lang.zh": "中文",
      "lang.ja": "日本語",
      "lang.ko": "한국어",
      "lang.ar": "العربية",
      "lang.nl": "Nederlands",
      "lang.pl": "Polski",
      "lang.tr": "Türkçe",
      "lang.hi": "हिन्दी",
      "lang.id": "Indonesia",
      "lang.uk": "Українська",
      "lang.vi": "Tiếng Việt",
      "lang.ro": "Română",
      "lang.sv": "Svenska",
    },
  };

  var currentLang = "it";

  function normalizeLang(raw) {
    var s = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, "-");
    if (!s) return "";
    if (SUPPORTED.indexOf(s) !== -1) return s;
    var aliases = {
      "en-us": "en",
      "en-gb": "en",
      "es-es": "es",
      "es-419": "es",
      "pt-br": "pt",
      "pt-pt": "pt",
      "zh-cn": "zh",
      "zh-tw": "zh",
      "uk-ua": "uk",
    };
    if (aliases[s] && SUPPORTED.indexOf(aliases[s]) !== -1) return aliases[s];
    var base = s.split("-")[0];
    if (SUPPORTED.indexOf(base) !== -1) return base;
    if (s.indexOf("zh") === 0) return "zh";
    if (s.indexOf("uk") === 0) return "uk";
    return "";
  }

  function detectLang() {
    try {
      var rawStored = String(localStorage.getItem(STORAGE_KEY) || "")
        .trim()
        .toLowerCase()
        .replace(/_/g, "-");
      var stored = normalizeLang(rawStored);
      if (stored) return stored;
      var legacyBase = rawStored.split("-")[0];
      if (legacyBase && LEGACY_AUTO_LANGS.indexOf(legacyBase) !== -1) {
        try {
          localStorage.setItem(STORAGE_KEY, "en");
        } catch (e0) {}
        return "en";
      }
    } catch (e) {}
    try {
      var nav = normalizeLang(navigator.language || (navigator.languages && navigator.languages[0]) || "");
      if (nav) return nav;
      var navRaw = String(navigator.language || "").toLowerCase();
      var navBase = navRaw.split("-")[0];
      if (navBase && LEGACY_AUTO_LANGS.indexOf(navBase) !== -1) return "en";
    } catch (e2) {}
    return "it";
  }

  function interpolate(str, vars) {
    if (!vars) return str;
    return String(str).replace(/\{(\w+)\}/g, function (_, k) {
      return vars[k] != null ? String(vars[k]) : "{" + k + "}";
    });
  }

  function isUnexpandedPlaceholder(s) {
    return /^\{\{[A-Z0-9_]+\}\}$/.test(String(s || "").trim());
  }

  function siteTemplateVars() {
    var siteName = "";
    var supportEmail = "";
    try {
      var brand = document.querySelector('a[href][aria-label*="homepage"], .vc-footer-brand-row a, header a[href="/"], header a[href$="/"]');
      if (brand) {
        var brandName = String(brand.textContent || "").replace(/\s+/g, " ").trim();
        if (brandName && !isUnexpandedPlaceholder(brandName)) siteName = brandName;
      }
    } catch (e) {}
    try {
      if (!siteName && window.__VC_AUTH && window.__VC_AUTH.homeUrl) {
              }
      var metaSite = document.querySelector('meta[name="author"]');
      if (!siteName && metaSite) {
        var metaName = String(metaSite.getAttribute("content") || "").trim();
        if (metaName && !isUnexpandedPlaceholder(metaName)) siteName = metaName;
      }
    } catch (e2) {}
    if (!siteName) siteName = "Vinili & Caffè";
    try {
      var mail = document.querySelector('a[href^="mailto:"]');
      if (mail) supportEmail = String(mail.getAttribute("href") || "").replace(/^mailto:/i, "").trim();
    } catch (e3) {}
    if (!supportEmail) supportEmail = "support@viniliecaffe.it";
    return { SITE_NAME: siteName, SUPPORT_EMAIL: supportEmail };
  }

  function applyBuildPlaceholders(str) {
    var vars = siteTemplateVars();
    return String(str || "")
      .replace(/\{\{SITE_NAME\}\}/g, vars.SITE_NAME)
      .replace(/\{\{SUPPORT_EMAIL\}\}/g, vars.SUPPORT_EMAIL);
  }

  function lookupRaw(key) {
    var pack = DICTS[currentLang] || {};
    if (Object.prototype.hasOwnProperty.call(pack, key) && pack[key] != null) return pack[key];
    if (currentLang !== "it" && DICTS.it && Object.prototype.hasOwnProperty.call(DICTS.it, key) && DICTS.it[key] != null) {
      return DICTS.it[key];
    }
    return null;
  }

  function t(key, vars) {
    var raw = lookupRaw(key);
    if (raw == null) return key;
    return interpolate(applyBuildPlaceholders(raw), vars);
  }

  function setHtmlLang(lang) {
    try {
      document.documentElement.lang = lang;
      document.documentElement.setAttribute("data-vc-lang", lang);
      document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    } catch (e) {}
  }

  function rememberSrc(el, attrName, value) {
    if (!el.hasAttribute(attrName)) el.setAttribute(attrName, value);
  }

  function applyNode(el) {
    var key = el.getAttribute("data-i18n");
    if (key) {
      rememberSrc(el, "data-i18n-src", el.textContent);
      var translated = lookupRaw(key);
      if (translated != null) {
        el.textContent = t(key);
      } else if (el.hasAttribute("data-i18n-src")) {
        el.textContent = el.getAttribute("data-i18n-src");
      }
    }
    var htmlKey = el.getAttribute("data-i18n-html");
    if (htmlKey) {
      rememberSrc(el, "data-i18n-html-src", el.innerHTML);
      var translatedH = lookupRaw(htmlKey);
      if (translatedH != null) {
        el.innerHTML = t(htmlKey);
      } else if (el.hasAttribute("data-i18n-html-src")) {
        el.innerHTML = el.getAttribute("data-i18n-html-src");
      }
    }
    var ph = el.getAttribute("data-i18n-placeholder");
    if (ph) {
      rememberSrc(el, "data-i18n-placeholder-src", el.getAttribute("placeholder") || "");
      var translatedP = lookupRaw(ph);
      if (translatedP != null) {
        el.setAttribute("placeholder", t(ph));
      } else if (el.hasAttribute("data-i18n-placeholder-src")) {
        el.setAttribute("placeholder", el.getAttribute("data-i18n-placeholder-src"));
      }
    }
    var titleKey = el.getAttribute("data-i18n-title");
    if (titleKey) {
      rememberSrc(el, "data-i18n-title-src", el.getAttribute("title") || "");
      var translatedT = lookupRaw(titleKey);
      if (translatedT != null) {
        el.setAttribute("title", t(titleKey));
      } else if (el.hasAttribute("data-i18n-title-src")) {
        el.setAttribute("title", el.getAttribute("data-i18n-title-src"));
      }
    }
    var attrSpec = el.getAttribute("data-i18n-attr");
    if (attrSpec) {
      var parts = attrSpec.split(",");
      for (var i = 0; i < parts.length; i += 1) {
        var pair = parts[i].split(":");
        if (pair.length < 2) continue;
        var attr = pair[0].trim();
        var aKey = pair.slice(1).join(":").trim();
        if (!attr || !aKey) continue;
        var srcAttr = "data-i18n-attr-src-" + attr;
        rememberSrc(el, srcAttr, el.getAttribute(attr) || "");
        var translatedA = lookupRaw(aKey);
        if (translatedA != null) {
          el.setAttribute(attr, t(aKey));
        } else if (el.hasAttribute(srcAttr)) {
          el.setAttribute(attr, el.getAttribute(srcAttr));
        }
      }
    }
  }

  function applyDom(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll(
      "[data-i18n],[data-i18n-html],[data-i18n-placeholder],[data-i18n-title],[data-i18n-attr]",
    );
    for (var i = 0; i < nodes.length; i += 1) applyNode(nodes[i]);
    if (root && root.nodeType === 1) {
      if (
        root.hasAttribute("data-i18n") ||
        root.hasAttribute("data-i18n-html") ||
        root.hasAttribute("data-i18n-placeholder") ||
        root.hasAttribute("data-i18n-title") ||
        root.hasAttribute("data-i18n-attr")
      ) {
        applyNode(root);
      }
    }
  }

  function setLangMenuOpen(open) {
    var drop = document.getElementById("vc-lang-dropdown");
    var toggle = document.getElementById("vc-lang-toggle");
    var panel = document.getElementById("vc-lang-panel");
    var on = Boolean(open);
    if (drop) drop.classList.toggle("is-open", on);
    if (panel) {
      if (on) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    }
    if (toggle) toggle.setAttribute("aria-expanded", on ? "true" : "false");
    try {
      document.documentElement.classList.toggle("vc-lang-dropdown-open", on);
    } catch (e) {}
  }

  function isLangMenuOpen() {
    var drop = document.getElementById("vc-lang-dropdown");
    return Boolean(drop && drop.classList.contains("is-open"));
  }

  function ensureLangPanelOptions() {
    var panel = document.getElementById("vc-lang-panel");
    if (!panel) return;
    var html = [];
    for (var i = 0; i < SUPPORTED.length; i += 1) {
      var code = SUPPORTED[i];
      var label = LANG_LABEL[code] || code;
      var flagCode = LANG_FLAG[code] || code;
      var emoji = LANG_EMOJI[code] || "🌐";
      html.push(
        '<button type="button" class="vc-lang-option" data-vc-lang="' +
          code +
          '" role="option" aria-selected="false">' +
          '<span class="vc-lang-flag vc-lang-flag--' +
          flagCode +
          '" data-vc-lang-flag="' +
          flagCode +
          '" data-emoji="' +
          emoji +
          '" aria-hidden="true"></span>' +
          "<span>" +
          label +
          "</span></button>",
      );
    }
    panel.innerHTML = html.join("");
  }

  function syncSwitcher() {
    var flag = document.getElementById("vc-lang-flag");
    if (flag) {
      var code = LANG_FLAG[currentLang] || "it";
      var emoji = LANG_EMOJI[currentLang] || "🌐";
      flag.className = "vc-lang-flag vc-lang-flag--" + code;
      flag.setAttribute("data-vc-lang-flag", code);
      flag.setAttribute("data-emoji", emoji);
    }
    var opts = document.querySelectorAll("#vc-lang-dropdown [data-vc-lang]");
    for (var i = 0; i < opts.length; i += 1) {
      var btn = opts[i];
      var lang = btn.getAttribute("data-vc-lang");
      var active = lang === currentLang;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    }
    setLangMenuOpen(false);
  }

  function applyAll() {
    setHtmlLang(currentLang);
    applyDom(document);
    syncSwitcher();
    try {
      document.dispatchEvent(
        new CustomEvent("vc:langchange", { detail: { lang: currentLang } }),
      );
    } catch (e) {}
  }

  function setLang(lang, opts) {
    var next = normalizeLang(lang) || "it";
    if (SUPPORTED.indexOf(next) === -1) next = "it";
    currentLang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {}
    if (!(opts && opts.skipApply)) applyAll();
    return next;
  }

  function getLang() {
    return currentLang;
  }

  function bindSwitcher() {
    var root = document.getElementById("vc-lang-dropdown");
    if (!root) return;
    ensureLangPanelOptions();
    syncSwitcher();
    if (root.getAttribute("data-vc-lang-bound") === "1") return;
    root.setAttribute("data-vc-lang-bound", "1");
    var toggle = document.getElementById("vc-lang-toggle");
    if (toggle) {
      toggle.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var next = !isLangMenuOpen();
        if (next) {
          try {
            document.dispatchEvent(new CustomEvent("vc:langmenuopen"));
          } catch (e) {}
        }
        setLangMenuOpen(next);
      });
    }
    root.addEventListener("click", function (ev) {
      var tEl = ev.target;
      if (!tEl || !tEl.closest) return;
      var btn = tEl.closest("[data-vc-lang]");
      if (!btn || !root.contains(btn)) return;
      ev.preventDefault();
      ev.stopPropagation();
      setLang(btn.getAttribute("data-vc-lang"));
    });
    document.addEventListener(
      "pointerdown",
      function (ev) {
        if (!isLangMenuOpen()) return;
        if (typeof ev.button === "number" && ev.button !== 0) return;
        var t = ev.target;
        if (t && root.contains(t)) return;
        setLangMenuOpen(false);
      },
      true,
    );
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && isLangMenuOpen()) setLangMenuOpen(false);
    });
  }

  var langHomeParent = null;
  var langHomeNext = null;

  function rememberLangHome(drop) {
    if (!drop || langHomeParent) return;
    langHomeParent = drop.parentElement;
    langHomeNext = drop.nextSibling;
  }

  function restoreLangHome(drop) {
    if (!drop || !langHomeParent) return;
    if (langHomeNext && langHomeNext.parentNode === langHomeParent) {
      langHomeParent.insertBefore(drop, langHomeNext);
    } else {
      langHomeParent.appendChild(drop);
    }
  }

  function findBrandColumn() {
    return document.querySelector(".vc-header-bar > div:first-child");
  }

  function findBrandSiteNameLink(brand) {
    if (!brand) return null;
    return (
      brand.querySelector("a.vc-header-logo-link + a") ||
      brand.querySelector("a.vc-header-site-name:not(.vc-snav-item):not(.vc-snav-row)") ||
      brand.querySelector("a[href]:not(.vc-header-logo-link):not(.vc-snav-item):not(.vc-snav-row)")
    );
  }

  function placeLangAfterSiteName(drop) {
    var brand = findBrandColumn();
    if (!brand || !drop) return false;
    var siteName = findBrandSiteNameLink(brand);
    if (siteName) {
      if (siteName.nextElementSibling === drop) return true;
      brand.insertBefore(drop, siteName.nextSibling);
      return true;
    }
    if (drop.parentElement !== brand) brand.appendChild(drop);
    return true;
  }

  function syncLangChromePlacement() {
    var drop = document.getElementById("vc-lang-dropdown");
    if (!drop) return;
    rememberLangHome(drop);
    drop.classList.remove("vc-lang-dropdown--mobile-actions");
    var actions = document.getElementById("header-quick-actions");
    if (actions && drop.parentElement === actions) {
      placeLangAfterSiteName(drop);
      rememberLangHome(drop);
      return;
    }
    if (langHomeParent && drop.parentElement !== langHomeParent) restoreLangHome(drop);
    placeLangAfterSiteName(drop);
  }

  var langPlacementTimer = 0;
  function scheduleLangChromePlacement() {
    if (langPlacementTimer) window.clearTimeout(langPlacementTimer);
    langPlacementTimer = window.setTimeout(function () {
      langPlacementTimer = 0;
      syncLangChromePlacement();
    }, 120);
  }

    function ensureSwitcherReady() {
    try {
      scheduleLangChromePlacement();
      bindSwitcher();
    } catch (eBind) {}
  }

  currentLang = detectLang();
  setHtmlLang(currentLang);

  function boot() {
    ensureSwitcherReady();
    applyAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.addEventListener("vc-mobile-nav-ready", ensureSwitcherReady);
  try {
    var langMq = window.matchMedia("(max-width: 639.98px)");
    if (langMq.addEventListener) langMq.addEventListener("change", scheduleLangChromePlacement);
    else if (langMq.addListener) langMq.addListener(scheduleLangChromePlacement);
  } catch (eLangMq) {}
  window.addEventListener("vc:langmenuopen", function () {
      });

  window.VcI18n = {
    t: t,
    getLang: getLang,
    setLang: setLang,
    apply: applyDom,
    ensureLangSwitcher: ensureSwitcherReady,
    closeLangMenu: function () {
      setLangMenuOpen(false);
    },
    supported: SUPPORTED.slice(),
    legacyAutoLangs: LEGACY_AUTO_LANGS.slice(),
    extend: function (partial, opts) {
      if (!partial || typeof partial !== "object") return;
      var source = opts && opts.source ? String(opts.source) : "";
      var isAuto = source === "auto" || source === "gtx";
      for (var lang in partial) {
        if (!Object.prototype.hasOwnProperty.call(partial, lang)) continue;
                if (SUPPORTED.indexOf(lang) === -1) continue;
        if (!DICTS[lang]) DICTS[lang] = {};
        var src = partial[lang];
        if (!src || typeof src !== "object") continue;
        for (var k in src) {
          if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
                    if (isAuto && lang === "en" && Object.prototype.hasOwnProperty.call(DICTS.en, k) && DICTS.en[k] != null) {
            continue;
          }
          DICTS[lang][k] = src[k];
        }
      }
      ensureSwitcherReady();
      if (document.readyState !== "loading") applyAll();
    },
  };
})();
