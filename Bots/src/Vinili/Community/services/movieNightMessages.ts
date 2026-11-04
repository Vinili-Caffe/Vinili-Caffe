/** Serata film: testi degli annunci (votazione, spareggio, staff, finale, inizio, fine). */
const { MOVIE_NIGHT_DISPLAY_TIME, buildMovieNightFinalClosingLines, formatMovieNightStaffDateLabel } = require("./movieNightSchedule") as typeof import("./movieNightSchedule");
const { MOVIE_NIGHT_EVENT_CHANNEL_ID } = require("./movieNightEvents") as typeof import("./movieNightEvents");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { siteWorkflowUrl } = require("../../site/http/discordWorkflowUiGate") as typeof import("../../site/http/discordWorkflowUiGate");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const EVENTS_ROLE_ID = String(IDs.roles?.Events || "1544830669023346688");
/* serataFilmPingMerge1: Serata Film eliminato → ping Events */
const SERATA_FILM_ROLE_ID = String(IDs.roles?.Events || IDs.roles?.SerataFilm || "1544830669023346688");
const STAFF_COMMUNICATION_ROLE_ID = String(IDs.roles?.Staff || "1442568910070349985");
const FINAL_ANNOUNCEMENT_EXTRA_BEFORE_PING_SATURDAYS = new Set(["2026-05-23"]);
const CHAT_CHANNEL_ID = String(IDs.channels?.chat || "1442569130573303898");

function buildMovieNightAnnouncementMessage() {
  return [
    `## ${E.VC_Announce} **SERATA FILM**`,
    "",
    `> ${E.VC_Stats} Ecco il thread in cui suggerire il film da guardare **Sabato alle ${MOVIE_NIGHT_DISPLAY_TIME}**. Non c'è un genere definito, quindi potete consigliare **qualsiasi film**.`,
    "",
    `${E.VC_PinkQuestionMark} Come funziona:`,
    `${E.VC_DoubleReply} Scrivete il nome di uno o più film (in messaggi separati) e il bot in automatico aggiungerà la reaction ${E.VC_Vote} per votare;`,
    `${E.VC_Reply} Cliccate sulla reaction ${E.VC_Vote} per votare un film (senza limiti, potete votare per quanti volete);`,
    "",
    `${E.VC_BanHammer} **VIETATO:**`,
    `${E.VC_Dot} Suggerire titoli di saghe con trama continua, è consentito solo se i film non richiedono di guardare tutti i film della saga in sequenza;`,
    `${E.VC_Dot} Suggerire film di durata maggiore di 2 ore e 30 minuti;`,
    `${E.VC_Dot} Suggerire un film già suggerito nello stesso thread;`,
    `${E.VC_Dot} Suggerire un film già visto in precedenza;`,
    `${E.VC_Dot} Parlare di altro, qui si dovrà solo scrivere il titolo del film.`,
    "",
    `${E.VC_Alarm} È fatto obbligo di specificare l'anno di uscita del film (anche tra parentesi), soprattutto se ci sono più versioni dello stesso film. Senza anno il messaggio viene cancellato automaticamente.`,
    "",
    `${E.VC_Attention} **PENA:** __Cancellazione dei messaggi__`,
    "",
    `${E.VC_Ping}︲<@&${EVENTS_ROLE_ID}>`,
  ].join("\n");
}

function joinMovieTitlesForMessage(titles?) {
  const list = titles.map((title?) => `**${title}**`);
  if (list.length <= 2) return list.join(" e ");
  return `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}`;
}

function buildTieBreakerAnnouncementMessage(threadId?, titles?) {
  return [
    `## ${E.VC_Announce} **SERATA FILM**`,
    "",
    `> ${E.VC_Stats}  Essendoci un **pareggio** nel thread <#${threadId}> tra ${joinMovieTitlesForMessage(titles)} abbiamo deciso di fare un breve sondaggio per decidere quale guardare!`,
    "",
    `${E.VC_Vote} __Votate il sondaggio in basso__`,
    "",
    `${E.VC_Ping}︲<@&${EVENTS_ROLE_ID}>`,
  ].join("\n");
}

