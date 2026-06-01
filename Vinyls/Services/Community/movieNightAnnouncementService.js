const cron = require("node-cron");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached");
const BotState = require("../../Schemas/BotState/botStateSchema");
const { COMPACT_BOTSTATE_KEY } = BotState;
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../Utils/Database/mongoConnect");
const { getClientGuildCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const IDs = require("../../Utils/Config/ids");
const { extractMovieNightProposalTitle } = require("../../Utils/Community/movieNightProposal");
const TIME_ZONE = "Europe/Rome";
const STATE_KEY = "movieNightAnnouncement.v1";
const ANNOUNCE_CRON = "0 15 * * 1";
const CLOSE_THREAD_CRON = "0 20 * * 5";
const FINAL_ANNOUNCEMENT_FRIDAY_CRON = "0 21 * * 5";
const FINAL_ANNOUNCEMENT_SATURDAY_CRON = "0 12 * * 6";
const FINAL_ANNOUNCE_FRIDAY_WEEKDAY = 5;
const FINAL_ANNOUNCE_FRIDAY_HOUR = 21;
const FINAL_ANNOUNCE_SATURDAY_HOUR = 12;
const MOVIE_NIGHT_NAME = "SERATA FILM";
const MOVIE_NIGHT_VOTE_EMOJI_ID = "1482535223001485473";
const MOVIE_NIGHT_TIE_POLL_DURATION_HOURS = 4;
const DISCORD_POLL_MAX_ANSWERS = 10;
const REVIEW_THREAD_NAME = "RECENSIONI E SUGGERIMENTI";
const REVIEW_THREAD_CLOSE_AFTER_MS = 24 * 60 * 60 * 1000;
const REVIEW_THREAD_SWEEP_MS = 5 * 60 * 1000;
const FALLBACK_MOVIE_DESCRIPTION = "Non ho trovato una descrizione affidabile in italiano, ma sarà una buona occasione per scoprirlo insieme durante la serata.";
const ANNOUNCEMENT_CHANNEL_ID = "1481660281032675510";
const MOVIE_NIGHT_EVENT_CHANNEL_ID = "1497535199813042306";
const EVENTS_ROLE_ID = String(IDs.roles?.Events || "1442569012063109151");
const SERATA_FILM_ROLE_ID = String(IDs.roles?.SerataFilm || "1500844750956400761");
const STAFF_COMMUNICATION_CHANNEL_ID = String(IDs.channels?.staffNews || "1442569239063167139");
const STAFF_COMMUNICATION_ROLE_ID = String(IDs.roles?.Staff || "1442568910070349985");
const MOVIE_NIGHT_DISPLAY_TIME = "21:30";
const ITALIAN_MONTH_NAMES = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const TARGET_WEEKDAY = 6;
const TARGET_HOUR = 21;
const TARGET_MINUTE = 15;
const MOVIE_NIGHT_START_MINUTE_LO = 10;
const MOVIE_NIGHT_START_MINUTE_HI = 25;
const FINAL_ANNOUNCEMENT_EXTRA_BEFORE_PING_SATURDAYS = new Set(["2026-05-23"]);
const CHAT_CHANNEL_ID = String(IDs.channels?.chat || "1442569130573303898");

const HARRY_POTTER_MOVIE_NIGHT_SCHEDULE = new Map([
  ["2026-06-06", { title: "Harry Potter e la pietra filosofale" }],
  ["2026-06-13", { title: "Harry Potter e la camera dei segreti" }],
  ["2026-06-20", { skip: true }],
  ["2026-06-27", { title: "Harry Potter e il prigioniero di Azkaban" }],
  ["2026-07-04", { title: "Harry Potter e il calice di fuoco" }],
  ["2026-07-11", { skip: true }],
  ["2026-07-18", { title: "Harry Potter e l'Ordine della Fenice" }],
  ["2026-07-25", { title: "Harry Potter e il principe mezzosangue" }],
  ["2026-08-01", { skip: true }],
  ["2026-08-08", { title: "Harry Potter e i Doni della Morte - Parte 1" }],
  ["2026-08-15", { skip: true }],
  ["2026-08-22", { skip: true }],
  ["2026-08-29", { title: "Harry Potter e i Doni della Morte - Parte 2" }],
]);
let movieNightAnnouncementTasks = null;
let movieNightAnnouncementRunning = false;
let movieNightThreadCloseRunning = false;
let movieNightFinalAnnouncementRunning = false;
let movieNightReviewCloseTimer = null;
let movieNightReviewCloseSweep = null;
const movieNightStageCloseLocksByWeek = new Map();
const MOVIE_NIGHT_END_ANNOUNCE_MARKER = "SERATA FILM ANDATA";
const MOVIE_NIGHT_END_ANNOUNCE_DEDUPE_MS = 10 * 60 * 1000;

const ROME_PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const WEEKDAY_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function getRomeParts(date = new Date()) {
  const parts = {};
  for (const part of ROME_PARTS_FORMATTER.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAY_INDEX[parts.weekday] || 0,
    hour,
    minute: Number(parts.minute),
  };
}

function toDateKey(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getRomeWeekKey(date = new Date()) {
  const parts = getRomeParts(date);
  const utcDate = Date.UTC(parts.year, parts.month - 1, parts.day);
  const mondayUtc = utcDate - (Math.max(1, parts.weekday) - 1) * 24 * 60 * 60 * 1000;
  const monday = new Date(mondayUtc);
  return toDateKey(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
}

function getRomeSaturdayKeyForWeek(date = new Date()) {
  const parts = getRomeParts(date);
  const utcDate = Date.UTC(parts.year, parts.month - 1, parts.day);
  const saturdayUtc = utcDate + (TARGET_WEEKDAY - Math.max(1, parts.weekday)) * 24 * 60 * 60 * 1000;
  const saturday = new Date(saturdayUtc);
  return toDateKey(saturday.getUTCFullYear(), saturday.getUTCMonth() + 1, saturday.getUTCDate());
}

function formatMovieNightStaffDateLabel(date = new Date(), opts = {}) {
  if (opts.advanceForSaturday) {
    const satKey = getRomeSaturdayKeyForWeek(date);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(satKey || ""));
    if (match) {
      const day = Number(match[3]);
      const monthName = ITALIAN_MONTH_NAMES[Math.max(0, Number(match[2]) - 1)] || "";
      return `Sabato ${day} ${monthName}, alle ${MOVIE_NIGHT_DISPLAY_TIME}`;
    }
  }
  const parts = getRomeParts(date);
  const monthName = ITALIAN_MONTH_NAMES[Math.max(0, parts.month - 1)] || "";
  return `Oggi, ${parts.day} ${monthName}, alle ${MOVIE_NIGHT_DISPLAY_TIME}`;
}

function getMovieNightFinalAnnouncementSlot(now = new Date(), forcedSlot = "") {
  const forced = String(forcedSlot || "").trim().toLowerCase();
  if (forced === "friday" || forced === "saturday") return forced;
  const parts = getRomeParts(now);
  if (parts.weekday === FINAL_ANNOUNCE_FRIDAY_WEEKDAY && parts.hour === FINAL_ANNOUNCE_FRIDAY_HOUR) return "friday";
  if (parts.weekday === TARGET_WEEKDAY && parts.hour === FINAL_ANNOUNCE_SATURDAY_HOUR) return "saturday";
  return "";
}

function hasMovieNightSpareggio(state) {
  return Boolean(String(state?.tieBreakerPollMessageId || "").trim());
}

function getHarryPotterMovieNightScheduleForWeek(date = new Date()) {
  return HARRY_POTTER_MOVIE_NIGHT_SCHEDULE.get(getRomeSaturdayKeyForWeek(date)) || null;
}

function getFixedMovieTitleForWeek(date = new Date()) {
  const entry = getHarryPotterMovieNightScheduleForWeek(date);
  return entry?.skip ? null : String(entry?.title || "").trim() || null;
}

function getMovieNightEventStartDate(event) {
  return event?.scheduledStartAt || (event?.scheduledStartTimestamp ? new Date(event.scheduledStartTimestamp) : null);
}

function isMovieNightEventChannelAndStatus(event) {
  if (String(event?.channelId || "") !== MOVIE_NIGHT_EVENT_CHANNEL_ID) return false;
  const status = Number(event?.status || 0);
  return status === 1 || status === 2;
}

function isMovieNightEventName(event) {
  return String(event?.name || "").toUpperCase().includes(MOVIE_NIGHT_NAME);
}

function isSaturdayMovieNightStart(startDate, now = new Date()) {
  if (!startDate) return false;
  const parts = getRomeParts(startDate);
  return (
    getRomeSaturdayKeyForWeek(startDate) === getRomeSaturdayKeyForWeek(now) &&
    parts.weekday === TARGET_WEEKDAY &&
    parts.hour === TARGET_HOUR &&
    parts.minute >= MOVIE_NIGHT_START_MINUTE_LO &&
    parts.minute <= MOVIE_NIGHT_START_MINUTE_HI
  );
}

function isTargetMovieNightTimeAndChannel(event, now = new Date()) {
  if (!isMovieNightEventChannelAndStatus(event)) return false;
  const startDate = getMovieNightEventStartDate(event);
  if (!startDate) return false;
  return isSaturdayMovieNightStart(startDate, now);
}

function isTargetMovieNightEvent(event, now = new Date()) {
  return isMovieNightEventName(event) && isTargetMovieNightTimeAndChannel(event, now);
}

function isFixedScheduleMovieNightEvent(event, now = new Date()) {
  const startDate = getMovieNightEventStartDate(event) || now;
  return Boolean(getFixedMovieTitleForWeek(startDate)) && isTargetMovieNightTimeAndChannel(event, now);
}

function isRelaxedSaturdayMovieNightEvent(event, now = new Date()) {
  if (!isMovieNightEventName(event) || !isMovieNightEventChannelAndStatus(event)) return false;
  const startDate = getMovieNightEventStartDate(event);
  return isSaturdayMovieNightStart(startDate, now);
}

function pickBestMovieNightEvent(candidates, now = new Date()) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (!list.length) return null;
  const exact = list.filter((event) => isTargetMovieNightEvent(event, now) || isFixedScheduleMovieNightEvent(event, now));
  const pool = exact.length ? exact : list.filter((event) => isRelaxedSaturdayMovieNightEvent(event, now));
  return [...pool].sort((a, b) => Number(a.scheduledStartTimestamp || 0) - Number(b.scheduledStartTimestamp || 0))[0] || null;
}

async function fetchMovieNightEventById(guild, eventId) {
  const id = String(eventId || "").trim();
  if (!id || !guild?.scheduledEvents?.fetch) return null;
  const event = await guild.scheduledEvents.fetch(id).catch(() => null);
  if (!event || !isMovieNightEventName(event)) return null;
  return event;
}

async function findCurrentWeekMovieNightEvent(guild, now = new Date()) {
  if (!guild?.scheduledEvents?.fetch) return null;
  const events = await guild.scheduledEvents.fetch().catch((err) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] scheduled events fetch failed:", err?.message || err);
    return null;
  });
  if (!events?.size) return null;
  return pickBestMovieNightEvent([...events.values()], now);
}

