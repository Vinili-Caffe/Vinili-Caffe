const HALLOWEEN_QUIZ_BANK = [
  { question: "In che data si celebra Halloween?", answers: ["31 ottobre", "31/10", "31 ott"] },
  { question: "Come si chiama la zucca intagliata tipica di Halloween?", answers: ["Jack-o'-lantern", "Jack o lantern", "Jackolantern"] },
  { question: "Cosa si dice tipicamente quando si bussa a Halloween?", answers: ["Trick or treat", "Dolcetto o scherzetto"] },
  { question: "Quale mostro beve sangue?", answers: ["Vampiro", "Vampire"] },
  { question: "Quale creatura si trasforma con la luna piena?", answers: ["Lupo mannaro", "Werewolf", "Mannaro"] },
  { question: "Come si chiama il fantasma amico di Harry Potter?", answers: ["Nick Quasi Senza Testa", "Nick", "Nearly Headless Nick"] },
  { question: "Quale film horror ha come killer un tipo con maschera di hockey?", answers: ["Venerdì 13", "Friday the 13th"] },
  { question: "In quale film un ragazzo vede i morti?", answers: ["The Sixth Sense", "Il sesto senso", "Sixth Sense"] },
  { question: "Come si chiama la casa stregata più famosa nei film horror americani?", answers: ["Amityville"] },
  { question: "Quale dolce arancione è tipico di Halloween?", answers: ["Zucca", "Pumpkin", "Caramella"] },
  { question: "Come si chiama il mostro di Frankenstein (il creatore)?", answers: ["Frankenstein", "Victor Frankenstein"] },
  { question: "Quale creatura egizia torna in vita nelle mummie?", answers: ["Mummia", "Mummy"] },
  { question: "In quale serie TV i ragazzi affrontano il Mondo Sottosopra?", answers: ["Stranger Things"] },
  { question: "Come si chiama il clown di It?", answers: ["Pennywise"] },
  { question: "Quale festa celtica è all'origine di Halloween?", answers: ["Samhain"] },
  { question: "Quale colore è tipico insieme all'arancione a Halloween?", answers: ["Nero", "Black"] },
  { question: "Come si chiama il demone di The Exorcist?", answers: ["Pazuzu"] },
  { question: "Quale film ha come frase iconica 'Here's Johnny!'?", answers: ["Shining", "The Shining"] },
  { question: "Quale animale volante è simbolo di Halloween?", answers: ["Pipistrello", "Bat"] },
  { question: "Come si chiama la strega verde del Mago di Oz?", answers: ["Wicked Witch", "Strega dell'Ovest", "Elphaba"] },
  { question: "In quale film i fantasmi vengono catturati da un team di New York?", answers: ["Ghostbusters", "Ghost Busters"] },
  { question: "Quale mostro ha bulloni nel collo?", answers: ["Frankenstein", "Mostro di Frankenstein"] },
  { question: "Come si chiama la festa messicana dedicata ai defunti?", answers: ["Día de los Muertos", "Dia de los Muertos", "Giorno dei Morti"] },
  { question: "Quale film di Tim Burton racconta Halloween Town?", answers: ["Nightmare Before Christmas", "The Nightmare Before Christmas"] },
  { question: "Come si chiama lo scheletro cantante di Nightmare Before Christmas?", answers: ["Jack Skellington", "Jack"] },
];

const HALLOWEEN_MEMORY_EMOJI_BANK = [
  { sequence: ["🎃", "👻", "🦇", "🕷️"] },
  { sequence: ["🍬", "🖤", "🧙", "🌕"] },
  { sequence: ["🧛", "🧟", "🕯️", "🎃"] },
  { sequence: ["🦇", "🕸️", "👻", "💀"] },
  { sequence: ["🎃", "🍬", "🧙", "🦇", "👻"] },
  { sequence: ["🕷️", "🌕", "🖤", "🧛", "🕯️"] },
  { sequence: ["🧟", "🕸️", "💀", "🎃", "🍬"] },
  { sequence: ["👻", "🦇", "🧙", "🕷️", "🌕"] },
  { sequence: ["🎃", "🦇", "🍬", "👻"] },
  { sequence: ["💀", "🖤", "🕷️", "🕸️"] },
  { sequence: ["🧙", "🔮", "🎃", "🦇"] },
  { sequence: ["🌕", "🐺", "🦇", "🌲"] },
];

const HALLOWEEN_HANGMAN_WORDS = [
  "zucca", "fantasma", "vampiro", "strega", "mummia", "scheletro", "pipistrello",
  "caramella", "cimitero", "mostruoso", "halloween", "lupo", "ragno", "castello",
  "ombra", "teschio", "magia", "potione", "notte", "buio", "scherzo", "dolcetto",
  "frankenstein", "dracula", "zombie", "incubus", "corvo", "nebbia", "tomba",
];

