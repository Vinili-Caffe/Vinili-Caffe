/**
 * Quiz smistamento Star Wars — epoca Clone Wars (Repubblica / Separatisti).
 * Pesi → fazione; una sola risposta per domanda.
 */
"use strict";

const FACTIONS = Object.freeze(["repubblica", "separatisti"]);

const FACTION_META = Object.freeze({
  repubblica: {
    id: "repubblica",
    label: "Repubblica",
    motto: "Ordine, senato e flotta della Repubblica Galattica.",
    primary: "#2f6fed",
    accent: "#f0e6c8",
  },
  separatisti: {
    id: "separatisti",
    label: "Separatisti",
    motto: "Indipendenza dei sistemi e potenza dei droidi.",
    primary: "#8b1a1a",
    accent: "#c9a227",
  },
});

const QUESTIONS = [
  {
    id: "q01",
    text: "Una crisi diplomatica esplode ai confini. Tu cosa fai per primo?",
    choices: [
      { id: "a", text: "Convoco il Senato e cerco un accordo ufficiale", weights: { repubblica: 4, separatisti: 0 } },
      { id: "b", text: "Preparo le navi: la diplomazia senza forza è cieca", weights: { repubblica: 1, separatisti: 3 } },
      { id: "c", text: "Taglio i rifornimenti al sistema ribelle", weights: { repubblica: 0, separatisti: 4 } },
      { id: "d", text: "Invio cloni in missione silenziosa di ricognizione", weights: { repubblica: 3, separatisti: 1 } },
    ],
  },
  {
    id: "q02",
    text: "Quale alleato ti ispira di più?",
    choices: [
      { id: "a", text: "Un Jedi che media tra fazioni", weights: { repubblica: 4, separatisti: 0 } },
      { id: "b", text: "Un generale droide impeccabile", weights: { repubblica: 0, separatisti: 4 } },
      { id: "c", text: "Un senatore pragmatico e paziente", weights: { repubblica: 3, separatisti: 1 } },
      { id: "d", text: "Un governatore che vuole autonomia totale", weights: { repubblica: 0, separatisti: 4 } },
    ],
  },
  {
    id: "q03",
    text: "In battaglia, la tua priorità è…",
    choices: [
      { id: "a", text: "Proteggere i civili anche a costo della vittoria", weights: { repubblica: 4, separatisti: 0 } },
      { id: "b", text: "Schiacciare il nemico in fretta", weights: { repubblica: 1, separatisti: 3 } },
      { id: "c", text: "Tenere la formazione e le linee di rifornimento", weights: { repubblica: 3, separatisti: 1 } },
      { id: "d", text: "Usare numeri schiaccianti di truppe meccaniche", weights: { repubblica: 0, separatisti: 4 } },
    ],
  },
  {
    id: "q04",
    text: "Un traditore è scoperto nel tuo consiglio. Come reagisci?",
    choices: [
      { id: "a", text: "Processo pubblico e trasparente", weights: { repubblica: 4, separatisti: 0 } },
      { id: "b", text: "Esilio silenzioso: niente scandali", weights: { repubblica: 2, separatisti: 2 } },
      { id: "c", text: "Lo uso come esca contro i suoi padroni", weights: { repubblica: 1, separatisti: 3 } },
      { id: "d", text: "Eliminazione immediata, senza dibattiti", weights: { repubblica: 0, separatisti: 4 } },
    ],
  },
  {
    id: "q05",
    text: "Quale simbolo ti rappresenta?",
    choices: [
      { id: "a", text: "L’aquila della Repubblica", weights: { repubblica: 4, separatisti: 0 } },
      { id: "b", text: "L’occhio della Confederazione", weights: { repubblica: 0, separatisti: 4 } },
      { id: "c", text: "Una flotta Venator all’orizzonte", weights: { repubblica: 3, separatisti: 1 } },
      { id: "d", text: "Uno sciame di Vulture in picchiata", weights: { repubblica: 0, separatisti: 4 } },
    ],
  },
  {
    id: "q06",
    text: "La libertà, per te, significa…",
    choices: [
      { id: "a", text: "Leggi comuni che proteggono tutti", weights: { repubblica: 4, separatisti: 0 } },
      { id: "b", text: "Nessun governo centrale sul mio pianeta", weights: { repubblica: 0, separatisti: 4 } },
      { id: "c", text: "Scelte personali dentro regole chiare", weights: { repubblica: 3, separatisti: 1 } },
      { id: "d", text: "Potere di decidere senza chiedere permesso", weights: { repubblica: 0, separatisti: 4 } },
    ],
  },
  {
    id: "q07",
    text: "Ti offrono un’arma proibita che può chiudere la guerra in un giorno.",
    choices: [
      { id: "a", text: "Rifiuto: non siamo come loro", weights: { repubblica: 4, separatisti: 0 } },
      { id: "b", text: "La tengo segreta come deterrente", weights: { repubblica: 2, separatisti: 2 } },
      { id: "c", text: "La uso subito sul quartiere generale nemico", weights: { repubblica: 0, separatisti: 4 } },
      { id: "d", text: "La studio, poi decido col consiglio", weights: { repubblica: 3, separatisti: 1 } },
    ],
  },
  {
    id: "q08",
    text: "Alla fine della guerra, cosa costruisci?",
    choices: [
      { id: "a", text: "Un Senato più forte e unito", weights: { repubblica: 4, separatisti: 0 } },
      { id: "b", text: "Una rete di sistemi indipendenti alleati", weights: { repubblica: 0, separatisti: 4 } },
      { id: "c", text: "Accademie e flotte di pace", weights: { repubblica: 3, separatisti: 1 } },
      { id: "d", text: "Fabbriche di droidi e nuove frontiere", weights: { repubblica: 0, separatisti: 4 } },
    ],
  },
];