function buildMovieNightAnnouncementMessage() {
  return [
    "## <a:VC_Announce:1482534613568979007> **SERATA FILM**",
    "",
    `> <:VC_Stats:1482527532682055780> Ecco il thread in cui suggerire il film da guadare **Sabato alle ${MOVIE_NIGHT_DISPLAY_TIME}**. Non c'è un genere definito, quindi potete consigliare **qualsiasi film**.`,
    "",
    "<:VC_PinkQuestionMark:1471892611026391306> Come funziona:",
    "<:VC_DoubleReply:1482532332509466797> Scrivete il nome di uno o più film (in messaggi separati) e il bot in automatico aggiungerà la reaction <a:VC_Vote:1482535223001485473> per votare;",
    "<:VC_Reply:1482532158080942191> Cliccate sulla reaction <a:VC_Vote:1482535223001485473> per votare un film (senza limiti, potete votare per quanti volete);",
    "",
    "<:VC_BanHammer:1482534474502897795> **VIETATO:**",
    "<:VC_Dot:1482532364222595303> Suggerire titole di saghe;",
    "<:VC_Dot:1482532364222595303> Suggerire film di durata maggiore di 2 ore;",
    "<:VC_Dot:1482532364222595303> Suggerire un film già suggerito;",
    "<:VC_Dot:1482532364222595303> Parlare di altro, qui si dovrà solo scrivere il titolo del film.",
    "",
    "<:VC_Attention:1482534443632558151> **PENA:** __Cancellazione dei messaggi e esclusione totale dal thread__",
    "",
    `<a:VC_Ping:1482694298687246377>︲<@&${EVENTS_ROLE_ID}> . <@&${SERATA_FILM_ROLE_ID}>`,
  ].join("\n");
}

function joinMovieTitlesForMessage(titles) {
  const list = titles.map((title) => `**${title}**`);
  if (list.length <= 2) return list.join(" e ");
  return `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}`;
}

function buildTieBreakerAnnouncementMessage(threadId, titles) {
  return [
    "## <a:VC_Announce:1482534613568979007> **SERATA FILM**",
    "",
    `> <:VC_Stats:1482527532682055780>  Essendoci un **pareggio** nel thread <#${threadId}> tra ${joinMovieTitlesForMessage(titles)} abbiamo deciso di fare un breve sondaggio per decidere quale guardare!`,
    "",
    "<a:VC_Vote:1482535223001485473> __Votate il sondaggio in basso__",
    "",
    `<a:VC_Ping:1482694298687246377>︲<@&${EVENTS_ROLE_ID}> . <@&${SERATA_FILM_ROLE_ID}>`,
  ].join("\n");
}

function buildDiscordEventUrl(guildId, eventId) {
  const gid = String(guildId || IDs.guilds?.main || "");
  const eid = String(eventId || "");
  if (!gid || !eid) return "https://discord.com/events";
  return `https://discord.com/events/${gid}/${eid}`;
}

function buildMovieNightStaffCommunicationMessage({ title, dateLabel }) {
  const film = String(title || "").trim() || "il film in programma";
  const when = String(dateLabel || "").trim() || `Oggi, alle ${MOVIE_NIGHT_DISPLAY_TIME}`;
  return [
    "# <a:VC_Alert:1482706673176150077> COMUNICAZIONE SERATA FILM",
    "",
    `> <a:VC_Calendar:1482706208149475358> **${when}**, proietteremo **${film}**. Durerà all'incirca un'ora e mezza ma tanto saremo tutti mutati (__non silenziati__) quindi potete anche stare AFK. __L'importante è essere presenti nel canale vocale.__`,
    "",
    "> <a:VC_Exclamation:1482534702077444217> Dobbiamo far vedere che gli eventi sono frequentati. L'affluenza genera interesse e credibilità. Se lo staff partecipa in massa, si innesca un effetto catena positivo su tutta la community perché gli utenti vedranno che l'iniziativa funziona e si uniranno di più in futuro. __Chi non parteciperà all'evento è importante che sia conscio del fatto che riceverà una valutazione negativa.__",
    "",
    "> <:VC_handleft:1482730852164305068><:VC_handright:1482730777719476305> Supportare l'evento equivale a sostenere il server. Non si tratta solo di guardare un film, ma di mandare un segnale chiaro: *le iniziative della community contano e meritano attenzione.*",
    "",
    "> <a:VC_Rocket:1468544312475123753> Vi ricordo anche che in vocale gli **XP** sono **doppi**. Questo è da tenere in considerazione per futuri eventi.",
    "",
    `<a:VC_Ping:1482694298687246377>・<@&${STAFF_COMMUNICATION_ROLE_ID}>`,
  ].join("\n");
}

function buildFinalAnnouncementMonthlyActivityBlock() {
  return [
    "> # <a:VC_Exclamation:1482534702077444217> RICORDA L’EVENTO MENSILE!",
    `Il membro che a fine mese risulterà il più attivo vincerà Nitro Boost per un mese, il secondo una decorazione da massimo 15,99€ e il terzo il ruolo VIP+ per 30 giorni! Ti aspettiamo in <#${CHAT_CHANNEL_ID}>!`,
  ].join("\n");
}

function buildFinalMovieNightAnnouncementMessage({ title, description, eventUrl, saturdayKey, announceSlot }) {
  const fridayAdvance = String(announceSlot || "").toLowerCase() === "friday";
  const whenLine = fridayAdvance
    ? `> <:VC_movie:1497534838801174559> Tutto è pronto! **Domani** sera, alle **${MOVIE_NIGHT_DISPLAY_TIME}**, inizierà il nostro appuntamento con il cinema trasmettendo **${title}**!`
    : `> <:VC_movie:1497534838801174559> Tutto è pronto! Questa sera, alle **${MOVIE_NIGHT_DISPLAY_TIME}**, inizierà il nostro appuntamento con il cinema trasmettendo **${title}**!`;
  const closingLine = fridayAdvance
    ? "> <a:VC_Rocket:1468544312475123753> Ci vediamo domani! E ricorda: chi partecipa all'evento in vocale riceverà il **doppio **degli **XP **validi per la top weekly. Non mancare!"
    : "> <a:VC_Rocket:1468544312475123753> Ci vediamo stasera! E ricorda: chi partecipa all'evento in vocale riceverà il **doppio **degli **XP **validi per la top weekly. Non mancare!";
  const lines = [
    "# <a:VC_Announce:1482534613568979007> SERATA FILM",
    "",
    whenLine,
    "",
    "<:VC_Info:1482526956703580372> Non sai di cosa parla?",
    description,
    "",
    closingLine,
    "",
    `<:VC_CommunityManager:1494286896459681924> [Salva l'evento](${eventUrl})`,
  ];
  const satKey = String(saturdayKey || "").trim();
  if (satKey && FINAL_ANNOUNCEMENT_EXTRA_BEFORE_PING_SATURDAYS.has(satKey)) {
    lines.push("", buildFinalAnnouncementMonthlyActivityBlock());
  }
  lines.push("", `<a:VC_Ping:1482694298687246377>︲<@&${EVENTS_ROLE_ID}> . <@&${SERATA_FILM_ROLE_ID}>`);
  return lines.join("\n");
}

function buildMovieNightStartAnnouncementMessage(title) {
  return [
    "# <a:VC_Announce:1482534613568979007> SERATA FILM",
    "",
    `> <:VC_movie:1497534838801174559> Tutto è pronto! Tra pochi minuti, alle **${MOVIE_NIGHT_DISPLAY_TIME}**, inizierà il nostro appuntamento con il cinema trasmettendo **${title}**!`,
    "",
    `<a:VC_HeartsPink:1468685897389052008> Vi aspettiamo in numerosi in <#${MOVIE_NIGHT_EVENT_CHANNEL_ID}>`,
    "",
    `<a:VC_Ping:1482694298687246377>︲<@&${SERATA_FILM_ROLE_ID}> . @everyone`,
  ].join("\n");
}

function buildMovieNightEndAnnouncementMessage(title) {
  return [
    "# <:VC_Firework:1470796227913322658> SERATA FILM ANDATA!",
    "",
    `> <a:VC_HeartsBlue:1468686100045369404> Grazie per aver partecipato attivamente alla proiezione di **${title}**. `,
    "",
    "<a:VC_NewsExclamation:1471891662786527253> Hai un suggerimento o vuoi lasciare una recensione per i prossimi eventi? Usa il thread qui sotto!",
    "",
    "> <a:VC_lil_swag:1494319540954464327>  Alla prossima proiezione!",
    "",
    `<a:VC_Ping:1482694298687246377>︲<@&${SERATA_FILM_ROLE_ID}>`,
  ].join("\n");
}

