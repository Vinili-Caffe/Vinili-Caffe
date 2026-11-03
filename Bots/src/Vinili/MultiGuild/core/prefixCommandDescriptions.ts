const PREFIX_COMMAND_DESCRIPTIONS = Object.freeze({
  help: "Mostra tutti i comandi disponibili con il bot.",
  afk: "Imposta il tuo stato AFK con un messaggio personalizzato.",
  reminder: "Imposta un reminder nel canale con data/ora e motivo.",
  avatar: "Mostra l'avatar di un utente.",
  banner: "Mostra il banner di un utente.",
  voices: "Mostra le voci TTS disponibili.",
  membercount: "Mostra il numero totale di membri del server.",
  ping: "Mostra latenza bot, database e informazioni di uptime.",
  invite: "Invia il link per invitare il bot in un altro server.",
  invites: "Mostra gli inviti Discord attivi, gli usi e chi è entrato.",
  profile: "Apre il profilo partnership di un Partner Manager.",
  ship: "Calcola la compatibilità tra due utenti.",
  snipe: "Recupera l'ultimo messaggio eliminato nel canale.",
  join: "Fa entrare il bot nel tuo canale vocale.",
  leave: "Fa uscire il bot dal canale vocale.",
  set: "Configura autojoin TTS e la lingua della voce.",
  classifica: "Mostra la classifica livelli.",
  me: "Mostra le tue statistiche attività.",
  user: "Mostra le statistiche attività di un utente.",
  server: "Mostra statistiche attività del server.",
  channel: "Mostra le statistiche attività di un canale.",
  top: "Mostra la top completa utenti/canali.",
  rank: "Mostra il tuo livello e posizione in classifica.",
  info: "Mostra una scheda completa di un utente.",
  description: "Mostra la descrizione partnership (ticket sul main, PM sui tenant).",
  purge: "Elimina messaggi da un canale.",
  ban: "Banna un utente.",
  unban: "Rimuove il ban di un utente.",
  kick: "Kicka un utente dal server.",
  mute: "Applica timeout a un utente.",
  unmute: "Rimuove il timeout da un utente.",
  warn: "Warna un utente.",
  warnings: "Mostra i warn attivi di un utente.",
  delwarn: "Rimuove un warn attivo da un utente.",
  clearwarn: "Rimuove tutti i warning attivi da un utente.",
  case: "Mostra una singola case moderazione.",
  reason: "Aggiorna il motivo di una case.",
  duration: "Aggiorna la durata di una case temporanea.",
  modlogs: "Mostra gli ultimi log moderazione di un utente.",
  moderations: "Mostra tutte le moderazioni temporanee attive.",
  lock: "Blocca un canale.",
  unlock: "Sblocca un canale.",
  blacklist: "Gestisce la blacklist partnership (pannello sul main, lista/comandi sui tenant).",
  history: "Cronologia partnership recenti del server corrente o di un altro server partnership.",
  points: "Punti partnership PM su questo server, con gestione admin per Partner Manager.",
  badges: "Elenco dei badge partnership sbloccati.",
  leaderboard: "Classifiche globali join, partners e servers.",
  random: "Estrae un server partnership casuale.",
  security: "Pannello sicurezza con toggle moduli istantanei.",
  level: "Pannello gestione livelli.",
  backup: "Pannello backup del server.",
  setup: "Setup guidato partnership (sul main: già completo → usa +settings).",
  settings: "Pannello impostazioni partnership del server.",
  quit: "Forza l'uscita di emergenza del processo bot.",
  quote: "Genera una quote da un messaggio.",
  clip: "Pubblica una clip vocale sulla bacheca.",
  repost: "Condivide un messaggio sulla bacheca.",
  pause: "Mette in pausa la traccia in riproduzione.",
  resume: "Riprende la traccia in pausa.",
  skip: "Salta la traccia in riproduzione e passa alla successiva in coda.",
  stop: "Ferma la musica, svuota la coda e fa uscire il bot dal canale vocale.",
  volume: "Imposta il volume della musica.",
  shuffle: "Mescola l'ordine dei brani in coda.",
  clear: "Svuota la coda dei brani in attesa.",
  repeat: "Ripetizione traccia, ripetizione della coda, disattiva tutto.",
  previous: "Torna al brano riprodotto prima di quello attuale.",
  play: "Cerca e riproduce una traccia o playlist nel canale vocale.",
  queue: "Mostra la coda musicale corrente.",
  lyrics: "Mostra il testo del brano in riproduzione o cercato.",
  nowplaying: "Mostra il brano in riproduzione.",
  np: "Mostra il brano in riproduzione.",
  requested: "Mostra chi ha richiesto il brano corrente.",
  upcoming: "Mostra i prossimi brani in coda.",
  rewind: "Torna indietro nella traccia corrente.",
  restart: "Riavvia la traccia corrente dall'inizio.",
});