function buildDiscordEventUrl(guildId?, eventId?) {
  const gid = String(guildId || IDs.guilds?.main || "");
  const eid = String(eventId || "");
  if (!gid || !eid) return "https://discord.com/events";
  return `https://discord.com/events/${gid}/${eid}`;
}

function buildMovieNightStaffCommunicationMessage({ title, dateLabel }) {
  const film = String(title || "").trim() || "il film in programma";
  const when = String(dateLabel || "").trim() || `Oggi, alle ${MOVIE_NIGHT_DISPLAY_TIME}`;
  return [
    `# ${E.VC_Alert} COMUNICAZIONE SERATA FILM`,
    "",
    `> ${E.VC_Calendar} **${when}**, proietteremo **${film}**. Durerà all'incirca un'ora e mezza ma tanto saremo tutti mutati (__non silenziati__) quindi potete anche stare AFK. __L'importante è essere presenti nel canale vocale.__`,
    "",
    `> ${E.VC_Exclamation} Dobbiamo far vedere che gli eventi sono frequentati. L'affluenza genera interesse e credibilità. Se lo staff partecipa in massa, si innesca un effetto catena positivo su tutta la community perché gli utenti vedranno che l'iniziativa funziona e si uniranno di più in futuro. __Chi non parteciperà all'evento è importante che sia conscio del fatto che riceverà una valutazione negativa.__`,
    "",
    `> ${E.VC_handleft}${E.VC_handright} Supportare l'evento equivale a sostenere il server. Non si tratta solo di guardare un film, ma di mandare un segnale chiaro: *le iniziative della community contano e meritano attenzione.*`,
    "",
    `> ${E.VC_Rocket} Vi ricordo anche che in vocale gli **XP** sono **doppi**. Questo è da tenere in considerazione per futuri eventi.`,
    "",
    `> ${E.VC_OfflineStatus} Ricordo a tutti che potete segnalare la vostra assenza alla serata film fino alle 20:45 di Sabato sul **sito staff** (<${siteWorkflowUrl("staff")}>), ciò per evitare valutazioni negative errate.`,
    "",
    `${E.VC_Ping}・<@&${STAFF_COMMUNICATION_ROLE_ID}>`,
  ].join("\n");
}

function buildFinalAnnouncementMonthlyActivityBlock() {
  return [
    `> # ${E.VC_Exclamation} RICORDA L’EVENTO MENSILE!`,
    `Il membro che a fine mese risulterà il più attivo vincerà Nitro Boost per un mese, il secondo una decorazione da massimo 15,99€ e il terzo il ruolo VIP+ per 30 giorni! Ti aspettiamo in <#${CHAT_CHANNEL_ID}>!`,
  ].join("\n");
}

function buildFinalMovieNightAnnouncementMessage({ title, description, eventUrl, saturdayKey, announceSlot }: any) {
  const fridayAdvance = String(announceSlot || "").toLowerCase() === "friday";
  const whenLine = fridayAdvance
    ? `> ${E.VC_movie} Tutto è pronto! **Domani** sera, alle **${MOVIE_NIGHT_DISPLAY_TIME}**, inizierà il nostro appuntamento con il cinema trasmettendo **${title}**!`
    : `> ${E.VC_movie} Tutto è pronto! Questa sera, alle **${MOVIE_NIGHT_DISPLAY_TIME}**, inizierà il nostro appuntamento con il cinema trasmettendo **${title}**!`;
  const lines = [
    `# ${E.VC_Announce} SERATA FILM`,
    "",
    whenLine,
    "",
    `${E.VC_Info} Non sai di cosa parla?`,
    description,
    "",
    ...buildMovieNightFinalClosingLines({ fridayAdvance }),
    "",
    `${E.VC_CommunityManager} [Salva l'evento](${eventUrl})`,
  ];
  const satKey = String(saturdayKey || "").trim();
  if (satKey && FINAL_ANNOUNCEMENT_EXTRA_BEFORE_PING_SATURDAYS.has(satKey)) {
    lines.push("", buildFinalAnnouncementMonthlyActivityBlock());
  }
  lines.push("", `${E.VC_Ping}︲<@&${SERATA_FILM_ROLE_ID}>`);
  return lines.join("\n");
}

