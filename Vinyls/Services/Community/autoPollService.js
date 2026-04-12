const cron = require("node-cron");
const axios = require("axios");
const Poll = require("../../Schemas/Poll/pollSchema");
const IDs = require("../../Utils/Config/ids");
const { createPollForGuild } = require("../../Commands/Admin/poll");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const TIMEZONE = "Europe/Rome";
const COUNTER_FILTER_QUESTION = "__counter__";
const DEFAULT_WINDOW_START_HOUR = 19;
const DEFAULT_WINDOW_START_MINUTE = 0;
const DEFAULT_WINDOW_END_HOUR = 20;
const DEFAULT_WINDOW_END_MINUTE = 59;
const DEFAULT_SOURCES = ["openrouter", "local"];
const DEFAULT_OPENROUTER_MODELS = ["google/gemma-3-12b-it:free", "google/gemma-3-27b-it:free",];
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MAX_ROUNDS = 2;
const OPENROUTER_RETRY_DELAY_MS = 1500;
const OPENROUTER_RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;
const DEFAULT_OPENROUTER_RETRY_UNTIL_HOUR = 22;
const DEFAULT_DUPLICATE_LOOKBACK_DAYS = 60;
const DEFAULT_MAX_CANDIDATE_ATTEMPTS = 80;
const AUTO_POLL_RETRY_MS = 5 * 60 * 1000;
const MIN_MAX_CANDIDATE_ATTEMPTS = 5;
const ABS_MAX_CANDIDATE_ATTEMPTS = 250;
const GENERIC_OPENROUTER_MODEL_ALIASES = new Set(["openrouter/free", "openrouter/auto"]);
let openRouterCooldownUntil = 0;
const WARN_POLL_OPENROUTER_INTERVAL_MS = 60 * 1000;
let lastWarnPollOpenRouterAt = 0;

function warnPollOpenRouter(...args) {
  const now = Date.now();
  if (now - lastWarnPollOpenRouterAt < WARN_POLL_OPENROUTER_INTERVAL_MS) return;
  lastWarnPollOpenRouterAt = now;
  global.logger?.warn?.("[poll.auto]", ...args);
}

