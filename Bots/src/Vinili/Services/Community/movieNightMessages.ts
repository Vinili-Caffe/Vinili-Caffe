/** Serata film: testi degli annunci (votazione, spareggio, staff, finale, inizio, fine). */
const { MOVIE_NIGHT_DISPLAY_TIME, buildMovieNightFinalClosingLines, formatMovieNightStaffDateLabel } = require("./movieNightSchedule") as typeof import("./movieNightSchedule");
const { MOVIE_NIGHT_EVENT_CHANNEL_ID } = require("./movieNightEvents") as typeof import("./movieNightEvents");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { siteWorkflowUrl } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");

const EVENTS_ROLE_ID = String(IDs.roles?.Events || "1544830669023346688");
/* serataFilmPingMerge1: Serata Film eliminato → ping Events */
const SERATA_FILM_ROLE_ID = String(IDs.roles?.Events || IDs.roles?.SerataFilm || "1544830669023346688");
const STAFF_COMMUNICATION_ROLE_ID = String(IDs.roles?.Staff || "1442568910070349985");
const FINAL_ANNOUNCEMENT_EXTRA_BEFORE_PING_SATURDAYS = new Set(["2026-05-23"]);
const CHAT_CHANNEL_ID = String(IDs.channels?.chat || "1442569130573303898");

function buildMovieNightAnnouncementMessage() {
  return [
    "## <a:VC_Announce:1482534613568979007> **SERATA FILM**",
    "",
    `> <:VC_Stats:1482527532682055780> Ecco il thread in cui suggerire il film da guardare **Sabato alle ${MOVIE_NIGHT_DISPLAY_TIME}**. Non c'è un genere definito, quindi potete consigliare **qualsiasi film**.`,
    "",
    "<:VC_PinkQuestionMark:1471892611026391306> Come funziona:",
    "<:VC_DoubleReply:1482532332509466797> Scrivete il nome di uno o più film (in messaggi separati) e il bot in automatico aggiungerà la reaction <a:VC_Vote:1482535223001485473> per votare;",
    "<:VC_Reply:1482532158080942191> Cliccate sulla reaction <a:VC_Vote:1482535223001485473> per votare un film (senza limiti, potete votare per quanti volete);",
    "",
    "<:VC_BanHammer:1482534474502897795> **VIETATO:**",
    "<:VC_Dot:1482532364222595303> Suggerire titoli di saghe con trama continua, è consentito solo se i film non richiedono di guardare tutti i film della saga in sequenza;",
    "<:VC_Dot:1482532364222595303> Suggerire film di durata maggiore di 2 ore e 30 minuti;",
    "<:VC_Dot:1482532364222595303> Suggerire un film già suggerito nello stesso thread;",
    "<:VC_Dot:1482532364222595303> Suggerire un film già visto in precedenza;",
    "<:VC_Dot:1482532364222595303> Parlare di altro, qui si dovrà solo scrivere il titolo del film.",
    "",
    "<a:VC_Alarm:1482706641618079816> È fatto obbligo di specificare l'anno di uscita del film (anche tra parentesi), soprattutto se ci sono più versioni dello stesso film. Senza anno il messaggio viene cancellato automaticamente.",
    "",
    "<:VC_Attention:1482534443632558151> **PENA:** __Cancellazione dei messaggi__",
    "",
    `<a:VC_Ping:1482694298687246377>︲<@&${EVENTS_ROLE_ID}>`,
  ].join("\n");
}

function joinMovieTitlesForMessage(titles?) {
  const list = titles.map((title?) => `**${title}**`);
  if (list.length <= 2) return list.join(" e ");
  return `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}`;
}