function buildMovieNightStartAnnouncementMessage(title?) {
  return [
    `# ${E.VC_Announce} SERATA FILM`,
    "",
    `> ${E.VC_movie} Tutto è pronto! Tra pochi minuti, alle **${MOVIE_NIGHT_DISPLAY_TIME}**, inizierà il nostro appuntamento con il cinema trasmettendo **${title}**!`,
    "",
    `${E.VC_HeartsPink} Vi aspettiamo in numerosi in <#${MOVIE_NIGHT_EVENT_CHANNEL_ID}>`,
    "",
    `${E.VC_Ping}︲<@&${SERATA_FILM_ROLE_ID}> . @everyone`,
  ].join("\n");
}

function buildMovieNightEndAnnouncementMessage(title?, options: Record<string, any> = {}) {
  const reviewThreadId = String(options?.reviewThreadId || "").trim();
  const reviewCta = reviewThreadId
    ? `${E.VC_NewsExclamation} Hai un suggerimento o vuoi lasciare una recensione per i prossimi eventi? Scrivi in <#${reviewThreadId}>!`
    : `${E.VC_NewsExclamation} Hai un suggerimento o vuoi lasciare una recensione per i prossimi eventi? Usa il thread qui sotto!`;
  const lines = [
    `# ${E.VC_Firework} SERATA FILM ANDATA!`,
    "",
    `> ${E.VC_HeartsBlue} Grazie per aver partecipato attivamente alla proiezione di **${title}**. `,
    "",
  ];
  lines.push(
    reviewCta,
    "",
    `> ${E.VC_lil_swag}  Alla prossima proiezione!`,
    "",
    `${E.VC_Ping}︲<@&${SERATA_FILM_ROLE_ID}>`,
  );
  return lines.join("\n");
}

function withReviewThreadMentionInEndContent(content?, threadId?) {
  const id = String(threadId || "").trim();
  const raw = String(content || "");
  if (!id || !raw) return raw;
  if (raw.includes(`<#${id}>`)) return raw;
  const linked =
    `${E.VC_NewsExclamation} Hai un suggerimento o vuoi lasciare una recensione per i prossimi eventi? Scrivi in <#${id}>!`;
  if (raw.includes("Usa il thread qui sotto!")) {
    return raw.replace(
      /<a:VC_NewsExclamation:[^>]+>\s*Hai un suggerimento o vuoi lasciare una recensione per i prossimi eventi\? Usa il thread qui sotto!/,
      linked,
    );
  }
  return raw;
}

function buildMovieNightStaffCommunicationPayload({ title, now = new Date(), announceSlot = "" }) {
  return {
    content: buildMovieNightStaffCommunicationMessage({
      title,
      dateLabel: formatMovieNightStaffDateLabel(now, {
        advanceForSaturday: String(announceSlot || "").toLowerCase() === "friday",
      }),
    }),
    allowedMentions: { roles: [STAFF_COMMUNICATION_ROLE_ID] },
        __skipNoticeEmbed: true,
  };
}

export = { EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID, STAFF_COMMUNICATION_ROLE_ID, FINAL_ANNOUNCEMENT_EXTRA_BEFORE_PING_SATURDAYS, buildMovieNightAnnouncementMessage, buildTieBreakerAnnouncementMessage, buildDiscordEventUrl, buildMovieNightStaffCommunicationMessage, buildFinalMovieNightAnnouncementMessage, buildMovieNightStartAnnouncementMessage, buildMovieNightEndAnnouncementMessage, withReviewThreadMentionInEndContent, buildMovieNightStaffCommunicationPayload };