async function publishMovieNightAnnouncement(guild, event, weekKey) {
  const channel = guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || (await getGuildChannelCached(guild, ANNOUNCEMENT_CHANNEL_ID));
  if (!channel?.isTextBased?.() || !channel?.send) {
    return { ok: false, reason: "announcement_channel_unavailable" };
  }

  const message = await channel.send({
    content: buildMovieNightAnnouncementMessage(),
    allowedMentions: { roles: [EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID] },
  });
  let thread = await message.startThread({
    name: MOVIE_NIGHT_NAME,
    autoArchiveDuration: 10080,
    reason: "Thread automatico suggerimenti Serata Film",
  }).catch(() => null);
  if (!thread) {
    thread = await message.startThread({
      name: MOVIE_NIGHT_NAME,
      autoArchiveDuration: 1440,
      reason: "Thread automatico suggerimenti Serata Film",
    }).catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] thread create failed:", err?.message || err);
      return null;
    });
  }

  const previousState = await getBotState(STATE_KEY, null);
  const previousWeekKey = String(previousState?.weekKey || "");
  const keepPriorWeekFields = previousWeekKey && previousWeekKey === weekKey && previousState && typeof previousState === "object";
  await setBotState(STATE_KEY, {
    ...(keepPriorWeekFields ? previousState : {}),
    weekKey,
    guildId: String(guild.id || ""),
    eventId: String(event?.id || ""),
    messageId: String(message.id || ""),
    threadId: String(thread?.id || ""),
    announcedAt: new Date().toISOString(),
  });

  return { ok: true, messageId: String(message.id || ""), threadId: String(thread?.id || "") };
}

function truncateDescription(text, maxLength = 520) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  const sliced = clean.slice(0, maxLength + 1);
  const sentenceEnd = Math.max(sliced.lastIndexOf(". "), sliced.lastIndexOf("! "), sliced.lastIndexOf("? "));
  if (sentenceEnd >= 180) return clean.slice(0, sentenceEnd + 1).trim();
  return `${clean.slice(0, maxLength).replace(/\s+\S*$/, "").trim()}...`;
}

