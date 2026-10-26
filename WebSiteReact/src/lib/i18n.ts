"use client";

/**
 * i18n — stesse lingue del sito vecchio (vc-i18n SUPPORTED).
 * Curate in repo: it / en / es. Le altre caricano `/js/i18n/locales/{lang}.json`
 * (legacy nginx) e fanno merge sopra i fallback IT/EN.
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";

export const LOCALES = [
  "it",
  "en",
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
] as const;
export type Locale = (typeof LOCALES)[number];

export const CURATED_LOCALES = ["it", "en", "es"] as const;
export type CuratedLocale = (typeof CURATED_LOCALES)[number];

export const LANG_LABEL: Record<Locale, string> = {
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

/** Codice bandiera ISO (img, non emoji: su Windows le emoji-bandiera diventano "IT"/"GB"). */
export const LANG_FLAG: Record<Locale, string> = {
  it: "it",
  en: "gb",
  es: "es",
  fr: "fr",
  de: "de",
  pt: "br",
  ru: "ru",
  zh: "cn",
  ja: "jp",
  ko: "kr",
  ar: "sa",
  nl: "nl",
  pl: "pl",
  tr: "tr",
  hi: "in",
  id: "id",
  uk: "ua",
  vi: "vn",
  ro: "ro",
  sv: "se",
};