const HALLOWEEN_GUESS_YEAR_BANK = [
  { type: "film", title: "Halloween", year: 1978 },
  { type: "film", title: "Nightmare - Dal profondo della notte", year: 1984 },
  { type: "film", title: "Scream", year: 1996 },
  { type: "film", title: "The Sixth Sense", year: 1999 },
  { type: "film", title: "The Ring", year: 2002 },
  { type: "film", title: "Saw - L'enigmista", year: 2004 },
  { type: "film", title: "Paranormal Activity", year: 2007 },
  { type: "film", title: "Insidious", year: 2010 },
  { type: "film", title: "It", year: 2017 },
  { type: "film", title: "A Quiet Place", year: 2018 },
  { type: "film", title: "Midsommar", year: 2019 },
  { type: "film", title: "The Conjuring - Il caso Enfield", year: 2013 },
  { type: "film", title: "Nightmare Before Christmas", year: 1993 },
  { type: "film", title: "Beetlejuice", year: 1988 },
  { type: "film", title: "Ghostbusters", year: 1984 },
  { type: "film", title: "The Exorcist", year: 1973 },
  { type: "film", title: "Shining", year: 1980 },
  { type: "film", title: "Dracula di Bram Stoker", year: 1992 },
  { type: "series", title: "Stranger Things", year: 2016 },
  { type: "series", title: "The Walking Dead", year: 2010 },
  { type: "series", title: "American Horror Story", year: 2011 },
  { type: "series", title: "Wednesday", year: 2022 },
  { type: "song", title: "Thriller", subtitle: "Michael Jackson", year: 1982 },
  { type: "song", title: "Ghostbusters", subtitle: "Ray Parker Jr.", year: 1984 },
  { type: "song", title: "This Is Halloween", subtitle: "Nightmare Before Christmas", year: 1993 },
];

const HALLOWEEN_COMPLETE_VERSE_BANK = [
  { verse: "Cause this is thriller, ___", answer: "thriller night", song: "Thriller", artist: "Michael Jackson" },
  { verse: "Who you gonna call? ___", answer: "Ghostbusters", song: "Ghostbusters", artist: "Ray Parker Jr." },
  { verse: "This is Halloween, this is ___", answer: "Halloween", song: "This Is Halloween", artist: "Nightmare Before Christmas" },
  { verse: "I ain't afraid of no ___", answer: "ghost", song: "Ghostbusters", artist: "Ray Parker Jr." },
  { verse: "It's close to midnight and something evil's lurking in the ___", answer: "dark", song: "Thriller", artist: "Michael Jackson" },
  { verse: "Dolcetto o ___?", answer: "scherzetto", song: "Tradizione", artist: "Halloween" },
  { verse: "Trick or ___", answer: "treat", song: "Tradizione", artist: "Halloween" },
  { verse: "Jack Skellington is the Pumpkin ___", answer: "King", song: "Nightmare Before Christmas", artist: "Danny Elfman" },
  { verse: "Something wicked this way ___", answer: "comes", song: "Citazione", artist: "Shakespeare" },
  { verse: "Beware the moon, for the ___", answer: "werewolf", song: "Leggenda", artist: "Folklore" },
];

const HALLOWEEN_EMOJI_POOL = ["🎃", "👻", "🦇", "🕷️", "🍬", "🧙", "🧛", "🧟", "💀", "🕸️", "🌕", "🖤", "🕯️"];

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

[
  HALLOWEEN_QUIZ_BANK,
  HALLOWEEN_MEMORY_EMOJI_BANK,
  HALLOWEEN_HANGMAN_WORDS,
  HALLOWEEN_GUESS_YEAR_BANK,
  HALLOWEEN_COMPLETE_VERSE_BANK,
].forEach((bank) => shuffleInPlace(bank));

function getHalloweenQuizBank() {
  return HALLOWEEN_QUIZ_BANK;
}
function getHalloweenMemoryEmojiBank() {
  return HALLOWEEN_MEMORY_EMOJI_BANK;
}
function getHalloweenHangmanWords() {
  return HALLOWEEN_HANGMAN_WORDS;
}
function getHalloweenGuessYearBank() {
  return HALLOWEEN_GUESS_YEAR_BANK;
}
function getHalloweenCompleteVerseBank() {
  return HALLOWEEN_COMPLETE_VERSE_BANK;
}
function getHalloweenEmojiPool() {
  return HALLOWEEN_EMOJI_POOL;
}

function buildHalloweenMissingEmojiRound() {
  const pool = HALLOWEEN_EMOJI_POOL.slice();
  shuffleInPlace(pool);
  const len = Math.random() < 0.45 ? 5 : 4;
  const sequence = pool.slice(0, len);
  const hideIndex = Math.floor(Math.random() * sequence.length);
  const missing = sequence[hideIndex];
  const display = sequence.map((e, i) => (i === hideIndex ? "❓" : e));
  return {
    display: display.join(" "),
    missing,
    answers: [missing],
  };
}

function buildHalloweenCountBatsRound() {
  const count = 3 + Math.floor(Math.random() * 8);
  const decoys = ["🎃", "👻", "🕷️", "🍬", "💀", "🕸️", "🧙", "🌕"];
  const tokens = [];
  for (let i = 0; i < count; i += 1) tokens.push("🦇");
  const decoyCount = 4 + Math.floor(Math.random() * 7);
  for (let i = 0; i < decoyCount; i += 1) {
    tokens.push(decoys[Math.floor(Math.random() * decoys.length)]);
  }
  shuffleInPlace(tokens);
  return {
    display: tokens.join(" "),
    count,
    answers: [String(count)],
  };
}

module.exports = {
  getHalloweenQuizBank,
  getHalloweenMemoryEmojiBank,
  getHalloweenHangmanWords,
  getHalloweenGuessYearBank,
  getHalloweenCompleteVerseBank,
  getHalloweenEmojiPool,
  buildHalloweenMissingEmojiRound,
  buildHalloweenCountBatsRound,
};