const LOCAL_POLLS_BANK = [
  { question: "Qual è il momento migliore della giornata?", answers: ["Mattina presto", "Tarda mattinata", "Pomeriggio", "Prima serata", "Notte"] },
  { question: "Quale stagione ti rappresenta di più?", answers: ["Primavera", "Estate", "Autunno", "Inverno"] },
  { question: "Come preferisci iniziare la giornata?", answers: ["Con calma", "Con una colazione abbondante", "Allenandomi", "Con musica o podcast", "Di corsa ma produttivo"] },
  { question: "Quale tipo di vacanza sceglieresti?", answers: ["Mare", "Montagna", "Città d'arte", "Road trip", "Relax totale"] },
  { question: "Cosa conta di più in un film?", answers: ["Trama", "Personaggi", "Colonna sonora", "Finale", "Fotografia"] },
  { question: "Quale pasto preferisci in assoluto?", answers: ["Colazione", "Pranzo", "Cena", "Spuntino"] },
  { question: "Che rapporto hai con il freddo?", answers: ["Lo adoro", "Mi piace solo se sono coperto bene", "Lo tollero", "Lo odio"] },
  { question: "Se potessi vivere in un'altra epoca, quale sceglieresti?", answers: ["Anni 80", "Anni 90", "Primi 2000", "Futuro", "Resto nel presente"] },
  { question: "Quale qualità apprezzi di più in una persona?", answers: ["Sincerità", "Ironia", "Intelligenza", "Gentilezza", "Determinazione"] },
  { question: "Come scegli di solito cosa guardare la sera?", answers: ["Consigli degli amici", "Trending", "Vado a caso", "Riguardo qualcosa che conosco", "Recensioni online"] },
  { question: "Qual è il tuo comfort food ideale?", answers: ["Pizza", "Pasta", "Dolci", "Panino o fast food", "Cibo fatto in casa"] },
  { question: "Che tipo di weekend preferisci?", answers: ["Pieno di impegni", "Fuori casa", "Chill totale", "Tra amici", "Improvvisato"] },
  { question: "Quale mezzo di trasporto sopporti meglio?", answers: ["Auto", "Treno", "Aereo", "Moto", "A piedi"] },
  { question: "Quale app usi più spesso in una giornata normale?", answers: ["WhatsApp", "Instagram", "TikTok", "YouTube", "Spotify"] },
  { question: "Che tipo di meteo ti mette più di buon umore?", answers: ["Sole pieno", "Pioggia leggera", "Temporale", "Freddo secco", "Cielo coperto"] },
  { question: "Se dovessi scegliere un superpotere, quale prenderesti?", answers: ["Teletrasporto", "Leggere nel pensiero", "Invisibilità", "Volare", "Fermare il tempo"] },
  { question: "Che tipo di contenuto ti intrattiene di più?", answers: ["Video brevi", "Film", "Serie TV", "Podcast", "Streaming live"] },
  { question: "Quando sei stanco, cosa ti recupera prima?", answers: ["Dormire", "Mangiare", "Uscire", "Musica", "Stare da solo"] },
  { question: "Se potessi cambiare una cosa del tuo carattere, cosa sarebbe?", answers: ["Ansia", "Pigrizia", "Timidezza", "Impulsività", "Nulla, mi va bene così"] },
  { question: "Quale drink scegli più spesso?", answers: ["Acqua", "Caffè", "Tè", "Energy drink", "Bibita"] },
  { question: "Preferisci ascoltare musica con cuffie o casse?", answers: ["Cuffie", "Casse", "Entrambi", "Dipende dal momento"] },
  { question: "Quando scopri una canzone che ti piace, cosa fai?", answers: ["La metto in loop", "La aggiungo a una playlist", "La condivido", "La ascolto e basta"] },
  { question: "Se dovessi scegliere un solo genere musicale per sempre, quale?", answers: ["Pop", "Rap/Trap", "Rock", "Elettronica", "Indie"] },
  { question: "Team karaoke?", answers: ["Sì, sempre", "Solo con amici", "Mai", "Dipende dall'alcol"] },
  { question: "Sei più da playlist o da album?", answers: ["Playlist", "Album", "Entrambi", "Dipende dall'artista"] },
  { question: "Qual è la tua snack choice da film/serie?", answers: ["Popcorn", "Patatine", "Dolci", "Frutta", "Niente"] },
  { question: "Dolce preferito in generale?", answers: ["Tiramisù", "Gelato", "Cioccolato", "Biscotti", "Torte"] },
  { question: "Pizza: quale scegli più spesso?", answers: ["Margherita", "Diavola", "Quattro formaggi", "Capricciosa", "Dipende"] },
  { question: "Pasta: come la preferisci?", answers: ["Rossa", "Bianca", "Pesto", "Piccante", "Dipende"] },
  { question: "Caffè: come lo prendi di solito?", answers: ["Espresso", "Macchiato", "Cappuccino", "Freddo", "Non bevo caffè"] },
  { question: "Se potessi mangiare una sola cucina per una settimana?", answers: ["Italiana", "Giapponese", "Messicana", "Americana", "Cinese"] },
  { question: "Colazione: quanto è importante per te?", answers: ["Fondamentale", "Carina ma non sempre", "La salto spesso", "Solo caffè", "Dipende"] },
  { question: "Scegli: salato o dolce?", answers: ["Salato", "Dolce", "Entrambi", "Dipende dall'umore"] },
  { question: "Se potessi avere un animale domestico “perfetto”, quale?", answers: ["Gatto", "Cane", "Coniglio", "Uccellino", "Nessuno"] },
  { question: "Preferisci stare in casa o uscire?", answers: ["In casa", "Uscire", "Un po' e un po'", "Dipende dal meteo"] },
  { question: "Quando vuoi rilassarti, cosa scegli?", answers: ["Musica", "Serie/film", "Gaming", "Passeggiata", "Dormire"] },
  { question: "Quanto sei puntuale di solito?", answers: ["Sempre puntuale", "5 minuti di ritardo", "Spesso in ritardo", "Dipende", "Arrivo troppo presto"] },
  { question: "Sei più da organizzazione o improvvisazione?", answers: ["Organizzazione", "Improvvisazione", "Mix", "Dipende dal contesto"] },
  { question: "Come preferisci comunicare?", answers: ["Messaggi", "Chiamate", "Vocali", "Dal vivo", "Dipende"] },
  { question: "Vocali: li mandi spesso?", answers: ["Sempre", "Ogni tanto", "Raramente", "Mai", "Solo se necessario"] },
  { question: "Qual è la tua “modalità studio/lavoro” ideale?", answers: ["Silenzio", "Musica", "Rumore bianco", "Caffè e caos", "Dipende"] },
  { question: "Sei più produttivo/a di giorno o di sera?", answers: ["Di giorno", "Di sera", "Notte", "Dipende", "Mai"] },
  { question: "Che tipo di sport ti piace di più?", answers: ["Fitness/palestra", "Sport di squadra", "Corsa", "Nessuno", "Altro"] },
  { question: "Se potessi imparare subito una skill, quale?", answers: ["Suonare uno strumento", "Cucinare bene", "Parlare una lingua", "Programmare", "Disegnare"] },
  { question: "Quale lingua vorresti sapere meglio?", answers: ["Inglese", "Spagnolo", "Giapponese", "Francese", "Tedesco"] },
  { question: "Se potessi vivere in una città a caso, dove?", answers: ["Roma", "Milano", "Napoli", "Firenze", "All'estero"] },
  { question: "Mare: cosa fai di solito?", answers: ["Nuoto", "Prendo il sole", "Passeggiata", "Sport", "Dipende"] },
  { question: "Montagna: cosa preferisci?", answers: ["Escursioni", "Relax", "Sci", "Foto/panorami", "Dipende"] },
  { question: "Qual è il tuo “sì” automatico tra questi?", answers: ["Sushi", "Pizza", "Gelato", "Cinema", "Caffè"] },
  { question: "Quando sei stressato/a, cosa fai per primo?", answers: ["Dormo", "Parlo con qualcuno", "Musica", "Esco", "Mangio"] },
  { question: "Quale social ti stanca di più?", answers: ["TikTok", "Instagram", "X/Twitter", "Facebook", "Nessuno"] },
  { question: "Quanto guardi video brevi?", answers: ["Troppo", "Abbastanza", "Poco", "Quasi mai", "Dipende"] },
  { question: "Se potessi eliminare una cosa per sempre, quale?", answers: ["Pubblicità", "Zanzare", "Traffico", "Ansia", "Lunedì"] },
  { question: "Quale emoji usi più spesso?", answers: ["😂", "😭", "❤️", "✨", "😅"] },
  { question: "Sei più da chat di gruppo o DM?", answers: ["Chat di gruppo", "DM", "Entrambi", "Dipende"] },
  { question: "Preferisci leggere o guardare?", answers: ["Leggere", "Guardare", "Entrambi", "Dipende"] },
  { question: "Libro: come lo preferisci?", answers: ["Cartaceo", "E-book", "Audiolibro", "Non leggo", "Dipende"] },
  { question: "Videogiochi: quando giochi di più?", answers: ["Sera", "Notte", "Weekend", "Mai", "Dipende"] },
  { question: "Che tipo di giochi preferisci?", answers: ["Story", "Competitivi", "Co-op", "Casual", "Non gioco"] },
  { question: "Scegli un mood di serata perfetto:", answers: ["Cinema e relax", "Uscita con amici", "Gaming", "Musica e chill", "Dormire presto"] },
  { question: "Preferisci essere chiamato/a o scrivere?", answers: ["Chiamato/a", "Scrivere", "Entrambi", "Dipende"] },
  { question: "Se potessi avere un “tasto”, quale?", answers: ["Pausa", "Riavvolgi", "Salta", "Silenzio", "Turbo"] },
  { question: "Sei più da doccia mattina o sera?", answers: ["Mattina", "Sera", "Entrambe", "Dipende"] },
  { question: "Qual è la tua pasta shape preferita?", answers: ["Spaghetti", "Penne", "Fusilli", "Rigatoni", "Tagliatelle"] },
  { question: "Gelato: cono o coppetta?", answers: ["Cono", "Coppetta", "Entrambi", "Dipende"] },
  { question: "Cioccolato: fondente o al latte?", answers: ["Fondente", "Al latte", "Bianco", "Non mi piace", "Dipende"] },
  { question: "Se dovessi scegliere un hobby nuovo, quale?", answers: ["Fotografia", "Palestra", "Cucina", "Disegno", "Collezionismo"] },
  { question: "Quanto sei competitivo/a?", answers: ["Molto", "Abbastanza", "Poco", "Per niente", "Dipende"] },
  { question: "Quale ti descrive meglio?", answers: ["Calmo/a", "Energico/a", "Ansioso/a", "Ironico/a", "Introverso/a"] },
  { question: "Sei più da “parlo tanto” o “ascolto tanto”?", answers: ["Parlo", "Ascolto", "Entrambi", "Dipende"] },
  { question: "Ti piace cucinare?", answers: ["Sì", "Un po'", "No", "Solo cose facili", "Dipende"] },
  { question: "Quando guardi una serie, come fai?", answers: ["Binge", "1 episodio al giorno", "A caso", "Solo weekend", "Dipende"] },
  { question: "Quale “vibe” di musica preferisci?", answers: ["Chill", "Energica", "Triste", "Romantica", "Dipende"] },
  { question: "Preferisci l'estate per...", answers: ["Mare", "Serate", "Vacanze", "Vestiario", "Non la preferisco"] },
  { question: "Preferisci l'inverno per...", answers: ["Coperte", "Cioccolata calda", "Atmosfera", "Sport invernali", "Non lo preferisco"] },
  { question: "Cosa ti fa perdere più tempo?", answers: ["Scroll", "Serie", "Gaming", "Chat", "Procrastinazione"] },
  { question: "Scegli: film horror sì o no?", answers: ["Sì", "No", "Solo con qualcuno", "Solo se non troppo", "Dipende"] },
  { question: "Se potessi vedere un film per la prima volta di nuovo?", answers: ["Sì, spesso", "Sì, qualche volta", "No", "Non ci penso", "Dipende"] },
  { question: "Quale tipo di film scegli più spesso?", answers: ["Commedia", "Azione", "Drammatico", "Fantasy", "Thriller"] },
  { question: "Se potessi scegliere un talento artistico, quale?", answers: ["Cantare", "Ballare", "Disegnare", "Recitare", "Scrivere"] },
  { question: "Preferisci conoscere poche persone ma bene o tante?", answers: ["Poche ma bene", "Tante", "Dipende", "Non lo so"] },
  { question: "Ti piace provare cose nuove?", answers: ["Sì sempre", "Spesso", "Ogni tanto", "Raramente", "Dipende"] },
  { question: "Qual è la tua “pausa” preferita?", answers: ["Caffè", "Snack", "Passeggiata", "TikTok", "Niente"] },
  { question: "Sei più da notte in bianco o sonno sacro?", answers: ["Notte in bianco", "Sonno sacro", "Dipende", "Non reggo più"] },
  { question: "Ti piace il piccante?", answers: ["Sì molto", "Abbastanza", "Poco", "No", "Dipende"] },
  { question: "Che tipo di pane preferisci?", answers: ["Pane fresco", "Focaccia", "Panino", "Crackers", "Indifferente"] },
  { question: "Cosa scegli al cinema?", answers: ["Popcorn", "Nachos", "Caramelle", "Bevanda", "Niente"] },
  { question: "Preferisci uscire a pranzo o a cena?", answers: ["Pranzo", "Cena", "Entrambi", "Dipende"] },
  { question: "Se potessi viaggiare domani, dove andresti?", answers: ["Mare", "Montagna", "Città europea", "USA", "Asia"] },
  { question: "Sei più da foto o da video?", answers: ["Foto", "Video", "Entrambi", "Dipende"] },
  { question: "Quanto ti piace fare foto?", answers: ["Molto", "Abbastanza", "Poco", "Per niente", "Dipende"] },
  { question: "Come preferisci ricevere una notizia?", answers: ["Subito", "Con calma", "A piccoli pezzi", "Non ditemelo", "Dipende"] },
  { question: "Cosa ti rende più felice tra queste?", answers: ["Una buona notizia", "Cibo buono", "Tempo libero", "Un messaggio", "Una canzone"] },
  { question: "Scegli una cosa da portarti sempre dietro:", answers: ["Cuffie", "Powerbank", "Acqua", "Agenda", "Caramelle"] },
  { question: "Se potessi avere un animale “fantasy”, quale?", answers: ["Drago", "Fenice", "Unicorno", "Grifone", "Gatto magico"] },
];

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function shuffle(list) {
  const arr = Array.isArray(list) ? [...list] : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandom(list) {
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)] || null;
}