async function fetchJson(url) {
  if (typeof fetch !== "function") return null;
  const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(7000) : undefined;
  const response = await fetch(url, {
    signal,
    headers: {
      "User-Agent": "ViniliECaffeBot/1.0 (movie-night-announcement)",
      Accept: "application/json",
    },
  }).catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

function buildMovieSearchQueries(title) {
  const rawTitle = String(title || "").trim();
  return [...new Set([
    rawTitle,
    `film ${rawTitle}`,
    `${rawTitle} film`,
  ].filter(Boolean))];
}

function stripMovieTitleDecorations(title) {
  return String(title || "")
    .replace(/\s*\((film|film d'animazione|animazione|movie)[^)]*\)\s*$/i, "")
    .trim();
}

function compactMovieTitle(title) {
  return stripMovieTitleDecorations(title)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\u00c0-\u024f]/gi, "");
}

function scoreMovieTitleMatch(movieTitle, pageTitle) {
  const movie = compactMovieTitle(movieTitle);
  const page = compactMovieTitle(pageTitle);
  if (!movie || !page) return 0;
  if (page === movie) return 1000;
  if (page.startsWith(movie) || movie.startsWith(page)) return 900;
  if (page.includes(movie) || movie.includes(page)) return 800;
  return 0;
}

function pickBestWikipediaSearchResult(movieTitle, results) {
  let bestTitle = null;
  let bestScore = 0;
  for (const entry of results || []) {
    const pageTitle = String(entry?.title || "").trim();
    if (!pageTitle) continue;
    const score = scoreMovieTitleMatch(movieTitle, pageTitle);
    if (score > bestScore) {
      bestScore = score;
      bestTitle = pageTitle;
    }
  }
  return bestScore >= 800 ? bestTitle : null;
}

async function searchWikipediaPageTitle(lang, title) {
  const safeLang = String(lang || "it").toLowerCase();
  for (const query of buildMovieSearchQueries(title)) {
    const searchUrl = new URL(`https://${safeLang}.wikipedia.org/w/api.php`);
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("srlimit", "8");
    searchUrl.searchParams.set("srsearch", query);
    const search = await fetchJson(searchUrl.toString());
    const pageTitle = pickBestWikipediaSearchResult(title, search?.query?.search);
    if (pageTitle) return pageTitle;
  }
  return null;
}

async function fetchWikipediaExtract(lang, pageTitle) {
  const safeLang = String(lang || "it").toLowerCase();
  const safeTitle = String(pageTitle || "").trim();
  if (!safeTitle) return null;
  const extractUrl = new URL(`https://${safeLang}.wikipedia.org/w/api.php`);
  extractUrl.searchParams.set("action", "query");
  extractUrl.searchParams.set("prop", "extracts");
  extractUrl.searchParams.set("exintro", "1");
  extractUrl.searchParams.set("explaintext", "1");
  extractUrl.searchParams.set("redirects", "1");
  extractUrl.searchParams.set("format", "json");
  extractUrl.searchParams.set("titles", safeTitle);
  const extract = await fetchJson(extractUrl.toString());
  const pages = extract?.query?.pages ? Object.values(extract.query.pages) : [];
  return pages[0]?.extract || null;
}

function wikidataLooksLikeMovie(entity) {
  const text = [
    entity?.description,
    entity?.label,
    entity?.match?.text,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return /\b(film|movie|pellicola|cinema|anime)\b/i.test(text);
}

async function searchWikidataMoviePageTitle(title, targetLang) {
  const ids = [];
  const fallbackIds = [];
  for (const lang of ["it", "en"]) {
    for (const query of buildMovieSearchQueries(title)) {
      const searchUrl = new URL("https://www.wikidata.org/w/api.php");
      searchUrl.searchParams.set("action", "wbsearchentities");
      searchUrl.searchParams.set("format", "json");
      searchUrl.searchParams.set("language", lang);
      searchUrl.searchParams.set("uselang", lang);
      searchUrl.searchParams.set("type", "item");
      searchUrl.searchParams.set("limit", "5");
      searchUrl.searchParams.set("search", query);
      const search = await fetchJson(searchUrl.toString());
      for (const entity of search?.search || []) {
        if (!entity?.id) continue;
        if (wikidataLooksLikeMovie(entity)) {
          if (!ids.includes(entity.id)) ids.push(entity.id);
        } else if (!fallbackIds.includes(entity.id)) {
          fallbackIds.push(entity.id);
        }
      }
      if (ids.length >= 8) break;
    }
    if (ids.length >= 8) break;
  }
  const candidateIds = ids.length ? ids : fallbackIds;
  if (!candidateIds.length) return null;

  const entitiesUrl = new URL("https://www.wikidata.org/w/api.php");
  entitiesUrl.searchParams.set("action", "wbgetentities");
  entitiesUrl.searchParams.set("format", "json");
  entitiesUrl.searchParams.set("props", "sitelinks");
  entitiesUrl.searchParams.set("sitefilter", "itwiki|enwiki");
  entitiesUrl.searchParams.set("ids", candidateIds.slice(0, 8).join("|"));
  const data = await fetchJson(entitiesUrl.toString());
  const site = `${String(targetLang || "it").toLowerCase()}wiki`;
  for (const id of candidateIds) {
    const titleForLang = data?.entities?.[id]?.sitelinks?.[site]?.title;
    if (titleForLang) return titleForLang;
  }
  return null;
}

async function translateEnglishToItalian(text) {
  const clean = truncateDescription(text, 900);
  if (!clean) return null;
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", clean);
  url.searchParams.set("langpair", "en|it");
  const data = await fetchJson(url.toString());
  const translated = String(data?.responseData?.translatedText || "").trim();
  if (!translated || translated.toLowerCase() === clean.toLowerCase()) return null;
  return truncateDescription(translated);
}

async function fetchItalianMovieDescription(title) {
  const rawTitle = String(title || "").trim();
  if (!rawTitle) return FALLBACK_MOVIE_DESCRIPTION;

  const italianPageTitle =
    (await searchWikidataMoviePageTitle(rawTitle, "it")) ||
    (await searchWikipediaPageTitle("it", rawTitle));
  const italianDescription = italianPageTitle ? await fetchWikipediaExtract("it", italianPageTitle) : null;
  if (italianDescription) return truncateDescription(italianDescription);

  const englishPageTitle =
    (await searchWikidataMoviePageTitle(rawTitle, "en")) ||
    (await searchWikipediaPageTitle("en", rawTitle));
  const englishDescription = englishPageTitle ? await fetchWikipediaExtract("en", englishPageTitle) : null;
  const translatedDescription = await translateEnglishToItalian(englishDescription);
  return translatedDescription || FALLBACK_MOVIE_DESCRIPTION;
}

async function fetchAllThreadMessages(thread, limit = 1000) {
  const messages = [];
  let before;
  while (messages.length < limit) {
    const batch = await thread.messages.fetch({ limit: Math.min(100, limit - messages.length), ...(before ? { before } : {}) }).catch(() => null);
    if (!batch?.size) break;
    messages.push(...batch.values());
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  return messages;
}

function getMovieVoteReaction(message) {
  return message.reactions?.cache?.find((reaction) => {
    const emojiId = String(reaction?.emoji?.id || "");
    const emojiName = String(reaction?.emoji?.name || "");
    return emojiId === MOVIE_NIGHT_VOTE_EMOJI_ID || emojiName === "VC_Vote";
  }) || null;
}

async function countReactionVotes(reaction, botUserId) {
  if (!reaction) return 0;
  const voterIds = new Set();
  let after;
  while (true) {
    const users = await reaction.users.fetch({ limit: 100, ...(after ? { after } : {}) }).catch(() => null);
    if (!users?.size) break;
    for (const user of users.values()) {
      if (!user?.bot && String(user.id || "") !== String(botUserId || "")) voterIds.add(String(user.id));
    }
    after = users.last()?.id;
    if (users.size < 100) break;
  }
  return voterIds.size;
}

async function collectMovieNightVoteResults(thread, client) {
  const messages = await fetchAllThreadMessages(thread);
  const proposals = messages
    .filter((message) => !message.author?.bot && !message.webhookId && !message.system)
    .filter((message) => extractMovieNightProposalTitle(message.content))
    .sort((a, b) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0));
  const results = [];
  for (const message of proposals) {
    const title = extractMovieNightProposalTitle(message.content);
    const votes = await countReactionVotes(getMovieVoteReaction(message), client?.user?.id);
    results.push({ messageId: String(message.id || ""), title, votes });
  }
  return results;
}

async function maybePublishTieBreakerPoll(client, thread, state) {
  if (state?.tieBreakerPollMessageId) return { skipped: true, reason: "tie_poll_already_sent" };
  const results = await collectMovieNightVoteResults(thread, client);
  if (!results.length) return { skipped: true, reason: "no_movie_proposals", voteResults: [] };

  const topVotes = Math.max(...results.map((result) => result.votes));
  const tied = results.filter((result) => result.votes === topVotes);
  if (tied.length < 2) {
    return { skipped: true, reason: "no_tie", topVotes, winner: tied[0]?.title || null, voteResults: results };
  }

  const options = tied.slice(0, DISCORD_POLL_MAX_ANSWERS);
  const channel = thread.guild?.channels?.cache?.get(ANNOUNCEMENT_CHANNEL_ID) || (await getGuildChannelCached(thread.guild, ANNOUNCEMENT_CHANNEL_ID));
  if (!channel?.isTextBased?.() || !channel?.send) {
    return { skipped: true, reason: "announcement_channel_unavailable" };
  }

  const pollMessage = await channel.send({
    content: buildTieBreakerAnnouncementMessage(thread.id, options.map((option) => option.title)),
    allowedMentions: { roles: [EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID] },
    poll: {
      question: { text: `Quale film guardiamo domani alle ${MOVIE_NIGHT_DISPLAY_TIME}?` },
      answers: options.map((option) => ({ text: option.title })),
      duration: MOVIE_NIGHT_TIE_POLL_DURATION_HOURS,
      allowMultiselect: false,
    },
  });
  return {
    ok: true,
    tieBreakerPollMessageId: String(pollMessage.id || ""),
    tiedMovieTitles: options.map((option) => option.title),
    voteResults: results,
    topVotes,
    truncated: tied.length > options.length,
  };
}

function resolveWinnerFromVoteResults(voteResults) {
  const results = Array.isArray(voteResults) ? voteResults : [];
  if (!results.length) return null;
  return [...results]
    .filter((result) => String(result?.title || "").trim())
    .sort((a, b) => Number(b.votes || 0) - Number(a.votes || 0))[0]?.title || null;
}

async function resolveTieBreakerPollWinner(client, state) {
  const pollMessageId = String(state?.tieBreakerPollMessageId || "");
  if (!pollMessageId) return null;
  const channel = client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || (await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID).catch(() => null));
  const message = await channel?.messages?.fetch?.(pollMessageId).catch(() => null);
  const answers = [...(message?.poll?.answers?.values?.() || [])]
    .filter((answer) => String(answer?.text || "").trim())
    .sort((a, b) => Number(b.voteCount || 0) - Number(a.voteCount || 0) || Number(a.id || 0) - Number(b.id || 0));
  return answers[0]?.text || null;
}

function extractTitleFromEventDescription(description) {
  const desc = String(description || "").trim();
  if (!desc) return null;
  const patterns = [
    /(?:film|titolo|proiezione|stasera|guardiamo|trasmettendo|proiettando)\s*[:\-–—]\s*(.+)/iu,
    /(?:trasmettendo|proiettando)\s+(.+?)(?:[.!?\n]|$)/iu,
  ];
  for (const pattern of patterns) {
    const match = desc.match(pattern);
    if (!match?.[1]) continue;
    const title = extractMovieNightProposalTitle(match[1]);
    if (title && title.toUpperCase() !== MOVIE_NIGHT_NAME) return title;
  }
  for (const line of desc.split(/\n+/)) {
    const title = extractMovieNightProposalTitle(line);
    if (title && title.toUpperCase() !== MOVIE_NIGHT_NAME && title.length >= 2) return title;
  }
  return null;
}

function resolveTitleFromMovieNightEvent(event) {
  const name = String(event?.name || "").trim();
  if (!name) return extractTitleFromEventDescription(event?.description);

  const splitPatterns = [
    /^serata\s*film\s*(?:[\|\-–—:»>]+\s*)+(.+)$/iu,
    /^(.+?)\s*(?:[\|\-–—:]+\s*)+serata\s*film\s*$/iu,
  ];
  for (const pattern of splitPatterns) {
    const match = name.match(pattern);
    if (!match?.[1]) continue;
    const title = extractMovieNightProposalTitle(match[1]);
    if (title && title.toUpperCase() !== MOVIE_NIGHT_NAME) return title;
  }

  let rest = name;
  if (name.toUpperCase().includes(MOVIE_NIGHT_NAME)) {
    rest = name
      .replace(/serata\s*film/gi, " ")
      .replace(/^[\s|\-–—:>]+/, "")
      .replace(/[\s|\-–—:]+$/, "")
      .trim();
  }
  const title = extractMovieNightProposalTitle(rest) || extractMovieNightProposalTitle(name);
  if (title && title.toUpperCase() !== MOVIE_NIGHT_NAME) return title;
  return extractTitleFromEventDescription(event?.description);
}

async function resolveAnnouncementChannel(client) {
  return (
    client?.channels?.cache?.get(ANNOUNCEMENT_CHANNEL_ID) ||
    (await client?.channels?.fetch?.(ANNOUNCEMENT_CHANNEL_ID).catch(() => null))
  );
}

function isMovieNightVoteThread(thread, weekKey) {
  if (!thread?.isThread?.()) return false;
  const threadName = String(thread.name || "").trim().toUpperCase();
  if (threadName !== MOVIE_NIGHT_NAME) return false;
  const createdAt = Number(thread.createdTimestamp || 0);
  if (!createdAt) return false;
  return getRomeWeekKey(new Date(createdAt)) === weekKey;
}

async function discoverMovieNightVoteThread(client, weekKey) {
  const key = String(weekKey || "").trim();
  if (!key) return null;
  const channel = await resolveAnnouncementChannel(client);
  if (!channel?.isTextBased?.()) return null;

  const candidates = [];
  if (channel.threads?.fetchActive) {
    const active = await channel.threads.fetchActive().catch(() => null);
    if (active?.threads?.size) candidates.push(...active.threads.values());
  }
  if (channel.threads?.fetchArchived) {
    let before;
    for (let page = 0; page < 4; page += 1) {
      const archived = await channel.threads
        .fetchArchived({ limit: 25, ...(before ? { before } : {}) })
        .catch(() => null);
      if (!archived?.threads?.size) break;
      candidates.push(...archived.threads.values());
      before = archived.threads.last()?.id;
      if (archived.threads.size < 25) break;
    }
  }

  const fromThreads = candidates.filter((thread) => isMovieNightVoteThread(thread, key));
  if (fromThreads.length) {
    return [...fromThreads].sort((a, b) => Number(b.createdTimestamp || 0) - Number(a.createdTimestamp || 0))[0];
  }

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages?.size) return null;
  const sorted = [...messages.values()].sort(
    (a, b) => Number(b.createdTimestamp || 0) - Number(a.createdTimestamp || 0),
  );
  for (const message of sorted) {
    if (getRomeWeekKey(new Date(Number(message.createdTimestamp || 0))) !== key) continue;
    if (!message.hasThread) continue;
    const thread = message.thread || (await message.fetchThread?.().catch(() => null));
    if (isMovieNightVoteThread(thread, key)) return thread;
  }
  return null;
}

async function hydrateMovieNightStateForWeek(client, state, weekKey) {
  const key = String(weekKey || "").trim();
  const base = state && typeof state === "object" ? { ...state } : {};
  if (!key) return base;
  if (base.threadId && base.weekKey === key) return base;
  const thread = await discoverMovieNightVoteThread(client, key);
  if (!thread?.id) return base;
  return {
    ...base,
    weekKey: key,
    threadId: String(thread.id),
    guildId: String(thread.guildId || base.guildId || IDs.guilds?.main || ""),
  };
}

async function resolveMovieNightThread(client, threadId) {
  const id = String(threadId || "");
  if (!id) return null;
  return client.channels.cache.get(id) || (await client.channels.fetch(id).catch(() => null));
}

async function resolveMovieTitleFromVoteThread(client, state, weekKey = "") {
  const key = String(weekKey || state?.weekKey || "").trim();
  let thread = null;
  const threadId = String(state?.threadId || "");
  if (threadId) thread = await resolveMovieNightThread(client, threadId);
  if (!thread?.isThread?.() && key) {
    thread = await discoverMovieNightVoteThread(client, key);
  }
  if (!thread?.isThread?.()) return null;
  const voteResults = await collectMovieNightVoteResults(thread, client).catch(() => []);
  const fromVotes = resolveWinnerFromVoteResults(voteResults);
  if (fromVotes) return fromVotes;
  const topVotes = voteResults.length ? Math.max(...voteResults.map((r) => Number(r.votes || 0))) : 0;
  if (topVotes > 0) {
    const leader = voteResults.find((r) => Number(r.votes || 0) === topVotes);
    if (leader?.title) return leader.title;
  }
  return null;
}

async function resolveFinalMovieTitle(client, state, now = new Date()) {
  const weekKey = getRomeWeekKey(now);
  const savedTitle = String(state?.finalMovieTitle || "").trim();
  if (savedTitle) return savedTitle;
  const fromSchedule = getFixedMovieTitleForWeek(now);
  if (fromSchedule) return fromSchedule;
  const hydrated = await hydrateMovieNightStateForWeek(client, state, weekKey);
  const fromTie = await resolveTieBreakerPollWinner(client, hydrated);
  if (fromTie) return fromTie;
  const fromVotes = resolveWinnerFromVoteResults(hydrated?.voteResults);
  if (fromVotes) return fromVotes;
  const fromThread = await resolveMovieTitleFromVoteThread(client, hydrated, weekKey).catch(() => null);
  if (fromThread) return fromThread;
  const guildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
  const guild = guildId
    ? await getClientGuildCached(client, guildId).catch(() => null)
    : null;
  if (!guild) return null;
  const event = await findCurrentWeekMovieNightEvent(guild, now);
  const fromCurrentEvent = resolveTitleFromMovieNightEvent(event);
  if (fromCurrentEvent) return fromCurrentEvent;
  const storedEventId = String(hydrated?.eventId || state?.eventId || event?.id || "").trim();
  if (storedEventId) {
    const storedEvent = await fetchMovieNightEventById(guild, storedEventId);
    const fromStored = resolveTitleFromMovieNightEvent(storedEvent);
    if (fromStored) return fromStored;
  }
  return null;
}

async function describeFinalMovieTitleMiss(client, state, now = new Date()) {
  const bits = [];
  if (getFixedMovieTitleForWeek(now)) bits.push("schedule_ok");
  else bits.push("no_schedule");
  const voteCount = Array.isArray(state?.voteResults) ? state.voteResults.length : 0;
  bits.push(`voteResults=${voteCount}`);
  bits.push(state?.tieBreakerPollMessageId ? "tie_poll=yes" : "tie_poll=no");
  bits.push(state?.threadId ? `thread=${state.threadId}` : "thread=none");
  const guildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
  const guild = guildId ? await getClientGuildCached(client, guildId).catch(() => null) : null;
  if (!guild) {
    bits.push("guild=missing");
    return bits.join(" ");
  }
  const event = await findCurrentWeekMovieNightEvent(guild, now);
  if (!event) {
    bits.push("event=not_found");
    return bits.join(" ");
  }
  const startDate = getMovieNightEventStartDate(event);
  const parts = startDate ? getRomeParts(startDate) : null;
  bits.push(`event=${event.id}`);
  bits.push(parts ? `eventStart=${parts.hour}:${String(parts.minute).padStart(2, "0")}` : "eventStart=?");
  const title = resolveTitleFromMovieNightEvent(event);
  bits.push(`eventName=${String(event.name || "").slice(0, 60)}`);
  bits.push(title ? `eventTitle=${title.slice(0, 40)}` : "eventTitle=unparsed");
  const discovered = await discoverMovieNightVoteThread(client, getRomeWeekKey(now)).catch(() => null);
  bits.push(discovered?.id ? `discoveredThread=${discovered.id}` : "discoveredThread=none");
  return bits.join(" ");
}

async function fetchAnnouncementChannel(client) {
  return (
    client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) ||
    (await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID).catch(() => null))
  );
}

