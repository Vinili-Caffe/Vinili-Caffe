const { HOGWARTS_QUIZ_BANK } = require("./hogwartsQuizBank") as typeof import("./hogwartsQuizBank");

const HOGWARTS_GUESS_WORDS = [
  "lumos", "accio", "hagrid", "dobby", "nagini", "edvige", "riddle", "lupin", "filch", "piton",
  "silente", "granger", "weasley", "patronus", "leviosa", "gringott", "quidditch", "serpeverde",
  "grifondoro", "tassorosso", "corvonero", "horcrux", "moony", "padfoot", "prongs", "wormtail",
  "expelliarmus", "alohomora", "obliviate", "ridikulus", "nox", "stupefy", "sectumsempra",
];

const HOGWARTS_HANGMAN_WORDS = [
  "lumos", "accio", "hagrid", "dobby", "nagini", "edvige", "riddle", "lupin", "filch", "piton",
  "silente", "granger", "weasley", "patronus", "leviosa", "gringott", "quidditch", "serpeverde",
  "grifondoro", "tassorosso", "corvonero", "horcrux", "moony", "padfoot", "prongs", "wormtail",
  "alohomora", "obliviate", "ridikulus", "stupefy", "wingardium", "expelliarmus",
];

const HOGWARTS_FAST_TYPING_PHRASES = [
  "wingardium leviosa",
  "expelliarmus",
  "lumos maxima",
  "expecto patronum",
  "avada kedavra",
  "alohomora",
  "accio",
  "nox",
  "obliviate",
  "riddikulus",
  "stupefy",
  "non aprite la camera dei segreti",
  "il binario nove e tre quarti",
  "la pietra filosofale",
  "il principe mezzosangue",
  "i doni della morte",
  "il cappello parlante",
  "la bacchetta sceglie il mago",
  "che la magia sia con te",
  "hogwarts non dimentica mai",
  "serpeverde per sempre",
  "grifondoro per sempre",
  "corvonero per sempre",
  "tassorosso per sempre",
  "il quidditch è vita",
  "edvige porta la posta",
  "dobby è un elfo libero",
  "non dire mai il nome di voldemort",
  "il ministero della magia",
  "diagon alley",
  "hogsmeade",
];

const HOGWARTS_GUESS_YEAR_BANK = [
  { type: "film", title: "Harry Potter e la pietra filosofale", year: 2001 },
  { type: "film", title: "Harry Potter e la Camera dei segreti", year: 2002 },
  { type: "film", title: "Harry Potter e il prigioniero di Azkaban", year: 2004 },
  { type: "film", title: "Harry Potter e il calice di fuoco", year: 2005 },
  { type: "film", title: "Harry Potter e l'Ordine della Fenice", year: 2007 },
  { type: "film", title: "Harry Potter e il principe mezzosangue", year: 2009 },
  { type: "film", title: "Harry Potter e i Doni della Morte - Parte 1", year: 2010 },
  { type: "film", title: "Harry Potter e i Doni della Morte - Parte 2", year: 2011 },
  { type: "film", title: "Animali fantastici e dove trovarli", year: 2016 },
  { type: "film", title: "Animali fantastici: I crimini di Grindelwald", year: 2018 },
  { type: "film", title: "Animali fantastici: I segreti di Silente", year: 2022 },
];