function clampOptionCount(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(2, Math.min(10, Math.floor(n)));
}

function pickRandomFromRange(min, max) {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return a + Math.floor(Math.random() * (b - a + 1));
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function isOpenRouterCoolingDown() {
  return Date.now() < Number(openRouterCooldownUntil || 0);
}

function startOpenRouterCooldown() {
  openRouterCooldownUntil = Date.now() + OPENROUTER_RATE_LIMIT_COOLDOWN_MS;
}

function startOpenRouterCooldownWithRetryAfter(retryAfterMs) {
  const ms = Number.isFinite(Number(retryAfterMs)) ? Math.max(0, Number(retryAfterMs)) : OPENROUTER_RATE_LIMIT_COOLDOWN_MS;
  openRouterCooldownUntil = Date.now() + ms;
}

function parseRetryAfterMs(headers) {
  const retryAfterRaw = headers?.["retry-after"] || headers?.["Retry-After"];
  if (!retryAfterRaw) return null;

  if (typeof retryAfterRaw === "string") {
    const asNum = Number(retryAfterRaw);
    if (Number.isFinite(asNum) && asNum > 0) return asNum * 1000;
    const parsed = Date.parse(retryAfterRaw);
    if (Number.isFinite(parsed)) return Math.max(0, parsed - Date.now());
  }
  return null;
}

function resolveOpenRouterModels(cfg = {}) {
  const configuredModels = Array.isArray(cfg.openrouterModels) ? cfg.openrouterModels : String(process.env.OPENROUTER_MODEL || cfg.openrouterModel || "").split(",").map((entry) => entry.trim()).filter(Boolean);
  const sanitizedModels = configuredModels.map((entry) => String(entry || "").trim()).filter(Boolean).filter((entry) => !GENERIC_OPENROUTER_MODEL_ALIASES.has(entry.toLowerCase()));
  return sanitizedModels.length ? sanitizedModels : DEFAULT_OPENROUTER_MODELS;
}

function pickNextOptionTarget(client, cfg = {}) {
  const minOptions = clampOptionCount(cfg.minOptions, 4);
  const maxOptions = Math.max(minOptions, clampOptionCount(cfg.maxOptions, 5));
  const lowMax = Math.min(maxOptions, Math.max(minOptions, 4));
  const midMin = Math.max(minOptions, 5);
  const midMax = Math.min(maxOptions, 6);
  const highMin = Math.max(minOptions, 7);

  const pools = [];
  if (minOptions <= lowMax) pools.push({ key: "low", min: minOptions, max: lowMax });
  if (midMin <= midMax) pools.push({ key: "mid", min: midMin, max: midMax });
  if (highMin <= maxOptions) pools.push({ key: "high", min: highMin, max: maxOptions });
  if (!pools.length) return minOptions;

  const lastBand = String(client?._autoPollLastBand || "");
  let candidates = pools.filter((band) => band.key !== lastBand);
  if (!candidates.length) candidates = pools;
  const chosenBand = candidates[Math.floor(Math.random() * candidates.length)];
  const target = pickRandomFromRange(chosenBand.min, chosenBand.max);
  if (client) {
    client._autoPollLastBand = chosenBand.key;
    client._autoPollLastOptionCount = target;
  }
  return target;
}

function applyOptionCount(payload, cfg = {}, forcedTargetOptions = null, options = {}) {
  if (!payload) return null;
  const shuffleAnswers = options.shuffleAnswers !== false;
  const minOptions = clampOptionCount(cfg.minOptions, 4);
  const maxOptions = Math.max(minOptions, clampOptionCount(cfg.maxOptions, 6));
  const targetOptions = Number.isFinite(Number(forcedTargetOptions)) ? Math.max(minOptions, Math.min(maxOptions, Math.floor(Number(forcedTargetOptions)))) : maxOptions;
  let answers = Array.isArray(payload.answers) ? payload.answers.map((x) => normalizeText(String(x || ""))).filter(Boolean) : [];
  if (answers.length < minOptions) return null;
  if (shuffleAnswers) answers = shuffle(answers);
  answers = answers.slice(0, targetOptions);
  return {
    question: normalizeText(String(payload.question || "")),
    answers,
  };
}

function getRomeDayBounds(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", });
  const parts = fmt.formatToParts(now).reduce((acc, part) => { if (part.type !== "literal") acc[part.type] = part.value; return acc; }, {});
  const year = Number(parts.year || 0);
  const month = Number(parts.month || 1);
  const day = Number(parts.day || 1);
  const startRome = createUtcFromRomeLocal(year, month, day, 0, 0, 0);
  const endRome = createUtcFromRomeLocal(year, month, day + 1, 0, 0, 0);
  return { startRome, endRome };
}

function getDuplicateLookbackStart(cfg = {}) {
  const rawDays = Number(cfg?.duplicateLookbackDays);
  const days = Number.isFinite(rawDays)
    ? Math.max(1, Math.min(365, Math.floor(rawDays)))
    : DEFAULT_DUPLICATE_LOOKBACK_DAYS;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function resolveMaxCandidateAttempts(cfg = {}) {
  const raw = Number(cfg?.maxCandidateAttempts);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_CANDIDATE_ATTEMPTS;
  return Math.max(
    MIN_MAX_CANDIDATE_ATTEMPTS,
    Math.min(ABS_MAX_CANDIDATE_ATTEMPTS, Math.floor(raw)),
  );
}

function getRomeTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false, });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0,);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0,);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function isWithinAutoPollWindow(now = new Date(), cfg = {}) {
  const startHour = Number.isFinite(Number(cfg?.windowStartHour)) ? Number(cfg.windowStartHour) : DEFAULT_WINDOW_START_HOUR;
  const startMinute = Number.isFinite(Number(cfg?.windowStartMinute)) ? Number(cfg.windowStartMinute) : DEFAULT_WINDOW_START_MINUTE;
  const endHour = Number.isFinite(Number(cfg?.windowEndHour)) ? Number(cfg.windowEndHour) : DEFAULT_WINDOW_END_HOUR;
  const endMinute = Number.isFinite(Number(cfg?.windowEndMinute)) ? Number(cfg.windowEndMinute) : DEFAULT_WINDOW_END_MINUTE;
  const { hour, minute } = getRomeTimeParts(now);
  const nowTotal = hour * 60 + minute;
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  return nowTotal >= startTotal && nowTotal <= endTotal;
}