async function finalAnnouncementMessageStillExists(client, messageId) {
  const id = String(messageId || "").trim();
  if (!id) return false;
  const channel = await fetchAnnouncementChannel(client);
  if (!channel?.messages?.fetch) return false;
  const message = await channel.messages.fetch(id).catch(() => null);
  return Boolean(message?.id);
}

async function fetchStaffCommunicationChannel(client) {
  return (
    client.channels.cache.get(STAFF_COMMUNICATION_CHANNEL_ID) ||
    (await client.channels.fetch(STAFF_COMMUNICATION_CHANNEL_ID).catch(() => null))
  );
}

async function staffCommunicationMessageStillExists(client, messageId) {
  const id = String(messageId || "").trim();
  if (!id) return false;
  const channel = await fetchStaffCommunicationChannel(client);
  if (!channel?.messages?.fetch) return false;
  const message = await channel.messages.fetch(id).catch(() => null);
  return Boolean(message?.id);
}

async function resolveMovieNightFinalAnnounceStatus(client, state, weekKey, saturdayKey) {
  const wk = String(weekKey || "").trim();
  const sat = String(saturdayKey || "").trim();
  if (!wk) return { done: false };
  if (sat && String(state?.finalAnnouncedSaturdayKey || "") === sat) {
    return { done: true, reason: "already_announced_saturday" };
  }
  const messageId = String(state?.finalAnnouncementMessageId || "").trim();
  if (messageId && (await finalAnnouncementMessageStillExists(client, messageId))) {
    return {
      done: true,
      reason: "already_announced",
      repairSaturdayKey: Boolean(sat && String(state?.finalAnnouncedSaturdayKey || "") !== sat),
      repairWeekKey: String(state?.weekKey || "") !== wk,
    };
  }
  return { done: false };
}

async function resolveMovieNightStaffCommunicationStatus(client, state, saturdayKey) {
  const sat = String(saturdayKey || "").trim();
  if (sat && String(state?.staffAnnouncedSaturdayKey || "") === sat) {
    return { done: true, reason: "already_announced_saturday" };
  }
  const messageId = String(state?.staffCommunicationMessageId || "").trim();
  if (messageId && (await staffCommunicationMessageStillExists(client, messageId))) {
    return {
      done: true,
      reason: "already_announced",
      repairSaturdayKey: Boolean(sat && String(state?.staffAnnouncedSaturdayKey || "") !== sat),
    };
  }
  return { done: false };
}

async function resolveMovieNightEventStartStatus(client, state, weekKey) {
  const wk = String(weekKey || "").trim();
  const messageId = String(state?.eventStartMessageId || "").trim();
  if (!messageId) return { done: false };
  if (!(await finalAnnouncementMessageStillExists(client, messageId))) return { done: false };
  return {
    done: true,
    reason: "already_announced",
    repairWeekKey: String(state?.weekKey || "") !== wk,
  };
}

async function repairMovieNightFinalAnnounceState(client, state, weekKey, saturdayKey, status) {
  if (!status || typeof state !== "object") return state;
  const sat = String(saturdayKey || "").trim();
  const needsRepair =
    status.repairSaturdayKey || status.repairWeekKey;
  if (!needsRepair) return state;
  const next = {
    ...state,
    weekKey: String(weekKey || state.weekKey || ""),
  };
  if (sat && status.repairSaturdayKey) next.finalAnnouncedSaturdayKey = sat;
  await setBotState(STATE_KEY, next);
  return next;
}

async function repairMovieNightStaffCommunicationState(client, state, saturdayKey, status) {
  if (!status?.repairSaturdayKey || !state || typeof state !== "object") return state;
  const sat = String(saturdayKey || "").trim();
  if (!sat) return state;
  const next = {
    ...state,
    staffAnnouncedSaturdayKey: sat,
  };
  await setBotState(STATE_KEY, next);
  return next;
}

function logMovieNightFinalResult(result, label = "") {
  if (!result) return;
  const tag = label ? `[MOVIE NIGHT FINAL] ${label}` : "[MOVIE NIGHT FINAL]";
  if (result.ok) {
    global.logger?.info?.(
      `${tag} inviato:`,
      result.title || "?",
      result.messageId ? `msg=${result.messageId}` : "",
      result.weekKey ? `week=${result.weekKey}` : "",
    );
    return;
  }
  if (!result.skipped) {
    global.logger?.warn?.(`${tag} errore:`, result.reason || "unknown");
    return;
  }
  global.logger?.info?.(
    `${tag} skip:`,
    result.reason || "unknown",
    result.weekKey ? `week=${result.weekKey}` : "",
    result.stateWeekKey ? `stateWeek=${result.stateWeekKey}` : "",
    result.detail ? `(${result.detail})` : "",
  );
}

async function publishMovieNightStaffCommunication(client, { title, weekKey, now = new Date(), announceSlot = "" }) {
  const channel = await fetchStaffCommunicationChannel(client);
  if (!channel?.isTextBased?.() || !channel?.send) {
    return { ok: false, reason: "staff_channel_unavailable", weekKey };
  }

  const message = await channel.send({
    content: buildMovieNightStaffCommunicationMessage({
      title,
      dateLabel: formatMovieNightStaffDateLabel(now, {
        advanceForSaturday: String(announceSlot || "").toLowerCase() === "friday",
      }),
    }),
    allowedMentions: { roles: [STAFF_COMMUNICATION_ROLE_ID] },
  });

  return { ok: true, messageId: String(message.id || ""), weekKey };
}