/** @deprecated usa LANG_FLAG + FlagImg — emoji rotte su Windows */
export const LANG_EMOJI: Record<Locale, string> = {
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

export function flagUrl(locale: Locale, w = 40) {
  return `https://flagcdn.com/w${w}/${LANG_FLAG[locale]}.png`;
}

const STORAGE_KEY = "vc_site_lang";
const CHROME_PREFS = "/webhooks/site-chrome-prefs";

type Dict = Record<string, string>;

/** Dizionario shell curato (it/en/es). Estendi per pagina. */
export const DICTS: Record<CuratedLocale, Dict> = {
  it: {
    "nav.language": "Lingua",
    "nav.languageList": "Scegli lingua",
    "nav.menu": "Menu",
    "nav.openMenu": "Apri menu",
    "nav.closeMenu": "Chiudi menu",
    "nav.menuAria": "Menu di navigazione",
    "nav.menuTitle": "Dove andiamo?",
    "nav.main": "Principale",
    "nav.wiki": "Wiki",
    "nav.sponsor": "Sponsor",
    "nav.support": "Supporta",
    "nav.vote": "Vota",
    "nav.voteServer": "Vota il server",
    "nav.reviews": "Recensioni",
    "nav.donations": "Donazioni",
    "nav.perks": "Perks",
    "nav.community": "Community",
    "nav.users": "Classifiche",
    "nav.roles": "Ruoli",
    "nav.bacheca": "Bacheca",
    "nav.rules": "Regole",
    "nav.faq": "FAQ",
    "nav.games": "Giochi",
    "nav.wordle": "Wordle",
    "nav.puzzle": "Puzzle",
    "nav.requests": "Richieste",
    "nav.applications": "Candidature",
    "nav.appeals": "Appelli",
    "nav.suggestions": "Feedback",
    "nav.confessionale": "Confessionale",
    "nav.tickets": "Tickets",
    "nav.status": "Status",
    "nav.resources": "Risorse",
    "nav.info": "Info",
    "nav.privacy": "Privacy",
    "nav.terms": "Termini",
    "nav.cookie": "Cookie",
    "nav.copyright": "Copyright",
    "nav.yourData": "I tuoi dati",
    "nav.hint.wiki": "Guide e comandi",
    "nav.hint.sponsor": "Prezzi e spazi",
    "nav.hint.bacheca": "Bot e server",
    "nav.hint.users": "Livello e XP",
    "nav.hint.roles": "Sistema dei ruoli",
    "nav.hint.confessionale": "Messaggi anonimi",
    "nav.hint.wordle": "Indovina la parola",
    "nav.hint.puzzle": "Puzzle community",
    "nav.hint.vote": "Ricompense",
    "nav.hint.reviews": "Cosa dicono di noi",
    "nav.hint.donations": "Sostieni la community",
    "nav.hint.perks": "Vantaggi",
    "nav.hint.rules": "Regolamento",
    "nav.hint.faq": "Domande frequenti",
    "nav.hint.status": "Stato dei servizi",
    "nav.hint.applications": "Entra nello staff",
    "nav.hint.appeals": "Unban e unmute",
    "nav.hint.suggestions": "Idee e segnalazioni",
    "nav.hint.tickets": "Assistenza",
    "auth.login": "Accedi",
    "auth.loginDiscord": "Accedi con Discord",
    "auth.logout": "Esci",
    "auth.profile": "Il mio profilo",
    "auth.dashboard": "Dashboard",
    "auth.bacheca": "Bacheca",
    "auth.puzzle": "Puzzle",
    "auth.comingSoon": "SOON",
    "auth.theme": "Tema",
    "auth.accountMenu": "Il tuo account",
    "auth.account": "Account",
    "auth.gateWhy": "Serve a collegare il tuo account Discord al server in modo sicuro.",
    "empty.genericTitle": "Niente da mostrare",
    "empty.genericText": "Non c'è ancora contenuto qui.",
    "tickets.searchPlaceholder": "Cerca ticket…",
    "tickets.copyLink": "Copia link",
    "tickets.linkCopied": "Link copiato negli appunti.",
    "tickets.gateTitle": "Accedi per aprire un ticket",
    "tickets.gateText": "Scrivi e ricevi risposte live dallo staff.",
    "tickets.listTitle": "I tuoi ticket",
    "tickets.new": "Nuovo",
    "tickets.scopeMine": "I miei",
    "tickets.emptyMine": "Non hai ancora aperto ticket.",
    "tickets.emptyPaneTitle": "Nessun ticket aperto",
    "tickets.emptyPanePick": "Scegli un ticket dalla lista.",
    "tickets.emptyPanePickOrNew": "Scegli un ticket dalla lista oppure aprine uno nuovo.",
    "tickets.openTicket": "Apri un ticket",
    "vote.allVotedTitle": "Hai già votato su tutte le piattaforme",
    "vote.allVotedHint": "I prossimi voti si sbloccano a turno — guarda i countdown sulle card.",
    "vote.loginPrompt": "Accedi per vedere i tuoi voti e quando potrai votare di nuovo.",
    "vote.canVote": "Puoi votare!",
    "vote.cooldownEvery": "Ogni {hours} ore",
    "vote.votedHereOnce": "Hai votato qui {n} volta",
    "vote.votedHereMany": "Hai votato qui {n} volte",
    "vote.ctaVote": "Vota su {name}",
    "vote.ctaOpen": "Apri {name}",
    "vote.statsVotedTotal": "Hai votato {n} volte in totale",
    "vote.statsRank": "e sei #{rank} tra i votanti",
    "vote.statsThanks": "Grazie!",
    "vote.statsNotYet": "Non hai ancora votato: il primo voto è il più bello.",
    "vote.emptyLeaderboard": "Ancora nessun voto: sii il primo!",
    "feedback.loginToWrite": "Accedi per scrivere",
    "feedback.newNote": "Nuovo feedback",
    "feedback.emptyTitle": "Nessun feedback ancora",
    "feedback.emptyText": "Sii il primo a proporre un'idea o segnalare un problema.",
    "feedback.emptyFilteredTitle": "Niente con questi filtri",
    "feedback.emptyFilteredText": "Prova ad azzerare i filtri o a cambiarne qualcuno.",
    "feedback.resetFilters": "Azzera i filtri",
    "confessionale.loginToWrite": "Accedi per scrivere",
    "confessionale.loginToSend": "Accedi con Discord per inviare un messaggio anonimo.",
    "confessionale.emptyTitle": "Nessuna lettera, per ora",
    "confessionale.emptyText": "Sii il primo a scrivere nel confessionale.",
    "login.requiredTitle": "Accesso richiesto",
    "login.requiredText": "Accedi con Discord per continuare su questa pagina.",
    "footer.aria": "Footer",
    "footer.tagline": "Il caffè è pronto.",
    "footer.taglineSub": "Manca solo il tuo vinile.",
    "footer.joinCta": "Unisciti alla community",
    "footer.desc":
      "Community italiana Discord curata nei dettagli: Italia, social, gaming e tanta musica.",
    "footer.social": "Social",
    "footer.copy": "© {year} Vinili & Caffè. Tutti i diritti riservati.",
    "footer.status": "Status in tempo reale",
    "footer.statusTitle": "Stato dei servizi in tempo reale",
    "footer.statusOk": "Tutto operativo",
    "footer.statusDown": "Problemi in corso",
    "footer.statusSlow": "Servizi rallentati",
    "footer.statusMaint": "In manutenzione",
    "footer.statusUnknown": "Status…",
    "footer.terms": "Termini",
    "footer.privacy": "Privacy",
    "footer.cookies": "Cookie",
    "footer.yourData": "I tuoi dati",
    "footer.copyright": "Copyright",
    "common.discord": "Entra su Discord",
    "common.close": "Chiudi",
    "common.loading": "Caricamento…",
    "common.save": "Salva",
    "common.cancel": "Annulla",
    "common.retry": "Riprova",
    "common.back": "Indietro",
    "home.badge": "Community Discord italiana",
    "home.badgeLead": "Community italiana di",
    "home.badgeWords": "musica|caffè|gaming|chiacchiere|amicizie",
    "home.loop": "Vinili ✦ Caffè ✦ Musica ✦ Gaming ✦ Amici ✦ ",
    "home.welcome": "Benvenut* su",
    "home.welcomeM": "Benvenuto su",
    "home.welcomeF": "Benvenuta su",
    "home.lead":
      "Una community chill in cui si può parlare di tutto: ruoli, canali, eventi, bot fatti in casa e tutto ciò che una persona può desiderare. Metti su un vinile, il caffè è pronto.",
    "home.exploreCta": "Esplora la community",
    "home.scroll": "Scorri per continuare",
    "stats.kicker": "In diretta dal server",
    "stats.title": "Il server è sempre vivo",
    "home.scrollHint": "Scorri",
    "stats.members": "Membri",
    "stats.online": "Online ora",
    "stats.boosts": "Boost",
    "stats.staff": "Staff",
    "stats.showDetail": "Tocca per i dettagli",
    "stats.hideDetail": "Chiudi dettagli",
    "stats.rosterEmpty": "Nessun dettaglio disponibile al momento.",
    "stats.owner": "Owner",
    "stats.paused": "In pausa",
    "stats.staffOfMonth": "Staff del mese",
    "stats.boostCount": "{n} boost",
    "stats.boostersKicker": "I booster",
    "stats.boostersCount": "{people} persone · {boosts} boost",
    "stats.staffKicker": "Lo staff",
    "stats.staffCount": "{people} persone",
    "stats.pulseActive": "Attivi (7g)",
    "stats.pulseMessages": "Messaggi (7g)",
    "stats.pulseVoice": "Vocale (7g)",
    "stats.pulseKicker": "Statistiche server",
    "stats.pulseSub": "ultimi 7 giorni",
    "stats.pulseMessagesLabel": "Messaggi",
    "stats.pulseMessagesHint": "in chat nella community",
    "stats.pulseVoiceLabel": "Vocali",
    "stats.pulseVoiceHint": "ore passate insieme",
    "stats.pulseActiveLabel": "Membri attivi",
    "stats.pulseActiveHint": "hanno scritto o sono stati in vocale",
    "stats.hoursTitle": "Fasce più attive",
    "stats.hoursKicker": "Quando ci trovi",
    "stats.hoursSub": "le fasce più vive",
    "stats.hoursHot": "Il momento clou",
    "stats.hoursOnlineNow": "{n} online ora",
    "notif.title": "Notifiche",
    "notif.empty": "Nessuna notifica per ora.",
    "notif.markAll": "Segna lette",
    "notif.seeAll": "Vedi tutte",
    "notif.delete": "Elimina notifica",
    "notif.unreadAria": "{n} notifiche non lette",
    "why.kicker": "Perché Vinili & Caffè",
    "why.title": "Un posto dove tornare,",
    "why.titleEm": "come la tua community di sempre",
    "why.1.title": "In crescita costante",
    "why.1.text": "Espansione continua con un pubblico italiano giovane e coinvolto.",
    "why.2.title": "Eventi & giveaway",
    "why.2.text": "Serate film, eventi stagionali e giveaway frequenti per tutta la community.",
    "why.3.title": "Bot personalizzati",
    "why.3.text": "Bot fatti in casa, moderazione avanzata e funzioni che non trovi altrove.",
    "reviews.kicker": "Dicono di noi",
    "reviews.title": "Recensioni",
    "reviews.titleEm": "dal server",
    "reviews.all": "Leggi tutte le recensioni",
    "reviews.manual": "Scorri a mano",
    "reviews.auto": "Riprendi lo scorrimento",
    "reviews.prev": "Recensioni precedenti",
    "reviews.next": "Recensioni successive",
    "reviews.stamp": "VINILI & CAFFÈ • DAL SERVER • ",
    "reviews.count": "{n} recensioni",
    "explore.kicker": "Indice",
    "explore.title": "Tutto ciò che ti serve, in un unico luogo",
    "cookie.aria": "Avviso utilizzo cookie",
    "cookie.kicker": "Sul sito",
    "cookie.bodyBefore": "Usa",
    "cookie.essentials": "cookie essenziali",
    "cookie.bodyMid": "e Analytics.",
    "cookie.policy": "Cookie Policy",
    "cookie.reject": "Solo essenziali",
    "cookie.accept": "Accetta",
    "live.pill": "In diretta",
    "live.vod": "Ultimo VOD",
    "live.lastLive": "Ultima live",
    "live.lastVod": "Ultimo VOD",
    "live.twitch": "Twitch",
    "live.kick": "Kick",
    "live.pillAria": "Apri {name} su {platform}",
    "live.close": "Chiudi anteprima",
    "live.play": "Riproduci anteprima",
    "live.playerTwitch": "Player Twitch",
    "live.playerKick": "Player live Kick",
    "live.openTwitch": "Apri su Twitch",
    "live.openKick": "Apri su Kick",
    "live.viewers": "{n} spettatori",
    "live.views": "{n} visualizzazioni",
    "live.previewEnded": "Anteprima terminata",
    "live.previewLimit": "Hai raggiunto i 10 minuti di preview. Continua su Kick.",
    "live.previewFail": "Anteprima non disponibile",
    "live.previewFailHint": "Non riesco a far partire l'anteprima. Continua su Kick.",
    "live.unmute": "Attiva audio",
    "live.mute": "Disattiva audio",
    "live.sub": "Collega Kick Sub",
    "live.subLogin": "Accedi per il Sub",
    "live.subActive": "Sub attivo",
    "live.subLinked": "Kick collegato",
    "live.subLinkedHint":
      "Kick è collegato, ma il ruolo non è ancora assegnato. Per riceverlo scrivi almeno un messaggio nella chat dello streamer su Kick (devi essere sub). Il solo link non assegna il ruolo.",
    "live.subError": "Non riesco ad aprire il collegamento Kick. Riprova.",
  },
  en: {
    "nav.language": "Language",
    "nav.languageList": "Choose language",
    "nav.menu": "Menu",
    "nav.openMenu": "Open menu",
    "nav.closeMenu": "Close menu",
    "nav.menuAria": "Navigation menu",
    "nav.menuTitle": "Where to?",
    "nav.main": "Main",
    "nav.wiki": "Wiki",
    "nav.sponsor": "Sponsors",
    "nav.support": "Support",
    "nav.vote": "Vote",
    "nav.voteServer": "Vote for the server",
    "nav.reviews": "Reviews",
    "nav.donations": "Donations",
    "nav.perks": "Perks",
    "nav.community": "Community",
    "nav.users": "Leaderboards",
    "nav.roles": "Roles",
    "nav.bacheca": "Board",
    "nav.rules": "Rules",
    "nav.faq": "FAQ",
    "nav.games": "Games",
    "nav.wordle": "Wordle",
    "nav.puzzle": "Puzzle",
    "nav.requests": "Requests",
    "nav.applications": "Applications",
    "nav.appeals": "Appeals",
    "nav.suggestions": "Feedback",
    "nav.confessionale": "Confessional",
    "nav.tickets": "Tickets",
    "nav.status": "Status",
    "nav.resources": "Resources",
    "nav.info": "Info",
    "nav.privacy": "Privacy",
    "nav.terms": "Terms",
    "nav.cookie": "Cookies",
    "nav.copyright": "Copyright",
    "nav.yourData": "Your data",
    "nav.hint.wiki": "Guides and commands",
    "nav.hint.sponsor": "Pricing and spots",
    "nav.hint.bacheca": "Bots and servers",
    "nav.hint.users": "Level and XP",
    "nav.hint.roles": "Role system",
    "nav.hint.confessionale": "Anonymous messages",
    "nav.hint.wordle": "Guess the word",
    "nav.hint.puzzle": "Community puzzle",
    "nav.hint.vote": "Rewards",
    "nav.hint.reviews": "What people say",
    "nav.hint.donations": "Support the community",
    "nav.hint.perks": "Benefits",
    "nav.hint.rules": "Server rules",
    "nav.hint.faq": "Frequently asked questions",
    "nav.hint.status": "Service status",
    "nav.hint.applications": "Join the staff",
    "nav.hint.appeals": "Unban and unmute",
    "nav.hint.suggestions": "Ideas and reports",
    "nav.hint.tickets": "Support",
    "auth.login": "Sign in",
    "auth.loginDiscord": "Sign in with Discord",
    "auth.logout": "Log out",
    "auth.profile": "My profile",
    "auth.dashboard": "Dashboard",
    "auth.bacheca": "Board",
    "auth.puzzle": "Puzzle",
    "auth.comingSoon": "SOON",
    "auth.theme": "Theme",
    "auth.accountMenu": "Your account",
    "auth.account": "Account",
    "auth.gateWhy": "It securely links your Discord account to the server.",
    "empty.genericTitle": "Nothing here yet",
    "empty.genericText": "There is no content to show yet.",
    "tickets.searchPlaceholder": "Search tickets…",
    "tickets.copyLink": "Copy link",
    "tickets.linkCopied": "Link copied to clipboard.",
    "tickets.gateTitle": "Sign in to open a ticket",
    "tickets.gateText": "Message the team and get live replies from staff.",
    "tickets.listTitle": "Your tickets",
    "tickets.new": "New",
    "tickets.scopeMine": "Mine",
    "tickets.emptyMine": "You haven't opened any tickets yet.",
    "tickets.emptyPaneTitle": "No ticket selected",
    "tickets.emptyPanePick": "Pick a ticket from the list.",
    "tickets.emptyPanePickOrNew": "Pick a ticket from the list or open a new one.",
    "tickets.openTicket": "Open a ticket",
    "vote.allVotedTitle": "You've voted on every platform",
    "vote.allVotedHint": "Your next votes unlock in turn — check the countdowns on each card.",
    "vote.loginPrompt": "Sign in to see your votes and when you can vote again.",
    "vote.canVote": "You can vote!",
    "vote.cooldownEvery": "Every {hours} hours",
    "vote.votedHereOnce": "You've voted here {n} time",
    "vote.votedHereMany": "You've voted here {n} times",
    "vote.ctaVote": "Vote on {name}",
    "vote.ctaOpen": "Open {name}",
    "vote.statsVotedTotal": "You've voted {n} times in total",
    "vote.statsRank": "and you're #{rank} among voters",
    "vote.statsThanks": "Thank you!",
    "vote.statsNotYet": "You haven't voted yet — the first one feels the best.",
    "vote.emptyLeaderboard": "No votes yet — be the first!",
    "feedback.loginToWrite": "Sign in to post",
    "feedback.newNote": "New feedback",
    "feedback.emptyTitle": "No feedback yet",
    "feedback.emptyText": "Be the first to suggest an idea or report an issue.",
    "feedback.emptyFilteredTitle": "Nothing matches these filters",
    "feedback.emptyFilteredText": "Try clearing filters or changing a few.",
    "feedback.resetFilters": "Clear filters",
    "confessionale.loginToWrite": "Sign in to post",
    "confessionale.loginToSend": "Sign in with Discord to send an anonymous message.",
    "confessionale.emptyTitle": "No letters yet",
    "confessionale.emptyText": "Be the first to write in the confessional.",
    "login.requiredTitle": "Sign in required",
    "login.requiredText": "Sign in with Discord to continue on this page.",
    "footer.aria": "Footer",
    "footer.tagline": "Coffee's ready.",
    "footer.taglineSub": "Just missing your vinyl.",
    "footer.joinCta": "Join the community",
    "footer.desc":
      "An Italian Discord community crafted in detail: Italy, socials, gaming, and plenty of music.",
    "footer.social": "Social",
    "footer.copy": "© {year} Vinili & Caffè. All rights reserved.",
    "footer.status": "Live status",
    "footer.statusTitle": "Live service status",
    "footer.statusOk": "All systems go",
    "footer.statusDown": "Issues ongoing",
    "footer.statusSlow": "Services degraded",
    "footer.statusMaint": "Under maintenance",
    "footer.statusUnknown": "Status…",
    "footer.terms": "Terms",
    "footer.privacy": "Privacy",
    "footer.cookies": "Cookies",
    "footer.yourData": "Your data",
    "footer.copyright": "Copyright",
    "common.discord": "Join Discord",
    "common.close": "Close",
    "common.loading": "Loading…",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.retry": "Retry",
    "common.back": "Back",
    "home.badge": "Italian Discord community",
    "home.badgeLead": "Italian community for",
    "home.badgeWords": "music|coffee|gaming|chats|friends",
    "home.loop": "Vinili ✦ Caffè ✦ Music ✦ Gaming ✦ Friends ✦ ",
    "home.welcome": "Welcome to",
    "home.welcomeM": "Welcome to",
    "home.welcomeF": "Welcome to",
    "home.lead":
      "A chill community where you can talk about everything: roles, channels, events, homemade bots, and whatever you might want. Put a vinyl on — coffee's ready.",
    "home.exploreCta": "Explore the community",
    "home.scroll": "Scroll to continue",
    "stats.kicker": "Live from the server",
    "stats.title": "The server is always alive",
    "home.scrollHint": "Scroll",
    "stats.members": "Members",
    "stats.online": "Online now",
    "stats.boosts": "Boosts",
    "stats.staff": "Staff",
    "stats.showDetail": "Tap for details",
    "stats.hideDetail": "Hide details",
    "stats.rosterEmpty": "No details available right now.",
    "stats.owner": "Owner",
    "stats.paused": "On break",
    "stats.staffOfMonth": "Staff of the month",
    "stats.boostCount": "{n} boosts",
    "stats.boostersKicker": "Boosters",
    "stats.boostersCount": "{people} people · {boosts} boosts",
    "stats.staffKicker": "Staff",
    "stats.staffCount": "{people} people",
    "stats.pulseActive": "Active (7d)",
    "stats.pulseMessages": "Messages (7d)",
    "stats.pulseVoice": "Voice (7d)",
    "stats.pulseKicker": "Server stats",
    "stats.pulseSub": "last 7 days",
    "stats.pulseMessagesLabel": "Messages",
    "stats.pulseMessagesHint": "in community chat",
    "stats.pulseVoiceLabel": "Voice",
    "stats.pulseVoiceHint": "hours spent together",
    "stats.pulseActiveLabel": "Active members",
    "stats.pulseActiveHint": "who wrote or joined voice",
    "stats.hoursTitle": "Busiest hours",
    "stats.hoursKicker": "When to find us",
    "stats.hoursSub": "the liveliest windows",
    "stats.hoursHot": "Peak moment",
    "stats.hoursOnlineNow": "{n} online now",
    "notif.title": "Notifications",
    "notif.empty": "No notifications yet.",
    "notif.markAll": "Mark all read",
    "notif.seeAll": "See all",
    "notif.delete": "Delete notification",
    "notif.unreadAria": "{n} unread notifications",
    "why.kicker": "Why Vinili & Caffè",
    "why.title": "A place to come back to,",
    "why.titleEm": "like your everyday community",
    "why.1.title": "Always growing",
    "why.1.text": "Steady growth with a young, engaged Italian audience.",
    "why.2.title": "Events & giveaways",
    "why.2.text": "Movie nights, seasonal events, and frequent giveaways for the whole community.",
    "why.3.title": "Custom bots",
    "why.3.text": "Homemade bots, advanced moderation, and features you won't find elsewhere.",
    "reviews.kicker": "What people say",
    "reviews.title": "Reviews",
    "reviews.titleEm": "from the server",
    "reviews.all": "Read all reviews",
    "reviews.manual": "Scroll by hand",
    "reviews.auto": "Resume scrolling",
    "reviews.prev": "Previous reviews",
    "reviews.next": "Next reviews",
    "reviews.stamp": "VINILI & CAFFÈ • FROM THE SERVER • ",
    "reviews.count": "{n} reviews",
    "explore.kicker": "Index",
    "explore.title": "Everything you need, in one place",
    "cookie.aria": "Cookie notice",
    "cookie.kicker": "On the site",
    "cookie.bodyBefore": "We use",
    "cookie.essentials": "essential cookies",
    "cookie.bodyMid": "and Analytics.",
    "cookie.policy": "Cookie Policy",
    "cookie.reject": "Essentials only",
    "cookie.accept": "Accept",
    "live.pill": "Live",
    "live.vod": "Latest VOD",
    "live.lastLive": "Latest live",
    "live.lastVod": "Latest VOD",
    "live.twitch": "Twitch",
    "live.kick": "Kick",
    "live.pillAria": "Open {name} on {platform}",
    "live.close": "Close preview",
    "live.play": "Play preview",
    "live.playerTwitch": "Twitch player",
    "live.playerKick": "Kick live player",
    "live.openTwitch": "Open on Twitch",
    "live.openKick": "Open on Kick",
    "live.viewers": "{n} viewers",
    "live.views": "{n} views",
    "live.previewEnded": "Preview ended",
    "live.previewLimit": "You reached the 10 minute preview. Continue on Kick.",
    "live.previewFail": "Preview unavailable",
    "live.previewFailHint": "The preview will not start. Continue on Kick.",
    "live.unmute": "Unmute",
    "live.mute": "Mute",
    "live.sub": "Link Kick Sub",
    "live.subLogin": "Sign in for Sub",
    "live.subActive": "Sub active",
    "live.subLinked": "Kick linked",
    "live.subLinkedHint":
      "Kick is linked, but the role is not assigned yet. To get it, send at least one message in the streamer's Kick chat (you need to be a sub). Linking alone does not grant the role.",
    "live.subError": "I can't open the Kick link. Try again.",
  },
  es: {
    "nav.language": "Idioma",
    "nav.languageList": "Elige idioma",
    "nav.menu": "Menú",
    "nav.openMenu": "Abrir menú",
    "nav.closeMenu": "Cerrar menú",
    "nav.menuAria": "Menú de navegación",
    "nav.menuTitle": "¿A dónde vamos?",
    "nav.main": "Principal",
    "nav.wiki": "Wiki",
    "nav.sponsor": "Patrocinadores",
    "nav.support": "Apoyar",
    "nav.vote": "Votar",
    "nav.voteServer": "Vota el servidor",
    "nav.reviews": "Reseñas",
    "nav.donations": "Donaciones",
    "nav.perks": "Perks",
    "nav.community": "Comunidad",
    "nav.users": "Clasificaciones",
    "nav.roles": "Roles",
    "nav.bacheca": "Tablón",
    "nav.rules": "Normas",
    "nav.faq": "FAQ",
    "nav.games": "Juegos",
    "nav.wordle": "Wordle",
    "nav.puzzle": "Puzzle",
    "nav.requests": "Solicitudes",
    "nav.applications": "Candidaturas",
    "nav.appeals": "Apelaciones",
    "nav.suggestions": "Feedback",
    "nav.confessionale": "Confesionario",
    "nav.tickets": "Tickets",
    "nav.status": "Estado",
    "nav.resources": "Recursos",
    "nav.info": "Info",
    "nav.privacy": "Privacidad",
    "nav.terms": "Términos",
    "nav.cookie": "Cookies",
    "nav.copyright": "Copyright",
    "nav.yourData": "Tus datos",
    "nav.hint.wiki": "Guías y comandos",
    "nav.hint.sponsor": "Precios y espacios",
    "nav.hint.bacheca": "Bots y servidores",
    "nav.hint.users": "Nivel y XP",
    "nav.hint.roles": "Sistema de roles",
    "nav.hint.confessionale": "Mensajes anónimos",
    "nav.hint.wordle": "Adivina la palabra",
    "nav.hint.puzzle": "Puzzle de la community",
    "nav.hint.vote": "Recompensas",
    "nav.hint.reviews": "Qué dicen de nosotros",
    "nav.hint.donations": "Apoya la comunidad",
    "nav.hint.perks": "Ventajas",
    "nav.hint.rules": "Reglamento",
    "nav.hint.faq": "Preguntas frecuentes",
    "nav.hint.status": "Estado de los servicios",
    "nav.hint.applications": "Únete al staff",
    "nav.hint.appeals": "Unban y unmute",
    "nav.hint.suggestions": "Ideas y reportes",
    "nav.hint.tickets": "Asistencia",
    "auth.login": "Entrar",
    "auth.loginDiscord": "Entrar con Discord",
    "auth.logout": "Salir",
    "auth.profile": "Mi perfil",
    "auth.dashboard": "Dashboard",
    "auth.bacheca": "Tablón",
    "auth.puzzle": "Puzzle",
    "auth.comingSoon": "SOON",
    "auth.theme": "Tema",
    "auth.accountMenu": "Tu cuenta",
    "auth.account": "Cuenta",
    "auth.gateWhy": "Vincula tu cuenta de Discord al servidor de forma segura.",
    "empty.genericTitle": "Nada que mostrar",
    "empty.genericText": "Aún no hay contenido aquí.",
    "tickets.searchPlaceholder": "Buscar tickets…",
    "tickets.copyLink": "Copiar enlace",
    "tickets.linkCopied": "Enlace copiado al portapapeles.",
    "tickets.gateTitle": "Inicia sesión para abrir un ticket",
    "tickets.gateText": "Escribe al equipo y recibe respuestas en vivo del staff.",
    "tickets.listTitle": "Tus tickets",
    "tickets.new": "Nuevo",
    "tickets.scopeMine": "Míos",
    "tickets.emptyMine": "Aún no has abierto ningún ticket.",
    "tickets.emptyPaneTitle": "Ningún ticket abierto",
    "tickets.emptyPanePick": "Elige un ticket de la lista.",
    "tickets.emptyPanePickOrNew": "Elige un ticket de la lista o abre uno nuevo.",
    "tickets.openTicket": "Abrir un ticket",
    "vote.allVotedTitle": "Ya has votado en todas las plataformas",
    "vote.allVotedHint": "Los próximos votos se desbloquean por turnos — mira las cuentas en cada tarjeta.",
    "vote.loginPrompt": "Inicia sesión para ver tus votos y cuándo podrás votar de nuevo.",
    "vote.canVote": "¡Puedes votar!",
    "vote.cooldownEvery": "Cada {hours} horas",
    "vote.votedHereOnce": "Has votado aquí {n} vez",
    "vote.votedHereMany": "Has votado aquí {n} veces",
    "vote.ctaVote": "Votar en {name}",
    "vote.ctaOpen": "Abrir {name}",
    "vote.statsVotedTotal": "Has votado {n} veces en total",
    "vote.statsRank": "y estás #{rank} entre los votantes",
    "vote.statsThanks": "¡Gracias!",
    "vote.statsNotYet": "Aún no has votado: el primero es el mejor.",
    "vote.emptyLeaderboard": "Aún no hay votos: ¡sé el primero!",
    "feedback.loginToWrite": "Inicia sesión para escribir",
    "feedback.newNote": "Nuevo feedback",
    "feedback.emptyTitle": "Aún no hay feedback",
    "feedback.emptyText": "Sé el primero en proponer una idea o reportar un problema.",
    "feedback.emptyFilteredTitle": "Nada con estos filtros",
    "feedback.emptyFilteredText": "Prueba a quitar filtros o cambiar alguno.",
    "feedback.resetFilters": "Quitar filtros",
    "confessionale.loginToWrite": "Inicia sesión para escribir",
    "confessionale.loginToSend": "Inicia sesión con Discord para enviar un mensaje anónimo.",
    "confessionale.emptyTitle": "Ninguna carta por ahora",
    "confessionale.emptyText": "Sé el primero en escribir en el confesionario.",
    "login.requiredTitle": "Acceso requerido",
    "login.requiredText": "Inicia sesión con Discord para continuar en esta página.",
    "footer.aria": "Pie de página",
    "footer.tagline": "El café está listo.",
    "footer.taglineSub": "Solo falta tu vinilo.",
    "footer.joinCta": "Únete a la comunidad",
    "footer.desc":
      "Comunidad italiana de Discord cuidada al detalle: Italia, social, gaming y mucha música.",
    "footer.social": "Social",
    "footer.copy": "© {year} Vinili & Caffè. Todos los derechos reservados.",
    "footer.status": "Estado en tiempo real",
    "footer.statusTitle": "Estado de los servicios en tiempo real",
    "footer.statusOk": "Todo operativo",
    "footer.statusDown": "Problemas en curso",
    "footer.statusSlow": "Servicios lentos",
    "footer.statusMaint": "En mantenimiento",
    "footer.statusUnknown": "Status…",
    "footer.terms": "Términos",
    "footer.privacy": "Privacidad",
    "footer.cookies": "Cookies",
    "footer.yourData": "Tus datos",
    "footer.copyright": "Copyright",
    "common.discord": "Entrar en Discord",
    "common.close": "Cerrar",
    "common.loading": "Cargando…",
    "common.save": "Guardar",
    "common.cancel": "Cancelar",
    "common.retry": "Reintentar",
    "common.back": "Atrás",
    "home.badge": "Comunidad Discord italiana",
    "home.badgeLead": "Comunidad italiana de",
    "home.badgeWords": "música|café|gaming|charlas|amistades",
    "home.loop": "Vinili ✦ Caffè ✦ Música ✦ Gaming ✦ Amigos ✦ ",
    "home.welcome": "Bienvenid*s a",
    "home.welcomeM": "Bienvenido a",
    "home.welcomeF": "Bienvenida a",
    "home.lead":
      "Una comunidad chill donde se puede hablar de todo: roles, canales, eventos, bots caseros y lo que quieras. Pon un vinilo, el café está listo.",
    "home.exploreCta": "Explora la comunidad",
    "home.scroll": "Desplázate para continuar",
    "stats.kicker": "En directo desde el servidor",
    "stats.title": "El servidor siempre está vivo",
    "home.scrollHint": "Desplázate",
    "stats.members": "Miembros",
    "stats.online": "En línea ahora",
    "stats.boosts": "Boost",
    "stats.staff": "Staff",
    "stats.showDetail": "Toca para ver detalles",
    "stats.hideDetail": "Cerrar detalles",
    "stats.rosterEmpty": "No hay detalles disponibles ahora.",
    "stats.owner": "Owner",
    "stats.paused": "En pausa",
    "stats.staffOfMonth": "Staff del mes",
    "stats.boostCount": "{n} boost",
    "stats.boostersKicker": "Boosters",
    "stats.boostersCount": "{people} personas · {boosts} boost",
    "stats.staffKicker": "El staff",
    "stats.staffCount": "{people} personas",
    "stats.pulseActive": "Activos (7d)",
    "stats.pulseMessages": "Mensajes (7d)",
    "stats.pulseVoice": "Voz (7d)",
    "stats.pulseKicker": "Estadísticas del server",
    "stats.pulseSub": "últimos 7 días",
    "stats.pulseMessagesLabel": "Mensajes",
    "stats.pulseMessagesHint": "en el chat de la comunidad",
    "stats.pulseVoiceLabel": "Vocales",
    "stats.pulseVoiceHint": "horas pasadas juntos",
    "stats.pulseActiveLabel": "Miembros activos",
    "stats.pulseActiveHint": "escribieron o estuvieron en voz",
    "stats.hoursTitle": "Franjas más activas",
    "stats.hoursKicker": "Cuándo encontrarnos",
    "stats.hoursSub": "las franjas más vivas",
    "stats.hoursHot": "El momento cumbre",
    "stats.hoursOnlineNow": "{n} en línea ahora",
    "notif.title": "Notificaciones",
    "notif.empty": "Ninguna notificación por ahora.",
    "notif.markAll": "Marcar leídas",
    "notif.seeAll": "Ver todas",
    "notif.delete": "Eliminar notificación",
    "notif.unreadAria": "{n} notificaciones sin leer",
    "why.kicker": "Por qué Vinili & Caffè",
    "why.title": "Un sitio al que volver,",
    "why.titleEm": "como tu comunidad de siempre",
    "why.1.title": "En crecimiento constante",
    "why.1.text": "Expansión continua con un público italiano joven y involucrado.",
    "why.2.title": "Eventos y sorteos",
    "why.2.text": "Noches de cine, eventos de temporada y sorteos frecuentes para toda la comunidad.",
    "why.3.title": "Bots personalizados",
    "why.3.text": "Bots caseros, moderación avanzada y funciones que no encuentras en otro sitio.",
    "reviews.kicker": "Lo que dicen",
    "reviews.title": "Reseñas",
    "reviews.titleEm": "del servidor",
    "reviews.all": "Leer todas las reseñas",
    "reviews.manual": "Desplazar a mano",
    "reviews.auto": "Reanudar el desplazamiento",
    "reviews.prev": "Reseñas anteriores",
    "reviews.next": "Reseñas siguientes",
    "reviews.stamp": "VINILI & CAFFÈ • DEL SERVIDOR • ",
    "reviews.count": "{n} reseñas",
    "explore.kicker": "Índice",
    "explore.title": "Todo lo que necesitas, en un solo lugar",
    "cookie.aria": "Aviso de cookies",
    "cookie.kicker": "En el sitio",
    "cookie.bodyBefore": "Usamos",
    "cookie.essentials": "cookies esenciales",
    "cookie.bodyMid": "y Analytics.",
    "cookie.policy": "Política de cookies",
    "cookie.reject": "Solo esenciales",
    "cookie.accept": "Aceptar",
    "live.pill": "En directo",
    "live.vod": "Último VOD",
    "live.lastLive": "Última live",
    "live.lastVod": "Último VOD",
    "live.twitch": "Twitch",
    "live.kick": "Kick",
    "live.pillAria": "Abrir {name} en {platform}",
    "live.close": "Cerrar vista previa",
    "live.play": "Reproducir vista previa",
    "live.playerTwitch": "Reproductor de Twitch",
    "live.playerKick": "Reproductor en directo de Kick",
    "live.openTwitch": "Abrir en Twitch",
    "live.openKick": "Abrir en Kick",
    "live.viewers": "{n} espectadores",
    "live.views": "{n} visualizaciones",
    "live.previewEnded": "Vista previa terminada",
    "live.previewLimit": "Has llegado a los 10 minutos de vista previa. Sigue en Kick.",
    "live.previewFail": "Vista previa no disponible",
    "live.previewFailHint": "No consigo iniciar la vista previa. Sigue en Kick.",
    "live.unmute": "Activar audio",
    "live.mute": "Silenciar",
    "live.sub": "Vincular Kick Sub",
    "live.subLogin": "Entra para el Sub",
    "live.subActive": "Sub activo",
    "live.subLinked": "Kick vinculado",
    "live.subLinkedHint":
      "Kick está vinculado, pero el rol aún no está asignado. Para recibirlo escribe al menos un mensaje en el chat del streamer en Kick (tienes que ser sub). El vínculo solo no asigna el rol.",
    "live.subError": "No consigo abrir el enlace de Kick. Reinténtalo.",
  },
};

export function normalizeLocale(raw: unknown): Locale | "" {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (!s) return "";
  const base = s.split("-")[0] || "";
  return (LOCALES as readonly string[]).includes(base) ? (base as Locale) : "";
}

const packCache = new Map<string, Dict>();

export async function loadLocalePack(lang: Locale): Promise<Dict | null> {
  if ((CURATED_LOCALES as readonly string[]).includes(lang) && lang !== "en") {
    // it/es: curate in DICTS; en pack remoto opzionale per chiavi legacy
  }
  if (packCache.has(lang)) return packCache.get(lang)!;
  try {
    const r = await fetch(`/js/i18n/locales/${encodeURIComponent(lang)}.json`, {
      cache: "force-cache",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as Dict;
    if (!j || typeof j !== "object") return null;
    packCache.set(lang, j);
    return j;
  } catch {
    return null;
  }
}

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
  pack?: Dict | null,
): string {
  const curated = (CURATED_LOCALES as readonly string[]).includes(locale)
    ? DICTS[locale as CuratedLocale]
    : undefined;
  const raw =
    pack?.[key] ??
    curated?.[key] ??
    DICTS.en?.[key] ??
    DICTS.it[key] ??
    key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`,
  );
}

function readStoredLocale(): Locale | "" {
  try {
    const fromLs = normalizeLocale(localStorage.getItem(STORAGE_KEY));
    if (fromLs) return fromLs;
  } catch {}
  try {
    const m = String(document.cookie || "").match(/(?:^|;\s*)vc_site_lang=([a-z]{2})/i);
    if (m) return normalizeLocale(m[1]);
  } catch {}
  try {
    const q = new URLSearchParams(location.search);
    const fromQ = normalizeLocale(q.get("lang") || q.get("locale"));
    if (fromQ) return fromQ;
  } catch {}
  try {
    const list = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const l of list) {
      const n = normalizeLocale(l);
      if (n) return n;
    }
  } catch {}
  return "";
}

function persistLocale(lang: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  try {
    document.cookie =
      "vc_site_lang=" +
      lang +
      "; Path=/; Max-Age=31536000; SameSite=Lax" +
      (location.protocol === "https:" ? "; Secure" : "");
  } catch {}
  try {
    document.documentElement.lang = lang;
    document.documentElement.setAttribute("data-vc-lang", lang);
  } catch {}
}

function bridgeLegacyVcI18n(lang: Locale) {
  try {
    const api = (window as unknown as { VcI18n?: { setLang?: (l: string, o?: object) => void } }).VcI18n;
    api?.setLang?.(lang, { skipApply: true, skipUrl: true, fromUser: false });
  } catch {}
}

/** Soft sync: solo se l’API chrome-prefs espone già `prefs.lang` (oggi no). */
async function pullChromePrefsLang(token: string | null): Promise<Locale | ""> {
  if (!token) return "";
  try {
    const r = await fetch(CHROME_PREFS, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "same-origin",
    });
    if (!r.ok) return "";
    const j = (await r.json()) as { prefs?: { lang?: string }; lang?: string };
    return normalizeLocale(j?.prefs?.lang || j?.lang);
  } catch {
    return "";
  }
}

async function pushChromePrefsLang(token: string | null, lang: Locale) {
  if (!token) return;
  try {
    await fetch(CHROME_PREFS, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ lang }),
    });
  } catch {}
}

type I18nValue = {
  locale: Locale;
  setLocale: (lang: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  ready: boolean;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  children,
  token = null,
}: {
  children: ReactNode;
  /** Bearer Discord: sync soft con site-chrome-prefs se supporta lang. */
  token?: string | null;
}) {
  const [locale, setLocaleState] = useState<Locale>("it");
  const [pack, setPack] = useState<Dict | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      let next = readStoredLocale() || ("it" as Locale);
      const remote = await pullChromePrefsLang(token);
      if (remote) next = remote;
      if (cancelled) return;
      setLocaleState(next);
      persistLocale(next);
      setReady(true);
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    if ((CURATED_LOCALES as readonly string[]).includes(locale)) {
      setPack(null);
      return;
    }
    void loadLocalePack(locale).then((p) => {
      if (!cancelled) setPack(p);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const setLocale = useCallback(
    (lang: Locale) => {
      const next = normalizeLocale(lang) || "it";
      setLocaleState(next);
      persistLocale(next);
      bridgeLegacyVcI18n(next);
      void pushChromePrefsLang(token, next);
      try {
        document.dispatchEvent(new CustomEvent("vc:langchange", { detail: { lang: next } }));
      } catch {}
    },
    [token],
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars, pack),
    [locale, pack],
  );

  const value = useMemo(() => ({ locale, setLocale, t, ready }), [locale, setLocale, t, ready]);
  return createElement(I18nContext.Provider, { value }, children);
}

/** Monta sotto AuthProvider: passa il token Discord per sync soft chrome-prefs. */
export function I18nFromAuth({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  return createElement(I18nProvider, { token, children });
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n fuori da <I18nProvider>");
  return ctx;
}

/** Traduzione senza hook (SSR / fuori provider): fallback IT. */
export function tStatic(key: string, locale: Locale = "it", vars?: Record<string, string | number>) {
  return translate(locale, key, vars);
}