function getRomeOffsetMs(utcDate) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, timeZoneName: "shortOffset", hour: "2-digit", });
  const zoneName = formatter.formatToParts(utcDate).find((part) => part.type === "timeZoneName")?.value;
  const match = String(zoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i,);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(year, month, day, hour, minute, second) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
  return new Date(utcMs);
}

function msUntilRomeLocalHourDeadline(deadlineHour) {
  const h = Math.floor(Number(deadlineHour));
  if (!Number.isFinite(h) || h < 0 || h > 23) return 0;
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = fmt.formatToParts(now).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const y = Number(parts.year || 0);
  const mo = Number(parts.month || 1);
  const d = Number(parts.day || 1);
  const targetUtc = createUtcFromRomeLocal(y, mo, d, h, 0, 0);
  return Math.max(0, targetUtc.getTime() - now.getTime());
}

function buildLocalAttualitaPoll(cfg = {}, forcedTargetOptions = null) {
  const picked = pickRandom(LOCAL_POLLS_BANK);
  if (!picked) return null;
  return applyOptionCount(
    { question: picked.question, answers: picked.answers },
    cfg,
    forcedTargetOptions,
    { shuffleAnswers: false },
  );
}

async function pickNonDuplicateLocalPoll(guildId, cfg = {}, forcedTargetOptions = null) {
  const order = shuffle([...Array(LOCAL_POLLS_BANK.length).keys()]);
  for (const idx of order) {
    const picked = LOCAL_POLLS_BANK[idx];
    if (!picked) continue;
    const candidate = applyOptionCount(
      { question: picked.question, answers: picked.answers },
      cfg,
      forcedTargetOptions,
      { shuffleAnswers: false },
    );
    if (!candidate?.question || !Array.isArray(candidate.answers) || candidate.answers.length < 4) {
      continue;
    }
    if (await isDuplicateQuestion(guildId, candidate.question)) continue;
    if (await isDuplicatePollContent(guildId, candidate)) continue;
    return candidate;
  }
  return null;
}