async function runMovieNightFinalAnnouncementCheck(client, opts = {}) {
  if (movieNightFinalAnnouncementRunning) {
    const out = { skipped: true, reason: "already_running" };
    logMovieNightFinalResult(out, "concurrent");
    return out;
  }
  movieNightFinalAnnouncementRunning = true;
  try {
    if (!isMongoReady()) {
      const out = { skipped: true, reason: "mongo_not_ready" };
      logMovieNightFinalResult(out);
      return out;
    }
    const now = opts.now || new Date();
    const weekKey = getRomeWeekKey(now);
    const saturdayKey = getRomeSaturdayKeyForWeek(now);
    const announceSlot = getMovieNightFinalAnnouncementSlot(now, opts.slot);
    if (!opts.force && !announceSlot) {
      const out = { skipped: true, reason: "outside_final_announce_slot", weekKey };
      logMovieNightFinalResult(out);
      return out;
    }
    let state = await hydrateMovieNightStateForWeek(client, await getBotState(STATE_KEY, null), weekKey);
    if (announceSlot === "friday" && !opts.force && hasMovieNightSpareggio(state)) {
      const out = { skipped: true, reason: "spareggio_deferred_to_saturday", weekKey, saturdayKey };
      logMovieNightFinalResult(out);
      return out;
    }
    if (announceSlot === "friday" && state?.threadId && !state?.closedAt) {
      await runMovieNightThreadCloseCheck(client, { now }).catch((err) => {
        global.logger?.warn?.("[MOVIE NIGHT FINAL] friday thread close before announce failed:", err?.message || err);
      });
      state = (await hydrateMovieNightStateForWeek(client, await getBotState(STATE_KEY, null), weekKey)) || state;
      if (!opts.force && hasMovieNightSpareggio(state)) {
        const out = { skipped: true, reason: "spareggio_deferred_to_saturday", weekKey, saturdayKey };
        logMovieNightFinalResult(out);
        return out;
      }
    }
    if (state?.threadId && !state?.closedAt && announceSlot !== "friday") {
      await runMovieNightThreadCloseCheck(client, { now }).catch((err) => {
        global.logger?.warn?.("[MOVIE NIGHT FINAL] thread close before announce failed:", err?.message || err);
      });
      state = (await hydrateMovieNightStateForWeek(client, await getBotState(STATE_KEY, null), weekKey)) || state;
    }
    const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(now);
    if (fixedSchedule?.skip) {
      const out = { skipped: true, reason: "fixed_schedule_skip", weekKey };
      logMovieNightFinalResult(out);
      return out;
    }
    const hasFixedMovie = Boolean(getFixedMovieTitleForWeek(now));
    const allowWithoutMondayState =
      hasFixedMovie || FINAL_ANNOUNCEMENT_EXTRA_BEFORE_PING_SATURDAYS.has(saturdayKey);
    if (state?.weekKey !== weekKey && !allowWithoutMondayState) {
      const out = {
        skipped: true,
        reason: "state_not_current_week",
        weekKey,
        stateWeekKey: state?.weekKey || null,
      };
      logMovieNightFinalResult(out);
      return out;
    }
    if (!opts.force) {
      const announceStatus = await resolveMovieNightFinalAnnounceStatus(client, state, weekKey, saturdayKey);
      if (announceStatus.done) {
        state = await repairMovieNightFinalAnnounceState(client, state, weekKey, saturdayKey, announceStatus);
        const staffStatus = await resolveMovieNightStaffCommunicationStatus(client, state, saturdayKey);
        if (staffStatus.done) {
          await repairMovieNightStaffCommunicationState(client, state, saturdayKey, staffStatus);
        }
        const out = {
          skipped: true,
          reason: announceStatus.reason || "already_announced",
          weekKey,
          saturdayKey,
        };
        logMovieNightFinalResult(out);
        return out;
      }
    }

    const title = await resolveFinalMovieTitle(client, state, now);
    if (!title) {
      const detail = await describeFinalMovieTitleMiss(client, state, now).catch(() => "");
      const out = { skipped: true, reason: "winner_unavailable", weekKey, detail };
      logMovieNightFinalResult(out);
      if (detail) global.logger?.warn?.("[MOVIE NIGHT FINAL] winner_unavailable:", detail);
      return out;
    }

    const channel = await fetchAnnouncementChannel(client);
    if (!channel?.isTextBased?.() || !channel?.send) {
      const out = { skipped: true, reason: "announcement_channel_unavailable", weekKey };
      logMovieNightFinalResult(out);
      return out;
    }

    const description = await fetchItalianMovieDescription(title);
    const guildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
    const guild = guildId ? await getClientGuildCached(client, guildId).catch(() => null) : null;
    const event = guild ? await findCurrentWeekMovieNightEvent(guild, now) : null;
    const previousState =
      state?.weekKey === weekKey && typeof state === "object"
        ? state
        : typeof state === "object"
          ? state
          : {};
    const message = await channel.send({
      content: buildFinalMovieNightAnnouncementMessage({
        title,
        description,
        eventUrl: buildDiscordEventUrl(previousState?.guildId || guildId || IDs.guilds?.main, previousState?.eventId || event?.id),
        saturdayKey,
        announceSlot,
      }),
      allowedMentions: { roles: [EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID] },
    });

    const staffStatus = await resolveMovieNightStaffCommunicationStatus(client, previousState, saturdayKey);
    const staffResult = staffStatus.done
      ? { ok: true, messageId: String(previousState?.staffCommunicationMessageId || ""), skipped: true }
      : await publishMovieNightStaffCommunication(client, { title, weekKey, now, announceSlot });
    await setBotState(STATE_KEY, {
      ...previousState,
      weekKey,
      guildId: String(guild?.id || previousState?.guildId || guildId || ""),
      eventId: String(event?.id || previousState?.eventId || ""),
      finalMovieTitle: title,
      finalMovieDescription: description,
      finalAnnouncementMessageId: String(message.id || ""),
      finalAnnouncedSaturdayKey: saturdayKey,
      finalAnnouncedAt: new Date().toISOString(),
      ...(staffResult?.ok
        ? {
            staffCommunicationMessageId: String(staffResult.messageId || ""),
            staffCommunicationAt: new Date().toISOString(),
            staffAnnouncedSaturdayKey: saturdayKey,
          }
        : {}),
    });
    const out = {
      ok: true,
      title,
      messageId: String(message.id || ""),
      staffCommunicationMessageId: staffResult?.ok ? String(staffResult.messageId || "") : "",
      weekKey,
    };
    logMovieNightFinalResult(out);
    return out;
  } finally {
    movieNightFinalAnnouncementRunning = false;
  }
}

async function openMovieNightStagePermissions(guild) {
  const channel = guild.channels.cache.get(MOVIE_NIGHT_EVENT_CHANNEL_ID) || (await getGuildChannelCached(guild, MOVIE_NIGHT_EVENT_CHANNEL_ID));
  if (!channel?.permissionOverwrites?.edit) return false;

  const permissionPatch = {
    ViewChannel: true,
    Connect: true,
  };
  await channel.permissionOverwrites.edit(guild.roles.everyone.id, permissionPatch, { reason: "Apertura Serata Film" }).catch((err) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] everyone permission open failed:", err?.message || err);
  });
  const memberRoleId = String(IDs.roles?.Member || "");
  if (memberRoleId) {
    await channel.permissionOverwrites.edit(memberRoleId, permissionPatch, { reason: "Apertura Serata Film" }).catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] member permission open failed:", err?.message || err);
    });
  }
  return true;
}

async function closeMovieNightStagePermissions(guild) {
  const channel = guild.channels.cache.get(MOVIE_NIGHT_EVENT_CHANNEL_ID) || (await getGuildChannelCached(guild, MOVIE_NIGHT_EVENT_CHANNEL_ID));
  if (!channel?.permissionOverwrites?.edit) return false;

  const permissionPatch = {
    Connect: false,
  };
  await channel.permissionOverwrites.edit(guild.roles.everyone.id, permissionPatch, { reason: "Chiusura Serata Film" }).catch((err) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] everyone permission close failed:", err?.message || err);
  });
  const memberRoleId = String(IDs.roles?.Member || "");
  if (memberRoleId) {
    await channel.permissionOverwrites.edit(memberRoleId, permissionPatch, { reason: "Chiusura Serata Film" }).catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] member permission close failed:", err?.message || err);
    });
  }
  return true;
}

async function handleMovieNightEventStart(event, opts = {}) {
  const now = opts.now || new Date();
  const startDate = event?.scheduledStartAt || (event?.scheduledStartTimestamp ? new Date(event.scheduledStartTimestamp) : now);
  const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(startDate);
  if (fixedSchedule?.skip) return { skipped: true, reason: "fixed_schedule_skip" };
  if (!isTargetMovieNightEvent(event, now) && !isFixedScheduleMovieNightEvent(event, now)) return { skipped: true, reason: "not_movie_night_event" };
  const guild = event.guild || (await event.client?.guilds?.fetch?.(event.guildId).catch(() => null));
  if (!guild) return { skipped: true, reason: "guild_unavailable" };
  const client = event.client || guild.client;
  const weekKey = getRomeWeekKey(startDate);
  const state = await getBotState(STATE_KEY, null);
  if (!opts.force) {
    const startStatus = await resolveMovieNightEventStartStatus(client, state, weekKey);
    if (startStatus.done) {
      if (startStatus.repairWeekKey && state && typeof state === "object") {
        await setBotState(STATE_KEY, { ...state, weekKey });
      }
      return { skipped: true, reason: startStatus.reason || "already_announced", weekKey };
    }
  }

  const permissionsOpened = await openMovieNightStagePermissions(guild);
  const title = (await resolveFinalMovieTitle(client, state, startDate).catch(() => null)) || state?.finalMovieTitle || "il film scelto";
  const channel = guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || (await getGuildChannelCached(guild, ANNOUNCEMENT_CHANNEL_ID));
  if (!channel?.isTextBased?.() || !channel?.send) {
    return { skipped: true, reason: "announcement_channel_unavailable", weekKey, permissionsOpened };
  }

  const message = await channel.send({
    content: buildMovieNightStartAnnouncementMessage(title),
    allowedMentions: { parse: ["everyone"], roles: [SERATA_FILM_ROLE_ID] },
  });
  await setBotState(STATE_KEY, {
    ...(state && typeof state === "object" ? state : {}),
    weekKey,
    guildId: String(guild.id || ""),
    eventId: String(event.id || state?.eventId || ""),
    eventStartMovieTitle: title,
    eventStartMessageId: String(message.id || ""),
    stagePermissionsOpenedAt: permissionsOpened ? new Date().toISOString() : state?.stagePermissionsOpenedAt || "",
    eventStartAnnouncedAt: new Date().toISOString(),
  });
  return { ok: true, messageId: String(message.id || ""), title, permissionsOpened, weekKey };
}

