"use strict";

type QuizKind = "text" | "vf" | "mc";

type QuizItem = {
  id: string;
  kind: QuizKind;
  question: string;
  answers: string[];
  choices?: string[];
};

function vf(id: string, question: string, correct: "vero" | "falso"): QuizItem {
  return {
    id,
    kind: "vf",
    question,
    answers:
      correct === "vero"
        ? ["vero", "true", "v", "si", "sì"]
        : ["falso", "false", "f", "no"],
    choices: ["Vero", "Falso"],
  };
}

function text(id: string, question: string, answers: string[]): QuizItem {
  return { id, kind: "text", question, answers };
}

function mc(id: string, question: string, choices: string[], answers: string[]): QuizItem {
  return { id, kind: "mc", question, choices, answers };
}

const STAR_WARS_QUIZ_BANK: QuizItem[] = [
  mc(
    "q01",
    "Qual è l'arma più famosa di Star Wars?",
    ["Blaster", "Spada Laser", "Detonatore termico", "Balestra"],
    ["Spada Laser", "Spada laser"],
  ),
  mc(
    "q02",
    "Di che colore è la spada laser di Darth Vader?",
    ["Verde", "Viola", "Rossa", "Blu"],
    ["Rossa"],
  ),
  mc(
    "q03",
    "Chi è il cattivo con la maschera nera?",
    ["Darth Vader", "Kylo Ren", "Qmir", "Darth Revan"],
    ["Darth Vader"],
  ),
  mc(
    "q04",
    "Come si chiamano i soldati bianchi dell'Impero?",
    ["Clone Trooper", "Stormtrooper", "Sith", "Droidi"],
    ["Stormtrooper"],
  ),
  mc(
    "q05",
    "Quale personaggio è famoso per avere le orecchie lunghe e verdi?",
    ["Ackbar", "Yoda", "Yaddle", "Han Solo"],
    ["Yoda"],
  ),
  mc(
    "q06",
    "Che cosa usa un Jedi per spostare gli oggetti senza toccarli?",
    ["La forza", "La magia", "Un incantesimo", "La telepatia"],
    ["La forza"],
  ),
  mc(
    "q07",
    "Quale colore è associato soprattutto ai Sith?",
    ["Verde", "Viola", "Rosso", "Giallo"],
    ["Rosso"],
  ),
  mc(
    "q08",
    "Quale ordine dichiara i Jedi traditori della Repubblica?",
    ["Ordine 66", "Ordine 69", "Ordine 70", "Ordine 88"],
    ["Ordine 66"],
  ),
  mc(
    "q09",
    "Quale personaggio è il protagonista principale della prima trilogia?",
    ["Han Solo", "Boba Feet", "Jabba", "Luke"],
    ["Luke"],
  ),
  mc(
    "q10",
    "Quale personaggio è una principessa che diventa una leader ribelle?",
    ["Padme Amidala", "Leia Organa", "Sabè", "Ahsoka Tano"],
    ["Leia Organa"],
  ),
  mc(
    "q11",
    "Qual è la navicella più famosa utilizzata dai ribelli per combattere?",
    ["X-Wing", "Millennium Falcon", "A-Wing", "Y-Wing"],
    ["X-Wing"],
  ),
  mc(
    "q12",
    "Di che colore è la spada laser di Yoda?",
    ["Gialla", "Verde", "Blu", "Viola"],
    ["Verde"],
  ),
  mc(
    "q13",
    "Quale personaggio è famoso per il suo modo particolare di parlare invertendo spesso l'ordine delle parole?",
    ["Obi-Wan Kenobi", "Qui-Gon Jinn", "Yoda", "Luke"],
    ["Yoda"],
  ),
  mc(
    "q14",
    "Quale personaggio è famoso per il suo modo particolare di parlare in maniera bizzarra?",
    ["Jar-Jar Binks", "Qui-Gon Jinn", "Kylo Ren", "Mace Windu"],
    ["Jar-Jar Binks"],
  ),
  mc(
    "q15",
    "Quale personaggio è famoso per avere una spada laser viola?",
    ["Luke Skywalker", "Obi-Wan Kenobi", "Darth Maul", "Mace Windu"],
    ["Mace Windu"],
  ),
  mc(
    "q16",
    "Qual è il nome del gruppo che combatte contro l'Impero?",
    ["Sith", "Alleanza Ribelle", "Repubblica", "Primo Ordine"],
    ["Alleanza Ribelle"],
  ),
  mc(
    "q17",
    "Quale di questi personaggi è un robot dorato?",
    ["C-3PO", "K-2SO", "AP-5", "IG-88"],
    ["C-3PO"],
  ),
  mc(
    "q18",
    "Quale di questi personaggi è un droide a forma di palla?",
    ["RD-D2", "BB-8", "C1-P8", "BD-1"],
    ["BB-8"],
  ),
  text("q19", "Che cos'è BB-8?", ["Droide"]),
  text("q20", "Chi è Yoda?", ["Jedi", "Maestro Jedi"]),
  text("q21", "Come si chiama il grande personaggio peloso?", [
    "Chewbecca",
    "Chewbecca",
  ]),
  text("q22", "Come si chiama la gigantesca arma spaziale dell'Impero?", [
    "Morte Nera",
  ]),
  text("q23", 'Come si chiama realmente "Baby Yoda"?', [
    "Grogu",
    "Din Grogu",
  ]),
  text("q24", "Come si chiamano i piccoli esseri pelosi che vivono su Endor?", [
    "Ewok",
    "Ewook",
  ]),
  text("q25", "Di quale colore è la spada dei Sith?", ["Rossa", "Rosso"]),
  text("q26", "Chi è il padre di Luke Skywalker?", [
    "Anakin Skywalker",
    "Anakin",
    "Darth Vader",
  ]),
  text("q27", "Chi è il maestro Jedi di Luke Skywalker?", [
    "Obi-Wan Kenobi",
    "Obi Wan Kenobi",
    "Obi-Wan",
    "Obi Wan",
    "Kenobi",
    "Vecchio Ben",
    "Ben Kenobi",
  ]),
  text("q28", "Come si chiama il famoso cattivo dall'aspetto simile a una lumaca gigante?", [
    "Jabba",
    "Jabba the Hutt",
  ]),
  text("q29", "Quale di questi oggetti permette ai Jedi di combattere?", [
    "Spada Laser",
    "Spada laser",
  ]),
  text("q30", "Qual è il nome del maestro Jedi che ha addestrato Anakin Skywalker?", [
    "Obi-Wan Kenobi",
    "Obi Wan Kenobi",
    "Obi-Wan",
    "Obi Wan",
    "Kenobi",
  ]),
  text("q31", "Quale animale gigante e peloso è Chewbecca?", [
    "Wookie",
    "Wookiee",
  ]),
  text("q32", "Quale metallo utilizzano i Mandaloriani per le loro armature?", ["Beskar"]),
  text("q33", "Chi ha scritto la saga Star Wars?", ["George Lucas"]),
  text("q34", "Come si chiama l'ordine di monaci protettori della pace che utilizzano la Forza?", [
    "Jedi",
  ]),
  text("q35", "Chi governa l'Impero Galattico?", [
    "Palpatine",
    "Imperatore Palpatine",
    "Imperatore",
  ]),
  text("q36", "In quale anno è uscita la prima stagione di Star Wars Rebels?", ["2014"]),
  text("q37", "In quale anno è uscita la seconda stagione di Star Wars Rebels?", ["2015"]),
  text("q38", "In quale anno è uscita la terza stagione di Star Wars Rebels?", ["2016"]),
  text("q39", "In quale anno è uscita la quarta stagione di Star Wars Rebels?", ["2017"]),
  text("q40", "In quale anno è uscita la prima stagione di Star Wars: The Bad Batch?", ["2021"]),
  text("q41", "In quale anno è uscita la seconda stagione di Star Wars: The Bad Batch?", ["2023"]),
  text("q42", "In quale anno è uscita la terza stagione di Star Wars: The Bad Batch?", ["2024"]),
  text("q43", "In quale anno è uscita la prima stagione di Star Wars: The Clone Wars?", ["2008"]),
  text("q44", "In quale anno è uscita la seconda stagione di Star Wars: The Clone Wars?", ["2009"]),
  text("q45", "In quale anno è uscita la terza stagione di Star Wars: The Clone Wars?", ["2010"]),
  text("q46", "In quale anno è uscita la quarta stagione di Star Wars: The Clone Wars?", ["2011"]),
  text("q47", "In quale anno è uscita la quinta stagione di Star Wars: The Clone Wars?", ["2012"]),
  text("q48", "In quale anno è uscita la sesta stagione di Star Wars: The Clone Wars?", ["2014"]),
  text("q49", "In quale anno è uscita la settima stagione di Star Wars: The Clone Wars?", ["2020"]),
  text("q50", "In quale anno è uscito il film Star Wars: La minaccia fantasma?", ["1999"]),
  text("q51", "In quale anno è uscito il film Star Wars: L'attacco dei cloni?", ["2002"]),
  text("q52", "In quale anno è uscito il film Star Wars: La vendetta dei Sith?", ["2005"]),
  text("q53", "In quale anno è uscito il film Rogue One: A Star Wars Story?", ["2016"]),
  text("q54", "In quale anno è uscito il film Star Wars: Una nuova speranza?", ["1977"]),
  text("q55", "In quale anno è uscito il film Star Wars: L'Impero colpisce ancora?", ["1980"]),
  text("q56", "In quale anno è uscito il film Star Wars: Il ritorno dello Jedi?", ["1983"]),
  text("q57", "In quale anno è uscito il film Star Wars: Il risveglio della Forza?", ["2015"]),
  text("q58", "In quale anno è uscito il film Star Wars: Gli ultimi Jedi?", ["2017"]),
  text("q59", "In quale anno è uscito il film Star Wars: L'ascesa di Skywalker?", ["2019"]),
  text("q60", "Quale personaggio cinematografico ha una doppia spada laser rossa?", [
    "Darth Maul",
    "Maul",
  ]),
  vf("q61", "Darth Vader indossa una maschera nera.", "vero"),
  vf("q62", "Yoda è un robot.", "falso"),
  vf("q63", "I Jedi usano le spade laser.", "vero"),
  vf("q64", "Chewbecca è un personaggio ricoperto di pelo.", "vero"),
  vf("q65", "R2-D2 è un droide.", "vero"),
  vf("q66", "Darth Vader ha una spada laser verde.", "falso"),
  vf("q67", "La Morte Nera è una gigantesca stazione spaziale.", "vero"),
  vf("q68", "BB-8 è un piccolo droide a forma di palla.", "vero"),
  vf("q69", "Yoda è famoso per il suo modo particolare di parlare.", "vero"),
  vf("q70", "Il Millennium Falcon è un'astronave.", "vero"),
  vf("q71", "Darth Vader è un personaggio dell'Alleanza Ribelle.", "falso"),
  vf("q72", "Le spade laser possono avere colori diversi.", "vero"),
  vf("q73", "C-3PO è un droide dorato.", "vero"),
  vf("q74", "Han Solo è il pilota del Millennium Falcon.", "vero"),
  vf("q75", "I Sith seguono il lato oscuro della Forza.", "vero"),
  vf("q76", "La Forza è un tipo di astronave.", "falso"),
  vf("q77", "George Lucas è il creatore di Star Wars.", "vero"),
  vf("q78", "Darth Vader è il padre di Luke Skywalker.", "vero"),
  vf("q79", "Yoda è un Maestro Jedi.", "vero"),
  vf("q80", "La spada laser di Darth Vader è rossa.", "vero"),
  vf("q81", "Han Solo è un contrabbandiere.", "vero"),
  vf("q82", "R2-D2 è un droide protocollare.", "falso"),
  vf("q83", "Chewbecca appartiene alla specie dei Wookiee.", "vero"),
  vf("q84", "Obi-Wan Kenobi è stato il maestro di Anakin Skywalker.", "vero"),
  vf("q85", "La Morte Nera è un'arma dell'Impero Galattico.", "vero"),
  vf("q86", "Leia Organa è la sorella di Luke Skywalker.", "vero"),
  vf("q87", "Anakin Skywalker è stato addestrato da Qui-Gon Jinn.", "falso"),
  vf("q88", "La spada laser di Luke Skywalker è inizialmente blu.", "vero"),
  vf("q89", "I Jedi possono utilizzare il lato oscuro della Forza.", "falso"),
  vf("q90", "Il Millennium Falcon appartiene a Han Solo.", "vero"),
  vf("q91", "Palpatine è conosciuto anche come Darth Sidious.", "vero"),
  vf("q92", "I Mandaloriani sono una specie aliena.", "falso"),
  vf("q93", "C-3PO è in grado di parlare oltre 6.000.000 di lingue.", "vero"),
  vf("q94", "La Forza è presente in tutti gli esseri viventi e non viventi.", "vero"),
  vf("q95", "Il vero nome di Darth Vader è Anakin Skywalker.", "vero"),
  vf("q96", "Mace Windu utilizza una spada laser viola.", "vero"),
  vf("q97", "Yoda è stato il Gran Maestro dell'Ordine Jedi.", "vero"),
  vf("q98", "L'Ordine 66 aveva lo scopo di eliminare i Jedi.", "vero"),
  vf("q99", "Il pianeta natale di Luke Skywalker è Tatooine.", "vero"),
  vf("q100", "La Morte Nera viene distrutta per la prima volta durante la Battaglia di Endor.", "falso"),
  vf("q101", "Padmé Amidala è stata regina di Naboo.", "vero"),
  vf("q102", "I cristalli Kyber vengono utilizzati per costruire le spade laser.", "vero"),
  vf("q103", "L'Ordine 69 fa ballare breakdance ai cloni.", "vero"),
  vf("q104", "L'Ordine 67 fa ballare in cerchio il trenino ai cloni.", "vero"),
];

