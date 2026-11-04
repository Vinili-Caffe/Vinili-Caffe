/**
 * Banche contenuti minigame Star Wars (tema evento).
 */
"use strict";

const PLANET_CDN = "https://cdn.viniliecaffe.it/images/starwars/planets";
const PLANET_V = "20261104p2";

type SwPlanet = {
  id: string;
  name: string;
  aliases?: string[];
  imageUrl: string;
};

type SwQuote = {
  verse: string;
  answer: string;
  answers?: string[];
  song: string;
  artist: string;
};

function planetUrl(id?) {
  return `${PLANET_CDN}/planet-${String(id || "").trim()}.jpg?v=${PLANET_V}`;
}

const STAR_WARS_PLANETS: SwPlanet[] = [
  { id: "tatooine", name: "Tatooine", aliases: ["tatooine"], imageUrl: planetUrl("tatooine") },
  { id: "naboo", name: "Naboo", aliases: ["naboo"], imageUrl: planetUrl("naboo") },
  { id: "coruscant", name: "Coruscant", aliases: ["coruscant"], imageUrl: planetUrl("coruscant") },
  { id: "alderaan", name: "Alderaan", aliases: ["alderaan"], imageUrl: planetUrl("alderaan") },
  { id: "endor", name: "Endor", aliases: ["endor", "luna di endor"], imageUrl: planetUrl("endor") },
  { id: "hoth", name: "Hoth", aliases: ["hoth"], imageUrl: planetUrl("hoth") },
  { id: "kamino", name: "Kamino", aliases: ["kamino"], imageUrl: planetUrl("kamino") },
  { id: "mustafar", name: "Mustafar", aliases: ["mustafar"], imageUrl: planetUrl("mustafar") },
  { id: "jakku", name: "Jakku", aliases: ["jakku"], imageUrl: planetUrl("jakku") },
  { id: "kessel", name: "Kessel", aliases: ["kessel"], imageUrl: planetUrl("kessel") },
  { id: "jedha", name: "Jedha", aliases: ["jedha"], imageUrl: planetUrl("jedha") },
  { id: "mandalore", name: "Mandalore", aliases: ["mandalore", "mandalor"], imageUrl: planetUrl("mandalore") },
  { id: "exegol", name: "Exegol", aliases: ["exegol"], imageUrl: planetUrl("exegol") },
  { id: "felucia", name: "Felucia", aliases: ["felucia"], imageUrl: planetUrl("felucia") },
  { id: "dantooine", name: "Dantooine", aliases: ["dantooine"], imageUrl: planetUrl("dantooine") },
  { id: "moncala", name: "Mon Cala", aliases: ["mon cala", "moncala", "dac"], imageUrl: planetUrl("moncala") },
  { id: "iridonia", name: "Iridonia", aliases: ["iridonia"], imageUrl: planetUrl("iridonia") },
  { id: "onderon", name: "Onderon", aliases: ["onderon"], imageUrl: planetUrl("onderon") },
  { id: "vandor", name: "Vandor", aliases: ["vandor", "vandor-1"], imageUrl: planetUrl("vandor") },
  { id: "ortoplutonia", name: "Orto Plutonia", aliases: ["orto plutonia", "ortoplutonia"], imageUrl: planetUrl("ortoplutonia") },
  { id: "bespin", name: "Bespin", aliases: ["bespin"], imageUrl: planetUrl("bespin") },
  { id: "dagobah", name: "Dagobah", aliases: ["dagobah"], imageUrl: planetUrl("dagobah") },
  { id: "geonosis", name: "Geonosis", aliases: ["geonosis"], imageUrl: planetUrl("geonosis") },
  { id: "utapau", name: "Utapau", aliases: ["utapau"], imageUrl: planetUrl("utapau") },
  { id: "kashyyyk", name: "Kashyyyk", aliases: ["kashyyyk", "kashyyk"], imageUrl: planetUrl("kashyyyk") },
  { id: "scarif", name: "Scarif", aliases: ["scarif"], imageUrl: planetUrl("scarif") },
  { id: "ahchto", name: "Ahch-To", aliases: ["ahch-to", "ahchto", "ach-to"], imageUrl: planetUrl("ahchto") },
  { id: "cantonica", name: "Cantonica", aliases: ["cantonica", "canto bight"], imageUrl: planetUrl("cantonica") },
  { id: "lothal", name: "Lothal", aliases: ["lothal"], imageUrl: planetUrl("lothal") },
  { id: "ryloth", name: "Ryloth", aliases: ["ryloth"], imageUrl: planetUrl("ryloth") },
  { id: "corellia", name: "Corellia", aliases: ["corellia"], imageUrl: planetUrl("corellia") },
  { id: "dathomir", name: "Dathomir", aliases: ["dathomir"], imageUrl: planetUrl("dathomir") },
  { id: "crait", name: "Crait", aliases: ["crait"], imageUrl: planetUrl("crait") },
  { id: "yavin4", name: "Yavin 4", aliases: ["yavin 4", "yavin4", "yavin"], imageUrl: planetUrl("yavin4") },
  { id: "nalhutta", name: "Nal Hutta", aliases: ["nal hutta", "nalhutta", "hutta"], imageUrl: planetUrl("nalhutta") },
  { id: "ilum", name: "Ilum", aliases: ["ilum"], imageUrl: planetUrl("ilum") },
  { id: "christophsis", name: "Christophsis", aliases: ["christophsis"], imageUrl: planetUrl("christophsis") },
  { id: "mygeeto", name: "Mygeeto", aliases: ["mygeeto"], imageUrl: planetUrl("mygeeto") },
  { id: "umbara", name: "Umbara", aliases: ["umbara"], imageUrl: planetUrl("umbara") },
  { id: "saleucami", name: "Saleucami", aliases: ["saleucami"], imageUrl: planetUrl("saleucami") },
  { id: "florrum", name: "Florrum", aliases: ["florrum"], imageUrl: planetUrl("florrum") },
  { id: "malachor", name: "Malachor", aliases: ["malachor"], imageUrl: planetUrl("malachor") },
];