async function resolveTextChannelForMovieNight(clientOrGuild) {
  const guild = clientOrGuild?.guilds ? null : clientOrGuild;
  const client = clientOrGuild?.guilds ? clientOrGuild : guild?.client;
  if (guild) {
    return guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || (await getGuildChannelCached(guild, ANNOUNCEMENT_CHANNEL_ID));
  }
  return client?.channels?.cache?.get(ANNOUNCEMENT_CHANNEL_ID) || (await client?.channels?.fetch?.(ANNOUNCEMENT_CHANNEL_ID).catch(() => null));
}

async function closeReviewThreadById(client, threadId) {
  const id = String(threadId || "");
  if (!id) return false;
  const thread = client.channels.cache.get(id) || (await client.channels.fetch(id).catch(() => null));
  if (!thread?.isThread?.()) return false;
  if (thread.archived && !thread.locked) {
    await thread.setArchived(false, "Riapertura tecnica per bloccare recensioni Serata Film").catch(() => null);
  }
  if (!thread.locked && thread.setLocked) {
    await thread.setLocked(true, "Chiusura recensioni Serata Film").catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread lock failed:", err?.message || err);
    });
  }
  if (!thread.archived && thread.setArchived) {
    await thread.setArchived(true, "Chiusura recensioni Serata Film").catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread archive failed:", err?.message || err);
    });
  }
  return true;
}

async function closeMovieNightReviewThreadIfDue(client, opts = {}) {
  const state = await getBotState(STATE_KEY, null);
  if (!state?.reviewThreadId || state?.reviewThreadClosedAt) return { skipped: true, reason: "no_open_review_thread" };
  const closeAt = Number(state.reviewThreadCloseAt || 0);
  if (!opts.force && (!closeAt || Date.now() < closeAt)) return { skipped: true, reason: "not_due" };
  const closed = await closeReviewThreadById(client, state.reviewThreadId);
  if (!closed) return { skipped: true, reason: "thread_unavailable" };
  await setBotState(STATE_KEY, {
    ...state,
    reviewThreadClosedAt: new Date().toISOString(),
  });
  return { ok: true, threadId: String(state.reviewThreadId || "") };
}

function scheduleMovieNightReviewThreadClose(client, closeAt) {
  if (movieNightReviewCloseTimer) clearTimeout(movieNightReviewCloseTimer);
  const delay = Math.max(1000, Number(closeAt || 0) - Date.now());
  movieNightReviewCloseTimer = setTimeout(() => {
    movieNightReviewCloseTimer = null;
    closeMovieNightReviewThreadIfDue(client, { force: true }).catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread close timer failed:", err?.message || err);
    });
  }, delay);
  movieNightReviewCloseTimer.unref?.();
}

async function withMovieNightStageCloseLock(weekKey, fn) {
  const lockKey = String(weekKey || "");
  const prev = movieNightStageCloseLocksByWeek.get(lockKey) || Promise.resolve();
  const mine = prev.catch(() => {}).then(() => fn());
  movieNightStageCloseLocksByWeek.set(lockKey, mine);
  try {
    return await mine;
  } finally {
    if (movieNightStageCloseLocksByWeek.get(lockKey) === mine) {
      movieNightStageCloseLocksByWeek.delete(lockKey);
    }
  }
}

function isMovieNightStageCloseMessage(message, client, maxAgeMs = MOVIE_NIGHT_END_ANNOUNCE_DEDUPE_MS) {
  if (!message) return false;
  const botId = String(client?.user?.id || "");
  if (botId && String(message.author?.id || "") !== botId) return false;
  if (!String(message.content || "").includes(MOVIE_NIGHT_END_ANNOUNCE_MARKER)) return false;
  const age = Date.now() - Number(message.createdTimestamp || 0);
  return age >= 0 && age <= maxAgeMs;
}

async function findRecentMovieNightEndAnnouncementInChannel(channel, client, maxAgeMs = MOVIE_NIGHT_END_ANNOUNCE_DEDUPE_MS) {
  if (!channel?.messages?.fetch) return null;
  const messages = await channel.messages.fetch({ limit: 25 }).catch(() => null);
  if (!messages?.size) return null;
  for (const message of messages.values()) {
    if (isMovieNightStageCloseMessage(message, client, maxAgeMs)) return message;
  }
  return null;
}

async function claimMovieNightStageCloseSlot(weekKey) {
  if (!isMongoReady()) return { claimed: true, reason: "no_mongo" };
  const stageCloseIdPath = `value.${STATE_KEY}.stageCloseMessageId`;
  const weekKeyPath = `value.${STATE_KEY}.weekKey`;
  try {
    const compact = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
    if (!compact) {
      const state = await getBotState(STATE_KEY, null);
      if (state?.weekKey === weekKey && state?.stageCloseMessageId && state.stageCloseMessageId !== "pending") {
        return { claimed: false, reason: "already_announced", state };
      }
      await setBotState(STATE_KEY, {
        ...(state && typeof state === "object" ? state : {}),
        weekKey,
        stageCloseMessageId: "pending",
      });
      return { claimed: true, reason: "legacy_reserve" };
    }
    const result = await BotState.updateOne(
      {
        key: COMPACT_BOTSTATE_KEY,
        $or: [
          { [weekKeyPath]: { $ne: weekKey } },
          { [stageCloseIdPath]: { $exists: false } },
          { [stageCloseIdPath]: null },
          { [stageCloseIdPath]: "" },
        ],
      },
      {
        $set: {
          [stageCloseIdPath]: "pending",
          [weekKeyPath]: weekKey,
        },
      },
    );
    if (Number(result?.modifiedCount || 0) > 0) return { claimed: true };
    const state = await getBotState(STATE_KEY, null);
    if (state?.weekKey === weekKey && state?.stageCloseMessageId && state.stageCloseMessageId !== "pending") {
      return { claimed: false, reason: "already_announced", state };
    }
    return { claimed: false, reason: "pending_other", state };
  } catch (err) {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] stage close claim failed:", err?.message || err);
    return { claimed: true, reason: "claim_error_fallback" };
  }
}

async function resolveReviewThreadFromMessage(message) {
  if (!message) return null;
  if (message.thread) return message.thread;
  const fetched = await message.fetch?.().catch(() => null);
  return fetched?.thread || null;
}

async function persistMovieNightStageCloseState({
  state,
  guild,
  weekKey,
  title,
  messageId,
  threadId,
  reviewThreadCloseAt,
  permissionsClosed,
}) {
  await setBotState(STATE_KEY, {
    ...(state && typeof state === "object" ? state : {}),
    weekKey,
    guildId: String(guild.id || ""),
    stageCloseMovieTitle: title,
    stageCloseMessageId: String(messageId || ""),
    reviewThreadId: String(threadId || ""),
    reviewThreadCloseAt,
    stagePermissionsClosedAt: permissionsClosed ? new Date().toISOString() : state?.stagePermissionsClosedAt || "",
    stageClosedAt: new Date().toISOString(),
  });
}

async function handleMovieNightStageClose(stageInstance, opts = {}) {
  const guild = stageInstance?.guild || stageInstance?.client?.guilds?.cache?.get(stageInstance?.guildId || "");
  const channelId = String(stageInstance?.channelId || stageInstance?.channel?.id || "");
  if (!guild || channelId !== MOVIE_NIGHT_EVENT_CHANNEL_ID) return { skipped: true, reason: "not_movie_night_stage" };

  const client = stageInstance?.client || guild.client;
  const weekKey = getRomeWeekKey(opts.now || new Date());
  const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(opts.now || new Date());
  if (fixedSchedule?.skip) return { skipped: true, reason: "fixed_schedule_skip", weekKey };

  return withMovieNightStageCloseLock(weekKey, async () => {
    const state = await getBotState(STATE_KEY, null);
    if (!opts.force && state?.weekKey === weekKey && state?.stageCloseMessageId && state.stageCloseMessageId !== "pending") {
      return { skipped: true, reason: "already_announced", weekKey };
    }

    const permissionsClosed = await closeMovieNightStagePermissions(guild);
    const title = (await resolveFinalMovieTitle(client, state, opts.now || new Date()).catch(() => null)) || state?.finalMovieTitle || state?.eventStartMovieTitle || "il film scelto";
    const channel = await resolveTextChannelForMovieNight(guild);
    if (!channel?.isTextBased?.() || !channel?.send) {
      return { skipped: true, reason: "announcement_channel_unavailable", weekKey, permissionsClosed };
    }

    const existingMessage = !opts.force ? await findRecentMovieNightEndAnnouncementInChannel(channel, client) : null;
    if (existingMessage) {
      const existingThread = await resolveReviewThreadFromMessage(existingMessage);
      const reviewThreadCloseAt = Number(state?.reviewThreadCloseAt || 0) || (Date.now() + REVIEW_THREAD_CLOSE_AFTER_MS);
      await persistMovieNightStageCloseState({
        state,
        guild,
        weekKey,
        title,
        messageId: existingMessage.id,
        threadId: existingThread?.id || state?.reviewThreadId || "",
        reviewThreadCloseAt,
        permissionsClosed,
      });
      if (existingThread?.id) scheduleMovieNightReviewThreadClose(client, reviewThreadCloseAt);
      return { ok: true, deduped: true, reason: "channel_recent_message", messageId: String(existingMessage.id || ""), threadId: String(existingThread?.id || ""), title, permissionsClosed, weekKey };
    }

    if (!opts.force) {
      const claim = await claimMovieNightStageCloseSlot(weekKey);
      if (!claim.claimed) {
        if (claim.reason === "already_announced" || claim.reason === "pending_other") {
          const retryMessage = await findRecentMovieNightEndAnnouncementInChannel(channel, client);
          if (retryMessage) {
            const retryThread = await resolveReviewThreadFromMessage(retryMessage);
            const reviewThreadCloseAt = Number(claim.state?.reviewThreadCloseAt || 0) || (Date.now() + REVIEW_THREAD_CLOSE_AFTER_MS);
            await persistMovieNightStageCloseState({
              state: claim.state || state,
              guild,
              weekKey,
              title,
              messageId: retryMessage.id,
              threadId: retryThread?.id || claim.state?.reviewThreadId || "",
              reviewThreadCloseAt,
              permissionsClosed,
            });
            if (retryThread?.id) scheduleMovieNightReviewThreadClose(client, reviewThreadCloseAt);
            return { ok: true, deduped: true, reason: "claim_lost_channel_message", messageId: String(retryMessage.id || ""), threadId: String(retryThread?.id || ""), title, permissionsClosed, weekKey };
          }
        }
        return { skipped: true, reason: claim.reason || "claim_failed", weekKey, permissionsClosed };
      }
    }

    const message = await channel.send({
      content: buildMovieNightEndAnnouncementMessage(title),
      allowedMentions: { roles: [SERATA_FILM_ROLE_ID] },
    });
    const thread = await message.startThread({
      name: REVIEW_THREAD_NAME,
      autoArchiveDuration: 1440,
      reason: "Thread automatico recensioni e suggerimenti Serata Film",
    }).catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread create failed:", err?.message || err);
      return null;
    });
    const reviewThreadCloseAt = Date.now() + REVIEW_THREAD_CLOSE_AFTER_MS;
    await persistMovieNightStageCloseState({
      state,
      guild,
      weekKey,
      title,
      messageId: message.id,
      threadId: thread?.id || "",
      reviewThreadCloseAt,
      permissionsClosed,
    });
    if (thread?.id) scheduleMovieNightReviewThreadClose(client, reviewThreadCloseAt);
    return { ok: true, messageId: String(message.id || ""), threadId: String(thread?.id || ""), title, permissionsClosed, weekKey };
  });
}