const QUIZ_BG_CDN = "https://cdn.viniliecaffe.it/images/starwars/quiz";
const QUIZ_BG_V = "20261104qb1";

/** 5 sfondi atmosferici per embed quiz (ruota a ogni round). */
const QUIZ_BACKGROUND_IDS = Object.freeze([
  "bg-jedi",
  "bg-sith",
  "bg-flotta",
  "bg-deserto",
  "bg-stazione",
]);

function quizBackgroundUrl(id) {
  const safe = String(id || "").replace(/[^a-z0-9_-]/gi, "");
  if (!QUIZ_BACKGROUND_IDS.includes(safe)) return "";
  return `${QUIZ_BG_CDN}/${safe}.jpg?v=${QUIZ_BG_V}`;
}

function listQuizBackgroundUrls() {
  return QUIZ_BACKGROUND_IDS.map((id) => quizBackgroundUrl(id));
}

/** Sfondo diverso a ogni chiamata (per setImage sull'embed della domanda). */
function pickRandomQuizBackgroundUrl(excludeUrl) {
  const all = listQuizBackgroundUrls();
  const pool = excludeUrl ? all.filter((u) => u !== excludeUrl) : all.slice();
  if (!pool.length) return all[0] || "";
  return pool[Math.floor(Math.random() * pool.length)];
}

function getStarWarsQuizBank() {
  return STAR_WARS_QUIZ_BANK;
}

function getStarWarsQuizMcBank() {
  return STAR_WARS_QUIZ_BANK.filter((q) => q.kind === "mc");
}

function getStarWarsQuizTextBank() {
  return STAR_WARS_QUIZ_BANK.filter((q) => q.kind === "text");
}

function getStarWarsQuizVfBank() {
  return STAR_WARS_QUIZ_BANK.filter((q) => q.kind === "vf");
}

export = {
  STAR_WARS_QUIZ_BANK,
  QUIZ_BACKGROUND_IDS,
  quizBackgroundUrl,
  listQuizBackgroundUrls,
  pickRandomQuizBackgroundUrl,
  getStarWarsQuizBank,
  getStarWarsQuizMcBank,
  getStarWarsQuizTextBank,
  getStarWarsQuizVfBank,
};
