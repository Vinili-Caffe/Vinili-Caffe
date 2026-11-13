import { fmt, hours, type WrappedPayload } from "./wrapped";

/** Soglie soft (all-time / ultimi ~2 mesi voti). */
const MSG_MANY = 1500;
const VOICE_FEW_H = 12;
const VOICE_MANY_H = 40;
const VOTES_MANY = 20;
const NIGHT_MSG_MIN = 40;
const MENTION_RECV_MIN = 80;
const MENTION_MADE_MIN = 80;
const GIF_MIN = 40;
const CMD_MIN = 50;
const EMOJI_MIN = 30;

export type StoryCard = {
  key: string;
  kicker: string;
  title: string;
  body: string;
  footnote?: string;
  celebrate?: boolean;
  /** dato chiave della scheda, per il resoconto finale */
  stat?: string;
};

function pctLine(betterThanPct: number): string | undefined {
  if (betterThanPct <= 0) return undefined;
  if (betterThanPct >= 98) return `Sei nel top ${Math.max(1, 100 - betterThanPct)}%.`;
  return `Meglio del ${betterThanPct}% degli utenti attivi.`;
}

function voiceHomeLabel(data: WrappedPayload): string {
  const ch = data.recent.topVoiceChannels[0];
  if (ch?.resolved && ch.name) return ch.name;
  return "un canale vocale";
}