const HOGWARTS_COMPLETE_VERSE_BANK = [
  { verse: "Wingardium ___", answer: "Leviosa", song: "Incantesimo", artist: "Hermione" },
  { verse: "Expecto ___", answer: "Patronum", song: "Incantesimo", artist: "Harry" },
  { verse: "Avada ___", answer: "Kedavra", song: "Incantesimo", artist: "Voldemort" },
  { verse: "Dopo tutto questo tempo? ___", answer: "Sempre", song: "Citazione", artist: "Silente" },
  { verse: "Dobby è un elfo ___", answer: "libero", song: "Citazione", artist: "Dobby" },
  { verse: "Non aprite la ___ dei segreti", answer: "Camera", song: "Citazione", artist: "Hogwarts" },
  { verse: "Il binario nove e ___", answer: "tre quarti", song: "Citazione", artist: "King's Cross" },
  { verse: "La bacchetta sceglie il ___", answer: "mago", song: "Citazione", artist: "Olivander" },
  { verse: "È Wingardium Leviosa, non ___", answer: "Leviosà", song: "Citazione", artist: "Hermione" },
  { verse: "Finché c'è chi terrà in vita il ___", answer: "ricordo", song: "Citazione", artist: "Silente" },
  { verse: "Non è la nostra abilità che mostra ciò che siamo, ma le nostre ___", answer: "scelte", song: "Citazione", artist: "Silente" },
  { verse: "La paura di un nome aumenta la paura della cosa ___", answer: "stessa", song: "Citazione", artist: "Hermione" },
  { verse: "Hogwarts sarà sempre la tua ___", answer: "casa", song: "Citazione", artist: "Silente" },
  { verse: "Il coraggio si trova nei posti più ___", answer: "inaspettati", song: "Citazione", artist: "Silente" },
  { verse: "Aiutare sempre chi ne ha ___", answer: "bisogno", song: "Citazione", artist: "Silente" },
];

const HOGWARTS_PROVERB_BANK = [
  { start: "La bacchetta sceglie il mago, non...", end: "il contrario" },
  { start: "Non aprite la Camera dei...", end: "segreti" },
  { start: "Il coraggio si trova nei posti più...", end: "inaspettati" },
  { start: "La paura di un nome aumenta la paura della cosa...", end: "stessa" },
  { start: "Non è la nostra abilità che mostra ciò che siamo, ma le nostre...", end: "scelte" },
  { start: "Finché c'è chi terrà in vita il ricordo di loro, loro non saranno mai davvero...", end: "morti" },
  { start: "Hogwarts sarà sempre la tua...", end: "casa" },
  { start: "Dopo tutto questo tempo?...", end: "Sempre" },
  { start: "Dobby è un elfo...", end: "libero" },
  { start: "Il vero potere è nell'...", end: "amore" },
  { start: "La felicità si trova anche nei momenti più bui, se solo si ricorda di accendere la...", end: "luce" },
  { start: "Non tutti noi nascono per essere...", end: "eroi" },
  { start: "I Doni della Morte non sono un...", end: "gioco" },
  { start: "È Wingardium Leviosa, non...", end: "Leviosà" },
  { start: "Aiutare sempre chi ne ha...", end: "bisogno" },
  { start: "La magia è ovunque, basta saperla...", end: "vedere" },
  { start: "Il Quidditch si gioca in...", end: "alto" },
  { start: "Il Cappello Parlante assegna la...", end: "casa" },
  { start: "Il Ministero della Magia non dimentica...", end: "mai" },
  { start: "Il Basilisco non perdona gli...", end: "errori" },
];

const HOGWARTS_SYNONYM_ANTONYM_BANK = [
  { word: "magia", synonym: "incantesimo", antonym: "muggle", kind: "synonym" },
  { word: "magia", synonym: "incantesimo", antonym: "muggle", kind: "antonym" },
  { word: "coraggioso", synonym: "audace", antonym: "codardo", kind: "synonym" },
  { word: "coraggioso", synonym: "audace", antonym: "codardo", kind: "antonym" },
  { word: "oscuro", synonym: "tenebroso", antonym: "luminoso", kind: "synonym" },
  { word: "oscuro", synonym: "tenebroso", antonym: "luminoso", kind: "antonym" },
  { word: "leale", synonym: "fedele", antonym: "traditore", kind: "synonym" },
  { word: "leale", synonym: "fedele", antonym: "traditore", kind: "antonym" },
  { word: "saggio", synonym: "sapiente", antonym: "ottuso", kind: "synonym" },
  { word: "saggio", synonym: "sapiente", antonym: "ottuso", kind: "antonym" },
  { word: "potente", synonym: "forte", antonym: "debole", kind: "synonym" },
  { word: "potente", synonym: "forte", antonym: "debole", kind: "antonym" },
  { word: "segreto", synonym: "arcano", antonym: "evidente", kind: "synonym" },
  { word: "segreto", synonym: "arcano", antonym: "evidente", kind: "antonym" },
  { word: "magico", synonym: "incantato", antonym: "ordinario", kind: "synonym" },
  { word: "magico", synonym: "incantato", antonym: "ordinario", kind: "antonym" },
];