function buildPollSignature(question, answers = []) {
  const q = normalizeText(String(question || "")).toLowerCase();
  const opts = Array.isArray(answers) ? answers.map((a) => normalizeText(String(a || "")).toLowerCase()).filter(Boolean) : [];
  const uniq = Array.from(new Set(opts)).sort();
  return `${q}||${uniq.join("|")}`;
}

async function hasManualPollToday(guildId) {
  const { startRome, endRome } = getRomeDayBounds();
  const count = await Poll.countDocuments({ guildId: String(guildId), domanda: { $ne: COUNTER_FILTER_QUESTION }, $or: [{ source: "manual" }, { source: { $exists: false } }], createdAt: { $gte: startRome, $lt: endRome }, }).catch(() => 0);
  return Number(count || 0) > 0;
}

async function hasAutoPollToday(guildId) {
  const { startRome, endRome } = getRomeDayBounds();
  const count = await Poll.countDocuments({ guildId: String(guildId), domanda: { $ne: COUNTER_FILTER_QUESTION }, source: "auto", createdAt: { $gte: startRome, $lt: endRome }, }).catch(() => 0);
  return Number(count || 0) > 0;
}

async function isDuplicateQuestion(guildId, question) {
  const normalized = normalizeText(question).toLowerCase();
  if (!normalized) return true;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lookbackStart = getDuplicateLookbackStart();
  const existing = await Poll.findOne({
    guildId: String(guildId),
    domanda: { $regex: new RegExp(`^${escaped}$`, "i") },
    $or: [{ source: { $in: ["manual", "auto"] } }, { source: { $exists: false } }],
    createdAt: { $gte: lookbackStart },
  }).lean().catch(() => null);
  return Boolean(existing);
}