function buildTieBreakerAnnouncementMessage(threadId?, titles?) {
  return [
    "## <a:VC_Announce:1482534613568979007> **SERATA FILM**",
    "",
    `> <:VC_Stats:1482527532682055780>  Essendoci un **pareggio** nel thread <#${threadId}> tra ${joinMovieTitlesForMessage(titles)} abbiamo deciso di fare un breve sondaggio per decidere quale guardare!`,
    "",
    "<a:VC_Vote:1482535223001485473> __Votate il sondaggio in basso__",
    "",
    `<a:VC_Ping:1482694298687246377>︲<@&${EVENTS_ROLE_ID}>`,
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
    `> <:VC_OfflineStatus:1482527117051957380> Ricordo a tutti che potete segnalare la vostra assenza alla serata film fino alle 20:45 di Sabato sul **sito staff** (<${siteWorkflowUrl("staff")}>), ciò per evitare valutazioni negative errate.`,
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

function buildFinalMovieNightAnnouncementMessage({ title, description, eventUrl, saturdayKey, announceSlot }: any) {
  const fridayAdvance = String(announceSlot || "").toLowerCase() === "friday";
  const whenLine = fridayAdvance
    ? `> <:VC_movie:1497534838801174559> Tutto è pronto! **Domani** sera, alle **${MOVIE_NIGHT_DISPLAY_TIME}**, inizierà il nostro appuntamento con il cinema trasmettendo **${title}**!`
    : `> <:VC_movie:1497534838801174559> Tutto è pronto! Questa sera, alle **${MOVIE_NIGHT_DISPLAY_TIME}**, inizierà il nostro appuntamento con il cinema trasmettendo **${title}**!`;
  const lines = [
    "# <a:VC_Announce:1482534613568979007> SERATA FILM",
    "",
    whenLine,
    "",
    "<:VC_Info:1482526956703580372> Non sai di cosa parla?",
    description,
    "",
    ...buildMovieNightFinalClosingLines({ fridayAdvance }),
    "",
    `<:VC_CommunityManager:1494286896459681924> [Salva l'evento](${eventUrl})`,
  ];
  const satKey = String(saturdayKey || "").trim();
  if (satKey && FINAL_ANNOUNCEMENT_EXTRA_BEFORE_PING_SATURDAYS.has(satKey)) {
    lines.push("", buildFinalAnnouncementMonthlyActivityBlock());
  }
  lines.push("", `<a:VC_Ping:1482694298687246377>︲<@&${SERATA_FILM_ROLE_ID}>`);
  return lines.join("\n");
}

function buildMovieNightStartAnnouncementMessage(title?) {
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

function buildMovieNightEndAnnouncementMessage(title?, options: Record<string, any> = {}) {
  const reviewThreadId = String(options?.reviewThreadId || "").trim();
  const reviewCta = reviewThreadId
    ? `<a:VC_NewsExclamation:1471891662786527253> Hai un suggerimento o vuoi lasciare una recensione per i prossimi eventi? Scrivi in <#${reviewThreadId}>!`
    : "<a:VC_NewsExclamation:1471891662786527253> Hai un suggerimento o vuoi lasciare una recensione per i prossimi eventi? Usa il thread qui sotto!";
  const lines = [
    "# <:VC_Firework:1470796227913322658> SERATA FILM ANDATA!",
    "",
    `> <a:VC_HeartsBlue:1468686100045369404> Grazie per aver partecipato attivamente alla proiezione di **${title}**. `,
    "",
  ];
  lines.push(
    reviewCta,
    "",
    "> <a:VC_lil_swag:1494319540954464327>  Alla prossima proiezione!",
    "",
    `<a:VC_Ping:1482694298687246377>︲<@&${SERATA_FILM_ROLE_ID}>`,
  );
  return lines.join("\n");
}

function withReviewThreadMentionInEndContent(content?, threadId?) {
  const id = String(threadId || "").trim();
  const raw = String(content || "");
  if (!id || !raw) return raw;
  if (raw.includes(`<#${id}>`)) return raw;
  const linked =
    `<a:VC_NewsExclamation:1471891662786527253> Hai un suggerimento o vuoi lasciare una recensione per i prossimi eventi? Scrivi in <#${id}>!`;
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