const HOGWARTS_GUESS_CITY_BANK = [
  { landmark: "Negozio di Olivander", city: "Londra", country: "Regno Unito" },
  { landmark: "Banca Gringott", city: "Londra", country: "Regno Unito" },
  { landmark: "Weasleys' Wizard Wheezes", city: "Londra", country: "Regno Unito" },
  { landmark: "Pub delle Tre scope", city: "Hogsmeade", country: "Scozia" },
  { landmark: "Casa dei Potter", city: "Godric's Hollow", country: "Regno Unito" },
  { landmark: "Ministero della Magia", city: "Londra", country: "Regno Unito" },
  { landmark: "Sala Grande", city: "Hogwarts", country: "Scozia" },
  { landmark: "Torre di Astronomia", city: "Hogwarts", country: "Scozia" },
  { landmark: "Foresta Proibita", city: "Hogwarts", country: "Scozia" },
  { landmark: "Stanza delle Necessità", city: "Hogwarts", country: "Scozia" },
  { landmark: "Binario 9 e 3/4", city: "Londra", country: "Regno Unito" },
  { landmark: "Pensatoio di Silente", city: "Hogwarts", country: "Scozia" },
  { landmark: "Negozio Flourish and Blotts", city: "Londra", country: "Regno Unito" },
  { landmark: "Aula di Pozioni", city: "Hogwarts", country: "Scozia" },
];

const HOGWARTS_GUESS_EMOJI_BANK = [
  { emojis: "🧙⚡", answers: ["harry potter", "harry"], category: "personaggio" },
  { emojis: "🧙‍♂️🪄", answers: ["albus silente", "silente"], category: "personaggio" },
  { emojis: "🦉📬", answers: ["edvige", "gufo"], category: "personaggio" },
  { emojis: "🐍💚", answers: ["serpeverde", "slytherin"], category: "casata" },
  { emojis: "🦁❤️", answers: ["grifondoro", "gryffindor"], category: "casata" },
  { emojis: "🦡💛", answers: ["tassorosso", "hufflepuff"], category: "casata" },
  { emojis: "🦅💙", answers: ["corvonero", "ravenclaw"], category: "casata" },
  { emojis: "🧹🏐", answers: ["quidditch"], category: "sport" },
  { emojis: "🪄✨", answers: ["bacchetta", "magia"], category: "oggetto" },
  { emojis: "🚂9️⃣", answers: ["hogwarts express", "espresso per hogwarts", "binario nove e tre quarti"], category: "luogo" },
  { emojis: "🏰🕯️", answers: ["hogwarts"], category: "luogo" },
  { emojis: "🧪🐍", answers: ["piton", "snape", "pozioni"], category: "personaggio" },
  { emojis: "👓📚", answers: ["hermione", "granger"], category: "personaggio" },
  { emojis: "🧡🐀", answers: ["ron weasley", "ron"], category: "personaggio" },
  { emojis: "🧔🐕", answers: ["hagrid"], category: "personaggio" },
  { emojis: "🧦👣", answers: ["dobby"], category: "personaggio" },
  { emojis: "💀☠️", answers: ["voldemort"], category: "personaggio" },
  { emojis: "🦌✨", answers: ["patronus", "expecto patronum"], category: "incantesimo" },
  { emojis: "📜🔮", answers: ["profezia", "pietra filosofale"], category: "oggetto" },
  { emojis: "🎩🏠", answers: ["cappello parlante", "smistamento"], category: "oggetto" },
  { emojis: "🐉🔥", answers: ["norberto", "draghetto"], category: "creatura" },
  { emojis: "🕷️🕸️", answers: ["aragog"], category: "creatura" },
  { emojis: "🐍💀", answers: ["nagini"], category: "creatura" },
  { emojis: "👱‍♂️🐍", answers: ["draco malfoy", "malfoy"], category: "personaggio" },
  { emojis: "🐁🐭", answers: ["crosta", "peter minus"], category: "personaggio" },
  { emojis: "🐸", answers: ["oscar"], category: "creatura" },
  { emojis: "🐺🌑", answers: ["lupin"], category: "personaggio" },
  { emojis: "🐕⚫", answers: ["sirius black", "black"], category: "personaggio" },
  { emojis: "👁️🧹", answers: ["alastor moody", "moody"], category: "personaggio" },
];