async function isDuplicatePollContent(guildId, payload) {
  const signature = buildPollSignature(payload?.question, payload?.answers);
  if (!signature || signature === "||") return true;
  const lookbackStart = getDuplicateLookbackStart();
  const rows = await Poll.find({ guildId: String(guildId), domanda: { $ne: COUNTER_FILTER_QUESTION }, $or: [{ source: { $in: ["manual", "auto"] } }, { source: { $exists: false } }], }, { domanda: 1, risposta1: 1, risposta2: 1, risposta3: 1, risposta4: 1, risposta5: 1, risposta6: 1, risposta7: 1, risposta8: 1, risposta9: 1, risposta10: 1, },).sort({ createdAt: -1, _id: -1 }).limit(400).lean().catch(() => []);
  const scopedRows = rows.filter((row) => {
    const created = new Date(row?.createdAt || 0).getTime();
    return Number.isFinite(created) && created >= lookbackStart.getTime();
  });

  for (const row of scopedRows) {
    const rowAnswers = [row?.risposta1, row?.risposta2, row?.risposta3, row?.risposta4, row?.risposta5, row?.risposta6, row?.risposta7, row?.risposta8, row?.risposta9, row?.risposta10,];
    if (buildPollSignature(row?.domanda, rowAnswers) === signature) return true;
  }
  return false;
}

function extractStructuredText(responseData) {
  if (responseData && typeof responseData.output_text === "string") {
    return responseData.output_text;
  }
  const output = Array.isArray(responseData?.output) ? responseData.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const entry of content) {
      if (typeof entry?.text === "string" && entry.text.trim()) return entry.text;
    }
  }
  return "";
}

function unwrapJsonTextBlock(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const fencedMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();
  return text;
}

function validateGeneratedPollPayload(payload, cfg = {}, forcedTargetOptions = null) {
  const question = normalizeText(payload?.question);
  const rawAnswers = Array.isArray(payload?.answers) ? payload.answers : [];
  const answers = [];
  const seen = new Set();

  for (const entry of rawAnswers) {
    const answer = normalizeText(entry);
    const key = answer.toLowerCase();
    if (!answer || seen.has(key)) continue;
    seen.add(key);
    answers.push(answer);
  }

  if (!question || question.length < 12 || question.length > 120) return null;
  if (!/\?$/.test(question)) return null;
  if (/qual e la tua opinione su/i.test(question)) return null;
  if (/quale museo nazionale/i.test(question)) return null;
  if (answers.length < 4) return null;
  if (answers.some((answer) => answer.length < 2 || answer.length > 55)) return null;

  return applyOptionCount({ question, answers }, cfg, forcedTargetOptions);
}