/** Schede Wrapped con copy a soglie. */
export function buildStoryCards(data: WrappedPayload): StoryCard[] {
  const a = data.allTime;
  const r = data.recent;
  const name = data.user.displayName;
  const cards: StoryCard[] = [
    {
      key: "hello",
      kicker: `Vinili Wrapped · ${data.year}`,
      title: `Ciao, ${name}`,
      body: "Il tuo disco della community — senza brani, solo te.",
    },
  ];

  if (data.user.daysInServer) {
    cards.push({
      key: "days",
      kicker: "Nel server",
      title: `${fmt(data.user.daysInServer)} giorni`,
      body: "Da quanto hai messo piede qui. Il vinile gira ancora.",
      stat: `${fmt(data.user.daysInServer)} giorni`,
    });
  }

  const msg = a.messagesTotal;
  if (msg < MSG_MANY) {
    cards.push({
      key: "messages",
      kicker: "Messaggi",
      title: "Fantasma preferito",
      body: `Ti piace osservare nell'ombra. Hai letto tantissimo ma hai inviato solo ${fmt(msg)} messaggi. Sei il nostro fantasma preferito!`,
      footnote: pctLine(a.messagesBetterThanPct),
      stat: `${fmt(msg)} messaggi`,
    });
  } else {
    cards.push({
      key: "messages",
      kicker: "Messaggi",
      title: "Copymaster",
      body: `Sei un vero copymaster. Hai scritto in totale ${fmt(msg)} messaggi. Praticamente potresti scriverci una tesi!`,
      footnote: pctLine(a.messagesBetterThanPct),
      stat: `${fmt(msg)} messaggi`,
    });
  }

  const voiceH = a.voiceTotalSeconds / 3600;
  const homeVc = voiceHomeLabel(data);
  if (a.voiceTotalSeconds <= 0) {
    cards.push({
      key: "voice",
      kicker: "Vocale",
      title: "Terrore da microfono",
      body: "I nostri canali vocali ti terrorizzano talmente tanto da non esserci mai entrato. Nemmeno per sbaglio!",
      stat: "0 ore",
    });
  } else if (voiceH < VOICE_FEW_H) {
    cards.push({
      key: "voice",
      kicker: "Vocale",
      title: "Un po' in soggezione",
      body: `I nostri canali vocali ti mettono un po' in soggezione: hai trascorso solo ${hours(a.voiceTotalSeconds)} a parlare con noi.`,
      footnote: pctLine(a.voiceBetterThanPct),
      stat: hours(a.voiceTotalSeconds),
    });
  } else if (voiceH >= VOICE_MANY_H) {
    cards.push({
      key: "voice",
      kicker: "Vocale",
      title: homeVc.startsWith("#") ? `Residente in ${homeVc}` : "Residente vocale",
      body: `Praticamente hai preso la residenza in ${homeVc}. Ci hai trascorso ben ${hours(a.voiceTotalSeconds)}. È assolutamente assurdo!`,
      footnote: pctLine(a.voiceBetterThanPct),
      stat: hours(a.voiceTotalSeconds),
    });
  } else {
    cards.push({
      key: "voice",
      kicker: "Vocale",
      title: hours(a.voiceTotalSeconds),
      body: `Hai passato ${hours(a.voiceTotalSeconds)} in call. Né fantasma né inquilino fisso.`,
      footnote: pctLine(a.voiceBetterThanPct),
      stat: hours(a.voiceTotalSeconds),
    });
  }

  const votes = a.votesTotal ?? 0;
  if (votes <= 0) {
    cards.push({
      key: "support",
      kicker: "Sostegno",
      title: "0 voti",
      stat: "0 voti",
      body: "Voti per il server? Quali voti? Hai supportato la nostra crescita esattamente 0 volte. Tranquillo, ti facciamo godere i frutti del lavoro altrui gratis.",
    });
  } else if (votes >= VOTES_MANY) {
    cards.push({
      key: "support",
      kicker: "Sostegno",
      title: "PR di fiducia",
      stat: `${fmt(votes)} voti`,
      body: `Sei il nostro PR di fiducia! Hai votato il server ben ${fmt(votes)} volte. Il nostro reparto marketing dovrebbe seriamente pagarti lo stipendio.`,
    });
  } else {
    cards.push({
      key: "support",
      kicker: "Sostegno",
      title: "Dovere civico",
      stat: `${fmt(votes)} ${votes === 1 ? "voto" : "voti"}`,
      body: `Hai fatto il tuo dovere civico. Con i tuoi ${fmt(votes)} voti hai contribuito a farci crescere. Grazie!`,
    });
  }

  const boosts = a.boosts ?? 0;
  if (boosts > 0 || a.isBoosting) {
    cards.push({
      key: "boost",
      kicker: "Sostegno",
      title: "Mecenate",
      stat: boosts > 0 ? `${fmt(boosts)} boost` : "Boost attivo",
      body:
        boosts > 0
          ? `Il vero mecenate del server sei tu. Hai effettuato un totale di ${fmt(boosts)} boost. Senza di te saremmo solo dei pixel poveri. Grazie!`
          : "Il vero mecenate del server sei tu. Stai boostando Vinili & Caffè. Senza di te saremmo solo dei pixel poveri. Grazie!",
    });
  }

  if (a.minigameTotalExp > 0) {
    const streakBit = a.bestStreak > 1 ? ` Serie migliore: ${fmt(a.bestStreak)}.` : "";
    cards.push({
      key: "games",
      kicker: "Minigiochi",
      title: "Ludopatia certificata",
      stat: `${fmt(a.minigameTotalExp)} EXP`,
      body: `Non ti perdi mai niente. Hai accumulato un totale di ${fmt(a.minigameTotalExp)} EXP con i nostri minigames. Soffri decisamente di ludopatia!${streakBit}`,
      footnote:
        pctLine(a.minigameBetterThanPct) ||
        (a.bestStreak > 1 ? "I minigames ti conoscono per nome e per streak!" : undefined),
    });
  }

  /* —— TI RENDE PARTICOLARE: una sola, priorità —— */
  const night = a.nightMessages ?? r.nightMessages ?? 0;
  const mentionsRecv = a.mentionsReceived ?? 0;
  const mentionsMade = a.mentionsMade ?? 0;
  const gifs = (a.gifsTotal ?? 0) + (a.imagesTotal ?? 0);
  const cmds = a.commandsTotal ?? 0;
  const topEmoji = a.topEmoji;
  type Particular = { score: number; card: StoryCard };
  const candidates: Particular[] = [];

  if (night >= NIGHT_MSG_MIN) {
    candidates.push({
      score: night,
      card: {
        key: "particular",
        kicker: "Ti rende particolare",
        title: "I vampiri ti temono",
        stat: `${fmt(night)} msg di notte`,
        body: `Hai inviato ${fmt(night)} messaggi a notte fonda. Forse è ora che tu vada a dormire!`,
      },
    });
  }
  if (mentionsRecv >= MENTION_RECV_MIN) {
    candidates.push({
      score: mentionsRecv,
      card: {
        key: "particular",
        kicker: "Ti rende particolare",
        title: "VIP del bancone",
        stat: `${fmt(mentionsRecv)} menzioni`,
        body: `Sei proprio al centro dell'attenzione, un vero VIP. Sei stato menzionato ${fmt(mentionsRecv)} volte. Inizia a servirti una scorta!`,
      },
    });
  }
  if (mentionsMade + (a.rolePings ?? 0) >= MENTION_MADE_MIN) {
    const pings = mentionsMade + (a.rolePings ?? 0);
    candidates.push({
      score: pings,
      card: {
        key: "particular",
        kicker: "Ti rende particolare",
        title: "Dito sulla chiocciola",
        stat: `${fmt(pings)} tag`,
        body: `Hai il dito facile sulla chiocciola. Hai taggato gli altri ben ${fmt(pings)} volte. Ma sei un raider o cosa?!?`,
      },
    });
  }
  if (gifs >= GIF_MIN) {
    candidates.push({
      score: gifs,
      card: {
        key: "particular",
        kicker: "Ti rende particolare",
        title: "Artista visivo",
        stat: `${fmt(gifs)} GIF e immagini`,
        body: `Perché usare le parole quando ci sono le immagini? Hai intasato la chat con ${fmt(gifs)} GIF/immagini. Un vero artista visivo.`,
      },
    });
  }
  if (cmds >= CMD_MIN) {
    candidates.push({
      score: cmds,
      card: {
        key: "particular",
        kicker: "Ti rende particolare",
        title: "Boss dei bot",
        stat: `${fmt(cmds)} comandi`,
        body: `Hai schiavizzato i nostri bot lanciando ben ${fmt(cmds)} comandi. Speriamo che un giorno non si ribellino...`,
      },
    });
  }
  if (topEmoji && topEmoji.count >= EMOJI_MIN) {
    candidates.push({
      score: topEmoji.count,
      card: {
        key: "particular",
        kicker: "Ti rende particolare",
        title: "Gusti raffinati",
        stat: `:${topEmoji.name}: ×${fmt(topEmoji.count)}`,
        body: `Le emoji standard ti annoiano. Hai spammato l'emoji :${topEmoji.name}: per ben ${fmt(topEmoji.count)} volte. Gusti decisamente raffinati.`,
      },
    });
  }

  if (candidates.length) {
    candidates.sort((x, y) => y.score - x.score);
    cards.push(candidates[0].card);
  }

  cards.push({
    key: "role",
    kicker: "Il tuo ruolo",
    title: data.archetype.label,
    body: data.archetype.blurb,
    celebrate: true,
  });

  cards.push({
    key: "share",
    kicker: "Il tuo anno",
    title: name,
    body: `${data.archetype.label} · Lv.${a.level} · #${a.allTimeRank} · ${fmt(a.messagesTotal)} msg · ${hours(a.voiceTotalSeconds)}`,
  });

  return cards;
}
