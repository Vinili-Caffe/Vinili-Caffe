/**
 * Malus quiz Star Wars — solo sul tipo starWarsQuiz.
 */
"use strict";

type MalusId =
  | "yoda"
  | "spotchka"
  | "hansicle"
  | "sospensione"
  | "cortocircuito"
  | "geonosiana"
  | "jarjar";

type MalusDef = {
  id: MalusId;
  title: string;
  short: string;
  description: string;
  artUrl: string;
  /** Trasforma testo domanda/opzioni sull'immagine. */
  transformsText: boolean;
  /** Congela utenti (non possono rispondere). */
  freezesUsers: boolean;
  /** Richiede 3 risposte corrette dalla stessa fazione. */
  teamWin: boolean;
};

const MALUS_ART_CDN = "https://cdn.viniliecaffe.it/images/starwars/quiz/malus";
const MALUS_ART_V = "20261104m2";

function malusArtUrl(id: MalusId) {
  return `${MALUS_ART_CDN}/malus-${id}.jpg?v=${MALUS_ART_V}`;
}

const MALUS_CATALOG: MalusDef[] = [
  {
    id: "yoda",
    title: "Yoda ha parlato",
    short: "Parole in ordine random",
    description:
      "Le parole della domanda sono mischiate. Decifra l'ordine e rispondi comunque con la risposta corretta.",
    artUrl: malusArtUrl("yoda"),
    transformsText: true,
    freezesUsers: false,
    teamWin: false,
  },
  {
    id: "spotchka",
    title: "Spotchka per tutti",
    short: "Lettere mischiate",
    description:
      "Domanda e opzioni: lettere e spazi mischiati in tutta la frase (confini parola spezzati). La risposta da scrivere resta quella vera.",
    artUrl: malusArtUrl("spotchka"),
    transformsText: true,
    freezesUsers: false,
    teamWin: false,
  },
  {
    id: "hansicle",
    title: "Congelamento all'Hansicle",
    short: "1 attivo + 2 random · per fazione",
    description:
      "Congela **per fazione**: su **ogni fazione** prende **1 più attivo + 2 a caso**. I congelati non possono rispondere ai quiz finché dura il malus.",
    artUrl: malusArtUrl("hansicle"),
    transformsText: false,
    freezesUsers: true,
    teamWin: false,
  },
  {
    id: "sospensione",
    title: "Campo di sospensione temporanea",
    short: "1 attivo + 2 random · globale",
    description:
      "Effetto **globale**: congela **3 utenti di una sola fazione** scelta a caso (**1 più attivo + 2 a caso**). I congelati non possono rispondere ai quiz finché dura il malus.",
    artUrl: malusArtUrl("sospensione"),
    transformsText: false,
    freezesUsers: true,
    teamWin: false,
  },
  {
    id: "cortocircuito",
    title: "Cortocircuito del droide",
    short: "Frase a specchio",
    description:
      "Tutta la domanda (e le opzioni) è scritta al contrario, come in uno specchio. La risposta da scrivere resta quella corretta.",
    artUrl: malusArtUrl("cortocircuito"),
    transformsText: true,
    freezesUsers: false,
    teamWin: false,
  },
  {
    id: "geonosiana",
    title: "Mente Geonosiana",
    short: "3 risposte · stessa fazione",
    description:
      "Viene scelta una fazione: servono **3 membri diversi** di quella fazione che diano la risposta giusta. Con 1 o 2 soli non si vince.",
    artUrl: malusArtUrl("geonosiana"),
    transformsText: false,
    freezesUsers: false,
    teamWin: true,
  },
  {
    id: "jarjar",
    title: "Jar Jar parla troppo",
    short: "Idioletto multilanguage",
    description:
      "La domanda è piena di parole tradotte in latino, spagnolo, inglese o portoghese (anche mescolate nella stessa frase). Capisci il senso e rispondi bene.",
    artUrl: malusArtUrl("jarjar"),
    transformsText: true,
    freezesUsers: false,
    teamWin: false,
  },
];

const MALUS_BY_ID = Object.fromEntries(MALUS_CATALOG.map((m) => [m.id, m]));

function listQuizMalus() {
  return MALUS_CATALOG.slice();
}

function getQuizMalus(id?) {
  const key = String(id || "").trim().toLowerCase();
  return MALUS_BY_ID[key] || null;
}

function pickRandomQuizMalus(excludeId?) {
  const pool = MALUS_CATALOG.filter((m) => m.id !== excludeId);
  if (!pool.length) return MALUS_CATALOG[0] || null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export = {
  MALUS_CATALOG,
  MALUS_ART_CDN,
  MALUS_ART_V,
  malusArtUrl,
  listQuizMalus,
  getQuizMalus,
  pickRandomQuizMalus,
};