async function fetchPollFromOpenRouter(cfg = {}, forcedTargetOptions = null) {
  const apiKey = String(process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) return null;
  if (isOpenRouterCoolingDown()) return null;

  const models = resolveOpenRouterModels(cfg);
  if (!models.length) return null;
  const optionCount = Math.max(4, Math.min(6, Number(forcedTargetOptions || 5)));
  let lastError = null;
  let had429 = false;

  for (const model of models) {
    if (isOpenRouterCoolingDown()) break;
    const payload = {
      model, messages: [{ role: "system", content: "Genera sondaggi su attualità per utenti italiani. Regole: (1) Italiano naturale, domande brevi e che invoglino a votare. (2) Evita domande generiche tipo 'Quanto sei preoccupato per X' o 'Qual è la tua opinione su Y'. (3) Preferisci domande su scelte concrete, preferenze chiare, fatti recenti o trend. (4) Temi: cronaca, società, politica, ambiente, lavoro, tech, economia, salute, diritti, Europa, media. (5) Risposte corte, coerenti tra loro, senza 'dipende'/'altro'/'non so' se non necessari. (6) Niente riferimenti a Discord o community. (7) Output solo JSON: {\"question\":\"...\",\"answers\":[\"...\"]}.", }, {
        role: "user", content: `Genera un poll con ${optionCount} risposte. Domanda su attualità: concreta, non generica. Esempi di stile: 'Se votassi domani per X, sceglieresti?', 'Dove andresti a vivere?', 'Quale notizia ti ha colpito di più?'. Opzioni concrete e realistiche. Solo JSON.`,
      },
      ],
      max_tokens: 220,
      temperature: 0.7,
    };

    try {
      const response = await axios.post(OPENROUTER_API_URL, payload, {
        timeout: 20000, headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://viniliecaffe.local",
          "X-Title": "Vinili e Caffe Bot",
        },
      });

      const choice = response?.data?.choices?.[0] || null;
      const finishReason = String(choice?.finish_reason || "");
      const content = choice?.message?.content || extractStructuredText(response?.data);
      if (!String(content || "").trim()) {
        lastError = new Error(`Empty OpenRouter content for model ${model} (${finishReason || "no_finish_reason"})`);
        continue;
      }

      const parsed = JSON.parse(unwrapJsonTextBlock(content) || "{}");
      const validated = validateGeneratedPollPayload(parsed, cfg, forcedTargetOptions);
      if (validated) return validated;

      lastError = new Error(`Invalid OpenRouter payload for model ${model}`);
    } catch (error) {
      const status = Number(error?.response?.status || error?.status || 0);
      const msg = String(error?.message || "");
      const is429 = status === 429 || /status code\s*429/i.test(msg) || /\b429\b/.test(msg);
      if (is429) {
        had429 = true;
        const retryAfterMs = parseRetryAfterMs(error?.response?.headers || error?.headers);
        if (retryAfterMs != null) startOpenRouterCooldownWithRetryAfter(retryAfterMs);
        else startOpenRouterCooldown();
      }
      if (status === 400) {
        lastError = error;
        continue;
      }
      if (is429) {
        lastError = error;
        break;
      }
      if ([404, 429, 500, 502, 503, 504].includes(status)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  if (lastError && !had429) {
    warnPollOpenRouter("all OpenRouter model attempts failed:", lastError?.message || lastError);
  }
  return null;
}

async function fetchPollFromOpenRouterWithRetry(cfg = {}, forcedTargetOptions = null) {
  if (!String(process.env.OPENROUTER_API_KEY || "").trim()) return null;
  if (!resolveOpenRouterModels(cfg).length) return null;

  const maxRounds = Math.max(1, Math.min(10, Math.floor(Number(cfg.openrouterRetryRounds || OPENROUTER_MAX_ROUNDS))),);
  const retryDelayMs = Math.max(0, Math.min(10000, Math.floor(Number(cfg.openrouterRetryDelayMs || OPENROUTER_RETRY_DELAY_MS))),);
  const rawDeadline = Number(cfg.openrouterRetryUntilHour);
  const deadlineHour = Number.isFinite(rawDeadline)
    ? Math.min(23, Math.max(0, Math.floor(rawDeadline)))
    : DEFAULT_OPENROUTER_RETRY_UNTIL_HOUR;

  while (msUntilRomeLocalHourDeadline(deadlineHour) > 0) {
    for (let round = 0; round < maxRounds; round += 1) {
      if (isOpenRouterCoolingDown()) break;
      const payload = await fetchPollFromOpenRouter(cfg, forcedTargetOptions).catch((error) => { global.logger?.warn?.("[poll.auto] OpenRouter round failed:", error?.message || error); return null; });
      if (payload?.question && Array.isArray(payload?.answers) && payload.answers.length >= 4) {
        return payload;
      }
      if (isOpenRouterCoolingDown()) break;
      if (round < maxRounds - 1 && retryDelayMs > 0) {
        const cap = msUntilRomeLocalHourDeadline(deadlineHour);
        await sleep(cap > 0 ? Math.min(retryDelayMs, cap) : retryDelayMs);
      }
    }

    const untilDeadline = msUntilRomeLocalHourDeadline(deadlineHour);
    if (untilDeadline <= 0) break;

    if (isOpenRouterCoolingDown()) {
      const untilCool = Math.max(0, Number(openRouterCooldownUntil || 0) - Date.now());
      const sleepMs = Math.min(untilCool, untilDeadline);
      if (sleepMs > 0) await sleep(sleepMs);
      continue;
    }

    const stagger = Math.min(retryDelayMs > 0 ? retryDelayMs : 1500, untilDeadline);
    if (stagger > 0) await sleep(stagger);
  }

  if (isOpenRouterCoolingDown()) {
    warnPollOpenRouter("OpenRouter in cooldown (rate limit): nessun poll entro le 22:00 Roma, fallback locale.");
  } else {
    warnPollOpenRouter("OpenRouter: tentativi fino alle 22:00 Roma senza poll valido, fallback locale.");
  }
  return null;
}

async function pickPollCandidate(cfg = {}, forcedTargetOptions = null) {
  const configuredSources = Array.isArray(cfg.sources) && cfg.sources.length ? cfg.sources.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean) : DEFAULT_SOURCES;
  const sources = shuffle(configuredSources.length ? configuredSources : DEFAULT_SOURCES);

  for (const source of sources) {
    let candidate = null;

    if (source === "openrouter") {
      candidate = await fetchPollFromOpenRouterWithRetry(cfg, forcedTargetOptions).catch((error) => {
        global.logger?.warn?.("[poll.auto] openrouter generation failed:", error?.message || error);
        return null;
      });
      if (!candidate) candidate = buildLocalAttualitaPoll(cfg, forcedTargetOptions);
    }

    if (!candidate && source === "local") {
      candidate = buildLocalAttualitaPoll(cfg, forcedTargetOptions);
    }

    if (candidate?.question && Array.isArray(candidate?.answers)) return candidate;
  }

  return buildLocalAttualitaPoll(cfg, forcedTargetOptions);
}

function clearAutoPollRetryTimer(client) {
  try {
    if (client?._autoPollRetryTimer) clearTimeout(client._autoPollRetryTimer);
  } catch (_) {}
  client._autoPollRetryTimer = null;
}

function scheduleAutoPollRetry(client) {
  clearAutoPollRetryTimer(client);
  client._autoPollRetryTimer = setTimeout(() => {
    client._autoPollRetryTimer = null;
    runAutoPollAndMaybeScheduleRetry(client).catch((error) => {
      global.logger?.error?.("[poll.auto] retry run failed:", error);
    });
  }, AUTO_POLL_RETRY_MS);
  client._autoPollRetryTimer.unref?.();
}

async function runAutoPollAndMaybeScheduleRetry(client) {
  let outcome;
  try {
    outcome = await runAutoPoll(client);
  } catch (error) {
    global.logger?.error?.("[poll.auto] run failed:", error);
    outcome = { retry: true, reason: "exception" };
  }
  if (outcome?.retry) scheduleAutoPollRetry(client);
  else clearAutoPollRetryTimer(client);
}

async function runAutoPoll(client) {
  const cfg = client?.config?.autoPoll || {};
  if (cfg.enabled === false) {
    return { retry: false, reason: "disabled" };
  }

  const channelId = IDs.channels?.polls;
  if (!channelId) {
    return { retry: false, reason: "no_channel_id" };
  }
  const pollChannel = client.channels.cache.get(channelId) || (await getClientChannelCached(client, String(channelId))) || (await client.channels.fetch(String(channelId)).catch(() => null));
  if (!pollChannel?.guild?.id || !pollChannel.isTextBased?.()) {
    return { retry: true, reason: "channel_resolve" };
  }
  const guild = pollChannel.guild;

  if (await hasManualPollToday(guild.id)) {
    return { retry: false, reason: "manual_exists" };
  }
  if (await hasAutoPollToday(guild.id)) {
    return { retry: false, reason: "auto_exists" };
  }

  if (!isWithinAutoPollWindow(new Date(), cfg)) {
    return { retry: false, reason: "outside_window" };
  }

  const optionTarget = pickNextOptionTarget(client, cfg);
  let payload = null;
  const maxAttempts = resolveMaxCandidateAttempts(cfg);

  for (let i = 0; i < maxAttempts && !payload; i += 1) {
    if (i > 0 && i % 20 === 0) await sleep(300);
    const candidate = await pickPollCandidate(cfg, optionTarget);
    if (!candidate?.question || !Array.isArray(candidate.answers) || candidate.answers.length < 4) {
      continue;
    }
    if (await isDuplicateQuestion(guild.id, candidate.question)) continue;
    if (await isDuplicatePollContent(guild.id, candidate)) continue;
    payload = candidate;
  }

  if (!payload) {
    payload = await pickNonDuplicateLocalPoll(guild.id, cfg, optionTarget);
  }

  if (!payload) {
    global.logger?.warn?.(
      "[poll.auto] no valid candidate: tutti i template locali risultano già usati nel lookback o payload non valido, riprovo tra 5 minuti se resta la finestra.",
    );
    return { retry: true, reason: "no_payload" };
  }

  const result = await createPollForGuild(guild, { question: payload.question, answers: payload.answers, source: "auto", });
  if (!result?.ok) {
    global.logger?.warn?.("[poll.auto] createPollForGuild failed:", result?.error || "unknown");
    return { retry: true, reason: "create_failed" };
  }
  return { retry: false, reason: "success" };
}

function startAutoPollLoop(client) {
  if (client._autoPollTask?.stop) {
    try {
      client._autoPollTask.stop();
    } catch (err) {
      global.logger?.warn?.("[autoPoll] ", err?.message || err);
    }
  }
  clearAutoPollRetryTimer(client);

  client._autoPollTask = cron.schedule(
    "0 20 * * *",
    () => {
      clearAutoPollRetryTimer(client);
      runAutoPollAndMaybeScheduleRetry(client).catch((error) => {
        global.logger?.error?.("[poll.auto] run failed:", error);
      });
    },
    { timezone: TIMEZONE },
  );
}

module.exports = { startAutoPollLoop, runAutoPoll, runAutoPollAndMaybeScheduleRetry };