const HOGWARTS_TREASURE_HUNT_EMOJI_PAIRS = [
  { decoy: "\u{1F9D9}", winner: "\u{1FA84}" },
  { decoy: "\u{1F409}", winner: "\u{1F48E}" },
  { decoy: "\u{1F989}", winner: "\u{1F4DC}" },
  { decoy: "\u{1F9F9}", winner: "\u2728" },
  { decoy: "\u{1F9D9}\u200D\u2642\uFE0F", winner: "\u{1F3C6}" },
  { decoy: "\u{1F52E}", winner: "\u{1F48D}" },
  { decoy: "\u{1F43A}", winner: "\u{1F5DD}\uFE0F" },
  { decoy: "\u{1F9CA}", winner: "\u{1F4B0}" },
  { decoy: "\u{1F987}", winner: "\u{1F31F}" },
  { decoy: "\u{1F9DA}", winner: "\u{1F3AF}" },
];

function getHogwartsGuessWords() {
  return HOGWARTS_GUESS_WORDS;
}

function getHogwartsHangmanWords() {
  return HOGWARTS_HANGMAN_WORDS;
}

function getHogwartsFastTypingPhrases() {
  return HOGWARTS_FAST_TYPING_PHRASES;
}

function getHogwartsGuessYearBank() {
  return HOGWARTS_GUESS_YEAR_BANK;
}

function getHogwartsQuoteFilmBank() {
  return ((HOGWARTS_QUOTE_FILM_BANK as any) as any);
}

function getHogwartsCompleteVerseBank() {
  return HOGWARTS_COMPLETE_VERSE_BANK;
}

function getHogwartsProverbBank() {
  return HOGWARTS_PROVERB_BANK;
}

function getHogwartsSynonymAntonymBank() {
  return HOGWARTS_SYNONYM_ANTONYM_BANK;
}

function getHogwartsGuessCityBank() {
  return HOGWARTS_GUESS_CITY_BANK;
}

function getHogwartsGuessEmojiBank() {
  return HOGWARTS_GUESS_EMOJI_BANK;
}

function getHogwartsTreasureHuntEmojiPairs() {
  return HOGWARTS_TREASURE_HUNT_EMOJI_PAIRS;
}

function getHogwartsItalianGkBank() {
  return HOGWARTS_QUIZ_BANK;
}

export = { getHogwartsGuessWords, getHogwartsHangmanWords, getHogwartsFastTypingPhrases, getHogwartsGuessYearBank, getHogwartsCompleteVerseBank, getHogwartsProverbBank, getHogwartsSynonymAntonymBank, getHogwartsGuessCityBank, getHogwartsGuessEmojiBank, getHogwartsTreasureHuntEmojiPairs, getHogwartsItalianGkBank };