const PREFIX_SUBCOMMAND_DESCRIPTIONS = Object.freeze({
  "reminder.list": "Elenca i tuoi reminder in attesa.",
  "reminder.cancel": "Annulla un reminder con il suo id corto.",
  "set.autojoin": "Attiva o disattiva autojoin TTS.",
  "set.voice": "Imposta la lingua TTS personale.",
  "now.playing": "Mostra il brano in riproduzione.",
  "next.up": "Mostra il prossimo brano in coda.",
  "repeat.disable": "Disattiva la ripetizione della traccia.",
  "repeat.enable": "Attiva la ripetizione della traccia.",
  "repeat.queue": "Attiva la ripetizione della coda.",
  "repeat.all": "Disattiva tutto.",
  "server.info": "Scheda informativa partnership di un server.",
  "user.info": "Scheda informativa partnership di un Partner Manager.",
  "random.server": "Estrae un server partnership casuale.",
});

const APPLICATION_COMMAND_DESCRIPTIONS = Object.freeze({
  partnership: "Apre il flusso per inviare una partnership.",
  "Partner messaggio": "Menu contesto messaggio: invia una partnership dal messaggio selezionato (solo MultiGuild).",
  Sanziona: "Menu contesto utente: apre il flusso sanzione moderazione.",
  delete: "Elimina una partnership tramite ID log (solo MultiGuild).",
  giveaway: "Crea o gestisci un giveaway.",
  poll: "Crea un poll.",
  role: "Gestione ruoli di massa.",
  copy: "Ruba e aggiungi sul tuo server.",
  music: "Controlla la riproduzione musicale del bot.",
  say: "Fa dire al bot un messaggio al posto tuo.",
});

const DASHBOARD_PREFIX_DESCRIPTION_OVERRIDES = Object.freeze({
  server: "Apre la scheda informativa di un server partner.",
  user: "Apre la scheda informativa di un Partner Manager.",
  profile: "Apre il profilo partnership di un Partner Manager.",
});

function resolvePrefixCommandDescription(commandName?, fallback = "") {
  const name = String(commandName || "")
    .trim()
    .toLowerCase();
  if (!name) return String(fallback || "").trim();
  return (
    DASHBOARD_PREFIX_DESCRIPTION_OVERRIDES[name] ||
    PREFIX_COMMAND_DESCRIPTIONS[name] ||
    String(fallback || "").trim()
  );
}

function resolveApplicationCommandDescription(discordName?, fallback = "") {
  const exact = String(discordName || "").trim();
  if (!exact) return String(fallback || "").trim();
  const fromMap =
    APPLICATION_COMMAND_DESCRIPTIONS[exact] ||
    APPLICATION_COMMAND_DESCRIPTIONS[exact.toLowerCase()] ||
    "";
  const fb = String(fallback || "").trim();
    if (fb && !/^<a?:/.test(fb) && fb.length <= 200) return fromMap || fb;
  return fromMap || "";
}

export = {
  PREFIX_COMMAND_DESCRIPTIONS,
  PREFIX_SUBCOMMAND_DESCRIPTIONS,
  APPLICATION_COMMAND_DESCRIPTIONS,
  resolvePrefixCommandDescription,
  resolveApplicationCommandDescription,
};