const questionById = new Map(QUESTIONS.map((q) => [q.id, q]));

function getPublicQuestions() {
  return QUESTIONS.map((q) => ({
    id: q.id,
    text: q.text,
    choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
  }));
}

function normalizeAnswers(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  const seen = new Set();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const qid = String(row.questionId || row.id || "").trim();
    const cid = String(row.choiceId || row.choice || "").trim();
    if (!qid || !cid || seen.has(qid)) continue;
    const q = questionById.get(qid);
    if (!q) continue;
    if (!q.choices.some((c) => c.id === cid)) continue;
    seen.add(qid);
    out.push({ questionId: qid, choiceId: cid });
  }
  return out.length ? out : null;
}

function computeFactionFromAnswers(answerRows) {
  const scores = { repubblica: 0, separatisti: 0 };
  const seen = new Set();
  for (const row of answerRows || []) {
    const q = questionById.get(row.questionId);
    if (!q || seen.has(q.id)) continue;
    const choice = q.choices.find((c) => c.id === row.choiceId);
    if (!choice) continue;
    seen.add(q.id);
    for (const f of FACTIONS) scores[f] += Number(choice.weights?.[f] || 0);
  }
  if (seen.size !== QUESTIONS.length) {
    return { ok: false, error: "incomplete_answers", expected: QUESTIONS.length, got: seen.size };
  }
  let best = FACTIONS[0];
  let bestScore = -1;
  for (const f of FACTIONS) {
    if (scores[f] > bestScore) {
      bestScore = scores[f];
      best = f;
    }
  }
  /* Pareggio: lieve bias Repubblica (ordine / stabilità). */
  if (scores.repubblica === scores.separatisti) best = "repubblica";
  return { ok: true, factionId: best, scores };
}

function getFactionMeta(id) {
  return FACTION_META[String(id || "").trim()] || null;
}

module.exports = {
  FACTIONS,
  FACTION_META,
  QUESTIONS,
  getPublicQuestions,
  normalizeAnswers,
  computeFactionFromAnswers,
  getFactionMeta,
};