const STAR_WARS_HANGMAN_WORDS = [
  "jedi",
  "sith",
  "yoda",
  "vader",
  "skywalker",
  "padawan",
  "impero",
  "repubblica",
  "alleanza",
  "ribellione",
  "droide",
  "clone",
  "mandaloriano",
  "beskar",
  "holocron",
  "forza",
  "sidious",
  "palpatine",
  "amidala",
  "organa",
  "chewbecca",
  "anakin",
  "obiwan",
  "kenobi",
  "ahsoka",
  "grievous",
  "maul",
  "dooku",
  "wookiee",
  "ewook",
  "millennium falcon",
  "x wing",
  "morte nera",
  "iperspazio",
  "grogu",
  "mandalore",
  "tatooine",
  "naboo",
  "coruscant",
  "endor",
  "mustafar",
  "kamino",
  "geonosis",
  "dagobah",
  "jakku",
  "exegol",
  "scarif",
  "jedha",
];

const STAR_WARS_MEMORY_EMOJI = [
  "⚔️",
  "🛡️",
  "🚀",
  "🛰️",
  "🌟",
  "✨",
  "🪐",
  "🌍",
  "🌑",
  "☄️",
  "🤖",
  "👾",
  "👽",
  "👑",
  "🎩",
  "🪄",
  "🔮",
  "💎",
  "🪙",
  "📜",
  "🧭",
  "🎯",
  "🔥",
  "❄️",
  "⚡",
  "🌀",
  "🛸",
  "🚁",
  "🗡️",
  "🏹",
];

const STAR_WARS_FAST_TYPE_PHRASES = [
  "Che la Forza sia con te",
  "Io sono tuo padre",
  "Fai o non fare, non esiste provare",
  "Ho una cattiva sensazione a riguardo",
  "Questi non sono i drodi che state cercando",
  "Io trovo la tua mancanza di fede inquietante",
  "In una galassia lontana lontana",
  "La paura conduce all'ira, l'ira conduce all'odio, l'odio conduce alla sofferenza",
  "Io sono un Jedi, come lo era mio padre prima di me",
  "Questa è la Via",
  "Esegui l'ordine 66",
  "Hello there",
  "È così che muore la libertà: sotto scruscianti applausi",
  "Chi è più pazzo? Il pazzo o il pazzo che lo segue?",
];