async function runMovieNightAnnouncementCheck(client, opts = {}) {
  if (movieNightAnnouncementRunning) return { skipped: true, reason: "already_running" };
  movieNightAnnouncementRunning = true;
  try {
    const now = opts.now || new Date();
    const weekKey = getRomeWeekKey(now);
    const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(now);
    if (fixedSchedule) {
      return { skipped: true, reason: fixedSchedule.skip ? "fixed_schedule_skip" : "fixed_schedule_movie", weekKey };
    }
    const state = await getBotState(STATE_KEY, null);
    if (!opts.force && state?.weekKey === weekKey && state?.messageId) {
      return { skipped: true, reason: "already_announced", weekKey };
    }

    const mainGuildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
    const guild = (mainGuildId && (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId)))) || client.guilds.cache.first();
    if (!guild) return { skipped: true, reason: "guild_unavailable", weekKey };

    const event = await findCurrentWeekMovieNightEvent(guild, now);
    if (!event) return { skipped: true, reason: "event_not_found", weekKey };

    return await publishMovieNightAnnouncement(guild, event, weekKey);
  } finally {
    movieNightAnnouncementRunning = false;
  }
}

async function runMovieNightThreadCloseCheck(client, opts = {}) {
  if (movieNightThreadCloseRunning) return { skipped: true, reason: "already_running" };
  movieNightThreadCloseRunning = true;
  try {
    const now = opts.now || new Date();
    const weekKey = getRomeWeekKey(now);
    const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(now);
    if (fixedSchedule) {
      return { skipped: true, reason: fixedSchedule.skip ? "fixed_schedule_skip" : "fixed_schedule_no_vote_thread", weekKey };
    }
    let state = await hydrateMovieNightStateForWeek(client, await getBotState(STATE_KEY, null), weekKey);
    if (!state?.threadId) {
      return { skipped: true, reason: "thread_not_recorded", weekKey };
    }
    if (!opts.force && state?.closedAt) {
      return { skipped: true, reason: "already_closed", weekKey };
    }

    const thread = await resolveMovieNightThread(client, state.threadId);
    if (!thread?.isThread?.()) return { skipped: true, reason: "thread_unavailable", weekKey };
    const tieBreaker = await maybePublishTieBreakerPoll(client, thread, state).catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] tie breaker poll failed:", err?.message || err);
      return { skipped: true, reason: "tie_poll_failed" };
    });
    if (thread.archived && !thread.locked) {
      await thread.setArchived(false, "Riapertura tecnica per bloccare il thread Serata Film").catch(() => null);
    }
    if (!thread.locked && thread.setLocked) {
      await thread.setLocked(true, "Chiusura votazioni Serata Film").catch((err) => {
        global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] thread lock failed:", err?.message || err);
      });
    }
    if (!thread.archived && thread.setArchived) {
      await thread.setArchived(true, "Chiusura votazioni Serata Film").catch((err) => {
        global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] thread archive failed:", err?.message || err);
      });
    }

    await setBotState(STATE_KEY, {
      ...state,
      weekKey,
      voteResults: Array.isArray(tieBreaker?.voteResults) ? tieBreaker.voteResults : state?.voteResults || [],
      tieBreakerPollMessageId: tieBreaker?.tieBreakerPollMessageId || state?.tieBreakerPollMessageId || "",
      tiedMovieTitles: tieBreaker?.tiedMovieTitles || state?.tiedMovieTitles || [],
      topTieVotes: Number.isFinite(Number(tieBreaker?.topVotes)) ? Number(tieBreaker.topVotes) : state?.topTieVotes,
      closedAt: new Date().toISOString(),
    });
    return { ok: true, threadId: String(thread.id || ""), weekKey };
  } finally {
    movieNightThreadCloseRunning = false;
  }
}

function inferFinalAnnounceSlotFromMessage(content) {
  return /\*\*Domani\*\*/.test(String(content || "")) ? "friday" : "saturday";
}

async function repairFinalMovieNightAnnouncementDescription(client) {
  const state = await getBotState(STATE_KEY, null);
  const messageId = String(state?.finalAnnouncementMessageId || "").trim();
  const title = String(state?.finalMovieTitle || "").trim();
  if (!messageId || !title) return { skipped: true, reason: "no_announcement" };

  const description = await fetchItalianMovieDescription(title);
  const previousDescription = String(state?.finalMovieDescription || "").trim();
  if (!description || description === previousDescription) {
    return { skipped: true, reason: "already_correct", title };
  }

  const channel = await fetchAnnouncementChannel(client);
  if (!channel?.messages?.fetch) {
    return { skipped: true, reason: "announcement_channel_unavailable", title };
  }
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message?.edit) return { skipped: true, reason: "message_unavailable", title };

  const content = buildFinalMovieNightAnnouncementMessage({
    title,
    description,
    eventUrl: buildDiscordEventUrl(state?.guildId || IDs.guilds?.main, state?.eventId),
    saturdayKey: String(state?.finalAnnouncedSaturdayKey || ""),
    announceSlot: inferFinalAnnounceSlotFromMessage(message.content),
  });
  await message.edit({
    content,
    allowedMentions: { roles: [EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID] },
  });
  await setBotState(STATE_KEY, {
    ...state,
    finalMovieDescription: description,
    finalMovieDescriptionRepairedAt: new Date().toISOString(),
  });
  global.logger?.info?.("[MOVIE NIGHT FINAL] descrizione aggiornata:", title, `msg=${messageId}`);
  return { ok: true, title, messageId, description };
}

function startMovieNightAnnouncementLoop(client) {
  if (!client || movieNightAnnouncementTasks) return movieNightAnnouncementTasks;
  const announceTask = cron.schedule(
    ANNOUNCE_CRON,
    runCronDetached("[MOVIE NIGHT ANNOUNCE]", () => runMovieNightAnnouncementCheck(client)),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const closeTask = cron.schedule(
    CLOSE_THREAD_CRON,
    runCronDetached("[MOVIE NIGHT THREAD CLOSE]", () => runMovieNightThreadCloseCheck(client)),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const finalAnnouncementFridayTask = cron.schedule(
    FINAL_ANNOUNCEMENT_FRIDAY_CRON,
    runCronDetached("[MOVIE NIGHT FINAL ANNOUNCE FRIDAY]", () =>
      runMovieNightFinalAnnouncementCheck(client, { slot: "friday" }),
    ),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const finalAnnouncementSaturdayTask = cron.schedule(
    FINAL_ANNOUNCEMENT_SATURDAY_CRON,
    runCronDetached("[MOVIE NIGHT FINAL ANNOUNCE SATURDAY]", () =>
      runMovieNightFinalAnnouncementCheck(client, { slot: "saturday" }),
    ),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  movieNightReviewCloseSweep = setInterval(() => {
    closeMovieNightReviewThreadIfDue(client).catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread close sweep failed:", err?.message || err);
    });
  }, REVIEW_THREAD_SWEEP_MS);
  movieNightReviewCloseSweep.unref?.();
  setTimeout(() => {
    repairFinalMovieNightAnnouncementDescription(client).catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT FINAL] repair descrizione fallito:", err?.message || err);
    });
  }, 15000).unref?.();
  movieNightAnnouncementTasks = {
    announceTask,
    closeTask,
    finalAnnouncementFridayTask,
    finalAnnouncementSaturdayTask,
  };
  return movieNightAnnouncementTasks;
}

module.exports = { buildMovieNightStaffCommunicationMessage, buildFinalMovieNightAnnouncementMessage, buildMovieNightEndAnnouncementMessage, buildMovieNightAnnouncementMessage, buildMovieNightStartAnnouncementMessage, buildTieBreakerAnnouncementMessage, collectMovieNightVoteResults, fetchItalianMovieDescription, findCurrentWeekMovieNightEvent, getFixedMovieTitleForWeek, getHarryPotterMovieNightScheduleForWeek, getRomeWeekKey, handleMovieNightEventStart, handleMovieNightStageClose, isTargetMovieNightEvent, closeMovieNightStagePermissions, closeMovieNightReviewThreadIfDue, repairFinalMovieNightAnnouncementDescription, runMovieNightAnnouncementCheck, runMovieNightFinalAnnouncementCheck, runMovieNightThreadCloseCheck, startMovieNightAnnouncementLoop };