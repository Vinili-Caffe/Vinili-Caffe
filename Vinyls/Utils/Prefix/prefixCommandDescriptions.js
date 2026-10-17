const PREFIX_COMMAND_DESCRIPTIONS = Object.freeze({
  help: "Mostra tutti i comandi disponibili con il bot.",
  afk: "Imposta il tuo stato AFK con un messaggio personalizzato.",
  avatar: "Mostra l'avatar di un utente.",
  banner: "Mostra il banner di un utente.",
  voices: "Mostra le voci TTS disponibili.",
  membercount: "Mostra il numero totale di membri del server.",
  ping: "Mostra latenza bot, database e informazioni di uptime.",
  invite: "Invia il link per invitare il bot in un server.",
  invites: "Mostra gli inviti Discord attivi, gli usi e chi è entrato.",
  profile: "Apre il profilo partnership su server tenant.",
  ship: "Calcola la compatibilità tra due utenti.",
  wordle: "Wordle giornaliero: indovina una parola di 5 lettere (IT/EN).",
  wdl: "Alias di +wordle.",
  parola: "Alias di +wordle.",
  snipe: "Recupera l'ultimo messaggio eliminato nel canale.",
  join: "Fa entrare il bot nel tuo canale vocale.",
  leave: "Fa uscire il bot dal canale vocale.",
  set: "Configura autojoin TTS e la lingua della voce.",
  classifica: "Mostra la classifica livelli.",
  mstats: "Mostra statistiche minigiochi di un utente.",
  me: "Mostra le tue statistiche attività.",
  user: "Mostra le statistiche attività di un utente.",
  server: "Mostra statistiche attività del server.",
  channel: "Mostra le statistiche attività di un canale.",
  top: "Mostra la top completa utenti/canali.",
  rank: "Mostra il tuo livello e posizione in classifica.",
  bal: "Mostra Vinili, Caffè e Galeoni con pannello interattivo.",
  work: "Turno di lavoro: guadagni Vinili e Caffè con streak.",
  daily: "Ricompensa giornaliera in Vinili e Caffè.",
  weekly: "Ricompensa settimanale in Vinili e Caffè.",
  monthly: "Ricompensa mensile in Vinili e Caffè.",
  rob: "Furto contro cassaforte o utente.",
  shop: "Shop Vinili e Caffè con boost per economia server.",
  roulette: "Roulette interattiva.",
  rps: "Morra cinese vs bot o PvP.",
  slots: "Slots interattive.",
  blackjack: "Blackjack vs banco.",
  coinflip: "Testa o croce con moneta animata.",
  tris: "Tris vs bot o PvP.",
  scratch: "Gratta e vinci con biglietto realistico.",
  info: "Mostra una scheda completa di un utente.",
  description: "Invia nel ticket la descrizione ufficiale del server.",
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
  blacklist: "Mostra i server blacklistati uno alla volta con navigazione.",
  history: "Cronologia partnership recenti del server corrente o di un altro server partnership.",
  points: "Punti partnership PM su questo server, con gestione admin per Partner Manager.",
  badges: "Elenco dei badge partnership sbloccati.",
  leaderboard: "Classifiche globali join, partners e servers.",
  random: "Estrae un server partnership casuale.",
  security: "Pannello sicurezza con toggle moduli istantanei.",
  level: "Pannello gestione livelli.",
  backup: "Pannello backup del server.",
  setup: "Guidato setup partnership del server.",
  settings: "Impostazioni personali.",
  quit: "Forza l'uscita di emergenza del processo bot.",
  quote: "Genera una quote da un messaggio.",
  clip: "Pubblica una clip vocale sulla bacheca.",
  repost: "Condivide un messaggio sulla bacheca.",
  myrepost: "Elenco dei repost che hai pubblicato sulla bacheca.",
  myclip: "Elenco delle clip vocali che hai pubblicato sulla bacheca.",
  myquote: "Elenco delle quote che hai pubblicato sulla bacheca.",
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
  Partnership: "Menu contesto messaggio: invia una partnership dal messaggio selezionato.",
  "Elimina partnership":
  "Menu contesto messaggio: elimina una partnership dal log o dal messaggio selezionato.",
  "Aggiungi punti": "Menu contesto utente: aggiunge punti partnership al membro selezionato.",
  "Rimuovi punti": "Menu contesto utente: rimuove punti partnership dal membro selezionato.",
  Segnala: "Menu contesto messaggio: segnala una descrizione partnership.",
  Sanziona: "Menu contesto utente: apre il flusso sanzione moderazione.",
  delete: "Elimina risorse partnership tramite ID log.",
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

function resolvePrefixCommandDescription(commandName, fallback = "") {
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

function resolveApplicationCommandDescription(discordName, fallback = "") {
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

function resolvePrefixSubcommandDescription(commandName, subcommandName, fallback = "") {
  const cmd = String(commandName || "")
    .trim()
    .toLowerCase();
  const sub = String(subcommandName || "")
    .trim()
    .toLowerCase();
  if (!cmd || !sub) return String(fallback || "").trim();
  return PREFIX_SUBCOMMAND_DESCRIPTIONS[`${cmd}.${sub}`] || String(fallback || "").trim();
}

module.exports = {
  PREFIX_COMMAND_DESCRIPTIONS,
  PREFIX_SUBCOMMAND_DESCRIPTIONS,
  APPLICATION_COMMAND_DESCRIPTIONS,
  DASHBOARD_PREFIX_DESCRIPTION_OVERRIDES,
  resolvePrefixCommandDescription,
  resolveApplicationCommandDescription,
  resolvePrefixSubcommandDescription,
};