/** Completa citazione: blank da riempire. */
const STAR_WARS_COMPLETE_QUOTE: SwQuote[] = [
  {
    verse: "Che la ___ sia con te",
    answer: "Forza",
    answers: ["Forza"],
    song: "Jedi",
    artist: "Star Wars",
  },
  {
    verse: "Luke, io sono tuo ___",
    answer: "padre",
    answers: ["padre"],
    song: "Darth Vader",
    artist: "L'Impero colpisce ancora",
  },
  {
    verse: "Fare o non fare, non c'è ___",
    answer: "provare",
    answers: ["provare"],
    song: "Yoda",
    artist: "L'Impero colpisce ancora",
  },
  {
    verse: "Questi non sono i ___ che state cercando",
    answer: "droidi",
    answers: ["droidi"],
    song: "Obi-Wan",
    artist: "Una nuova speranza",
  },
  {
    verse: "Io trovo la tua mancanza di ___ inquietante",
    answer: "fede",
    answers: ["fede"],
    song: "Darth Vader",
    artist: "Una nuova speranza",
  },
  {
    verse: "Esegui l'ordine ___",
    answer: "66",
    answers: ["66"],
    song: "Palpatine",
    artist: "La vendetta dei Sith",
  },
  {
    verse: "Questa e la ___",
    answer: "Via",
    answers: ["Via"],
    song: "Mandaloriani",
    artist: "The Mandalorian",
  },
  {
    verse: "Hello ___",
    answer: "there",
    answers: ["there"],
    song: "Obi-Wan",
    artist: "La vendetta dei Sith",
  },
  {
    verse: "Illimitato ___",
    answer: "potere",
    answers: ["potere"],
    song: "Palpatine",
    artist: "La vendetta dei Sith",
  },
  {
    verse: "La paura conduce all'ira, l'ira conduce all'odio, l'odio conduce alla ___",
    answer: "sofferenza",
    answers: ["sofferenza"],
    song: "Yoda",
    artist: "La minaccia fantasma",
  },
  {
    verse: "Usa la ___ , Luke",
    answer: "Forza",
    answers: ["Forza"],
    song: "Obi-Wan",
    artist: "Una nuova speranza",
  },
  {
    verse: "Io sono un ___ , come mio padre prima di me",
    answer: "Jedi",
    answers: ["jedi"],
    song: "Luke",
    artist: "Il ritorno dello Jedi",
  },
];

function maskPlanetHint(name?) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const chars = [...raw];
  if (chars.length <= 2) return chars.join("");
  return chars
    .map((ch, i) => {
      if (/\s|-/.test(ch)) return ch;
      if (i === 0 || i === chars.length - 1) return ch.toUpperCase();
      if (/\p{L}|\p{N}/u.test(ch)) return "_";
      return ch;
    })
    .join("");
}

function getStarWarsHangmanWords() {
  return STAR_WARS_HANGMAN_WORDS.slice();
}

/** Come la bank normale: oggetti `{ sequence: string[] }`, non emoji singole. */
function getStarWarsMemoryEmojiBank() {
  const pool = STAR_WARS_MEMORY_EMOJI.slice();
  if (pool.length < 4) return [];
  const out = [];
  const makeSeq = (len, seed) => {
    const arr = pool.slice();
    // shuffle deterministico-ish da seed
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = (seed * (i + 3) + i * 17) % (i + 1);
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr.slice(0, len);
  };
  for (let i = 0; i < 16; i += 1) {
    out.push({ sequence: makeSeq(4, i + 1) });
  }
  for (let i = 0; i < 8; i += 1) {
    out.push({ sequence: makeSeq(5, i + 40) });
  }
  return out;
}

function getStarWarsFastTypePhrases() {
  return STAR_WARS_FAST_TYPE_PHRASES.slice();
}

function getStarWarsCompleteQuoteBank() {
  return STAR_WARS_COMPLETE_QUOTE.slice();
}

function getStarWarsPlanetsBank(_onlyWithArt = true) {
  return STAR_WARS_PLANETS.slice();
}

export = {
  PLANET_CDN,
  PLANET_V,
  STAR_WARS_PLANETS,
  maskPlanetHint,
  getStarWarsHangmanWords,
  getStarWarsMemoryEmojiBank,
  getStarWarsFastTypePhrases,
  getStarWarsCompleteQuoteBank,
  getStarWarsPlanetsBank,
};
